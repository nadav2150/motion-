import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function decodeJwtRole(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const b64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env",
    );
  }

  const host = new URL(url).host;
  if (key.startsWith("sb_secret_")) {
    console.log(`[supabase] connected via secret key (host=${host})`);
  } else if (key.startsWith("sb_publishable_")) {
    console.warn(
      `[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY is a PUBLISHABLE key (sb_publishable_...). Writes will fail with RLS errors. Use the secret key (sb_secret_...) from Supabase → Project Settings → API Keys.`,
    );
  } else if (key.startsWith("eyJ")) {
    const role = decodeJwtRole(key);
    if (role === "service_role") {
      console.log(`[supabase] connected as legacy service_role JWT (host=${host})`);
    } else if (role) {
      console.warn(
        `[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY decodes to role="${role}" — expected "service_role". Writes will fail with RLS errors.`,
      );
    } else {
      console.warn(
        `[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY looks like a JWT but could not be decoded.`,
      );
    }
  } else {
    console.warn(
      `[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY is in an unrecognized format. RLS bypass uncertain.`,
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export type JobStatus =
  | "pending"
  | "directing"
  | "asset_planning"
  | "rendering"
  | "generating_scenes"
  | "vision_critique"
  | "refining_scenes"
  | "scenes_ready"
  | "rendering_scenes"
  | "stitching"
  | "completed"
  | "failed"
  | "canceled";

export type GenerationMode = "legacy_ai_media" | "hyperframes";

export type ShotStatus = "pending" | "generating" | "ready" | "failed";
export type ClipStatus = "pending" | "generating" | "ready" | "failed" | "skipped";

export type JobRow = {
  id: string;
  user_id: string | null;
  script: string;
  product_description: string | null;
  brand_style: string | null;
  title: string | null;
  status: JobStatus;
  shot_count: number | null;
  director_model: string | null;
  image_model: string | null;
  video_model: string | null;
  film_mode: string | null;
  director_raw: unknown;
  continuity: unknown;
  final_video_status: string | null;
  final_video_url: string | null;
  final_video_storage_path: string | null;
  final_video_duration: number | null;
  final_video_error: string | null;
  final_video_built_at: string | null;
  scenes_ready_at: string | null;
  brand_logo_url: string | null;
  brand_logo_storage_path: string | null;
  brand_colors: string[] | null;
  // Project-level asset library (see supabase/migrations/20260520_job_assets.sql).
  // Each entry: { id, kind, url, storage_path, name, mime, size_bytes, created_at }.
  assets: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;

  // HyperFrames additions (see supabase/migrations/20260514_hyperframes.sql)
  generation_mode: GenerationMode;
  film_rhythm: unknown;
  motif_state: unknown;
  philosophy_version: string | null;

  // v2 film-level vision critique (see supabase/migrations/20260524_critique.sql).
  // FilmCritique JSON: scores across the directed-whole rubric, verdict,
  // film-level issues with affectedSceneIds.
  film_critique: unknown;

  // Polish-endpoint state (see supabase/migrations/20260526_polish_endpoint.sql).
  // Captured at the end of generateFilmHTML so POST /api/jobs/:id/critique
  // can re-fire scenes with the same continuity snapshots without re-running
  // the full directing pipeline. motifRegistry inside scene_contexts is
  // serialized as an array (Sets don't survive JSON) and re-hydrated on read.
  blueprint: unknown;
  scene_contexts: unknown;
  film_fills: unknown;
  polished_at: string | null;
};

export type ShotRow = {
  id: string;
  job_id: string;
  shot_index: number;
  duration: number;
  narration_part: string | null;
  shot_goal: string | null;
  visual_style: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  negative_prompt: string | null;
  composition: string | null;
  focal_point: string | null;
  camera_motion: string | null;
  lighting: string | null;
  transition_out: string | null;
  ui_density: string | null;
  text_overlay: string | null;
  color_palette: string | null;
  status: ShotStatus;
  image_url: string | null;
  storage_path: string | null;
  replicate_id: string | null;
  error: string | null;
  clip_status: ClipStatus;
  clip_url: string | null;
  clip_storage_path: string | null;
  clip_replicate_id: string | null;
  clip_error: string | null;
  clip_started_at: string | null;
  shot_type: string | null;
  subject: string | null;
  ui_description: string | null;
  ui_motion: string | null;
  lighting_motion: string | null;
  depth_cue: string | null;
  atmosphere: string | null;
  pacing: string | null;
  intent: string | null;
  domain: string | null;
  grounding: unknown;
  visual_anchors: unknown;
  motion_anchors: unknown;
  style_notes: string | null;
  validation_passed: boolean | null;
  validation_warnings: string | null;
  validation_attempts: number | null;
  created_at: string;
  updated_at: string;

  // HyperFrames additions (see supabase/migrations/20260514_hyperframes.sql)
  scene_html_path: string | null;
  scene_css_path: string | null;
  scene_js_path: string | null;
  scene_thumbnail_path: string | null;
  // v2 motion-trail composite (see supabase/migrations/20260522_motion_trail.sql).
  // A 1920x1080 PNG that blends 4 frames from the scene's timeline with
  // descending alpha — captures motion-feel that single thumbnails miss.
  motion_trail_path: string | null;
  // v2 per-scene vision critique (see supabase/migrations/20260524_critique.sql).
  // SceneCritique JSON: scores per dimension, verdict, structured issues.
  scene_critique: unknown;
  rendered_video_url: string | null;
  render_status: string | null;
  render_duration_ms: number | null;
  hyperframes_validation_warnings: string | null;
  motion_dna: unknown;
  composition_dna: unknown;
  typography_dna: unknown;
  continuity_dna: unknown;
  scene_intent: string | null;
  scene_tension: number | null;
  scene_cadence: string | null;
  scene_kinetic: string | null;
  rhythm_slot: unknown;
  scene_exit_state: unknown;
  similarity_score: number | null;
  motif_callback: unknown;
  taste_scorecard: unknown;
  frame_taste_scorecard: unknown;
  frame_taste_warnings: string | null;
  taste_subtractions: number | null;
  budgets: unknown;
  primitives_used: unknown;
  regeneration_count: number | null;
  philosophy_alignment_score: number | null;
  rule_break_used: boolean | null;
  rule_break_kind: string | null;
  is_hold_scene: boolean | null;
  frame_density_mean: number | null;

  // Per-scene user comments (see supabase/migrations/20260518_shot_comments.sql).
  // Each entry: { id: string; text: string; created_at: string; author?: string | null }.
  comments: unknown;

  // Per-scene attached assets (see supabase/migrations/20260519_shot_assets.sql).
  // Each entry: { id, kind: 'video'|'image'|'screenshot'|'voiceover'|'sfx'|'music',
  //               url, name, created_at }.
  assets: unknown;
};
