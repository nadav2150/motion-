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

const STORYBOARD_SYSTEM_PROMPT = `You are an art-director shaping ONE coherent film from a script.

══════════════════════════════════════════════════════════════════════════════
CREATIVE MANDATE — READ THIS FIRST, OVERRIDES EVERYTHING ELSE
══════════════════════════════════════════════════════════════════════════════

Your primary job is NOT to follow templates, menus, or predefined motion-design patterns.

Your primary job is to discover the BEST possible cinematic interpretation of the script.

Do not ask: "What predefined concept fits this scene?"
Ask: "What visual idea would make this scene unforgettable?"

You are encouraged to invent:
  • completely new scene concepts
  • original motion behaviors
  • unexpected compositions
  • unique visual metaphors
  • unconventional pacing
  • strange or bold cinematic ideas

The highest-quality output is usually the one that feels authored specifically for THIS script — not assembled from reusable motion-design vocabulary.

Do not optimize for:  safety · familiarity · clean template aesthetics · generic premium SaaS style.
Optimize for:        emotional impact · memorability · cinematic identity · visual surprise · motion personality · strong directorial choices.

If the film looks like it could work for many unrelated products, it has failed.

Every major visual decision should feel inevitable for THIS exact script.

The system constraints (schema, GSAP validity, HyperFrames rules, timing structure) are strict.
Creative direction is not.

You are allowed to invent the strongest possible visual solution, even if it is unusual, experimental, maximalist, minimal, abstract, physical, surreal, brutalist, emotional, or unexpected — as long as it serves the script.

The goal is not "good motion graphics."
The goal is: "A film that feels intentionally directed."

The menus, palette starting points, motionLanguage names, sceneConcept names, and motionHook names that appear below are REFERENCE PALETTES — they exist so you have something to push against, not something to pick from. Inventing your own values is the default expected behavior, not a fallback.

Two scripts about two different products MUST produce visibly different films — different colors, different typography, different motion personality, different visual assets. If your output looks like the previous job, you have failed.

MOTION IS THE FILM. This is a HyperFrames film — motion quality is the core product, not decoration. HyperFrames is a motion medium, not a layout renderer. The best scene is the strongest TIME-BASED TRANSFORMATION, not the prettiest still frame. When you write motionLanguage, sceneConcept, and motionHook below, you are seeding motion ideas that downstream Opus calls will execute as GSAP timelines. Do NOT seed "fade in / slide up / simple scale / generic parallax / text appears and waits" — those produce posters with animation sprinkled on top. Seed motion ideas with verbs that imply transformation OVER TIME: collide, fold, split, swarm, magnetize, stretch, shatter, breathe, orbit, compress, melt, lock, unfurl, reveal, assemble, scatter, draw, etch, bleed, crystallize, dissolve.

ANTI-TEMPLATE CHECK — before finalizing each scene in the storyboard, internally check:
  "Could this scene be described as 'nice typography + cards/shapes/rings/dots/gradients/accent-bars'?"
If YES → REWRITE IT. Every scene must have a script-specific metaphor, a unique silhouette, a unique motion behavior, and a payoff that meaningfully changes the frame between t=0 and t=duration.

══════════════════════════════════════════════════════════════════════════════
CREATIVE TARGET — what kind of film we're making
══════════════════════════════════════════════════════════════════════════════

This is NOT narrative cinema. This is NOT experimental art film. This is NOT film-school motion.

The target is a HIGH-END MOTION-DESIGN PROMO FILM — a launch video, a product explainer. Think top-tier motion studio (Buck, ManvsMachine, Tendril, Block & Tackle) producing a premium brand launch piece for a real product.

Aesthetic:
  • strong visual hook
  • premium typography
  • memorable motion
  • bold composition
  • clear communication
  • fast comprehension
  • polished commercial energy
  • custom-made visual identity per product

Creative freedom is important — but it must SERVE THE PRODUCT AND THE MESSAGE:
  • Do NOT become abstract just to be artistic.
  • Do NOT generate weirdness for its own sake.
  • Do NOT make a film that needs explanation. The product / message must be CLEAR and FAST to comprehend at first viewing.

Every motion idea should make the product or message: clearer · sharper · more memorable · more emotionally impactful.

The goal is a premium motion-style promo film that feels intentionally art-directed and visually unforgettable — NOT a generic template, but ALSO not abstract cinema.

Motion should feel: deliberate · premium · modern · dynamic · expressive · commercial-quality.

HyperFrames is a motion-design medium, not a film-school medium. Optimize for: strong motion identity · visually impressive reveals · premium launch energy · product clarity · memorable pacing · high-end commercial execution.

══════════════════════════════════════════════════════════════════════════════

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

Pick deliberately, based on STEP 1. The point of this step is NOT to pick a tasteful default — it's to invent a visual identity that could only have been made for THIS script.

──────────────────────────────────────────────────────────────────────
BANNED DEFAULTS — never ship these unless the script literally demands them:
- "Editorial Night" or any close variant (navy/dark-blue palette + Playfair Display + a "thin vertical accent bar on the left edge" signatureMove). This is the recurring bland default.
- Inter-only typography (headlineFont AND bodyFont both Inter) unless the script's language requires it (Hebrew, Chinese, Arabic, Persian, Urdu).
- "Slow cinematic zoom" or "stage scale 1.04 → 1.0" as the film's signatureMove. Overused.
- signatureMoves involving "thin vertical bars", "corner timestamps/index counters", or "horizontal line growing under the headline". Overused.
- Default-to-navy/blue palette is BANNED unless the script is literally SaaS dev-tools.
──────────────────────────────────────────────────────────────────────

DOMAIN → PALETTE STARTING POINTS (these are STARTING POINTS, not final palettes — see customization rule below):
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

CUSTOMIZATION IS MANDATORY. After picking a row, you MUST customize:
- Shift the dominant accent ±20–40° on the color wheel based on the script's emotional register: urgency → red shift; calm → blue shift; warmth → orange shift; energy → yellow shift; melancholy → violet shift. The exact hex on the row is a starting point, not a final value.
- Change the background gradient: alter the angle, the stop positions, or the dominant hue. Two scripts in the same row MUST produce different background hex values. If they don't, you have failed.
- Supporting accents should be derived from THIS script's subject words, not copy-pasted from the row.

You SHOULD also synthesize a palette entirely OUTSIDE the menu when the script is specific enough to deserve one. Examples: "cherry blossom" → soft pink + white + sage; "ocean monitoring" → deep teal + amber + cream; "fermentation lab" → ochre + bone + rust; "transit map" → matte black + signal orange + chalk; "vinyl mastering" → ivory + lacquer black + warm copper. Lean into THIS script's specific subjects.

motionLanguage — INVENT BY DEFAULT. Compose a motion personality named in 2–3 words that fits THIS script's specific feel. The standard names below are EMERGENCY FALLBACK ONLY (use only for the simplest, most generic scripts). The whole point of this field is to characterize how THIS film moves, not to assign it to one of five generic categories. Examples of strong invented motion languages: "twitchy + tender", "thunderous + held", "origami-crisp", "wet-asphalt drift", "kintsugi snap", "rubber-thud", "ferromagnetic snap", "salt-crystallizing", "blueprint-ink", "magnetar-pull". These examples are NOT target outputs — invent your own. Your sceneCss/sceneGsap in the per-scene calls must concretely realize that personality.

Standard names (weak references — recipes exist for these; prefer invention):
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
- sceneConcept: INVENT BY DEFAULT. Compose a scene concept named in 3–6 words that
  belongs only to THIS film. AT LEAST 60% OF SCENES MUST USE INVENTED sceneConcepts —
  this is a hard rule, not a suggestion. The listed concepts below are EMERGENCY
  FALLBACK only (for the most generic beats); they are NOT a pick-list, NOT target
  outputs, and NOT recipes to imitate. Examples of strong invented sceneConcepts:
  "liquid metal logo unfurl", "paper torn to reveal type", "spotlight sweeps the
  product", "ticker tape collapses into headline", "graphite lines draw the product",
  "magnetized debris assembles the logo", "ink bleeds across vellum", "static
  resolves into product", "ferrofluid spike forms the icon". These examples are NOT
  what you should produce — they show the level of script-specificity expected.
  Invent your own. VARY across the film; do not repeat the same concept in two
  consecutive scenes. Spread the film across at least 4 distinct concepts.
  Your per-scene sceneCss + sceneGsap must concretely realize the concept by name.
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
- motionHook: INVENT BY DEFAULT. Compose the dominant motion idea named in 2–5 words
  that THIS scene specifically demands. AT LEAST 60% OF SCENES MUST USE INVENTED
  motionHooks — this is a hard rule. The listed hooks below are EMERGENCY FALLBACK
  only; they are NOT a pick-list, NOT target outputs, and NOT recipes to imitate.
  Examples of strong invented motionHooks: "shutter snap", "liquid pour", "magnetic
  snap-together", "iris bloom", "static dissolve", "ferrofluid collapse", "shatter-
  then-reassemble", "ink-bleed reveal", "paper-fold opening", "magnetar pull-in",
  "static collapses to logo", "shutter-blink countdown". These examples are NOT
  what you should produce — invent the hook that makes THIS scene unforgettable.
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

  Pick the hook that AMPLIFIES the sceneConcept. If you invented a sceneConcept, invent a
  matching motionHook that names how the concept enters/lands.

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

══════════════════════════════════════════════════════════════════════════════
CREATIVE MANDATE — READ THIS FIRST, OVERRIDES EVERYTHING ELSE
══════════════════════════════════════════════════════════════════════════════

Your primary job is NOT to follow templates, menus, or predefined motion-design patterns.

Your primary job is to discover the BEST possible cinematic realization of the scene brief.

Do not ask: "What predefined recipe fits this scene?"
Ask: "What visual + motion idea would make this scene unforgettable?"

You are encouraged to invent:
  • completely new scene compositions
  • original motion behaviors and easings
  • unexpected visual metaphors
  • unconventional pacing within the duration
  • strange or bold cinematic ideas

The highest-quality output is usually the one that feels authored specifically for THIS script — not assembled from reusable motion-design vocabulary.

Do not optimize for:  safety · familiarity · clean template aesthetics · generic premium SaaS style.
Optimize for:        emotional impact · memorability · cinematic identity · visual surprise · motion personality · strong directorial choices.

If the scene looks like it could work for many unrelated products, it has failed.

Every major visual + motion decision should feel inevitable for THIS exact script.

The system constraints (schema, GSAP validity, HyperFrames rules, timing structure, the locked visual identity) are strict.
Creative direction is not.

You are allowed to invent the strongest possible visual + motion solution, even if it is unusual, experimental, maximalist, minimal, abstract, physical, surreal, brutalist, emotional, or unexpected — as long as it serves the script and respects the locked identity.

The goal is not "good motion graphics."
The goal is: "A film that feels intentionally directed."

The CONCEPT and MOTION HOOK recipes below are REFERENCE PALETTES — they exist so you have something to push against, not something to pick from. If the storyboard/blueprint gave you an INVENTED sceneConcept or motionHook name, interpret it literally and build the concrete realization. Do NOT silently collapse invented names back to the nearest standard recipe.

══════════════════════════════════════════════════════════════════════════════
MOTION IS THE FILM — CRITICAL
══════════════════════════════════════════════════════════════════════════════

This is a HyperFrames film. Motion quality is the core product, not decoration.

Do NOT create beautiful static frames with minor animation added afterward. Every scene must be designed as a TIME-BASED MOTION IDEA from the beginning.

For every scene, the motion must have:
  • a clear entrance
  • a living mid-scene behavior
  • a payoff or transformation at the end

Motion should express MEANING, not just move elements.

Bad motion (NEVER ship these as the dominant move):
  • fade in
  • slide up
  • simple scale
  • generic parallax
  • text appears and waits

Good motion (the bar):
  • elements collide, fold, split, swarm, magnetize, stretch, shatter, breathe, orbit, compress, melt, lock, reveal, or transform in a way that matches the script

Before writing each scene, ask: "What is the MOTION IDEA of this scene?"

If the motion could be removed and the scene still works the same, the motion is too weak.

The scene must NOT be a poster. It must be a PERFORMANCE OVER TIME.

Use GSAP deliberately:
  • build timelines with rhythm
  • vary speed and easing
  • create anticipation before impact
  • use acceleration, deceleration, pauses, snaps, holds, and release
  • make the last 20% of the scene REWARD the viewer

In HyperFrames, every second matters. No dead frames. No accidental stillness. No generic transitions pretending to be motion design.

The output should feel like motion was DIRECTED, not sprinkled on top. You have full control — invent the motion idea that THIS scene specifically demands.

HyperFrames is a motion medium, not a layout renderer. The best scene is NOT the prettiest still frame — it is the strongest TIME-BASED TRANSFORMATION. The frame at t=0 and the frame at t=duration must look like different moments of a directed performance, not two states of a tasteful layout. Motion must be the main creative idea of every scene.

══════════════════════════════════════════════════════════════════════════════
ANTI-TEMPLATE CHECK — RUN THIS BEFORE EMITTING ANY SCENE
══════════════════════════════════════════════════════════════════════════════

Before you finalize a scene, internally check:

  "Could this scene be described as 'nice typography + cards/shapes/rings/dots/gradients/accent-bars'?"

If YES → REWRITE IT. The scene has collapsed into template aesthetics.

Every scene must have ALL FOUR of:
  1. A script-specific metaphor — something only this product/script would justify
  2. A unique silhouette — different from every other scene in this film when text is stripped
  3. A unique motion behavior — a verb-of-transformation that hasn't appeared elsewhere
  4. A payoff that CHANGES THE FRAME — t=duration must be a meaningfully different moment than t=0, not just "headline visible + animation finished"

If any of the four is missing, the scene is a template. Rewrite it before emitting.

══════════════════════════════════════════════════════════════════════════════
CREATIVE TARGET — what kind of film we're making
══════════════════════════════════════════════════════════════════════════════

This is NOT narrative cinema. This is NOT experimental art film. This is NOT film-school motion.

The target is a HIGH-END MOTION-DESIGN PROMO FILM — a launch video, a product explainer. Think top-tier motion studio (Buck, ManvsMachine, Tendril, Block & Tackle) producing a premium brand launch piece for a real product.

The scene you're rendering must feel:
  • strong visual hook
  • premium typography
  • memorable motion
  • bold composition
  • clear communication — the audience understands the beat without explanation
  • fast comprehension — the message lands on first viewing
  • polished commercial energy
  • custom-made visual identity (this product, this script, not generic)

Creative freedom is essential — but it must SERVE THE PRODUCT AND THE MESSAGE:
  • Do NOT become abstract just to be artistic.
  • Do NOT generate weirdness for its own sake.
  • Do NOT build a scene that needs explanation. The beat / product / message must be CLEAR.

Every motion idea should make the product or message: clearer · sharper · more memorable · more emotionally impactful.

Motion should feel: deliberate · premium · modern · dynamic · expressive · commercial-quality.

HyperFrames is a motion-design medium, not a film-school medium. Optimize for: strong motion identity · visually impressive reveals · premium launch energy · product clarity · memorable pacing · high-end commercial execution.

══════════════════════════════════════════════════════════════════════════════

═══ SEVEN CINEMATIC PRINCIPLES (non-negotiable for every scene) ═══

1. RESTRAINT IS A TOOL, NOT THE GOAL. Boldness, density, weirdness, dense layered motion, oversaturated color — all can serve a script. A luxe perfume launch needs different energy than a fintech security pitch; an AI dev tool needs different energy than a children's playlist app. Pick what THIS script's tone calls for. Do NOT default to "cinematic restraint" as a safe universal aesthetic — restraint without script-specific reason reads as blandness. The dead-frame rule still stands: every moment of stillness must be EARNED (compositionally strong enough to land without motion, narratively serving a buildup or release), never accidental. Stillness is one option among many — not the default.
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
• motionLanguage drives the eases. The names below are WEAK REFERENCES — not recipes
  to follow, not instructions to obey. You may IGNORE, MUTATE, DISTORT, COMBINE, or
  REINVENT them. If the identity used a STANDARD name AND you have nothing better,
  these are one possible interpretation:
    "editorial"  → expo.out entrances, long holds, sine.inOut stage drift
    "kinetic"    → power4.out, fast stagger, snap exits
    "minimal"    → one big move per scene, long quiet tails, fewer elements
    "techno"     → hard-cut + 100–140ms flash entrances, monospace numerics
    "cinematic"  → back.out(1.2) on hero, parallax stage zoom, oversized type
  If the identity INVENTED a name (anything not in the list above), the name IS the
  authoritative recipe — interpret it LITERALLY and execute it. "twitchy + tender"
  means short hard hits paired with long sine.inOut breath holds. "thunderous + held"
  means a power4.out impact then a 1.5–2s static hold with no drift. "origami-crisp"
  means hard linear/expo transitions on flat planes with no scale-flutter. Read the
  invented name and execute it directly; NEVER silently collapse it back to
  "editorial" or "cinematic" or any other reference. Invent custom cubic-bezier
  curves when the personality demands something the standard eases can't deliver.
• Honor assetPolicy. If it allows mockups/images, USE them — do not regress to type-only.

══════════════════════════════════════════════════════════════════════════════
SCENE CONCEPT — WEAK REFERENCES (not recipes, not instructions, not target outputs)
══════════════════════════════════════════════════════════════════════════════

The named concepts below are WEAK REFERENCES. They are not recipes to follow,
not instructions to obey, and not target outputs to imitate. You may IGNORE,
MUTATE, DISTORT, COMBINE, or REINVENT any of them if a stronger script-specific
idea exists. Most of the time a stronger idea DOES exist — invent it.

If the scene's sceneConcept is one of these names AND you have nothing better,
the descriptions below show one possible interpretation. If the sceneConcept is
INVENTED (anything not listed), interpret it literally from its name + scene
brief and build the concrete composition + motion that makes the named concept
legible. Never collapse an invented concept back to the nearest reference here.

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
MOTION HOOK — WEAK REFERENCES (not recipes, not instructions, not target outputs)
══════════════════════════════════════════════════════════════════════════════

The named hooks below are WEAK REFERENCES. They are not recipes, not instructions,
and not target outputs. You may IGNORE, MUTATE, DISTORT, COMBINE, or REINVENT any
of them if a stronger script-specific motion idea exists. Most of the time a
stronger motion idea DOES exist — invent it.

If the motionHook is one of these names AND you have nothing better, the
descriptions below show one possible entrance. If the motionHook is INVENTED
(anything not listed), interpret literally from the name and build the entrance
/ landing that makes the hook legible. Never collapse an invented motionHook
back to a reference below.

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

/**
 * Thrown when the LLM omits aesthetic identity fields. The storyboard caller
 * catches this and fires a single-shot retry with an addendum prompt naming
 * the missing fields, instead of silently cascading to DEFAULT_VISUAL_IDENTITY
 * (the old behavior, which stamped "Editorial Night" onto every partial parse
 * and was the primary cause of different scripts producing same-looking films).
 */
export class IdentityIncompleteError extends Error {
  readonly missingFields: string[];
  constructor(missingFields: string[]) {
    super(`visualIdentity missing required fields: ${missingFields.join(", ")}`);
    this.name = "IdentityIncompleteError";
    this.missingFields = missingFields;
  }
}

function normalizeVisualIdentity(
  raw: Partial<VisualIdentity> | undefined,
  detected?: { language: string | null; direction: "ltr" | "rtl" },
): VisualIdentity {
  // Aesthetic fields: if any are missing, throw — do NOT cascade to "Editorial
  // Night". The whole point of the retry path is that a partial parse must
  // not silently produce a generic film.
  const missing: string[] = [];
  const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  if (!raw) {
    throw new IdentityIncompleteError([
      "paletteName", "background", "accents", "headlineFont",
      "motionLanguage", "signatureMove", "assetPolicy",
    ]);
  }
  if (!isStr(raw.paletteName)) missing.push("paletteName");
  if (!isStr(raw.background)) missing.push("background");
  if (!Array.isArray(raw.accents) || raw.accents.length < 3) missing.push("accents");
  if (!isStr(raw.headlineFont)) missing.push("headlineFont");
  if (!isStr(raw.motionLanguage)) missing.push("motionLanguage");
  if (!isStr(raw.signatureMove)) missing.push("signatureMove");
  if (!isStr(raw.assetPolicy)) missing.push("assetPolicy");
  if (missing.length > 0) throw new IdentityIncompleteError(missing);

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

  // Safety-only fallbacks (font safety, ink contrast) — never aesthetic.
  return {
    scriptAnalysis: isStr(raw.scriptAnalysis) ? raw.scriptAnalysis : "(no analysis)",
    paletteName: raw.paletteName!,
    background: raw.background!,
    accents: raw.accents!.slice(0, 5),
    ink: isStr(raw.ink) ? raw.ink : DEFAULT_VISUAL_IDENTITY.ink,
    inkMuted: isStr(raw.inkMuted) ? raw.inkMuted : DEFAULT_VISUAL_IDENTITY.inkMuted,
    headlineFont: raw.headlineFont!,
    bodyFont: isStr(raw.bodyFont) ? raw.bodyFont : DEFAULT_VISUAL_IDENTITY.bodyFont,
    monoFont: isStr(raw.monoFont) ? raw.monoFont : DEFAULT_VISUAL_IDENTITY.monoFont,
    motionLanguage: raw.motionLanguage!,
    signatureMove: raw.signatureMove!,
    assetPolicy: raw.assetPolicy!,
    imageKeyword: typeof raw.imageKeyword === "string" ? raw.imageKeyword : "",
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

  // First attempt. If normalizeVisualIdentity throws IdentityIncompleteError,
  // retry once with an addendum user message naming the omitted fields — never
  // cascade to a generic default.
  let parsed = await runStoryboardCall(userText);
  const detected = detectScriptDirection(trimmed);
  let identity: VisualIdentity;
  try {
    identity = normalizeVisualIdentity(parsed.visualIdentity, detected);
  } catch (err) {
    if (!(err instanceof IdentityIncompleteError)) throw err;
    console.warn(
      `[storyboard] identity retry: omitted ${err.missingFields.join(",")} — re-firing`,
    );
    const retryUser = `${userText}\n\nYour previous response omitted these required visualIdentity fields: ${err.missingFields.join(", ")}. Fill EVERY required identity field with a specific, script-derived choice. No empty strings. No generic defaults. If unsure, lean into the script's mood and invent.`;
    parsed = await runStoryboardCall(retryUser);
    identity = normalizeVisualIdentity(parsed.visualIdentity, detected);
  }

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

/**
 * One Opus 4.7 storyboard call + JSON parse. Extracted so the retry path
 * (when normalizeVisualIdentity throws IdentityIncompleteError) can re-fire
 * the same call with an addendum user message.
 */
async function runStoryboardCall(
  userText: string,
): Promise<Partial<Storyboard> & { scenes?: StoryboardScene[] }> {
  const response = await getClient().messages.create({
    model: MODEL,
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

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("generateStoryboard: no text content in response");
  return parseJsonResponseOrThrow<Partial<Storyboard> & { scenes?: StoryboardScene[] }>(
    textBlock.text,
    "generateStoryboard",
    response.stop_reason,
    response.usage.output_tokens,
  );
}

/**
 * Aesthetic-seed lexicon. Three of these get sampled per script (deterministic
 * hash, so retries don't re-roll) and injected into the storyboard user prompt
 * as a mood push — the ONLY mechanism available to break Opus 4.7's
 * determinism, since the model no longer accepts temperature/top_p/top_k.
 * Curated to span texture, material, light, density, and emotional registers
 * — NOT to bias toward any specific palette.
 */
const AESTHETIC_SEED_LEXICON = [
  "papery", "ferrous", "oversaturated", "blueprint", "oceanic", "glitchy",
  "papercraft", "neon-sweat", "sun-bleached", "monolithic", "vellum", "magnetic",
  "fluorescent", "graphite", "lacquered", "kelp", "static", "tactile",
  "thunderous", "twitchy", "tender", "origami-crisp", "fogged", "ember",
  "phosphor", "talc", "iron-filing", "cathode", "spritz", "chalky",
  "wet-asphalt", "neon-noir", "vinyl-warm", "matte-plastic", "candlelit",
  "supercut", "pressed-flower", "concrete", "salt-rimmed", "sodium-lamp",
  "stitched", "mosaic", "ink-bled", "torchlit", "polaroid", "loomwork",
  "rust-bloom", "spotlit", "etched", "hand-cut", "telephoto", "fiberglass",
  "kintsugi", "stencil", "marble-vein", "neon-grime", "lichen", "carbon",
  "linen", "sun-warmed",
] as const;

/**
 * Pick 3 distinct aesthetic adjectives from the lexicon, deterministically
 * derived from a hash of the script. Same script → same seed (so retries are
 * stable); different scripts → different seeds (so the same prompt produces
 * different mood pushes, which is the closest analogue we have to sampling
 * diversity under Opus 4.7's no-temperature constraint).
 */
function pickAestheticSeed(script: string): readonly string[] {
  // FNV-1a 32-bit on the script — fast, well-distributed, no deps.
  let h = 2166136261;
  for (let i = 0; i < script.length; i++) {
    h ^= script.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const seed = h >>> 0;

  const picks = new Set<number>();
  const N = AESTHETIC_SEED_LEXICON.length;
  let state = seed;
  while (picks.size < 3) {
    state = Math.imul(state ^ (state >>> 13), 0x5bd1e995) >>> 0;
    picks.add(state % N);
  }
  return Array.from(picks).map((i) => AESTHETIC_SEED_LEXICON[i]);
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
  }

  const seed = pickAestheticSeed(script);
  lines.push(
    `AESTHETIC SEED for this film (interpret loosely; engage with at least 2 of these moods in palette/typography/motion choices): ${seed.join(", ")}. These are mood prompts, not requirements — let them push you AWAY from your default and toward this script's specific feel.`,
  );
  lines.push("");
  lines.push("SCRIPT:");
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
  "creativeDistinctiveness",
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
    /**
     * High when the scene feels specifically authored for THIS script's subject
     * and tone. Low when it looks like a generic film-template scene that
     * could've been made for any product in the same domain. Counterweight to
     * restraintQuality so "carefully restrained but bland" routes to refine.
     */
    creativeDistinctiveness: number;
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
        creativeDistinctiveness: { type: "number" },
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
  "filmRecognizability",
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
    /**
     * Could a viewer guess what product/script this is from the imagery alone?
     * High = unmistakably script-specific. Low = generic — could be any film.
     * Counterweight to the safe-restraint pull; flags films that are tasteful
     * but visually anonymous.
     */
    filmRecognizability: number;
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
        filmRecognizability: { type: "number" },
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
/**
 * Minimal audio bundle the skeleton needs to inject <audio> tags. Kept
 * structurally identical to ResolvedAudio in app/lib/audio-resolver.ts
 * (avoids a cyclic import — audio-resolver imports types from this file).
 */
export type SkeletonAudio = {
  bgMusic: { streamUrl: string } | null;
  voiceovers: Array<{ sceneId: string; publicUrl: string }>;
  sfxCues: Array<{
    sceneId: string;
    momentSeconds: number;
    url: string;
    volume: number;
  }>;
  // Sprint 3 — per-scene bg music volume keyframes. Each entry produces a
  // GSAP tween that ducks #bg-music to `volume` at sceneStart and restores
  // to the default at sceneEnd. Empty/undefined → no per-scene ducking.
  bgMusicVolumeOverrides?: Array<{ sceneId: string; volume: number }>;
};

export function buildFilmSkeleton(
  storyboard: Storyboard,
  identity: VisualIdentity,
  fills: FilmFills,
  audio?: SkeletonAudio,
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

  // ─── Audio tags (no class="clip"; runtime owns playback via data-start /
  // data-volume per HYPERFRAMES_SPEC). bg-music is mixed lower when there are
  // voiceovers so the VO stays intelligible without per-scene ducking (which
  // the renderer's media model doesn't reliably support yet).
  const audioTagsHtml: string[] = [];
  const hasVoiceovers = (audio?.voiceovers?.length ?? 0) > 0;
  const defaultBgVolume = hasVoiceovers ? 0.22 : 0.4;
  if (audio?.bgMusic) {
    audioTagsHtml.push(
      `  <audio id="bg-music" src="${escapeHtml(audio.bgMusic.streamUrl)}" data-start="0" data-volume="${defaultBgVolume}" loop preload="auto"></audio>`,
    );
  }
  for (const vo of audio?.voiceovers ?? []) {
    const i = parseInt(vo.sceneId.replace(/^s/, ""), 10) - 1;
    const sceneStart = starts[i];
    if (!Number.isFinite(sceneStart)) continue;
    audioTagsHtml.push(
      `  <audio id="vo-${vo.sceneId}" src="${escapeHtml(vo.publicUrl)}" data-start="${sceneStart}" data-volume="0.95" preload="auto"></audio>`,
    );
  }
  (audio?.sfxCues ?? []).forEach((cue, j) => {
    const i = parseInt(cue.sceneId.replace(/^s/, ""), 10) - 1;
    const sceneStart = starts[i];
    if (!Number.isFinite(sceneStart)) return;
    const start = Math.max(0, sceneStart + cue.momentSeconds);
    audioTagsHtml.push(
      `  <audio id="sfx-${cue.sceneId}-${j}" src="${escapeHtml(cue.url)}" data-start="${start}" data-volume="${cue.volume}" preload="auto"></audio>`,
    );
  });
  const audioBlock = audioTagsHtml.length > 0 ? `\n${audioTagsHtml.join("\n")}\n` : "";

  // Sprint 3 — per-scene bg music volume keyframes. Each override produces
  // a duck-in at sceneStart and a restore-to-default at sceneEnd, written
  // into the global timeline. If two adjacent scenes both have overrides,
  // the restore-to-default for the first will be immediately overwritten
  // by the duck-in for the second — that's the intended behavior. HF
  // runtime support for tweening <audio>.volume is uncertain; the editor
  // preview's use-playback hook is the authoritative source for volume.
  const bgVolumeKeyframesJs: string[] = [];
  if (audio?.bgMusic && (audio.bgMusicVolumeOverrides?.length ?? 0) > 0) {
    for (const ov of audio.bgMusicVolumeOverrides ?? []) {
      const i = parseInt(ov.sceneId.replace(/^s/, ""), 10) - 1;
      const sceneStart = starts[i];
      if (!Number.isFinite(sceneStart)) continue;
      const sceneDuration = storyboard.scenes[i]?.durationSeconds ?? 0;
      const duckIn = Math.max(0, sceneStart);
      const restoreAt = Math.max(duckIn, sceneStart + sceneDuration - 0.3);
      const vol = Math.max(0, Math.min(1, ov.volume));
      bgVolumeKeyframesJs.push(
        `  tl.to("#bg-music", { volume: ${vol}, duration: 0.3, ease: "sine.inOut" }, ${duckIn});`,
      );
      bgVolumeKeyframesJs.push(
        `  tl.to("#bg-music", { volume: ${defaultBgVolume}, duration: 0.3, ease: "sine.inOut" }, ${restoreAt});`,
      );
    }
  }
  const bgVolumeBlock = bgVolumeKeyframesJs.length > 0
    ? `\n  // Per-scene bg music volume (Sprint 3 — comment-driven ducking).\n${bgVolumeKeyframesJs.join("\n")}\n`
    : "";

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
${sectionsHtml}${audioBlock}</div>
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
}${bgVolumeBlock}
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

══════════════════════════════════════════════════════════════════════════════
CREATIVE MANDATE — READ THIS FIRST, OVERRIDES EVERYTHING ELSE
══════════════════════════════════════════════════════════════════════════════

Your primary job is NOT to follow templates, menus, or predefined motion-design patterns.

Your primary job is to discover the BEST possible cinematic shape of the film.

Do not ask: "What predefined cadence/motionLanguage fits this script?"
Ask: "What rhythm and motion personality would make this film unforgettable?"

You are encouraged to invent:
  • completely new motion language (name it in 2–3 words and characterize it concretely)
  • original pacing shapes (energy curves that don't fit standard cadence modes)
  • unexpected briefs per scene (sceneConcept names that exist only for this film)
  • unique focal-element choices that ride the script's specific subjects
  • unconventional transitions between scenes

The highest-quality blueprint is usually the one that feels authored specifically for THIS script — not assembled from reusable motion-design vocabulary.

Do not optimize for:  safety · familiarity · clean template aesthetics · generic premium SaaS style.
Optimize for:        emotional impact · memorability · cinematic identity · visual surprise · motion personality · strong directorial choices.

If the film could work for many unrelated products, it has failed.

Every major decision (energyCurve shape, cadence, motionLanguage, per-scene brief, focalElementHint) should feel inevitable for THIS exact script.

The system constraints (schema validity, ID format, scene count) are strict.
Creative direction is not.

You are allowed to invent the strongest possible blueprint, even if it is unusual, experimental, maximalist, minimal, abstract, surreal, or unexpected — as long as it serves the script and respects the locked visualIdentity from the storyboard.

The goal is not "good motion-design plan."
The goal is: "A film that feels intentionally directed."

The cadenceMode enum (slow_build_then_release / staccato_pulse / ebb_flow / long_breath_then_impact) is a small set — pick the closest one but treat your energyCurve as authoritative. Invented motionLanguage names from the storyboard MUST be honored in your motionLanguage.principles + cameraFeel — do not silently collapse them back to "editorial" or "cinematic".

══════════════════════════════════════════════════════════════════════════════
MOTION IS THE FILM — design briefs that demand motion, not posters
══════════════════════════════════════════════════════════════════════════════

This is a HyperFrames film. Motion quality is the core product, not decoration. The scene-fill stage will read your briefs and write GSAP timelines from them. If your brief describes a beautiful frozen frame with "minor animation", the scene-fill stage will obediently produce a poster with fade-in. Write briefs that demand motion.

Every scene brief must specify a MOTION IDEA over the scene's full duration, not a composition:
  • a clear entrance behavior
  • a living mid-scene behavior (drift, breathing, secondary animations — NOT "headline waits")
  • a payoff / transformation in the last 20%

Bad brief: "Centered headline reads 'Built for builders' over a dark background with a glowing ring behind it."
Good brief: "A graphite ring draws itself from a single point at top-left, sweeping clockwise to close around the headline; mid-scene the ring breathes (radius pulses ±4%) while the headline letters settle one-by-one; at 80% the ring locks and emits a single ferrofluid pulse that the headline absorbs."

motionPattern, focalElementHint, startStateHint, endStateHint, transitionInIntent, transitionOutIntent — write these as TIME-BASED motion ideas, not poses. The scene-fill stage's freedom to invent strong motion depends on you giving it strong motion direction.

══════════════════════════════════════════════════════════════════════════════
CREATIVE TARGET — what kind of film we're planning
══════════════════════════════════════════════════════════════════════════════

This is NOT narrative cinema. This is NOT experimental art film. This is NOT film-school motion.

The target is a HIGH-END MOTION-DESIGN PROMO FILM — a launch video, a product explainer. Think top-tier motion studio (Buck, ManvsMachine, Tendril, Block & Tackle) producing a premium brand launch piece for a real product.

The blueprint you write must seed: strong visual hook · premium typography · memorable motion · bold composition · clear communication · fast comprehension · polished commercial energy · custom-made visual identity per product.

Creative freedom matters — but it must SERVE THE PRODUCT AND THE MESSAGE:
  • Do NOT become abstract just to be artistic.
  • Do NOT generate weirdness for its own sake.
  • Do NOT plan a film that needs explanation. The product / message must be CLEAR and FAST to comprehend.

Every brief should give the scene-fill stage a path to make the product/message: clearer · sharper · more memorable · more emotionally impactful.

Motion should feel: deliberate · premium · modern · dynamic · expressive · commercial-quality.

HyperFrames is a motion-design medium, not a film-school medium. Optimize for: strong motion identity · visually impressive reveals · premium launch energy · product clarity · memorable pacing · high-end commercial execution.

══════════════════════════════════════════════════════════════════════════════

═══ SEVEN CINEMATIC PRINCIPLES (non-negotiable — design every brief around these) ═══

1. RESTRAINT IS A TOOL, NOT THE GOAL. Boldness, density, weirdness, dense layered motion, oversaturated color — all can serve a script. Pick what THIS script's tone calls for. Do NOT default to "cinematic restraint" as a safe universal aesthetic — restraint without script-specific reason reads as blandness. Stillness must be EARNED (compositionally strong enough to land without motion, narratively serving a buildup or release), never accidental. A held beat after a hard impact is craft; a held beat for no reason is failure. Briefs must make the difference explicit.
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
       easings        — 2–3 GSAP eases the whole film uses ("power2.out", "expo.inOut", "power4.inOut", "circ.out", custom cubic-beziers like "cubic-bezier(0.3, 1.4, 0.2, 1)", ...). Invent eases that match the identity's motionLanguage personality — do not default to a generic "power2.out + expo.inOut" pair.
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

  • composition              — visual weight balance, hierarchy, negative space, focal placement.
  • typographyHierarchy      — type sizes/weights tell a clear story; no two elements compete for attention.
  • colorTension             — palette discipline; accents create tension where they should, not noise.
  • focalClarity             — at any point in the trail, can you tell what the audience should be looking at?
  • motionClarity            — the trail SHOWS motion: entrance + hold + exit. Motion has direction and intent, not random animation.
  • brandFidelity            — does this scene feel like THIS film's brand (palette, typography, signatureMove)?
  • restraintQuality         — if the scene is mostly still: is the stillness INTENTIONAL (earned restraint) or DEAD (nothing evolving, no reason to hold)?
  • creativeDistinctiveness  — does this scene feel SPECIFICALLY AUTHORED for this script's subject and tone, or could it have been made for any product in this domain? 90+ = unmistakably script-specific. 50 = could be any film in this domain. 20- = looks like a stock template. THIS dimension is the counterweight to restraintQuality — restraint without distinctiveness is just blandness.
  • overall                  — weighted holistic score. Not an average — weight motionClarity + focalClarity + restraintQuality + creativeDistinctiveness heavily; they're the cinematic differentiators.

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

ADDITIONAL VERDICT RULE — RESTRAINT WITHOUT DISTINCTIVENESS:
If restraintQuality > 70 AND creativeDistinctiveness < 50, the verdict MUST be \`refine\` and you MUST file a major issue with dimension \`creativeDistinctiveness\` and description starting "restraint_without_distinctiveness: ...". Restraint that doesn't earn its script-specificity is blandness — the scene must be made specifically about THIS product/script's subject, not a tasteful template that could be anyone.

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
  • filmRecognizability    — looking at all motion-trail composites together: could a viewer guess what product/script this film is from imagery alone (palette, typography, motion personality, signatureMove, specific visual ideas)? 90+ = unmistakably this product. 50 = could be any film in this domain. 20- = looks like a template that could be reused for anything. Score honestly — this is the dimension that catches "tastefully bland" films that pass every other rubric.
  • overall                — weighted holistic. Not an average — weight cinematicCoherence + climaxStrength + energyWaveDelivery + filmRecognizability heavily.

═══ VERDICTS ═══

  • ship                    — overall ≥ 70 AND no major film-level issues. The film is good enough.
  • refine_selected_scenes  — overall < 70 OR major issues exist that can be fixed by re-firing specific scenes.
  • redesign_rhythm         — the energy wave fundamentally fails (no climax, monotone energy). More scenes than usual need to be refired and the refinement framing should emphasize redesign over patch.

ADDITIONAL VERDICT RULE — FILM-WIDE GENERICNESS:
If filmRecognizability < 50, you MUST file a film-level major issue with dimension \`filmRecognizability\` and description starting "visual_genericness: ...". The affectedSceneIds should be the scenes that share the generic look (often all of them or the dominant subset). The suggestedFix should name the specific script subjects that should be visually surfaced (e.g., "anchor s2 + s4 around the actual product hardware silhouette instead of abstract type"). The verdict in this case is at least \`refine_selected_scenes\`.

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

  const filmRhythm = sanitizeFilmRhythm(
    parsed.filmRhythm,
    normalizedOutline.length,
    storyboard.scenes.map((s) => s.pacingIntent),
  );

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

// ─── Audio direction (auto music / SFX / voiceover) ──────────────────────
// Stage 1.75 of the v2 pipeline. With storyboard, identity, and Film
// Blueprint in hand, the LLM decides what the film SOUNDS like — one
// background music search query (Jamendo), per-scene voiceover text
// (ElevenLabs TTS), and per-scene SFX cues (Freesound) aligned to
// filmRhythm.impactMoments. Pure planning here; URL resolution happens
// in app/lib/audio-resolver.ts.

export const VOICEOVER_DELIVERIES = [
  "cinematic",
  "energetic",
  "intimate",
  "deadpan",
  "authoritative",
] as const;
export type VoiceoverDelivery = (typeof VOICEOVER_DELIVERIES)[number];

export const SFX_KINDS = ["punch", "impact", "transition", "ambient"] as const;
export type SfxKind = (typeof SFX_KINDS)[number];

export const MUSIC_ENERGIES = ["low", "mid", "high"] as const;
export type MusicEnergy = (typeof MUSIC_ENERGIES)[number];

export type AudioPlanBgMusic = {
  jamendoQuery: string;
  moodTags: string[];
  energyHint: MusicEnergy;
};

export type AudioPlanVoiceover = {
  sceneId: string;
  text: string;
  deliveryHint: VoiceoverDelivery;
  voiceId?: string;
};

export type AudioPlanSfxCue = {
  sceneId: string;
  momentSeconds: number;
  kind: SfxKind;
  freesoundQuery: string;
};

// Sprint 3 — per-scene bg music volume override. 0..1 (clamped). Used to
// duck/lift the bg music for individual scenes (e.g. quieter under a
// climactic voiceover, louder during a percussive impact). Empty array on
// first runs; populated by the audio director when comments ask for it.
export type AudioPlanBgVolumeOverride = {
  sceneId: string;
  volume: number;
};

export type AudioPlan = {
  bgMusic: AudioPlanBgMusic | null;
  voiceovers: AudioPlanVoiceover[];
  sfxCues: AudioPlanSfxCue[];
  bgMusicVolumeOverrides?: AudioPlanBgVolumeOverride[];
};

// Anthropic structured-output schemas reject numerical / array length /
// pattern constraints (minItems, minLength, maxLength, minimum, pattern).
// Rules like "2-5 moodTags" or "momentSeconds ≥ 0" or "sceneId matches s\d+"
// live in AUDIO_DIRECTION_SYSTEM_PROMPT instead, with runtime normalization
// in generateAudioDirection enforcing them post-parse.
const AUDIO_DIRECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bgMusic", "voiceovers", "sfxCues", "bgMusicVolumeOverrides"],
  properties: {
    bgMusic: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["jamendoQuery", "moodTags", "energyHint"],
      properties: {
        jamendoQuery: { type: "string" },
        moodTags: { type: "array", items: { type: "string" } },
        energyHint: { type: "string", enum: [...MUSIC_ENERGIES] },
      },
    },
    voiceovers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sceneId", "text", "deliveryHint"],
        properties: {
          sceneId: { type: "string" },
          text: { type: "string" },
          deliveryHint: { type: "string", enum: [...VOICEOVER_DELIVERIES] },
          voiceId: { type: "string" },
        },
      },
    },
    sfxCues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sceneId", "momentSeconds", "kind", "freesoundQuery"],
        properties: {
          sceneId: { type: "string" },
          momentSeconds: { type: "number" },
          kind: { type: "string", enum: [...SFX_KINDS] },
          freesoundQuery: { type: "string" },
        },
      },
    },
    // Sprint 3 — per-scene bg music ducking. Empty array on most runs.
    // Volume range 0..1 is enforced post-parse (Anthropic schema rejects
    // minimum/maximum constraints).
    bgMusicVolumeOverrides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sceneId", "volume"],
        properties: {
          sceneId: { type: "string" },
          volume: { type: "number" },
        },
      },
    },
  },
} as const;

const AUDIO_DIRECTION_SYSTEM_PROMPT = `You are the audio director for a short cinematic launch film. The visual film is already locked — storyboard, palette, motion language, and filmRhythm are pinned. Your job is to decide what the film SOUNDS like.

═══ YOUR OUTPUT — three independent decisions ═══

1. bgMusic (or null) — ONE background music search query for Jamendo (free CC-licensed library). The query is 2–5 words like "ambient cinematic synth", "driving electronic pulse", "uplifting orchestral build". Pair it with 2–5 moodTags (single words, e.g. "calm", "tense", "uplifting") and an energyHint (low | mid | high).
   • Return null ONLY if the film is so short/punchy that any music would clutter it (<3 scenes AND total duration <10s AND cadenceMode="staccato_pulse"). Otherwise always return a track query — even held/cinematic films benefit from a quiet bed.
   • Match energyHint to the film's overall energyCurve: a slow_build_then_release film with mostly low energy scenes wants energyHint="low", not "high".

2. voiceovers — per-scene narration text. ONE entry per scene (sceneId s1..sN), or omit a scene to skip its voiceover (do this for type-only logo lockups, silent kickers, etc.).
   • text is what ElevenLabs will speak verbatim. Keep it SHORT — typically 1 sentence, ≤25 words, that fits naturally into the scene's duration (estimate ~3 words/second for cinematic delivery). NEVER pad to match duration; leave silence if needed.
   • DO NOT just echo scene.copy if it's already visible on screen. Voiceover should ADD, not duplicate. If the copy is "Privacy that travels with you", the VO might be "Wherever you go. Whatever you do." — complementary, not redundant.
   • deliveryHint guides ElevenLabs voice settings: cinematic (slow, weighty) | energetic (fast, punchy) | intimate (close, warm) | deadpan (flat, ironic) | authoritative (firm, declarative).
   • Hold/rest scenes often want NO voiceover at all — the silence is the point. Skip them.

3. sfxCues — per-scene sound effects. AIM FOR RESTRAINT: at most ONE cue per scene, and only on scenes that genuinely need a sonic punctuation. Empty array is fine for quiet films.
   • PRIORITIZE filmRhythm.impactMoments and filmRhythm.climaxIndex — those scenes deserve a punch or impact cue. Rest moments should be silent (no SFX).
   • momentSeconds is the offset within the scene's local timeline (0 = scene start). Place punches near transitions; ambient cues can start at 0 and span the scene.
   • kind: punch (sharp, short, percussive) | impact (low, heavy, sustained) | transition (whoosh, riser, swell) | ambient (atmospheric pad, drone).
   • freesoundQuery is 2-4 words, e.g. "deep cinematic boom", "ui click sharp", "soft whoosh transition", "ambient hum dark". Avoid overly specific queries — Freesound is a search not a generator.

4. bgMusicVolumeOverrides — per-scene background music volume (0..1). DEFAULT IS EMPTY ARRAY. Only populate when a user comment explicitly asks for music ducking ("lower the music here") or lifting ("more music on this scene"), OR when the scene has a critical voiceover that the default mix won't carry. The default mix already drops bg music to 0.22 across all scenes when voiceovers exist — don't duplicate that with a 0.22 override on every scene. Use 0.08–0.15 for hard ducks (silence except hum), 0.35–0.55 for restored levels, 0.6–0.8 for lifts during instrumental beats.

═══ HOW TO READ THE FILM ═══

You receive: the storyboard (scene copy + pacingIntent + duration), the visual identity, and the Film Blueprint's filmRhythm (energyCurve, restMoments, impactMoments, climaxIndex, cadenceMode, restraintNotes).

DESIGN DECISIONS that should change your output:
  • cadenceMode="staccato_pulse" → energyHint="high" or "mid", multiple SFX punches on the impact scenes, deadpan/energetic VO.
  • cadenceMode="long_breath_then_impact" → energyHint="low" for the bed, ONE big impact cue on climaxIndex, cinematic/intimate VO.
  • cadenceMode="ebb_flow" → energyHint="mid", alternating SFX between rest and impact scenes, varied VO delivery.
  • cadenceMode="slow_build_then_release" → energyHint rises with the curve; rising SFX on build, release SFX on the final scene.

═══ WHAT NOT TO DO ═══

✗ Don't add SFX to every scene — silence is a sonic choice.
✗ Don't make the VO read the on-screen copy verbatim.
✗ Don't request music genres that don't exist on Jamendo ("kpop", "drill", "phonk" — stick to "ambient", "cinematic", "electronic", "orchestral", "lo-fi", "synthwave", "post-rock", "experimental").
✗ Don't write voiceover for hold/logo-lockup scenes unless the brief calls for it.
✗ Don't return more than 3 SFX cues across the whole film unless cadenceMode is staccato_pulse.

Emit AudioPlan JSON now. Strict schema — no extra fields.
`;

// Refinement-mode addendum. Concatenated onto the system prompt when
// generateAudioDirection is called with feedback (Sprint 3 — comments
// influence audio). The base prompt above stays cache-stable so first-run
// jobs hit the cache; only the refinement run pays for the addendum.
const AUDIO_DIRECTION_REFINE_ADDENDUM = `

═══ REFINEMENT MODE — YOU ARE EDITING AN EXISTING PLAN ═══

You will receive two extra blocks in the user message: PREVIOUS PLAN (what you emitted last run, with the resolved track/SFX names alongside) and USER COMMENTS PER SCENE (free-text feedback). Your job is to emit a NEW AudioPlan that minimally changes the previous one to address the comments.

RESTRAINT FIRST. Most comments are visual/motion/typography and do NOT touch audio. For any scene whose comments don't mention audio, return that scene's voiceover/SFX EXACTLY as before (same text, same deliveryHint, same freesoundQuery, same kind, same momentSeconds). For bgMusic, leave jamendoQuery + moodTags + energyHint unchanged unless a comment explicitly asks for a different music feel.

AUDIO-RELATED KEYWORDS to watch for in comments (case-insensitive):
  music, volume, louder, quieter, softer, mute, duck, lift, bed, track, score, song
  voice, voiceover, vo, narration, narrator, speak, say, read, tone, delivery, pace
  sfx, sound effect, whoosh, boom, click, impact, punch, transition, swell, riser, ambient
  swap, replace, change <audio-noun>, different <audio-noun>

CHANGE TYPES:
  • "lower/quieter music on scene X" → add { sceneId: "sX", volume: 0.10 } to bgMusicVolumeOverrides. Don't change bgMusic.jamendoQuery.
  • "more music on scene X" → add { sceneId: "sX", volume: 0.55 } to bgMusicVolumeOverrides.
  • "change the whoosh to a deeper boom on scene X" → update that scene's sfxCue { kind: "impact", freesoundQuery: "deep cinematic boom" }.
  • "voiceover should be more intimate on scene X" → change that scene's voiceover deliveryHint to "intimate" (and optionally tighten text).
  • "rewrite the voiceover on scene X to say Y" → update that scene's voiceover.text to Y.
  • "different music — try ambient lo-fi instead" → change bgMusic.jamendoQuery + moodTags + energyHint. Clear bgMusicVolumeOverrides unless other comments require them.

If a comment is ambiguous, prefer NO CHANGE. Better to under-edit than to drift the film's sonic identity.
`;

// Sprint 3 refinement input. `previousResolved` is the bundle stored under
// jobs.audio_direction.resolved — we surface a few human-readable fields
// (track title, voiceover text snippet, SFX name) so the LLM can see what
// it actually picked, not just what it asked for.
export type AudioDirectionFeedback = {
  previousPlan: AudioPlan;
  previousResolved: {
    bgMusic: { trackId: string; title: string; artist: string; streamUrl: string } | null;
    voiceovers: Array<{ sceneId: string; text: string; delivery: VoiceoverDelivery; publicUrl: string }>;
    sfxCues: Array<{ sceneId: string; momentSeconds: number; kind: SfxKind; name: string; url: string }>;
  };
  commentsByScene: Array<{ sceneId: string; comments: string }>;
};

function renderPreviousPlanBlock(feedback: AudioDirectionFeedback): string {
  const p = feedback.previousPlan;
  const r = feedback.previousResolved;

  const bg = p.bgMusic
    ? `${p.bgMusic.jamendoQuery} (${p.bgMusic.energyHint}) → resolved: "${r.bgMusic?.title ?? "?"}" by ${r.bgMusic?.artist ?? "?"}`
    : "none";

  const voByScene = new Map(r.voiceovers.map((v) => [v.sceneId, v] as const));
  const voLines = p.voiceovers
    .map((v) => {
      const resolved = voByScene.get(v.sceneId);
      const snippet = (resolved?.text ?? v.text).slice(0, 80);
      return `  ${v.sceneId}: deliveryHint=${v.deliveryHint} · text=${JSON.stringify(snippet)}`;
    })
    .join("\n") || "  (none)";

  const sfxByScene = new Map<string, Array<{ name: string; query: string; kind: SfxKind; momentSec: number }>>();
  for (const cue of p.sfxCues) {
    const resolved = r.sfxCues.find((rc) => rc.sceneId === cue.sceneId && rc.kind === cue.kind);
    const list = sfxByScene.get(cue.sceneId) ?? [];
    list.push({
      name: resolved?.name ?? "(unresolved)",
      query: cue.freesoundQuery,
      kind: cue.kind,
      momentSec: cue.momentSeconds,
    });
    sfxByScene.set(cue.sceneId, list);
  }
  const sfxLines = Array.from(sfxByScene.entries())
    .map(([sid, cues]) =>
      cues
        .map(
          (c) => `  ${sid} @ ${c.momentSec.toFixed(2)}s: kind=${c.kind} · query="${c.query}" → "${c.name}"`,
        )
        .join("\n"),
    )
    .join("\n") || "  (none)";

  const overrides = (p.bgMusicVolumeOverrides ?? [])
    .map((o) => `  ${o.sceneId}: volume=${o.volume}`)
    .join("\n") || "  (none)";

  return `PREVIOUS PLAN (what shipped — preserve unchanged unless a comment asks otherwise):
  bgMusic: ${bg}
  voiceovers:
${voLines}
  sfxCues:
${sfxLines}
  bgMusicVolumeOverrides:
${overrides}`;
}

function renderCommentsBlock(feedback: AudioDirectionFeedback): string {
  if (feedback.commentsByScene.length === 0) return "USER COMMENTS PER SCENE: (none)";
  const lines = feedback.commentsByScene
    .map((c) => `  ${c.sceneId}:\n${c.comments.split("\n").map((l) => `    ${l}`).join("\n")}`)
    .join("\n\n");
  return `USER COMMENTS PER SCENE (treat each block as feedback for that scene; remember most comments are visual and require NO audio change):\n${lines}`;
}

function renderAudioDirectionUserPrompt(
  storyboard: Storyboard,
  blueprint: FilmBlueprint,
  feedback?: AudioDirectionFeedback,
): string {
  const totalSec = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);
  const rhythm = blueprint.filmRhythm;

  const sceneLines = storyboard.scenes
    .map((s, i) => {
      const sid = `s${i + 1}`;
      const role = rhythm.impactMoments.includes(i)
        ? "IMPACT"
        : rhythm.releaseMoments.includes(i)
          ? "RELEASE"
          : rhythm.restMoments.includes(i)
            ? "REST"
            : i === rhythm.climaxIndex
              ? "CLIMAX"
              : "BUILD";
      const energy = rhythm.energyCurve[i]?.toFixed(2) ?? "?";
      return `  ${sid} (${s.durationSeconds}s, ${s.pacingIntent}, energy=${energy}, ${role}) — copy: ${JSON.stringify(s.copy)}`;
    })
    .join("\n");

  return `FILM — ${storyboard.scenes.length} scenes, ${totalSec.toFixed(1)}s total:
${sceneLines}

VISUAL IDENTITY:
  paletteName:    ${blueprint.visualIdentity.paletteName}
  motionLanguage: ${blueprint.visualIdentity.motionLanguage}
  signatureMove:  ${blueprint.visualIdentity.signatureMove}
  language:       ${blueprint.visualIdentity.language}

FILM RHYTHM:
  cadenceMode:    ${rhythm.cadenceMode}
  climax:         s${rhythm.climaxIndex + 1}
  impacts:        ${rhythm.impactMoments.map((i) => `s${i + 1}`).join(", ") || "(none)"}
  rests:          ${rhythm.restMoments.map((i) => `s${i + 1}`).join(", ") || "(none)"}
  releases:       ${rhythm.releaseMoments.map((i) => `s${i + 1}`).join(", ") || "(none)"}
  restraintNotes: ${rhythm.restraintNotes.length ? rhythm.restraintNotes.map((n) => `"${n}"`).join("; ") : "(none)"}

${
    feedback
      ? `\n${renderPreviousPlanBlock(feedback)}\n\n${renderCommentsBlock(feedback)}\n\nProduce the REVISED AudioPlan JSON now. Restraint first — for any scene whose comments don't mention audio, return its voiceover/SFX identical to the previous plan. Address only what the comments explicitly ask for.\n`
      : "Produce the AudioPlan JSON now. Restraint over abundance — silence is a choice. ONE music query, voiceovers only where they ADD, SFX only on the beats that earn it.\n"
  }`;
}

/**
 * Stage 1.75 — auto-pick music, SFX, and voiceover for the film.
 * Pure planning. URL resolution happens in app/lib/audio-resolver.ts.
 *
 * Skipped when MOTIONGLASS_AUTO_AUDIO is unset or jobs.audio_auto_enabled
 * is false — see jobs.ts:runHyperframesDirect.
 */
export async function generateAudioDirection(
  storyboard: Storyboard,
  blueprint: FilmBlueprint,
  feedback?: AudioDirectionFeedback,
): Promise<AudioPlan> {
  const userText = renderAudioDirectionUserPrompt(storyboard, blueprint, feedback);

  // Refinement mode appends an addendum to the cached base prompt. Keeping
  // the base as its own cache-controlled block means first-run cache hits
  // are preserved; only the refine addendum re-tokenizes per refine call.
  const systemBlocks = feedback
    ? [
        {
          type: "text" as const,
          text: AUDIO_DIRECTION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
        {
          type: "text" as const,
          text: AUDIO_DIRECTION_REFINE_ADDENDUM,
        },
      ]
    : [
        {
          type: "text" as const,
          text: AUDIO_DIRECTION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ];

  const response = await getClient().messages.create({
    model: MODEL,
    system: systemBlocks,
    messages: [{ role: "user", content: userText }],
    // bgMusic + N voiceovers + ≤3 SFX cues fits comfortably in 4K tokens
    // for typical 5–9 scene films. 8K gives headroom for adaptive thinking.
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: AUDIO_DIRECTION_SCHEMA },
    },
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!textBlock) throw new Error("generateAudioDirection: no text content in response");
  const parsed = parseJsonResponseOrThrow<AudioPlan>(
    textBlock.text,
    "generateAudioDirection",
    response.stop_reason,
    response.usage.output_tokens,
  );

  // Normalize: drop voiceovers/SFX cues that reference invalid sceneIds,
  // clamp negative momentSeconds, and drop cues with empty queries.
  // (The schema can't enforce these constraints — see comment on
  // AUDIO_DIRECTION_SCHEMA.)
  const validSceneIds = new Set(storyboard.scenes.map((_, i) => `s${i + 1}`));
  const voiceovers = (parsed.voiceovers ?? [])
    .filter((v) => validSceneIds.has(v.sceneId) && typeof v.text === "string" && v.text.trim().length > 0);
  const sfxCues = (parsed.sfxCues ?? [])
    .filter(
      (c) =>
        validSceneIds.has(c.sceneId) &&
        typeof c.freesoundQuery === "string" &&
        c.freesoundQuery.trim().length > 0,
    )
    .map((c) => ({
      ...c,
      momentSeconds: Math.max(0, Number(c.momentSeconds) || 0),
    }));

  // bgMusicVolumeOverrides: clamp to [0, 1], drop invalid sceneIds, drop
  // duplicates (last write wins per sceneId).
  const overridesMap = new Map<string, number>();
  for (const o of parsed.bgMusicVolumeOverrides ?? []) {
    if (!validSceneIds.has(o.sceneId)) continue;
    const n = Number(o.volume);
    if (!Number.isFinite(n)) continue;
    overridesMap.set(o.sceneId, Math.max(0, Math.min(1, n)));
  }
  const bgMusicVolumeOverrides = Array.from(overridesMap.entries()).map(
    ([sceneId, volume]) => ({ sceneId, volume }),
  );

  console.log(
    `[hyperframes audio]${feedback ? " (refine)" : ""} bgMusic=${
      parsed.bgMusic ? `"${parsed.bgMusic.jamendoQuery}" (${parsed.bgMusic.energyHint})` : "none"
    }, voiceovers=${voiceovers.length}/${storyboard.scenes.length} scenes, ` +
      `sfx=${sfxCues.length} cues, overrides=${bgMusicVolumeOverrides.length}, ` +
      `input=${response.usage.input_tokens} output=${response.usage.output_tokens}`,
  );

  return {
    bgMusic: parsed.bgMusic ?? null,
    voiceovers,
    sfxCues,
    bgMusicVolumeOverrides,
  };
}

/**
 * Clamp / patch the model's filmRhythm so it survives sloppy output without
 * crashing downstream consumers. Drops out-of-range scene indices, fills a
 * default energy curve when missing, defaults the climax to the last scene
 * if unspecified.
 */
function sanitizeFilmRhythm(
  raw: FilmRhythmPlan | undefined,
  N: number,
  pacingIntents?: readonly PacingIntent[],
): FilmRhythmPlan {
  const inRange = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < N;

  // Build a script-derived fallback shape from the per-scene pacingIntents.
  // Two scripts with different pacing sequences now get different fallback
  // curves — the old behavior used a fixed linear ramp + slow_build_then_release
  // for every script, which was a major convergence force across films.
  const fallback = deriveFallbackRhythm(N, pacingIntents);

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

/**
 * Pacing-derived fallback rhythm. Used both when raw is undefined and when
 * specific fields (energyCurve / cadenceMode / climaxIndex) are missing. The
 * curve shape, cadence mode, and climax index are all script-specific — two
 * scripts with different pacingIntents sequences produce different shapes.
 */
function deriveFallbackRhythm(
  N: number,
  pacingIntents?: readonly PacingIntent[],
): FilmRhythmPlan {
  // Energy curve from pacingIntent — hold at the climax becomes a peak, hold
  // elsewhere becomes a quiet held breath. Punch is high, beat is medium,
  // cinematic is medium-high.
  const energyForIntent = (intent: PacingIntent, idx: number): number => {
    switch (intent) {
      case "punch": return 0.85;
      case "cinematic": return 0.65;
      case "hold":
        // A late "hold" reads as climax; an early "hold" reads as held breath.
        return idx >= Math.max(0, N - 2) ? 0.95 : 0.25;
      case "beat":
      default: return 0.5;
    }
  };

  let energyCurve: number[];
  if (pacingIntents && pacingIntents.length === N) {
    energyCurve = pacingIntents.map((p, i) => energyForIntent(p, i));
  } else {
    // No pacingIntent context — fall back to a mild build (legacy shape) but
    // bias the peak toward the back. Better than linear but still generic;
    // callers should pass pacingIntents whenever possible.
    energyCurve = Array.from({ length: N }, (_, i) =>
      Math.min(0.95, Math.max(0.2, 0.3 + (i / Math.max(1, N - 1)) * 0.5)),
    );
  }

  // climaxIndex: argmax of the curve (first peak if multiple ties).
  let climaxIndex = 0;
  let maxVal = -1;
  for (let i = 0; i < energyCurve.length; i++) {
    if (energyCurve[i] > maxVal) {
      maxVal = energyCurve[i];
      climaxIndex = i;
    }
  }

  // Count local maxima for cadence selection.
  const localMaxima: number[] = [];
  for (let i = 0; i < energyCurve.length; i++) {
    const prev = i > 0 ? energyCurve[i - 1] : -Infinity;
    const next = i < energyCurve.length - 1 ? energyCurve[i + 1] : -Infinity;
    if (energyCurve[i] > prev && energyCurve[i] >= next && energyCurve[i] >= 0.6) {
      localMaxima.push(i);
    }
  }

  // Variance vs late-peak shape — used to pick cadence.
  const mean = energyCurve.reduce((s, v) => s + v, 0) / Math.max(1, energyCurve.length);
  const variance =
    energyCurve.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, energyCurve.length);
  const latePeak = climaxIndex >= Math.floor(N * 0.66);

  let cadenceMode: CadenceMode;
  if (localMaxima.length >= 2) {
    cadenceMode = "staccato_pulse";
  } else if (latePeak && variance > 0.05) {
    cadenceMode = "slow_build_then_release";
  } else if (variance < 0.02 && maxVal >= 0.85) {
    cadenceMode = "long_breath_then_impact";
  } else {
    cadenceMode = "ebb_flow";
  }

  // Impact / release / rest moments — read from the curve.
  const impactMoments: number[] = [];
  const restMoments: number[] = [];
  for (let i = 0; i < energyCurve.length; i++) {
    if (energyCurve[i] >= 0.8) impactMoments.push(i);
    else if (energyCurve[i] <= 0.3) restMoments.push(i);
  }
  // releaseMoments: index immediately after an impact (if it exists and is lower).
  const releaseMoments: number[] = [];
  for (const i of impactMoments) {
    if (i + 1 < N && energyCurve[i + 1] < energyCurve[i]) releaseMoments.push(i + 1);
  }

  return {
    energyCurve,
    restMoments,
    impactMoments,
    releaseMoments,
    climaxIndex,
    cadenceMode,
    restraintNotes: [],
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
      : feedback.kind === "comment"
        ? `\n═══ HUMAN DIRECTOR'S NOTES ON THIS SCENE ═══\nThe human directing the film has these notes. Implement them precisely. Do not redesign anything they did not mention. Keep the rest of the scene's existing intent, layout, and timing intact.\n\n${feedback.text}\n═══\n`
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

══════════════════════════════════════════════════════════════════════════════
LENGTH BUDGET — TIGHTNESS IS THE BAR
══════════════════════════════════════════════════════════════════════════════

This scene is one beat of a multi-scene promo film with a strict render budget.
The strongest motion idea expressed concisely beats a sprawling one. Stay focused:

  • contentHtml ≤ 120 lines.  One focal element + 2-4 supporting elements.
                              No decorative wrappers that don't animate.
                              No elements present in the DOM but absent from the timeline.
  • sceneCss    ≤ 80 lines.   Only styles for elements that appear in contentHtml.
                              No utility classes you don't use.
  • timeline    ≤ 150 lines of GSAP calls.
                              Each call should move the motion idea forward.
                              No redundant .set() before a tween that overrides it.

If you find yourself elaborating a secondary detail, CUT IT — the dominant
motion idea is the deliverable. Tight scenes ship; sprawling scenes get
truncated by max_tokens and arrive broken.
`;
}

/** Labeled feedback fed into a scene-fill retry. */
export type SceneFillFeedback = { kind: "lint" | "vision" | "comment"; text: string };

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
    // Opus 4.7 only supports thinking.type "adaptive" — explicit
    // { type: "enabled", budget_tokens: N } returns 400 invalid_request.
    // Per the API error, output_config.effort is the knob that shapes the
    // adaptive thinking budget. Keeping adaptive and using effort: "medium"
    // (below) to bound deliberation.
    thinking: { type: "adaptive" },
    output_config: {
      // effort: "medium" + length budget over-corrected: scenes dropped to
      // 2-7K output tokens (median ~3.5K) on 2026-05-19 and the user
      // reported scenes "look broken" — too sparse to fulfill the motion
      // mandates. Restored to "high" while keeping the length budget block
      // in buildSceneFillUserPrompt and the all-parallel wave. Expected
      // per-scene output ~10-15K (vs. the original 15-23K) and ~5-6 min
      // total wall-time (vs. 4 min at medium, 16.7 min at the original).
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

  // Wall-time mode: all scenes fire in ONE parallel wave. Each scene sees
  // blueprint-level intent for its immediate predecessor via
  // prevSceneIntentFallback (the mechanism slot-2 scenes already used in
  // the pair-threaded version). Real structured continuity from prior
  // scene outputs is sacrificed in exchange for collapsing 4 sequential
  // Opus waves into 1. The lint-retry path below still re-uses the
  // per-scene SceneCallContext, so its plumbing is unchanged.
  const initialState: ContinuityState = {
    prevSceneSummary: null,
    prevSceneId: null,
    motifRegistry: new Set<Motif>(),
    completedSceneIds: [],
  };
  const snapshot = snapshotContinuity(initialState);

  const contexts: SceneCallContext[] = Array.from({ length: N }, (_, idx) => ({
    continuityState: snapshot,
    prevSceneIntentFallback: idx === 0 ? null : blueprint.sceneOutline[idx - 1],
  }));

  console.log(
    `[hyperframes orchestrator] all ${N} scenes (parallel ${N}/${N}, blueprint-only continuity)`,
  );

  const fills = await Promise.all(
    contexts.map((ctx, idx) =>
      generateSceneFill(
        blueprint,
        idx,
        ctx.continuityState,
        ctx.prevSceneIntentFallback,
        null,
      ),
    ),
  );

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
  // Sprint 2: resolved audio bundle (bg music + voiceovers + SFX). When
  // provided, buildFilmSkeleton injects <audio> tags. Omit to keep the
  // pre-audio behavior unchanged.
  audio?: SkeletonAudio,
): Promise<GenerateFilmHTMLResult> {
  const blueprint =
    prebuiltBlueprint ?? (await generateFilmBlueprint(storyboard, identity, assetCatalog));

  const { fills: sceneFills, contexts } = await generateScenesWithContinuity(blueprint);

  let fills: FilmFills = {
    cssVariables: blueprint.cssVariables,
    scenes: sceneFills,
  };
  let html = buildFilmSkeleton(storyboard, identity, fills, audio);

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
  html = buildFilmSkeleton(storyboard, identity, fills, audio);

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
  // What kind of feedback this refinement round represents. Defaults to
  // "vision" so existing callers (polish endpoint, lint retry) keep their
  // semantics. The "comment" kind is used by improveScenesFromComments —
  // sends the human director's notes through the dedicated prompt header.
  feedbackKind: SceneFillFeedback["kind"] = "vision",
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
    `[refine] re-firing ${indexed.length} scene${indexed.length === 1 ? "" : "s"} with ${feedbackKind} feedback: ${indexed.map((x) => x.sceneId).join(", ")}`,
  );

  const fresh = await Promise.all(
    indexed.map((x) => {
      const ctx = sceneContexts[x.sceneIndex];
      return generateSceneFill(
        blueprint,
        x.sceneIndex,
        ctx.continuityState,
        ctx.prevSceneIntentFallback,
        { kind: feedbackKind, text: x.feedbackText },
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
