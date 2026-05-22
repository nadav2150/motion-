import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const DIRECTOR_MODEL = "claude-opus-4-7";
export const MIN_SHOTS = 5;
export const MAX_SHOTS = 14;

export const FILM_MODES = ["motion_design", "cinematic"] as const;
export type FilmMode = (typeof FILM_MODES)[number];
export const DEFAULT_FILM_MODE: FilmMode = "motion_design";

export function isSupportedFilmMode(value: string): value is FilmMode {
  return (FILM_MODES as readonly string[]).includes(value);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Enums — every staged field is enum-locked where possible. This is the
 * single biggest lever against drift: the LLM cannot invent
 * "scenic vista" if it can only choose from {indoor, studio_void, abstract_dark}.
 * ────────────────────────────────────────────────────────────────────────── */

export const INTENTS = [
  "burnout",
  "clarity",
  "momentum",
  "confidence",
  "curiosity",
  "relief",
  "tension",
  "celebration",
] as const;
export type Intent = (typeof INTENTS)[number];

export const DOMAINS = [
  "youtube_creator",
  "podcast_creator",
  "ecommerce_brand",
  "ai_workspace",
  "shopify_dashboard",
  "video_editing",
  "design_tool",
  "developer_tool",
  "analytics_platform",
  "no_ui_cinematic",
] as const;
export type Domain = (typeof DOMAINS)[number];

// Only one value allowed by design. The schema documents the rule even though
// the enum has a single member — outdoor is type-impossible. Flux still tries
// to escape if grounding is thin, but at least the data layer can't request it.
export const LOCATION_TYPES = ["indoor"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

// Concrete physical spaces only. No "minimal_void" / "abstract_dark" — those
// read as concept-art landscape cues to Flux.
export const SPACE_TYPES = [
  "creator_studio",
  "editing_room",
  "workstation",
  "dark_office",
  "home_office",
  "podcast_studio",
  "monitor_wall_setup",
  "desk_corner",
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const TIME_OF_DAY = ["night", "dusk", "studio_neutral"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

// Concrete light sources — physical fixtures, not moods.
// Dropped "volumetric" (atmospheric cue) and "neon_accent" (abstract).
export const LIGHTING_SOURCES = [
  "monitor_glow",
  "rim_only",
  "softbox",
  "desk_lamp",
  "ring_light",
  "ambient_room",
  "neon_strip",
  "low_key",
] as const;
export type LightingSource = (typeof LIGHTING_SOURCES)[number];

export const HUMAN_STYLES = [
  "silhouette",
  "over_shoulder",
  "hands_only",
  "creator_back",
  "absent",
] as const;
export type HumanStyle = (typeof HUMAN_STYLES)[number];

export const HUMAN_POSITIONS = [
  "foreground_left",
  "foreground_right",
  "center",
  "midground_left",
  "midground_right",
  "absent",
] as const;
export type HumanPosition = (typeof HUMAN_POSITIONS)[number];

export const HUMAN_EMOTIONS = [
  "burnout",
  "flow",
  "discovery",
  "satisfaction",
  "focus",
  "absent",
] as const;
export type HumanEmotion = (typeof HUMAN_EMOTIONS)[number];

export const CAMERA_SHOT_TYPES = [
  "extreme_closeup",
  "closeup",
  "medium",
  "medium_wide",
  "wide",
  "over_shoulder",
  "top_down",
  "low_angle",
] as const;
export type CameraShotType = (typeof CAMERA_SHOT_TYPES)[number];

export const CAMERA_LENSES = ["24mm", "35mm", "50mm", "85mm", "macro"] as const;
export type CameraLens = (typeof CAMERA_LENSES)[number];

export const CAMERA_ANGLES = [
  "eye_level",
  "slightly_over_shoulder",
  "three_quarter",
  "top_down",
  "low_angle",
] as const;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];

export const CAMERA_MOTIONS = [
  "static",
  "slow_push_in",
  "slow_pull_back",
  "pan_left",
  "pan_right",
  "tilt_up",
  "tilt_down",
  "orbit_soft",
  "parallax_layers",
  "rack_focus",
] as const;
export type CameraMotion = (typeof CAMERA_MOTIONS)[number];

export const COMPOSITION_LAYOUTS = [
  "asymmetrical_left",
  "asymmetrical_right",
  "centered_hero",
  "diagonal_flow",
  "layered_stack",
  "macro_ui_closeup",
  "floating_cards",
  "cinematic_split",
] as const;
export type CompositionLayout = (typeof COMPOSITION_LAYOUTS)[number];

export const NEGATIVE_SPACES = [
  "top",
  "bottom",
  "left",
  "right",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
  "none",
] as const;
export type NegativeSpace = (typeof NEGATIVE_SPACES)[number];

export const PACINGS = ["slow_hold", "steady", "accelerating", "staccato"] as const;
export type Pacing = (typeof PACINGS)[number];

export const TRANSITIONS = [
  "hard_cut",
  "match_cut",
  "whip_pan",
  "glass_morph",
  "fade_to_black",
  "speed_ramp",
] as const;
export type Transition = (typeof TRANSITIONS)[number];

/* ──────────────────────────────────────────────────────────────────────────
 * Domain vocabularies — the LLM may only describe UI surfaces drawn from
 * the active domain's surface list. Enforced at the prompt level; the engine
 * passes the active list back into the user prompt for inline reminders.
 * ────────────────────────────────────────────────────────────────────────── */

export const DOMAIN_SURFACES: Record<Domain, string[]> = {
  youtube_creator: [
    "editing_timeline",
    "thumbnails_grid",
    "waveform",
    "captions_panel",
    "youtube_analytics",
    "upload_progress",
    "creator_desk",
    "video_preview_monitor",
  ],
  podcast_creator: [
    "waveform",
    "episode_grid",
    "transcript_panel",
    "mic_levels",
    "episode_artwork",
    "publish_queue",
  ],
  ecommerce_brand: [
    "product_grid",
    "order_pipeline",
    "inventory_card",
    "shopify_checkout",
    "revenue_card",
    "customer_table",
  ],
  ai_workspace: [
    "chat_panel",
    "prompt_library",
    "model_picker",
    "agent_card",
    "run_history",
    "tool_log",
  ],
  shopify_dashboard: [
    "revenue_card",
    "sessions_chart",
    "top_products",
    "channel_breakdown",
    "order_pipeline",
    "live_view_map",
  ],
  video_editing: [
    "timeline_tracks",
    "transition_panel",
    "color_wheels",
    "preview_monitor",
    "audio_meters",
    "media_bin",
  ],
  design_tool: [
    "canvas",
    "layers_panel",
    "color_picker",
    "component_library",
    "inspector_panel",
    "prototype_links",
  ],
  developer_tool: [
    "code_editor",
    "file_tree",
    "terminal_pane",
    "diff_view",
    "deploy_log",
    "test_runner",
  ],
  analytics_platform: [
    "funnel_chart",
    "cohort_table",
    "kpi_card",
    "segment_filter",
    "events_stream",
    "dashboard_grid",
  ],
  no_ui_cinematic: [],
};

/* ──────────────────────────────────────────────────────────────────────────
 * Zod schemas
 * ────────────────────────────────────────────────────────────────────────── */

export const CAMERA_INERTIA = ["none", "soft", "medium"] as const;
export const MOTION_RESTRAINT = ["low", "medium", "high"] as const;
export const PARALLAX_STRENGTH = ["none", "subtle", "pronounced"] as const;
export const TRANSITION_AGGRESSIVENESS = ["low", "medium", "high"] as const;
export const DEPTH_BEHAVIOR = ["flat", "cinematic_layered", "extreme_layered"] as const;
export const GLOW_BEHAVIOR = ["static", "subtle_pulse", "active_pulse"] as const;
export const MOTION_DENSITY = ["sparse", "controlled", "dense"] as const;
export const EASING_FAMILY = ["linear", "quadratic", "cubic", "quartic", "quintic"] as const;

export const MotionSystemSchema = z.object({
  cameraInertia: z.enum(CAMERA_INERTIA),
  motionRestraint: z.enum(MOTION_RESTRAINT),
  parallaxStrength: z.enum(PARALLAX_STRENGTH),
  transitionAggressiveness: z.enum(TRANSITION_AGGRESSIVENESS),
  depthBehavior: z.enum(DEPTH_BEHAVIOR),
  glowBehavior: z.enum(GLOW_BEHAVIOR),
  motionDensity: z.enum(MOTION_DENSITY),
  easingFamily: z.enum(EASING_FAMILY),
});
export type MotionSystem = z.infer<typeof MotionSystemSchema>;

export const ContinuitySchema = z.object({
  palette: z.array(z.string()).min(4).max(6),
  lensFeel: z.string().min(4),
  atmosphere: z.string().min(4),
  uiStyle: z.string().min(4),
  motionSystem: MotionSystemSchema,
});
export type Continuity = z.infer<typeof ContinuitySchema>;

export const EnvironmentSchema = z.object({
  locationType: z.enum(LOCATION_TYPES),
  spaceType: z.enum(SPACE_TYPES),
  timeOfDay: z.enum(TIME_OF_DAY),
  lightingSource: z.enum(LIGHTING_SOURCES),
  weather: z.string(),
});

export const WorkspaceSchema = z.object({
  desk: z.boolean(),
  monitorCount: z.number().int().min(0).max(3),
  surfaces: z.array(z.string()).max(8),
});

export const HumanSchema = z.object({
  visible: z.boolean(),
  style: z.enum(HUMAN_STYLES),
  position: z.enum(HUMAN_POSITIONS),
  emotion: z.enum(HUMAN_EMOTIONS),
});

export const CameraSchema = z.object({
  shotType: z.enum(CAMERA_SHOT_TYPES),
  lens: z.enum(CAMERA_LENSES),
  angle: z.enum(CAMERA_ANGLES),
  motion: z.enum(CAMERA_MOTIONS),
});

export const ShotCompositionSchema = z.object({
  layout: z.enum(COMPOSITION_LAYOUTS),
  primaryFocus: z.string().min(1),
  secondaryFocus: z.string(),
  negativeSpace: z.enum(NEGATIVE_SPACES),
});

export const GroundingSchema = z.object({
  environment: EnvironmentSchema,
  workspace: WorkspaceSchema,
  human: HumanSchema,
  camera: CameraSchema,
  composition: ShotCompositionSchema,
});
export type Grounding = z.infer<typeof GroundingSchema>;

export const MotionPairSchema = z.object({
  object: z.string().min(1),
  motion: z.string().min(1),
});
export type MotionPair = z.infer<typeof MotionPairSchema>;

export const MotionRecipeSchema = z.object({
  shotType: z.string().min(8),
  primary: MotionPairSchema,
  secondary: MotionPairSchema,
  ambient: MotionPairSchema,
  rhythm: z.string().min(4),
  lightResponse: z.string().min(4),
  personality: z.string().min(4),
  depthForeground: z.string().min(4),
  depthMidground: z.string().min(4),
  depthBackground: z.string().min(4),
});
export type MotionRecipe = z.infer<typeof MotionRecipeSchema>;

// Legacy alias retained for any external imports.
export type MotionAnchor = MotionPair;

export const ShotRecipeSchema = z.object({
  id: z.string().min(1),
  duration: z.number().min(1.5).max(8),
  narrationPart: z.string().min(1),
  shotGoal: z.string().min(1),
  textOverlay: z.string(),
  transitionOut: z.enum(TRANSITIONS),

  intent: z.enum(INTENTS),
  domain: z.enum(DOMAINS),

  grounding: GroundingSchema,

  visualAnchors: z.array(z.string().min(2)).min(3).max(10),
  motion: MotionRecipeSchema,

  styleNotes: z.string(),
  avoidances: z.string(),

  // Kept for backwards compatibility with old rows / inspector — the new
  // pipeline ignores these and uses `motion.*` exclusively for the video
  // prompt. LLM may leave them empty.
  uiMotion: z.string(),
  lightingMotion: z.string(),
  atmosphere: z.string().min(1),
  pacing: z.enum(PACINGS),
  colorPalette: z.array(z.string()).min(3).max(5),
});
export type ShotRecipe = z.infer<typeof ShotRecipeSchema>;

// Per-call factory so the Director can be told plan-specific scene caps
// (Free wants 1–2 shots, paid plans 5–14). The schema is constructed at
// generateStoryboard() time using the plan's minScenes/maxScenes. The
// module-level MIN_SHOTS/MAX_SHOTS still act as global floor/ceiling for
// safety so a bad caller can't request 0 or 100 shots.
export function buildStoryboardSchema(min: number, max: number) {
  const lo = Math.max(1, Math.min(min, MAX_SHOTS));
  const hi = Math.max(lo, Math.min(max, MAX_SHOTS));
  return z.object({
    title: z.string().min(1),
    continuity: ContinuitySchema,
    shots: z.array(ShotRecipeSchema).min(lo).max(hi),
  });
}
export const StoryboardSchema = buildStoryboardSchema(MIN_SHOTS, MAX_SHOTS);
export type Storyboard = z.infer<typeof StoryboardSchema>;

/* ──────────────────────────────────────────────────────────────────────────
 * JSON schema (OpenAI strict mode)
 * ────────────────────────────────────────────────────────────────────────── */

const HEX = { type: "string", pattern: "^#?[0-9A-Fa-f]{6}$" } as const;

function enumProp(values: readonly string[]): { type: "string"; enum: string[] } {
  return { type: "string", enum: [...values] };
}

const ENVIRONMENT_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["locationType", "spaceType", "timeOfDay", "lightingSource", "weather"],
  properties: {
    locationType: enumProp(LOCATION_TYPES),
    spaceType: enumProp(SPACE_TYPES),
    timeOfDay: enumProp(TIME_OF_DAY),
    lightingSource: enumProp(LIGHTING_SOURCES),
    weather: { type: "string" },
  },
} as const;

const WORKSPACE_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["desk", "monitorCount", "surfaces"],
  properties: {
    desk: { type: "boolean" },
    monitorCount: { type: "integer", minimum: 0, maximum: 3 },
    surfaces: { type: "array", maxItems: 8, items: { type: "string" } },
  },
} as const;

const HUMAN_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["visible", "style", "position", "emotion"],
  properties: {
    visible: { type: "boolean" },
    style: enumProp(HUMAN_STYLES),
    position: enumProp(HUMAN_POSITIONS),
    emotion: enumProp(HUMAN_EMOTIONS),
  },
} as const;

const CAMERA_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["shotType", "lens", "angle", "motion"],
  properties: {
    shotType: enumProp(CAMERA_SHOT_TYPES),
    lens: enumProp(CAMERA_LENSES),
    angle: enumProp(CAMERA_ANGLES),
    motion: enumProp(CAMERA_MOTIONS),
  },
} as const;

const SHOT_COMPOSITION_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["layout", "primaryFocus", "secondaryFocus", "negativeSpace"],
  properties: {
    layout: enumProp(COMPOSITION_LAYOUTS),
    primaryFocus: { type: "string" },
    secondaryFocus: { type: "string" },
    negativeSpace: enumProp(NEGATIVE_SPACES),
  },
} as const;

const GROUNDING_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["environment", "workspace", "human", "camera", "composition"],
  properties: {
    environment: ENVIRONMENT_JSON,
    workspace: WORKSPACE_JSON,
    human: HUMAN_JSON,
    camera: CAMERA_JSON,
    composition: SHOT_COMPOSITION_JSON,
  },
} as const;

const MOTION_PAIR_JSON = {
  type: "object",
  additionalProperties: false,
  required: ["object", "motion"],
  properties: {
    object: { type: "string" },
    motion: { type: "string" },
  },
} as const;

const MOTION_RECIPE_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "shotType",
    "primary",
    "secondary",
    "ambient",
    "rhythm",
    "lightResponse",
    "personality",
    "depthForeground",
    "depthMidground",
    "depthBackground",
  ],
  properties: {
    shotType: { type: "string" },
    primary: MOTION_PAIR_JSON,
    secondary: MOTION_PAIR_JSON,
    ambient: MOTION_PAIR_JSON,
    rhythm: { type: "string" },
    lightResponse: { type: "string" },
    personality: { type: "string" },
    depthForeground: { type: "string" },
    depthMidground: { type: "string" },
    depthBackground: { type: "string" },
  },
} as const;

const MOTION_SYSTEM_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "cameraInertia",
    "motionRestraint",
    "parallaxStrength",
    "transitionAggressiveness",
    "depthBehavior",
    "glowBehavior",
    "motionDensity",
    "easingFamily",
  ],
  properties: {
    cameraInertia: enumProp(CAMERA_INERTIA),
    motionRestraint: enumProp(MOTION_RESTRAINT),
    parallaxStrength: enumProp(PARALLAX_STRENGTH),
    transitionAggressiveness: enumProp(TRANSITION_AGGRESSIVENESS),
    depthBehavior: enumProp(DEPTH_BEHAVIOR),
    glowBehavior: enumProp(GLOW_BEHAVIOR),
    motionDensity: enumProp(MOTION_DENSITY),
    easingFamily: enumProp(EASING_FAMILY),
  },
} as const;

const SHOT_JSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "duration",
    "narrationPart",
    "shotGoal",
    "textOverlay",
    "transitionOut",
    "intent",
    "domain",
    "grounding",
    "visualAnchors",
    "motion",
    "styleNotes",
    "avoidances",
    "uiMotion",
    "lightingMotion",
    "atmosphere",
    "pacing",
    "colorPalette",
  ],
  properties: {
    id: { type: "string" },
    duration: { type: "number", minimum: 1.5, maximum: 8 },
    narrationPart: { type: "string" },
    shotGoal: { type: "string" },
    textOverlay: { type: "string" },
    transitionOut: enumProp(TRANSITIONS),
    intent: enumProp(INTENTS),
    domain: enumProp(DOMAINS),
    grounding: GROUNDING_JSON,
    visualAnchors: { type: "array", minItems: 3, maxItems: 10, items: { type: "string" } },
    motion: MOTION_RECIPE_JSON,
    styleNotes: { type: "string" },
    avoidances: { type: "string" },
    uiMotion: { type: "string" },
    lightingMotion: { type: "string" },
    atmosphere: { type: "string" },
    pacing: enumProp(PACINGS),
    colorPalette: { type: "array", minItems: 3, maxItems: 5, items: HEX },
  },
} as const;

const STORYBOARD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "continuity", "shots"],
  properties: {
    title: { type: "string" },
    continuity: {
      type: "object",
      additionalProperties: false,
      required: ["palette", "lensFeel", "atmosphere", "uiStyle", "motionSystem"],
      properties: {
        palette: { type: "array", minItems: 4, maxItems: 6, items: HEX },
        lensFeel: { type: "string" },
        atmosphere: { type: "string" },
        uiStyle: { type: "string" },
        motionSystem: MOTION_SYSTEM_JSON,
      },
    },
    shots: {
      type: "array",
      minItems: MIN_SHOTS,
      maxItems: MAX_SHOTS,
      items: SHOT_JSON,
    },
  },
} as const;

// JSON-schema variant used when calling Anthropic structured outputs. Same
// per-call min/max bounds as buildStoryboardSchema.
function buildStoryboardJsonSchema(min: number, max: number): Record<string, unknown> {
  const lo = Math.max(1, Math.min(min, MAX_SHOTS));
  const hi = Math.max(lo, Math.min(max, MAX_SHOTS));
  // Deep-ish clone via JSON so we don't mutate the const. The schema is
  // not huge and this runs once per job, not per scene.
  const clone = JSON.parse(JSON.stringify(STORYBOARD_JSON_SCHEMA)) as {
    properties: { shots: { minItems: number; maxItems: number } };
  };
  clone.properties.shots.minItems = lo;
  clone.properties.shots.maxItems = hi;
  return clone as Record<string, unknown>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * System prompt — walks the LLM through stages 1→7 in order, with the
 * critical rule that GROUNDING must be committed before STYLE is ever
 * touched. Style is the last layer, not the first.
 * ────────────────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are the Director Brain for an AI Film Direction System producing premium SaaS launch films.

You DO NOT write image prompts. You produce a structured shot recipe through 7 sequential stages. A deterministic engine assembles the final prompts from your recipe — your only job is to commit to PHYSICAL REALITY first, then style last.

ABSOLUTE RULE — OBJECT DOMINANCE OVER MOOD:
Flux weights early tokens heavily. If we write "cinematic" or "atmospheric" anywhere near the front, Flux drifts into concept-art landscapes. Your recipe must therefore name CONCRETE OBJECTS, never abstract moods. Surfaces, monitors, desks, cards, charts — not "atmosphere", "ambience", "dramatic environment". The engine handles style at the very end of the prompt only.

BANNED WORDS in every text field (atmosphere, lightingMotion, uiMotion, styleNotes, shotGoal, etc.):
- atmospheric, atmosphere (as a label — describe concrete objects instead)
- dreamy, epic, dramatic environment, cinematic vista
- abstract stage, minimal void, concept art
- mountain, landscape, horizon, scenic, scenic vista, wallpaper
If you would type "atmospheric haze", instead type "subtle haze drifting between the desk and the back wall" — name what's in the room.

──────────────────────────────────────────────────────
THE 7-STAGE PIPELINE — DO STAGES IN ORDER, EVERY SHOT
──────────────────────────────────────────────────────

STAGE 1 — SCENE GROUNDING (must be locked BEFORE anything else)

Fill grounding.environment, grounding.workspace, grounding.human, grounding.camera, grounding.composition.

- environment.locationType: ALWAYS "indoor". No other value is allowed. The film lives inside a real editing workspace.
- environment.spaceType: pick from creator_studio | editing_room | workstation | dark_office | home_office | podcast_studio | monitor_wall_setup | desk_corner. These are concrete rooms with desks and monitors. There is no "void" and no "abstract" option — these read as landscape art to Flux.
- environment.timeOfDay: night | dusk | studio_neutral. NEVER day. NEVER sunset.
- environment.lightingSource: monitor_glow | rim_only | softbox | desk_lamp | ring_light | ambient_room | neon_strip | low_key. Concrete fixtures, never moods.
- environment.weather: ALWAYS empty string "". There is no weather indoors.

- workspace.desk: true if the shot includes any desk surface.
- workspace.monitorCount: 0–3. UI shots typically 1–2.
- workspace.surfaces: array of named UI surfaces FROM THE LOCKED DOMAIN VOCABULARY (see Stage 2). Empty array for non-UI shots.

- human.visible: true/false. For SaaS films, ~40–60% of shots have a human (silhouette, hands, back of creator).
- human.style: silhouette | over_shoulder | hands_only | creator_back | absent. NEVER full-face portraits.
- human.position: foreground_left | foreground_right | center | midground_left | midground_right | absent.
- human.emotion: burnout | flow | discovery | satisfaction | focus | absent.

- camera.shotType: extreme_closeup | closeup | medium | medium_wide | wide | over_shoulder | top_down | low_angle.
- camera.lens: 24mm | 35mm | 50mm | 85mm | macro.
- camera.angle: eye_level | slightly_over_shoulder | three_quarter | top_down | low_angle.
- camera.motion: static | slow_push_in | slow_pull_back | pan_left | pan_right | tilt_up | tilt_down | orbit_soft | parallax_layers | rack_focus. Never repeat across consecutive shots.

- composition.layout: asymmetrical_left | asymmetrical_right | centered_hero | diagonal_flow | layered_stack | macro_ui_closeup | floating_cards | cinematic_split. Never repeat across consecutive shots.
- composition.primaryFocus: specific named object the eye lands on first (e.g. "the editing_timeline panel filling center-right"). NOT generic ("the dashboard").
- composition.secondaryFocus: a supporting element (e.g. "the floating notification stack"). Empty string if the shot is single-focal.
- composition.negativeSpace: top | bottom | left | right | top_left | top_right | bottom_left | bottom_right | none. Reserved for typography.

STAGE 2 — DOMAIN LOCK (one domain per shot, sticks to its vocabulary)

Pick shot.domain ONCE based on the user's product. Then every UI surface in this shot must come from that domain's vocabulary:

- youtube_creator: editing_timeline, thumbnails_grid, waveform, captions_panel, youtube_analytics, upload_progress, creator_desk, video_preview_monitor
- podcast_creator: waveform, episode_grid, transcript_panel, mic_levels, episode_artwork, publish_queue
- ecommerce_brand: product_grid, order_pipeline, inventory_card, shopify_checkout, revenue_card, customer_table
- ai_workspace: chat_panel, prompt_library, model_picker, agent_card, run_history, tool_log
- shopify_dashboard: revenue_card, sessions_chart, top_products, channel_breakdown, order_pipeline, live_view_map
- video_editing: timeline_tracks, transition_panel, color_wheels, preview_monitor, audio_meters, media_bin
- design_tool: canvas, layers_panel, color_picker, component_library, inspector_panel, prototype_links
- developer_tool: code_editor, file_tree, terminal_pane, diff_view, deploy_log, test_runner
- analytics_platform: funnel_chart, cohort_table, kpi_card, segment_filter, events_stream, dashboard_grid
- no_ui_cinematic: for emotional cold opens and CTAs with no UI

FORBIDDEN: "complex dashboard", "cinematic interface", "premium dashboard" — generic blobs. Always name actual surfaces.

STAGE 3 — VISUAL ANCHORS (concrete objects to draw)

visualAnchors: 3–10 noun-phrase objects that will literally be rendered in this frame. Each entry must be a CONCRETE OBJECT, not an abstract.

GOOD:
- "ultrawide monitor with editing_timeline panel"
- "floating notification cards stacked on right edge"
- "youtube_analytics line chart titled Subscribers · 30d"
- "captions_panel with three caption rows visible"
- "blurred keyboard glow in foreground"

BAD (never emit):
- "cinematic UI"
- "premium dashboard"
- "abstract interface"
- "futuristic technology"

If the shot has no UI (emotional cold open), anchors describe the studio: "blurred creator silhouette", "single rim light", "atmospheric haze", "desk edge in foreground", etc.

STAGE 4 — MOTION ANCHORS (image-to-video readiness)

motionAnchors: 2–8 {object, motion} pairs. For each anchor that will animate during the 5-second video clip, declare WHAT animates and HOW.

GOOD:
- { "object": "youtube_analytics graph_lines", "motion": "animate_draw_left_to_right" }
- { "object": "notification_cards", "motion": "float_up_soft" }
- { "object": "foreground_silhouette", "motion": "subtle_breathing" }
- { "object": "monitor_glow", "motion": "slow_pulse" }
- { "object": "metric_counter Views", "motion": "tick_up_184K" }

BAD:
- { "object": "UI", "motion": "moves" }

STAGE 5 — STYLE NOTES

The engine automatically appends global style locks (Apple/Stripe/Linear, dark glass UI, blue rim light, red accent glow, shallow DoF). You do NOT write style here. Only add a single shot-specific style note if needed (e.g. "extra warm monitor glow for burnout intent"). Default: empty string.

STAGE 6 — AVOIDANCES

avoidances: shot-specific negatives beyond the engine's defaults. Empty if none. Examples: "no people, no logo distortion", "no on-screen text other than the overlay".

STAGE 7 — SHOT INTENT (the emotional engine — drives composition feel)

Pick ONE intent for this shot. Intent shapes everything:

- burnout: crowded layout, tighter framing, more UI density, harsher shadows, low_key lighting
- clarity: minimal composition, centered hero, large negative space, clean lighting (softbox or rim_only)
- momentum: diagonal composition, active motion anchors, forward perspective, accelerating pacing
- confidence: stable centered framing, slow camera, controlled motion, steady pacing
- curiosity: off-axis framing, layered depth, layered_stack composition
- relief: spacious composition, slow_hold pacing, breathing room
- tension: tight cropping, low_key lighting, asymmetrical_left or asymmetrical_right
- celebration: rim_backlight equivalent (rim_only or volumetric lightingSource), bright accents, centered_hero

The opening shot is usually burnout/tension/curiosity. The closing shot is usually confidence/celebration/clarity (and shot.domain = no_ui_cinematic with strong textOverlay).

──────────────────────────────────────────────────────
ALSO REQUIRED (per shot)
──────────────────────────────────────────────────────

- id, duration (1.5–8s, varied), narrationPart (exact slice of user's script), shotGoal (one sentence), textOverlay (1–6 words or empty), transitionOut (default hard_cut).
- uiMotion: leave empty string. The new pipeline drives UI motion through motion.primary/secondary instead.
- lightingMotion: leave empty string. Light motion goes into motion.ambient.
- atmosphere: shot-specific physical detail naming OBJECTS in the room — desk surface texture, monitor glow direction, faint haze in the back of the room. The word "atmosphere" must not appear inside this string. GOOD: "warm desk lamp pool on the right, faint dust haze near the monitor backlight". BAD: "dramatic atmosphere, cinematic mood".
- pacing: slow_hold | steady | accelerating | staccato (derived from intent).
- colorPalette: 3–5 hex; subset of continuity.palette.

──────────────────────────────────────────────────────
MOTION DIRECTION (motion field — drives the video prompt)
──────────────────────────────────────────────────────

You direct the video as a motion designer, not a film critic. The motion field describes ONLY physical movement. No story meaning. No emotion explanation. No "show burnout".

motion.shotType: ONE short sentence describing the physical shot (frame/angle/path), not the story.
GOOD: "Wide shot moving through layered floating SaaS UI panels."
GOOD: "Medium close-up framing the central KPI card."
BAD: "Burnout shot showing the creator's struggle."

motion.primary: { object, motion } — the ONE main visual movement. Concrete physical verb.
GOOD: { object: "hero dashboard card", motion: "expands smoothly into focus over 2 seconds" }
GOOD: { object: "headline text", motion: "slides up from below with subtle easing" }
BAD: { object: "premium energy", motion: "feels exciting" }

motion.secondary: { object, motion } — ONE supporting movement.
GOOD: { object: "supporting UI cards", motion: "trail behind with 200ms delayed easing" }
BAD: { object: "everything", motion: "moves dynamically" }

motion.ambient: { object, motion } — ONE small environmental detail.
GOOD: { object: "background particles", motion: "drift slowly upward" }
GOOD: { object: "card edge glow", motion: "faintly pulses" }

motion.personality: 2–5 short physical adjectives describing how the motion FEELS.
GOOD: "restrained, premium, controlled, intentional"
BAD: "innovative, next-gen, SaaS-energy"

motion.depthForeground: ONE phrase describing the foreground layer behavior.
motion.depthMidground: ONE phrase describing the midground layer behavior.
motion.depthBackground: ONE phrase describing the background layer behavior.
GOOD foreground: "front UI card slightly blurred, parallaxes faster than midground"
GOOD midground: "hero dashboard panel sits in sharpest focus"
GOOD background: "soft blurred gradient backdrop, particles drift very slowly"

motion.rhythm: how the motion is paced through time. Describe pauses and movement changes.
GOOD: "Slow hold. Clean pauses between movement changes. No constant motion."
GOOD: "Steady continuous drift, single accent beat at 2.5 seconds."
BAD: "Premium SaaS rhythm."

motion.lightResponse: how lighting reacts to the primary movement (glow shift, edge highlight, color drift). Physical only.
GOOD: "Glow intensity shifts subtly during card movement, then settles."
GOOD: "Edge highlight on the hero card brightens during push-in and dims as it settles."
BAD: "Lighting feels emotional."

MOTION VOCABULARY (use these physical verbs, not abstract words):
slide, drift, float, expand, compress, fade, rotate slightly, parallax, delayed easing, push in, pull back, settle, ease in, ease out, glow pulse, draw progressively, trail, slide up, slide down, lift, sink, sweep.

BANNED motion vocabulary:
"kinetic typography", "premium motion", "cinematic feeling", "futuristic vibe", "innovative momentum", "AI energy", "SaaS energy", "show burnout", "illustrate", "convey", "express".

EXACTLY 1 primary + 1 secondary + 1 ambient. No more. More creates chaos.

──────────────────────────────────────────────────────
TOP-LEVEL CONTINUITY (one per film)
──────────────────────────────────────────────────────

continuity.palette: 4–6 hex colors that signature the entire film.
continuity.lensFeel: lens character (e.g. "35mm lens character, shallow depth of field, gentle bloom on highlights").
continuity.atmosphere: CONCRETE indoor environment description. Name surfaces and objects, not moods. GOOD: "dark editing room, blue monitor spill on the desk, faint haze between desk and back wall, premium glass UI panels". BAD: "atmospheric, dramatic, cinematic ambience". The word "atmosphere" must never appear here.
continuity.uiStyle: UI design language ("dark glass panels, fine 1px borders, sharp Inter typography, blue rim accents on chrome").

continuity.motionSystem: GLOBAL MOTION PROFILE inherited by every shot. Pick ONE coherent profile for the entire film. Recommended premium profile: { cameraInertia: "soft", motionRestraint: "high", parallaxStrength: "subtle", transitionAggressiveness: "low", depthBehavior: "cinematic_layered", glowBehavior: "subtle_pulse", motionDensity: "controlled", easingFamily: "quartic" }.
- cameraInertia: none | soft | medium — how much weight the camera carries.
- motionRestraint: low | medium | high — high = minimal, expensive-feeling motion.
- parallaxStrength: none | subtle | pronounced.
- transitionAggressiveness: low | medium | high.
- depthBehavior: flat | cinematic_layered | extreme_layered.
- glowBehavior: static | subtle_pulse | active_pulse.
- motionDensity: sparse | controlled | dense.
- easingFamily: linear | quadratic | cubic | quartic | quintic.

Every shot's motion.* must respect the global motionSystem. No shot is allowed to break the profile.

Every shot is part of the SAME FILM. No tonal jumps. No domain hopping.

──────────────────────────────────────────────────────
HARD RULES
──────────────────────────────────────────────────────

1. Stages 1→7 must be completed for every shot. Skipping grounding = drift to landscapes.
2. environment.locationType is NEVER "outdoor". Use indoor, studio_void, or abstract_dark.
3. environment.timeOfDay is NEVER "day". Use night, dusk, or studio_neutral.
4. visualAnchors must be concrete named objects. No "premium dashboard". No "cinematic UI".
5. workspace.surfaces only contains surfaces from the locked domain's vocabulary (Stage 2 list).
6. ${MIN_SHOTS}–${MAX_SHOTS} shots dynamic to script complexity. Never fixed.
7. Never repeat composition.layout or camera.motion across consecutive shots.
8. ≥50% of shots have workspace.surfaces.length ≥ 1 (UI-first majority).
9. Banned marketing copy in any field: "ai-powered", "ai workspace", "smart automation", "next-gen", "revolutionary", "supercharge", "unleash", "synergy", "leverage", "game-changer", "premium dashboard", "complex dashboard", "cinematic UI".
10. Banned mood-paint words in any field: "atmospheric", "atmosphere" (as a noun referring to mood), "dreamy", "epic", "cinematic vista", "dramatic environment", "abstract stage", "minimal void", "concept art", "mountain", "landscape", "horizon", "scenic", "wallpaper".
11. JSON only. No prose, no commentary.`;

const SYSTEM_PROMPT_MOTION_DESIGN = `You are the Director Brain for an AI Motion Design Director. You produce structured recipes for premium SaaS launch graphics.

YOU ARE A MOTION DESIGNER. NOT a cinematographer. Not a photographer. Not a film-set designer.

REFERENCE: Linear announcements · Arc Browser intro videos · Raycast launch films · Apple keynote motion graphics · Stripe Sessions visuals · Figma Config visuals. The output should feel designed in After Effects or Figma, not photographed in real life.

FORBIDDEN: photoreal language, lenses, cameras, offices, monitors, people, desks, hands, faces, realistic environments, "creator", "studio", "workspace". Banned mood-paint: "atmospheric", "atmosphere", "dreamy", "epic", "cinematic vista", "concept art", "wallpaper", "scenic", "landscape", "mountain", "horizon", "outdoor", "nature", "sunset".

YOU PRODUCE: composition recipes for layered motion-design frames. Floating UI cards, gradient backgrounds, glassmorphism, typography hierarchy, motion-graphics elements.

──────────────────────────────────────────────────────
SCHEMA INTERPRETATION (motion_design mode)
──────────────────────────────────────────────────────

The schema has fields originally designed for cinematic shots. In motion_design mode you fill them as follows:

- grounding.environment.locationType: always "indoor" (forced single value).
- grounding.environment.spaceType: always "workstation" (placeholder, the engine ignores it in motion_design mode).
- grounding.environment.timeOfDay: always "studio_neutral" (placeholder, ignored).
- grounding.environment.lightingSource: always "ambient_room" (placeholder, ignored).
- grounding.environment.weather: always "" (empty string).

- grounding.workspace.desk: always false.
- grounding.workspace.monitorCount: always 0. There are NO physical monitors.
- grounding.workspace.surfaces: array of FLOATING UI CARD TYPES from the locked domain vocabulary. These are NOT inside a monitor — they float independently in the composition. Example: ["kpi_card", "line_chart", "captions_panel", "upload_progress"].

- grounding.human.visible: ALWAYS false. No human ever appears in a motion_design frame.
- grounding.human.style: always "absent".
- grounding.human.position: always "absent".
- grounding.human.emotion: always "absent".

- grounding.camera.shotType: pick any value — used only as a loose framing hint. Recommend "medium" or "medium_wide".
- grounding.camera.lens: always "35mm" (placeholder, ignored).
- grounding.camera.angle: always "eye_level" (placeholder, ignored).
- grounding.camera.motion: this DOES matter — it's the virtual parallax camera motion for the video gen pass. Pick a motion that maps well to motion-graphic animation: static, slow_push_in, slow_pull_back, parallax_layers.

- grounding.composition.layout: the heart of the recipe. Pick the layout that defines this frame's energy.
- grounding.composition.primaryFocus: SPECIFIC. Example: "the centered headline 'Direct your launch'", or "the KPI card showing 184K in the upper-right".
- grounding.composition.secondaryFocus: supporting element. Example: "the floating line-chart card on the lower-left".
- grounding.composition.negativeSpace: where typography breathes.

- visualAnchors: list of MOTION-GRAPHICS ELEMENTS present in the frame. Concrete design vocabulary:
  GOOD examples:
    - "deep gradient backdrop, dark navy to violet"
    - "glassmorphism on all UI cards with 24px blur"
    - "subtle particle field drifting upward"
    - "animated graph lines drawn in"
    - "glowing aurora streak behind the headline"
    - "floating panel with neon edge accent"
    - "kinetic typography hierarchy"
    - "mesh-gradient color field"
    - "motion blur streaks on the diagonal"
    - "orbital UI elements around the hero card"
  BAD (forbidden):
    - "creator at desk"
    - "ultrawide monitor"
    - "office environment"
    - "realistic photograph"

- motion: structured motion recipe (see MOTION DIRECTION block below).

- atmosphere: in motion_design, this describes the GRAPHIC ENVIRONMENT — gradient backdrop, glow, particles, layered color fields. Example: "deep navy-to-violet gradient backdrop with soft volumetric glow behind the central card and a subtle particle field". NEVER the word "atmosphere" inside the string. NEVER realistic-scene language.

- uiMotion: leave empty string. The video prompt is now driven from motion.primary/secondary/ambient.

- lightingMotion: leave empty string. Glow/gradient motion goes into motion.ambient.

──────────────────────────────────────────────────────
MOTION DIRECTION (motion field — drives the video prompt)
──────────────────────────────────────────────────────

You direct the motion as a motion designer, not a copywriter. The motion field describes ONLY PHYSICAL MOVEMENT. No story meaning. No UI semantics. No "show burnout". No vibes. No brand feelings. The downstream model is Kling 2.1 Master, a video diffusion model that ONLY understands physical action — it cannot render "premium feel", "elegant flow", "consistent appearance", or "brand aesthetic". Those phrases are wasted tokens that drown out real visual signal.

═══ THE OBJECT RULE ═══
Every {object} field must be a CONCRETE NAMED THING you could photograph or point at.
A concrete object is one of:
  (a) a UI surface from this shot's workspace.surfaces (e.g. "kpi_card", "line_chart", "captions_panel"),
  (b) a piece of typography ("the headline 'Direct your launch'", "the metric label '184K Subscribers'", "the CTA button"),
  (c) a graphic element from visualAnchors ("the gradient backdrop", "the particle field", "the aurora streak", "the card-edge rim glow"),
  (d) a named brand asset from the user's product/script ("the Voroo logo", "the TubeFlow wordmark").
NEVER use abstract concepts as objects.

OBJECT — GOOD:
  "hero kpi_card", "the line_chart drawing in", "the headline 'Direct your launch'", "the Voroo logo", "background particle field", "the captions_panel on the right", "the gradient backdrop"
OBJECT — BANNED (these exact failure modes have shipped before):
  "Fashion brand aesthetic", "premium UI", "elegant layout", "brand aesthetic", "premium energy", "background flow", "kinetic typography", "atmosphere", "the vibe", "the experience", "the design".

═══ THE MOTION VERB RULE ═══
Every {motion} field must START with a physical action verb and SPECIFY direction and/or timing.
Allowed verb stems: slides, drifts, floats, expands, compresses, fades, rotates, parallaxes, pushes in, pulls back, settles, glows, pulses, ramps, draws, scales, lifts, sinks, sweeps, tilts, shifts, ticks up, ticks down, racks focus, fills, dissolves.
Every motion string MUST include either a time anchor ("over 1.2s", "across 800ms") OR a distance/direction anchor ("from left edge to center", "by 8%", "up 40px") OR both.

MOTION — GOOD:
  "slides up from below the frame to its final position over 1.2s, settling with a slight overshoot"
  "scales from 0.92 to 1.0 over 900ms while its rim glow ramps up"
  "draws progressively from left to right across 1.5s, dots ticking on as the line passes"
  "pushes in by 6% over the full 5 seconds with quartic deceleration"
MOTION — BANNED:
  "flows smoothly into an elegant layout"     ← no verb, no anchor, vibe phrase
  "maintains consistent appearance"           ← non-motion, the object is not moving
  "drifts elegantly to enhance premium feel"  ← "to enhance feel" is an intention, not an image
  "comes alive"                               ← non-image
  "feels exciting"                            ← non-image
  "moves dynamically"                         ← vague verb, no anchor

═══ THE PERSONALITY RULE ═══
motion.personality: 2–5 short PHYSICAL adjectives describing how the motion BEHAVES (weight, speed, snap), not how the brand FEELS.
GOOD: "weighty, decelerated, single-beat, held"
GOOD: "snappy on attack, slow on release"
GOOD: "restrained, deliberate, one-thing-at-a-time"
BANNED: "premium, elegant, consistent" / "innovative, modern, sleek" / "luxurious, expensive, fashion-forward" — these are brand vibes, not motion behaviors.

═══ THE DEPTH RULE ═══
motion.depthForeground / depthMidground / depthBackground — each is ONE phrase that names a CONCRETE element in that layer AND its motion.
GOOD foreground: "the foreground product card is sharp and parallaxes faster than midground"
GOOD midground: "the hero kpi_card sits in sharpest focus and scales subtly"
GOOD background: "the gradient backdrop drifts hue slowly while particles drift upward"
BANNED: "Fashion elements elegantly transition in the foreground" — abstract object, vibe verb, and you ALREADY have to put it in the foreground because it's the foreground field. Do not repeat the layer name inside the value. The engine prepends "Foreground:" / "Midground:" / "Background:" itself.

═══ THE SHOT TYPE RULE ═══
motion.shotType: ONE short sentence describing the physical shot (frame size, what's in frame).
GOOD: "Wide motion-design composition with three floating UI cards stacked diagonally."
GOOD: "Macro framing on a single hero KPI card centered in the composition."
BANNED: "Medium motion-design shot with premium brand aesthetics in focus." — "premium brand aesthetics" is not a thing in frame.

═══ THE RHYTHM & LIGHT RESPONSE RULES ═══
motion.rhythm: how time is divided. Name the beats and the pauses.
GOOD: "One beat at 0.4s (card slides in), held pause to 2.0s, second beat at 2.0s (glow ramps), held to end."
GOOD: "Continuous slow drift, no discrete beats."
BANNED: "Elegant flow with a layered premium aesthetic." — no time information.

motion.lightResponse: how a specific light/glow element reacts to a specific moving element.
GOOD: "The kpi_card's rim glow brightens from 30% to 90% as the card scales in, then settles back to 60%."
BANNED: "Subtle glow pulse on accents." — too vague, and that's already handled by the global motionSystem.glowBehavior.

═══ COUNT & EXCLUSIVITY ═══
EXACTLY 1 primary + 1 secondary + 1 ambient. No more.
Primary, secondary, ambient must be DIFFERENT objects. If primary moves the hero card, secondary should move something else (chips, chart, headline), and ambient should move the environment (particles, glow, backdrop hue).

═══ HARD BAN LIST (motion fields only) ═══
The following exact tokens are FORBIDDEN inside any motion.* string. They have shipped before and produced unusable prompts:
  "premium", "elegant", "elegantly", "consistent appearance", "brand aesthetic",
  "to enhance", "premium feel", "luxurious feel", "innovative", "next-gen",
  "AI energy", "SaaS energy", "kinetic typography", "comes alive", "feels",
  "show", "illustrate", "convey", "express", "vibe", "experience", "energy".
You may use "premium" / "elegant" / "expensive" only in motion.personality if combined with a physical descriptor — but the safer choice is the physical descriptor alone.

- styleNotes: optional one-line shot-specific design note. Default empty.

- avoidances: rarely needed; empty string.

- intent: keep using the existing intent enum — it modulates the design energy (clarity = minimal layout, momentum = diagonal energy, etc.).

──────────────────────────────────────────────────────
CONTINUITY (motion_design mode)
──────────────────────────────────────────────────────

continuity.palette: 4–6 hex colors. The film's signature palette. Dark base + 2–3 accent colors. Examples: ["#0B0E18", "#1A1F3A", "#7AA2FF", "#A78BFA", "#67E8F9"].
continuity.lensFeel: NOT a lens — describe the GRAPHIC LANGUAGE. Example: "tight bold Inter typography, glassmorphism cards, gradient mesh backdrops, subtle particle systems".
continuity.atmosphere: graphic environment language. Example: "dark layered motion-design composition with soft volumetric glow, subtle particles, mesh-gradient backdrops, glassmorphism UI cards".
continuity.uiStyle: card design system. Example: "dark glass cards with 1px white-glow borders, sharp Inter typography, soft drop shadows, accent rim glow".

continuity.motionSystem: GLOBAL MOTION PROFILE for the whole film. Recommended premium motion-design profile: { cameraInertia: "soft", motionRestraint: "high", parallaxStrength: "subtle", transitionAggressiveness: "low", depthBehavior: "cinematic_layered", glowBehavior: "subtle_pulse", motionDensity: "controlled", easingFamily: "quartic" }. Every shot's motion.* must respect this profile.
- cameraInertia: none | soft | medium.
- motionRestraint: low | medium | high (high = expensive minimal motion).
- parallaxStrength: none | subtle | pronounced.
- transitionAggressiveness: low | medium | high.
- depthBehavior: flat | cinematic_layered | extreme_layered.
- glowBehavior: static | subtle_pulse | active_pulse.
- motionDensity: sparse | controlled | dense.
- easingFamily: linear | quadratic | cubic | quartic | quintic.

──────────────────────────────────────────────────────
HARD RULES
──────────────────────────────────────────────────────

1. grounding.human.visible is ALWAYS false. Always.
2. grounding.workspace.monitorCount is ALWAYS 0. Always.
3. grounding.workspace.desk is ALWAYS false. Always.
4. ${MIN_SHOTS}–${MAX_SHOTS} shots dynamic to script complexity.
5. Never repeat composition.layout or camera.motion in consecutive shots.
6. visualAnchors must be MOTION-GRAPHICS vocabulary, never realistic-scene vocabulary. motion.* must be physical verbs only.
7. Banned marketing copy: "ai-powered", "smart automation", "next-gen", "revolutionary", "supercharge", "unleash", "synergy", "leverage", "game-changer".
8. Banned mood-paint words: "atmospheric", "atmosphere", "dreamy", "epic", "cinematic vista", "concept art", "wallpaper", "scenic", "landscape", "mountain", "horizon", "outdoor", "nature", "sunset".
9. JSON only.`;

// Anthropic structured-output rejects numerical / array-length / pattern
// constraints (minItems, maxItems, minLength, maxLength, minimum, maximum,
// pattern). Zod above and the system prompt enforce them post-parse —
// strip them from the JSON schema that goes to the API.
const ANTHROPIC_UNSUPPORTED_SCHEMA_KEYS = new Set([
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "pattern",
]);

function stripAnthropicUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripAnthropicUnsupported);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (ANTHROPIC_UNSUPPORTED_SCHEMA_KEYS.has(k)) continue;
      out[k] = stripAnthropicUnsupported(v);
    }
    return out;
  }
  return node;
}

const ANTHROPIC_STORYBOARD_SCHEMA = stripAnthropicUnsupported(
  STORYBOARD_JSON_SCHEMA,
) as Record<string, unknown>;

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTROPIC_API_KEY (or ANTHROPIC_API_KEY) must be set for the storyboard director.",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export type DirectorInput = {
  script: string;
  productDescription?: string;
  brandStyle?: string;
  filmMode?: FilmMode;
  // Per-plan scene bounds. Both default to module-level MIN_SHOTS/MAX_SHOTS
  // when omitted. Set these to the user's plan's minScenes/maxScenes
  // (from plan-features.ts) to keep Free trials short and paid plans
  // cinematic.
  minScenes?: number;
  maxScenes?: number;
};

export type DirectorResult = {
  storyboard: Storyboard;
  raw: unknown;
  repairs: number;
};

function buildUserPrompt(input: DirectorInput): string {
  const parts: string[] = [`SCRIPT:\n${input.script.trim()}`];
  if (input.productDescription?.trim()) {
    parts.push(`PRODUCT:\n${input.productDescription.trim()}`);
  }
  if (input.brandStyle?.trim()) {
    parts.push(`BRAND STYLE:\n${input.brandStyle.trim()}`);
  }
  parts.push(
    `DOMAIN VOCABULARIES:\n${Object.entries(DOMAIN_SURFACES)
      .map(([d, ss]) => `${d}: ${ss.join(", ") || "(no UI surfaces — emotional/cinematic only)"}`)
      .join("\n")}`,
  );
  parts.push(
    "Direct this film. Walk every shot through stages 1→7 in order. Grounding before style. Concrete anchors only. Output the storyboard JSON.",
  );
  return parts.join("\n\n");
}

async function callDirector(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  schema: Record<string, unknown>,
): Promise<{ raw: unknown; text: string }> {
  const response = await getClient().messages.create({
    model: DIRECTOR_MODEL,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
    max_tokens: 12000,
    // Opus 4.7 removes temperature/top_p/top_k and explicit budget_tokens.
    // Adaptive thinking + output_config.effort shape deliberation depth.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema },
    },
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("Director returned no text content");
  const text = textBlock.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const truncated = response.stop_reason === "max_tokens";
    const hint = truncated
      ? " STOP_REASON=max_tokens — bump max_tokens or lower output_config.effort."
      : ` STOP_REASON=${response.stop_reason ?? "(none)"}`;
    throw new Error(
      `Director returned non-JSON: ${(err as Error).message}.${hint} ` +
        `output_tokens=${response.usage.output_tokens} text_chars=${text.length}. ` +
        `Last 200 chars: ...${text.slice(-200)}`,
    );
  }
  return { raw: parsed, text };
}

function formatZodErrors(err: z.ZodError): string {
  return err.errors
    .slice(0, 16)
    .map((e) => `- ${e.path.join(".") || "<root>"}: ${e.message}`)
    .join("\n");
}

export async function generateStoryboard(
  input: DirectorInput,
  opts: { maxRepairs?: number } = {},
): Promise<DirectorResult> {
  const maxRepairs = opts.maxRepairs ?? 3;
  const mode: FilmMode = input.filmMode ?? DEFAULT_FILM_MODE;
  const systemPrompt =
    mode === "motion_design" ? SYSTEM_PROMPT_MOTION_DESIGN : SYSTEM_PROMPT;
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: buildUserPrompt(input) },
  ];

  // Build per-plan schemas. Both the JSON schema (sent to the model) and
  // the Zod schema (used to validate the response) get the same bounds so
  // the model's output and our validator agree.
  const minScenes = input.minScenes ?? MIN_SHOTS;
  const maxScenes = input.maxScenes ?? MAX_SHOTS;
  const jsonSchema = stripAnthropicUnsupported(
    buildStoryboardJsonSchema(minScenes, maxScenes),
  ) as Record<string, unknown>;
  const zodSchema = buildStoryboardSchema(minScenes, maxScenes);

  let lastRaw: unknown = null;
  let lastErrors = "";
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const { raw, text } = await callDirector(systemPrompt, messages, jsonSchema);
    lastRaw = raw;
    const parsed = zodSchema.safeParse(raw);
    if (parsed.success) {
      return { storyboard: parsed.data, raw, repairs: attempt };
    }
    lastErrors = formatZodErrors(parsed.error);
    if (attempt === maxRepairs) break;
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: `Your output failed schema validation. Fix every issue and return the corrected full JSON only.\n\nERRORS:\n${lastErrors}`,
    });
  }

  throw new Error(
    `Director failed schema validation after ${maxRepairs} repairs. Last errors:\n${lastErrors}`,
  );
}
