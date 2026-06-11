import {
  attachReservationToJob,
  getOrCreateBilling,
  reconcileJob,
  reserveCredits,
} from "./billing/credits";
import { estimateJobCost } from "./billing/estimate";
import { getPlanFeatures } from "./billing/plan-features";
import { withMeterContext } from "./billing/meter";
import { flushPostHog } from "./posthog";
import {
  DEFAULT_FILM_MODE,
  DIRECTOR_MODEL,
  FILM_MODES,
  generateStoryboard as generateLegacyStoryboard,
  isSupportedFilmMode,
  MAX_SHOTS,
  type Continuity,
  type FilmMode,
  type ShotRecipe,
} from "./director";
import {
  assembleShotPrompts,
  deriveDepthCue,
  deriveLightingTag,
  deriveShotType,
  deriveSubject,
  deriveUiDensity,
  deriveUiDescription,
  lintStoryboard,
  reinforceImagePrompt,
} from "./prompt-engine";
import {
  summarizeValidation,
  validateGeneratedImage,
} from "./vision-validator";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  isSupportedImageModel,
  isSupportedVideoModel,
  runImage,
  runVideo,
  runWithConcurrency,
  type ImageModel,
  type VideoModel,
} from "./replicate";
import {
  mirrorImage,
  mirrorVideo,
  removeJobAssets,
  uploadSceneAsset,
} from "./storage";
import { getSupabase, type JobRow, type ShotRow } from "./supabase";
import {
  applyLockedAssetsToBlueprint,
  buildFilmSkeleton,
  buildRefinementSet,
  generateAssetPlan,
  generateAudioDirection,
  generateFilmBlueprint,
  generateFilmCritique,
  generateFilmHTML,
  generateStoryboard,
  generateVisionCritique,
  refineScenes,
  type AudioPlan,
  type FilmBlueprint,
  type FilmFills,
  type Motif,
  type SceneCallContext,
  type SceneCritique,
  type SceneRefinementRequest,
  type SkeletonAudio,
  type Storyboard,
  type StoryboardScene,
} from "./hyperframes/llm-director";
import { renderScene } from "./hyperframes/render";
import { captureMotionTrailComposite, captureSceneMotionTelemetry, captureSceneThumbnail } from "./hyperframes/thumbnail";
import {
  computeMotionMetrics,
  renderTelemetryBlock,
  telemetryGates,
  type MotionMetrics,
} from "./hyperframes/motion-telemetry";
import { injectWatermarkOverlay, shouldApplyWatermark } from "./hyperframes/watermark";
import { sourceAssets, type JobAssetEntry } from "./assets";
import { resolveAudioPlan, type ResolvedAudio } from "./audio-resolver";

type AssembledShot = ShotRecipe & {
  imagePrompt: string;
  videoPrompt: string;
  negativePrompt: string;
};

function joinPalette(palette: string[]): string {
  return palette
    .map((c) => (c.startsWith("#") ? c : `#${c}`))
    .join(", ");
}

const IMAGE_CONCURRENCY = 2;
export const MAX_SHOTS_PER_JOB = MAX_SHOTS;

// Perf B4: auto-critique + refinement adds ~10 min per run because critique
// flags most/all scenes in practice and refinement re-fires them through the
// same effort=high scene-fill path. Default OFF for iteration speed; opt back
// in with HYPERFRAMES_AUTO_CRITIQUE=true. The "Critique & polish" button on
// the editor invokes POST /api/jobs/:id/critique → critiqueAndPolishJob to
// run the same block on demand against an already-shipped scenes_ready job.
const AUTO_CRITIQUE_ENABLED = process.env.HYPERFRAMES_AUTO_CRITIQUE === "true";

// Sprint 2 — auto-audio direction. Off by default until tuned in production
// (ElevenLabs adds ~5-15s per scene; Jamendo/Freesound add ~1-2s each).
// Acts as a master kill-switch: when false, no audio is generated regardless
// of per-job toggles. Per-track opt-in lives on jobs.audio_voiceover_enabled
// / audio_music_enabled / audio_sfx_enabled (all default false at DB level —
// see supabase/migrations/20260601_audio_track_toggles.sql).
const AUTO_AUDIO_ENABLED = process.env.MOTIONGLASS_AUTO_AUDIO === "true";

// SceneCallContext serialization: motifRegistry is a Set<Motif>, which JSON
// drops silently. Convert to/from arrays at the persistence boundary. Used by
// runHyperframesDirect (write) and critiqueAndPolishJob (read).
type SerializedSceneCallContext = Omit<SceneCallContext, "continuityState"> & {
  continuityState: Omit<SceneCallContext["continuityState"], "motifRegistry"> & {
    motifRegistry: Motif[];
  };
};

function serializeSceneContexts(contexts: SceneCallContext[]): SerializedSceneCallContext[] {
  return contexts.map((ctx) => ({
    ...ctx,
    continuityState: {
      ...ctx.continuityState,
      motifRegistry: Array.from(ctx.continuityState.motifRegistry),
    },
  }));
}

function deserializeSceneContexts(raw: unknown): SceneCallContext[] {
  if (!Array.isArray(raw)) {
    throw new Error("deserializeSceneContexts: expected an array");
  }
  return (raw as SerializedSceneCallContext[]).map((ctx) => ({
    ...ctx,
    continuityState: {
      ...ctx.continuityState,
      motifRegistry: new Set(ctx.continuityState.motifRegistry ?? []),
    },
  }));
}

// Per-stage timing wrapper. Logs start + duration (or failure duration)
// for each phase of runHyperframesDirect / runHyperframesExport. Lets us
// see exactly which stage moves when we ship perf changes.
async function timed<T>(jobId: string, stage: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`[hyperframes ${jobId}] [timing] ${stage} start`);
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`[hyperframes ${jobId}] [timing] ${stage} done in ${(ms / 1000).toFixed(1)}s`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`[hyperframes ${jobId}] [timing] ${stage} FAILED after ${(ms / 1000).toFixed(1)}s`);
    throw err;
  }
}

export type CreateJobInput = {
  script: string;
  productDescription?: string;
  brandStyle?: string;
  brandLogoUrl?: string | null;
  brandLogoStoragePath?: string | null;
  brandColors?: string[] | null;
  userId?: string | null;
  // Per-track audio toggles captured at Generate time. Default false at the
  // DB level; the caller (api.jobs route) is responsible for forwarding the
  // user's editor-side selections. Drives the audio_direction stage gate in
  // runHyperframesDirect.
  audioVoiceoverEnabled?: boolean;
  audioMusicEnabled?: boolean;
  audioSfxEnabled?: boolean;
};

// Thrown by createJob when the user's balance can't cover the worst-case
// reservation. The api.jobs route maps this to a 402-style JSON response
// with the shortfall amount so the UI can prompt for a top-up.
export class InsufficientCreditsError extends Error {
  constructor(
    public readonly shortfallCredits: number,
    public readonly balance: number,
    public readonly required: number,
  ) {
    super(
      `Insufficient credits: need ${required}, balance ${balance}, short ${shortfallCredits}`,
    );
    this.name = "InsufficientCreditsError";
  }
}

// Thrown by createJob when the submitted script exceeds the plan's
// maxScriptChars cap. The api.jobs route maps this to a 400 response so
// the UI can show a clear "script too long" message instead of a generic
// 500. Defensive — the editor textarea already enforces maxLength, this
// guards the API against direct callers / scripted clients.
export class ScriptTooLongError extends Error {
  constructor(
    public readonly maxChars: number,
    public readonly actualChars: number,
    public readonly tier: string,
  ) {
    super(
      `Script length ${actualChars} exceeds ${maxChars}-character limit on the ${tier} plan`,
    );
    this.name = "ScriptTooLongError";
  }
}

export async function createJob(input: CreateJobInput): Promise<{ jobId: string }> {
  const script = input.script.trim();
  if (!script) throw new Error("Script is required");

  // Worst-case reservation BEFORE we insert the job. Scene count is capped
  // at the user's plan max (NOT the global MAX_SHOTS) so Free users aren't
  // gated against a 14-scene reservation they could never run. The
  // Director enforces the same cap when picking scenes, so we won't
  // under-reserve. reconcileJob() refunds the unused portion if the LLM
  // picks fewer scenes. video=false because per-shot clips are opt-in via
  // /api/shots/:id/clip and reserve their own credits at that endpoint.
  // autoCritique mirrors the env flag so the inline critique pass is
  // covered when HYPERFRAMES_AUTO_CRITIQUE=true.
  const billing = input.userId ? await getOrCreateBilling(input.userId) : null;
  const planFeatures = getPlanFeatures(billing?.plan_tier ?? null);

  // Per-plan script length cap. Free is 700 chars so a trial user can't
  // paste a novella and force a 30K-input-token Director call before the
  // 2-scene trim limits per-scene fill. Paid plans get null (unlimited).
  if (
    planFeatures.maxScriptChars !== null &&
    script.length > planFeatures.maxScriptChars
  ) {
    throw new ScriptTooLongError(
      planFeatures.maxScriptChars,
      script.length,
      billing?.plan_tier ?? "free",
    );
  }

  const estimate = estimateJobCost({
    sceneCountGuess: planFeatures.maxScenes,
    video: false,
    audioVoiceover: input.audioVoiceoverEnabled ?? false,
    audioMusic: input.audioMusicEnabled ?? false,
    audioSfx: input.audioSfxEnabled ?? false,
    autoCritique: AUTO_CRITIQUE_ENABLED,
    includePolish: false,
  });

  // Reserve credits first; throw without inserting if the balance is short
  // so we don't leave an orphan job row. Idempotency key uses a fresh UUID
  // (no jobId yet); attachReservationToJob() links it after the insert.
  // Reservation runs for every signed-in user — Polar (isBillingEnabled())
  // controls *incoming payments*, not balance accounting. The credit ledger
  // is the source of truth regardless of payment-provider configuration, so
  // dev environments deduct real balance and the trial flow can be tested
  // end-to-end without a Polar key.
  let reservationKey: string | null = null;
  if (input.userId) {
    reservationKey = `reserve:${crypto.randomUUID()}`;
    const reserve = await reserveCredits(input.userId, estimate, null, reservationKey);
    if (!reserve.ok) {
      const shortfall = Math.max(0, reserve.required - reserve.balance);
      throw new InsufficientCreditsError(shortfall, reserve.balance, reserve.required);
    }
  }

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .insert({
      script,
      product_description: input.productDescription?.trim() || null,
      brand_style: input.brandStyle?.trim() || null,
      brand_logo_url: input.brandLogoUrl ?? null,
      brand_logo_storage_path: input.brandLogoStoragePath ?? null,
      brand_colors:
        input.brandColors && input.brandColors.length > 0
          ? input.brandColors
          : null,
      director_model: DIRECTOR_MODEL,
      status: "pending",
      user_id: input.userId ?? null,
      generation_mode: "hyperframes",
      audio_voiceover_enabled: input.audioVoiceoverEnabled ?? false,
      audio_music_enabled: input.audioMusicEnabled ?? false,
      audio_sfx_enabled: input.audioSfxEnabled ?? false,
      cost_estimate_credits: estimate,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createJob failed: ${error?.message ?? "no row returned"}`);
  }
  const jobId = data.id as string;
  if (reservationKey) {
    await attachReservationToJob(reservationKey, jobId);
  }
  return { jobId };
}

export type UpdateJobBrandInput = {
  brandLogoUrl?: string | null;
  brandLogoStoragePath?: string | null;
  brandColors?: string[] | null;
};

export async function updateJobBrand(
  jobId: string,
  userId: string,
  input: UpdateJobBrandInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.brandLogoUrl !== undefined) patch.brand_logo_url = input.brandLogoUrl;
  if (input.brandLogoStoragePath !== undefined) {
    patch.brand_logo_storage_path = input.brandLogoStoragePath;
  }
  if (input.brandColors !== undefined) {
    patch.brand_colors =
      input.brandColors && input.brandColors.length > 0 ? input.brandColors : null;
  }
  if (Object.keys(patch).length === 0) return;

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw new Error(`updateJobBrand(${jobId}) failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }
}

export type JobSfx = {
  sfxId: string;
  name: string;
  author: string;
  previewUrl: string;
  license: string;
};

export async function updateJobSfx(
  jobId: string,
  userId: string,
  sfx: JobSfx | null,
): Promise<void> {
  const patch = sfx
    ? {
        sfx_id: sfx.sfxId,
        sfx_name: sfx.name,
        sfx_author: sfx.author,
        sfx_url: sfx.previewUrl,
        sfx_license: sfx.license,
      }
    : {
        sfx_id: null,
        sfx_name: null,
        sfx_author: null,
        sfx_url: null,
        sfx_license: null,
      };

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw new Error(`updateJobSfx(${jobId}) failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }
}

export type JobMusic = {
  trackId: string;
  title: string;
  artist: string;
  streamUrl: string;
};

export async function updateJobMusic(
  jobId: string,
  userId: string,
  music: JobMusic | null,
): Promise<void> {
  const patch = music
    ? {
        music_track_id: music.trackId,
        music_title: music.title,
        music_artist: music.artist,
        music_url: music.streamUrl,
      }
    : {
        music_track_id: null,
        music_title: null,
        music_artist: null,
        music_url: null,
      };

  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    throw new Error(`updateJobMusic(${jobId}) failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }
}

/**
 * Persist a resolved audio bundle into the existing music/sfx job columns +
 * per-shot voiceover/sfx_cues columns. Used by the auto-audio pipeline so
 * the existing MusicPicker / SfxPicker UI surfaces the LLM-picked tracks
 * with no front-end changes beyond the "✨ Auto" badge.
 *
 * Direct DB writes (not updateJobMusic/Sfx) so we don't need a userId — the
 * caller is the pipeline orchestrator, which already trusts the job row.
 */
async function persistResolvedAudio(
  jobId: string,
  insertedScenes: ShotRow[],
  resolved: ResolvedAudio,
): Promise<void> {
  const db = getSupabase();

  // Job-level: bg music goes into the existing music_* columns so the
  // MusicPicker shows it. A null bgMusic clears the columns.
  const musicPatch = resolved.bgMusic
    ? {
        music_track_id: resolved.bgMusic.trackId,
        music_title: resolved.bgMusic.title,
        music_artist: resolved.bgMusic.artist,
        music_url: resolved.bgMusic.streamUrl,
      }
    : {
        music_track_id: null,
        music_title: null,
        music_artist: null,
        music_url: null,
      };
  const { error: jobErr } = await db
    .from("jobs")
    .update(musicPatch)
    .eq("id", jobId);
  if (jobErr) {
    console.warn(`[audio persist] job ${jobId} bg music write failed: ${jobErr.message}`);
  }

  // Per-shot voiceover + sfx_cues. Group cues by sceneId so each shot row
  // gets one write. Also append SceneAsset entries to shots.assets so the
  // editor's VOICE OVER / SOUND EFFECTS / AUDIO lanes light up — they filter
  // shot.assets by kind, not the dedicated columns.
  const cuesBySceneId = new Map<string, ResolvedAudio["sfxCues"]>();
  for (const cue of resolved.sfxCues) {
    const list = cuesBySceneId.get(cue.sceneId) ?? [];
    list.push(cue);
    cuesBySceneId.set(cue.sceneId, list);
  }
  const voByScene = new Map(resolved.voiceovers.map((v) => [v.sceneId, v] as const));

  // SceneAsset shape mirrors api.shots.$id.assets.tsx (kind union must match).
  type SceneAsset = {
    id: string;
    kind: "video" | "image" | "screenshot" | "voiceover" | "sfx" | "music";
    url: string;
    name: string;
    created_at: string;
  };
  const isSceneAssetArray = (v: unknown): v is SceneAsset[] =>
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { kind?: unknown }).kind === "string" &&
        typeof (a as { url?: unknown }).url === "string",
    );
  // Auto-pipeline asset ids are prefixed so a re-run can dedupe + replace
  // the previous auto entries without touching user-added assets.
  const AUTO_ID_PREFIX = "auto_";
  const nowIso = new Date().toISOString();

  await Promise.all(
    insertedScenes.map(async (shot) => {
      const sid = `s${shot.shot_index + 1}`;
      const vo = voByScene.get(sid) ?? null;
      const cues = cuesBySceneId.get(sid) ?? [];
      const cueRows = cues.map((c) => ({
        id: c.id,
        url: c.url,
        name: c.name,
        license: c.license,
        licenseUrl: c.licenseUrl,
        momentSec: c.momentSeconds,
        kind: c.kind,
        volume: c.volume,
      }));

      // Rebuild the assets array: drop previous auto-* entries, append fresh.
      const existing = isSceneAssetArray(shot.assets) ? shot.assets : [];
      const kept = existing.filter((a) => !a.id.startsWith(AUTO_ID_PREFIX));
      const autoEntries: SceneAsset[] = [];
      if (vo) {
        autoEntries.push({
          id: `${AUTO_ID_PREFIX}vo_${shot.id.slice(0, 8)}`,
          kind: "voiceover",
          url: vo.publicUrl,
          name: vo.text.length > 60 ? `${vo.text.slice(0, 60)}…` : vo.text,
          created_at: nowIso,
        });
      }
      for (const c of cues) {
        autoEntries.push({
          id: `${AUTO_ID_PREFIX}sfx_${shot.id.slice(0, 8)}_${c.id}`,
          kind: "sfx",
          url: c.url,
          name: c.name,
          created_at: nowIso,
        });
      }
      if (resolved.bgMusic) {
        autoEntries.push({
          id: `${AUTO_ID_PREFIX}music_${shot.id.slice(0, 8)}`,
          kind: "music",
          url: resolved.bgMusic.streamUrl,
          name: `${resolved.bgMusic.title} — ${resolved.bgMusic.artist}`,
          created_at: nowIso,
        });
      }
      const assetsChanged =
        autoEntries.length > 0 || kept.length !== existing.length;
      // Skip the write only when nothing for this scene changed.
      if (!vo && cues.length === 0 && !assetsChanged) return;

      const updatedAssets = assetsChanged ? [...kept, ...autoEntries] : existing;
      const { error } = await db
        .from("shots")
        .update({
          voiceover_url: vo?.publicUrl ?? null,
          voiceover_text: vo?.text ?? null,
          sfx_cues: cueRows.length > 0 ? cueRows : null,
          assets: updatedAssets,
        })
        .eq("id", shot.id);
      if (error) {
        console.warn(
          `[audio persist] shot ${shot.id.slice(0, 8)} write failed: ${error.message}`,
        );
      }
    }),
  );
}

/**
 * Reconstruct the SkeletonAudio bundle from already-persisted job/shot data.
 * Used by the critique + improve rebuild paths so refined HTML keeps its
 * auto-audio. Returns undefined when no audio was attached (no music URL,
 * no voiceovers, no SFX cues) — keeping the rebuilt HTML audio-free.
 */
function buildSkeletonAudioFromPersisted(
  job: JobRow,
  shots: ShotRow[],
): SkeletonAudio | undefined {
  const voiceovers: SkeletonAudio["voiceovers"] = [];
  const sfxCues: SkeletonAudio["sfxCues"] = [];

  for (const s of shots) {
    const sid = `s${s.shot_index + 1}`;
    if (s.voiceover_url) {
      voiceovers.push({ sceneId: sid, publicUrl: s.voiceover_url });
    }
    const raw = s.sfx_cues;
    if (Array.isArray(raw)) {
      for (const cue of raw as Array<Record<string, unknown>>) {
        if (
          typeof cue.url === "string" &&
          typeof cue.momentSec === "number"
        ) {
          sfxCues.push({
            sceneId: sid,
            momentSeconds: cue.momentSec,
            url: cue.url,
            volume: typeof cue.volume === "number" ? cue.volume : 0.6,
          });
        }
      }
    }
  }

  const bgMusic = job.music_url ? { streamUrl: job.music_url } : null;

  // Sprint 3 — pull per-scene bg volume overrides off audio_direction.plan
  // so the rebuilt skeleton keeps the ducking the user asked for.
  const ad = job.audio_direction as
    | { plan?: { bgMusicVolumeOverrides?: unknown } }
    | null;
  const rawOverrides = ad?.plan?.bgMusicVolumeOverrides;
  const bgMusicVolumeOverrides: SkeletonAudio["bgMusicVolumeOverrides"] = Array.isArray(
    rawOverrides,
  )
    ? (rawOverrides as Array<Record<string, unknown>>)
        .filter(
          (o) =>
            typeof o.sceneId === "string" && typeof o.volume === "number",
        )
        .map((o) => ({
          sceneId: o.sceneId as string,
          volume: Math.max(0, Math.min(1, Number(o.volume))),
        }))
    : undefined;

  if (
    !bgMusic &&
    voiceovers.length === 0 &&
    sfxCues.length === 0 &&
    (!bgMusicVolumeOverrides || bgMusicVolumeOverrides.length === 0)
  ) {
    return undefined;
  }
  return { bgMusic, voiceovers, sfxCues, bgMusicVolumeOverrides };
}

/**
 * Convert a freshly-resolved audio bundle (in-memory, just returned by
 * resolveAudioPlan) into the SkeletonAudio shape that buildFilmSkeleton
 * accepts. Used during Improve where we have the new bundle in memory and
 * shouldn't round-trip through the DB. The Sprint 3 bgMusicVolumeOverrides
 * come from the plan, not the resolved bundle — caller passes them in.
 */
function buildSkeletonAudioFromResolved(
  resolved: ResolvedAudio,
  bgMusicVolumeOverrides?: SkeletonAudio["bgMusicVolumeOverrides"],
): SkeletonAudio {
  return {
    bgMusic: resolved.bgMusic ? { streamUrl: resolved.bgMusic.streamUrl } : null,
    voiceovers: resolved.voiceovers.map((v) => ({
      sceneId: v.sceneId,
      publicUrl: v.publicUrl,
    })),
    sfxCues: resolved.sfxCues.map((c) => ({
      sceneId: c.sceneId,
      momentSeconds: c.momentSeconds,
      url: c.url,
      volume: c.volume,
    })),
    bgMusicVolumeOverrides,
  };
}

async function setJobStatus(
  jobId: string,
  patch: Partial<
    Pick<
      JobRow,
      | "status"
      | "title"
      | "shot_count"
      | "error"
      | "director_raw"
      | "continuity"
      | "completed_at"
      | "scenes_ready_at"
      | "film_critique"
      | "blueprint"
      | "scene_contexts"
      | "film_fills"
      | "polished_at"
      | "audio_direction"
    >
  >,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from("jobs").update(patch).eq("id", jobId);
  if (error) throw new Error(`updateJob(${jobId}) failed: ${error.message}`);
}

async function insertShots(jobId: string, shots: AssembledShot[]): Promise<ShotRow[]> {
  const db = getSupabase();
  const rows = shots.map((s, i) => ({
    job_id: jobId,
    shot_index: i,
    duration: s.duration,
    narration_part: s.narrationPart,
    shot_goal: s.shotGoal,
    image_prompt: s.imagePrompt,
    video_prompt: s.videoPrompt,
    negative_prompt: s.negativePrompt,
    composition: s.grounding.composition.layout,
    focal_point: s.grounding.composition.primaryFocus,
    camera_motion: s.grounding.camera.motion,
    lighting: deriveLightingTag(s),
    transition_out: s.transitionOut,
    ui_density: deriveUiDensity(s),
    text_overlay: s.textOverlay,
    color_palette: joinPalette(s.colorPalette),
    shot_type: deriveShotType(s),
    subject: deriveSubject(s),
    ui_description: deriveUiDescription(s),
    ui_motion: s.uiMotion,
    lighting_motion: s.lightingMotion,
    depth_cue: deriveDepthCue(s),
    atmosphere: s.atmosphere,
    pacing: s.pacing,
    intent: s.intent,
    domain: s.domain,
    grounding: s.grounding as unknown as object,
    visual_anchors: s.visualAnchors as unknown as object,
    motion_anchors: s.motion as unknown as object,
    style_notes: s.styleNotes,
    status: "pending" as const,
    clip_status: "skipped" as const,
  }));

  const { data, error } = await db.from("shots").insert(rows).select("*");
  if (error || !data) {
    throw new Error(`insertShots failed: ${error?.message ?? "no rows returned"}`);
  }
  return data as ShotRow[];
}

function assembleShots(
  recipes: ShotRecipe[],
  continuity: Continuity,
  mode: FilmMode,
): AssembledShot[] {
  return recipes.map((recipe) => {
    const prompts = assembleShotPrompts(recipe, continuity, mode);
    return { ...recipe, ...prompts };
  });
}

function resolveFilmMode(job: JobRow): FilmMode {
  if (job.film_mode && isSupportedFilmMode(job.film_mode)) {
    return job.film_mode;
  }
  return DEFAULT_FILM_MODE;
}

async function patchShot(
  shotId: string,
  patch: Partial<ShotRow>,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from("shots").update(patch).eq("id", shotId);
  if (error) {
    console.error(`patchShot(${shotId}) failed:`, error.message);
  }
}

type RenderAttempt = {
  replicateUrl: string;
  mirroredUrl: string;
  storagePath: string | null;
  replicateId: string | null;
};

async function renderAndMirror(args: {
  prompt: string;
  negativePrompt: string | null;
  imageModel: ImageModel;
  jobId: string;
  shotIndex: number;
}): Promise<RenderAttempt> {
  const result = await runImage({
    model: args.imageModel,
    prompt: args.prompt,
    negativePrompt: args.negativePrompt ?? undefined,
    aspectRatio: "16:9",
  });
  let mirroredUrl = result.url;
  let storagePath: string | null = null;
  try {
    const m = await mirrorImage(args.jobId, args.shotIndex, result.url);
    mirroredUrl = m.publicUrl;
    storagePath = m.storagePath;
  } catch (mirrorErr) {
    console.error(
      `mirrorImage failed for shot ${args.shotIndex} of job ${args.jobId}; using Replicate URL:`,
      mirrorErr instanceof Error ? mirrorErr.message : mirrorErr,
    );
  }
  return {
    replicateUrl: result.url,
    mirroredUrl,
    storagePath,
    replicateId: result.replicateId,
  };
}

async function renderImageStep(args: {
  shot: ShotRow;
  jobId: string;
  imageModel: ImageModel;
}): Promise<{ imageUrl: string | null; storagePath: string | null }> {
  const { shot, jobId, imageModel } = args;
  await patchShot(shot.id, { status: "generating", error: null });

  try {
    const requiresUi =
      shot.ui_density !== null &&
      shot.ui_density !== "none" &&
      shot.domain !== "no_ui_cinematic";

    // Resolve mode for this job (needed for validator).
    const { data: jobData } = await getSupabase()
      .from("jobs")
      .select("film_mode")
      .eq("id", jobId)
      .maybeSingle();
    const filmMode: FilmMode =
      jobData?.film_mode && isSupportedFilmMode(jobData.film_mode)
        ? (jobData.film_mode as FilmMode)
        : DEFAULT_FILM_MODE;

    // Attempt 1 — original prompt. Legacy AI-media shots always have an
    // image_prompt set during assembleShots; the column is only nullable
    // because hyperframes scenes share the table.
    if (!shot.image_prompt) {
      throw new Error(`legacy image render: shot ${shot.id} has no image_prompt`);
    }
    const first = await renderAndMirror({
      prompt: shot.image_prompt,
      negativePrompt: shot.negative_prompt,
      imageModel,
      jobId,
      shotIndex: shot.shot_index,
    });

    let firstValidation;
    try {
      firstValidation = await validateGeneratedImage({
        imageUrl: first.mirroredUrl,
        requiresUi,
        mode: filmMode,
      });
    } catch (err) {
      console.error(
        `validator failed for shot ${shot.id}; accepting first attempt:`,
        err instanceof Error ? err.message : err,
      );
      firstValidation = null;
    }

    let chosen = first;
    let chosenValidation = firstValidation;
    let attempts = 1;

    if (firstValidation && !firstValidation.approved) {
      console.warn(
        `shot ${shot.id} validation failed: ${summarizeValidation(firstValidation)} — retrying with reinforced prompt`,
      );
      const reinforced = reinforceImagePrompt(shot.image_prompt!);
      try {
        const second = await renderAndMirror({
          prompt: reinforced,
          negativePrompt: shot.negative_prompt,
          imageModel,
          jobId,
          shotIndex: shot.shot_index,
        });
        attempts = 2;
        let secondValidation;
        try {
          secondValidation = await validateGeneratedImage({
            imageUrl: second.mirroredUrl,
            requiresUi,
            mode: filmMode,
          });
        } catch (err) {
          console.error(
            `validator failed on retry for shot ${shot.id}:`,
            err instanceof Error ? err.message : err,
          );
          secondValidation = null;
        }
        // Prefer the approved attempt; otherwise prefer the one with fewer reasons.
        if (
          secondValidation?.approved ||
          (secondValidation && firstValidation && secondValidation.reasons.length < firstValidation.reasons.length)
        ) {
          chosen = second;
          chosenValidation = secondValidation;
        }
      } catch (retryErr) {
        console.error(
          `retry render failed for shot ${shot.id}; keeping first attempt:`,
          retryErr instanceof Error ? retryErr.message : retryErr,
        );
      }
    }

    await patchShot(shot.id, {
      status: "ready",
      image_url: chosen.mirroredUrl,
      storage_path: chosen.storagePath,
      replicate_id: chosen.replicateId,
      validation_passed: chosenValidation ? chosenValidation.approved : null,
      validation_warnings: chosenValidation
        ? chosenValidation.approved
          ? null
          : summarizeValidation(chosenValidation)
        : null,
      validation_attempts: attempts,
    });
    return { imageUrl: chosen.mirroredUrl, storagePath: chosen.storagePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`shot ${shot.id} image render failed:`, message);
    await patchShot(shot.id, {
      status: "failed",
      error: message,
      clip_status: "skipped",
      clip_error: "Image render failed; clip skipped",
    });
    return { imageUrl: null, storagePath: null };
  }
}

async function renderClipStep(args: {
  shot: ShotRow;
  jobId: string;
  videoModel: VideoModel;
  imageUrl: string;
}): Promise<void> {
  const { shot, jobId, videoModel, imageUrl } = args;
  await patchShot(shot.id, {
    clip_status: "generating",
    clip_error: null,
    clip_started_at: new Date().toISOString(),
  });

  try {
    // Snap shot.duration to nearest supported video duration (5 or 10).
    const durationSeconds: 5 | 10 = Number(shot.duration) > 7.5 ? 10 : 5;
    const result = await runVideo({
      model: videoModel,
      prompt: shot.video_prompt || shot.shot_goal || shot.image_prompt || "",
      imageUrl,
      negativePrompt: shot.negative_prompt ?? undefined,
      durationSeconds,
      aspectRatio: "16:9",
    });

    let clipUrl = result.url;
    let clipStoragePath: string | null = null;
    try {
      const mirrored = await mirrorVideo(jobId, shot.shot_index, result.url);
      clipUrl = mirrored.publicUrl;
      clipStoragePath = mirrored.storagePath;
    } catch (mirrorErr) {
      console.error(
        `mirrorVideo failed for shot ${shot.id}; using Replicate URL:`,
        mirrorErr instanceof Error ? mirrorErr.message : mirrorErr,
      );
    }

    await patchShot(shot.id, {
      clip_status: "ready",
      clip_url: clipUrl,
      clip_storage_path: clipStoragePath,
      clip_replicate_id: result.replicateId,
      clip_started_at: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`shot ${shot.id} clip render failed:`, message);
    await patchShot(shot.id, {
      clip_status: "failed",
      clip_error: message,
      clip_started_at: null,
    });
  }
}

async function renderShotPipeline(args: {
  shot: ShotRow;
  jobId: string;
  imageModel: ImageModel;
}): Promise<void> {
  // v2: image-only by default. Clips are opt-in per shot via the
  // /api/shots/:id/clip endpoint.
  await renderImageStep(args);
}

export async function runJob(jobId: string): Promise<void> {
  const db = getSupabase();

  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobErr || !jobData) {
    console.error(`runJob(${jobId}) could not load job:`, jobErr?.message);
    return;
  }
  const job = jobData as JobRow;

  // Look up plan tier once so every PostHog model_cost event emitted by the
  // pipeline can be segmented by plan without re-querying user_billing. Best-
  // effort: jobs from anonymous users (no user_id) get planTier = null.
  let planTier: string | null = null;
  if (job.user_id) {
    const { data: billing } = await db
      .from("user_billing")
      .select("plan_tier")
      .eq("user_id", job.user_id)
      .maybeSingle();
    planTier = (billing?.plan_tier as string | null) ?? null;
  }

  // Establish the ambient meter context for this job. Every meter() call
  // anywhere downstream — Replicate, ElevenLabs, GPT-4o, Opus — picks up
  // userId+jobId+planTier from AsyncLocalStorage and appends a ledger row.
  // reconcileJob() in the finally block backfills jobs.cost_actual_credits
  // and refunds any unused reservation back to the user's balance. Then
  // flushPostHog() drains buffered model_cost events so serverless cold-stop
  // doesn't drop them.
  await withMeterContext({ userId: job.user_id, jobId, planTier }, async () => {
    try {
      if (job.generation_mode === "legacy_ai_media") {
        await runLegacyAiMediaJob(jobId, job);
      } else {
        await runHyperframesDirect(jobId, job);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`runJob(${jobId}) failed:`, message);
      await setJobStatus(jobId, {
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      }).catch((statusErr) =>
        console.error(`runJob(${jobId}) could not record failure:`, statusErr),
      );
    } finally {
      await reconcileJob(jobId).catch((err) =>
        console.error(
          `runJob(${jobId}) reconcile failed:`,
          err instanceof Error ? err.message : err,
        ),
      );
      await flushPostHog();
    }
  });
}

// ─── HyperFrames branch (default) ─────────────────────────────────────────
// Split pipeline:
//   Stage A (runHyperframesDirect): script → storyboard → ONE composition HTML.
//     Per-shot rows are inserted with the composition's public URL on every row,
//     plus a per-scene thumbnail captured by seeking the master timeline.
//     Reaches `scenes_ready` and pauses for user review.
//   Stage B (runHyperframesExport): single renderScene call → one MP4.
//     Triggered by POST /api/jobs/:id/export → runs to `completed`.

async function runHyperframesDirect(jobId: string, job: JobRow): Promise<void> {
  // Stage 1 — directing: LLM splits script into scenes + locks identity.
  // Brand hints from the job row anchor the LLM's identity choices and
  // post-parse override the accent palette / inject the logo URL.
  // Plan-driven scene bounds are derived from the job owner's tier so
  // Free trials produce 1–2 short scenes instead of the system prompt's
  // default 4–8.
  const jobStart = Date.now();
  await setJobStatus(jobId, { status: "directing" });
  const ownerBilling = job.user_id ? await getOrCreateBilling(job.user_id) : null;
  const ownerPlan = getPlanFeatures(ownerBilling?.plan_tier ?? null);
  const storyboard = await timed(jobId, "storyboard", () =>
    generateStoryboard(job.script, {
      colors: job.brand_colors ?? null,
      logoUrl: job.brand_logo_url ?? null,
      brandStyle: job.brand_style ?? null,
      minScenes: ownerPlan.minScenes,
      maxScenes: ownerPlan.maxScenes,
    }),
  );

  // Hard cap to the plan's scene budget. The schema + prompt ask the LLM
  // for at most ownerPlan.maxScenes, but Anthropic structured-output is a
  // hint, not a guarantee — we've observed Free jobs come back with 9
  // scenes despite maxScenes=2. createJob() only reserved credits for the
  // plan cap, so anything beyond it would be unbilled overrun. The
  // dominant per-scene cost is opus_scene_fill (called once per inserted
  // scene downstream); trimming before insertHyperframesScenes caps that
  // loop. The director call itself is fixed-cost — we eat its tokens
  // regardless.
  if (storyboard.scenes.length > ownerPlan.maxScenes) {
    console.warn(
      `[hyperframes ${jobId}] director returned ${storyboard.scenes.length} scenes, over plan cap ${ownerPlan.maxScenes} — trimming.`,
    );
    storyboard.scenes = storyboard.scenes.slice(0, ownerPlan.maxScenes);
  }

  console.log(
    `[hyperframes ${jobId}] storyboard: "${storyboard.title}" — ${storyboard.scenes.length} scenes` +
      (job.brand_colors?.length
        ? ` · brand colors=${job.brand_colors.join(",")}`
        : "") +
      (job.brand_logo_url ? ` · brand logo` : ""),
  );

  await setJobStatus(jobId, {
    title: storyboard.title,
    shot_count: storyboard.scenes.length,
    director_raw: storyboard as unknown as object,
  });

  console.log(
    `[hyperframes ${jobId}] visual identity: ${storyboard.visualIdentity.paletteName} · ${storyboard.visualIdentity.motionLanguage} · ${storyboard.visualIdentity.headlineFont}/${storyboard.visualIdentity.bodyFont} · lang=${storyboard.visualIdentity.language} dir=${storyboard.visualIdentity.textDirection}`,
  );

  const insertedScenes = await insertHyperframesScenes(jobId, storyboard.scenes);
  insertedScenes.sort((a, b) => a.shot_index - b.shot_index);

  // Stage 1.5 — asset_planning: proactively decide what real imagery each
  // scene needs (user-uploaded → Flux → Unsplash → synthetic_css), then
  // resolve every slot to a concrete URL in parallel. Empty catalog when the
  // film is type-only or the planner declares no needs.
  await setJobStatus(jobId, { status: "asset_planning" });

  // Build the unified job-asset list the planner sees:
  //   • everything on jobs.assets (user uploads from the editor),
  //   • plus a virtual "brand_logo" entry when jobs.brand_logo_url is set.
  const jobAssetsRaw = Array.isArray(job.assets) ? (job.assets as Array<Record<string, unknown>>) : [];
  const jobAssets: JobAssetEntry[] = jobAssetsRaw
    .filter((a) => typeof a.id === "string" && typeof a.url === "string")
    .map((a) => ({
      id: a.id as string,
      kind: typeof a.kind === "string" ? (a.kind as string) : "other",
      url: a.url as string,
      name: typeof a.name === "string" ? (a.name as string) : undefined,
    }));
  if (job.brand_logo_url) {
    jobAssets.push({
      id: "brand_logo",
      kind: "image",
      url: job.brand_logo_url,
      name: "Brand logo",
    });
  }

  const assetPlan = await timed(jobId, "asset_plan", () =>
    generateAssetPlan(storyboard, storyboard.visualIdentity, jobAssets),
  );

  // Perf A3: blueprint LLM call and Flux/Unsplash asset sourcing are
  // independent — fire them in parallel. The blueprint is generated WITHOUT
  // the asset catalog (it doesn't need URLs to draft briefs), then we stamp
  // lockedAssets onto each brief once sourcing completes.
  const [assetCatalog, draftBlueprint] = await timed(jobId, "asset_sourcing+blueprint", () =>
    Promise.all([
      sourceAssets({ jobId, plan: assetPlan, jobAssets }),
      generateFilmBlueprint(storyboard, storyboard.visualIdentity),
    ]),
  );
  const blueprintWithAssets = applyLockedAssetsToBlueprint(draftBlueprint, assetCatalog);

  // Stage 1.75 — audio_direction: auto-pick bg music (Jamendo) + per-scene
  // voiceover (ElevenLabs TTS) + per-scene SFX (Freesound). Pure planning
  // here; resolution + mirroring into Supabase happens immediately after.
  // Per-track gating: each of voiceover/music/sfx runs only if the user
  // toggled it on at Generate time. If all three are off, the whole stage
  // is skipped. The LLM is told which tracks to plan for so it doesn't
  // burn tokens on outputs we'd discard.
  // Failures here NEVER block the film — we log and ship without audio so
  // the visual film still lands.
  const tracks = {
    voiceover: job.audio_voiceover_enabled ?? false,
    music: job.audio_music_enabled ?? false,
    sfx: job.audio_sfx_enabled ?? false,
  };
  const anyTrackOn = tracks.voiceover || tracks.music || tracks.sfx;
  const totalFilmSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);
  let resolvedAudio: ResolvedAudio | undefined;
  if (AUTO_AUDIO_ENABLED && anyTrackOn) {
    await setJobStatus(jobId, { status: "audio_direction" });
    try {
      const audioPlan: AudioPlan = await timed(jobId, "audio_direction_plan", () =>
        generateAudioDirection(storyboard, blueprintWithAssets, tracks, undefined, {
          brandStyle: job.brand_style ?? undefined,
          productDescription: job.product_description ?? undefined,
        }),
      );
      resolvedAudio = await timed(jobId, "audio_direction_resolve", () =>
        resolveAudioPlan({ jobId, plan: audioPlan, totalFilmSeconds, tracks }),
      );
      // Persist plan + resolved together so the UI can tell whether the
      // current music/sfx selection matches the auto-pick (for the ✨ Auto
      // chip + a future "Reset to auto" without re-calling the LLM).
      await setJobStatus(jobId, {
        audio_direction: {
          plan: audioPlan,
          resolved: resolvedAudio,
        } as unknown as object,
      });
      await persistResolvedAudio(jobId, insertedScenes, resolvedAudio);
      console.log(
        `[hyperframes ${jobId}] audio resolved: bg=${resolvedAudio.bgMusic ? `"${resolvedAudio.bgMusic.title}"` : "none"}, ` +
          `vo=${resolvedAudio.voiceovers.length}, sfx=${resolvedAudio.sfxCues.length}`,
      );
    } catch (err) {
      console.warn(
        `[hyperframes ${jobId}] audio_direction failed; shipping film without audio: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      resolvedAudio = undefined;
    }
  } else {
    console.log(
      `[hyperframes ${jobId}] audio_direction skipped (auto_enabled=${AUTO_AUDIO_ENABLED}, vo=${tracks.voiceover}, music=${tracks.music}, sfx=${tracks.sfx})`,
    );
  }

  // Stage 2 — generating_scenes: per-scene fills using the pre-built
  // (asset-stamped) blueprint. generateFilmHTML skips its internal blueprint
  // call when one is provided.
  await setJobStatus(jobId, { status: "generating_scenes" });
  console.log(`[hyperframes ${jobId}] generating film fills (blueprint + batched scenes, ${storyboard.scenes.length} scenes)`);
  let { html, fills, blueprint, sceneContexts } = await timed(jobId, "film_html", () =>
    generateFilmHTML(
      storyboard,
      storyboard.visualIdentity,
      assetCatalog,
      blueprintWithAssets,
      resolvedAudio,
    ),
  );

  // Persist the in-memory state the critique+refinement loop needs so it can
  // run on demand later via POST /api/jobs/:id/critique. Without this, the
  // sceneContexts (with original continuity snapshots) and the blueprint go
  // out of scope when this function returns.
  await setJobStatus(jobId, {
    blueprint: blueprint as unknown as object,
    scene_contexts: serializeSceneContexts(sceneContexts) as unknown as object,
    film_fills: fills as unknown as object,
  });

  // Upload the single composition.html.
  let compositionAsset = await uploadSceneAsset({
    jobId,
    sceneId: "main",
    filename: "composition.html",
    body: Buffer.from(html, "utf8"),
    contentType: "text/html; charset=utf-8",
  });

  // Per-scene captures (thumbnail + motion-trail composite). Returns the
  // composite public URLs in scene order so the critique stage can feed them
  // to Sonnet vision without re-fetching from the DB. totalFilmSeconds was
  // computed earlier (before audio_direction) so it's reused here.
  const motionTrailUrls = await timed(jobId, "capture_scenes", () =>
    captureScenes({
      jobId,
      html,
      storyboard,
      insertedScenes,
      compositionAssetUrl: compositionAsset.publicUrl,
      totalFilmSeconds,
      sceneIndices: storyboard.scenes.map((_, i) => i),
    }),
  );

  // Ship to scenes_ready immediately after the first capture pass. The
  // critique + refinement loop is on-demand via critiqueAndPolishJob (either
  // forced inline by AUTO_CRITIQUE_ENABLED, or triggered later by the user
  // through POST /api/jobs/:id/critique).
  await setJobStatus(jobId, {
    status: "scenes_ready",
    scenes_ready_at: new Date().toISOString(),
  });
  const totalMs = Date.now() - jobStart;
  console.log(
    `[hyperframes ${jobId}] [timing] TOTAL submit→scenes_ready ${(totalMs / 1000).toFixed(1)}s (${(totalMs / 60000).toFixed(1)}min)`,
  );

  if (AUTO_CRITIQUE_ENABLED) {
    console.log(`[hyperframes ${jobId}] AUTO_CRITIQUE_ENABLED=true — running critique+polish inline`);
    await critiqueAndPolishJob(jobId);
  } else {
    console.log(`[hyperframes ${jobId}] auto-critique disabled (set HYPERFRAMES_AUTO_CRITIQUE=true to enable) — ship as-is; user can promote via /api/jobs/:id/critique`);
  }
}

/**
 * Run the vision-critique + refinement + recapture pass against an existing
 * scenes_ready job. Idempotent on idempotent inputs — re-running won't
 * double-refine because subsequent runs read the patched film_fills.
 *
 * Reconstitutes the in-memory state that runHyperframesDirect persisted
 * (blueprint, scene_contexts, film_fills) plus the HTML + motion-trail URLs
 * already on the shot rows. On completion patches film_fills, sets
 * polished_at, and returns the job to scenes_ready.
 *
 * Called from:
 *   • runHyperframesDirect (when AUTO_CRITIQUE_ENABLED=true)
 *   • POST /api/jobs/:id/critique (the "Critique & polish" button)
 */
export async function critiqueAndPolishJob(jobId: string): Promise<void> {
  const db = getSupabase();

  // 1. Load job + shots.
  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !jobData) {
    throw new Error(`critiqueAndPolishJob(${jobId}) load job failed: ${jobErr?.message ?? "not found"}`);
  }
  const job = jobData as JobRow;

  if (!job.blueprint || !job.scene_contexts || !job.film_fills || !job.director_raw) {
    throw new Error(
      `critiqueAndPolishJob(${jobId}) not eligible: missing persisted state ` +
        `(blueprint=${!!job.blueprint}, scene_contexts=${!!job.scene_contexts}, ` +
        `film_fills=${!!job.film_fills}, director_raw=${!!job.director_raw})`,
    );
  }

  const { data: shotsData, error: shotsErr } = await db
    .from("shots")
    .select("*")
    .eq("job_id", jobId)
    .order("shot_index", { ascending: true });
  if (shotsErr || !shotsData) {
    throw new Error(`critiqueAndPolishJob(${jobId}) load shots failed: ${shotsErr?.message}`);
  }
  const insertedScenes = shotsData as ShotRow[];
  if (insertedScenes.length === 0) {
    throw new Error(`critiqueAndPolishJob(${jobId}): no shots on job`);
  }

  // 2. Reconstitute state.
  const storyboard = job.director_raw as unknown as Storyboard;
  const blueprint = job.blueprint as unknown as FilmBlueprint;
  const sceneContexts = deserializeSceneContexts(job.scene_contexts);
  let fills = job.film_fills as unknown as FilmFills;

  const compositionAssetUrl = insertedScenes[0].scene_html_path;
  if (!compositionAssetUrl) {
    throw new Error(`critiqueAndPolishJob(${jobId}): shots[0].scene_html_path is null`);
  }
  let html = await fetchSceneHTML(compositionAssetUrl);
  const motionTrailUrls: (string | null)[] = insertedScenes.map((s) => s.motion_trail_path);
  const telemetryByIndex: (MotionMetrics | null)[] = insertedScenes.map(
    (s) => (s.motion_telemetry ?? null) as MotionMetrics | null,
  );
  const totalFilmSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);

  // 3. Vision critique (per-scene parallel + film-level).
  await setJobStatus(jobId, { status: "vision_critique" });

  const critiquableIndices = motionTrailUrls
    .map((url, i) => ({ url, i }))
    .filter((x): x is { url: string; i: number } => x.url !== null);

  // Telemetry is strictly additive: a malformed motion_telemetry row must
  // degrade to "no telemetry", never fail the critique/polish pass.
  const safeTelemetryBlock = (i: number): string | null => {
    const metrics = telemetryByIndex[i];
    if (!metrics) return null;
    try {
      return renderTelemetryBlock(metrics);
    } catch (err) {
      console.warn(
        `[hyperframes ${jobId}] telemetry block render failed for scene index ${i}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  };

  const perSceneCritiques: SceneCritique[] = [];
  if (critiquableIndices.length > 0) {
    const settled = await timed(jobId, "vision_critique_per_scene", () =>
      Promise.allSettled(
        critiquableIndices.map((x) =>
          generateVisionCritique(
            blueprint,
            x.i,
            x.url,
            safeTelemetryBlock(x.i),
          ),
        ),
      ),
    );
    for (let k = 0; k < settled.length; k++) {
      const result = settled[k];
      const sceneIdx = critiquableIndices[k].i;
      const shotId = insertedScenes[sceneIdx].id;
      if (result.status === "fulfilled") {
        perSceneCritiques.push(result.value);
        await patchShot(shotId, { scene_critique: result.value as unknown as object });
      } else {
        console.warn(
          `[hyperframes ${jobId}] vision critique failed for s${sceneIdx + 1}:`,
          result.reason instanceof Error ? result.reason.message : result.reason,
        );
      }
    }
  } else {
    console.warn(`[hyperframes ${jobId}] no motion-trail composites available; skipping vision critique`);
  }

  let filmCritique: Awaited<ReturnType<typeof generateFilmCritique>> | null = null;
  const allTrailsPresent =
    motionTrailUrls.length === storyboard.scenes.length &&
    motionTrailUrls.every((u): u is string => u !== null);
  if (allTrailsPresent && perSceneCritiques.length > 0) {
    try {
      filmCritique = await timed(jobId, "film_critique", () =>
        generateFilmCritique(
          blueprint,
          storyboard,
          perSceneCritiques,
          motionTrailUrls as string[],
        ),
      );
      await setJobStatus(jobId, { film_critique: filmCritique as unknown as object });
    } catch (filmErr) {
      console.warn(
        `[hyperframes ${jobId}] film-level critique failed:`,
        filmErr instanceof Error ? filmErr.message : filmErr,
      );
    }
  } else {
    console.warn(
      `[hyperframes ${jobId}] film critique skipped (${motionTrailUrls.filter((u) => u !== null).length}/${storyboard.scenes.length} trails available, ${perSceneCritiques.length} scene critiques)`,
    );
  }

  // 4. Refinement: re-fire flagged scenes, rebuild composition, recapture.
  const telemetryIssues = new Map<string, string[]>();
  blueprint.sceneOutline.forEach((outline, i) => {
    const metrics = telemetryByIndex[i];
    if (!metrics) return;
    try {
      const gates = telemetryGates(metrics);
      if (gates.length > 0) {
        telemetryIssues.set(outline.id, gates.map((g) => g.description));
      }
    } catch (err) {
      console.warn(
        `[hyperframes ${jobId}] telemetry gates failed for ${outline.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  });
  if (telemetryIssues.size > 0) {
    console.log(
      `[hyperframes ${jobId}] telemetry gates fired for: ${Array.from(telemetryIssues.keys()).join(", ")}`,
    );
  }
  const refinements = buildRefinementSet(perSceneCritiques, filmCritique, telemetryIssues);
  if (refinements.length > 0) {
    await setJobStatus(jobId, { status: "refining_scenes" });
    console.log(
      `[hyperframes ${jobId}] refining ${refinements.length} scene${refinements.length === 1 ? "" : "s"}: ${refinements.map((r) => r.sceneId).join(", ")}`,
    );
    const refinedScenes = await timed(jobId, "refine_scenes", () =>
      refineScenes(blueprint, sceneContexts, fills.scenes, refinements),
    );
    fills = { ...fills, scenes: refinedScenes };
    const persistedAudio = buildSkeletonAudioFromPersisted(job, insertedScenes);
    html = buildFilmSkeleton(storyboard, storyboard.visualIdentity, fills, persistedAudio);

    const compositionAsset = await uploadSceneAsset({
      jobId,
      sceneId: "main",
      filename: "composition.html",
      body: Buffer.from(html, "utf8"),
      contentType: "text/html; charset=utf-8",
    });

    // Re-capture motion-trail composites for the refined scenes only.
    const refinedIndices = refinements
      .map((r) => blueprint.sceneOutline.findIndex((b) => b.id === r.sceneId))
      .filter((i) => i >= 0);
    await timed(jobId, "recapture_refined_scenes", () =>
      captureScenes({
        jobId,
        html,
        storyboard,
        insertedScenes,
        compositionAssetUrl: compositionAsset.publicUrl,
        totalFilmSeconds,
        sceneIndices: refinedIndices,
      }),
    );
  } else {
    console.log(`[hyperframes ${jobId}] no refinements requested by critiques — shipping as-is`);
  }

  // 5. Finalize: patched fills + polished_at + back to scenes_ready.
  await setJobStatus(jobId, {
    status: "scenes_ready",
    film_fills: fills as unknown as object,
    polished_at: new Date().toISOString(),
  });
}

/** Shape of a user-authored comment as stored on shots.comments (JSONB). */
type SceneCommentRow = {
  id: string;
  text: string;
  created_at: string;
  author?: string | null;
};

function isSceneCommentArray(v: unknown): v is SceneCommentRow[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        typeof (c as { text?: unknown }).text === "string" &&
        typeof (c as { created_at?: unknown }).created_at === "string",
    )
  );
}

/**
 * Re-fire each scene that has user comments through generateSceneFill with
 * the comments as feedback, in parallel. Reuses every piece of the polish
 * endpoint's machinery — same persisted state (blueprint / scene_contexts /
 * film_fills), same refineScenes, same captureScenes — but skips the LLM
 * critique stages because the human has already supplied the direction.
 *
 * Called from POST /api/jobs/:id/improve.
 */
export async function improveScenesFromComments(jobId: string): Promise<void> {
  const db = getSupabase();

  // 1. Load job + shots.
  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !jobData) {
    throw new Error(`improveScenesFromComments(${jobId}) load job failed: ${jobErr?.message ?? "not found"}`);
  }
  const job = jobData as JobRow;

  if (!job.blueprint || !job.scene_contexts || !job.film_fills || !job.director_raw) {
    throw new Error(
      `improveScenesFromComments(${jobId}) not eligible: missing persisted state ` +
        `(blueprint=${!!job.blueprint}, scene_contexts=${!!job.scene_contexts}, ` +
        `film_fills=${!!job.film_fills}, director_raw=${!!job.director_raw})`,
    );
  }

  const { data: shotsData, error: shotsErr } = await db
    .from("shots")
    .select("*")
    .eq("job_id", jobId)
    .order("shot_index", { ascending: true });
  if (shotsErr || !shotsData) {
    throw new Error(`improveScenesFromComments(${jobId}) load shots failed: ${shotsErr?.message}`);
  }
  const insertedScenes = shotsData as ShotRow[];
  if (insertedScenes.length === 0) {
    throw new Error(`improveScenesFromComments(${jobId}): no shots on job`);
  }

  // 2. Reconstitute state.
  const storyboard = job.director_raw as unknown as Storyboard;
  const blueprint = job.blueprint as unknown as FilmBlueprint;
  const sceneContexts = deserializeSceneContexts(job.scene_contexts);
  let fills = job.film_fills as unknown as FilmFills;

  const compositionAssetUrl = insertedScenes[0].scene_html_path;
  if (!compositionAssetUrl) {
    throw new Error(`improveScenesFromComments(${jobId}): shots[0].scene_html_path is null`);
  }
  let html = await fetchSceneHTML(compositionAssetUrl);
  const totalFilmSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);

  // 3. Build SceneRefinementRequest[] from shots' comments. Scenes with no
  //    comments are skipped (their fills stay as-is).
  const refinements: SceneRefinementRequest[] = [];
  for (let i = 0; i < insertedScenes.length; i++) {
    const shot = insertedScenes[i];
    const rawComments = (shot as unknown as { comments?: unknown }).comments;
    if (!isSceneCommentArray(rawComments) || rawComments.length === 0) continue;
    // Comments are stored in insertion order; render them chronologically so
    // the LLM sees the user's full edit history for this scene.
    const sorted = [...rawComments].sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    );
    const feedbackText = sorted
      .map(
        (c, k) => `Comment ${k + 1} (${c.created_at}): ${c.text}`,
      )
      .join("\n");
    const sceneId = blueprint.sceneOutline[i]?.id;
    if (!sceneId) {
      console.warn(`[improve ${jobId}] shot index ${i} has no matching blueprint scene — skipping its ${rawComments.length} comments`);
      continue;
    }
    refinements.push({ sceneId, feedbackText });
  }

  if (refinements.length === 0) {
    throw new Error(
      `improveScenesFromComments(${jobId}): no shots have comments — nothing to improve`,
    );
  }

  // 4. Re-fire commented scenes in parallel with their per-scene feedback.
  await setJobStatus(jobId, { status: "refining_scenes" });
  console.log(
    `[hyperframes ${jobId}] improving ${refinements.length} scene${refinements.length === 1 ? "" : "s"} from comments: ${refinements.map((r) => r.sceneId).join(", ")}`,
  );
  const refinedScenes = await timed(jobId, "improve_scenes_from_comments", () =>
    refineScenes(blueprint, sceneContexts, fills.scenes, refinements, "comment"),
  );
  fills = { ...fills, scenes: refinedScenes };

  // Sprint 3 — re-fire audio direction with the same comments. The audio
  // LLM is told to be restrained (most comments are visual); only audio-
  // related comments produce changes. resolveAudioPlan's smart-diff skips
  // the expensive ElevenLabs/Jamendo/Freesound calls for unchanged entries.
  // Skipped when AUTO_AUDIO_ENABLED is off, when no per-track toggles are on
  // for this job, OR when the job never ran auto-audio in the first place.
  const improveTracks = {
    voiceover: job.audio_voiceover_enabled ?? false,
    music: job.audio_music_enabled ?? false,
    sfx: job.audio_sfx_enabled ?? false,
  };
  const anyImproveTrackOn =
    improveTracks.voiceover || improveTracks.music || improveTracks.sfx;
  let refreshedAudio: ResolvedAudio | undefined;
  let refreshedAudioPlan: AudioPlan | undefined;
  const audioDirection = job.audio_direction as
    | { plan: AudioPlan; resolved: ResolvedAudio }
    | null;
  if (
    AUTO_AUDIO_ENABLED &&
    anyImproveTrackOn &&
    audioDirection &&
    audioDirection.plan &&
    audioDirection.resolved
  ) {
    try {
      const commentsByScene = refinements.map((r) => ({
        sceneId: r.sceneId,
        comments: r.feedbackText,
      }));
      refreshedAudioPlan = await timed(jobId, "audio_redirect_plan", () =>
        generateAudioDirection(
          storyboard,
          blueprint,
          improveTracks,
          {
            previousPlan: audioDirection.plan,
            previousResolved: {
              bgMusic: audioDirection.resolved.bgMusic,
              voiceovers: audioDirection.resolved.voiceovers.map((v) => ({
                sceneId: v.sceneId,
                text: v.text,
                delivery: v.delivery,
                publicUrl: v.publicUrl,
              })),
              sfxCues: audioDirection.resolved.sfxCues.map((c) => ({
                sceneId: c.sceneId,
                momentSeconds: c.momentSeconds,
                kind: c.kind,
                name: c.name,
                url: c.url,
              })),
            },
            commentsByScene,
          },
          {
            brandStyle: job.brand_style ?? undefined,
            productDescription: job.product_description ?? undefined,
          },
        ),
      );
      refreshedAudio = await timed(jobId, "audio_redirect_resolve", () =>
        resolveAudioPlan({
          jobId,
          plan: refreshedAudioPlan!,
          totalFilmSeconds,
          tracks: improveTracks,
          previousPlan: audioDirection.plan,
          previousResolved: audioDirection.resolved,
        }),
      );
      await setJobStatus(jobId, {
        audio_direction: {
          plan: refreshedAudioPlan,
          resolved: refreshedAudio,
        } as unknown as object,
      });
      await persistResolvedAudio(jobId, insertedScenes, refreshedAudio);
      console.log(
        `[improve ${jobId}] audio re-direction done: bg=${refreshedAudio.bgMusic ? `"${refreshedAudio.bgMusic.title}"` : "none"}, ` +
          `vo=${refreshedAudio.voiceovers.length}, sfx=${refreshedAudio.sfxCues.length}, ` +
          `overrides=${refreshedAudioPlan.bgMusicVolumeOverrides?.length ?? 0}`,
      );
    } catch (err) {
      console.warn(
        `[improve ${jobId}] audio re-direction failed; keeping previous audio: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      refreshedAudio = undefined;
      refreshedAudioPlan = undefined;
    }
  }

  // Choose the audio source for the rebuilt HTML: fresh resolved bundle
  // (with the plan's overrides) when re-direction succeeded; otherwise
  // fall back to whatever's currently persisted on the job + shot rows.
  const skeletonAudio = refreshedAudio
    ? buildSkeletonAudioFromResolved(
        refreshedAudio,
        refreshedAudioPlan?.bgMusicVolumeOverrides,
      )
    : buildSkeletonAudioFromPersisted(job, insertedScenes);
  html = buildFilmSkeleton(storyboard, storyboard.visualIdentity, fills, skeletonAudio);

  const compositionAsset = await uploadSceneAsset({
    jobId,
    sceneId: "main",
    filename: "composition.html",
    body: Buffer.from(html, "utf8"),
    contentType: "text/html; charset=utf-8",
  });

  // 5. Recapture motion-trail composites for the refined scenes only.
  const refinedIndices = refinements
    .map((r) => blueprint.sceneOutline.findIndex((b) => b.id === r.sceneId))
    .filter((i) => i >= 0);
  await timed(jobId, "recapture_improved_scenes", () =>
    captureScenes({
      jobId,
      html,
      storyboard,
      insertedScenes,
      compositionAssetUrl: compositionAsset.publicUrl,
      totalFilmSeconds,
      sceneIndices: refinedIndices,
    }),
  );

  // 6. Finalize: patched fills + back to scenes_ready. We deliberately do NOT
  //    touch polished_at — improvement is iterative and not the same gate as
  //    a one-shot polish promotion.
  await setJobStatus(jobId, {
    status: "scenes_ready",
    film_fills: fills as unknown as object,
  });
}

/**
 * Per-scene capture pass — thumbnail (midpoint) + motion-trail composite (4
 * frames at 5/35/65/95% of the scene's local timeline). Captures only the
 * scene indices in `sceneIndices`. Returns an array of motion-trail public
 * URLs aligned to storyboard order (null where capture failed or wasn't run).
 *
 * Errors degrade gracefully — a failed thumbnail leaves the iframe fallback,
 * a failed composite leaves motion_trail_path null on the shot row.
 */
async function captureScenes(args: {
  jobId: string;
  html: string;
  storyboard: { scenes: StoryboardScene[] };
  insertedScenes: ShotRow[];
  compositionAssetUrl: string;
  totalFilmSeconds: number;
  sceneIndices: number[];
}): Promise<(string | null)[]> {
  const { jobId, html, storyboard, insertedScenes, compositionAssetUrl, totalFilmSeconds } = args;
  const trailFractions = [0.05, 0.35, 0.65, 0.95];
  const motionTrailUrls: (string | null)[] = storyboard.scenes.map(() => null);

  // Compute every scene's start (we need cumulative offsets even for scenes
  // we won't recapture, so the chosen indices land at the right master seek).
  const sceneStarts: number[] = [];
  {
    let cum = 0;
    for (let i = 0; i < storyboard.scenes.length; i++) {
      sceneStarts.push(cum);
      cum += storyboard.scenes[i].durationSeconds;
    }
  }

  const indexSet = new Set(args.sceneIndices);
  const targetIndices = storyboard.scenes
    .map((_, i) => i)
    .filter((i) => indexSet.has(i));

  // Per-scene capture is independent across scenes (different sceneId, different
  // DB row, different upload paths). Playwright shares one cached browser across
  // contexts (`thumbnail.ts:cachedBrowser`) so concurrency here = parallel
  // Playwright contexts on the shared browser. Limit kept low (3) to avoid GPU
  // contention from sharp + Playwright's compositor.
  const SCENE_CAPTURE_CONCURRENCY = 3;
  const tasks = targetIndices.map((i) => async () => {
    const scene = storyboard.scenes[i];
    const shot = insertedScenes[i];
    const sceneStart = sceneStarts[i];
    const midpointSeek = sceneStart + Math.min(scene.durationSeconds / 2, scene.durationSeconds - 0.1);

    await patchShot(shot.id, { scene_html_path: compositionAssetUrl });

    try {
      const png = await captureSceneThumbnail({
        html,
        durationSeconds: totalFilmSeconds,
        seekSeconds: midpointSeek,
      });
      const thumb = await uploadSceneAsset({
        jobId,
        sceneId: scene.id,
        filename: "thumbnail.png",
        body: png,
        contentType: "image/png",
      });
      await patchShot(shot.id, { scene_thumbnail_path: thumb.publicUrl });
    } catch (thumbErr) {
      console.warn(
        `[hyperframes ${jobId}] thumbnail capture failed for ${scene.id} (seek=${midpointSeek.toFixed(2)}s):`,
        thumbErr instanceof Error ? thumbErr.message : thumbErr,
      );
    }

    try {
      const seekOffsetsSeconds = trailFractions.map(
        (f) => sceneStart + Math.min(f * scene.durationSeconds, scene.durationSeconds - 0.05),
      );
      const composite = await captureMotionTrailComposite({
        html,
        durationSeconds: totalFilmSeconds,
        seekOffsetsSeconds,
      });
      const trail = await uploadSceneAsset({
        jobId,
        sceneId: scene.id,
        filename: "motion_trail.png",
        body: composite,
        contentType: "image/png",
      });
      await patchShot(shot.id, { motion_trail_path: trail.publicUrl });
      motionTrailUrls[i] = trail.publicUrl;
    } catch (trailErr) {
      console.warn(
        `[hyperframes ${jobId}] motion-trail composite failed for ${scene.id}:`,
        trailErr instanceof Error ? trailErr.message : trailErr,
      );
    }

    try {
      const samples = await captureSceneMotionTelemetry({
        html,
        sceneId: scene.id,
        sceneStartSeconds: sceneStart,
        sceneDurationSeconds: scene.durationSeconds,
        totalDurationSeconds: totalFilmSeconds,
      });
      const metrics = computeMotionMetrics(samples);
      await patchShot(shot.id, { motion_telemetry: metrics as unknown as object });
    } catch (telemetryErr) {
      // Telemetry is strictly additive — never blocks capture or critique.
      console.warn(
        `[hyperframes ${jobId}] motion telemetry failed for ${scene.id}:`,
        telemetryErr instanceof Error ? telemetryErr.message : telemetryErr,
      );
    }
  });

  await runWithConcurrency(tasks, SCENE_CAPTURE_CONCURRENCY);

  return motionTrailUrls;
}

async function runHyperframesExport(jobId: string): Promise<void> {
  const db = getSupabase();

  // Reload shots — every row's scene_html_path points at the same composition.
  const { data: shotsData, error: shotsErr } = await db
    .from("shots")
    .select("*")
    .eq("job_id", jobId)
    .order("shot_index", { ascending: true });
  if (shotsErr || !shotsData) {
    throw new Error(`runHyperframesExport(${jobId}) load shots failed: ${shotsErr?.message}`);
  }
  const shots = shotsData as ShotRow[];
  if (shots.length === 0) {
    throw new Error(`runHyperframesExport(${jobId}): no shots to render`);
  }

  const compositionUrl = shots[0].scene_html_path;
  if (!compositionUrl) {
    throw new Error(`runHyperframesExport(${jobId}): composition URL missing on shots`);
  }

  // Stage 3 — rendering_scenes (single render of the master composition).
  const exportStart = Date.now();
  await setJobStatus(jobId, { status: "rendering_scenes" });
  for (const shot of shots) {
    await patchShot(shot.id, { render_status: "generating", error: null });
  }

  let result;
  try {
    const html = await timed(jobId, "export_fetch_html", () => fetchSceneHTML(compositionUrl));
    // Free-tier watermark: read the job owner's plan and inject the
    // bottom-right overlay into the composition HTML before render. Done
    // here (vs. ffmpeg post-process) so the watermark is captured as part
    // of every frame — no extra pass, no extra cost.
    const watermark = await shouldApplyWatermark(jobId);
    const finalHtml = watermark ? injectWatermarkOverlay(html) : html;
    result = await timed(jobId, "export_render_scene", () =>
      renderScene({
        jobId,
        sceneId: "main",
        files: { html: finalHtml, css: "", js: "" },
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    for (const shot of shots) {
      await patchShot(shot.id, { render_status: "failed", status: "failed", error: message });
    }
    throw err;
  }

  // Every shot row gets the same rendered_video_url so the editor's per-scene
  // tiles play the same film (seeking is the editor's job).
  for (const shot of shots) {
    await patchShot(shot.id, {
      rendered_video_url: result.mp4.publicUrl,
      render_status: "ready",
      render_duration_ms: result.durationMs,
      status: "ready",
    });
  }

  await setJobStatus(jobId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
  const totalMs = Date.now() - exportStart;
  console.log(
    `[hyperframes ${jobId}] [timing] TOTAL export ${(totalMs / 1000).toFixed(1)}s (${(totalMs / 60000).toFixed(1)}min)`,
  );
}

async function fetchSceneHTML(sceneHtmlUrl: string | null): Promise<string> {
  if (!sceneHtmlUrl) throw new Error("scene_html_path is null — Direct Storyboard never ran?");
  // scene_html_path now stores the Supabase public URL directly.
  const res = await fetch(sceneHtmlUrl);
  if (!res.ok) {
    throw new Error(`fetchSceneHTML(${sceneHtmlUrl}) failed: ${res.status}`);
  }
  return await res.text();
}

// Public — called by /api/jobs/:id/export.
export async function exportJob(jobId: string): Promise<void> {
  try {
    await runHyperframesExport(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`exportJob(${jobId}) failed:`, message);
    await setJobStatus(jobId, {
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    }).catch((statusErr) =>
      console.error(`exportJob(${jobId}) could not record failure:`, statusErr),
    );
    throw err;
  }
}

async function insertHyperframesScenes(
  jobId: string,
  scenes: StoryboardScene[],
): Promise<ShotRow[]> {
  const db = getSupabase();
  const rows = scenes.map((s, i) => ({
    job_id: jobId,
    shot_index: i,
    duration: s.durationSeconds,
    narration_part: s.copy,
    shot_goal: s.copy,
    image_prompt: null,
    status: "pending" as const,
    clip_status: "skipped" as const,
    render_status: "pending",
    scene_intent: null,
  }));
  const { data, error } = await db.from("shots").insert(rows).select("*");
  if (error || !data) {
    throw new Error(
      `insertHyperframesScenes failed: ${error?.message ?? "no rows returned"}`,
    );
  }
  return data as ShotRow[];
}

// ─── Legacy AI-media branch (only for existing rows with that mode set) ───

async function runLegacyAiMediaJob(jobId: string, job: JobRow): Promise<void> {
  await setJobStatus(jobId, { status: "directing" });

  const filmMode = resolveFilmMode(job);

  const ownerBilling = job.user_id ? await getOrCreateBilling(job.user_id) : null;
  const ownerPlan = getPlanFeatures(ownerBilling?.plan_tier ?? null);
  const directorResult = await generateLegacyStoryboard({
    script: job.script,
    productDescription: job.product_description ?? undefined,
    brandStyle: job.brand_style ?? undefined,
    filmMode,
    minScenes: ownerPlan.minScenes,
    maxScenes: ownerPlan.maxScenes,
  });

  // Trim to the per-plan cap (NOT the global MAX_SHOTS_PER_JOB) so legacy
  // jobs honor the same scene budget that createJob reserved against.
  if (directorResult.storyboard.shots.length > ownerPlan.maxScenes) {
    console.warn(
      `[legacy ${jobId}] director returned ${directorResult.storyboard.shots.length} shots, over plan cap ${ownerPlan.maxScenes} — trimming.`,
    );
  }
  const trimmedRecipes = directorResult.storyboard.shots.slice(0, ownerPlan.maxScenes);
  const continuity = directorResult.storyboard.continuity;

  const lint = lintStoryboard(trimmedRecipes);
  if (lint.warnings.length) {
    console.warn(`director lint(${jobId}):`, lint.warnings.join(" | "));
  }

  const assembled = assembleShots(trimmedRecipes, continuity, filmMode);

  await setJobStatus(jobId, {
    title: directorResult.storyboard.title,
    shot_count: assembled.length,
    director_raw: directorResult.raw as object,
    continuity: continuity as unknown as object,
  });

  const insertedShots = await insertShots(jobId, assembled);
  insertedShots.sort((a, b) => a.shot_index - b.shot_index);

  await setJobStatus(jobId, { status: "rendering" });

  const imageModel: ImageModel =
    job.image_model && isSupportedImageModel(job.image_model)
      ? job.image_model
      : DEFAULT_IMAGE_MODEL;

  const tasks = insertedShots.map(
    (shot) => () => renderShotPipeline({ shot, jobId, imageModel }),
  );

  await runWithConcurrency(tasks, IMAGE_CONCURRENCY);

  await setJobStatus(jobId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
}

async function loadShotAndJob(shotId: string): Promise<{ shot: ShotRow; job: JobRow }> {
  const db = getSupabase();

  const { data: shotData, error: shotErr } = await db
    .from("shots")
    .select("*")
    .eq("id", shotId)
    .single();
  if (shotErr || !shotData) {
    throw new Error(`shot ${shotId} not found`);
  }
  const shot = shotData as ShotRow;

  const { data: jobData, error: jobErr } = await db
    .from("jobs")
    .select("*")
    .eq("id", shot.job_id)
    .single();
  if (jobErr || !jobData) {
    throw new Error(`parent job ${shot.job_id} not found`);
  }
  return { shot, job: jobData as JobRow };
}

async function settleJobIfIdle(jobId: string): Promise<void> {
  const db = getSupabase();
  const { count: inFlight } = await db
    .from("shots")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .or("status.in.(pending,generating),clip_status.in.(pending,generating)");

  if ((inFlight ?? 0) === 0) {
    await setJobStatus(jobId, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  }
}

export async function retryShot(shotId: string): Promise<void> {
  const { shot, job } = await loadShotAndJob(shotId);

  const imageModel: ImageModel =
    job.image_model && isSupportedImageModel(job.image_model)
      ? job.image_model
      : DEFAULT_IMAGE_MODEL;

  await setJobStatus(job.id, { status: "rendering" });
  await renderShotPipeline({ shot, jobId: job.id, imageModel });
  await settleJobIfIdle(job.id);
}

export async function generateClip(shotId: string): Promise<void> {
  const { shot, job } = await loadShotAndJob(shotId);

  if (!shot.image_url || shot.status !== "ready") {
    throw new Error("Image must be ready before generating a clip");
  }

  const videoModel: VideoModel =
    job.video_model && isSupportedVideoModel(job.video_model)
      ? job.video_model
      : DEFAULT_VIDEO_MODEL;

  await setJobStatus(job.id, { status: "rendering" });
  await renderClipStep({
    shot,
    jobId: job.id,
    videoModel,
    imageUrl: shot.image_url,
  });
  await settleJobIfIdle(job.id);
}

// Clip generation runs as a fire-and-forget promise inside the same Node
// process as the API route (`void generateClip(id).catch(...)`). If the dev
// server restarts or the process dies before renderClipStep's terminal
// patchShot call, the row is left with clip_status='generating' forever and
// the editor's polling UI spins forever. This reaper detects and clears those
// orphans on every getJob() call (i.e. every 2s poll).
const CLIP_ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;

async function reapOrphanedClips(jobId: string): Promise<number> {
  const cutoff = new Date(Date.now() - CLIP_ORPHAN_TIMEOUT_MS).toISOString();
  const db = getSupabase();
  const { data, error } = await db
    .from("shots")
    .update({
      clip_status: "skipped",
      clip_error:
        "Clip generation interrupted (server restart or crash). Click retry to regenerate.",
      clip_started_at: null,
    })
    .eq("job_id", jobId)
    .eq("clip_status", "generating")
    .or(`clip_started_at.lt.${cutoff},clip_started_at.is.null`)
    .select("id");
  if (error) {
    console.warn(`reapOrphanedClips(${jobId}) failed:`, error.message);
    return 0;
  }
  const n = data?.length ?? 0;
  if (n > 0) {
    console.log(`reapOrphanedClips(${jobId}) reset ${n} orphaned clip(s)`);
  }
  return n;
}

export async function getJob(
  jobId: string,
): Promise<{ job: JobRow; shots: ShotRow[] } | null> {
  const db = getSupabase();
  const [{ data: job, error: jobErr }, { data: shots, error: shotsErr }] = await Promise.all([
    db.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    db.from("shots").select("*").eq("job_id", jobId).order("shot_index", { ascending: true }),
  ]);
  if (jobErr) throw new Error(`getJob failed: ${jobErr.message}`);
  if (!job) return null;
  if (shotsErr) throw new Error(`getJob shots failed: ${shotsErr.message}`);

  // Legacy clip reaper only matters for legacy_ai_media jobs; hyperframes
  // jobs don't use the clip lifecycle. Skipping the reaper there silences
  // the schema-cache warning that fires on every poll.
  if ((job as JobRow).generation_mode === "legacy_ai_media") {
    await reapOrphanedClips(jobId).catch(() => {});
  }

  return { job: job as JobRow, shots: (shots ?? []) as ShotRow[] };
}

export type ProjectSummary = {
  id: string;
  title: string | null;
  status: string;
  filmMode: string | null;
  shotCount: number;
  readyClips: number;
  finalVideoStatus: string | null;
  finalVideoUrl: string | null;
  finalVideoDuration: number | null;
  thumbnailUrl: string | null;
  updatedAt: string;
  createdAt: string;
  // Wall-clock seconds between job creation ("Direct storyboard" click) and
  // the storyboard LLM call returning + scenes becoming visible. Null until
  // the job first reaches `scenes_ready`. Used by the projects list + editor
  // header to show "Directed in 12s".
  directDurationSec: number | null;
};

export async function deleteJob(jobId: string, userId: string): Promise<void> {
  const db = getSupabase();
  // Scope by user_id so a stolen/guessed id cannot delete another user's job.
  // Shots are removed via `on delete cascade` on shots.job_id.
  const { data, error } = await db
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(`deleteJob(${jobId}) failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Project not found");
  }

  // Storage cleanup is best-effort: the DB row is already gone, so a failure
  // here just leaves orphaned files (cost only, no broken UX). We log but
  // don't throw so the user sees the delete succeed.
  try {
    const removed = await removeJobAssets(jobId);
    console.log(`[deleteJob] ${jobId} → removed ${removed} storage object(s)`);
  } catch (err) {
    console.warn(
      `[deleteJob] ${jobId} storage cleanup failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const db = getSupabase();
  const { data: jobs, error } = await db
    .from("jobs")
    .select(
      "id, title, status, film_mode, final_video_status, final_video_url, final_video_duration, shot_count, created_at, updated_at, scenes_ready_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(`listProjectsForUser failed: ${error.message}`);
  if (!jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id as string);
  const { data: thumbs, error: shotErr } = await db
    .from("shots")
    .select("job_id, shot_index, image_url, scene_thumbnail_path, clip_status")
    .in("job_id", jobIds);
  if (shotErr) throw new Error(`listProjectsForUser thumb fetch failed: ${shotErr.message}`);

  // Prefer the hyperframes scene thumbnail (default pipeline) and fall back to
  // the legacy AI-media image_url so older jobs still get a cover.
  const firstByJob = new Map<string, string | null>();
  const readyClipsByJob = new Map<string, number>();
  for (const row of thumbs ?? []) {
    const jid = row.job_id as string;
    if (!firstByJob.has(jid) && row.shot_index === 0) {
      const sceneThumb = row.scene_thumbnail_path as string | null;
      const legacyImg = row.image_url as string | null;
      firstByJob.set(jid, sceneThumb ?? legacyImg ?? null);
    }
    if (row.clip_status === "ready") {
      readyClipsByJob.set(jid, (readyClipsByJob.get(jid) ?? 0) + 1);
    }
  }

  return jobs.map((j) => {
    const createdAt = j.created_at as string;
    const scenesReadyAt = (j.scenes_ready_at as string | null) ?? null;
    const directDurationSec = scenesReadyAt
      ? computeDurationSec(createdAt, scenesReadyAt)
      : null;
    return {
      id: j.id as string,
      title: (j.title as string | null) ?? null,
      status: j.status as string,
      filmMode: (j.film_mode as string | null) ?? null,
      shotCount: (j.shot_count as number | null) ?? 0,
      readyClips: readyClipsByJob.get(j.id as string) ?? 0,
      finalVideoStatus: (j.final_video_status as string | null) ?? null,
      finalVideoUrl: (j.final_video_url as string | null) ?? null,
      finalVideoDuration: (j.final_video_duration as number | null) ?? null,
      thumbnailUrl: firstByJob.get(j.id as string) ?? null,
      updatedAt: j.updated_at as string,
      createdAt,
      directDurationSec,
    };
  });
}

function computeDurationSec(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}
