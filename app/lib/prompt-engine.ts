import type {
  CameraMotion,
  CompositionLayout,
  Continuity,
  Domain,
  FilmMode,
  Grounding,
  HumanEmotion,
  HumanPosition,
  HumanStyle,
  Intent,
  LightingSource,
  Pacing,
  ShotRecipe,
  TimeOfDay,
} from "./director";

/* ──────────────────────────────────────────────────────────────────────────
 * Architecture note
 *
 * Flux 1.1 Pro Ultra and Nano Banana have NO negative-prompt input — every
 * token in the prompt is positive conditioning. "AVOID: mountains" steers
 * the model TOWARD mountains. So the assembled image prompt:
 *   - never names forbidden concepts (no "no outdoor", no "avoid X")
 *   - leads with concrete physical objects in a 1-2 sentence environment lock
 *   - keeps the cinematic/style language to a single closing sentence
 *   - targets 80-140 words total
 *
 * Sanitizer strips any banned token that slips through (LLM-written
 * atmosphere/styleNotes/visualAnchors).
 * ────────────────────────────────────────────────────────────────────────── */

const STYLE_LOCK_SENTENCE =
  "Premium dark SaaS launch-film aesthetic with realistic UI, 35mm lens, shallow depth of field.";

// Motion-design mode — graphic style references, no photography vocabulary.
const STYLE_LOCK_MOTION_DESIGN =
  "Designed motion-graphic frame in the style of Linear, Arc Browser, Raycast, Figma Config; glassmorphism cards, gradient mesh, premium SaaS motion design.";

// Appended to every video prompt so Kling 2.1 Master is anchored on a
// premium reference set rather than generic AI-video aesthetics.
const PREMIUM_MOTION_ANCHOR =
  "Cinematic premium motion in the style of Apple keynote, Linear launch film, Stripe product reveal: refined, restrained, deliberate beats, soft cinematic motion blur, gentle parallax, subtle rim-light pulses, expensive minimal feel.";

const COMPOSITION_MOTION_DESIGN: Record<CompositionLayout, string> = {
  asymmetrical_left: "Asymmetrical left-anchored layered SaaS motion-design composition",
  asymmetrical_right: "Asymmetrical right-anchored layered SaaS motion-design composition",
  centered_hero: "Centered hero with floating SaaS motion-design composition",
  diagonal_flow: "Diagonal flow grid SaaS motion-design composition",
  layered_stack: "Layered stack SaaS motion-design composition",
  macro_ui_closeup: "Macro UI close-up SaaS motion-design composition",
  floating_cards: "Floating cards SaaS motion-design composition",
  cinematic_split: "Split-screen layered SaaS motion-design composition",
};

const DOMAIN_GRAPHIC_LABEL: Record<Domain, string> = {
  youtube_creator: "YouTube creator product",
  podcast_creator: "podcast creator product",
  ecommerce_brand: "ecommerce operator product",
  ai_workspace: "AI workspace product",
  shopify_dashboard: "Shopify operator product",
  video_editing: "video editor product",
  design_tool: "design tool product",
  developer_tool: "developer tool product",
  analytics_platform: "analytics platform product",
  no_ui_cinematic: "brand title beat",
};

/* ──────────────────────────────────────────────────────────────────────────
 * Compact dictionaries — production-designer language, not mood paint.
 * ────────────────────────────────────────────────────────────────────────── */

const DOMAIN_ENV: Record<Domain, string> = {
  youtube_creator: "YouTube creator editing room",
  podcast_creator: "podcast creator booth",
  ecommerce_brand: "ecommerce brand operator office",
  ai_workspace: "AI workspace desk",
  shopify_dashboard: "Shopify operator desk",
  video_editing: "video editing suite",
  design_tool: "designer's desk",
  developer_tool: "developer workstation",
  analytics_platform: "analytics operator desk",
  no_ui_cinematic: "dim editing room interior",
};

const TIME_SHORT: Record<TimeOfDay, string> = {
  night: "at night",
  dusk: "in the early evening",
  studio_neutral: "under controlled studio lighting",
};

const LIGHTING_SHORT: Record<LightingSource, string> = {
  monitor_glow: "Monitor glow lights the desk in cool blue",
  rim_only: "A single rim light sits behind the subject",
  softbox: "A softbox above the desk lights the scene evenly",
  desk_lamp: "A warm desk lamp casts a small pool of light",
  ring_light: "A ring light in front of the camera lights the subject area",
  ambient_room: "Soft low ambient room fill",
  neon_strip: "An LED strip on the back wall provides accent glow",
  low_key: "A single hard light source with deep falloff",
};

const HUMAN_STYLE_SHORT: Record<HumanStyle, string> = {
  silhouette: "creator silhouette",
  over_shoulder: "creator framed over the shoulder",
  hands_only: "creator's hands on the keyboard",
  creator_back: "back of the creator",
  absent: "",
};

const HUMAN_POSITION_SHORT: Record<HumanPosition, string> = {
  foreground_left: "sits in the foreground on the left, slightly blurred",
  foreground_right: "sits in the foreground on the right, slightly blurred",
  center: "sits centered in the frame",
  midground_left: "sits in the midground on the left",
  midground_right: "sits in the midground on the right",
  absent: "",
};

const EMOTION_ADJ: Record<HumanEmotion, string> = {
  burnout: "Burned-out",
  flow: "Focused",
  discovery: "Curious",
  satisfaction: "Relaxed",
  focus: "Attentive",
  absent: "",
};

const CAMERA_MOTION_PROSE: Record<CameraMotion, string> = {
  static: "camera locked, no translation, breathing-only float",
  slow_push_in: "slow push-in toward the subject",
  slow_pull_back: "slow pull-back revealing more context",
  pan_left: "smooth horizontal pan to the left",
  pan_right: "smooth horizontal pan to the right",
  tilt_up: "smooth vertical tilt upward",
  tilt_down: "smooth vertical tilt downward",
  orbit_soft: "gentle quarter-orbit around the subject",
  parallax_layers:
    "subtle parallax shift between foreground, midground, and background layers",
  rack_focus: "rack focus from a foreground object to the UI subject",
};

const PACING_PROSE: Record<Pacing, string> = {
  slow_hold: "slow, contemplative, held beats",
  steady: "steady rhythm with confident timing",
  accelerating: "building forward momentum",
  staccato: "sharp staccato beats with crisp punctuation",
};

const LAYOUT_HINT: Record<CompositionLayout, string> = {
  asymmetrical_left: "Subject anchored on the left third",
  asymmetrical_right: "Subject anchored on the right third",
  centered_hero: "Subject centered with symmetrical room",
  diagonal_flow: "Subject arranged on a diagonal axis",
  layered_stack: "UI surfaces stacked in layers",
  macro_ui_closeup: "Extreme close-up of a single UI surface",
  floating_cards: "UI cards floating in 3D space",
  cinematic_split: "Split composition with two equal-weight subjects",
};

/* ──────────────────────────────────────────────────────────────────────────
 * Surface humanization — domain shortcodes become natural noun phrases.
 * ────────────────────────────────────────────────────────────────────────── */

const SURFACE_PROSE: Record<string, string> = {
  editing_timeline: "video editing timelines",
  thumbnails_grid: "thumbnail grids",
  waveform: "audio waveforms",
  captions_panel: "captions panels",
  youtube_analytics: "YouTube analytics charts",
  upload_progress: "upload progress cards",
  creator_desk: "the creator desk surface",
  video_preview_monitor: "a video preview monitor",
  episode_grid: "a podcast episode grid",
  transcript_panel: "transcript panels",
  mic_levels: "microphone level meters",
  episode_artwork: "episode artwork panels",
  publish_queue: "a publish queue list",
  product_grid: "product grids",
  order_pipeline: "order pipeline boards",
  inventory_card: "inventory cards",
  shopify_checkout: "Shopify checkout panels",
  revenue_card: "revenue summary cards",
  customer_table: "customer tables",
  chat_panel: "chat panels with message bubbles",
  prompt_library: "a prompt library sidebar",
  model_picker: "a model picker dropdown",
  agent_card: "agent cards",
  run_history: "a run history list",
  tool_log: "a tool log panel",
  sessions_chart: "sessions charts",
  top_products: "a top products list",
  channel_breakdown: "channel breakdown charts",
  live_view_map: "a live view map",
  timeline_tracks: "editing timeline tracks",
  transition_panel: "a transition panel",
  color_wheels: "color grading wheels",
  preview_monitor: "a preview monitor",
  audio_meters: "audio meters",
  media_bin: "a media bin grid",
  canvas: "a design canvas",
  layers_panel: "a layers panel",
  color_picker: "a color picker",
  component_library: "a component library panel",
  inspector_panel: "an inspector panel",
  prototype_links: "prototype link arrows",
  code_editor: "a code editor pane",
  file_tree: "a file tree sidebar",
  terminal_pane: "a terminal pane",
  diff_view: "a diff view",
  deploy_log: "a deploy log",
  test_runner: "a test runner panel",
  funnel_chart: "funnel charts",
  cohort_table: "cohort tables",
  kpi_card: "KPI cards",
  segment_filter: "a segment filter bar",
  events_stream: "an events stream list",
  dashboard_grid: "analytics dashboard grids",
};

function humanizeSurface(token: string): string {
  return SURFACE_PROSE[token] ?? token.replace(/_/g, " ");
}

function monitorPhrase(count: number): string {
  if (count <= 0) return "A monitor";
  if (count === 1) return "An ultrawide monitor";
  if (count === 2) return "Two monitors";
  return "Three monitors";
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sanitizer — strips banned tokens before the prompt is shipped to Flux.
 * Belt-and-braces: the assembler never writes these tokens, but the LLM
 * might smuggle one through atmosphere/styleNotes/visualAnchors.
 * ────────────────────────────────────────────────────────────────────────── */

const BANNED_PROMPT_TOKENS = [
  "atmospheric", "atmosphere",
  "dreamy", "epic",
  "cinematic vista", "dramatic environment",
  "abstract stage", "minimal void",
  "concept art",
  "mountain", "mountains", "mountainous",
  "landscape", "landscapes",
  "horizon", "horizons",
  "scenic", "scenery",
  "wallpaper",
  "outdoor", "outdoors",
  "nature",
  "sunset", "sunrise",
  "forest", "forests",
  "ocean", "beach",
  "sky", "skyline",
];

function sanitizePrompt(text: string): string {
  let t = text;
  for (const w of BANNED_PROMPT_TOKENS) {
    t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), "");
  }
  t = t
    .replace(/\bno\s+,/gi, "")
    .replace(/\bno\s+\./gi, ".")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/([,;:])\s*([,;:])/g, "$1")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/[ \t]+\./g, ".")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

function isBlank(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim().toLowerCase();
  return t === "" || t === "none" || t === "n/a";
}

function joinHexList(hexes: string[]): string {
  return hexes.map((c) => (c.startsWith("#") ? c : `#${c}`)).join(", ");
}

function stripTrailing(s: string): string {
  return s.trim().replace(/[.!?]+$/, "");
}

function ensureSentence(s: string): string {
  const t = stripTrailing(s);
  if (!t) return "";
  return `${t}.`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * COMPACT image prompt assembler (target 80-140 words).
 *
 * Canonical order:
 *   A. Physical location (1 sentence)
 *   B. Concrete objects   (1 sentence)
 *   C. Human subject      (1 sentence, if visible)
 *   D. Supporting detail  (1 sentence from visualAnchors)
 *   E. Background wall    (1 short sentence)
 *   F. Lighting           (1 short sentence)
 *   G. Style lock         (1 short sentence)
 * ────────────────────────────────────────────────────────────────────────── */

export function assembleImagePrompt(
  shot: ShotRecipe,
  continuity: Continuity,
  mode: FilmMode = "motion_design",
): string {
  if (mode === "motion_design") {
    return assembleImagePromptMotionDesign(shot, continuity);
  }
  return assembleImagePromptCinematic(shot, continuity);
}

function assembleImagePromptMotionDesign(
  shot: ShotRecipe,
  continuity: Continuity,
): string {
  const g = shot.grounding;
  const parts: string[] = [];

  // A. Composition type (motion-design framing)
  parts.push(`${COMPOSITION_MOTION_DESIGN[g.composition.layout]}.`);

  // B. Floating UI cards from the locked domain vocabulary
  const surfaces = g.workspace.surfaces.map(humanizeSurface);
  if (surfaces.length > 0) {
    parts.push(`Floating UI cards: ${surfaces.join(", ")}.`);
    parts.push(
      "All UI labels, buttons, and chart axes render with crisp accurate text, real readable English words, no garbled glyphs.",
    );
  } else if (shot.domain !== "no_ui_cinematic") {
    parts.push(`Floating ${DOMAIN_GRAPHIC_LABEL[shot.domain]} UI cards composed in space.`);
  }

  // C. Motion-graphics elements from visualAnchors
  const motionElements = shot.visualAnchors
    .map((a) => stripTrailing(a))
    .filter((a) => a && !BANNED_PROMPT_TOKENS.some((t) => a.toLowerCase().includes(t)))
    .slice(0, 5);
  if (motionElements.length > 0) {
    parts.push(`Motion-graphics elements: ${motionElements.join(", ")}.`);
  }

  // D. Headline / typography hierarchy
  if (!isBlank(shot.textOverlay)) {
    parts.push(
      `Headline reads exactly "${stripTrailing(shot.textOverlay)}" in a tight bold modern sans-serif, perfectly rendered, pixel-crisp typography, sharp letterforms, accurate kerning, legible at a glance, no warping. Typography is the hero focal element.`,
    );
  }

  // E. Focal point (composition-level)
  if (!isBlank(g.composition.primaryFocus)) {
    parts.push(`Primary focal point: ${stripTrailing(g.composition.primaryFocus)}.`);
  }

  // F. Background — gradient/glow/particles, never realistic
  parts.push(
    "Background: deep dark gradient backdrop with soft volumetric glow and a subtle particle field.",
  );

  // G. Color palette
  const palette = shot.colorPalette.length > 0 ? shot.colorPalette : continuity.palette;
  parts.push(`Color palette: ${joinHexList(palette)}.`);

  // H. UI design system (continuity)
  if (!isBlank(continuity.uiStyle)) {
    parts.push(`UI cards: ${stripTrailing(continuity.uiStyle)}.`);
  }

  // I. Style lock — motion-design references, last
  parts.push(STYLE_LOCK_MOTION_DESIGN);

  // J. Per-shot design notes
  if (!isBlank(shot.styleNotes)) {
    parts.push(ensureSentence(shot.styleNotes));
  }

  return sanitizePrompt(parts.join(" "));
}

function assembleImagePromptCinematic(
  shot: ShotRecipe,
  continuity: Continuity,
): string {
  const g = shot.grounding;
  const parts: string[] = [];

  // A. Physical location — first sentence locks the environment
  const env = DOMAIN_ENV[shot.domain];
  const time = TIME_SHORT[g.environment.timeOfDay];
  parts.push(`Indoor ${env} ${time}.`);

  // B. Concrete objects — monitors + workspace surfaces, OR cinematic anchors
  if (
    shot.domain === "no_ui_cinematic" ||
    g.workspace.surfaces.length === 0
  ) {
    const anchorList = shot.visualAnchors
      .slice(0, 4)
      .map((a) => stripTrailing(a))
      .filter(Boolean)
      .join(", ");
    if (anchorList) {
      parts.push(`${anchorList}.`);
    } else {
      parts.push(`A desk with a single monitor sits centered.`);
    }
  } else {
    const surfaces = g.workspace.surfaces.map(humanizeSurface).join(", ");
    parts.push(`${monitorPhrase(g.workspace.monitorCount)} on a dark desk show ${surfaces}.`);
  }

  // C. Human subject (if present)
  if (g.human.visible && g.human.style !== "absent") {
    const emo = EMOTION_ADJ[g.human.emotion];
    const style = HUMAN_STYLE_SHORT[g.human.style];
    const pos = HUMAN_POSITION_SHORT[g.human.position];
    const leading = emo ? `${emo} ${style}` : style.charAt(0).toUpperCase() + style.slice(1);
    parts.push(`${leading} ${pos} facing the screens.`);
  }

  // D. Supporting detail — pick one short anchor not already covered by surfaces
  if (shot.domain !== "no_ui_cinematic" && shot.visualAnchors.length > 0) {
    const mentioned = new Set(g.workspace.surfaces.map((s) => s.toLowerCase()));
    const extra = shot.visualAnchors.find(
      (a) =>
        !mentioned.has(a.toLowerCase()) &&
        a.length < 80 &&
        // Reject anchors that contain banned tokens, the sanitizer will catch
        // any that slip past anyway.
        !BANNED_PROMPT_TOKENS.some((t) => a.toLowerCase().includes(t)),
    );
    if (extra) {
      parts.push(ensureSentence(extra));
    }
  }

  // E. Background wall (short, concrete)
  parts.push("Dark studio wall behind the setup.");

  // F. Lighting (one short clause from concrete fixture)
  parts.push(`${LIGHTING_SHORT[g.environment.lightingSource]}.`);

  // G. Style lock (one short sentence)
  parts.push(STYLE_LOCK_SENTENCE);

  return sanitizePrompt(parts.join(" "));
}

/* ──────────────────────────────────────────────────────────────────────────
 * Video prompt assembler — leads with motion anchors (Kling/Luma read these
 * directly), then camera, UI motion, lighting motion, depth, pacing.
 * ────────────────────────────────────────────────────────────────────────── */

// Prose snippets for the global motion system. These are short, physical
// statements appended to the right section of the direction sheet.
const CAMERA_INERTIA_PROSE: Record<string, string> = {
  none: "Camera moves immediately, no follow-through.",
  soft: "Camera carries a touch of weight, drifting briefly past each stop.",
  medium: "Camera carries clear weight, settling slowly into every stop.",
};

// Easing curves rendered as visual behavior, not curve names. Kling's text
// encoder has never seen "quartic"; it understands what stops and accelerations
// LOOK like.
const EASING_FAMILY_PROSE: Record<string, string> = {
  linear: "Constant-speed motion with no acceleration.",
  quadratic: "Gentle ease-in and ease-out at the start and end of each move.",
  cubic: "Soft deceleration into every stop.",
  quartic: "Smooth deceleration that settles weightily into each stop.",
  quintic: "Long luxurious deceleration that settles slowly into each stop.",
};

const MOTION_RESTRAINT_PROSE: Record<string, string> = {
  low: "Energetic, lots of small movements happening at once.",
  medium: "Balanced energy, one or two things moving at a time.",
  high: "Highly restrained, single deliberate movements with long held pauses.",
};

const PARALLAX_STRENGTH_PROSE: Record<string, string> = {
  none: "No parallax between layers.",
  subtle: "Subtle parallax separation between all depth layers.",
  pronounced: "Pronounced parallax separation between layers.",
};

const GLOW_BEHAVIOR_PROSE: Record<string, string> = {
  static: "Glow remains static.",
  subtle_pulse: "Subtle glow pulse on accents.",
  active_pulse: "Active glow pulse on accents.",
};

const MOTION_DENSITY_PROSE: Record<string, string> = {
  sparse: "Sparse motion density — few moving elements.",
  controlled: "Controlled motion density.",
  dense: "Dense motion density.",
};

function safeProse(map: Record<string, string>, key: string | undefined, fallback = ""): string {
  if (!key) return fallback;
  return map[key] ?? fallback;
}

/**
 * Premium-motion video prompt for Kling 2.1 Master. Renders the director's
 * shot recipe as a single flowing prose paragraph (~70–120 words), anchored
 * on premium-launch-film references. NO labeled sections, NO "No X"
 * sentences — motion artefacts go into negative_prompt where the model can
 * actually suppress them.
 */
export function assembleVideoPrompt(
  shot: ShotRecipe,
  continuity: Continuity,
  _mode: FilmMode = "motion_design",
): string {
  const dur = Math.max(1, Math.round(Number(shot.duration)));
  const m = shot.motion;
  const ms = (continuity as { motionSystem?: Record<string, string> }).motionSystem ?? {};

  const parallax = safeProse(
    PARALLAX_STRENGTH_PROSE,
    ms.parallaxStrength,
    "Subtle parallax separation between layers.",
  );
  const cameraInertia = safeProse(CAMERA_INERTIA_PROSE, ms.cameraInertia);
  const easing = safeProse(EASING_FAMILY_PROSE, ms.easingFamily);
  const glow = safeProse(GLOW_BEHAVIOR_PROSE, ms.glowBehavior);
  const restraint = safeProse(MOTION_RESTRAINT_PROSE, ms.motionRestraint);
  const density = safeProse(MOTION_DENSITY_PROSE, ms.motionDensity);

  const sentences: string[] = [];

  // 1. Subject + duration + framing — highest visual leverage first.
  sentences.push(`${dur}s ${stripTrailing(m.shotType)}.`);

  // 2. Action layers (primary / secondary / ambient) — the actual motion.
  const action = [
    `${capitalizeFirst(stripTrailing(m.primary.object))} ${stripTrailing(m.primary.motion)}`,
    `${stripTrailing(m.secondary.object)} ${stripTrailing(m.secondary.motion)}`,
    `${stripTrailing(m.ambient.object)} ${stripTrailing(m.ambient.motion)}`,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  sentences.push(`${action.join("; ")}.`);

  // 3. Camera — concrete cinematography verbs from CAMERA_MOTION_PROSE.
  const cameraBits = [
    `Camera: ${CAMERA_MOTION_PROSE[shot.grounding.camera.motion]}`,
    cameraInertia,
    easing,
  ]
    .filter(Boolean)
    .map((s) => stripTrailing(s));
  sentences.push(`${cameraBits.join(", ")}.`);

  // 4. Depth + parallax — gives Kling spatial structure to animate.
  sentences.push(
    `Foreground ${stripTrailing(m.depthForeground)}; midground ${stripTrailing(m.depthMidground)}; background ${stripTrailing(m.depthBackground)} — ${stripTrailing(parallax)}.`,
  );

  // 5. Rhythm + light response + glow behavior — the timing/feel layer.
  const feelBits = [
    ensureSentence(m.rhythm),
    ensureSentence(m.lightResponse),
    glow,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  if (feelBits.length > 0) sentences.push(feelBits.join(" "));

  // 6. Personality + restraint + density.
  const personalityBits = [
    ensureSentence(m.personality),
    restraint,
    density,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  if (personalityBits.length > 0) sentences.push(personalityBits.join(" "));

  // 7. Premium anchor — last sentence so the style reference is what
  // Kling's encoder weights most heavily.
  sentences.push(PREMIUM_MOTION_ANCHOR);

  return sanitizePrompt(sentences.join(" "));
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Negative prompt — sent to Imagen 3 (image) and Kling 2.1 Master (video),
 * both of which have a real negative_prompt input. Flux Ultra, Nano Banana,
 * and Ideogram v3 ignore it (positive-only conditioning) — runImage strips
 * it for those models, so adding tokens here is safe.
 * ────────────────────────────────────────────────────────────────────────── */

const OUTDOOR_NEGATIVES = [
  "mountains", "landscape", "forest", "ocean", "beach", "river", "lake",
  "sunset", "horizon", "sky", "clouds", "outdoor", "nature", "scenic",
  "travel photography", "wallpaper art", "concept art landscape",
];
const FINANCE_NEGATIVES = [
  "trading dashboard", "stock chart", "candlestick chart", "bloomberg terminal",
];
const UI_NEGATIVES = [
  "messy UI", "unreadable dashboard", "fake empty boxes", "distorted interface",
  "duplicated cards", "broken layout", "garbled text",
];
const HUMAN_NEGATIVES = [
  "bad hands", "extra fingers", "distorted face", "deformed limbs", "uncanny",
];
const STYLE_NEGATIVES = [
  "cartoon", "anime", "illustration", "low quality", "stock photo",
  "lifestyle photography", "generic corporate", "watermark", "signature",
];

const MOTION_DESIGN_PHOTO_NEGATIVES = [
  "photograph", "photoreal", "realistic photo", "real person", "real human",
  "office interior", "monitor", "desk", "keyboard", "depth of field photo",
  "creator at desk", "person at computer", "selfie",
];

// Motion artefacts to suppress in Kling. The previous design pushed "No X"
// sentences into the positive prompt, which positively conditioned Kling on
// the very tokens (jitter, glitch, cartoon, ...) we wanted to avoid. They
// belong here as bare tokens in negative_prompt.
const MOTION_NEGATIVES = [
  "jitter", "wobble", "chaotic movement", "whip pan", "glitch",
  "random morphing", "excessive camera movement", "cartoon animation",
  "warped geometry", "rubber-band motion",
];

// Typography fidelity. Critical for both Ideogram (still frame) and Kling
// (clip): the moment text warps or smears, the whole shot stops feeling
// premium.
const TEXT_DISTORTION_NEGATIVES = [
  "warped text", "blurry text", "distorted text", "illegible UI",
  "garbled glyphs", "smudged letters", "misspelled words",
  "duplicated text", "deformed typography",
];

export function assembleNegativePrompt(
  shot: ShotRecipe,
  mode: FilmMode = "motion_design",
): string {
  const blocks: string[] = [OUTDOOR_NEGATIVES.join(", ")];
  if (shot.domain !== "analytics_platform" && shot.domain !== "shopify_dashboard") {
    blocks.push(FINANCE_NEGATIVES.join(", "));
  }
  blocks.push(STYLE_NEGATIVES.join(", "));
  if (mode === "motion_design") {
    blocks.push(MOTION_DESIGN_PHOTO_NEGATIVES.join(", "));
  } else {
    if (shot.grounding.workspace.surfaces.length > 0) {
      blocks.push(UI_NEGATIVES.join(", "));
    }
    if (shot.grounding.human.visible) {
      blocks.push(HUMAN_NEGATIVES.join(", "));
    }
  }
  blocks.push(MOTION_NEGATIVES.join(", "));
  blocks.push(TEXT_DISTORTION_NEGATIVES.join(", "));
  if (!isBlank(shot.avoidances)) {
    blocks.push(shot.avoidances.trim());
  }
  return blocks.join(", ");
}

export type AssembledPrompts = {
  imagePrompt: string;
  videoPrompt: string;
  negativePrompt: string;
};

export function assembleShotPrompts(
  shot: ShotRecipe,
  continuity: Continuity,
  mode: FilmMode = "motion_design",
): AssembledPrompts {
  return {
    imagePrompt: assembleImagePrompt(shot, continuity, mode),
    videoPrompt: assembleVideoPrompt(shot, continuity, mode),
    negativePrompt: assembleNegativePrompt(shot, mode),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Retry-time prompt builder. When validation fails, we rebuild the image
 * prompt with stronger positive cues at the very front. We only add MORE
 * indoor/photograph language — never reference what to avoid.
 * ────────────────────────────────────────────────────────────────────────── */

export function reinforceImagePrompt(prompt: string): string {
  const prefix =
    "Real photograph of an indoor editing workspace. Realistic monitors and desk. ";
  // Avoid double prefixing if called repeatedly.
  if (prompt.startsWith(prefix)) return prompt;
  return sanitizePrompt(`${prefix}${prompt}`);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Lint.
 * ────────────────────────────────────────────────────────────────────────── */

const FORBIDDEN_ANCHOR_TOKENS = [
  "mountain", "forest", "ocean", "sunset", "sunrise", "beach", "landscape",
  "wallpaper", "lifestyle", "scenic", "vista", "horizon", "field", "river",
  "lake", "desert", "valley", "cinematic ui", "premium dashboard",
  "complex dashboard", "abstract interface", "futuristic technology",
  "atmospheric", "abstract stage", "minimal void", "concept art",
];

const BANNED_COPY = [
  "ai-powered", "ai workspace", "smart automation", "next-gen",
  "revolutionary", "supercharge", "unleash", "synergy", "leverage",
  "game-changer",
];

const BANNED_MOOD_WORDS = [
  "atmospheric", "atmosphere", "dreamy", "epic", "cinematic vista",
  "dramatic environment", "abstract stage", "minimal void", "concept art",
];

export function lintShotRecipe(shot: ShotRecipe, shotIndex: number): string[] {
  const warnings: string[] = [];

  for (const a of shot.visualAnchors) {
    const lower = a.toLowerCase();
    for (const t of FORBIDDEN_ANCHOR_TOKENS) {
      if (lower.includes(t)) {
        warnings.push(`shot[${shotIndex}].visualAnchors contains "${t}" → "${a}"`);
      }
    }
  }

  const allText = [
    shot.shotGoal,
    shot.atmosphere,
    shot.lightingMotion,
    shot.uiMotion,
    shot.textOverlay,
    shot.styleNotes,
    shot.grounding.composition.primaryFocus,
    shot.grounding.composition.secondaryFocus,
    ...shot.visualAnchors,
  ]
    .join(" ")
    .toLowerCase();

  for (const phrase of BANNED_COPY) {
    if (allText.includes(phrase)) {
      warnings.push(`shot[${shotIndex}] uses banned marketing copy "${phrase}"`);
    }
  }
  for (const phrase of BANNED_MOOD_WORDS) {
    if (allText.includes(phrase)) {
      warnings.push(`shot[${shotIndex}] uses banned mood word "${phrase}"`);
    }
  }

  const motionTargets = [
    shot.motion.primary.object,
    shot.motion.secondary.object,
    shot.motion.ambient.object,
  ]
    .join(" ")
    .toLowerCase();
  const knownReferents = [
    ...shot.grounding.workspace.surfaces.map((s) => s.toLowerCase()),
    "card", "graph", "chart", "timeline", "panel", "headline",
    "particles", "gradient", "glow", "backdrop", "monitor", "light",
  ].filter(Boolean);
  if (!knownReferents.some((k) => motionTargets.includes(k))) {
    warnings.push(
      `shot[${shotIndex}].motion.* don't reference any concrete objects (card/chart/headline/particles/etc.)`,
    );
  }

  // Ban abstract motion vocabulary in the motion recipe
  const allMotionText = [
    shot.motion.shotType,
    shot.motion.primary.motion,
    shot.motion.secondary.motion,
    shot.motion.ambient.motion,
    shot.motion.personality,
  ]
    .join(" ")
    .toLowerCase();
  const BANNED_MOTION_WORDS = [
    "kinetic typography", "premium motion", "cinematic feeling", "futuristic vibe",
    "innovative momentum", "ai energy", "saas energy", "show burnout",
    "illustrate", "convey", "express",
  ];
  for (const w of BANNED_MOTION_WORDS) {
    if (allMotionText.includes(w)) {
      warnings.push(`shot[${shotIndex}].motion contains abstract phrase "${w}"`);
    }
  }

  return warnings;
}

export function lintStoryboard(shots: ShotRecipe[]): { warnings: string[] } {
  const warnings: string[] = [];
  shots.forEach((s, i) => warnings.push(...lintShotRecipe(s, i)));

  for (let i = 1; i < shots.length; i++) {
    if (shots[i]!.grounding.composition.layout === shots[i - 1]!.grounding.composition.layout) {
      warnings.push(`shot[${i}] repeats composition.layout from shot[${i - 1}]`);
    }
    if (shots[i]!.grounding.camera.motion === shots[i - 1]!.grounding.camera.motion) {
      warnings.push(`shot[${i}] repeats camera.motion from shot[${i - 1}]`);
    }
  }

  const uiShots = shots.filter(
    (s) => s.grounding.workspace.surfaces.length > 0,
  ).length;
  if (uiShots < Math.ceil(shots.length * 0.5)) {
    warnings.push(
      `Only ${uiShots}/${shots.length} shots have UI surfaces; SaaS films should be ≥50%`,
    );
  }

  return { warnings };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Derivers used by jobs.ts to populate flat columns from the staged recipe.
 * ────────────────────────────────────────────────────────────────────────── */

export function deriveUiDensity(shot: ShotRecipe): "none" | "low" | "medium" | "high" {
  const n = shot.grounding.workspace.surfaces.length;
  if (n === 0) return "none";
  if (n <= 2) return "low";
  if (n <= 4) return "medium";
  return "high";
}

export function deriveLightingTag(shot: ShotRecipe): string {
  return shot.grounding.environment.lightingSource;
}

export function deriveDepthCue(shot: ShotRecipe): string {
  const cues: string[] = [];
  if (shot.grounding.human.visible) {
    cues.push(
      `${HUMAN_STYLE_SHORT[shot.grounding.human.style]} ${HUMAN_POSITION_SHORT[shot.grounding.human.position]}`,
    );
  }
  if (
    shot.grounding.composition.layout === "layered_stack" ||
    shot.grounding.composition.layout === "floating_cards"
  ) {
    cues.push("layered UI cards in parallax");
  }
  if (cues.length === 0) {
    cues.push("desk surface in foreground separates the camera from the monitor");
  }
  return cues.join("; ");
}

export function deriveShotType(shot: ShotRecipe): string {
  return shot.intent;
}

export function deriveSubject(shot: ShotRecipe): string {
  if (shot.domain === "no_ui_cinematic") {
    return `${DOMAIN_ENV[shot.domain]} cinematic beat`;
  }
  const surfaces = shot.grounding.workspace.surfaces.map(humanizeSurface);
  if (surfaces.length === 0) {
    return `${DOMAIN_ENV[shot.domain]} workstation`;
  }
  return `${monitorPhrase(shot.grounding.workspace.monitorCount)} showing ${surfaces.slice(0, 2).join(" and ")}`;
}

export function deriveUiDescription(shot: ShotRecipe): string {
  const ws = shot.grounding.workspace;
  if (ws.surfaces.length === 0) return "none";
  return `${monitorPhrase(ws.monitorCount)}; ${ws.surfaces.map(humanizeSurface).join(", ")}`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers to count prompt length (used by jobs.ts for telemetry/logging).
 * ────────────────────────────────────────────────────────────────────────── */

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Re-exports for consumers.
 * ────────────────────────────────────────────────────────────────────────── */

export type {
  Continuity,
  Grounding,
  MotionAnchor,
  ShotRecipe,
} from "./director";
