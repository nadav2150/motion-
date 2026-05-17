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
  generateFilmBlueprint,
  generateFilmCritique,
  generateFilmHTML,
  generateStoryboard,
  generateVisionCritique,
  refineScenes,
  type FilmBlueprint,
  type FilmFills,
  type Motif,
  type SceneCallContext,
  type SceneCritique,
  type Storyboard,
  type StoryboardScene,
} from "./hyperframes/llm-director";
import { renderScene } from "./hyperframes/render";
import { captureMotionTrailComposite, captureSceneThumbnail } from "./hyperframes/thumbnail";
import { sourceAssets, type JobAssetEntry } from "./assets";

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
};

export async function createJob(input: CreateJobInput): Promise<{ jobId: string }> {
  const script = input.script.trim();
  if (!script) throw new Error("Script is required");

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
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createJob failed: ${error?.message ?? "no row returned"}`);
  }
  return { jobId: data.id as string };
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
  }
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
  const jobStart = Date.now();
  await setJobStatus(jobId, { status: "directing" });
  const storyboard = await timed(jobId, "storyboard", () =>
    generateStoryboard(job.script, {
      colors: job.brand_colors ?? null,
      logoUrl: job.brand_logo_url ?? null,
      brandStyle: job.brand_style ?? null,
    }),
  );
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

  // Stage 2 — generating_scenes: per-scene fills using the pre-built
  // (asset-stamped) blueprint. generateFilmHTML skips its internal blueprint
  // call when one is provided.
  await setJobStatus(jobId, { status: "generating_scenes" });
  console.log(`[hyperframes ${jobId}] generating film fills (blueprint + batched scenes, ${storyboard.scenes.length} scenes)`);
  let { html, fills, blueprint, sceneContexts } = await timed(jobId, "film_html", () =>
    generateFilmHTML(storyboard, storyboard.visualIdentity, assetCatalog, blueprintWithAssets),
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
  // to Sonnet vision without re-fetching from the DB.
  const totalFilmSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);
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
  const totalFilmSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);

  // 3. Vision critique (per-scene parallel + film-level).
  await setJobStatus(jobId, { status: "vision_critique" });

  const critiquableIndices = motionTrailUrls
    .map((url, i) => ({ url, i }))
    .filter((x): x is { url: string; i: number } => x.url !== null);

  const perSceneCritiques: SceneCritique[] = [];
  if (critiquableIndices.length > 0) {
    const settled = await timed(jobId, "vision_critique_per_scene", () =>
      Promise.allSettled(
        critiquableIndices.map((x) =>
          generateVisionCritique(blueprint, x.i, x.url),
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
  const refinements = buildRefinementSet(perSceneCritiques, filmCritique);
  if (refinements.length > 0) {
    await setJobStatus(jobId, { status: "refining_scenes" });
    console.log(
      `[hyperframes ${jobId}] refining ${refinements.length} scene${refinements.length === 1 ? "" : "s"}: ${refinements.map((r) => r.sceneId).join(", ")}`,
    );
    const refinedScenes = await timed(jobId, "refine_scenes", () =>
      refineScenes(blueprint, sceneContexts, fills.scenes, refinements),
    );
    fills = { ...fills, scenes: refinedScenes };
    html = buildFilmSkeleton(storyboard, storyboard.visualIdentity, fills);

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
    result = await timed(jobId, "export_render_scene", () =>
      renderScene({
        jobId,
        sceneId: "main",
        files: { html, css: "", js: "" },
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

  const directorResult = await generateLegacyStoryboard({
    script: job.script,
    productDescription: job.product_description ?? undefined,
    brandStyle: job.brand_style ?? undefined,
    filmMode,
  });

  const trimmedRecipes = directorResult.storyboard.shots.slice(0, MAX_SHOTS_PER_JOB);
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
