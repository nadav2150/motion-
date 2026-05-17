// Editor-screen-local type definitions.
//
// These intentionally diverge from the canonical Supabase row types in
// ~/lib/supabase.ts — the editor needs the richer shape (music/sfx/asset
// metadata) that comes back from `/api/jobs/:id`. Do not try to unify
// them here without a separate refactor.

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

export type ShotStatus = "pending" | "generating" | "ready" | "failed";
export type ClipStatus = "pending" | "generating" | "ready" | "failed" | "skipped";

export type JobRow = {
  id: string;
  script: string;
  product_description: string | null;
  brand_style: string | null;
  brand_logo_url: string | null;
  brand_logo_storage_path: string | null;
  brand_colors: string[] | null;
  title: string | null;
  status: JobStatus;
  shot_count: number | null;
  director_model: string | null;
  image_model: string | null;
  video_model: string | null;
  film_mode: string | null;
  continuity: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  scenes_ready_at: string | null;
  music_track_id: string | null;
  music_url: string | null;
  music_title: string | null;
  music_artist: string | null;
  sfx_id: string | null;
  sfx_url: string | null;
  sfx_name: string | null;
  sfx_author: string | null;
  sfx_license: string | null;
  // Project-level asset library (see supabase/migrations/20260520_job_assets.sql).
  assets?: unknown;
};

export type ShotRow = {
  id: string;
  job_id: string;
  shot_index: number;
  duration: number;
  narration_part: string | null;
  shot_goal: string | null;
  visual_style: string | null;
  image_prompt: string;
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
  status: ShotStatus;
  image_url: string | null;
  error: string | null;
  clip_status: ClipStatus;
  clip_url: string | null;
  clip_error: string | null;
  // HyperFrames additions:
  scene_html_path: string | null;
  scene_thumbnail_path: string | null;
  rendered_video_url: string | null;
  render_status: string | null;
  // Per-scene user comments (see supabase/migrations/20260518_shot_comments.sql).
  comments?: unknown;
  // Per-scene attached assets (see supabase/migrations/20260519_shot_assets.sql).
  assets?: unknown;
};

export type JobResponse = { job: JobRow; shots: ShotRow[] };

export type DisplayStatus =
  | ShotStatus
  | "clip_generating"
  | "clip_failed"
  | "clip_skipped"
  | "clip_ready";

export type ActionButtonTone = "image" | "clip";

export type GroundingShape = {
  environment?: {
    locationType?: string;
    spaceType?: string;
    timeOfDay?: string;
    lightingSource?: string;
    weather?: string;
  };
  workspace?: {
    desk?: boolean;
    monitorCount?: number;
    surfaces?: string[];
  };
  human?: {
    visible?: boolean;
    style?: string;
    position?: string;
    emotion?: string;
  };
  camera?: {
    shotType?: string;
    lens?: string;
    angle?: string;
    motion?: string;
  };
  composition?: {
    layout?: string;
    primaryFocus?: string;
    secondaryFocus?: string;
    negativeSpace?: string;
  };
};

export type MotionPair = { object?: string; motion?: string };
export type MotionRecipeShape = {
  shotType?: string;
  primary?: MotionPair;
  secondary?: MotionPair;
  ambient?: MotionPair;
  rhythm?: string;
  lightResponse?: string;
  personality?: string;
  depthForeground?: string;
  depthMidground?: string;
  depthBackground?: string;
};

// Right-side comments panel — per-scene threads persisted via
// PATCH /api/shots/:id/comments (jsonb column on shots, see migration
// 20260518_shot_comments.sql).
export type SceneComment = {
  id: string;
  text: string;
  created_at: string;
  author?: string | null;
};

export type ScenesPanelTab = "assets" | "comments";

export type JobAssetKind = "video" | "image" | "audio" | "other";

export type JobAsset = {
  id: string;
  kind: JobAssetKind;
  url: string;
  storage_path: string;
  name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
};

export type SceneAssetKind = "video" | "image" | "screenshot" | "voiceover" | "sfx" | "music";

export type SceneAsset = {
  id: string;
  kind: SceneAssetKind;
  url: string;
  name: string;
  created_at: string;
};
