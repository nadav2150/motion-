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
};

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
- durationSeconds: 3–10 seconds, weighted by copy length + emotional weight.
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
        required: ["id", "copy", "durationSeconds", "sceneConcept", "motionHook"],
        properties: {
          id: { type: "string" },
          copy: { type: "string" },
          durationSeconds: { type: "number" },
          sceneConcept: { type: "string" },
          motionHook: { type: "string" },
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
  const parsed = JSON.parse(textBlock.text) as Partial<Storyboard> & {
    scenes?: StoryboardScene[];
  };

  // Light normalization: ensure ids follow scene_NN, durations are within
  // the [3, 10] bracket, and every scene has an assigned sceneConcept +
  // motionHook (rotate through the concept list as a fallback so two
  // adjacent scenes never share a default).
  const scenes = (parsed.scenes ?? []).map((s, i) => ({
    id: s.id || `scene_${String(i + 1).padStart(2, "0")}`,
    copy: s.copy,
    durationSeconds: Math.max(3, Math.min(10, Number(s.durationSeconds) || 5)),
    sceneConcept: s.sceneConcept || SCENE_CONCEPTS[i % SCENE_CONCEPTS.length],
    motionHook: s.motionHook || MOTION_HOOKS[i % MOTION_HOOKS.length],
  }));

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
};

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

const FILM_FILLS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cssVariables", "scenes"],
  properties: {
    // Anthropic structured outputs reject `additionalProperties: <object>`
    // (must be false). The merger already writes the identity-derived
    // variables onto :root; this schema is an OVERRIDE channel for the
    // known canonical vars. Custom one-off CSS belongs in per-scene
    // sceneCss strings.
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
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "contentHtml", "sceneCss", "timeline", "transitionIn"],
        properties: {
          id: { type: "string" },
          contentHtml: { type: "string" },
          sceneCss: { type: "string" },
          timeline: { type: "string" },
          transitionIn: {
            type: "string",
            enum: ["hard_cut", "shader_flash", "shader_wipe", "shader_zoom"],
          },
        },
      },
    },
    globalTimeline: { type: "string" },
  },
} as const;

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

/** Render the identity + storyboard summary into the user-message payload. */
function renderFilmIdentityPrompt(
  storyboard: Storyboard,
  identity: VisualIdentity,
): string {
  const imageHint = identity.imageKeyword
    ? `imageKeyword: "${identity.imageKeyword}" → https://source.unsplash.com/1920x1080/?${encodeURIComponent(identity.imageKeyword)}`
    : `imageKeyword: (none — type-only film)`;

  const logoHint = identity.logoUrl
    ? `\nbrandLogo:      ${identity.logoUrl}\n  · A real brand logo is provided. Embed it via <img src="${identity.logoUrl}" alt="logo" class="brand-logo"> in the FINAL scene's lockup/CTA. Style it (width ~280–420px) and animate it via standard entrance recipes. Optionally echo it small (~60px, top corner) in the OPENING scene as a quiet attribution; otherwise reserve it for the lockup so the reveal pays off.`
    : "";

  const dirBlock =
    identity.textDirection === "rtl"
      ? `\n═══ RTL FILM — language="${identity.language}", dir="rtl" ═══\nAll text right-anchored. Asymmetric layouts flip: focal side on the RIGHT, negative space LEFT. Accent bars on the right edge. Stagger reveals read right-to-left (use stagger.from: "end"). Mockups on the LEFT, type on the RIGHT. Do NOT translate the copy.\n`
      : `\nlanguage: ${identity.language} · dir: ltr\n`;

  const sceneLines = storyboard.scenes
    .map(
      (s, i) =>
        `  s${i + 1} (${s.durationSeconds}s) [${s.sceneConcept} / ${s.motionHook}] — ${s.copy}`,
    )
    .join("\n");

  const totalSeconds = storyboard.scenes.reduce((a, s) => a + s.durationSeconds, 0);

  return `LOCKED VISUAL IDENTITY (apply via CSS variables; the merger writes :root):
${dirBlock}
paletteName:    ${identity.paletteName}
background:     ${identity.background}     (already wired to --bg)
accents:        ${identity.accents.join(", ")}   (--accent-1, --accent-2, --accent-3)
ink:            ${identity.ink}                (--ink)
inkMuted:       ${identity.inkMuted}     (--ink-muted)
headlineFont:   "${identity.headlineFont}" (--headline-font)
bodyFont:       "${identity.bodyFont}" (--body-font)
monoFont:       "${identity.monoFont}" (--mono-font)
motionLanguage: ${identity.motionLanguage}
signatureMove:  ${identity.signatureMove}
assetPolicy:    ${identity.assetPolicy}
${imageHint}${logoHint}

══════════════════════════════════════════════════════════════════════════════
FILM PLAN — ${storyboard.scenes.length} scenes · ${totalSeconds}s total
══════════════════════════════════════════════════════════════════════════════
${sceneLines}

Emit a FilmFills JSON with EXACTLY ${storyboard.scenes.length} scenes, in this
order, with ids "s1" .. "s${storyboard.scenes.length}". Each scene's contentHtml/
sceneCss/timeline targets only #s${storyboard.scenes.length === 1 ? "1" : "N"}-scoped selectors.

DIVERSITY CHECK BEFORE EMITTING:
  • Before writing JSON, mentally sketch all ${storyboard.scenes.length} silhouettes
    (left-weighted heading vs. centered orbit vs. full-bleed image vs. KPI row
    vs. split panel vs. kinetic word grid vs. glowing ring vs. mockup ...).
  • Verify each silhouette is distinct from every other with all text removed.
  • If two would look similar, change the focal element of one before emitting.

TRANSITION BUDGET:
  • At most 2–3 scenes total may use a non-hard_cut transitionIn.
  • Suggested placements: scene 1 or 2 (hero reveal), one mid-film pivot, the
    final scene (CTA / brand lockup).
  • Every other scene MUST use "hard_cut".
`;
}

export async function generateFilmHTML(
  storyboard: Storyboard,
  identity: VisualIdentity = DEFAULT_VISUAL_IDENTITY,
): Promise<{ html: string; fills: FilmFills }> {
  const client = getClient();

  const userText = renderFilmIdentityPrompt(storyboard, identity);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];

  const MAX_RETRIES = 2;
  let html = "";
  let fills: FilmFills = { cssVariables: {}, scenes: [] };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Stream the response. Adaptive thinking + high effort burns a lot of
    // output tokens before any text lands, so non-streaming risks SDK HTTP
    // timeouts at max_tokens > 16K. .finalMessage() collects the full
    // Message once streaming completes.
    const stream = client.messages.stream({
      model: MODEL,
      // FILM_SYSTEM_PROMPT is byte-identical across retries within this call.
      // Cache it so retry rounds pay only the diff (assistant turn + new user turn).
      system: [
        {
          type: "text",
          text: FILM_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      // Multi-scene FilmFills JSON + adaptive thinking + high effort needs
      // headroom. 6 scenes of contentHtml/sceneCss/timeline averaging ~1.5K
      // tokens each = ~10K of output payload alone, plus thinking. Set high
      // enough that thinking can't starve the JSON emission.
      max_tokens: 48000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: FILM_FILLS_SCHEMA },
      },
    });
    const response = await stream.finalMessage();

    let raw = "";
    for (const block of response.content) {
      if (block.type === "text") raw += block.text;
    }

    // Diagnostic logging — surface what the model actually spent its budget on
    // before we touch raw. usage.output_tokens includes thinking tokens.
    const usage = response.usage;
    console.log(
      `[hyperframes film] attempt ${attempt + 1} stop_reason=${response.stop_reason} ` +
        `input=${usage.input_tokens} output=${usage.output_tokens} ` +
        `cache_read=${usage.cache_read_input_tokens ?? 0} ` +
        `cache_create=${usage.cache_creation_input_tokens ?? 0} ` +
        `text_chars=${raw.length}`,
    );

    if (!raw.trim()) {
      // No text block at all — the model spent its budget on thinking and never
      // emitted JSON, or stop_reason hit max_tokens before any text streamed.
      const hint =
        response.stop_reason === "max_tokens"
          ? "stop_reason=max_tokens — bump max_tokens or lower output_config.effort"
          : "model returned no text content (thinking exhausted output budget)";
      throw new Error(
        `generateFilmHTML: empty response on attempt ${attempt + 1} (${hint}). ` +
          `usage=${JSON.stringify(usage)}`,
      );
    }

    try {
      fills = JSON.parse(raw) as FilmFills;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If stop_reason was max_tokens the JSON is truncated — flag that explicitly.
      const hint =
        response.stop_reason === "max_tokens"
          ? " (response truncated at max_tokens — increase max_tokens)"
          : "";
      throw new Error(
        `generateFilmHTML: model returned non-JSON output despite json_schema constraint${hint}: ${msg}. ` +
          `First 400 chars of raw: ${raw.slice(0, 400)}`,
      );
    }

    html = buildFilmSkeleton(storyboard, identity, fills);

    const lint = await lintCompositionHTML(html);
    if (lint.ok) {
      if (attempt > 0) {
        console.log(
          `[hyperframes film] lint clean after ${attempt} retry${attempt === 1 ? "" : "s"}`,
        );
      }
      return { html, fills };
    }

    if (attempt === MAX_RETRIES) {
      console.warn(
        `[hyperframes film] lint still failing after ${MAX_RETRIES} retries — keeping last HTML. Errors: ${lint.errors.map((e) => e.code).join(", ")}`,
      );
      return { html, fills };
    }

    const errorsList = lint.errors
      .map(
        (e, i) =>
          `${i + 1}. [${e.code}] ${e.message}${e.fixHint ? ` — fix hint: ${e.fixHint}` : ""}`,
      )
      .join("\n");
    console.log(
      `[hyperframes film] lint attempt ${attempt + 1} failed (${lint.errors.length} error${lint.errors.length === 1 ? "" : "s"}): ${lint.errors.map((e) => e.code).join(", ")}`,
    );

    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `The composition built from your FilmFills JSON failed \`npx hyperframes lint\` with these errors:

${errorsList}

Re-emit the FilmFills JSON with the same scene structure (same ids, same concepts), fixing ONLY the failing fields. Do not redesign. Most errors are inside per-scene timeline strings or per-scene CSS — patch those targeted fields and re-emit the complete JSON.`,
    });
  }

  return { html, fills };
}
