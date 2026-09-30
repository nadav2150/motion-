// Typed Supabase helpers for Studio (v2): jobs' v2 columns, job_revisions,
// brand_kits, user_assets, and the StudioJobView / StudioVideoCard mappers
// the API returns. Server-only (service-role client).

import { getSupabase } from "../supabase";
import { STORYBOARDS_BUCKET } from "../storage";
import type { ReferenceAnalysis } from "../reference-video";
import {
  DEFAULT_FPS,
  STAGE_LABELS,
  type BrandKit,
  type ExportOptions,
  type ReferenceMode,
  type RenderStatus,
  type StudioAudio,
  type StudioFormat,
  type StudioJobView,
  type StudioPlan,
  type StudioRevision,
  type StudioSource,
  type StudioStage,
  type StudioVideoCard,
  type UserAsset,
  type VoLine,
} from "./types";

// ─── Rows ──────────────────────────────────────────────────────────────────

// What jobs.studio_plan holds for v2 jobs: the creation inputs that have no
// column of their own, plus the plan once written.
export type StudioPlanRecord = {
  version: 1;
  input: {
    sources: StudioSource[];
    useBrandKit: boolean;
    templateId: string | null;
    referenceMode?: ReferenceMode; // absent on older jobs → "close"
  };
  plan: StudioPlan | null;
  finalDuration?: number | null;
  website?: {
    url: string;
    title: string | null;
    palette: string[];
    headlineFont: string | null;
    bodyFont: string | null;
    logoUrl: string | null;
  } | null;
  generatedAssets?: { id: string; url: string; path: string; description: string }[];
  // Resume checkpoints of the generate / regenerate run that wrote this record
  // (runStudioJob). A re-claimed task with the same runId skips what is done.
  run?: StudioRunCheckpoint | null;
};

// Parallel scene writing (scenes.ts): the scene split it was made for and the
// storage paths of the foundation and each finished scene (JSON).
export type ParallelCheckpoint = {
  split: [number, number][]; // [start, end] per scene, in order
  stylePath?: string | null;
  scenes?: Record<string, string>; // scene index → path
};

export type StudioRunCheckpoint = {
  runId: string; // studio_tasks.id
  kind: "initial" | "regenerate";
  planned?: boolean; // `plan` is this run's plan
  assetsReady?: boolean; // audio, generatedAssets, timed plan and finalDuration are this run's
  draftPath?: string | null; // the code call's document, saved before validation
  parallel?: ParallelCheckpoint | null; // parallel scene writing: finished pieces
  reviewDone?: boolean; // self-review finished (with or without a polished revision)
  finalRevision?: number | null; // the revision this run produced (to render)
};

// jobs.audio
export type StudioAudioRecord = {
  voiceover: { url: string; path: string; duration: number; lines: VoLine[] } | null;
  music: { url: string; path: string | null; title: string; artist: string | null; trackId?: string } | null;
};

export type StudioJobRow = {
  id: string;
  user_id: string | null;
  status: string;
  generation_mode: string;
  script: string | null;
  prompt: string | null;
  title: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  target_duration: number | null;
  language: string | null;
  voice_id: string | null;
  voiceover_enabled: boolean | null;
  music_enabled: boolean | null;
  favorite: boolean | null;
  deleted_at: string | null;
  template_id: string | null;
  seed: number | null;
  studio_plan: StudioPlanRecord | null;
  audio: StudioAudioRecord | null;
  current_revision: number | null;
  stage_label: string | null;
  progress: number | null;
  error: string | null;
  reference_video_url: string | null;
  reference_analysis: ReferenceAnalysis | { error: string } | null;
  final_video_url: string | null;
  created_at: string;
  updated_at: string;
};

export type JobRevisionRow = {
  id: string;
  job_id: string;
  revision: number;
  kind: "initial" | "review" | "edit" | "regenerate";
  instruction: string | null;
  html_path: string;
  thumb_path: string | null;
  video_path: string | null;
  video_url: string | null;
  render_status: RenderStatus;
  render_error: string | null;
  render_options: ExportOptions | null;
  credits: number | null;
  created_at: string;
};

export const STUDIO_JOB_COLUMNS =
  "id, user_id, status, generation_mode, script, prompt, title, format, width, height, fps, target_duration, language, voice_id, voiceover_enabled, music_enabled, favorite, deleted_at, template_id, seed, studio_plan, audio, current_revision, stage_label, progress, error, reference_video_url, reference_analysis, final_video_url, created_at, updated_at";

// ─── Storage paths ─────────────────────────────────────────────────────────

export function revisionDir(jobId: string, revision: number): string {
  return `jobs/${jobId}/v2/rev-${revision}`;
}

export function revisionPaths(jobId: string, revision: number) {
  const dir = revisionDir(jobId, revision);
  return { html: `${dir}/index.html`, thumb: `${dir}/thumb.jpg`, video: `${dir}/video.mp4`, dir };
}

export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return getSupabase().storage.from(STORYBOARDS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Host of Supabase storage (public object URLs) — the renderer allow-list. */
export function storageHost(): string | null {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
}

export async function downloadText(path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(STORYBOARDS_BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path} failed: ${error?.message ?? "no data"}`);
  return await data.text();
}

export async function downloadBuffer(path: string): Promise<Buffer> {
  const { data, error } = await getSupabase().storage.from(STORYBOARDS_BUCKET).download(path);
  if (error || !data) throw new Error(`download ${path} failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

// ─── Stage ↔ status ────────────────────────────────────────────────────────
// No enum change: v2 reuses job_status values; jobs.stage_label carries the
// exact stage (its label), so the stage is recovered by reverse lookup.

export const STAGE_TO_STATUS: Record<StudioStage, string> = {
  queued: "pending",
  analyzing_reference: "directing",
  planning: "directing",
  voiceover: "directing",
  assets: "directing",
  writing: "generating_scenes",
  validating: "generating_scenes",
  reviewing: "vision_critique",
  preview_ready: "scenes_ready",
  rendering: "rendering_scenes",
  mixing_audio: "stitching",
  done: "completed",
  failed: "failed",
};

export const STAGE_PROGRESS: Record<StudioStage, number> = {
  queued: 0,
  analyzing_reference: 0.04,
  planning: 0.1,
  voiceover: 0.2,
  assets: 0.22,
  writing: 0.3,
  validating: 0.55,
  reviewing: 0.65,
  preview_ready: 0.75,
  rendering: 0.78,
  mixing_audio: 0.96,
  done: 1,
  failed: 0,
};

/** Stages from which a new operation (edit, render, regenerate) may start. */
export const IDLE_STAGES: StudioStage[] = ["preview_ready", "done", "failed"];

const LABEL_TO_STAGE = new Map<string, StudioStage>(
  (Object.entries(STAGE_LABELS) as [StudioStage, string][]).map(([k, v]) => [v, k]),
);

const STATUS_TO_STAGE: Record<string, StudioStage> = {
  pending: "queued",
  directing: "planning",
  asset_planning: "assets",
  audio_direction: "voiceover",
  generating_scenes: "writing",
  vision_critique: "reviewing",
  refining_scenes: "reviewing",
  scenes_ready: "preview_ready",
  rendering: "rendering",
  rendering_scenes: "rendering",
  stitching: "mixing_audio",
  completed: "done",
  failed: "failed",
  canceled: "failed",
};

export function stageOf(row: Pick<StudioJobRow, "stage_label" | "status">): StudioStage {
  const fromLabel = row.stage_label ? LABEL_TO_STAGE.get(row.stage_label) : undefined;
  return fromLabel ?? STATUS_TO_STAGE[row.status] ?? "queued";
}

export function stagePatch(stage: StudioStage, progress?: number): Record<string, unknown> {
  return {
    status: STAGE_TO_STATUS[stage],
    stage_label: STAGE_LABELS[stage],
    progress: progress ?? STAGE_PROGRESS[stage],
  };
}

export async function setStage(
  jobId: string,
  stage: StudioStage,
  extra: Record<string, unknown> = {},
  progress?: number,
): Promise<void> {
  const { error } = await getSupabase()
    .from("jobs")
    .update({ ...stagePatch(stage, progress), ...extra, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(`setStage(${jobId}, ${stage}) failed: ${error.message}`);
}

export async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabase()
    .from("jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(`updateJob(${jobId}) failed: ${error.message}`);
}

/**
 * Atomically move an idle job into `stage` (compare-and-set on stage_label).
 * Returns false when another operation is already running (→ 409).
 */
export async function claimJob(jobId: string, stage: StudioStage): Promise<boolean> {
  const idleLabels = IDLE_STAGES.map((s) => STAGE_LABELS[s]);
  const { data, error } = await getSupabase()
    .from("jobs")
    .update({ ...stagePatch(stage), error: null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("stage_label", idleLabels)
    .select("id");
  if (error) throw new Error(`claimJob(${jobId}) failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

export async function getStudioJob(jobId: string): Promise<StudioJobRow | null> {
  const { data, error } = await getSupabase().from("jobs").select(STUDIO_JOB_COLUMNS).eq("id", jobId).maybeSingle();
  if (error) throw new Error(`getStudioJob(${jobId}) failed: ${error.message}`);
  return (data as unknown as StudioJobRow | null) ?? null;
}

/** The job if it exists, is not soft-deleted and belongs to userId; else null (→ 404). */
export async function getOwnedStudioJob(jobId: string, userId: string): Promise<StudioJobRow | null> {
  if (!isUuid(jobId)) return null;
  const row = await getStudioJob(jobId);
  if (!row || row.user_id !== userId || row.deleted_at) return null;
  return row;
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ─── Revisions ─────────────────────────────────────────────────────────────

export async function listRevisions(jobId: string): Promise<JobRevisionRow[]> {
  const { data, error } = await getSupabase()
    .from("job_revisions")
    .select("*")
    .eq("job_id", jobId)
    .order("revision", { ascending: true });
  if (error) throw new Error(`listRevisions(${jobId}) failed: ${error.message}`);
  return (data ?? []) as JobRevisionRow[];
}

export async function getRevision(jobId: string, revision: number): Promise<JobRevisionRow | null> {
  const { data, error } = await getSupabase()
    .from("job_revisions")
    .select("*")
    .eq("job_id", jobId)
    .eq("revision", revision)
    .maybeSingle();
  if (error) throw new Error(`getRevision(${jobId}, ${revision}) failed: ${error.message}`);
  return (data as JobRevisionRow | null) ?? null;
}

export async function nextRevisionNumber(jobId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("job_revisions")
    .select("revision")
    .eq("job_id", jobId)
    .order("revision", { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextRevisionNumber(${jobId}) failed: ${error.message}`);
  return ((data?.[0]?.revision as number | undefined) ?? 0) + 1;
}

export async function insertRevision(row: {
  jobId: string;
  revision: number;
  kind: JobRevisionRow["kind"];
  instruction: string | null;
  htmlPath: string;
  thumbPath: string | null;
  credits?: number | null;
}): Promise<void> {
  const { error } = await getSupabase().from("job_revisions").insert({
    job_id: row.jobId,
    revision: row.revision,
    kind: row.kind,
    instruction: row.instruction,
    html_path: row.htmlPath,
    thumb_path: row.thumbPath,
    credits: row.credits ?? null,
  });
  if (error) throw new Error(`insertRevision(${row.jobId}, ${row.revision}) failed: ${error.message}`);
}

export async function updateRevision(
  jobId: string,
  revision: number,
  patch: Partial<Omit<JobRevisionRow, "id" | "job_id" | "revision">>,
): Promise<void> {
  const { error } = await getSupabase()
    .from("job_revisions")
    .update(patch)
    .eq("job_id", jobId)
    .eq("revision", revision);
  if (error) throw new Error(`updateRevision(${jobId}, ${revision}) failed: ${error.message}`);
}

// ─── Mappers ───────────────────────────────────────────────────────────────

export function toStudioRevision(jobId: string, r: JobRevisionRow): StudioRevision {
  return {
    revision: r.revision,
    kind: r.kind,
    instruction: r.instruction,
    documentUrl: `/api/jobs/${jobId}/document?rev=${r.revision}`,
    thumbUrl: publicUrl(r.thumb_path),
    videoUrl: r.video_url,
    renderStatus: r.render_status,
    renderError: r.render_error,
    createdAt: r.created_at,
  };
}

export function toStudioAudio(a: StudioAudioRecord | null): StudioAudio {
  return {
    voiceover: a?.voiceover
      ? { url: a.voiceover.url, duration: a.voiceover.duration, lines: a.voiceover.lines }
      : null,
    music: a?.music ? { url: a.music.url, title: a.music.title, artist: a.music.artist } : null,
  };
}

function asFormat(v: string | null): StudioFormat {
  return v === "16:9" || v === "9:16" || v === "1:1" || v === "match" ? v : "16:9";
}

export function jobDuration(row: StudioJobRow): number | null {
  const d = row.studio_plan?.finalDuration ?? row.studio_plan?.plan?.duration ?? null;
  return typeof d === "number" ? d : null;
}

export function toStudioJobView(row: StudioJobRow, revisions: JobRevisionRow[]): StudioJobView {
  const stage = stageOf(row);
  const current = row.current_revision ?? 0;
  const currentRev = revisions.find((r) => r.revision === current) ?? revisions[revisions.length - 1];
  const analysis = row.reference_analysis;
  return {
    id: row.id,
    generationMode: "v2",
    title: row.title,
    prompt: row.prompt ?? row.script ?? "",
    status: row.status,
    stage,
    stageLabel: row.stage_label ?? STAGE_LABELS[stage],
    progress: Math.max(0, Math.min(1, Number(row.progress ?? 0))),
    error: row.error,
    format: asFormat(row.format),
    width: row.width ?? 1920,
    height: row.height ?? 1080,
    fps: row.fps ?? DEFAULT_FPS,
    duration: jobDuration(row),
    language: row.language ?? "en",
    voiceId: row.voice_id,
    musicEnabled: row.music_enabled ?? false,
    favorite: row.favorite ?? false,
    referenceVideoUrl: row.reference_video_url,
    referenceSummary: analysis && "summary" in analysis ? analysis.summary || null : null,
    currentRevision: current,
    revisions: revisions.map((r) => toStudioRevision(row.id, r)),
    audio: toStudioAudio(row.audio),
    thumbUrl: publicUrl(currentRev?.thumb_path ?? null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── My Videos listing ─────────────────────────────────────────────────────

export type VideoFilter = "all" | "drafts" | "generating" | "ready" | "exports" | "favorites";
export const VIDEO_FILTERS: VideoFilter[] = ["all", "drafts", "generating", "ready", "exports", "favorites"];

const ACTIVE_STATUSES = [
  "pending",
  "directing",
  "asset_planning",
  "audio_direction",
  "rendering",
  "generating_scenes",
  "vision_critique",
  "refining_scenes",
  "rendering_scenes",
  "stitching",
];

const CARD_COLUMNS =
  "id, generation_mode, title, prompt, script, status, stage_label, progress, format, width, height, favorite, final_video_url, final_video_duration, current_revision, studio_plan, created_at, updated_at";

type CardRow = {
  id: string;
  generation_mode: string;
  title: string | null;
  prompt: string | null;
  script: string | null;
  status: string;
  stage_label: string | null;
  progress: number | null;
  format: string | null;
  width: number | null;
  height: number | null;
  favorite: boolean | null;
  final_video_url: string | null;
  final_video_duration: number | null;
  current_revision: number | null;
  studio_plan: StudioPlanRecord | null;
  created_at: string;
  updated_at: string;
};

function cardTitle(r: CardRow): string {
  if (r.title?.trim()) return r.title.trim();
  const src = (r.prompt ?? r.script ?? "").trim().replace(/\s+/g, " ");
  if (!src) return "Untitled video";
  return src.length > 60 ? `${src.slice(0, 57)}…` : src;
}

function sanitizeSearch(q: string): string {
  return q.replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
}

export async function listStudioVideos(
  userId: string,
  opts: { filter?: VideoFilter; q?: string | null; limit?: number; cursor?: string | null },
): Promise<{ items: StudioVideoCard[]; nextCursor: string | null }> {
  const db = getSupabase();
  const limit = Math.max(1, Math.min(60, opts.limit ?? 24));
  let query = db
    .from("jobs")
    .select(CARD_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  switch (opts.filter ?? "all") {
    case "generating":
      query = query.in("status", ACTIVE_STATUSES);
      break;
    case "ready":
      query = query.in("status", ["scenes_ready", "completed"]);
      break;
    case "drafts":
      query = query.is("final_video_url", null).in("status", ["scenes_ready", "completed", "failed"]);
      break;
    case "exports":
      query = query.not("final_video_url", "is", null);
      break;
    case "favorites":
      query = query.eq("favorite", true);
      break;
  }
  const q = opts.q ? sanitizeSearch(opts.q) : "";
  if (q) query = query.or(`title.ilike.%${q}%,prompt.ilike.%${q}%,script.ilike.%${q}%`);
  if (opts.cursor && !Number.isNaN(Date.parse(opts.cursor))) query = query.lt("created_at", opts.cursor);

  const { data, error } = await query;
  if (error) throw new Error(`listStudioVideos failed: ${error.message}`);
  const rows = (data ?? []) as unknown as CardRow[];
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1]!.created_at : null;

  // Thumbnails: v2 → current revision thumb; older modes → first shot.
  const v2 = page.filter((r) => r.generation_mode === "v2");
  const legacy = page.filter((r) => r.generation_mode !== "v2");
  const thumbs = new Map<string, string | null>();
  if (v2.length) {
    const { data: revs } = await db
      .from("job_revisions")
      .select("job_id, revision, thumb_path")
      .in("job_id", v2.map((r) => r.id));
    for (const r of v2) {
      const mine = (revs ?? []).filter((x) => x.job_id === r.id);
      const cur = mine.find((x) => x.revision === r.current_revision) ?? mine.sort((a, b) => b.revision - a.revision)[0];
      thumbs.set(r.id, publicUrl((cur?.thumb_path as string | null) ?? null));
    }
  }
  if (legacy.length) {
    const { data: shots } = await db
      .from("shots")
      .select("job_id, shot_index, image_url, scene_thumbnail_path")
      .in("job_id", legacy.map((r) => r.id))
      .eq("shot_index", 0);
    for (const s of shots ?? []) {
      thumbs.set(s.job_id as string, (s.scene_thumbnail_path as string | null) ?? (s.image_url as string | null) ?? null);
    }
  }

  const items: StudioVideoCard[] = page.map((r) => {
    const isV2 = r.generation_mode === "v2";
    const mode: StudioVideoCard["generationMode"] =
      isV2 ? "v2" : r.generation_mode === "legacy_ai_media" ? "legacy_ai_media" : "hyperframes";
    return {
      id: r.id,
      generationMode: mode,
      title: cardTitle(r),
      status: r.status,
      stage: isV2 ? stageOf(r) : null,
      progress: isV2 ? Number(r.progress ?? 0) : null,
      format: isV2 ? asFormat(r.format) : null,
      duration: isV2
        ? (r.studio_plan?.finalDuration ?? r.studio_plan?.plan?.duration ?? null)
        : (r.final_video_duration ?? null),
      thumbUrl: thumbs.get(r.id) ?? null,
      favorite: r.favorite ?? false,
      hasExport: !!r.final_video_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
  return { items, nextCursor };
}

// ─── Brand kits ────────────────────────────────────────────────────────────

type BrandKitRow = {
  user_id: string;
  name: string | null;
  logo_url: string | null;
  logo_path: string | null;
  colors: string[] | null;
  heading_font: string | null;
  body_font: string | null;
  voice_id: string | null;
  style_notes: string | null;
  website_url: string | null;
};

export const EMPTY_BRAND_KIT: BrandKit = {
  name: null,
  logoUrl: null,
  colors: [],
  headingFont: null,
  bodyFont: null,
  voiceId: null,
  styleNotes: null,
  websiteUrl: null,
};

export function rowToBrandKit(r: BrandKitRow | null): BrandKit {
  if (!r) return { ...EMPTY_BRAND_KIT };
  return {
    name: r.name,
    logoUrl: r.logo_url,
    colors: r.colors ?? [],
    headingFont: r.heading_font,
    bodyFont: r.body_font,
    voiceId: r.voice_id,
    styleNotes: r.style_notes,
    websiteUrl: r.website_url,
  };
}

export function isBrandKitEmpty(k: BrandKit): boolean {
  return !k.name && !k.logoUrl && k.colors.length === 0 && !k.headingFont && !k.bodyFont && !k.styleNotes;
}

export async function getBrandKit(userId: string): Promise<BrandKit | null> {
  const { data, error } = await getSupabase().from("brand_kits").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`getBrandKit failed: ${error.message}`);
  return data ? rowToBrandKit(data as BrandKitRow) : null;
}

/** Validate and normalize a BrandKit body (PUT /api/brand-kit). */
export function parseBrandKit(body: unknown, storageHostname: string | null): { kit: BrandKit } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be a BrandKit object" };
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const colors = Array.isArray(b.colors)
    ? b.colors
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => /^#[0-9a-f]{6}$/.test(c))
        .slice(0, 12)
    : [];
  const logoUrl = str(b.logoUrl, 1000);
  if (logoUrl) {
    let host: string | null = null;
    try {
      host = new URL(logoUrl).hostname;
    } catch {
      return { error: "logoUrl is not a URL" };
    }
    if (!storageHostname || host !== storageHostname) return { error: "logoUrl must be an uploaded file" };
  }
  const websiteUrl = str(b.websiteUrl, 500);
  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) return { error: "websiteUrl must start with http(s)://" };
  const font = (v: unknown) => {
    const s = str(v, 80);
    return s && /^[\w\s\-]+$/.test(s) ? s : null;
  };
  return {
    kit: {
      name: str(b.name, 120),
      logoUrl,
      colors,
      headingFont: font(b.headingFont),
      bodyFont: font(b.bodyFont),
      voiceId: str(b.voiceId, 64),
      styleNotes: str(b.styleNotes, 2000),
      websiteUrl,
    },
  };
}

export async function upsertBrandKit(userId: string, kit: BrandKit): Promise<BrandKit> {
  const { data, error } = await getSupabase()
    .from("brand_kits")
    .upsert(
      {
        user_id: userId,
        name: kit.name,
        logo_url: kit.logoUrl,
        colors: kit.colors,
        heading_font: kit.headingFont,
        body_font: kit.bodyFont,
        voice_id: kit.voiceId,
        style_notes: kit.styleNotes,
        website_url: kit.websiteUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertBrandKit failed: ${error.message}`);
  return rowToBrandKit(data as BrandKitRow);
}

// ─── User assets ───────────────────────────────────────────────────────────

type UserAssetRow = {
  id: string;
  user_id: string;
  kind: UserAsset["kind"];
  name: string;
  url: string;
  path: string;
  mime: string | null;
  bytes: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  source: UserAsset["source"];
  job_id: string | null;
  created_at: string;
};

export function rowToUserAsset(r: UserAssetRow): UserAsset {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    url: r.url,
    mime: r.mime,
    bytes: r.bytes === null ? null : Number(r.bytes),
    duration: r.duration === null ? null : Number(r.duration),
    width: r.width,
    height: r.height,
    source: r.source,
    createdAt: r.created_at,
  };
}

export const ASSET_KINDS: UserAsset["kind"][] = ["video", "image", "audio", "logo"];

const UPLOAD_TYPES: Record<string, { kind: "image" | "video" | "audio"; ext: string }> = {
  "image/png": { kind: "image", ext: "png" },
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "image/svg+xml": { kind: "image", ext: "svg" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "video/webm": { kind: "video", ext: "webm" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp3": { kind: "audio", ext: "mp3" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/x-wav": { kind: "audio", ext: "wav" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/x-m4a": { kind: "audio", ext: "m4a" },
  "audio/aac": { kind: "audio", ext: "aac" },
};

// Cloudflare caps request bodies at 100 MB in front of the container.
export const UPLOAD_LIMITS: Record<"image" | "video" | "audio", number> = {
  image: 15 * 1024 * 1024,
  video: 95 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
};

/** Map an upload's MIME type (+ optional requested kind "logo") to an asset kind. */
export function assetKindForUpload(
  mime: string,
  size: number,
  requested: string | null,
): { kind: UserAsset["kind"]; ext: string; mime: string } | { error: string; status: number } {
  const type = UPLOAD_TYPES[(mime || "").toLowerCase()];
  if (!type) return { error: "Upload an image (PNG, JPG, WEBP, GIF, SVG), a video (MP4, MOV, WEBM) or audio (MP3, WAV, M4A).", status: 415 };
  if (size <= 0) return { error: "Empty file", status: 400 };
  if (size > UPLOAD_LIMITS[type.kind]) {
    return { error: `That ${type.kind} is larger than ${UPLOAD_LIMITS[type.kind] / 1024 / 1024} MB.`, status: 413 };
  }
  if (requested === "logo") {
    if (type.kind !== "image") return { error: "A logo must be an image", status: 400 };
    return { kind: "logo", ext: type.ext, mime: mime.toLowerCase() };
  }
  return { kind: type.kind, ext: type.ext, mime: mime.toLowerCase() };
}

/** Best-effort width/height (images) and duration (video/audio). */
export async function probeUploadedMedia(
  buf: Buffer,
  kind: UserAsset["kind"],
  ext: string,
): Promise<{ width?: number | null; height?: number | null; duration?: number | null }> {
  try {
    if ((kind === "image" || kind === "logo") && ext !== "svg") {
      const sharp = (await import("sharp")).default;
      const m = await sharp(buf).metadata();
      return { width: m.width ?? null, height: m.height ?? null };
    }
    if (kind === "video" || kind === "audio") {
      const fs = await import("node:fs/promises");
      const os = await import("node:os");
      const path = await import("node:path");
      const { probeDuration } = await import("./audio");
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "videly-asset-"));
      try {
        const file = path.join(dir, `media.${ext}`);
        await fs.writeFile(file, buf);
        return { duration: await probeDuration(file) };
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {
    // metadata is optional
  }
  return {};
}

export async function listUserAssets(userId: string, kind?: string | null): Promise<UserAsset[]> {
  let q = getSupabase()
    .from("user_assets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (kind && (ASSET_KINDS as string[]).includes(kind)) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(`listUserAssets failed: ${error.message}`);
  return ((data ?? []) as UserAssetRow[]).map(rowToUserAsset);
}

export async function insertUserAsset(row: {
  userId: string;
  kind: UserAsset["kind"];
  name: string;
  url: string;
  path: string;
  mime?: string | null;
  bytes?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  source?: UserAsset["source"];
  jobId?: string | null;
}): Promise<UserAsset> {
  const { data, error } = await getSupabase()
    .from("user_assets")
    .insert({
      user_id: row.userId,
      kind: row.kind,
      name: row.name,
      url: row.url,
      path: row.path,
      mime: row.mime ?? null,
      bytes: row.bytes ?? null,
      duration: row.duration ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      source: row.source ?? "upload",
      job_id: row.jobId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertUserAsset failed: ${error.message}`);
  return rowToUserAsset(data as UserAssetRow);
}

/** Delete the row (owner-scoped) and its storage object. false when not found. */
export async function deleteUserAsset(userId: string, assetId: string): Promise<boolean> {
  if (!isUuid(assetId)) return false;
  const db = getSupabase();
  const { data, error } = await db
    .from("user_assets")
    .delete()
    .eq("id", assetId)
    .eq("user_id", userId)
    .select("path");
  if (error) throw new Error(`deleteUserAsset failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return false;
  const p = row.path as string;
  // Only remove objects that live in the user's own upload folder; job files
  // (voiceovers) may still be referenced by a video.
  if (p.startsWith(`assets/${userId}/`)) {
    const { error: rmErr } = await db.storage.from(STORYBOARDS_BUCKET).remove([p]);
    if (rmErr) console.warn(`[studio db] asset object ${p} not removed: ${rmErr.message}`);
  }
  return true;
}
