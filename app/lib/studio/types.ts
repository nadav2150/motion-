// Videly v2 ("Studio") shared contract. Imported by the renderer, the
// generation pipeline, the API routes and the UI — keep it free of server-only
// imports so client code can use it too.

export type StudioFormat = "16:9" | "9:16" | "1:1" | "match";

export type FormatPreset = { format: Exclude<StudioFormat, "match">; width: number; height: number; label: string };

export const FORMAT_PRESETS: Record<Exclude<StudioFormat, "match">, FormatPreset> = {
  "16:9": { format: "16:9", width: 1920, height: 1080, label: "16:9 Landscape" },
  "9:16": { format: "9:16", width: 1080, height: 1920, label: "9:16 Vertical" },
  "1:1": { format: "1:1", width: 1080, height: 1080, label: "1:1 Square" },
};

export const DURATION_OPTIONS = [15, 30, 45, 60] as const;
export const DEFAULT_FPS = 30;

// A reference or source the user attached in the prompt card.
export type StudioSource =
  | { kind: "youtube"; url: string }
  | { kind: "video_url"; url: string }
  | { kind: "upload"; url: string; name: string; storagePath?: string }
  | { kind: "website"; url: string }
  | { kind: "image"; url: string; name: string; storagePath?: string; assetId?: string };

// POST /api/studio/jobs body.
export type CreateStudioJobInput = {
  prompt: string;
  format: StudioFormat;
  targetDuration: number; // seconds; with voiceover on it is a target, not exact
  language: string; // BCP-47, e.g. "en"
  voiceId: string | null; // null = no voiceover (AI Voice: Off)
  musicEnabled: boolean;
  sources: StudioSource[]; // at most one video reference (youtube | video_url | upload)
  useBrandKit: boolean;
  templateId?: string | null;
};

export type StudioStage =
  | "queued"
  | "analyzing_reference"
  | "planning"
  | "voiceover"
  | "assets"
  | "writing"
  | "validating"
  | "reviewing"
  | "preview_ready"
  | "rendering"
  | "mixing_audio"
  | "done"
  | "failed";

export const STAGE_LABELS: Record<StudioStage, string> = {
  queued: "Queued",
  analyzing_reference: "Watching your reference video",
  planning: "Planning the story",
  voiceover: "Recording the voiceover",
  assets: "Gathering images and music",
  writing: "Designing the motion",
  validating: "Checking every frame",
  reviewing: "Polishing the details",
  preview_ready: "Preview ready",
  rendering: "Rendering the video",
  mixing_audio: "Mixing audio",
  done: "Ready",
  failed: "Failed",
};

// One beat of the plan Opus writes before the code.
export type StudioBeat = {
  start: number;
  end: number;
  visual: string; // what is on screen
  technique: string; // e.g. "GSAP SplitText stagger", "Three.js particle field"
  onScreenText?: string;
};

export type VoLine = {
  text: string;
  start: number; // seconds, measured from the real TTS alignment once recorded
  end: number;
};

export type StudioPlan = {
  title: string;
  concept: string;
  duration: number;
  palette: string[]; // '#rrggbb'
  typography: { heading: string; body: string };
  beats: StudioBeat[];
  voiceover: VoLine[]; // empty when voiceover is off; start/end are targets before TTS
  musicMood: string | null;
  assetRequests: { id: string; description: string; kind: "photo" | "illustration" | "texture" }[];
  libraries: StudioLibrary[];
};

// Vendored libraries the generated document may load from /studio-libs/.
export type StudioLibrary = "gsap" | "three" | "lottie" | "anime" | "splitting" | "simplex-noise";

// What the generated document must declare synchronously in <head>.
export type VidelyDocumentMeta = { duration: number; fps: number; width: number; height: number };

export type ExportResolution = "720p" | "1080p" | "4k";
export type ExportQuality = "standard" | "high";

// POST /api/jobs/:id/render body (the Export modal).
export type ExportOptions = {
  revision?: number; // default: current revision
  resolution: ExportResolution;
  quality: ExportQuality;
  includeSubtitles: boolean;
  includeVoiceover: boolean;
  watermark: boolean; // forced true for plans with watermark
};

export type RenderStatus = "none" | "queued" | "rendering" | "ready" | "failed";

export type StudioRevision = {
  revision: number;
  kind: "initial" | "review" | "edit" | "regenerate";
  instruction: string | null;
  documentUrl: string; // /api/jobs/:id/document?rev=n (preview, same-origin)
  thumbUrl: string | null;
  videoUrl: string | null;
  renderStatus: RenderStatus;
  renderError: string | null;
  createdAt: string;
};

export type StudioAudio = {
  voiceover: { url: string; duration: number; lines: VoLine[] } | null;
  music: { url: string; title: string; artist: string | null } | null;
};

// GET /api/jobs/:id response for v2 jobs (generationMode === "v2").
export type StudioJobView = {
  id: string;
  generationMode: "v2";
  title: string | null;
  prompt: string;
  status: string; // job_status
  stage: StudioStage;
  stageLabel: string;
  progress: number; // 0..1
  error: string | null;
  format: StudioFormat;
  width: number;
  height: number;
  fps: number;
  duration: number | null;
  language: string;
  voiceId: string | null;
  musicEnabled: boolean;
  favorite: boolean;
  referenceVideoUrl: string | null;
  referenceSummary: string | null;
  currentRevision: number;
  revisions: StudioRevision[];
  audio: StudioAudio;
  thumbUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

// GET /api/studio/videos list item (My Videos, Home recent).
export type StudioVideoCard = {
  id: string;
  generationMode: "v2" | "hyperframes" | "legacy_ai_media";
  title: string;
  status: string;
  stage: StudioStage | null;
  progress: number | null;
  format: StudioFormat | null;
  duration: number | null;
  thumbUrl: string | null;
  favorite: boolean;
  hasExport: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BrandKit = {
  name: string | null;
  logoUrl: string | null;
  colors: string[];
  headingFont: string | null;
  bodyFont: string | null;
  voiceId: string | null;
  styleNotes: string | null;
  websiteUrl: string | null;
};

export type UserAsset = {
  id: string;
  kind: "video" | "image" | "audio" | "logo";
  name: string;
  url: string;
  mime: string | null;
  bytes: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  source: "upload" | "voiceover" | "reference" | "generated";
  createdAt: string;
};

export type TemplateCategory = "product" | "social" | "brand" | "app" | "event" | "youtube" | "ads";

export type StudioTemplate = {
  id: string;
  name: string;
  tagline: string;
  category: TemplateCategory;
  format: Exclude<StudioFormat, "match">;
  duration: number;
  prompt: string;
  styleNotes: string;
  previewVideoUrl: string | null;
  posterUrl: string | null;
};
