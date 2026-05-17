// Raw-LLM director: script → storyboard JSON → ONE FilmFills JSON → ONE
// composition HTML. Template-first single-composition pipeline. No per-scene
// HTML generation; no ffmpeg stitch.
//
// Uses Anthropic Claude Opus 4.7 via @anthropic-ai/sdk. Key notes:
//   • Opus 4.7 removes `temperature` / `top_p` / `top_k` (400 if sent) and
//     removes manual `budget_tokens` thinking. We use adaptive thinking
//     and `output_config.effort` to control depth instead.
//   • Two LLM calls per job: generateStoryboard (script analysis + identity
//     + scene breakdown) and generateFilmHTML (one FilmFills JSON → merged
//     into a fixed skeleton). Both system prompts are cached via
//     `cache_control: ephemeral` — generateFilmHTML's cache benefits the
//     lint-retry loop within a single call.
//   • Structured output via `output_config.format` (json_schema). Anthropic's
//     schema layer rejects numerical / array length constraints — `minItems`
//     / `maxItems` are stripped from the schemas and enforced in TS via
//     normalization where it matters.
//   • The HTML shell is owned by buildFilmSkeleton — root attrs, GSAP wiring,
//     window.__timelines registration, autoAlpha scene visibility, and the
//     timeline-length anchor are merger-authored. The LLM fills semantic
//     slots only (CSS variables, scene content, per-scene CSS, per-scene
//     GSAP timelines, transition choices). This eliminates the structural
//     lint errors the per-scene pipeline kept hitting.

import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MODEL = "claude-opus-4-7";
// Sonnet 4.6 is used for the v2 vision-critique stages (per-scene + film-
// level). Critique is judgmental + structured, not generative — Sonnet is
// fast here and we reserve Opus 4.7 wall-time for the creative passes
// (storyboard, blueprint, scene fills, refinement).
const SONNET_MODEL = "claude-sonnet-4-6";

/**
 * Parse a JSON response from an Anthropic structured-output call. Wraps the
 * native JSON.parse error with the call-site name + stop_reason +
 * output_tokens so a truncated response (max_tokens hit) is immediately
 * diagnosable from the thrown error — no need to dig through dev-server logs.
 */
function parseJsonResponseOrThrow<T>(
  text: string,
  callName: string,
  stopReason: string | null | undefined,
  outputTokens: number,
): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const truncated = stopReason === "max_tokens";
    const hint = truncated
      ? ` STOP_REASON=max_tokens — response was truncated. Bump max_tokens on the ${callName} call or lower output_config.effort.`
      : ` STOP_REASON=${stopReason ?? "(none)"} — JSON looks corrupted (unescaped char or schema violation).`;
    throw new Error(
      `${callName}: JSON parse failed: ${msg}.${hint} ` +
        `output_tokens=${outputTokens} text_chars=${text.length}. ` +
        `Last 200 chars: ...${text.slice(-200)}`,
    );
  }
}

// ─── HyperFrames composition spec.
// Sources:
//   • `npx hyperframes docs` (data-attributes, gsap, compositions, troubleshooting)
//   • https://hyperframes.heygen.com/guides/prompting
//   • https://hyperframes.heygen.com/concepts/data-attributes.md
//   • Internal hf-example/ (master timeline pattern)
const HYPERFRAMES_SPEC = `
HyperFrames composition format — HARD RULES. Every rule below breaks the render if violated.

═══ STRUCTURE ═══

1. <html data-composition-variables='[]'>  (optional; declare composition variables here if used)

2. ROOT ELEMENT — every scene has ONE root div:
   <div
     id="root"
     data-composition-id="<scene-id>"     ← matches window.__timelines key
     data-width="1920"
     data-height="1080"
     data-start="0"                         ← REQUIRED. Without this the runtime
     data-duration="<scene-seconds>"        ← never begins playback (black frame).
   >

3. TIMED ELEMENTS — every animated / appearing element MUST have:
   - id="<stable-kebab-id>"          (e.g. id="hero-title", id="kicker", id="accent-bar")
   - class="clip"                    (visibility lifecycle — without this a <div>/<img>/
                                      text element either never appears or never hides)
   - data-start="<seconds>"          (absolute seconds on the scene timeline)
   - data-duration="<seconds>"       (how long the element is on screen)
   - data-track-index="<integer>"    (z-order AND collision lane — see rule 4)

   EXCEPTIONS — these elements do NOT get class="clip" (framework manages them directly
   via data-start / data-media-start / data-volume):
     <video>  — never add class="clip" to a <video>. Wrap it in a <div class="clip" ...>
                if you want to animate its position/size; animate the wrapper, not the
                <video> element itself.
     <audio>  — no class="clip"; uses data-start, data-media-start, data-volume.
   <img> elements DO require class="clip" and data-duration.

   Do NOT call video.play() / video.pause() / set audio.currentTime in your script —
   the runtime owns media playback. GSAP only animates visual properties.

4. NO OVERLAPPING CLIPS ON THE SAME TRACK.
   If element A spans [0, 5] and element B spans [2.5, 7] they MUST be on different
   data-track-index values. Same-track overlap is a HARD lint error and breaks rendering.

5. Z-INDEX MUST BE EXPLICIT — DATA-TRACK-INDEX ALONE DOES NOT STACK.
   data-track-index is for clip-collision lanes. It does NOT control CSS stacking.
   Without explicit z-index, position:absolute elements stack by DOM order — which is
   why images keep covering headlines. Every clip MUST set z-index in its CSS, and
   z-index MUST match this canonical layer map:

   Layer        z-index   data-track-index   What lives here
   ───────────────────────────────────────────────────────────────────────────────
   BACKGROUND     0           0              #bg-field, hero image, video, full-bleed gradient
   AMBIENT        1           1              floating particles, grid dots, glow halos, blurred orbs
   ACCENT         2           2              vertical bars, growing horizontal bars, arc rings
   MOCKUP         3           3              phone/browser frames, KPI cards, app cards
   KICKER         4           4              eyebrow / kicker text, badges, timestamps
   HEADLINE       5           5              the main hero text — ALWAYS on top of images
   SUPPORT        6           6              support paragraph, CTA pill, hashtag, byline
   OVERLAY        7           7              flash panel, vignette, glitch overlay (transient)

   Apply via:  <h1 id="hero" class="clip" data-track-index="5" style="z-index:5; ..."> or
   in CSS:     #hero { z-index: 5; }
   If a HERO image (track 0) sits on top of HEADLINE (track 5), the headline IS NOT VISIBLE.
   Headlines and text ALWAYS go on z-index ≥ 4. Images and backgrounds ALWAYS go on z-index ≤ 1.

6. ROOT IS NOT A CLIP. The root div has data-start/data-duration but NO class="clip".

7. COMPOSITION ZONES (use these to prevent overlap):
   The 1920×1080 canvas divides into a 12-column × 6-row grid (160px × 180px per cell).
   Use position: absolute with explicit pixel coordinates, and reserve zones per element:
   - Text headline:     columns 1–8 (160–1440px wide), rows 2–4 (top: 360–720px)
   - Right-side asset:  columns 8–12 (1280–1920px), full height
   - Bottom support:    columns 1–10, rows 5–6 (top ≥ 800px)
   - Top kicker:        columns 1–6, row 1 (top: 80–180px)
   Two elements MUST NOT occupy the same zone unless one is a backdrop on a lower z-index.

═══ ANIMATION (GSAP) ═══

8. Include GSAP:
   <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>

9. ONE paused timeline, registered synchronously, key MUST equal data-composition-id:
     const tl = gsap.timeline({ paused: true });
     window.__timelines = window.__timelines || {};
     window.__timelines["<scene-id>"] = tl;     // ← MUST match data-composition-id exactly
     if (document.readyState === "loading") {
       document.addEventListener("DOMContentLoaded", () => tl.play());
     } else { tl.play(); }

   No async/await, no fetch(), no setTimeout before tl is registered.
   Use tl.to() / tl.from() / tl.fromTo() / tl.set(). Position parameter (3rd arg) is
   ABSOLUTE seconds: tl.to("#hero", { opacity: 1 }, 0.5).

10. TIMELINE LENGTH MUST EQUAL SCENE DURATION.
    The timeline's total length is determined by the LAST tween's end time, NOT by the
    root's data-duration. If the last animation ends at 4.2s but the scene is 5s, the
    last 0.8s renders as a static final frame OR cuts off entirely.

    Always anchor the timeline length explicitly as the LAST line before registration:
      tl.set({}, {}, <sceneDuration>);
    A zero-duration empty tween at sceneDuration forces the timeline to extend to that
    point. This is non-negotiable for scenes with held tails or hard-kill exits before
    the end.

11. HARD-KILL EXIT RULE.
    For every fade-out (".to(el, { opacity: 0 }, exitTime)"), append a hard kill right
    after at the SAME timestamp so non-linear seeking can't leave a stale visible frame:
      tl.set("#hero-title", { opacity: 0 }, exitTime);
    Without this the renderer can land mid-fade and capture leaked state.

12. NO INFINITE TIMELINES OR LOOPS.
    HyperFrames requires FINITE timelines. NEVER use { repeat: -1, yoyo: true } or any
    infinite repeat. If you need a "breathing" effect, bound it to the scene duration:
      // WRONG: tl.to("#orb", { scale: 1.05, repeat: -1, yoyo: true, ease: "sine.inOut" }, 0)
      // RIGHT: tl.to("#orb", { scale: 1.05, duration: <sceneDuration>, ease: "sine.inOut" }, 0)
    Or use a finite count: { repeat: 3, yoyo: true } — but only if the total ≤ scene duration.

13. SUPPORTED ANIMATABLE PROPERTIES (use ONLY these — others won't capture):
    opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility,
    color, backgroundColor. CSS filter/blur/drop-shadow may be animated via an opacity
    proxy on a duplicate element — don't tween filter strings directly.

    Do NOT animate width/height/top/left directly on <video> elements (this halts frame
    rendering). Wrap the video in a <div class="clip" ...>; animate the wrapper.

14. EASING VOCABULARY:
    Entrances: power3.out (snappy), expo.out (cinematic), back.out(1.4) (bouncy)
    Exits:     power2.in, expo.in
    Scene-long breath: sine.inOut with duration = sceneDuration, NOT repeat:-1
    Stagger across elements: tl.to(".word", { opacity: 1, y: 0, stagger: 0.06 }, t0)
    Avoid: linear (lifeless), bounce.out (cartoonish on text)

15. DETERMINISM. No Math.random, no Date.now, no fetch, no document.querySelector inside
    a tween onUpdate that depends on layout time. Animations are pure functions of time.
    If you need pseudo-randomness, use a seeded PRNG.

16. PERFORMANCE GUARDRAILS:
    - Stack at most 2 backdrop-filter: blur() layers. Keep blur radii under 64px.
      Heavy blur stacks drop preview to ~5fps and slow capture.
    - If you use an Unsplash hero image, cap its rendered size at ~2× canvas (3840×2160
      max). Don't reference 7000px source images.
    - No more than 40 simultaneous animated SVG/div nodes per scene.

═══ FONTS (RESTRICTED LIST) ═══

17. Use ONLY these font-family names — others trigger "no deterministic font mapping":
    Inter · Montserrat · Open Sans · Roboto · Lato · Nunito · Outfit · Poppins ·
    Playfair Display · EB Garamond · Oswald · League Gothic · IBM Plex Mono ·
    JetBrains Mono · Source Code Pro · Space Mono · Archivo Black · Noto Sans JP.
    Do NOT use Tahoma, Verdana, Geneva, Helvetica Neue, Arial Black, Futura, Segoe UI,
    Helvetica, Arial, or any system font.

═══ VISUAL CRAFT (THIS IS WHERE "WOW" LIVES) ═══

18. CINEMATIC TYPOGRAPHIC SCALE — never smaller than 48px. Defaults to use:
    Kicker / eyebrow:   font-size 22–32px, uppercase, letter-spacing 0.18em, accent color
    Headline (1 line):  font-size 140–220px, line-height 0.95, font-weight 700–900
    Headline (2 lines): font-size 110–160px, line-height 0.98
    Body / supporting:  font-size 32–48px, line-height 1.35, color: rgba(255,255,255,0.7)
    Caption / numeric:  font-size 56–96px, monospace, often colored

19. LAYERED SCENE. Every scene should have at least 4 layers (track indices), each on
    its own data-track-index AND z-index per rule 5:
    track 0 — background field (radial gradient, mesh blur, grid, glow) / hero image
    track 1 — ambient (floating particles, glow halos, grid dots)
    track 2 — accent geometry (vertical bar, large circle, asymmetric shape)
    track 3 — mockup or accent block
    track 4 — kicker / eyebrow text
    track 5 — main headline
    track 6 — supporting line / CTA
    Black on black with white text is NOT enough. Use color.

20. ENTRANCE PATTERNS (rotate across scenes, do not reuse the same one twice in a film):
    a) Stagger word reveal:   each word/letter in a wrapper, stagger opacity+y, 0.04–0.08s
    b) Mask wipe:             clip-path inset from 100% → 0% (animate via scaleX on a mask)
    c) Counter-rise:          bg shape rises from below while text drops from above
    d) Slow zoom-in:          scale 1.08 → 1.00 over the full scene (sense of breath)
    e) Hard cut + flash:      tl.set then 80–120ms opacity flash from a white panel
    f) Rotational settle:     rotation 6deg → 0 with back.out(1.2) on a kicker

21. STAGE MOTION (camera substitute). Add subtle, scene-long motion to the root
    container OR a #stage div: scale 1.00 → 1.04 OR x: 0 → -40 over the whole duration
    with sine.inOut (FINITE duration, not repeat:-1). This is what makes still scenes
    feel cinematic.

22. AVOID THESE FAILURE MODES:
    - Pure black background with one centered headline (lifeless)
    - 60px font (looks like a screenshot)
    - All elements share data-track-index=0 with overlapping times (HARD ERROR)
    - Fade-out without a tl.set hard kill (seek leaks)
    - Math.random anywhere (jitter on every render)
    - Three lines of same-color text stacked — without color hierarchy it reads as paragraph
    - { repeat: -1, yoyo: true } anywhere (infinite timelines forbidden, see rule 12)

═══ FILE ═══

23. Single self-contained index.html. Inline <style> in <head>, inline <script> at end
    of <body>. No external CSS, no React/Vue, no build step, no Tailwind.
    1920×1080 canvas. The timeline's total length MUST equal data-duration on the root —
    anchor it with tl.set({}, {}, sceneDuration) per rule 10.

═══ COOL VISUAL ELEMENTS LIBRARY ═══

24. ANIMATED SHAPES (SVG or div, on their own track-index AND z-index). Always pick at
    least one that fits the scene's emotional register — all finite (no infinite loops):
    - ORBITING DOTS: 3 small circles arranged on a ring; the ring rotates 0 → 360deg
      across the FULL scene duration via:
        tl.to("#ring", { rotation: 360, duration: <sceneDuration>, ease: "none" }, 0)
    - GROWING BAR: a thin div (4–8px tall, 240–640px wide) growing left→right via scaleX
      with transform-origin: left center, expo.out, 0.8–1.2s
    - ARC SWEEP: SVG circle stroke-dasharray animated from a known length to 0 to draw a
      circular reveal (set strokeDasharray=circumference, animate strokeDashoffset)
    - GLOWING RING: a 200–400px circle with border + radial-gradient halo. Bounded
      breathing — use a single bounded tween with finite repeat, total time ≤ sceneDuration:
        tl.to("#ring", { scale: 1.06, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: 2 }, 0)
    - VERTICAL TICKER MARQUEE: a stack of words/labels translated up continuously via a
      single y tween over the scene duration — useful for finance/data scripts
    - GRID DOTS: an absolutely-positioned 16×9 dot grid behind everything for techno look
    - FLOATING PARTICLES: 6–12 small circles at fixed positions. Each gets a single
      bounded x or y tween (NOT repeat:-1):
        tl.to("#p1", { y: 24, duration: <sceneDuration>, ease: "sine.inOut", yoyo: true, repeat: 0 }, 0)

25. UI MOCKUPS (HTML/CSS only — never screenshot embeds, build everything inline):
    - PHONE FRAME: outer <div class="clip"> 360×740, border-radius 48px, padding 12px,
      inner div is the "screen" with the app UI built from divs. Tilt slightly with
      rotation:-6 and add a soft drop shadow. z-index 3.
    - BROWSER FRAME: outer div with a 36px top bar (3 colored dots + URL pill), 1500×900,
      border-radius 14px. Inner content area renders a dashboard, table, hero, etc. z-index 3.
    - APP CARD: 480×600 rounded card with avatar circle, headline, body, and a CTA button.
    - DATA CARDS: 320×180 KPI cards with a label, a giant number (monoFont), a delta arrow.
      Stagger 3–4 of them in. z-index 3.

26. PUBLIC IMAGES — when assetPolicy uses images:
    - Unsplash by keyword (DETERMINISTIC, hotlink-safe):
        https://source.unsplash.com/1920x1080/?<keyword>
        e.g. https://source.unsplash.com/1920x1080/?coffee,beans
      Use as <img class="clip" data-duration="..." data-track-index="0"> with z-index: 0.
    - Picsum placeholders (DETERMINISTIC via seed):
        https://picsum.photos/seed/<seedword>/1920/1080
    - Placehold for solid mockup screens:
        https://placehold.co/1080x1920/0A0A0A/ffffff?text=APP
    - <img> elements REQUIRE class="clip" + data-duration + data-track-index.
    - Cap source dimensions at ~2× canvas (3840×2160 max). Don't request 7000px images.
    - Animate via opacity, scale, mask — NOT via background-position.
    - ALWAYS dim the image with a top-layer overlay div on z-index 1 so headlines
      (z-index ≥ 4) stay readable:
        <div id="img-overlay" class="clip" data-start="0" data-duration="<scene>"
             data-track-index="1" style="z-index:1; position:absolute; inset:0;
             background: linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.85));"></div>

27. DATA / METRICS BEATS:
    - Build the number as monoFont, 200–360px, color-accented.
    - Pre-write the final number; animate opacity / y / scale entrance only.
    - Pair the number with a tiny supporting bar chart of 3–5 vertical bars, scaleY
      animating from 0 to 1 with stagger.

28. BRAND / PRODUCT NAME BEATS:
    - Put the brand name on its own track in the dominant accent color, at 180–260px.
    - Apply a subtle radial glow behind it (filter: blur(40px) on a duplicate sat behind).
    - Optional: add a shimmer sweep (gradient mask animating x: -100% → 200% with stagger).
`.trim();

// (Per-scene HYPERFRAMES_REFERENCE deleted in the single-composition refactor.
// Structure is now provided by buildFilmSkeleton — the LLM only fills semantic
// slots, never the HTML shell, so a literal reference is no longer needed.)

// ─── Storyboard (call 1) ──────────────────────────────────────────────────

export type StoryboardScene = {
  id: string;
  copy: string;
  durationSeconds: number;
  /** One of the SCENE_CONCEPTS — what kind of scene this is, visually. */
  sceneConcept: string;
  /** One of the MOTION_HOOKS — the dominant motion idea for this scene. */
  motionHook: string;
  /**
   * The scene's pacing role in the film. Bound to duration band but also
   * encodes emotional weight: a "hold" scene is a deliberate climax/breath
   * regardless of exact seconds; a "punch" is a fast, energetic impact. The
   * blueprint stage reads this when planning the FilmRhythm energy wave.
   */
  pacingIntent: PacingIntent;
};

export const PACING_INTENTS = ["punch", "beat", "cinematic", "hold"] as const;
export type PacingIntent = (typeof PACING_INTENTS)[number];

/** Heuristic default for pacingIntent when the model didn't supply one. */
function defaultPacingIntentForDuration(durationSeconds: number): PacingIntent {
  if (durationSeconds < 2.5) return "punch";
  if (durationSeconds < 4.5) return "beat";
  if (durationSeconds < 7) return "cinematic";
  return "hold";
}

const SCENE_CONCEPTS = [
  "massive_typography_takeover",
  "ui_object_exploding_into_parts",
  "floating_dashboard_in_depth",
  "split_screen_before_after",
  "kinetic_word_wall",
  "orbiting_product_system",
  "data_cards_flying_into_formation",
  "hero_image_with_editorial_overlay",
  "glowing_ring_or_arc_or_particle_system",
  "browser_frame_to_brand_reveal",
] as const;

const MOTION_HOOKS = [
  "hard_flash_cut",
  "slow_cinematic_push",
  "mask_wipe_reveal",
  "staggered_word_impact",
  "parallax_drift",
  "scale_snap",
  "rotational_settle",
  "object_assembly",
  "ui_cards_cascade",
  "final_logo_lockup",
] as const;

// One locked visual identity for the whole film. The same identity is
// passed into every per-scene call so all scenes read as chapters of one
// piece — same palette, same fonts, same motion language, same accent
// shapes. The identity must be DERIVED from the script (domain, tone,
// audience), not picked from a default.
export type VisualIdentity = {
  /** Free-text analysis the LLM does before picking the identity. Anchors derivation. */
  scriptAnalysis: string;
  /** Short descriptive name of the look (e.g. "Editorial Night", "Acid Lab"). */
  paletteName: string;
  /** Background — full CSS value, typically a linear/radial gradient. */
  background: string;
  /** 3–5 hex strings. First is the dominant accent, rest are supporting. */
  accents: string[];
  /** Color for body / supporting text (rgba allowed). */
  ink: string;
  /** Color for muted / secondary text (rgba allowed). */
  inkMuted: string;
  /** Display / headline font-family (must be from the allowlist). */
  headlineFont: string;
  /** Eyebrow / kicker / supporting font-family (must be from the allowlist). */
  bodyFont: string;
  /** Optional monospace for numbers, captions, metrics. */
  monoFont: string;
  /** "editorial" | "kinetic" | "minimal" | "techno" | "cinematic" — sets pacing/easing bias. */
  motionLanguage: string;
  /** One-line direction the LLM repeats for visual consistency. */
  signatureMove: string;
  /** What kinds of visual assets the film uses (images / mockups / shapes / particles). */
  assetPolicy: string;
  /** Optional Unsplash search keyword the LLM can use to pull a topical hero image. */
  imageKeyword: string;
  /** Detected script language code (ISO 639-1 ish: "en", "he", "ar", "fa", "ur", "ja", "zh", "ru", "es", ...). */
  language: string;
  /** Text direction. "rtl" for Hebrew/Arabic/Persian/Urdu, "ltr" for everything else. */
  textDirection: "ltr" | "rtl";
  /**
   * Optional brand logo URL. Set when the user provided a logo via the editor's
   * BRAND panel; the LLM is told to embed it in the CTA / final lockup scene.
   * Not emitted by the LLM — populated post-parse from job row.
   */
  logoUrl?: string | null;
};

/** Optional brand-hint inputs to anchor the LLM's identity choices. */
export type BrandHints = {
  /** User-supplied brand colors as hex (e.g. ["#ffda2a", "#0d0d0d"]). Override accents. */
  colors?: string[] | null;
  /** Public URL to the brand logo (PNG/JPG/SVG). Embedded in the final scene. */
  logoUrl?: string | null;
  /** Free-text brand style direction the user typed (optional). */
  brandStyle?: string | null;
};

export type Storyboard = {
  title: string;
  visualIdentity: VisualIdentity;
  scenes: StoryboardScene[];
};

const STORYBOARD_SYSTEM_PROMPT = `You are an art-director shaping ONE coherent film from a script. Two scripts about two different products MUST produce visibly different films — different colors, different typography, different motion personality, different visual assets. If your output looks like the previous job, you have failed.

You produce three things in order:

═══ STEP 1 — SCRIPT ANALYSIS (write this first) ═══

Read the script. Identify:
- LANGUAGE: ISO 639-1 code of the dominant language ("en", "he" Hebrew, "ar" Arabic, "fa" Persian, "ur" Urdu, "ja" Japanese, "zh" Chinese, "ru" Russian, "es" Spanish, "fr" French, "de" German, "pt", "it", "ko", etc.). If the script is mixed, pick the dominant one by character count.
- TEXT DIRECTION: "rtl" if language is Hebrew/Arabic/Persian/Urdu/Syriac/N'Ko; "ltr" otherwise. This drives the WHOLE film's layout — text alignment, asymmetry side, accent-bar position, stagger direction. Get it right.
- DOMAIN: ecommerce / SaaS / fintech / dev-tools / consumer-app / luxury / fashion / food / fitness / education / news / agency / hardware / AI / web3 / other
- TONE: bold-assertive / quiet-confident / playful / urgent / cinematic / clinical / warm / techno / luxe / minimal
- AUDIENCE: developers / executives / shoppers / teens / creatives / general / specific niche
- SUBJECT WORDS: 3–6 concrete nouns from the script (in the script's own language)

Put this analysis into the "scriptAnalysis" field (one short paragraph). Fill the dedicated "language" and "textDirection" fields too. EVERY downstream choice — palette, font, motion, asset policy, layout side — must follow from this analysis.

Font note for non-Latin scripts:
- Hebrew: use bodyFont "Inter" (covers Hebrew) or headlineFont "Open Sans" or "Inter"
- Arabic/Persian/Urdu: use bodyFont "Inter" or "Open Sans"
- Japanese: use "Noto Sans JP"
- Chinese: use "Inter" or "Open Sans" (limited glyph coverage; Latin-only fonts will fall back)
- Other Cyrillic / Latin extended: any of the allowlist fonts work.

═══ STEP 2 — LOCKED VISUAL IDENTITY ═══

Pick deliberately, based on STEP 1. Two scripts in two different domains MUST land in two different rows of the table below. Default-to-navy/blue is BANNED.

DOMAIN → PALETTE MENU (pick one row, then customize):
| Domain                  | Background gradient                                                                                                                                                                                                                       | Dominant accent | Supporting accents          | Headline font     | Body font    |
| ecommerce / DTC apparel | "linear-gradient(180deg, #0A0A0A 0%, #1A0F12 100%)"                                                                                                                                                                                       | #FF2E93         | #FFD700, #FFFFFF            | Archivo Black     | Inter        |
| premium / luxury        | "radial-gradient(80% 80% at 50% 30%, rgba(245,229,200,0.10) 0%, transparent 60%), linear-gradient(180deg, #0A0908 0%, #1C1815 100%)"                                                                                                       | #F5E5C8         | #C2410C, #FFFFFF            | Playfair Display  | EB Garamond  |
| SaaS / dev-tools        | "radial-gradient(60% 80% at 18% 30%, rgba(99,102,241,0.30) 0%, transparent 60%), linear-gradient(180deg, #06070D 0%, #0E1530 100%)"                                                                                                       | #6366F1         | #06B6D4, #A78BFA            | Inter             | Inter        |
| fintech                 | "linear-gradient(135deg, #002418 0%, #003D2B 100%)"                                                                                                                                                                                       | #00FFA3         | #CCFF00, #FFFFFF            | Outfit            | Inter        |
| consumer / playful      | "linear-gradient(135deg, #FF8A3D 0%, #FF4D6D 50%, #C13EE6 100%)"                                                                                                                                                                          | #FFFFFF         | #FFD700, #00E1FF            | Poppins           | Poppins      |
| AI / techno             | "radial-gradient(100% 100% at 50% 50%, rgba(255,46,147,0.15) 0%, transparent 60%), linear-gradient(180deg, #050108 0%, #160520 100%)"                                                                                                     | #FF2E93         | #00E1FF, #FFD700            | Archivo Black     | JetBrains Mono |
| editorial / news        | "linear-gradient(180deg, #F6F1E7 0%, #ECE3D0 100%)"  (LIGHT MODE — ink="#0A0A0A", inkMuted="rgba(10,10,10,0.6)")                                                                                                                          | #C2410C         | #0A0A0A, #A16207            | Playfair Display  | EB Garamond  |
| fitness / energy        | "linear-gradient(135deg, #0A0F08 0%, #1A2008 100%)"                                                                                                                                                                                       | #CCFF00         | #00FFA3, #FFFFFF            | Oswald            | Inter        |
| fashion / cinematic     | "radial-gradient(60% 100% at 50% 100%, rgba(0,0,0,0.5) 0%, transparent 60%), linear-gradient(135deg, #1A1A1A 0%, #2D1F1F 100%)"                                                                                                           | #FFFFFF         | #C2410C, #F5E5C8            | League Gothic     | Inter        |
| hardware / industrial   | "linear-gradient(180deg, #0E0E0E 0%, #1F1F1F 100%)"                                                                                                                                                                                       | #FF6B35         | #FFD23F, #FFFFFF            | Archivo Black     | Inter        |

You may also synthesize a palette OUTSIDE this menu if the script is very specific (e.g. "cherry blossom" → soft pink + white + sage; "ocean monitoring" → deep teal + amber + cream). But never pick navy+blue+purple unless the script is literally SaaS dev-tools.

motionLanguage — pick from:
- "editorial" — slow, expo.out entrances, generous holds, sine.inOut stage drift. Suits luxury, editorial, B2B.
- "kinetic" — staccato, power4.out entrances, fast cuts, snappy stagger. Suits consumer, DTC, fitness.
- "minimal" — almost-still, single primary move per scene, long quiet tails. Suits tutorial, B2B.
- "techno" — glitch-adjacent, hard-cut + 120ms flash entrances, monospace numerics. Suits AI, dev-tools, web3.
- "cinematic" — back.out(1.2) on hero, parallax stage zoom, big type. Suits hardware, fashion, premium.

signatureMove — a CONCRETE recurring visual move, specific and unique to THIS film, e.g.:
- "every scene has a circular orbit of three glowing dots in the top-right corner that rotates slowly clockwise"
- "every scene opens with a 100ms ZOOM-PUSH of the whole stage from scale 1.04 → 1.0"
- "every scene has a thin animated horizontal line that grows from left to right under the headline"
- "every scene has a corner badge with monospace timestamp/index counter, top-left, body color"
- "every scene has a 6px wide neon vertical bar in dominant accent on the left edge"
DO NOT pick the same signatureMove for two different films.

assetPolicy — declare what visual assets the film will use. Pick from:
- "type-only" — typography + geometric shapes only. Best for editorial, B2B, abstract scripts.
- "type-plus-shapes" — typography + animated SVG shapes (circles, bars, arcs, dots, particles).
- "type-plus-mockup" — typography + UI mockups (phone frame, browser card, app preview). For SaaS/consumer apps. Mockups are HTML/CSS — don't render screenshots, build them inline.
- "type-plus-hero-image" — one large photographic hero image per scene from Unsplash. For lifestyle/consumer/fashion/luxury.
- "type-plus-product" — product/photo shots framed elegantly. For ecommerce, hardware, food.

imageKeyword — if assetPolicy uses images, ONE Unsplash search keyword (1–3 words) that matches the script's subject. E.g. "linen", "neon city", "kitchen marble", "running shoes", "developer desk", "coffee beans". Empty string if type-only.

═══ STEP 3 — SCENE BREAKDOWN ═══

Split the script into 4–8 scenes. For EACH scene assign:
- id: "scene_01", "scene_02", ...
- copy: ONE beat per scene — a sentence or short phrase, never a paragraph.
- durationSeconds: 1.5–12 seconds. Pacing IS storytelling. VARY durations across the film deliberately:
    · punchy beats (1.5–2.5s) — short impacts, hard cuts, statements that land fast
    · standard beats (2.5–4.5s) — most scenes; conventional reveal + hold
    · cinematic beats (4.5–7s) — intentional scenes that need time to breathe and resolve
    · held beats (7–12s) — climax, breath after impact, or a deliberate moment of stillness
  Uniform durations across all scenes are a tell of an assembled film, not a directed one — avoid them.
- pacingIntent: one of "punch" | "beat" | "cinematic" | "hold". This is the EMOTIONAL role
  of the scene, not just its length:
    · punch     — fast, energetic; the impact moment of a beat
    · beat      — standard pacing; the workhorse rhythm of the film
    · cinematic — intentional, breathing; a scene that needs to land
    · hold      — climax or held breath; an earned moment of stillness OR the film's hardest hit
  pacingIntent SHOULD match the duration band most of the time, but they can diverge when the
  beat calls for it (e.g. a 2.5s "hold" can be a deliberate hard stop). The blueprint stage
  reads pacingIntent to plan the film's energy wave.
- sceneConcept: ONE of these — pick the visual idea that fits THIS beat. VARY across the
  film; do not repeat the same concept in two consecutive scenes. Spread the film across
  at least 4 different concepts:
    massive_typography_takeover     — single oversized word/phrase fills the screen
    ui_object_exploding_into_parts  — phone/card/icon breaks apart, then reassembles
    floating_dashboard_in_depth     — a tilted/parallaxed UI dashboard with layered cards
    split_screen_before_after       — left half = before/problem, right half = after/solution
    kinetic_word_wall               — many small words arranged in a grid, one highlights
    orbiting_product_system         — a central product orbited by rings/icons/labels
    data_cards_flying_into_formation— 3–5 KPI cards animate in and lock to a row
    hero_image_with_editorial_overlay— full-bleed photo + bold typographic overlay
    glowing_ring_or_arc_or_particle_system— a hero glowing ring/arc/particle field is the focal element
    browser_frame_to_brand_reveal   — a browser/app frame opens to reveal the brand
- motionHook: ONE of these — the DOMINANT motion idea for the scene:
    hard_flash_cut         — 100–140ms white panel covers screen, then snaps away
    slow_cinematic_push    — scale 1.06 → 1.00 over full scene with sine.inOut
    mask_wipe_reveal       — a mask sweeps left→right or top→bottom revealing content
    staggered_word_impact  — each word in headline pops in with back.out, large stagger
    parallax_drift         — front layer drifts opposite to back layer over scene length
    scale_snap             — element snaps from scale 0.85 to 1.00 with expo.out
    rotational_settle      — element rotates 8° → 0° with back.out(1.2)
    object_assembly        — multiple parts converge from offscreen to assemble the focal
    ui_cards_cascade       — cards drop in one after another with stagger
    final_logo_lockup      — late-scene reveal where brand lands in dominant accent

  Pick the hook that AMPLIFIES the sceneConcept. (e.g. ui_object_exploding_into_parts pairs
  naturally with object_assembly; massive_typography_takeover with staggered_word_impact.)

Also produce a short title.

Return strict JSON matching the schema. No commentary.`;

const STORYBOARD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "visualIdentity", "scenes"],
  properties: {
    title: { type: "string" },
    visualIdentity: {
      type: "object",
      additionalProperties: false,
      required: [
        "scriptAnalysis",
        "paletteName",
        "background",
        "accents",
        "ink",
        "inkMuted",
        "headlineFont",
        "bodyFont",
        "monoFont",
        "motionLanguage",
        "signatureMove",
        "assetPolicy",
        "imageKeyword",
        "language",
        "textDirection",
      ],
      properties: {
        scriptAnalysis: { type: "string" },
        paletteName: { type: "string" },
        background: { type: "string" },
        accents: { type: "array", items: { type: "string" } },
        ink: { type: "string" },
        inkMuted: { type: "string" },
        headlineFont: { type: "string" },
        bodyFont: { type: "string" },
        monoFont: { type: "string" },
        motionLanguage: { type: "string" },
        signatureMove: { type: "string" },
        assetPolicy: { type: "string" },
        imageKeyword: { type: "string" },
        language: { type: "string" },
        textDirection: { type: "string", enum: ["ltr", "rtl"] },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "copy", "durationSeconds", "sceneConcept", "motionHook", "pacingIntent"],
        properties: {
          id: { type: "string" },
          copy: { type: "string" },
          durationSeconds: { type: "number" },
          sceneConcept: { type: "string" },
          motionHook: { type: "string" },
          pacingIntent: { type: "string", enum: [...PACING_INTENTS] },
        },
      },
    },
  },
} as const;

// ─── Film fills (call 2) ──────────────────────────────────────────────────
//
// The LLM no longer emits raw HTML. It emits a FilmFills JSON object that
// fills semantic slots in a fixed skeleton (see buildFilmSkeleton below).
// The skeleton is lint-clean by construction; the LLM owns palette/typography
// CSS variables, per-scene content + CSS, per-scene GSAP timelines, and
// transition choices only.

const FILM_SYSTEM_PROMPT = `You are a senior motion designer art-directing ONE coherent launch video. The bar is cinematic, bold, surprising — NOT a clean HTML card stack.

═══ SEVEN CINEMATIC PRINCIPLES (non-negotiable for every scene) ═══

1. NO DEAD FRAMES, BUT RESTRAINT IS CRAFT. Almost every moment should contain motion, tension, anticipation, focus evolution, pacing progression, camera movement, typography evolution, or visual transformation. Do NOT force motion everywhere — intentional restraint (silence, slow pacing, stillness) is the most cinematic move when it earns the next beat.
2. DURATIONS ARE DYNAMIC, NEVER UNIFORM. The scene you're rendering has a specific duration for a reason — match motion density and pacing to it. Pacing IS storytelling.
3. THE FILM IS DIRECTED, NOT ASSEMBLED. Your scene must serve the whole film's rhythm, not just look good in isolation.
4. OPUS IS THE CREATIVE ENGINE. Invent cinematic ideas. Schemas exist to route data, not to box in your taste.
5. ASSETS SERVE THE BEAT. When LOCKED ASSETS are provided, embed them verbatim and build the scene around them. Don't fabricate other src= URLs.
6. MOTION QUALITY > FRAME PRETTINESS. The scene's motion across its full duration matters more than a single moment.
7. THE FILM BREATHES. Use buildup, restraint, silence, acceleration, release, impact, contrast, breathing room. The most powerful scene is often a held beat — not every scene needs to be impressive.

You produce ONE structured JSON object that fills a fixed HyperFrames skeleton.

══════════════════════════════════════════════════════════════════════════════
HOW THIS WORKS — READ THIS BEFORE ANYTHING ELSE
══════════════════════════════════════════════════════════════════════════════

Our TypeScript code holds a lint-clean HTML skeleton. The skeleton already provides:
  • <html>, <head>, <body>, <meta>, GSAP <script> include
  • <div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="<total>">
  • per scene: <section id="s1" class="scene clip" data-start="..." data-duration="..." data-track-index="0" style="visibility:hidden"><div class="scene-content">…</div></section>
  • the GSAP timeline wiring: const tl = gsap.timeline({ paused: true }); … window.__timelines["main"] = tl;
  • autoAlpha visibility set/unset for every scene (the merger writes these — you DO NOT)
  • the final tl.set({}, {}, total) timeline-length anchor

You ONLY supply the FilmFills JSON, which has these slots:

  cssVariables: OPTIONAL object whose keys are EXACTLY drawn from the fixed set
    below. The merger already writes identity-derived defaults onto :root; this
    field is an OVERRIDE channel only. Most films set it to {} or omit entries.
    Allowed keys (any subset, no others — the schema rejects unknown keys):
      "--bg", "--ink", "--ink-muted",
      "--accent-1", "--accent-2", "--accent-3",
      "--headline-font", "--body-font", "--mono-font"
    For one-off custom values (e.g. --glow-color, --grid-spacing), declare them
    inside the per-scene sceneCss string, scoped to #s<N>, instead.

  scenes: array of N entries, ONE PER STORYBOARD SCENE, in order. Each entry has:
    • id:            "s1" | "s2" | … (matches storyboard order — DO NOT renumber)
    • contentHtml:   HTML markup placed inside <div class="scene-content">.
                     This is the inner content ONLY — NO <section>, NO <html>,
                     NO <body>, NO clip attributes, NO <script>. Use semantic
                     tags (<h1>, <p>, <span>, <div>, <svg>, <img>) and give
                     stable ids/classes so your timeline can target them.
                     Refer to images via https://source.unsplash.com/1920x1080/?<keyword>
                     when the identity's assetPolicy allows hero images.
    • sceneCss:      CSS scoped to this scene. Always scope selectors under #s1,
                     #s2, etc. (e.g. "#s1 .headline { ... }"). DO NOT use html,
                     body, or :root selectors here; identity goes through CSS
                     vars only. DO NOT set position/inset on #s1 — the skeleton
                     handles that. The scene area is position:absolute inset:0
                     within the canvas; design with that frame in mind.
    • timeline:      JavaScript GSAP code targeting THIS scene's elements only.
                     Plain "tl.to(...)", "tl.from(...)", "tl.fromTo(...)", "tl.set(...)"
                     calls. Use the SCENE-LOCAL time axis: time 0 = the moment
                     this scene starts (the merger offsets it for you). Time
                     value ranges over [0, scene.durationSeconds]. DO NOT call
                     gsap.timeline(), DO NOT touch window.__timelines, DO NOT
                     emit autoAlpha for the SCENE ITSELF (the merger handles
                     #s1 autoAlpha). autoAlpha on INNER elements is fine.
    • transitionIn:  "hard_cut" for at least 80% of scenes. Use a shader transition
                     ("shader_flash", "shader_wipe", "shader_zoom") for AT MOST
                     2–3 scenes per film (hero reveal, mid-film pivot, CTA / final
                     lockup). 95% of the visual energy lives INSIDE the scene,
                     not at the cut.

  globalTimeline: OPTIONAL string. JavaScript GSAP code that runs once before
    the per-scene blocks. Use it for film-wide motifs — a slow stage zoom on
    #root over the full duration, a film-wide parallax layer, an always-on
    grain overlay. Most films don't need one.

══════════════════════════════════════════════════════════════════════════════
QUALITY BAR — non-negotiable across the whole film
══════════════════════════════════════════════════════════════════════════════

1. EVERY scene has THREE motion phases:
   • Entrance       (0 → 25% of duration)
   • Mid-scene      (25% → 80%): continuous activity — drift, breathing, secondary
                                  element animations. NO scene is static after second 1.
   • Visual payoff  (80% → 100%): a reveal, snap, lockup, number landing, brand
                                  emerging, particles converging. Reward the wait.

2. NO TWO SCENES IN THIS FILM may share the same silhouette. With all text removed,
   each scene must be distinguishable from every other by composition alone.
   Before emitting, mentally sketch all N silhouettes — left-weighted heading,
   centered orbit, full-bleed image with overlay, KPI row, split panel, kinetic word
   grid, glowing ring, etc. — and ensure each is distinct. If two are similar, pick
   a different focal element for one.

3. NO repeated layout zone, focal element, accent geometry, or motion pattern
   across two scenes.

4. 95% HARD CUTS. At most 2–3 scenes use a non-hard-cut transition. Hard cut
   transitions are FREE — they happen automatically when one scene's autoAlpha:0
   coincides with the next scene's autoAlpha:1. Visual richness lives WITHIN
   the scene, not BETWEEN scenes.

5. ≥ 4 visible layers per scene, each on its own z-index. Headlines and body
   text live on z-index ≥ 4. Background images and gradients live on z-index ≤ 1.
   See HYPERFRAMES_SPEC rule 5.

6. ONE clear focal point per scene. Asymmetric composition (rule of thirds,
   off-center hero) — NOT centered headline.

7. Premium typographic scale: headlines 140–260px, kicker 22–32px uppercase
   0.18em spacing, support 32–48px. Anything below 48px is forbidden except
   for monospace badges or timestamps.

8. Implement the identity's signatureMove in EVERY scene literally.

══════════════════════════════════════════════════════════════════════════════
IDENTITY LOCK — do not invent your own visual system
══════════════════════════════════════════════════════════════════════════════

• Use CSS variables: var(--bg), var(--ink), var(--accent-1), var(--headline-font), etc.
  The merger sets :root values from the identity; you reference them in sceneCss.
• Headlines emphasize identity.accents[0] (the dominant accent), referenced as
  var(--accent-1). Kickers/accent bars use var(--accent-2) and var(--accent-3).
• Use motionLanguage to bias eases:
    "editorial"  → expo.out entrances, long holds, sine.inOut stage drift
    "kinetic"    → power4.out, fast stagger, snap exits
    "minimal"    → one big move per scene, long quiet tails, fewer elements
    "techno"     → hard-cut + 100–140ms flash entrances, monospace numerics
    "cinematic"  → back.out(1.2) on hero, parallax stage zoom, oversized type
• Honor assetPolicy. If it allows mockups/images, USE them — do not regress to type-only.

══════════════════════════════════════════════════════════════════════════════
MAP CONCEPT → HOW TO BUILD IT (per-scene playbook)
══════════════════════════════════════════════════════════════════════════════

massive_typography_takeover     — ONE word/phrase at 280–380px fills 80% of width.
                                  Background + single accent shape, nothing else.
ui_object_exploding_into_parts  — Phone/card mockup. Parts fly out then snap back
                                  into formation by the payoff.
floating_dashboard_in_depth     — Tilted (rotation 6–12°) browser frame with 3–5 KPI
                                  cards. Subtle parallax drift on the cards.
split_screen_before_after       — Vertical divider down middle. Left = problem (muted,
                                  smaller). Right = solution (accent, larger). Divider
                                  mask-wipes.
kinetic_word_wall               — Grid of 20–40 small words (32–48px). Hero word(s)
                                  scale up + glow at payoff.
orbiting_product_system         — Central hero. Ring(s) around. Three labels orbit.
                                  Slow rotation across scene.
data_cards_flying_into_formation— 3–5 KPI cards (~320×180) fly in from offscreen,
                                  stagger 0.12s, lock to a row by 60% duration.
hero_image_with_editorial_overlay— Full-bleed Unsplash image on z-index 0, dark
                                  gradient overlay on z-index 1, headline on z-index 5.
glowing_ring_or_arc_or_particle_system — Hero element is the ring/arc/particles
                                  itself, ~600–900px diameter, glow halo, text supports.
browser_frame_to_brand_reveal   — Browser mockup. In last 20%, browser content
                                  morphs into brand name lockup.

══════════════════════════════════════════════════════════════════════════════
MAP MOTION HOOK → ENTRANCE RECIPE
══════════════════════════════════════════════════════════════════════════════

hard_flash_cut       — Inner overlay div, 100–140ms full-white opacity panel, then
                       opacity → 0 with expo.out. (Use only inside the scene, NOT
                       the scene-switch itself.)
slow_cinematic_push  — tl.fromTo(stageOrHero, { scale: 1.06 }, { scale: 1.0, duration: <full>, ease: "sine.inOut" }, 0)
mask_wipe_reveal     — clip-path inset 100% → 0% over 0.8–1.2s with expo.out.
staggered_word_impact— Each word in <span class="word"> with opacity:0, y:60.
                       tl.to("#s1 .word", { opacity:1, y:0, duration: 0.7,
                       ease: "back.out(1.4)", stagger: 0.08 }, 0.1)
parallax_drift       — Front layer drifts +40px x over scene; back layer drifts -40px.
scale_snap           — tl.fromTo("#s1 .hero", { scale: 0.85, opacity: 0 },
                       { scale: 1, opacity: 1, duration: 0.5, ease: "expo.out" }, 0)
rotational_settle    — rotation 8 → 0 with back.out(1.2) over 0.9s.
object_assembly      — Sub-divs fly in from offsets, converge with stagger 0.06–0.10s.
ui_cards_cascade     — Cards y:80, opacity:0; stagger to y:0, opacity:1.
final_logo_lockup    — Brand name at 240–360px in var(--accent-1), enters at ~75% of
                       duration with scale_snap or rotational_settle.

═══════════════════════════════════════════════════════════════════════════════
FONT ALLOWLIST GUIDANCE
═══════════════════════════════════════════════════════════════════════════════

The identity has already picked headlineFont/bodyFont/monoFont. Use them through
CSS variables — do not propose alternates. If the identity is for an LTR film and
the headlineFont fell back to Inter/Roboto/Open Sans/Poppins, that's a sign the
storyboard step should have picked something stronger — but at scene-generation
time you commit to what was decided.

Reminder of identity-allowed fonts: Inter, Montserrat, Open Sans, Roboto, Lato,
Nunito, Outfit, Poppins, Playfair Display, EB Garamond, Oswald, League Gothic,
IBM Plex Mono, JetBrains Mono, Source Code Pro, Space Mono, Archivo Black, Noto Sans JP.

${HYPERFRAMES_SPEC}

═══════════════════════════════════════════════════════════════════════════════
JSON OUTPUT CONTRACT — STRICT
═══════════════════════════════════════════════════════════════════════════════

Return ONLY the FilmFills JSON object matching the provided schema. No markdown
fences, no commentary, no explanation. The schema is enforced server-side.

Common mistakes that produce rejected output:
  ✗ Wrapping JSON in \`\`\`json fences.
  ✗ Including <html>, <head>, <body>, <section>, or clip attributes in contentHtml.
  ✗ Putting class="clip"/data-start/data-duration anywhere in JSON values.
  ✗ Calling gsap.timeline() or touching window.__timelines from a timeline field.
  ✗ Using tl.set on the scene wrapper id (#s1 etc.) for autoAlpha — merger does it.
  ✗ Cross-scene selectors — scope every CSS selector under #s<N>.
`;

// ─── Client ───────────────────────────────────────────────────────────────

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  // .env in this project spells it "ANTROPIC_API_KEY" (sic). Honour that
  // first so the director picks the key without any rename, then fall
  // back to the correctly-spelled var.
  const apiKey = process.env.ANTROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTROPIC_API_KEY (or ANTHROPIC_API_KEY) must be set for the hyperframes LLM director.",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── Public API ───────────────────────────────────────────────────────────

const DEFAULT_VISUAL_IDENTITY: VisualIdentity = {
  scriptAnalysis: "unknown — using fallback identity",
  paletteName: "Editorial Night",
  background:
    "radial-gradient(60% 80% at 18% 30%, rgba(122,162,255,0.30) 0%, transparent 60%), linear-gradient(180deg, #05060B 0%, #0E1530 100%)",
  accents: ["#7AA2FF", "#A78BFA", "#67E8F9"],
  ink: "#ffffff",
  inkMuted: "rgba(255,255,255,0.65)",
  headlineFont: "Playfair Display",
  bodyFont: "Inter",
  monoFont: "JetBrains Mono",
  motionLanguage: "editorial",
  signatureMove:
    "every scene has a thin vertical accent bar in the dominant accent color anchored to the left third, and a slow scene-long stage zoom",
  assetPolicy: "type-plus-shapes",
  imageKeyword: "",
  language: "en",
  textDirection: "ltr",
};

// Safety net: detect RTL scripts by codepoint regardless of what the LLM
// said. Counts Hebrew/Arabic/Persian/Urdu/Syriac/N'Ko characters and
// compares to Latin-letter count. If RTL letters dominate, force rtl.
function detectScriptDirection(script: string): {
  language: string | null;
  direction: "ltr" | "rtl";
} {
  const hebrew = (script.match(/[֐-׿]/g) ?? []).length;
  const arabic = (script.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g) ?? []).length;
  const syriac = (script.match(/[܀-ݏ]/g) ?? []).length;
  const nko = (script.match(/[߀-߿]/g) ?? []).length;
  const rtlCount = hebrew + arabic + syriac + nko;
  const latinCount = (script.match(/[A-Za-z]/g) ?? []).length;

  if (rtlCount === 0) return { language: null, direction: "ltr" };
  if (rtlCount * 2 > latinCount) {
    // RTL dominant. Guess the specific language for the font fallback.
    if (hebrew >= arabic && hebrew >= syriac && hebrew >= nko) return { language: "he", direction: "rtl" };
    if (arabic >= syriac && arabic >= nko) return { language: "ar", direction: "rtl" };
    if (syriac >= nko) return { language: "syc", direction: "rtl" };
    return { language: "nqo", direction: "rtl" };
  }
  return { language: null, direction: "ltr" };
}

function normalizeVisualIdentity(
  raw: Partial<VisualIdentity> | undefined,
  detected?: { language: string | null; direction: "ltr" | "rtl" },
): VisualIdentity {
  if (!raw) return DEFAULT_VISUAL_IDENTITY;
  // If the regex detector finds RTL, it overrides whatever the LLM said
  // (LLMs sometimes miss this when the script is short).
  const direction =
    detected?.direction === "rtl"
      ? "rtl"
      : (raw.textDirection === "rtl" ? "rtl" : "ltr");
  const language =
    detected?.direction === "rtl" && detected.language
      ? detected.language
      : (raw.language || DEFAULT_VISUAL_IDENTITY.language);
  return {
    scriptAnalysis: raw.scriptAnalysis || DEFAULT_VISUAL_IDENTITY.scriptAnalysis,
    paletteName: raw.paletteName || DEFAULT_VISUAL_IDENTITY.paletteName,
    background: raw.background || DEFAULT_VISUAL_IDENTITY.background,
    accents:
      Array.isArray(raw.accents) && raw.accents.length >= 3
        ? raw.accents.slice(0, 5)
        : DEFAULT_VISUAL_IDENTITY.accents,
    ink: raw.ink || DEFAULT_VISUAL_IDENTITY.ink,
    inkMuted: raw.inkMuted || DEFAULT_VISUAL_IDENTITY.inkMuted,
    headlineFont: raw.headlineFont || DEFAULT_VISUAL_IDENTITY.headlineFont,
    bodyFont: raw.bodyFont || DEFAULT_VISUAL_IDENTITY.bodyFont,
    monoFont: raw.monoFont || DEFAULT_VISUAL_IDENTITY.monoFont,
    motionLanguage: raw.motionLanguage || DEFAULT_VISUAL_IDENTITY.motionLanguage,
    signatureMove: raw.signatureMove || DEFAULT_VISUAL_IDENTITY.signatureMove,
    assetPolicy: raw.assetPolicy || DEFAULT_VISUAL_IDENTITY.assetPolicy,
    imageKeyword: raw.imageKeyword ?? DEFAULT_VISUAL_IDENTITY.imageKeyword,
    language,
    textDirection: direction,
  };
}

export async function generateStoryboard(
  script: string,
  brand?: BrandHints,
): Promise<Storyboard> {
  const trimmed = script.trim();
  if (!trimmed) throw new Error("generateStoryboard: script is empty");

  const cleanColors = (brand?.colors ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^#[0-9a-f]{6}$/.test(c));
  const userText = renderStoryboardUserPrompt(trimmed, {
    colors: cleanColors,
    logoUrl: brand?.logoUrl ?? null,
    brandStyle: brand?.brandStyle ?? null,
  });

  const response = await getClient().messages.create({
    model: MODEL,
    // The storyboard call is one-shot (not in a loop) so cache_control on
    // the system text only matters if the same script is regenerated, which
    // is rare — we still set it for consistency with the scene call.
    system: [
      {
        type: "text",
        text: STORYBOARD_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
    max_tokens: 8000,
    // Opus 4.7: temperature/top_p/top_k removed. Adaptive thinking +
    // explicit effort give the model room to deliberate over palette and
    // domain choices instead of converging on the same default.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: STORYBOARD_JSON_SCHEMA },
    },
  });

  // Locate the first text block (skip thinking / other block types).
  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("generateStoryboard: no text content in response");
  const parsed = parseJsonResponseOrThrow<Partial<Storyboard> & { scenes?: StoryboardScene[] }>(
    textBlock.text,
    "generateStoryboard",
    response.stop_reason,
    response.usage.output_tokens,
  );

  // Light normalization: ensure ids follow scene_NN, durations are within
  // the [1.5, 12] bracket (relaxed from [3, 10] in v2 to make pacing part of
  // the storytelling — see principle #2), and every scene has an assigned
  // sceneConcept + motionHook (rotate through the concept list as a fallback
  // so two adjacent scenes never share a default).
  const scenes = (parsed.scenes ?? []).map((s, i) => {
    const dur = Math.max(1.5, Math.min(12, Number(s.durationSeconds) || 4));
    const pacing: PacingIntent =
      s.pacingIntent && (PACING_INTENTS as readonly string[]).includes(s.pacingIntent)
        ? (s.pacingIntent as PacingIntent)
        : defaultPacingIntentForDuration(dur);
    return {
      id: s.id || `scene_${String(i + 1).padStart(2, "0")}`,
      copy: s.copy,
      durationSeconds: dur,
      sceneConcept: s.sceneConcept || SCENE_CONCEPTS[i % SCENE_CONCEPTS.length],
      motionHook: s.motionHook || MOTION_HOOKS[i % MOTION_HOOKS.length],
      pacingIntent: pacing,
    };
  });

  const detected = detectScriptDirection(trimmed);
  const identity = normalizeVisualIdentity(parsed.visualIdentity, detected);

  // Brand override: if the user supplied brand colors, they take precedence
  // over the LLM's accent picks (the LLM had them in its prompt as a hint;
  // this hard-pins them in case the model drifted). The first user color
  // becomes the dominant accent; remaining accents pad from the LLM's picks.
  if (cleanColors.length > 0) {
    const userColors = cleanColors.slice(0, 3);
    const padded = [...userColors, ...identity.accents].slice(0, 3);
    identity.accents = padded;
  }
  if (brand?.logoUrl) {
    identity.logoUrl = brand.logoUrl;
  }

  return {
    title: parsed.title || "Untitled",
    visualIdentity: identity,
    scenes,
  };
}

/** Render the script + brand hints into the storyboard-call user message. */
function renderStoryboardUserPrompt(
  script: string,
  brand: { colors: string[]; logoUrl: string | null; brandStyle: string | null },
): string {
  const lines: string[] = [];
  if (brand.colors.length > 0 || brand.logoUrl || brand.brandStyle) {
    lines.push("BRAND ANCHOR (the user provided these — honor them):");
    if (brand.colors.length > 0) {
      lines.push(
        `  colors:    ${brand.colors.join(", ")}  (first = dominant accent; bake these into visualIdentity.accents and pick a complementary background)`,
      );
    }
    if (brand.logoUrl) {
      lines.push(
        `  logoUrl:   ${brand.logoUrl}  (available as <img src="${brand.logoUrl}">; reference it in the final lockup/CTA scene's contentHtml)`,
      );
    }
    if (brand.brandStyle) {
      lines.push(`  brandStyle: ${brand.brandStyle.trim()}`);
    }
    lines.push("");
    lines.push("SCRIPT:");
  }
  lines.push(script);
  return lines.join("\n");
}

// ─── Film fills: JSON shape + schema + merger + generator ─────────────────

/** Per-scene fill emitted by the LLM. Plugs into buildFilmSkeleton. */
export type SceneFill = {
  /** Must match the storyboard scene order: "s1", "s2", ... */
  id: string;
  /** HTML markup placed inside <div class="scene-content">. No <section>, no clip attrs. */
  contentHtml: string;
  /** Per-scene CSS, scoped to #s1, #s2, … */
  sceneCss: string;
  /** GSAP timeline calls for this scene. Time axis: 0 = scene start. */
  timeline: string;
  /** "hard_cut" for 95% of scenes; shader_* only for 2–3 anchor moments. */
  transitionIn: "hard_cut" | "shader_flash" | "shader_wipe" | "shader_zoom";
  /**
   * Structured continuity summary the scene-fill call emits alongside the
   * HTML/CSS/timeline. Drives cross-scene continuity threading in the
   * blueprint+batched orchestrator. Optional so the legacy monolithic call
   * path (which doesn't emit it) still type-checks against SceneFill.
   */
  continuitySummary?: ContinuitySummary;
};

// ─── Continuity threading (blueprint + batched scenes) ─────────────────────
// Strongly-typed enums for the continuity contract. Single source of truth:
// both the JSON schema enforced on the LLM and the registry-side comparison
// logic read from these constants.

export const END_STATE_TYPES = [
  "static_held",
  "drifting",
  "exiting",
  "transitioning_to_next",
  "settled_focal_emphasis",
] as const;
export type EndStateType = (typeof END_STATE_TYPES)[number];

export const FOCAL_ROLES = [
  "heading",
  "kicker",
  "accent_bar",
  "logo",
  "product",
  "supporting",
  "background",
  "cta",
] as const;
export type FocalRole = (typeof FOCAL_ROLES)[number];

export const SCREEN_REGIONS = [
  "top_left", "top_center", "top_right",
  "center_left", "center", "center_right",
  "bottom_left", "bottom_center", "bottom_right",
  "fullscreen",
] as const;
export type ScreenRegion = (typeof SCREEN_REGIONS)[number];

export const MOTION_DIRECTIONS = [
  "static",
  "drift_up", "drift_down", "drift_left", "drift_right",
  "scale_up", "scale_down",
  "rotate_cw", "rotate_ccw",
  "settling", "exiting",
] as const;
export type MotionDirectionEnum = (typeof MOTION_DIRECTIONS)[number];

export const TRANSITION_TYPES = [
  "hold_until_cut",
  "fade_out",
  "wipe_left", "wipe_right", "wipe_up", "wipe_down",
  "zoom_in", "zoom_out",
  "morph_to_next_focal",
  "carry_focal_to_next",
] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export const MOTIFS = [
  "bottom_up_reveal", "top_down_reveal",
  "left_to_right_wipe", "right_to_left_wipe",
  "scale_pop", "scale_settle",
  "type_on", "letter_stagger", "word_stagger",
  "fade_in", "fade_out",
  "rotate_in", "blur_to_focus",
  "color_pulse", "border_draw",
  "mask_reveal", "parallax_drift",
] as const;
export type Motif = (typeof MOTIFS)[number];

/** Strongly-structured continuity summary produced by each scene-fill call. */
export type ContinuitySummary = {
  endStateType: EndStateType;
  focalElement: {
    /** Element id from contentHtml — used to anchor "carry-focal" transitions. */
    id: string;
    role: FocalRole;
    screenRegion: ScreenRegion;
  };
  motionDirection: MotionDirectionEnum;
  transitionOutType: TransitionType;
  motifsUsed: Motif[];
  /**
   * OPTIONAL freeform nuance, ≤120 chars. Never consumed by the registry
   * comparison or banned-repeats logic. Most scenes omit it.
   */
  notes?: string;
};

/** Global motion grammar locked by the blueprint and applied to every scene. */
export type MotionLanguageGrammar = {
  /** GSAP-compatible easing names allowed across the film. */
  easings: string[];
  pacing: "calm" | "propulsive" | "staccato";
  cameraFeel: string;
  /** 3–5 do/don't rules the model must respect for the whole film. */
  principles: string[];
};

export const CADENCE_MODES = [
  "slow_build_then_release",
  "staccato_pulse",
  "ebb_flow",
  "long_breath_then_impact",
] as const;
export type CadenceMode = (typeof CADENCE_MODES)[number];

/**
 * Film-level pacing plan. Planned BEFORE per-scene briefs so the briefs can
 * serve the rhythm rather than create it accidentally. Encodes principles
 * #3 ("directed, not assembled") and #7 ("the film breathes").
 */
export type FilmRhythmPlan = {
  /** Per-scene normalized energy 0..1 — the planned wave across the film. */
  energyCurve: number[];
  /** Scene indices (0-based) where the film deliberately breathes. */
  restMoments: number[];
  /** Scene indices where the film hits hardest. */
  impactMoments: number[];
  /** Scene indices that decompress after an impact. */
  releaseMoments: number[];
  /** The single hardest hit. */
  climaxIndex: number;
  cadenceMode: CadenceMode;
  /** 2–4 short notes: where the film SHOULD be still and why. */
  restraintNotes: string[];
};

/**
 * Per-scene intent the blueprint locks in. Drives the scene-window window
 * (prev/curr/next briefs) every scene-fill call sees.
 */
export type SceneBrief = {
  /** Stable scene id, "s1" .. "sN". */
  id: string;
  durationSeconds: number;
  /** Voiceover / copy this scene must surface. */
  copy: string;
  /** 1–2 sentence creative direction. */
  brief: string;
  /** 3-color palette anchored to global accents. Hex strings. */
  palette: string[];
  /** Free-text motion pattern label, e.g. "reveal-from-bottom + drift". */
  motionPattern: string;
  /** Element kinds allowed in this scene's contentHtml. */
  allowedElements: string[];
  /** Intended focal element role (the scene's visual anchor). */
  focalElementHint: FocalRole;
  /** 1-sentence description of the visual start state. */
  startStateHint: string;
  /** 1-sentence description of the visual end state (feeds next-scene entry). */
  endStateHint: string;
  /** How this scene should pick up from the previous. */
  transitionInIntent: string;
  /** How this scene should hand off to the next. */
  transitionOutIntent: string;
  /**
   * Locked transition-in choice (the enum value the SceneFill must emit).
   * Blueprint enforces the 2-3 non-hard_cut budget across the whole film.
   */
  transitionInChoice: "hard_cut" | "shader_flash" | "shader_wipe" | "shader_zoom";
  /**
   * Real visual assets resolved by the asset-planning stage and pinned into
   * this scene's brief. Empty/undefined for type-only films. Each entry has a
   * concrete `url` (or a `cssDirective` for `synthetic_css` slots) and a
   * `role` explaining WHY this asset is in this scene.
   */
  lockedAssets?: SceneLockedAsset[];
  /**
   * Carried forward from the storyboard. The scene-fill prompt uses this to
   * calibrate motion density and the dead-frame-vs-restraint distinction
   * (principles #1, #7). Propagated by generateFilmBlueprint.
   */
  pacingIntent?: PacingIntent;
};

/** A single asset locked into a scene by the asset-planning stage. */
export type SceneLockedAsset = {
  slot: AssetSlot;
  /** Role this asset plays in the scene's beat — passed verbatim to the model. */
  role: string;
  /** Concrete asset URL. Populated for user_asset/flux/unsplash sources. */
  url?: string;
  /** Styling directive for synthetic_css slots (no URL — pure CSS hint). */
  cssDirective?: string;
};

/** The shared memory of the whole film. Produced once by generateFilmBlueprint. */
export type FilmBlueprint = {
  /** Locked CSS variable overrides applied across every scene. */
  cssVariables: FilmCssVariableOverrides;
  /** Locked visual identity (echoed for in-call convenience; sourced from Storyboard). */
  visualIdentity: VisualIdentity;
  /** Locked global motion grammar. */
  motionLanguage: MotionLanguageGrammar;
  /** Film-level pacing plan — the energy wave that scene briefs serve. */
  filmRhythm: FilmRhythmPlan;
  /** Full ordered scene briefs. NOT sent to per-scene calls — used for window slicing only. */
  sceneOutline: SceneBrief[];
};

/** Accumulator passed between scene-fill batches as they complete. */
export type ContinuityState = {
  /** Real continuity summary of the most recently completed scene. */
  prevSceneSummary: ContinuitySummary | null;
  /** Scene id the prevSceneSummary refers to (for prompt-side context). */
  prevSceneId: string | null;
  /** Union of all motifs used across completed scenes. */
  motifRegistry: Set<Motif>;
  /** Scene ids already completed, in order. */
  completedSceneIds: string[];
};

// ─── Asset planning (Stage 1 of v2 quality pipeline) ───────────────────────
// Proactive asset intelligence: the system decides what imagery each scene
// needs (UI mockups, product renders, textures, environmental shots, icons,
// stock photos, accent shapes). Per the cinematic principles: user-uploaded
// assets win when relevant, otherwise the system generates via Flux or pulls
// stock — never waits for the user to supply every asset manually.

export const ASSET_SLOTS = [
  "hero_product",
  "ui_mockup",
  "screenshot",
  "background_texture",
  "environmental",
  "logo",
  "icon",
  "stock_photo",
  "accent_shape",
] as const;
export type AssetSlot = (typeof ASSET_SLOTS)[number];

export const ASSET_SOURCES = [
  "user_asset",
  "flux",
  "unsplash",
  "synthetic_css",
] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

/** A single asset need the planning stage declares for a scene. */
export type AssetSlotPlan = {
  slot: AssetSlot;
  /** Why this asset is needed for this scene's beat. */
  role: string;
  source: AssetSource;
  /** Set when source = "user_asset". References a `jobs.assets[i].id`. */
  userAssetId?: string;
  /** Set when source = "flux". Structured Flux prompt (positive-only). */
  fluxPrompt?: string;
  /** Set when source = "flux". Anti-conditioning hint (ignored by Flux but tracked for prompt-quality logging). */
  negativePrompt?: string;
  /** Set when source = "unsplash". A short keyword (1–3 words). */
  unsplashKeyword?: string;
  /** Set when source = "synthetic_css". 1-sentence CSS styling directive. */
  cssDirective?: string;
};

/** Per-scene asset plan (one entry per scene in the storyboard, in order). */
export type AssetPlanScene = {
  sceneId: string;
  needs: AssetSlotPlan[];
};

/** Output of generateAssetPlan. Consumed by sourceAssets. */
export type AssetPlan = {
  scenes: AssetPlanScene[];
};

/** A single resolved (URL-bound or directive-bound) asset for a scene slot. */
export type SourcedAssetSlot = {
  slot: AssetSlot;
  role: string;
  source: AssetSource;
  /** Concrete URL for user_asset / flux / unsplash. Undefined for synthetic_css. */
  url?: string;
  /** Set for synthetic_css. */
  cssDirective?: string;
};

/** Catalog of resolved assets keyed by sceneId. Consumed by generateFilmBlueprint. */
export type SourcedAssetCatalog = {
  /** sceneId → ordered list of resolved slots for that scene. */
  scenes: Record<string, SourcedAssetSlot[]>;
};

const ASSET_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sceneId", "needs"],
        properties: {
          sceneId: { type: "string" },
          needs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["slot", "role", "source"],
              properties: {
                slot: { type: "string", enum: [...ASSET_SLOTS] },
                role: { type: "string" },
                source: { type: "string", enum: [...ASSET_SOURCES] },
                userAssetId: { type: "string" },
                fluxPrompt: { type: "string" },
                negativePrompt: { type: "string" },
                unsplashKeyword: { type: "string" },
                cssDirective: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ─── Vision critique (Stage 6 + 7 of v2 quality pipeline) ──────────────────
// Per-scene vision critique + film-level vision critique. The critique is the
// AI creative studio looking at its own output and judging whether it lands
// as a cinematic launch film. Per-scene calls evaluate one composite each.
// The film-level call evaluates the WHOLE film as a directed piece.
//
// Sonnet 4.6 (not Opus) for both: critique is judgmental + structured, not
// generative — Sonnet is fast here and we want the wall-time budget for
// refinement.

export const SEVERITY_LEVELS = ["minor", "moderate", "major"] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export const SCENE_CRITIQUE_VERDICTS = ["ship", "refine", "reject"] as const;
export type SceneCritiqueVerdict = (typeof SCENE_CRITIQUE_VERDICTS)[number];

export const SCENE_CRITIQUE_DIMENSIONS = [
  "composition",
  "typographyHierarchy",
  "colorTension",
  "focalClarity",
  "motionClarity",
  "brandFidelity",
  "restraintQuality",
  "overall",
] as const;
export type SceneCritiqueDimension = (typeof SCENE_CRITIQUE_DIMENSIONS)[number];

/** Per-scene vision critique. Emitted by Sonnet 4.6 with the motion-trail composite as input. */
export type SceneCritique = {
  sceneId: string;
  scores: {
    composition: number;
    typographyHierarchy: number;
    colorTension: number;
    focalClarity: number;
    motionClarity: number;
    brandFidelity: number;
    /**
     * High when the scene's stillness is INTENTIONAL (earned restraint).
     * Low when stillness is dead frame. Combined with motionClarity, this
     * dimension is the dead-frame-vs-restraint distinguisher (principle #1).
     */
    restraintQuality: number;
    overall: number;
  };
  verdict: SceneCritiqueVerdict;
  issues: Array<{
    severity: Severity;
    dimension: SceneCritiqueDimension;
    description: string;
    suggestedFix: string;
  }>;
};

const SCENE_CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sceneId", "scores", "verdict", "issues"],
  properties: {
    sceneId: { type: "string" },
    scores: {
      type: "object",
      additionalProperties: false,
      required: [...SCENE_CRITIQUE_DIMENSIONS],
      properties: {
        composition: { type: "number" },
        typographyHierarchy: { type: "number" },
        colorTension: { type: "number" },
        focalClarity: { type: "number" },
        motionClarity: { type: "number" },
        brandFidelity: { type: "number" },
        restraintQuality: { type: "number" },
        overall: { type: "number" },
      },
    },
    verdict: { type: "string", enum: [...SCENE_CRITIQUE_VERDICTS] },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "dimension", "description", "suggestedFix"],
        properties: {
          severity: { type: "string", enum: [...SEVERITY_LEVELS] },
          dimension: { type: "string", enum: [...SCENE_CRITIQUE_DIMENSIONS] },
          description: { type: "string" },
          suggestedFix: { type: "string" },
        },
      },
    },
  },
} as const;

export const FILM_CRITIQUE_VERDICTS = [
  "ship",
  "refine_selected_scenes",
  "redesign_rhythm",
] as const;
export type FilmCritiqueVerdict = (typeof FILM_CRITIQUE_VERDICTS)[number];

export const FILM_CRITIQUE_DIMENSIONS = [
  "pacingDiversity",
  "rhythmEvolution",
  "emotionalProgression",
  "transitionFatigue",
  "compositionRepetition",
  "typographyRepetition",
  "visualMonotony",
  "climaxStrength",
  "motionDiversity",
  "cinematicCoherence",
  "energyWaveDelivery",
  "overall",
] as const;
export type FilmCritiqueDimension = (typeof FILM_CRITIQUE_DIMENSIONS)[number];

/** Film-level vision critique. Single Sonnet 4.6 call sees ALL composites at once. */
export type FilmCritique = {
  scores: {
    pacingDiversity: number;
    rhythmEvolution: number;
    emotionalProgression: number;
    /** INVERTED: 100 = no fatigue, 0 = exhausting. */
    transitionFatigue: number;
    /** INVERTED: 100 = visually varied across the film. */
    compositionRepetition: number;
    typographyRepetition: number;
    visualMonotony: number;
    climaxStrength: number;
    motionDiversity: number;
    cinematicCoherence: number;
    /** Does the delivered film match the planned filmRhythm.energyCurve? */
    energyWaveDelivery: number;
    overall: number;
  };
  verdict: FilmCritiqueVerdict;
  filmLevelIssues: Array<{
    severity: Severity;
    dimension: FilmCritiqueDimension;
    description: string;
    /** Which scenes (by id) should be refined to fix this film-level issue. */
    affectedSceneIds: string[];
    suggestedFix: string;
  }>;
};

const FILM_CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "verdict", "filmLevelIssues"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: [...FILM_CRITIQUE_DIMENSIONS],
      properties: {
        pacingDiversity: { type: "number" },
        rhythmEvolution: { type: "number" },
        emotionalProgression: { type: "number" },
        transitionFatigue: { type: "number" },
        compositionRepetition: { type: "number" },
        typographyRepetition: { type: "number" },
        visualMonotony: { type: "number" },
        climaxStrength: { type: "number" },
        motionDiversity: { type: "number" },
        cinematicCoherence: { type: "number" },
        energyWaveDelivery: { type: "number" },
        overall: { type: "number" },
      },
    },
    verdict: { type: "string", enum: [...FILM_CRITIQUE_VERDICTS] },
    filmLevelIssues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "dimension", "description", "affectedSceneIds", "suggestedFix"],
        properties: {
          severity: { type: "string", enum: [...SEVERITY_LEVELS] },
          dimension: { type: "string", enum: [...FILM_CRITIQUE_DIMENSIONS] },
          description: { type: "string" },
          affectedSceneIds: { type: "array", items: { type: "string" } },
          suggestedFix: { type: "string" },
        },
      },
    },
  },
} as const;

/** Overrides for the canonical identity-derived CSS variables. All keys optional. */
export type FilmCssVariableOverrides = Partial<{
  "--bg": string;
  "--ink": string;
  "--ink-muted": string;
  "--accent-1": string;
  "--accent-2": string;
  "--accent-3": string;
  "--headline-font": string;
  "--body-font": string;
  "--mono-font": string;
}>;

export type FilmFills = {
  /** Override channel only — merger writes defaults from the identity. */
  cssVariables: FilmCssVariableOverrides;
  scenes: SceneFill[];
  /** Optional film-wide motifs running across the whole timeline. */
  globalTimeline?: string;
};

type LintFinding = {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  fixHint?: string;
};

// Run `npx hyperframes lint . --json` against the merged composition in a
// throwaway temp dir. Only error-severity findings are surfaced to the retry
// loop — warnings/info are noise the model would over-correct on.
async function lintCompositionHTML(
  html: string,
): Promise<{ ok: boolean; errors: LintFinding[] }> {
  const dir = await mkdtemp(path.join(tmpdir(), "hf-lint-"));
  try {
    await writeFile(path.join(dir, "index.html"), html, "utf8");
    const isWin = process.platform === "win32";
    const cmd = isWin ? "npx.cmd" : "npx";
    const args = ["hyperframes", "lint", ".", "--json"];

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const exitCode: number | null = await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: dir,
        shell: isWin,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (d) => stdoutChunks.push(Buffer.from(d)));
      child.stderr?.on("data", (d) => stderrChunks.push(Buffer.from(d)));
      child.on("error", reject);
      child.on("close", (code) => resolve(code));
    });

    const out = Buffer.concat(stdoutChunks).toString("utf8").trim();
    try {
      const parsed = JSON.parse(out) as { ok?: boolean; findings?: LintFinding[] };
      const errors = (parsed.findings ?? []).filter((f) => f.severity === "error");
      return { ok: errors.length === 0, errors };
    } catch {
      console.warn(
        `[lint] non-JSON output (exit ${exitCode}) — skipping lint retry. Tail: ${out.slice(-300)}`,
      );
      return { ok: true, errors: [] };
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Identity → CSS variable defaults the merger writes onto :root. */
function defaultCssVariables(identity: VisualIdentity): Record<string, string> {
  return {
    "--bg": identity.background,
    "--ink": identity.ink,
    "--ink-muted": identity.inkMuted,
    "--accent-1": identity.accents[0] ?? "#FFFFFF",
    "--accent-2": identity.accents[1] ?? identity.accents[0] ?? "#FFFFFF",
    "--accent-3": identity.accents[2] ?? identity.accents[1] ?? "#FFFFFF",
    "--headline-font": `"${identity.headlineFont}", sans-serif`,
    "--body-font": `"${identity.bodyFont}", sans-serif`,
    "--mono-font": `"${identity.monoFont}", monospace`,
  };
}

/** Compute scene start times (offsets) given storyboard durations. */
function sceneStarts(scenes: StoryboardScene[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of scenes) {
    out.push(t);
    t += s.durationSeconds;
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

/**
 * Build the final composition HTML by merging the LLM's fills into a fixed,
 * lint-clean skeleton. The skeleton owns:
 *   • root composition attrs (id, data-composition-id, data-width/height,
 *     data-start, data-duration)
 *   • per-scene <section class="scene clip" ...> wrappers with start/duration/track-index
 *   • GSAP timeline boilerplate + window.__timelines["main"] registration
 *   • autoAlpha visibility set/unset per scene
 *   • timeline length anchor
 *
 * The LLM owns only what's inside the .scene-content divs, per-scene CSS,
 * per-scene GSAP timeline blocks, and the CSS variables on :root.
 */
export function buildFilmSkeleton(
  storyboard: Storyboard,
  identity: VisualIdentity,
  fills: FilmFills,
): string {
  const totalSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);
  const starts = sceneStarts(storyboard.scenes);
  const cssVars = {
    ...defaultCssVariables(identity),
    ...(fills.cssVariables ?? {}),
  };
  // Index fills by id for safe lookup.
  const fillById = new Map<string, SceneFill>();
  for (const f of fills.scenes ?? []) fillById.set(f.id, f);

  // :root CSS variables block.
  const rootVarsCss = Object.entries(cssVars)
    .map(([k, v]) => `    ${k}: ${v};`)
    .join("\n");

  // Per-scene sections.
  const sectionsHtml = storyboard.scenes
    .map((scene, i) => {
      const sid = `s${i + 1}`;
      const fill = fillById.get(sid) ?? fillById.get(scene.id);
      const transitionIn = fill?.transitionIn ?? "hard_cut";
      // shader anchors use opacity:0; non-anchors use visibility:hidden (merger
      // will autoAlpha them in/out).
      const initStyle =
        transitionIn === "hard_cut" ? `visibility:hidden` : `opacity:0`;
      const start = starts[i];
      const content = fill?.contentHtml ?? `<h1>${escapeHtml(scene.copy)}</h1>`;
      const sceneCss = fill?.sceneCss ?? "";
      return [
        `  <section id="${sid}" class="scene clip" data-start="${start}" data-duration="${scene.durationSeconds}" data-track-index="0" style="${initStyle}">`,
        sceneCss ? `    <style>${indentLines(sceneCss, "      ")}\n    </style>` : ``,
        `    <div class="scene-content">`,
        indentLines(content, "      "),
        `    </div>`,
        `  </section>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  // Per-scene GSAP blocks wrapped in IIFEs so locally-declared variables don't
  // collide across scenes. The IIFE shadows `tl` with a wrapper that adds the
  // scene's start offset to every numeric position arg — the LLM emits
  // scene-local positions (0..durationSeconds) per the prompt contract, and
  // this wrapper turns them into master-timeline positions.
  const sceneTimelineBlocks = storyboard.scenes
    .map((scene, i) => {
      const sid = `s${i + 1}`;
      const fill = fillById.get(sid) ?? fillById.get(scene.id);
      const start = starts[i];
      const tlBody = fill?.timeline ?? "";
      return [
        `  // ── ${sid} (${scene.copy.slice(0, 60).replace(/\s+/g, " ")}) — offset ${start}s ──`,
        `  (function (__tlRoot, t) {`,
        `    function __p(pos) {`,
        `      if (pos == null) return t;`,
        `      return typeof pos === "number" ? pos + t : pos;`,
        `    }`,
        `    var tl = {`,
        `      to:       function (tgt, v, pos)    { __tlRoot.to(tgt, v, __p(pos));       return tl; },`,
        `      from:     function (tgt, v, pos)    { __tlRoot.from(tgt, v, __p(pos));     return tl; },`,
        `      fromTo:   function (tgt, f, v, pos) { __tlRoot.fromTo(tgt, f, v, __p(pos)); return tl; },`,
        `      set:      function (tgt, v, pos)    { __tlRoot.set(tgt, v, __p(pos));      return tl; },`,
        `      add:      function (a, pos)         { __tlRoot.add(a, __p(pos));           return tl; },`,
        `      addLabel: function (l, pos)         { __tlRoot.addLabel(l, __p(pos));      return tl; },`,
        `      call:     function (fn, p2, pos)    { __tlRoot.call(fn, p2, __p(pos));     return tl; },`,
        `    };`,
        indentLines(tlBody, "    "),
        `  })(tl, ${start});`,
      ].join("\n");
    })
    .join("\n\n");

  // Visibility / shader-anchor automation written by the merger.
  const visibilityBlock = storyboard.scenes
    .map((scene, i) => {
      const sid = `s${i + 1}`;
      const fill = fillById.get(sid) ?? fillById.get(scene.id);
      const start = starts[i];
      const end = start + scene.durationSeconds;
      const transitionIn = fill?.transitionIn ?? "hard_cut";
      if (transitionIn === "hard_cut") {
        return [
          `  tl.set("#${sid}", { autoAlpha: 1 }, ${start});`,
          `  tl.set("#${sid}", { autoAlpha: 0 }, ${end});`,
        ].join("\n");
      }
      // Shader anchor: scene is opacity:0 initially; merger sets opacity:1 at
      // start. The LLM's shader transition tween animates the visual handoff;
      // the autoAlpha:0 at end still tidies up.
      return [
        `  tl.set("#${sid}", { opacity: 1 }, ${start});`,
        `  tl.set("#${sid}", { autoAlpha: 0 }, ${end});`,
      ].join("\n");
    })
    .join("\n");

  const dir = identity.textDirection;
  const lang = identity.language || "en";

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${dir}" data-composition-variables='[]'>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(storyboard.title || "MotionFlow Film")}</title>
<style>
  :root {
${rootVarsCss}
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
    background: var(--bg);
    color: var(--ink);
    font-family: var(--body-font);
    direction: ${dir};
  }
  #root {
    position: relative;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
  }
  .scene {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .scene-content {
    position: absolute;
    inset: 0;
  }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="${totalSeconds}">
${sectionsHtml}
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script>
  var tl = gsap.timeline({ paused: true });

  // Per-scene visibility (merger-authored).
${visibilityBlock}

  // Per-scene timelines (LLM-authored).
${sceneTimelineBlocks}

${
  fills.globalTimeline
    ? `  // Film-wide motifs (LLM-authored).\n${indentLines(fills.globalTimeline, "  ")}\n`
    : ``
}
  // Anchor timeline length to total film duration.
  tl.set({}, {}, ${totalSeconds});

  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { tl.play(); });
  } else {
    tl.play();
  }
</script>
</body>
</html>
`;
}

// ─── Film Blueprint (Stage A of the batched scene pipeline) ────────────────
// The blueprint is the shared memory of the whole film. It's emitted once,
// fast, and every subsequent scene-fill call reads from it. Its job is to
// LOCK global decisions (palette overrides, motion grammar) and per-scene
// CREATIVE INTENT (briefs, focal hints, transition intents, transition
// choice with the 2-3-non-hard_cut budget). It does NOT emit HTML / CSS /
// GSAP timelines — that's Stage B.

const FILM_BLUEPRINT_SYSTEM_PROMPT = `You are the show-runner of a short cinematic launch film. Your job is to lock the global creative DNA and a per-scene plan that every subsequent scene-renderer will follow. You DO NOT emit HTML, CSS, or GSAP code — only structured creative direction.

═══ SEVEN CINEMATIC PRINCIPLES (non-negotiable — design every brief around these) ═══

1. NO DEAD FRAMES, BUT RESTRAINT IS CRAFT. Distinguish intentional stillness (earned cinematic restraint) from empty/dead frames. A held beat after a hard impact is craft; a held beat for no reason is failure. Briefs must make the difference explicit.
2. DURATIONS ARE DYNAMIC, NEVER UNIFORM. The storyboard's durations may already vary (range 1.5–12s). Honor that — and if a scene's brief would land harder with a different feel for its duration, say so via motionPattern. Pacing IS storytelling.
3. THE FILM IS DIRECTED, NOT ASSEMBLED. Plan rhythm and transition handoffs as a whole. Read your own outline forward — does endStateHint[i] line up with transitionInIntent[i+1]?
4. OPUS IS THE CREATIVE ENGINE. Invent. The schemas route your decisions; they don't box your taste.
5. ASSETS SERVE THE BEAT. If ASSETS LOCKED FOR EACH SCENE is provided below, design each brief AROUND those assets — their role, their position, their visual weight.
6. MOTION QUALITY > FRAME PRETTINESS. Briefs must talk about how the scene MOVES, not just how it looks at t=0.
7. THE FILM BREATHES. Plan buildup → impact → release → breath → climax → close. Not every scene tries to be impressive; the most powerful scene is often a held breath. Vary energy across the film like a directed piece, not a flat row of beats.

═══ WHAT YOU OUTPUT ═══

A single FilmBlueprint JSON with:
  1. cssVariables — sparse overrides on top of the identity-derived defaults. Usually empty; only override when the identity needs a tweak (e.g. swap accent-2 because palette feels muddy). Most films leave this {}.
  2. motionLanguage — the film's motion grammar:
       easings        — 2–3 GSAP eases the whole film uses ("power2.out", "expo.inOut", "power4.inOut", "circ.out", ...). Pick ones consistent with the identity's motionLanguage tag.
       pacing         — "calm" | "propulsive" | "staccato"
       cameraFeel     — one-line description (e.g. "locked-off proscenium with held breaths", "tight push-pull on focal moments")
       principles     — 3–5 short do/don't rules every scene must respect ("never animate two headings simultaneously", "stagger reveals always read in the natural script direction", "hold the focal beat for ≥0.4s before the next entrance")
  3. filmRhythm — the FILM-LEVEL pacing plan. Design this BEFORE writing scene briefs; scene briefs must serve the rhythm:
       energyCurve     — array of N numbers in [0, 1], one per scene. The PLANNED energy wave across the film. NOT a flat row of 0.5s. Real films build, release, breathe, climax. Example for 6 scenes: [0.35, 0.55, 0.30, 0.75, 0.90, 0.45] — opens medium, lifts, breathes down, builds, climax, release.
       restMoments     — scene indices (0-based) where the film is DELIBERATELY still / quiet / breathing. Held beats. The film NEEDS these — without them every scene reads as noise.
       impactMoments   — scene indices where the film hits hardest. Usually 1–2 of these.
       releaseMoments  — scene indices that decompress AFTER an impact. The film needs to come down too.
       climaxIndex     — the single hardest hit. Often the second-to-last scene; sometimes the CTA itself if the film is built around a brand reveal.
       cadenceMode     — overall shape: "slow_build_then_release" | "staccato_pulse" | "ebb_flow" | "long_breath_then_impact". Pick the one that matches the script's emotional arc.
       restraintNotes  — 2–4 short notes describing where the film SHOULD be still and WHY (e.g. "s3 holds — the audience needs to land after the data reveal before the brand turn"). These are read by the scene-fill stage to distinguish intentional restraint from dead frames.
  4. sceneOutline — one entry per storyboard scene, in order, with ids "s1".."sN". Each entry:
       id, durationSeconds, copy — already in the storyboard, echo verbatim.
       brief                    — 1–2 sentence creative direction for THIS scene specifically. Not a restatement of the copy — what visual/emotional beat this scene plays.
       palette                  — 3 hex colors this scene leans on (subset of identity.accents; first = dominant for this scene).
       motionPattern            — free-text label, e.g. "reveal-from-bottom + drift settle", "split-screen wipe + KPI counter-up", "logo lockup with focal-carry from previous scene".
       allowedElements          — list of element kinds the renderer may use ("heading", "kicker", "accent_bar", "kpi_row", "mockup_frame", "logo", "supporting_paragraph", "background_grid"). Bound the scene so it doesn't sprawl.
       focalElementHint         — role of the scene's visual anchor: heading | kicker | accent_bar | logo | product | supporting | background | cta.
       startStateHint           — 1 sentence: what the scene looks like at t=0.
       endStateHint             — 1 sentence: what the scene looks like at t=durationSeconds. THIS DRIVES THE NEXT SCENE'S ENTRY — be specific (where the focal element ends, what's still on screen, what's already faded).
       transitionInIntent       — 1 sentence: how this scene picks up from the previous (mirror the previous scene's endStateHint).
       transitionOutIntent      — 1 sentence: how this scene hands off to the next (this should match the next scene's transitionInIntent).
       transitionInChoice       — "hard_cut" | "shader_flash" | "shader_wipe" | "shader_zoom".

═══ TRANSITION BUDGET (HARD CONSTRAINT) ═══

  • AT MOST 2–3 scenes across the entire sceneOutline may have transitionInChoice ≠ "hard_cut".
  • Suggested placements: scene 1 or 2 (hero reveal), one mid-film pivot, the final scene (CTA / brand lockup).
  • Every other scene MUST use "hard_cut".
  • Scene 1 may use a shader transition for the opening; later scenes use shaders only as deliberate punctuation.

═══ DIVERSITY ═══

Sketch all N silhouettes in your head BEFORE writing JSON:
  • Left-weighted heading vs. centered orbit vs. full-bleed image vs. KPI row vs. split panel vs. kinetic word grid vs. logo lockup.
  • Every scene's silhouette must differ from every other when text is stripped.
  • If two scenes feel structurally similar, change one scene's focalElementHint, allowedElements, or motionPattern before emitting.

═══ CONTINUITY (THE ENTIRE POINT) ═══

The film must feel CONTINUOUS, not like a stitch of independently generated clips. Your blueprint is the only thing that makes that possible:
  • Each endStateHint must hand off cleanly to the NEXT scene's startStateHint / transitionInIntent. Read your own outline forward to check.
  • Locked motion grammar (easings, pacing, principles) is what every scene shares — keep it tight (2–3 easings, not 8).
  • Focal carries: when transitionInChoice ≠ "hard_cut", state explicitly in transitionInIntent what carries over (e.g. "the accent bar from s2's end state slides into s3's hero kicker position").
`;

const FILM_BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cssVariables", "motionLanguage", "filmRhythm", "sceneOutline"],
  properties: {
    cssVariables: {
      type: "object",
      additionalProperties: false,
      properties: {
        "--bg": { type: "string" },
        "--ink": { type: "string" },
        "--ink-muted": { type: "string" },
        "--accent-1": { type: "string" },
        "--accent-2": { type: "string" },
        "--accent-3": { type: "string" },
        "--headline-font": { type: "string" },
        "--body-font": { type: "string" },
        "--mono-font": { type: "string" },
      },
    },
    motionLanguage: {
      type: "object",
      additionalProperties: false,
      required: ["easings", "pacing", "cameraFeel", "principles"],
      properties: {
        easings: { type: "array", items: { type: "string" } },
        pacing: { type: "string", enum: ["calm", "propulsive", "staccato"] },
        cameraFeel: { type: "string" },
        principles: { type: "array", items: { type: "string" } },
      },
    },
    filmRhythm: {
      type: "object",
      additionalProperties: false,
      required: [
        "energyCurve", "restMoments", "impactMoments", "releaseMoments",
        "climaxIndex", "cadenceMode", "restraintNotes",
      ],
      properties: {
        energyCurve: { type: "array", items: { type: "number" } },
        restMoments: { type: "array", items: { type: "number" } },
        impactMoments: { type: "array", items: { type: "number" } },
        releaseMoments: { type: "array", items: { type: "number" } },
        climaxIndex: { type: "number" },
        cadenceMode: { type: "string", enum: [...CADENCE_MODES] },
        restraintNotes: { type: "array", items: { type: "string" } },
      },
    },
    sceneOutline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "durationSeconds", "copy", "brief", "palette", "motionPattern",
          "allowedElements", "focalElementHint", "startStateHint", "endStateHint",
          "transitionInIntent", "transitionOutIntent", "transitionInChoice",
        ],
        properties: {
          id: { type: "string" },
          durationSeconds: { type: "number" },
          copy: { type: "string" },
          brief: { type: "string" },
          palette: { type: "array", items: { type: "string" } },
          motionPattern: { type: "string" },
          allowedElements: { type: "array", items: { type: "string" } },
          focalElementHint: { type: "string", enum: [...FOCAL_ROLES] },
          startStateHint: { type: "string" },
          endStateHint: { type: "string" },
          transitionInIntent: { type: "string" },
          transitionOutIntent: { type: "string" },
          transitionInChoice: {
            type: "string",
            enum: ["hard_cut", "shader_flash", "shader_wipe", "shader_zoom"],
          },
        },
      },
    },
  },
} as const;

// ─── Scene Fill (Stage B of the batched scene pipeline) ────────────────────
// One scene's contentHtml + sceneCss + timeline + continuitySummary. The
// system prompt is FILM_SYSTEM_PROMPT (verbatim, for cache-hit), and the
// json_schema below constrains the output to a single SceneFill shape with
// strongly-typed continuitySummary enums.

const SCENE_FILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "contentHtml", "sceneCss", "timeline", "transitionIn", "continuitySummary"],
  properties: {
    id: { type: "string" },
    contentHtml: { type: "string" },
    sceneCss: { type: "string" },
    timeline: { type: "string" },
    transitionIn: {
      type: "string",
      enum: ["hard_cut", "shader_flash", "shader_wipe", "shader_zoom"],
    },
    continuitySummary: {
      type: "object",
      additionalProperties: false,
      required: ["endStateType", "focalElement", "motionDirection", "transitionOutType", "motifsUsed"],
      properties: {
        endStateType: { type: "string", enum: [...END_STATE_TYPES] },
        focalElement: {
          type: "object",
          additionalProperties: false,
          required: ["id", "role", "screenRegion"],
          properties: {
            id: { type: "string" },
            role: { type: "string", enum: [...FOCAL_ROLES] },
            screenRegion: { type: "string", enum: [...SCREEN_REGIONS] },
          },
        },
        motionDirection: { type: "string", enum: [...MOTION_DIRECTIONS] },
        transitionOutType: { type: "string", enum: [...TRANSITION_TYPES] },
        motifsUsed: {
          type: "array",
          items: { type: "string", enum: [...MOTIFS] },
        },
        notes: { type: "string" },
      },
    },
  },
} as const;

// ─── Asset planning (Stage 1) — system prompt + generator ──────────────────
// Proactive, principle-driven. The model decides WHAT each scene needs.
// Prefers user-uploaded assets when relevant; otherwise generates via Flux
// or pulls stock; otherwise emits a synthetic_css directive so the scene
// renders as pure typography/CSS (no asset URL).

const ASSET_PLAN_SYSTEM_PROMPT = `You are the asset director for a short cinematic launch film. You decide, scene by scene, what real visual assets the film needs to feel professionally produced — and you make those decisions PROACTIVELY, not by waiting for the user to upload every asset.

═══ YOUR ROLE ═══

For each scene in the storyboard, declare an ordered list of asset NEEDS. Each need has:
  • slot   — what KIND of asset it is (see slot vocabulary below).
  • role   — one sentence: WHY this asset is in this scene's beat. Anchor it to the scene's narrative / emotional purpose.
  • source — WHERE the asset comes from. One of: user_asset | flux | unsplash | synthetic_css.

Plus exactly one source-specific field:
  • user_asset    → userAssetId (must reference a job-level asset already on jobs.assets).
  • flux          → fluxPrompt (a positive-only Flux prompt; Flux 1.1 Pro Ultra ignores negatives, so put every constraint as positive descriptors). Optional: negativePrompt (logged but not sent to Flux).
  • unsplash      → unsplashKeyword (1–3 words, used as the search keyword).
  • synthetic_css → cssDirective (one sentence describing how the scene styles a synthetic stand-in — e.g. "a thin vertical accent bar in --accent-1 on the left edge, 60% screen height, centered vertically"). NO asset URL is created — the renderer will style purely from this directive.

═══ SLOT VOCABULARY ═══

  • hero_product       — the product itself rendered cleanly (object on neutral background, or in context).
  • ui_mockup          — a product UI screenshot or fabricated UI surface.
  • screenshot         — a literal screen capture of an app / tool / dashboard.
  • background_texture — a backdrop the scene's typography sits on top of (gradients, grain, noise, photographic blur).
  • environmental     — a scene-setting wide shot (lab, office, street, sky, abstract environment).
  • logo               — the brand logo. Almost always source=user_asset if jobs.assets has a logo; otherwise skip (don't fabricate logos).
  • icon               — a small symbolic glyph (lock, lightning, checkmark, etc.). Often synthetic_css if simple, flux if illustrative.
  • stock_photo        — a generic photographic image. Unsplash by default; flux if the brief calls for a non-stock look.
  • accent_shape       — a decorative shape (ring, dot grid, bar, blob). Usually synthetic_css.

═══ DECISION RULES (FOLLOW THESE — they shape the whole film's feel) ═══

1. PROACTIVE BY DEFAULT. The system should not wait for the user to provide every asset. If a scene's beat reads as "show the product," declare a hero_product need with source=flux even if the user uploaded nothing.

2. PREFER USER ASSETS WHEN THEY FIT. If jobs.assets has an asset whose kind matches the slot AND whose role fits the scene's beat, set source=user_asset and put the asset id in userAssetId. NEVER fabricate around a user-uploaded asset that should have been used.

3. TYPE-ONLY FILMS STAY TYPE-ONLY. If visualIdentity.assetPolicy is "type-only" or similar, emit MOSTLY synthetic_css and accent_shape needs. Bias hard toward CSS. Do not stuff Flux imagery into a film that's clearly typography-led.

4. RESTRAINT IS CINEMATIC. Not every scene needs imagery. A held typographic moment with one accent_shape can be more cinematic than a busy scene with a photo. Avoid declaring 3+ needs in a single scene unless the brief truly calls for visual density.

5. ASSETS SERVE THE BEAT, NOT THE TEMPLATE. Every \`role\` you write should be SPECIFIC to this scene's narrative purpose. Bad: "background image for the scene." Good: "a slightly out-of-focus office desk scene that lets the headline breathe without competing for attention."

6. FLUX PROMPTS ARE POSITIVE-ONLY. Flux 1.1 Pro Ultra ignores negative prompts. Every constraint goes in the positive prompt as a positive descriptor. Be specific about lighting, lens, palette tie-in, focal subject, depth of field. 50–120 words is the sweet spot — long enough to direct, short enough to stay coherent.

7. ASPECT RATIO IS 16:9. Don't include "aspect ratio" instructions in fluxPrompt — the runtime sets it.

8. UNSPLASH KEYWORDS ARE BRIEF. Use 1–3 words ("aurora", "office desk", "neon street"). Do not write sentences.

═══ OUTPUT ═══

Emit an AssetPlan JSON with one entry per storyboard scene, in storyboard order (sceneId "s1" .. "sN"). Each scene's \`needs\` may be empty for pure-text scenes. Do not invent scene ids that aren't in the storyboard.
`;

function renderAssetPlanUserPrompt(
  storyboard: Storyboard,
  identity: VisualIdentity,
  jobAssets: Array<{ id: string; kind: string; name?: string; url?: string }>,
): string {
  const sceneLines = storyboard.scenes
    .map(
      (s, i) =>
        `  s${i + 1} (${s.durationSeconds}s) [${s.sceneConcept} / ${s.motionHook}] — ${s.copy}`,
    )
    .join("\n");

  const userAssetLines = jobAssets.length > 0
    ? jobAssets
        .map(
          (a) =>
            `  id="${a.id}" kind="${a.kind}"${a.name ? ` name="${a.name}"` : ""}${a.url ? ` url="${a.url}"` : ""}`,
        )
        .join("\n")
    : `  (none — the user has not uploaded any assets to this job)`;

  return `STORYBOARD — ${storyboard.scenes.length} scenes:
${sceneLines}

LOCKED VISUAL IDENTITY:
  paletteName:    ${identity.paletteName}
  accents:        ${identity.accents.join(", ")}
  motionLanguage: ${identity.motionLanguage}
  signatureMove:  ${identity.signatureMove}
  assetPolicy:    ${identity.assetPolicy}  ← honor this. type-only films stay type-only.
  language/dir:   ${identity.language} / ${identity.textDirection}
${identity.logoUrl ? `  brandLogo:      ${identity.logoUrl}  (a real brand logo IS available — declare a logo slot using user_asset / userAssetId when there's a matching entry below, or with source=user_asset and userAssetId set to a sentinel like "__brand_logo__" if no jobs.assets entry exists for it)` : "  brandLogo:      (none provided)"}

USER-UPLOADED ASSETS (jobs.assets):
${userAssetLines}

Produce the AssetPlan JSON now. One entry per scene, in storyboard order. Be proactive — declare assets the film NEEDS to feel professional, not just assets the user happened to provide. Respect the assetPolicy and the cinematic restraint rules above.
`;
}

/**
 * Stage 1 of v2 — produce the AssetPlan that drives sourcing.
 * One small Opus 4.7 call, effort=medium, max_tokens=4000.
 *
 * The plan is the model's PROACTIVE decision about what each scene needs.
 * Pure planning — no URL resolution happens here (that's sourceAssets).
 */
export async function generateAssetPlan(
  storyboard: Storyboard,
  identity: VisualIdentity = DEFAULT_VISUAL_IDENTITY,
  jobAssets: Array<{ id: string; kind: string; name?: string; url?: string }> = [],
): Promise<AssetPlan> {
  const userText = renderAssetPlanUserPrompt(storyboard, identity, jobAssets);

  const response = await getClient().messages.create({
    model: MODEL,
    system: [
      {
        type: "text",
        text: ASSET_PLAN_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
    // 9-scene films with rich Flux prompts can produce ~6-10K tokens of JSON
    // before stopping; 4K was too tight (truncated mid-string). 12K leaves
    // headroom for adaptive thinking + the full asset plan.
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: ASSET_PLAN_SCHEMA },
    },
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("generateAssetPlan: no text content in response");
  const parsed = parseJsonResponseOrThrow<AssetPlan>(
    textBlock.text,
    "generateAssetPlan",
    response.stop_reason,
    response.usage.output_tokens,
  );

  // Normalize: ensure one entry per storyboard scene, in order, with ids s1..sN.
  // Missing scenes get an empty needs array (no asset needed).
  const byId = new Map<string, AssetPlanScene>();
  for (const sc of parsed.scenes ?? []) byId.set(sc.sceneId, sc);
  const normalized: AssetPlanScene[] = storyboard.scenes.map((_, i) => {
    const sid = `s${i + 1}`;
    return byId.get(sid) ?? { sceneId: sid, needs: [] };
  });

  const totalNeeds = normalized.reduce((a, s) => a + s.needs.length, 0);
  const bySource = normalized
    .flatMap((s) => s.needs)
    .reduce<Record<AssetSource, number>>(
      (acc, n) => ({ ...acc, [n.source]: (acc[n.source] ?? 0) + 1 }),
      { user_asset: 0, flux: 0, unsplash: 0, synthetic_css: 0 },
    );

  console.log(
    `[assets plan] ${totalNeeds} needs across ${normalized.length} scenes ` +
      `(user=${bySource.user_asset} flux=${bySource.flux} unsplash=${bySource.unsplash} css=${bySource.synthetic_css}) ` +
      `· input=${response.usage.input_tokens} output=${response.usage.output_tokens}`,
  );

  return { scenes: normalized };
}

// ─── Vision critique (Stages 6 + 7) — system prompts + generators ──────────

const VISION_CRITIQUE_SYSTEM_PROMPT = `You are a senior motion-design critic reviewing one scene of a cinematic launch film. The image you receive is a MOTION-TRAIL COMPOSITE: 4 frames from across the scene's local timeline blended into a single PNG with descending alpha (latest = most opaque, earliest = ~25%). The trail shows MOTION, not just a single still — read it that way.

═══ YOUR JOB ═══

Score the scene on each of these dimensions, 0..100 (higher = better). Be honest. Be specific. Do NOT round everything to 70.

  • composition          — visual weight balance, hierarchy, negative space, focal placement.
  • typographyHierarchy  — type sizes/weights tell a clear story; no two elements compete for attention.
  • colorTension         — palette discipline; accents create tension where they should, not noise.
  • focalClarity         — at any point in the trail, can you tell what the audience should be looking at?
  • motionClarity        — the trail SHOWS motion: entrance + hold + exit. Motion has direction and intent, not random animation.
  • brandFidelity        — does this scene feel like THIS film's brand (palette, typography, signatureMove)?
  • restraintQuality     — if the scene is mostly still: is the stillness INTENTIONAL (earned restraint) or DEAD (nothing evolving, no reason to hold)?
  • overall              — weighted holistic score. Not an average — weight motionClarity + focalClarity + restraintQuality heavily; they're the cinematic differentiators.

═══ CRITICAL: DEAD FRAMES vs INTENTIONAL RESTRAINT ═══

A scene that holds still is NOT automatically a failure. The film NEEDS held beats. But there's a sharp distinction:

  INTENTIONAL RESTRAINT (high restraintQuality):
    • The trail shows a deliberate entrance + a long held focal moment.
    • The held state is COMPOSITIONALLY strong on its own — even with no motion, the frame would land.
    • The scene's pacingIntent / rhythm role (provided in user message) is HOLD / REST / CLIMAX.
    • The held duration matters to the film's rhythm (recovery, breath, climax).

  DEAD FRAME (low restraintQuality):
    • The trail shows almost no motion AND the held state is weakly composed.
    • The scene's role is build/punch/beat — it should be moving and isn't.
    • There's no narrative reason for stillness; the scene is just inert.

If you see a held scene, ASK: does this stillness EARN the next beat? If yes → restraintQuality is high. If no → low, flag as a major issue.

═══ VERDICTS ═══

  • ship    — overall ≥ 70 AND no major issues. The scene is good enough to keep.
  • refine  — overall < 70 OR any major issue. The scene needs another pass.
  • reject  — overall < 40 OR multiple major issues. The scene should be redesigned from the brief, not just patched.

═══ ISSUES (the actionable output) ═══

Each issue you list will be fed VERBATIM into a refinement call. So write each issue as:
  • severity      — minor | moderate | major
  • dimension     — which score dimension the issue belongs to
  • description   — what's wrong, in ≤ 1 sentence
  • suggestedFix  — a SURGICAL fix the renderer can apply. Specific. Examples:
                    "Move the kicker from top-left to top-center so it competes less with the headline."
                    "Replace the bottom_up_reveal motif on the headline with a left-to-right wipe — bottom_up was already used in s2."
                    "Shorten the hero entrance from 0.8s to 0.4s — it overstays the punch role."
                    "Hold the focal beat for ≥0.6s after the entrance — the current trail shows it exiting immediately, breaking restraint."

Do NOT write vague fixes like "improve the composition" or "make it more cinematic."

═══ OUTPUT ═══

Emit a single SceneCritique JSON matching the schema. Do not wrap in any other object. Keep \`description\` and \`suggestedFix\` strings under 200 chars each.
`;

const FILM_CRITIQUE_SYSTEM_PROMPT = `You are a senior film director reviewing a finished short cinematic launch film. The images you receive are MOTION-TRAIL COMPOSITES — one per scene, in scene order. Each composite blends 4 frames from across that scene's local timeline so motion-feel is readable from a still image.

The film succeeded as N individual scenes does NOT mean the FILM succeeded. Many weak films consist of individually-good scenes. Your job is to judge the film as a DIRECTED WHOLE.

═══ YOUR JOB ═══

Score the film on each dimension, 0..100 (higher = better):

  • pacingDiversity        — durations + motion densities vary across the film. Uniform pacing = low score.
  • rhythmEvolution        — energy rises, breathes, hits, releases. Read the trail-to-trail energy progression.
  • emotionalProgression   — the film TAKES the audience somewhere. It's not flat.
  • transitionFatigue      — INVERTED: 100 = transitions feel earned and varied. 0 = exhausting.
  • compositionRepetition  — INVERTED: 100 = silhouettes differ across scenes when text is stripped. 0 = same composition twice.
  • typographyRepetition   — INVERTED: 100 = type treatment varies appropriately. 0 = every scene is the same headline pattern.
  • visualMonotony         — INVERTED: 100 = each scene has a distinct visual idea. 0 = monotonous.
  • climaxStrength         — there IS a clear climax and it lands. No climax = low.
  • motionDiversity        — motion vocabulary varies (not bottom_up_reveal in every scene).
  • cinematicCoherence     — despite variety, the film feels like ONE piece with shared identity.
  • energyWaveDelivery     — compare the DELIVERED energy across the trails to the PLANNED energyCurve (provided in user message). Does the film match its own plan?
  • overall                — weighted holistic. Not an average — weight cinematicCoherence + climaxStrength + energyWaveDelivery heavily.

═══ VERDICTS ═══

  • ship                    — overall ≥ 70 AND no major film-level issues. The film is good enough.
  • refine_selected_scenes  — overall < 70 OR major issues exist that can be fixed by re-firing specific scenes.
  • redesign_rhythm         — the energy wave fundamentally fails (no climax, monotone energy). More scenes than usual need to be refired and the refinement framing should emphasize redesign over patch.

═══ FILM-LEVEL ISSUES ═══

Each filmLevelIssue you list will be fed into refinement for the affectedSceneIds you specify. Write each as:
  • severity            — minor | moderate | major
  • dimension           — which score dimension the issue belongs to
  • description         — what's wrong at the FILM level, in ≤ 1 sentence
  • affectedSceneIds    — array of scene ids ("s1", "s2", ...) — the scenes that need to change to fix THIS issue.
  • suggestedFix        — surgical fix. Examples:
        "s4 and s5 share the same composition silhouette (centered heading + accent bar). Change s5's focalElementHint to product and rebuild it around a hero asset instead of text."
        "s2 uses bottom_up_reveal AND so does s5 — break this repetition by changing s5's entrance motif to left_to_right_wipe."
        "The film has no climax — energy stays in the 0.5–0.6 band the whole way. Lift s5 to ~0.9 and use a shader_zoom transition to mark the climax."

═══ INPUT YOU RECEIVE ═══

  • The N motion-trail composites, in order (one image_url per scene).
  • The planned filmRhythm: energyCurve, restMoments, impactMoments, releaseMoments, climaxIndex, cadenceMode.
  • A storyboard summary (scene ids, durations, copy beats).
  • The per-scene critiques (so you can build on what's already flagged at the scene level — don't repeat scene-level issues unless they're ALSO film-level).

═══ OUTPUT ═══

Emit a single FilmCritique JSON matching the schema. Strings under 200 chars. affectedSceneIds must reference real scene ids from the storyboard.
`;

function renderVisionCritiqueUserPrompt(
  blueprint: FilmBlueprint,
  sceneIndex: number,
  critiqueImageUrl: string,
): { text: string; imageUrl: string } {
  const curr = blueprint.sceneOutline[sceneIndex];
  const r = blueprint.filmRhythm;
  const sid = curr.id;
  const roleTags: string[] = [];
  if (r.climaxIndex === sceneIndex) roleTags.push("CLIMAX");
  if (r.impactMoments.includes(sceneIndex)) roleTags.push("IMPACT");
  if (r.restMoments.includes(sceneIndex)) roleTags.push("REST");
  if (r.releaseMoments.includes(sceneIndex)) roleTags.push("RELEASE");
  const roleLabel = roleTags.length > 0 ? roleTags.join(" + ") : "build/standard";

  const text = `SCENE TO CRITIQUE — ${sid} (${curr.durationSeconds}s)

  copy:               ${curr.copy}
  brief:              ${curr.brief}
  motionPattern:      ${curr.motionPattern}
  focalElementHint:   ${curr.focalElementHint}
  pacingIntent:       ${curr.pacingIntent ?? "(not set)"}
  film rhythm role:   ${roleLabel} (energy ${r.energyCurve[sceneIndex]?.toFixed(2) ?? "?"} / cadence ${r.cadenceMode})
  transitionInChoice: ${curr.transitionInChoice}

The attached image is the motion-trail composite: 4 frames blended with descending alpha. Read it for motion, focal hierarchy, and the dead-frame-vs-restraint distinction. The scene's role above tells you whether stillness should be intentional restraint.

Emit a SceneCritique JSON now. sceneId MUST be "${sid}".`;

  return { text, imageUrl: critiqueImageUrl };
}

/**
 * Run one vision critique against a scene's motion-trail composite URL.
 * Sonnet 4.6, max_tokens 2000, structured JSON output. Parallel-friendly.
 */
export async function generateVisionCritique(
  blueprint: FilmBlueprint,
  sceneIndex: number,
  critiqueImageUrl: string,
): Promise<SceneCritique> {
  const { text, imageUrl } = renderVisionCritiqueUserPrompt(blueprint, sceneIndex, critiqueImageUrl);

  const response = await getClient().messages.create({
    model: SONNET_MODEL,
    system: [
      {
        type: "text",
        text: VISION_CRITIQUE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image", source: { type: "url", url: imageUrl } },
        ],
      },
    ],
    max_tokens: 4000,
    output_config: {
      format: { type: "json_schema", schema: SCENE_CRITIQUE_SCHEMA },
    },
  });

  const block = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!block) throw new Error(`generateVisionCritique[${blueprint.sceneOutline[sceneIndex].id}]: no text content`);
  const parsed = parseJsonResponseOrThrow<SceneCritique>(
    block.text,
    `generateVisionCritique[${blueprint.sceneOutline[sceneIndex].id}]`,
    response.stop_reason,
    response.usage.output_tokens,
  );
  // Pin sceneId.
  parsed.sceneId = blueprint.sceneOutline[sceneIndex].id;

  console.log(
    `[vision critique ${parsed.sceneId}] verdict=${parsed.verdict} overall=${parsed.scores.overall} ` +
      `issues=${parsed.issues.length} (major=${parsed.issues.filter((i) => i.severity === "major").length}) ` +
      `input=${response.usage.input_tokens} output=${response.usage.output_tokens}`,
  );

  return parsed;
}

/**
 * Single film-level vision critique. Sees ALL motion-trail composites at once
 * plus the planned filmRhythm + per-scene critiques. Judges the film as a
 * directed whole. Sonnet 4.6, max_tokens 4000.
 */
export async function generateFilmCritique(
  blueprint: FilmBlueprint,
  storyboard: Storyboard,
  perSceneCritiques: SceneCritique[],
  motionTrailUrls: string[],
): Promise<FilmCritique> {
  if (motionTrailUrls.length !== blueprint.sceneOutline.length) {
    throw new Error(
      `generateFilmCritique: ${motionTrailUrls.length} trail urls vs ${blueprint.sceneOutline.length} scenes`,
    );
  }

  const r = blueprint.filmRhythm;
  const sceneLines = storyboard.scenes
    .map(
      (s, i) =>
        `  s${i + 1} (${s.durationSeconds}s, pacingIntent=${s.pacingIntent}, energy=${r.energyCurve[i]?.toFixed(2) ?? "?"}) — ${s.copy}`,
    )
    .join("\n");

  const critiqueLines = perSceneCritiques
    .map(
      (c) =>
        `  ${c.sceneId}: verdict=${c.verdict} overall=${c.scores.overall} ` +
        `(restraintQuality=${c.scores.restraintQuality}, motionClarity=${c.scores.motionClarity}) ` +
        `issues=[${c.issues.map((i) => `${i.severity}/${i.dimension}`).join(", ") || "none"}]`,
    )
    .join("\n");

  const text = `FILM PLAN (what was attempted):

  cadenceMode:   ${r.cadenceMode}
  energyCurve:   [${r.energyCurve.map((e) => e.toFixed(2)).join(", ")}]
  restMoments:   [${r.restMoments.map((i) => `s${i + 1}`).join(", ") || "none"}]
  impactMoments: [${r.impactMoments.map((i) => `s${i + 1}`).join(", ") || "none"}]
  releaseMoments:[${r.releaseMoments.map((i) => `s${i + 1}`).join(", ") || "none"}]
  climaxIndex:   s${r.climaxIndex + 1}

STORYBOARD:
${sceneLines}

PER-SCENE CRITIQUES (already flagged at the scene level — don't repeat unless ALSO a film-level concern):
${critiqueLines}

The ${motionTrailUrls.length} attached images are the motion-trail composites, in scene order (s1, s2, …, s${motionTrailUrls.length}). Judge the FILM as a directed whole. Emit a single FilmCritique JSON.`;

  const imageBlocks = motionTrailUrls.map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  const response = await getClient().messages.create({
    model: SONNET_MODEL,
    system: [
      {
        type: "text",
        text: FILM_CRITIQUE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [{ type: "text" as const, text }, ...imageBlocks],
      },
    ],
    // Film-level critique can list many filmLevelIssues each with multiple
    // affectedSceneIds + 200-char strings. 4K was tight on 9-scene films.
    max_tokens: 8000,
    output_config: {
      format: { type: "json_schema", schema: FILM_CRITIQUE_SCHEMA },
    },
  });

  const block = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!block) throw new Error("generateFilmCritique: no text content");
  const parsed = parseJsonResponseOrThrow<FilmCritique>(
    block.text,
    "generateFilmCritique",
    response.stop_reason,
    response.usage.output_tokens,
  );

  console.log(
    `[film critique] verdict=${parsed.verdict} overall=${parsed.scores.overall} ` +
      `issues=${parsed.filmLevelIssues.length} (major=${parsed.filmLevelIssues.filter((i) => i.severity === "major").length}) ` +
      `coherence=${parsed.scores.cinematicCoherence} climax=${parsed.scores.climaxStrength} ` +
      `input=${response.usage.input_tokens} output=${response.usage.output_tokens}`,
  );

  return parsed;
}

// ─── Blueprint user prompt + generator ─────────────────────────────────────

function renderFilmBlueprintUserPrompt(
  storyboard: Storyboard,
  identity: VisualIdentity,
  assetCatalog?: SourcedAssetCatalog,
): string {
  const dirBlock =
    identity.textDirection === "rtl"
      ? `RTL FILM — language="${identity.language}", dir="rtl". Asymmetry side flips, accent bars on the right edge, stagger reveals read right-to-left. Plan accordingly.`
      : `language: ${identity.language} · dir: ltr`;

  const sceneLines = storyboard.scenes
    .map(
      (s, i) =>
        `  s${i + 1} (${s.durationSeconds}s, pacingIntent=${s.pacingIntent}) [${s.sceneConcept} / ${s.motionHook}] — ${s.copy}`,
    )
    .join("\n");

  const totalSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);

  return `LOCKED VISUAL IDENTITY (already wired to :root by the merger — do NOT restate these as cssVariables unless you need to override one):
${dirBlock}
paletteName:    ${identity.paletteName}
background:     ${identity.background}     (--bg)
accents:        ${identity.accents.join(", ")}   (--accent-1, --accent-2, --accent-3)
ink:            ${identity.ink}                (--ink)
inkMuted:       ${identity.inkMuted}     (--ink-muted)
headlineFont:   "${identity.headlineFont}" (--headline-font)
bodyFont:       "${identity.bodyFont}" (--body-font)
monoFont:       "${identity.monoFont}" (--mono-font)
motionLanguage: ${identity.motionLanguage}  (tag — pick concrete easings/pacing that match)
signatureMove:  ${identity.signatureMove}
assetPolicy:    ${identity.assetPolicy}
${identity.logoUrl ? `brandLogo:      ${identity.logoUrl}  (must appear in the final lockup/CTA scene)` : ""}

══════════════════════════════════════════════════════════════════════════════
FILM PLAN — ${storyboard.scenes.length} scenes · ${totalSeconds}s total
══════════════════════════════════════════════════════════════════════════════
${sceneLines}
${renderLockedAssetsForBlueprint(storyboard, assetCatalog)}
Produce the FilmBlueprint JSON now. Scene ids MUST be "s1" .. "s${storyboard.scenes.length}" in that order. Durations MUST match the storyboard above. Copy MUST be echoed verbatim. Plan continuity forward through the scenes — read your own endStateHint and check it lines up with the next scene's transitionInIntent.${assetCatalog && Object.keys(assetCatalog.scenes).length > 0 ? ` Design each scene's brief AROUND its locked assets — the renderer will embed those URLs verbatim, so your brief should reference them by role.` : ""}
`;
}

/** Per-scene asset summary embedded into the blueprint user prompt. */
function renderLockedAssetsForBlueprint(
  storyboard: Storyboard,
  assetCatalog?: SourcedAssetCatalog,
): string {
  if (!assetCatalog || Object.keys(assetCatalog.scenes).length === 0) return "";
  const lines: string[] = ["", "ASSETS LOCKED FOR EACH SCENE (real URLs / directives — design briefs to use them):"];
  for (let i = 0; i < storyboard.scenes.length; i++) {
    const sid = `s${i + 1}`;
    const slots = assetCatalog.scenes[sid] ?? [];
    if (slots.length === 0) {
      lines.push(`  ${sid}: (no assets — type/CSS only)`);
      continue;
    }
    const slotLines = slots.map((a) => {
      const where = a.source === "synthetic_css"
        ? `cssDirective: ${a.cssDirective ?? "(missing)"}`
        : `url: ${a.url ?? "(missing)"}`;
      return `    · ${a.slot} (${a.source}) — role: ${a.role} — ${where}`;
    });
    lines.push(`  ${sid}:`);
    lines.push(...slotLines);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Stage A — produce the FilmBlueprint that every scene-fill call reads from.
 * One small Opus 4.7 call, effort=medium, max_tokens=4000.
 *
 * `assetCatalog` (optional) — when provided, scene briefs are designed around
 * the locked assets and the briefs receive `lockedAssets` references after
 * parsing so per-scene calls embed real imagery.
 */
export async function generateFilmBlueprint(
  storyboard: Storyboard,
  identity: VisualIdentity = DEFAULT_VISUAL_IDENTITY,
  assetCatalog?: SourcedAssetCatalog,
): Promise<FilmBlueprint> {
  const userText = renderFilmBlueprintUserPrompt(storyboard, identity, assetCatalog);

  const response = await getClient().messages.create({
    model: MODEL,
    system: [
      {
        type: "text",
        text: FILM_BLUEPRINT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
    // Blueprint emits filmRhythm (energy curve + arrays) + N sceneBriefs each
    // with ~10 string fields + the transition budget. For 9-scene films this
    // can exceed 6-8K tokens. 12K leaves headroom.
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: FILM_BLUEPRINT_SCHEMA },
    },
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("generateFilmBlueprint: no text content in response");
  const parsed = parseJsonResponseOrThrow<{
    cssVariables: FilmCssVariableOverrides;
    motionLanguage: MotionLanguageGrammar;
    filmRhythm: FilmRhythmPlan;
    sceneOutline: SceneBrief[];
  }>(
    textBlock.text,
    "generateFilmBlueprint",
    response.stop_reason,
    response.usage.output_tokens,
  );

  // Normalize: enforce ids match s1..sN and durations echo the storyboard.
  // The model is told to do this; this is a safety net.
  // Also: pin lockedAssets from the SourcedAssetCatalog so the per-scene
  // calls embed real imagery without trusting the model to round-trip URLs.
  // And: propagate pacingIntent from the storyboard into each brief so the
  // scene-fill prompt can read it from the SceneBrief window.
  const normalizedOutline = storyboard.scenes.map((scene, i): SceneBrief => {
    const sid = `s${i + 1}`;
    const fromModel = parsed.sceneOutline.find((b) => b.id === sid) ?? parsed.sceneOutline[i];
    if (!fromModel) {
      throw new Error(
        `generateFilmBlueprint: missing brief for ${sid} — model returned ${parsed.sceneOutline.length} of ${storyboard.scenes.length}`,
      );
    }
    const lockedAssets: SceneLockedAsset[] | undefined = assetCatalog?.scenes[sid]?.map((a) => ({
      slot: a.slot,
      role: a.role,
      url: a.url,
      cssDirective: a.cssDirective,
    }));
    return {
      ...fromModel,
      id: sid,
      durationSeconds: scene.durationSeconds,
      copy: scene.copy,
      lockedAssets,
      pacingIntent: scene.pacingIntent,
    };
  });

  // Enforce the 2-3 non-hard_cut transition budget. If the model overshot,
  // demote the lowest-priority shader picks to hard_cut deterministically.
  const shaderIdx = normalizedOutline
    .map((b, i) => ({ i, choice: b.transitionInChoice }))
    .filter((x) => x.choice !== "hard_cut");
  if (shaderIdx.length > 3) {
    // Keep up to 3, prefer scene 1, the final scene, and one mid-film.
    const lastIdx = normalizedOutline.length - 1;
    const midIdx = Math.floor(normalizedOutline.length / 2);
    const keep = new Set<number>();
    for (const candidate of [0, lastIdx, midIdx]) {
      if (shaderIdx.some((x) => x.i === candidate) && keep.size < 3) {
        keep.add(candidate);
      }
    }
    // Fill remaining keep slots from the model's picks in order.
    for (const x of shaderIdx) {
      if (keep.size >= 3) break;
      keep.add(x.i);
    }
    for (const x of shaderIdx) {
      if (!keep.has(x.i)) {
        normalizedOutline[x.i] = { ...normalizedOutline[x.i], transitionInChoice: "hard_cut" };
      }
    }
  }

  const filmRhythm = sanitizeFilmRhythm(parsed.filmRhythm, normalizedOutline.length);

  const blueprint: FilmBlueprint = {
    cssVariables: parsed.cssVariables ?? {},
    visualIdentity: identity,
    motionLanguage: parsed.motionLanguage,
    filmRhythm,
    sceneOutline: normalizedOutline,
  };

  console.log(
    `[hyperframes blueprint] ${normalizedOutline.length} scenes, ` +
      `cadence=${filmRhythm.cadenceMode} climax=s${filmRhythm.climaxIndex + 1} ` +
      `rests=[${filmRhythm.restMoments.map((i) => `s${i + 1}`).join(",")}] ` +
      `impacts=[${filmRhythm.impactMoments.map((i) => `s${i + 1}`).join(",")}], ` +
      `non-hard_cut transitions=${normalizedOutline.filter((b) => b.transitionInChoice !== "hard_cut").length}, ` +
      `input=${response.usage.input_tokens} output=${response.usage.output_tokens} ` +
      `cache_read=${response.usage.cache_read_input_tokens ?? 0}`,
  );

  return blueprint;
}

/**
 * Patch a previously-generated blueprint with locked assets sourced after the
 * blueprint LLM call. Lets jobs.ts fire `generateFilmBlueprint` in parallel
 * with `sourceAssets` (perf A3) and stamp asset URLs onto briefs once both
 * complete. Idempotent — calling with an empty/undefined catalog returns the
 * blueprint unchanged.
 */
export function applyLockedAssetsToBlueprint(
  blueprint: FilmBlueprint,
  assetCatalog: SourcedAssetCatalog | undefined,
): FilmBlueprint {
  if (!assetCatalog) return blueprint;
  return {
    ...blueprint,
    sceneOutline: blueprint.sceneOutline.map((brief) => {
      const slots = assetCatalog.scenes[brief.id];
      if (!slots || slots.length === 0) return brief;
      return {
        ...brief,
        lockedAssets: slots.map((a) => ({
          slot: a.slot,
          role: a.role,
          url: a.url,
          cssDirective: a.cssDirective,
        })),
      };
    }),
  };
}

/**
 * Clamp / patch the model's filmRhythm so it survives sloppy output without
 * crashing downstream consumers. Drops out-of-range scene indices, fills a
 * default energy curve when missing, defaults the climax to the last scene
 * if unspecified.
 */
function sanitizeFilmRhythm(raw: FilmRhythmPlan | undefined, N: number): FilmRhythmPlan {
  const inRange = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < N;

  // Default fallback shape: a gentle slow_build_then_release wave so any
  // downstream code that reads filmRhythm has something to work with.
  const fallback: FilmRhythmPlan = {
    energyCurve: Array.from({ length: N }, (_, i) =>
      Math.min(0.95, Math.max(0.2, 0.3 + (i / Math.max(1, N - 1)) * 0.5)),
    ),
    restMoments: [],
    impactMoments: N > 2 ? [N - 2] : [],
    releaseMoments: N > 1 ? [N - 1] : [],
    climaxIndex: Math.max(0, N - 2),
    cadenceMode: "slow_build_then_release",
    restraintNotes: [],
  };

  if (!raw) return fallback;

  let energyCurve = Array.isArray(raw.energyCurve)
    ? raw.energyCurve.map((v) => Math.min(1, Math.max(0, Number(v) || 0)))
    : fallback.energyCurve;
  if (energyCurve.length !== N) {
    // Length mismatch — interpolate (or pad with last) to match N.
    if (energyCurve.length === 0) energyCurve = fallback.energyCurve;
    else {
      const src = energyCurve;
      energyCurve = Array.from({ length: N }, (_, i) => {
        const idx = Math.round((i / Math.max(1, N - 1)) * (src.length - 1));
        return src[Math.min(src.length - 1, Math.max(0, idx))];
      });
    }
  }

  const restMoments = (raw.restMoments ?? []).filter(inRange);
  const impactMoments = (raw.impactMoments ?? []).filter(inRange);
  const releaseMoments = (raw.releaseMoments ?? []).filter(inRange);
  const climaxIndex = inRange(raw.climaxIndex)
    ? raw.climaxIndex
    : impactMoments.length > 0
      ? impactMoments[impactMoments.length - 1]
      : fallback.climaxIndex;
  const cadenceMode = (CADENCE_MODES as readonly string[]).includes(raw.cadenceMode)
    ? raw.cadenceMode
    : fallback.cadenceMode;
  const restraintNotes = Array.isArray(raw.restraintNotes)
    ? raw.restraintNotes.filter((s) => typeof s === "string" && s.length > 0)
    : [];

  return {
    energyCurve,
    restMoments,
    impactMoments,
    releaseMoments,
    climaxIndex,
    cadenceMode,
    restraintNotes,
  };
}

// ─── Scene fill: per-scene user prompt + generator ─────────────────────────

/**
 * Render the FILM RHYTHM POSITION block — tells the scene where it sits in
 * the energy wave (rest / build / impact / release / climax), its pacingIntent,
 * and any restraintNotes that mention this scene. Drives principles #1 and #7
 * (dead-frame-vs-restraint, the film breathes).
 */
function renderFilmRhythmPositionBlock(
  blueprint: FilmBlueprint,
  sceneIndex: number,
): string {
  const r = blueprint.filmRhythm;
  const sid = `s${sceneIndex + 1}`;
  const curr = blueprint.sceneOutline[sceneIndex];

  const roleTags: string[] = [];
  if (r.climaxIndex === sceneIndex) roleTags.push("CLIMAX");
  if (r.impactMoments.includes(sceneIndex)) roleTags.push("IMPACT");
  if (r.restMoments.includes(sceneIndex)) roleTags.push("REST");
  if (r.releaseMoments.includes(sceneIndex)) roleTags.push("RELEASE");
  const roleLabel = roleTags.length > 0 ? roleTags.join(" + ") : "build/standard";

  const energy = r.energyCurve[sceneIndex] ?? 0.5;
  const prevEnergy = sceneIndex > 0 ? r.energyCurve[sceneIndex - 1] ?? null : null;
  const nextEnergy =
    sceneIndex < r.energyCurve.length - 1 ? r.energyCurve[sceneIndex + 1] ?? null : null;

  const trend =
    prevEnergy === null
      ? "(opening scene — set the floor)"
      : energy > prevEnergy + 0.1
        ? `RISING (prev=${prevEnergy.toFixed(2)} → this=${energy.toFixed(2)})`
        : energy < prevEnergy - 0.1
          ? `FALLING (prev=${prevEnergy.toFixed(2)} → this=${energy.toFixed(2)})`
          : `STEADY (prev=${prevEnergy.toFixed(2)} → this=${energy.toFixed(2)})`;
  const lookahead =
    nextEnergy === null
      ? "(final scene — close the wave)"
      : nextEnergy > energy + 0.1
        ? `the next scene RISES to ${nextEnergy.toFixed(2)} — set up the lift`
        : nextEnergy < energy - 0.1
          ? `the next scene FALLS to ${nextEnergy.toFixed(2)} — earn the come-down`
          : `the next scene stays near ${nextEnergy.toFixed(2)}`;

  // Restraint notes that name this scene by id.
  const relevantNotes = r.restraintNotes.filter((n) => n.toLowerCase().includes(sid.toLowerCase()));

  // Pacing-intent guidance line — calibrates motion density per principle #1.
  const pacingGuide = curr.pacingIntent
    ? {
        punch:
          "PUNCH — fast, energetic. The scene should land HARD and clear in well under its duration. Motion is decisive, no lingering. Hard cut at the end.",
        beat:
          "BEAT — standard pacing. Workhorse rhythm: reveal → hold → exit. Don't over-animate.",
        cinematic:
          "CINEMATIC — intentional, breathing. The scene needs time to LAND. Slower easings, longer holds, fewer simultaneous animations. The audience should feel the frame.",
        hold:
          "HOLD — an earned moment of stillness OR the film's hardest hit. If REST role: nearly static after entrance, the focal beat holds for most of the duration — this is INTENTIONAL RESTRAINT, NOT a dead frame. If IMPACT/CLIMAX role: maximize visual weight; this is the moment everything pays off.",
      }[curr.pacingIntent]
    : null;

  return `══════════════════════════════════════════════════════════════════════════════
FILM RHYTHM POSITION
══════════════════════════════════════════════════════════════════════════════

  cadenceMode:    ${r.cadenceMode}
  this scene:     ${sid} — role: ${roleLabel}
  energy:         ${energy.toFixed(2)} on a 0..1 scale; trend ${trend}
  what's next:    ${lookahead}
  pacingIntent:   ${curr.pacingIntent ?? "(not set)"}${pacingGuide ? `\n     → ${pacingGuide}` : ""}
${
  relevantNotes.length > 0
    ? `  film-level restraint notes that mention this scene:\n${relevantNotes.map((n) => `     · ${n}`).join("\n")}`
    : `  film-level restraint notes: (none specific to this scene)`
}

  Calibrate motion density to your role:
    • REST scenes: very few animated elements, very few simultaneous motions, long held beats. Intentional stillness. NOT a dead frame — the held shot IS the content.
    • IMPACT/CLIMAX scenes: highest visual weight in the film. Multiple coordinated motions allowed. Earn it.
    • RELEASE scenes: come down from impact. Energy drops; one or two graceful exits.
    • build/standard scenes: normal reveal → hold → exit, calibrated to pacingIntent.
`;
}

/**
 * Render the LOCKED ASSETS block for the per-scene user prompt. Empty string
 * if the scene has no locked assets (preserves the existing prompt shape for
 * type-only films).
 *
 * The instructions are deliberately surgical — the model embeds these URLs
 * verbatim and styles synthetic_css slots from their cssDirective. No "feel
 * free to choose other assets" framing: the planning stage already decided.
 */
function renderLockedAssetsForSceneFill(curr: SceneBrief): string {
  if (!curr.lockedAssets || curr.lockedAssets.length === 0) return "";

  // Size guidance per slot — the LLM keeps under-sizing assets to small
  // corner thumbnails when given full creative freedom. These are MINIMUMS,
  // not maximums; the model should go larger when the brief calls for it.
  const sizeGuideForSlot = (slot: string): string => {
    switch (slot) {
      case "hero_product":
      case "ui_mockup":
      case "screenshot":
      case "environmental":
        return "MAJOR visual element — should occupy a substantial fraction of the 1920x1080 canvas (typically 40-70% width). NOT a thumbnail.";
      case "background_texture":
        return "FULL-BLEED — should fill the canvas (or at least the area behind text) as the scene's backdrop. Use object-fit: cover.";
      case "logo":
        return "PROMINENT in lockup scenes (width ~280-420px); SMALL/QUIET in early scenes (~60-80px corner attribution).";
      case "stock_photo":
        return "Major visual element — 40-70% width unless the brief explicitly calls for an inset/aside.";
      case "icon":
        return "Small but legible — 64-120px, paired with text or used as a focal accent.";
      case "accent_shape":
        return "Decorative element — size to support the composition without dominating it.";
      default:
        return "Sized appropriately to serve the scene's beat — never a corner thumbnail unless the brief explicitly calls for one.";
    }
  };

  const lines: string[] = [
    "",
    "═══ LOCKED ASSETS — embed these verbatim. Do NOT invent other src= URLs. ═══",
    "",
    "  HARD RULES that apply to every locked asset:",
    "    • The asset MUST be visible by the time the scene reaches its focal beat.",
    "      Default state in sceneCss can be opacity:0 / transform:scale(0.95) etc.,",
    "      BUT the GSAP timeline MUST animate it to opacity:1 well before the scene ends.",
    "      If a locked asset is never animated to visible state, the scene is broken.",
    "    • The asset is a PRIMARY visual element of the scene, not decoration. Size it",
    "      to play its role (see per-slot guidance below). Tiny corner thumbnails are",
    "      almost always wrong — if you size a hero_product to 200px wide on a 1920px",
    "      canvas, the scene fails.",
    "    • Position the asset deliberately — anchor it to a screen region that matches",
    "      the scene's brief and focalElementHint. Do NOT just drop it in the top-left",
    "      with default positioning.",
    "    • The asset must NOT be clipped/cut off by the canvas edge unless the brief",
    "      explicitly calls for a bleed. Use overflow handling on the scene-content",
    "      container, not on the asset.",
    "    • <img> elements REQUIRE class=\"clip\" + data-start + data-duration +",
    "      data-track-index per the HyperFrames spec — see the spec section above.",
    "    • The asset must have a higher visual weight than supporting text unless the",
    "      brief says otherwise. Don't shrink the image to make room for a label.",
    "",
    "  Per-asset details:",
  ];
  for (const a of curr.lockedAssets) {
    if (a.url) {
      lines.push(`    · ${a.slot} (role: ${a.role})`);
      lines.push(`        url:    ${a.url}`);
      lines.push(`        size:   ${sizeGuideForSlot(a.slot)}`);
      lines.push(
        `        embed:  <img src="${a.url}" alt="..." id="<scene-unique-id>" class="clip" data-start="..." data-duration="..." data-track-index="...">`,
      );
      lines.push(
        `                (use <video> with the same data-* contract for .mp4/.webm. NEVER add class="clip" to a <video> — wrap it in a div instead.)`,
      );
      lines.push(`        css:    sceneCss must give it a visible width/height (e.g. width:60vw; height:auto; object-fit:cover) AND a deliberate position. Do not rely on intrinsic image size.`);
      lines.push(`        timeline: a tween that brings the asset INTO view (opacity 0→1, scale 0.92→1, drift, etc.) timed so the asset is fully visible by the scene's focal beat.`);
    } else if (a.cssDirective) {
      lines.push(`    · ${a.slot} (role: ${a.role})`);
      lines.push(`        cssDirective: ${a.cssDirective}`);
      lines.push(`        size:   ${sizeGuideForSlot(a.slot)}`);
      lines.push(`        render: pure sceneCss — NO <img>, NO fetched media. Follow the directive literally.`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Compute the prev/curr/next brief window for a given scene index. */
function sceneWindow(
  outline: SceneBrief[],
  sceneIndex: number,
): { prev: SceneBrief | null; curr: SceneBrief; next: SceneBrief | null } {
  return {
    prev: sceneIndex > 0 ? outline[sceneIndex - 1] : null,
    curr: outline[sceneIndex],
    next: sceneIndex < outline.length - 1 ? outline[sceneIndex + 1] : null,
  };
}

/**
 * Build the user-prompt content for a single scene fill call.
 *
 * Sends ONLY locked globals + prev/curr/next briefs (never the full outline)
 * + structured previous-scene continuity (real if available, intent-fallback
 * if this is the second scene in a parallel group) + motif registry + banned
 * repeats + optional lint feedback from a prior failed attempt.
 */
function buildSceneFillUserPrompt(
  blueprint: FilmBlueprint,
  sceneIndex: number,
  continuityState: ContinuityState,
  /**
   * If set, this scene is in the SECOND slot of a parallel group of 2 and the
   * previous scene hasn't produced its real continuitySummary yet. We fall
   * back to the previous scene's blueprint-level intent so the second scene
   * still gets a continuity anchor.
   */
  prevSceneIntentFallback: SceneBrief | null,
  /**
   * Refinement feedback from a previous attempt — drives the retry loop.
   * kind="lint" feeds in lintCompositionHTML error messages; kind="vision"
   * feeds in critique-driven issues (severity / dimension / description /
   * suggestedFix). The system prompt is identical either way so prompt cache
   * stays warm — only the user-message labeling changes.
   */
  feedback: SceneFillFeedback | null,
): string {
  const { prev, curr, next } = sceneWindow(blueprint.sceneOutline, sceneIndex);
  const identity = blueprint.visualIdentity;
  const ml = blueprint.motionLanguage;

  const usedMotifs = Array.from(continuityState.motifRegistry);
  const bannedMotifs = usedMotifs.length > 0
    ? `BANNED — do NOT reuse these motifs (they were already spent in earlier scenes):\n  ${usedMotifs.join(", ")}`
    : `BANNED — (none yet; this is an early scene — set the motif tone for what follows)`;

  // Previous-scene continuity block. Three possibilities:
  //   1. continuityState.prevSceneSummary set → use the REAL structured summary.
  //   2. prevSceneIntentFallback set → use the BLUEPRINT INTENT of the preceding scene.
  //   3. neither → this is scene 1, no prior continuity to thread.
  let prevContinuityBlock: string;
  if (continuityState.prevSceneSummary) {
    const s = continuityState.prevSceneSummary;
    prevContinuityBlock = [
      `PREVIOUS SCENE ACTUAL END STATE (id=${continuityState.prevSceneId}, real continuity — carry this forward):`,
      `  endStateType:       ${s.endStateType}`,
      `  focalElement:       id="${s.focalElement.id}", role=${s.focalElement.role}, screenRegion=${s.focalElement.screenRegion}`,
      `  motionDirection:    ${s.motionDirection}`,
      `  transitionOut:      ${s.transitionOutType}`,
      `  motifsAlreadyUsed:  ${s.motifsUsed.join(", ") || "(none)"}`,
      s.notes ? `  notes:              ${s.notes}` : "",
    ].filter(Boolean).join("\n");
  } else if (prevSceneIntentFallback) {
    prevContinuityBlock = [
      `PREVIOUS SCENE (id=${prevSceneIntentFallback.id}, blueprint INTENT only — real output is being generated in parallel):`,
      `  brief:              ${prevSceneIntentFallback.brief}`,
      `  focalElementHint:   ${prevSceneIntentFallback.focalElementHint}`,
      `  endStateHint:       ${prevSceneIntentFallback.endStateHint}`,
      `  transitionOutIntent: ${prevSceneIntentFallback.transitionOutIntent}`,
    ].join("\n");
  } else {
    prevContinuityBlock = `PREVIOUS SCENE: none (this is scene 1 — establish the film's visual tone).`;
  }

  const nextBlock = next
    ? [
        `NEXT SCENE (id=${next.id}, intent only — not yet generated):`,
        `  brief:              ${next.brief}`,
        `  focalElementHint:   ${next.focalElementHint}`,
        `  startStateHint:     ${next.startStateHint}`,
        `  transitionInIntent: ${next.transitionInIntent}`,
        `  → your transitionOutType must set this scene up to land where ${next.id} expects to begin.`,
      ].join("\n")
    : `NEXT SCENE: none (this is the final scene — close cleanly, end on the focal beat).`;

  const lintBlock = feedback
    ? feedback.kind === "lint"
      ? `\n═══ LINT FEEDBACK FROM PREVIOUS ATTEMPT (fix these — do not introduce new issues) ═══\n${feedback.text}\n`
      : `\n═══ VISION CRITIQUE FEEDBACK FROM PREVIOUS ATTEMPT (cinematic issues — patch what's flagged, don't redesign blindly) ═══\n${feedback.text}\n`
    : "";

  return `${lintBlock}
LOCKED GLOBALS (every scene in this film shares these):

  Visual identity:
    palette:        ${identity.paletteName}  (${identity.accents.join(", ")})
    headlineFont:   ${identity.headlineFont}
    bodyFont:       ${identity.bodyFont}
    monoFont:       ${identity.monoFont}
    background:     ${identity.background}     (--bg)
    ink:            ${identity.ink}            (--ink)
    inkMuted:       ${identity.inkMuted}        (--ink-muted)
    textDirection:  ${identity.textDirection}
    assetPolicy:    ${identity.assetPolicy}
    ${identity.logoUrl ? `brandLogo:      ${identity.logoUrl}` : ""}

  Motion grammar:
    easings:        ${ml.easings.join(", ")}
    pacing:         ${ml.pacing}
    cameraFeel:     ${ml.cameraFeel}
    principles:
${ml.principles.map((p) => `      • ${p}`).join("\n")}

  CSS variable overrides applied film-wide:
${Object.entries(blueprint.cssVariables).length > 0
    ? Object.entries(blueprint.cssVariables).map(([k, v]) => `    ${k}: ${v}`).join("\n")
    : "    (none — use the identity-derived defaults the merger writes to :root)"}

══════════════════════════════════════════════════════════════════════════════
SCENE WINDOW
══════════════════════════════════════════════════════════════════════════════

${prev
  ? `PREVIOUS SCENE BRIEF (id=${prev.id}, ${prev.durationSeconds}s):
  brief:              ${prev.brief}
  motionPattern:      ${prev.motionPattern}
  focalElementHint:   ${prev.focalElementHint}
  endStateHint:       ${prev.endStateHint}`
  : `PREVIOUS SCENE BRIEF: none.`}

CURRENT SCENE BRIEF — YOU ARE RENDERING THIS ONE (id=${curr.id}, ${curr.durationSeconds}s):
  copy:               ${curr.copy}
  brief:              ${curr.brief}
  palette:            ${curr.palette.join(", ")}
  motionPattern:      ${curr.motionPattern}
  allowedElements:    ${curr.allowedElements.join(", ")}
  focalElementHint:   ${curr.focalElementHint}
  startStateHint:     ${curr.startStateHint}
  endStateHint:       ${curr.endStateHint}
  transitionInIntent: ${curr.transitionInIntent}
  transitionOutIntent: ${curr.transitionOutIntent}
  transitionInChoice: ${curr.transitionInChoice}  ← emit this exact value as SceneFill.transitionIn
${renderLockedAssetsForSceneFill(curr)}
${next
  ? `NEXT SCENE BRIEF (id=${next.id}, ${next.durationSeconds}s):
  brief:              ${next.brief}
  motionPattern:      ${next.motionPattern}
  focalElementHint:   ${next.focalElementHint}
  startStateHint:     ${next.startStateHint}
  transitionInIntent: ${next.transitionInIntent}`
  : `NEXT SCENE BRIEF: none (this scene closes the film).`}

${renderFilmRhythmPositionBlock(blueprint, sceneIndex)}
══════════════════════════════════════════════════════════════════════════════
CONTINUITY THREAD
══════════════════════════════════════════════════════════════════════════════

${prevContinuityBlock}

${nextBlock}

${bannedMotifs}

══════════════════════════════════════════════════════════════════════════════
OUTPUT CONTRACT
══════════════════════════════════════════════════════════════════════════════

Emit a SINGLE SceneFill JSON for scene "${curr.id}" — NOT a FilmFills wrapper, NOT an array of scenes. The JSON shape is enforced by the response schema.

Required fields:
  • id                  = "${curr.id}" exactly.
  • contentHtml         — HTML for THIS scene only, placed inside <div class="scene-content">.
                          Scoped element ids should be unique-enough to not collide if reused across scenes
                          (the merger wraps each scene in <section id="${curr.id}">).
  • sceneCss            — CSS scoped to "#${curr.id} ..." selectors.
  • timeline            — GSAP timeline calls, scene-local time axis (0 = scene start, max = ${curr.durationSeconds}s).
  • transitionIn        = "${curr.transitionInChoice}" (locked by the blueprint).
  • continuitySummary   — STRUCTURED continuity output:
        endStateType        — one of: ${END_STATE_TYPES.join(" | ")}.
        focalElement        — { id (must match an id present in your contentHtml),
                                role (one of ${FOCAL_ROLES.join("|")}),
                                screenRegion (one of ${SCREEN_REGIONS.join("|")}) }.
        motionDirection     — one of: ${MOTION_DIRECTIONS.join(" | ")}.
        transitionOutType   — one of: ${TRANSITION_TYPES.join(" | ")}.
                              MUST set up the NEXT scene's transitionInIntent.
        motifsUsed          — array; pick from: ${MOTIFS.join(", ")}.
                              DO NOT include any motif from the BANNED list above.
        notes               — OPTIONAL, ≤120 chars. Omit unless the enums truly can't
                              express something the next scene needs to know.

DO NOT:
  • emit a wrapping object with "scenes" or "fills" — the schema enforces a single SceneFill.
  • reuse element ids across motifs (each animated element needs a stable, scene-unique id).
  • emit motifs from the banned list — pick fresh ones.
  • drift from the locked motion grammar (use the easings above, not new ones).
`;
}

/** Labeled feedback fed into a scene-fill retry. */
export type SceneFillFeedback = { kind: "lint" | "vision"; text: string };

/**
 * Run one scene-fill LLM call. Streaming, structured-output enforced.
 * Reuses FILM_SYSTEM_PROMPT verbatim so the cache key matches across every
 * scene call in the batch (cache-create on the first, cache-read on the rest).
 */
async function generateSceneFill(
  blueprint: FilmBlueprint,
  sceneIndex: number,
  continuityState: ContinuityState,
  prevSceneIntentFallback: SceneBrief | null,
  feedback: SceneFillFeedback | null,
): Promise<SceneFill> {
  const client = getClient();
  const curr = blueprint.sceneOutline[sceneIndex];

  const userText = buildSceneFillUserPrompt(
    blueprint,
    sceneIndex,
    continuityState,
    prevSceneIntentFallback,
    feedback,
  );

  const stream = client.messages.stream({
    model: MODEL,
    system: [
      {
        type: "text",
        // Verbatim FILM_SYSTEM_PROMPT — byte-identical across every scene
        // call so Anthropic's prompt cache keys match. First call in a batch
        // pays cache-create; later calls pay cache-read.
        text: FILM_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
    // Headroom for effort="high" + adaptive thinking. With effort=high, the
    // model burns a LOT on thinking BEFORE any JSON streams; on dense scenes
    // (e.g. 9-scene films, complex compositions) it can chew through 20-30K
    // thinking tokens before emitting the contentHtml/sceneCss/timeline.
    // Sequence of bumps:
    //   12K → truncated JSON at ~position 10500
    //   32K → still truncated at ~position 10250
    //   48K → matches the legacy single-call ceiling; should clear it.
    // max_tokens is a clamp, not a budget — the model only spends what it
    // needs and stops. We are not paying for unused headroom.
    max_tokens: 48000,
    thinking: { type: "adaptive" },
    output_config: {
      // Per-scene rendering is the visible quality bottleneck — high effort
      // is worth the extra wall time. The first user feedback against
      // scene-fill output (assets sized/placed badly) was traced to weaker
      // composition reasoning, not prompt clarity. Keep blueprint + asset
      // plan at medium since those are short structured calls.
      effort: "high",
      format: { type: "json_schema", schema: SCENE_FILL_SCHEMA },
    },
  });
  const response = await stream.finalMessage();

  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") raw += block.text;
  }
  const usage = response.usage;
  console.log(
    `[hyperframes scene ${curr.id}] stop_reason=${response.stop_reason} ` +
      `input=${usage.input_tokens} output=${usage.output_tokens} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} ` +
      `cache_create=${usage.cache_creation_input_tokens ?? 0}`,
  );

  if (!raw.trim()) {
    const hint =
      response.stop_reason === "max_tokens"
        ? "stop_reason=max_tokens — bump max_tokens or lower output_config.effort"
        : "model returned no text content (thinking exhausted output budget)";
    throw new Error(
      `generateSceneFill[${curr.id}]: empty response (${hint}). usage=${JSON.stringify(usage)}`,
    );
  }

  const parsed = parseJsonResponseOrThrow<SceneFill>(
    raw,
    `generateSceneFill[${curr.id}]`,
    response.stop_reason,
    usage.output_tokens,
  );

  // Safety: pin the id and transitionIn to what the blueprint demanded.
  return {
    ...parsed,
    id: curr.id,
    transitionIn: curr.transitionInChoice,
  };
}

/** Immutable snapshot of the continuity state at the moment a scene was called. */
export type SceneCallContext = {
  /** Continuity state visible to this scene at call time. Frozen. */
  continuityState: ContinuityState;
  /** Blueprint-level intent fallback for the immediate predecessor (only set for slot 2 of a group). */
  prevSceneIntentFallback: SceneBrief | null;
};

function snapshotContinuity(state: ContinuityState): ContinuityState {
  return {
    prevSceneSummary: state.prevSceneSummary,
    prevSceneId: state.prevSceneId,
    motifRegistry: new Set(state.motifRegistry),
    completedSceneIds: [...state.completedSceneIds],
  };
}

/**
 * Stage B orchestrator. Scene 1 solo, then groups of 2 with continuity state
 * threaded between groups. Each scene receives the prev/curr/next-brief
 * window (never the full outline) plus the real structured continuity from
 * the prior group's actual output.
 *
 * Returns both the fills and the per-scene call contexts so the lint retry
 * can re-call a single failing scene with the SAME continuity state it
 * originally saw (rather than re-walking the whole pipeline).
 */
async function generateScenesWithContinuity(
  blueprint: FilmBlueprint,
): Promise<{ fills: SceneFill[]; contexts: SceneCallContext[] }> {
  const N = blueprint.sceneOutline.length;
  if (N === 0) return { fills: [], contexts: [] };

  const fills: SceneFill[] = new Array(N);
  const contexts: SceneCallContext[] = new Array(N);
  const continuityState: ContinuityState = {
    prevSceneSummary: null,
    prevSceneId: null,
    motifRegistry: new Set<Motif>(),
    completedSceneIds: [],
  };

  const advanceContinuity = (fill: SceneFill): void => {
    if (fill.continuitySummary) {
      continuityState.prevSceneSummary = fill.continuitySummary;
      continuityState.prevSceneId = fill.id;
      for (const m of fill.continuitySummary.motifsUsed) {
        continuityState.motifRegistry.add(m);
      }
    }
    continuityState.completedSceneIds.push(fill.id);
  };

  // Scene 1 — solo. Establishes the first real continuity anchor.
  console.log(`[hyperframes orchestrator] scene 1/${N} (solo)`);
  contexts[0] = { continuityState: snapshotContinuity(continuityState), prevSceneIntentFallback: null };
  fills[0] = await generateSceneFill(blueprint, 0, contexts[0].continuityState, null, null);
  advanceContinuity(fills[0]);

  // Scenes 2..N in groups of 2 (parallel within, sequential between).
  let i = 1;
  while (i < N) {
    const groupSize = Math.min(2, N - i);
    const groupIndices = Array.from({ length: groupSize }, (_, k) => i + k);
    console.log(
      `[hyperframes orchestrator] group ${groupIndices.map((g) => `s${g + 1}`).join(",")} (parallel ${groupSize}/${groupSize})`,
    );

    // Snapshot ONCE per group — both scenes in the group see the same
    // continuity state (the slot-1 scene's real output won't exist until
    // after Promise.all returns, so the slot-2 scene gets a blueprint-intent
    // fallback for its immediate predecessor).
    const groupSnapshot = snapshotContinuity(continuityState);

    for (let k = 0; k < groupSize; k++) {
      contexts[groupIndices[k]] = {
        continuityState: groupSnapshot,
        prevSceneIntentFallback:
          k === 0 ? null : blueprint.sceneOutline[groupIndices[k - 1]],
      };
    }

    const groupResults = await Promise.all(
      groupIndices.map((idx) =>
        generateSceneFill(
          blueprint,
          idx,
          contexts[idx].continuityState,
          contexts[idx].prevSceneIntentFallback,
          null,
        ),
      ),
    );

    for (let k = 0; k < groupResults.length; k++) {
      fills[groupIndices[k]] = groupResults[k];
      advanceContinuity(groupResults[k]);
    }

    i += groupSize;
  }

  return { fills, contexts };
}

/**
 * Group lint findings by which scene they reference, by pattern-matching
 * scene ids ("s1", "s2", ...) out of the message / fixHint text. Returns a
 * map from sceneId → human-readable error list. Findings that don't mention
 * any scene id land under the special key "__global__".
 */
function bucketLintErrorsBySceneId(errors: LintFinding[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  const push = (key: string, line: string) => {
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  };
  for (const e of errors) {
    const blob = `${e.message} ${e.fixHint ?? ""}`;
    const m = blob.match(/\bs(\d+)\b/);
    const key = m ? `s${m[1]}` : "__global__";
    const line = `[${e.code}] ${e.message}${e.fixHint ? ` — fix hint: ${e.fixHint}` : ""}`;
    push(key, line);
  }
  return buckets;
}

/**
 * Top-level film generator. Now a thin orchestrator over the blueprint +
 * batched-scenes pipeline. Keeps the original signature and return shape so
 * `app/lib/jobs.ts` and `buildFilmSkeleton` consumers don't need changes.
 *
 * Pipeline:
 *   1. generateFilmBlueprint — locks globals + per-scene briefs.
 *   2. generateScenesWithContinuity — scene 1 solo, then groups of 2.
 *   3. buildFilmSkeleton — merges fills into the static HTML shell (unchanged).
 *   4. lintCompositionHTML — runs once on merged HTML.
 *   5. If lint fails, regenerate only the failing scenes with lint feedback,
 *      reusing each scene's original continuity-state snapshot (the orchestrator
 *      captures these). One retry round; if still failing, log + return last.
 */
/**
 * Return type for generateFilmHTML. Carries the blueprint + per-scene call
 * contexts so callers that want to run the v2 vision-critique + refinement
 * stage can re-fire individual scenes with the same continuity snapshot the
 * orchestrator originally used. Existing callers that destructure only
 * `{ html }` remain backwards-compatible.
 */
export type GenerateFilmHTMLResult = {
  html: string;
  fills: FilmFills;
  blueprint: FilmBlueprint;
  sceneContexts: SceneCallContext[];
};

export async function generateFilmHTML(
  storyboard: Storyboard,
  identity: VisualIdentity = DEFAULT_VISUAL_IDENTITY,
  assetCatalog?: SourcedAssetCatalog,
  // Perf A3: callers can pre-build the blueprint (e.g. in parallel with
  // `sourceAssets`) and pass it in to skip the internal blueprint LLM call.
  // The caller is responsible for stamping locked assets via
  // `applyLockedAssetsToBlueprint` before passing the blueprint in.
  prebuiltBlueprint?: FilmBlueprint,
): Promise<GenerateFilmHTMLResult> {
  const blueprint =
    prebuiltBlueprint ?? (await generateFilmBlueprint(storyboard, identity, assetCatalog));

  const { fills: sceneFills, contexts } = await generateScenesWithContinuity(blueprint);

  let fills: FilmFills = {
    cssVariables: blueprint.cssVariables,
    scenes: sceneFills,
  };
  let html = buildFilmSkeleton(storyboard, identity, fills);

  let lint = await lintCompositionHTML(html);
  if (lint.ok) {
    console.log(`[hyperframes film] lint clean on first pass (${sceneFills.length} scenes)`);
    return { html, fills, blueprint, sceneContexts: contexts };
  }

  // Per-scene lint retry: bucket errors by scene id, regenerate only the
  // failing scenes (in parallel) using their original continuity contexts.
  const buckets = bucketLintErrorsBySceneId(lint.errors);
  const failingSceneIds = Array.from(buckets.keys()).filter((k) => k !== "__global__");
  const globalErrors = buckets.get("__global__") ?? [];

  if (failingSceneIds.length === 0) {
    // Couldn't attribute any error to a scene — global skeleton-level issue
    // that per-scene retry can't fix. Log and return.
    console.warn(
      `[hyperframes film] lint failed with only global errors (no scene id resolved). Keeping HTML. Errors: ${globalErrors.join(" | ") || lint.errors.map((e) => e.code).join(", ")}`,
    );
    return { html, fills, blueprint, sceneContexts: contexts };
  }

  console.log(
    `[hyperframes film] lint failed on first pass (${lint.errors.length} error${lint.errors.length === 1 ? "" : "s"}). ` +
      `Per-scene retry: ${failingSceneIds.join(", ")}${globalErrors.length > 0 ? ` (+ ${globalErrors.length} unattributed errors will be appended to every retry)` : ""}.`,
  );

  const retries = await Promise.all(
    failingSceneIds.map(async (sceneId) => {
      const sceneIndex = blueprint.sceneOutline.findIndex((b) => b.id === sceneId);
      if (sceneIndex < 0) {
        console.warn(`[hyperframes film] lint mentioned ${sceneId} but blueprint has no such scene — skipping retry for it.`);
        return null;
      }
      const sceneErrors = buckets.get(sceneId) ?? [];
      const feedback = [
        `Lint errors attributed to scene ${sceneId}:`,
        ...sceneErrors.map((e, i) => `  ${i + 1}. ${e}`),
        ...(globalErrors.length > 0
          ? [
              ``,
              `These global errors may also relate to this scene (could not be attributed):`,
              ...globalErrors.map((e, i) => `  G${i + 1}. ${e}`),
            ]
          : []),
      ].join("\n");
      const ctx = contexts[sceneIndex];
      const fresh = await generateSceneFill(
        blueprint,
        sceneIndex,
        ctx.continuityState,
        ctx.prevSceneIntentFallback,
        { kind: "lint", text: feedback },
      );
      return { sceneIndex, fresh };
    }),
  );

  for (const r of retries) {
    if (r) sceneFills[r.sceneIndex] = r.fresh;
  }

  fills = { cssVariables: blueprint.cssVariables, scenes: sceneFills };
  html = buildFilmSkeleton(storyboard, identity, fills);

  lint = await lintCompositionHTML(html);
  if (lint.ok) {
    console.log(
      `[hyperframes film] lint clean after per-scene retry (${failingSceneIds.length} scene${failingSceneIds.length === 1 ? "" : "s"} re-fired)`,
    );
    return { html, fills, blueprint, sceneContexts: contexts };
  }

  console.warn(
    `[hyperframes film] lint still failing after per-scene retry — keeping last HTML. Errors: ${lint.errors.map((e) => e.code).join(", ")}`,
  );
  return { html, fills, blueprint, sceneContexts: contexts };
}

// ─── Refinement (Stage 8) — generalizes per-scene retry for vision feedback ─

/**
 * One scene's refinement request. The caller formats critique issues into a
 * single `feedbackText` string (with the structured severity / dimension /
 * description / suggestedFix lines) and we feed that into generateSceneFill
 * via the kind="vision" feedback branch.
 */
export type SceneRefinementRequest = {
  sceneId: string;
  feedbackText: string;
};

/**
 * Re-fire selected scenes in parallel with vision-critique feedback, reusing
 * each scene's original continuity-state snapshot from the orchestrator. Cap
 * at one round — no recursion. Returns the patched scene fills.
 *
 * Unknown sceneIds are logged and skipped (the caller's refinement set might
 * include ids from a stale critique).
 */
export async function refineScenes(
  blueprint: FilmBlueprint,
  sceneContexts: SceneCallContext[],
  fills: SceneFill[],
  refinements: SceneRefinementRequest[],
): Promise<SceneFill[]> {
  if (refinements.length === 0) return fills;

  const indexed = refinements
    .map((r) => {
      const sceneIndex = blueprint.sceneOutline.findIndex((b) => b.id === r.sceneId);
      if (sceneIndex < 0) {
        console.warn(`[refine] critique referenced ${r.sceneId} but blueprint has no such scene — skipping`);
        return null;
      }
      return { sceneIndex, sceneId: r.sceneId, feedbackText: r.feedbackText };
    })
    .filter((x): x is { sceneIndex: number; sceneId: string; feedbackText: string } => x !== null);

  if (indexed.length === 0) return fills;

  console.log(
    `[refine] re-firing ${indexed.length} scene${indexed.length === 1 ? "" : "s"} with vision feedback: ${indexed.map((x) => x.sceneId).join(", ")}`,
  );

  const fresh = await Promise.all(
    indexed.map((x) => {
      const ctx = sceneContexts[x.sceneIndex];
      return generateSceneFill(
        blueprint,
        x.sceneIndex,
        ctx.continuityState,
        ctx.prevSceneIntentFallback,
        { kind: "vision", text: x.feedbackText },
      );
    }),
  );

  const next = fills.slice();
  for (let i = 0; i < indexed.length; i++) {
    next[indexed[i].sceneIndex] = fresh[i];
  }
  return next;
}

/**
 * Translate critique outputs into a single refinement set: scenes flagged
 * for refine/reject at the per-scene level, PLUS scenes referenced by film-
 * level major-issue affectedSceneIds. Per-scene + film-level feedback for
 * the SAME scene is concatenated into one labeled feedback block.
 */
export function buildRefinementSet(
  perSceneCritiques: SceneCritique[],
  filmCritique: FilmCritique | null,
): SceneRefinementRequest[] {
  const bySceneId = new Map<string, { sceneIssues: string[]; filmIssues: string[] }>();

  for (const c of perSceneCritiques) {
    const needsRefine =
      c.verdict === "refine" ||
      c.verdict === "reject" ||
      c.issues.some((i) => i.severity === "major");
    if (!needsRefine) continue;
    const lines = c.issues.map(
      (i) =>
        `  [${i.severity}] ${i.dimension}: ${i.description} → ${i.suggestedFix}`,
    );
    bySceneId.set(c.sceneId, { sceneIssues: lines, filmIssues: [] });
  }

  if (filmCritique) {
    for (const f of filmCritique.filmLevelIssues) {
      if (f.severity !== "major" && filmCritique.verdict !== "redesign_rhythm") continue;
      const line = `  [${f.severity}] ${f.dimension}: ${f.description} → ${f.suggestedFix}`;
      for (const sid of f.affectedSceneIds) {
        const entry = bySceneId.get(sid) ?? { sceneIssues: [], filmIssues: [] };
        entry.filmIssues.push(line);
        bySceneId.set(sid, entry);
      }
    }
  }

  return Array.from(bySceneId.entries()).map(([sceneId, { sceneIssues, filmIssues }]) => {
    const parts: string[] = [];
    if (sceneIssues.length > 0) {
      parts.push("PER-SCENE ISSUES (from this scene's own vision critique):");
      parts.push(...sceneIssues);
    }
    if (filmIssues.length > 0) {
      if (parts.length > 0) parts.push("");
      parts.push("FILM-LEVEL ISSUES (this scene contributes to a film-level problem):");
      parts.push(...filmIssues);
    }
    return { sceneId, feedbackText: parts.join("\n") };
  });
}
