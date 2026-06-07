# HyperFrames 0.6.6 — Per-Engine Seek Contracts

> Research date: 2026-06-07  
> Target version: **hyperframes@0.6.6** (pinned)  
> Author: Claude Code (Task 4 — multi-engine adapter research)

---

## Sources used

| Source | Method | Result |
|--------|--------|--------|
| `npx --yes hyperframes@0.6.6 docs` (topic list) | CLI | OK — listed 6 topics |
| `npx --yes hyperframes@0.6.6 docs gsap` | CLI | OK |
| `npx --yes hyperframes@0.6.6 docs rendering` | CLI | OK |
| `npx --yes hyperframes@0.6.6 docs data-attributes` | CLI | OK |
| `npx --yes hyperframes@0.6.6 docs compositions` | CLI | OK |
| `npx --yes hyperframes@0.6.6 docs examples` | CLI | OK |
| `npx --yes hyperframes@0.6.6 docs troubleshooting` | CLI | OK |
| `npx --yes hyperframes@0.6.6 docs animejs/anime/waapi/three/threejs` | CLI | ALL UNKNOWN — not in CLI docs |
| `https://hyperframes.heygen.com/llms.txt` | WebFetch | OK |
| `https://hyperframes.heygen.com/concepts/frame-adapters.md` | WebFetch | OK — key source |
| `https://hyperframes.heygen.com/guides/gsap-animation.md` | WebFetch | OK |
| `https://hyperframes.heygen.com/packages/engine.md` | WebFetch | OK |
| `https://hyperframes.heygen.com/packages/core.md` | WebFetch | OK |
| `https://hyperframes.heygen.com/concepts/data-attributes.md` | WebFetch | OK |
| `https://hyperframes.heygen.com/concepts/determinism.md` (via mintlify mirror) | WebFetch | OK |
| `https://hyperframes.mintlify.app/concepts/frame-adapters.md` | WebFetch | OK — confirmed frame-adapters |
| `https://hyperframes.mintlify.app/reference/html-schema.md` | WebFetch | OK |
| `https://hyperframes.heygen.com/guides/animejs.md` (and variants) | WebFetch | 404 — no dedicated page |
| `https://hyperframes.heygen.com/guides/waapi.md` (and variants) | WebFetch | 404 — no dedicated page |
| `https://hyperframes.heygen.com/guides/three.md` (and variants) | WebFetch | 404 — no dedicated page |
| `hf-example/CLAUDE.md` (local repo file) | Read | OK — cross-check source |
| `hf-example/index.html` + `compositions/*.html` (local examples) | Read | OK — GSAP pattern confirmed |
| `https://github.com/heygen-com/hyperframes/tree/main/skills/animejs` | WebFetch | **OK — AUTHORITATIVE: `skills/animejs/SKILL.md`** |
| `https://github.com/heygen-com/hyperframes/tree/main/skills/waapi` | WebFetch | **OK — AUTHORITATIVE: `skills/waapi/SKILL.md`** |
| `https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/animejs/SKILL.md` | WebFetch | **OK — verbatim skill file read** |
| `https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/waapi/SKILL.md` | WebFetch | **OK — verbatim skill file read** |
| `https://github.com/heygen-com/hyperframes/blob/main/packages/core/src/runtime/adapters/animejs.ts` | WebFetch | **OK — authoritative adapter source code** |
| `https://github.com/heygen-com/hyperframes/blob/main/packages/core/src/runtime/adapters/waapi.ts` | WebFetch | **OK — authoritative adapter source code** |

**Conclusion on coverage:** GSAP is fully documented. Anime.js and WAAPI are now **fully verified** from two authoritative sources each: the `skills/*/SKILL.md` canonical usage guides and the `packages/core/src/runtime/adapters/*.ts` source code. Three.js remains partially inferred. Dedicated guide pages (`.heygen.com/guides/animejs`, etc.) do not exist in the published docs site but the GitHub skills and source code are definitive.

---

## Background: HyperFrames Seek Architecture

HyperFrames renders video via a **seek-and-capture loop**, not real-time recording:

1. For every frame `n` in the video, the engine calls `renderSeek(t)` where `t = n / fps`.
2. Chrome's `HeadlessExperimental.beginFrame` API captures the compositor output atomically.
3. This means **animations must answer "what does frame N look like?" on demand** — they must not self-play.

### Host normalisation (applied before every seek)

```
normalizedFrame = clamp(Math.floor(frame), 0, durationFrames - 1)
t_seconds       = normalizedFrame / fps
```

### Frame Adapter interface (v0, experimental)

The TypeScript contract that every built-in and custom adapter must satisfy:

```typescript
type FrameAdapterContext = {
  compositionId: string;
  fps: number;
  width: number;
  height: number;
  rootElement: HTMLElement;
};

type FrameAdapter = {
  id: string;
  init?: (ctx: FrameAdapterContext) => Promise<void> | void;
  getDurationFrames: () => number;            // must return finite integer ≥ 0
  seekFrame: (frame: number) => Promise<void> | void;  // idempotent, random-access safe
  destroy?: () => Promise<void> | void;
};
```

Lifecycle: `init()` → `getDurationFrames()` → loop `[seekFrame(n) → capture]` → `destroy()`

---

## Engine 1: GSAP

**Confidence: VERIFIED** — CLI `docs gsap`, WebFetch guide, and local hf-example all consistent.

### Registration global

```javascript
window.__timelines = window.__timelines || {};
window.__timelines["<data-composition-id>"] = tl;
```

The key **must exactly match** the element's `data-composition-id` attribute. The framework discovers timelines automatically by this key.

### Must be created paused?

**Yes — mandatory.**

```javascript
const tl = gsap.timeline({ paused: true });
```

The framework owns all playback. A timeline that auto-plays will desync from the seek-and-capture loop and produce corrupted frames.

### How HyperFrames seeks to a given time

On each captured frame the runtime calls (internally):

```javascript
timeline.totalTime(t_seconds);   // primary method per frame-adapters table
// also documented as: timeline.seek(t_seconds)
```

Both `totalTime()` and `seek()` are listed as equivalent seek methods. `totalTime()` is preferred — it respects nested timelines correctly.

### Time offset (placing animation at a scene's start offset)

Use GSAP's **position parameter** (third argument to `.to()`, `.from()`, `.fromTo()`, `.set()`). This is an **absolute time** on the master timeline, not a relative offset:

```javascript
const SCENE_START = 1.86; // seconds — the sub-composition's data-start value

const tl = gsap.timeline({ paused: true });
tl.to("#lower-third", { opacity: 1, duration: 0.5 }, SCENE_START);       // starts at 1.86s
tl.to("#lower-third", { x: -640,   duration: 0.6 }, SCENE_START + 7.2); // starts at 9.06s
```

Because HyperFrames seeks the timeline using absolute seconds (matching the composition's global clock), a sub-composition's timeline positions are already offset by the scene start time. No additional wrapping timeline is needed.

To extend a timeline to match video duration without adding visual output:

```javascript
tl.set({}, {}, TOTAL_DURATION_SECONDS); // zero-duration tween at end
```

### CDN URL (verified from hf-example and CLI docs)

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
```

The CLI docs example uses the looser `gsap@3` tag; the local hf-example pins `gsap@3.14.2`. **Pin to `3.14.2`** for deterministic rendering.

### Determinism constraints

- Timeline must be `{ paused: true }` — framework drives all playback.
- Do **not** call `video.play()`, `video.pause()`, or set `audio.currentTime` manually.
- Do **not** nest child timelines into parent timelines manually — the framework handles composition nesting.
- Timelines must be **finite** — no `repeat: -1` or `yoyo: true` infinite loops.
- Supported animatable CSS properties: `opacity`, `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotation`, `width`, `height`, `visibility`.
- No `Date.now()`, `Math.random()`, `requestAnimationFrame()`, or network fetches inside animation setup.

---

## Engine 2: Anime.js

**Confidence: FULLY VERIFIED** — from `skills/animejs/SKILL.md` (canonical usage guide) and `packages/core/src/runtime/adapters/animejs.ts` (adapter source code), both from the authoritative `heygen-com/hyperframes` GitHub repo.

### Registration global

**Shape: Array** — push each instance explicitly.

```javascript
window.__hfAnime = window.__hfAnime || [];
window.__hfAnime.push(animeInstance);
```

The adapter iterates `window.__hfAnime` as a plain Array and calls `instance.seek(timeMs)` on each element. There is no keyed-object form.

**Auto-discovery fallback:** The adapter also scans `anime.running` (Anime.js's internal active-instances array) to catch instances that were not manually pushed. However, **explicit `push()` is required** — do not rely on auto-discovery.

Source: `animejs.ts` `discover()` function merges `anime.running` into `__hfAnime` as a fallback; `seek()` iterates the array.

### Must be created paused?

**Yes — mandatory.** Use `autoplay: false`:

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js"></script>
<script>
  const anim = anime({
    targets: ".mark",
    translateX: 280,
    rotate: "1turn",
    opacity: [0, 1],
    duration: 1200,
    easing: "easeOutExpo",
    autoplay: false,          // REQUIRED — HyperFrames owns the clock
  });

  window.__hfAnime = window.__hfAnime || [];
  window.__hfAnime.push(anim);
</script>
```

Timeline pattern:

```javascript
const tl = anime.timeline({
  autoplay: false,            // REQUIRED on the timeline object
  easing: "easeOutCubic",
});

tl.add({
  targets: ".title",
  translateY: [40, 0],
  opacity: [0, 1],
  duration: 650,
}).add(
  {
    targets: ".accent",
    scaleX: [0, 1],
    duration: 450,
  },
  250,
);

window.__hfAnime = window.__hfAnime || [];
window.__hfAnime.push(tl);
```

### How HyperFrames seeks to a given time

The adapter internally converts global time (seconds) to milliseconds, then calls:

```javascript
instance.seek(timeMs);   // timeMs = ctx.time * 1000
```

From `animejs.ts` source (verbatim):

```typescript
seek: (ctx) => {
  const timeMs = Math.max(0, (Number(ctx.time) || 0) * 1000);
  for (const instance of instances) {
    if (typeof instance.seek === "function") {
      instance.seek(timeMs);
    }
  }
},
```

**Unit: milliseconds.** Anime.js `seek()` takes ms; HyperFrames performs the `seconds → ms` conversion internally.

```
t_ms = Math.max(0, ctx.time * 1000)   // ctx.time is global seconds
```

### Time offset (placing animation at a scene's start offset)

The adapter passes the **raw global composition time** (in ms) to every `instance.seek()` call — it does **not** apply any per-instance `data-start` offset. The author must encode scene-local timing inside the animation itself.

For a single animation that starts at `SCENE_START` seconds into the composition, use Anime.js's `delay` option (which shifts the animation's internal time origin):

```javascript
const SCENE_START_MS = 1860; // data-start="1.86" * 1000

const anim = anime({
  targets: ".lower-third",
  opacity: [0, 1],
  duration: 500,
  delay: SCENE_START_MS,     // Anime.js delays the start by this many ms
  autoplay: false,
});

window.__hfAnime = window.__hfAnime || [];
window.__hfAnime.push(anim);
```

For timelines, use the timeline's `delay` option or `.add({}, offset)` position argument:

```javascript
const tl = anime.timeline({ autoplay: false });
tl.add({ targets: ".title", opacity: [0, 1], duration: 500 }, SCENE_START_MS);
```

The SKILL.md does not document scene-offset as a built-in HyperFrames feature for Anime.js; the adapter source confirms the seek is global-clock. **Use `delay` or timeline offsets as the offset mechanism.**

### CDN URL (pinned, verified from SKILL.md and adapter JSDoc)

**Anime.js v4 is required** (the `.seek()` API is confirmed to work with v4; v3 has a different API surface). The SKILL.md and the adapter's own JSDoc example both pin:

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js"></script>
```

ES module alternative (also documented in SKILL.md):

```html
<script type="module">
  import { animate } from "https://cdn.jsdelivr.net/npm/animejs/+esm";

  const anim = animate(".chip", {
    x: "18rem",
    duration: 900,
    autoplay: false,
  });

  window.__hfAnime = window.__hfAnime || [];
  window.__hfAnime.push(anim);
</script>
```

> **Warning:** Anime.js v3 (`animejs@3`) has a different module format and CDN path (`lib/anime.min.js`). HyperFrames 0.6.6 targets **v4** — do not use v3.

### Determinism constraints

- `autoplay: false` — mandatory on every `anime({})` and `anime.timeline({})` call.
- No `loop: true` or infinite animations — compute a finite repeat count.
- Do not rely on `anime.running` auto-discovery alone — always `push()` explicitly.
- No `Math.random()` or `Date.now()` in `targets`, `delay`, or `easing` functions.
- Do not build animations inside timers, promises, event handlers, or after async asset loads — create synchronously during composition init.
- Adapter also exposes `pause()` and `play()` (called by HyperFrames lifecycle) — ensure the instance has these methods (all `anime()` and `anime.timeline()` return objects do).

---

## Engine 3: WAAPI (Web Animations API)

**Confidence: FULLY VERIFIED** — from `skills/waapi/SKILL.md` (canonical usage guide) and `packages/core/src/runtime/adapters/waapi.ts` (adapter source code), both from the authoritative `heygen-com/hyperframes` GitHub repo.

### Registration mechanism

WAAPI animations are **not explicitly registered** on any global. HyperFrames discovers them automatically via `document.getAnimations()`, which returns all `Animation` objects currently attached to the document — including those created with `element.animate()` and CSS `@keyframes` / `animation:`.

```javascript
const orb = document.getElementById("orb");
const animation = orb.animate(
  [
    { transform: "translate3d(-160px, 0, 0) scale(0.8)", opacity: 0 },
    { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, offset: 0.35 },
    { transform: "translate3d(120px, 0, 0) scale(1.08)", opacity: 1 },
  ],
  {
    duration: 3000,
    delay: 2000,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    fill: "both",
    iterations: 1,
  },
);

animation.pause();    // pause after creation; adapter will also pause on every seek
```

No `window.*` registration step is required or supported.

**Which animations are sought:** The adapter calls `document.getAnimations()` and seeks **ALL** returned animations on each frame. There is no filtering by state or tag. Every live `Animation` in the document is seeked and then explicitly paused on every frame.

### Must be created paused?

**Yes — strongly recommended.** Call `.pause()` immediately after creation. The adapter also calls `animation.pause()` after every `currentTime` write, so even if you forget the initial pause, the adapter takes ownership on the first seek. However, explicit `pause()` after construction avoids any browser-clock frames before the first seek.

```javascript
const anim = element.animate(keyframes, options);
anim.pause();   // take ownership away from browser clock immediately
```

From the adapter source (seek function, verbatim):

```typescript
try {
  animation.currentTime = localTimeMs;
} catch (err) { … }
try {
  animation.pause();
} catch (err) { … }
```

The adapter writes `currentTime` and then `pause()`s on every single frame.

### How HyperFrames seeks to a given time

The adapter iterates `document.getAnimations()` and sets `currentTime` (in milliseconds) on each, then pauses it:

```typescript
seek: (ctx) => {
  const timeMs = Math.max(0, (Number(ctx.time) || 0) * 1000);
  // …
  for (const animation of snapshotAnimations()) {
    const localTimeMs = baseline.animationTimeMs + Math.max(0, timeMs - baseline.compositionTimeMs);
    animation.currentTime = localTimeMs;
    animation.pause();
  }
},
```

**Unit: milliseconds.** `ctx.time` is global seconds; the adapter converts to ms internally.

### Time offset — how `delay` interacts with the adapter

The adapter implements a **baseline system** to handle animations that were created with non-zero `currentTime` (e.g., created after `discover()` has already been called). The key arithmetic is:

```
localTimeMs = baseline.animationTimeMs + max(0, seekTimeMs - baseline.compositionTimeMs)
```

In the common case (animations created before first seek, `discover()` not yet called), `baseline.animationTimeMs = 0` and `baseline.compositionTimeMs = 0`, so:

```
localTimeMs = seekTimeMs   // the raw global composition time in ms
```

This means the adapter sets `currentTime` to the **raw global composition time** — not an animation-local time. **WAAPI `delay` then creates the scene-start offset correctly:** when `currentTime = 1500ms` and the animation has `delay: 2000ms`, the animation hasn't started yet (it's in the pre-fill region), and `fill: "both"` holds the first keyframe state.

Verified pattern from SKILL.md:

```javascript
const SCENE_START_MS = 2000; // data-start="2" * 1000

const animation = element.animate(
  [
    { transform: "translate3d(-160px, 0, 0) scale(0.8)", opacity: 0 },
    { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, offset: 0.35 },
    { transform: "translate3d(120px, 0, 0) scale(1.08)", opacity: 1 },
  ],
  {
    duration: 3000,
    delay: SCENE_START_MS,     // use delay for scene-start offset
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    fill: "both",              // REQUIRED — holds state outside animation range
    iterations: 1,
  },
);

animation.pause();
```

Stagger pattern (each element gets its own delay):

```javascript
document.querySelectorAll(".token").forEach((token, index) => {
  const animation = token.animate(
    [
      { transform: "translateY(24px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    {
      duration: 620,
      delay: index * 80,         // stagger — no scene-start offset needed here
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      fill: "both",
      iterations: 1,
    },
  );
  animation.pause();
});
```

### CDN URL

WAAPI is a **native browser API** — no CDN script required. Headless Chrome (which HyperFrames uses for rendering) supports WAAPI natively; no polyfill is needed.

```html
<!-- No CDN script needed. element.animate() is built into the browser. -->
```

If you need `GroupEffect` or `KeyframeEffect` APIs beyond basic `element.animate()`:

```html
<!-- Only for advanced KeyframeEffect / GroupEffect usage in older Chromium builds -->
<script src="https://cdn.jsdelivr.net/npm/web-animations-js@2/web-animations.min.js"></script>
```

The SKILL.md contains no CDN URL — confirming no polyfill is expected.

### Determinism constraints

- Always use `fill: "both"` — without it, elements snap back outside the animation range and produce inconsistent frame captures. This is the single most important WAAPI gotcha.
- `animation.pause()` immediately after construction — the adapter also pauses on every seek, but explicit early pausing is correct.
- No `iterations: Infinity` — compute a finite repeat count.
- No `Math.random()` in keyframe values.
- No `requestAnimationFrame`, timers, or `performance.now()` for render-critical state.
- Do not use `animation.finished` to mutate render-critical DOM — this promise may never resolve during seek-driven rendering.
- Model clip-local start times with `delay:` in the animation options — the adapter does not automatically subtract `data-start` from `currentTime`.
- CSS `animation:` with `animation-play-state: paused` is also discoverable via `document.getAnimations()`, but `element.animate()` + explicit `pause()` is the documented pattern.

---

## Engine 4: Three.js (WebGL)

**Confidence: VERIFIED (seek mechanism) / PARTIALLY UNVERIFIED (full event payload + setup pattern)**

The `hf-seek` event and `window.__hfThreeTime` are confirmed by both the frame-adapters table and CLAUDE.md. No dedicated guide page exists at 0.6.6. The event payload shape and full scene setup pattern are inferred. **Confirm event payload and RAF replacement pattern against running 0.6.6.**

### Registration mechanism

Three.js integrates via a **DOM event** rather than a global timeline registry. HyperFrames dispatches an `hf-seek` event on the `window` (or the canvas element — confirm) on each frame. The composition listens for this event and re-renders the Three.js scene to the requested time:

```javascript
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("canvas"), antialias: true });
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, 1920 / 1080, 0.1, 1000);

// Optional: expose current time so external code can inspect it
window.__hfThreeTime = 0;

window.addEventListener("hf-seek", (event) => {
  const t = event.detail.time; // seconds — VERIFY payload shape
  window.__hfThreeTime = t;

  // Update scene state to match time t
  mesh.rotation.y = t * Math.PI;

  // Render a single frame — no animation loop
  renderer.render(scene, camera);
});
```

> UNVERIFIED: The exact event payload shape. Based on the frame-adapters table and the `window.__hfThreeTime` pattern the likely shape is `{ detail: { time: number, frame: number } }` but **this must be confirmed against 0.6.6 source or a running example.**

### Must be created paused?

Three.js does not have a concept of "paused" — it renders on demand. The key rule is: **do NOT use `requestAnimationFrame` or `renderer.setAnimationLoop()`**. The scene must render only when the `hf-seek` event fires:

```javascript
// WRONG — self-driven loop breaks determinism:
renderer.setAnimationLoop(() => renderer.render(scene, camera));

// CORRECT — event-driven render:
window.addEventListener("hf-seek", (e) => {
  updateScene(e.detail.time);
  renderer.render(scene, camera);
});
```

### How HyperFrames seeks to a given time

HyperFrames dispatches `hf-seek` on each frame with the current time. The composition **must** render synchronously inside the handler (no deferred `Promise` or async operations):

```javascript
window.addEventListener("hf-seek", (event) => {
  const t = event.detail.time; // seconds (float)
  // compute all transforms, uniforms, morph targets from t
  mixer.setTime(t);            // if using AnimationMixer
  renderer.render(scene, camera);
});
```

`window.__hfThreeTime` is a convenience write-back so the HyperFrames runtime can read back the scene's current time — write it at the start of the handler.

### Time offset (placing animation at a scene's start offset)

Subtract the scene's `data-start` value from the event time to get local scene time:

```javascript
const SCENE_START = 1.86; // seconds — matches data-start on the parent div

window.addEventListener("hf-seek", (event) => {
  const globalT = event.detail.time;
  const localT  = Math.max(0, globalT - SCENE_START);

  window.__hfThreeTime = globalT;
  updateScene(localT); // localT goes from 0 when the scene starts
  renderer.render(scene, camera);
});
```

> UNVERIFIED: Whether HyperFrames fires `hf-seek` with the global composition time or the sub-composition local time when Three.js is embedded in a nested composition. **Assume global time and apply the offset manually unless confirmed otherwise.**

### CDN URL

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.min.js"></script>
```

> UNVERIFIED: HyperFrames docs do not specify a pinned Three.js version. Use the latest stable r176 (current as of 2026-06-07). Pin the exact version for reproducible renders.

### Determinism constraints

- No `requestAnimationFrame` or `renderer.setAnimationLoop()` — render only in the `hf-seek` handler.
- No `Date.now()` or `performance.now()` for time — use `event.detail.time` exclusively.
- No `Math.random()` in shader uniforms, geometry generation, or particle systems — use seeded PRNG or static geometry.
- No texture loads from the network inside the `hf-seek` handler — all assets must be loaded during `init()`.
- If using `THREE.AnimationMixer`: call `mixer.update(0)` (not `mixer.update(delta)`) then `mixer.setTime(localT)` to avoid wall-clock delta accumulation.
- WebGL state must be fully determined by `t` alone — no accumulated stateful transforms.

---

## Cross-Engine Summary Table

| Engine | Registration | Seek call | Unit | Paused requirement | Time offset |
|--------|-------------|-----------|------|--------------------|-------------|
| **GSAP** | `window.__timelines["<id>"] = tl` | `tl.totalTime(t)` | seconds | `{ paused: true }` in constructor | Position parameter (3rd arg) on each tween |
| **Anime.js** | `window.__hfAnime.push(instance)` — Array | `instance.seek(t_ms)` where `t_ms = global_s * 1000` | **milliseconds** | `autoplay: false` | `delay: scene_start_ms` in anime options, or `.add({}, offset)` in timeline |
| **WAAPI** | None — `document.getAnimations()` auto-discovery | `anim.currentTime = t_ms` then `anim.pause()` | **milliseconds** | `.pause()` immediately after `.animate()` (adapter also pauses on every seek) | `delay: scene_start_ms` in animate options; adapter passes raw global time |
| **Three.js** | `hf-seek` DOM event listener | `renderer.render()` inside handler | seconds (event payload) | No RAF / no `setAnimationLoop` | Subtract `SCENE_START` from `event.detail.time` |

---

## Universal Determinism Rules (all engines)

These apply regardless of engine:

1. **No wall-clock time**: Never use `Date.now()`, `performance.now()`, `new Date()`, or `requestAnimationFrame` timestamps.
2. **No unseeded randomness**: Never use `Math.random()` — use a seeded PRNG or bake values as constants.
3. **No runtime network fetches**: All assets (fonts, textures, JSON) must resolve before the first `seekFrame()` call. Load in `init()` or inline.
4. **Finite duration only**: No infinite loops, repeating animations, or `repeat: -1`.
5. **Idempotency**: Seeking to the same frame twice must produce pixel-identical output.
6. **Random-access safe**: Adapters must handle seek orders like `[90, 10, 50, 10]` without state corruption.
7. **No `requestAnimationFrame` self-loops**: Compositions must not self-drive animation — the HyperFrames render loop is the only clock.

---

## Items requiring confirmation before shipping adapter code

Items 1–6 (Anime.js and WAAPI) are now **fully resolved** from the authoritative GitHub skill files and adapter source code. Only Three.js items remain open.

### Resolved (Anime.js + WAAPI) — no further action needed

| # | Engine | Item | Resolution |
|---|--------|------|------------|
| 1 | Anime.js | Exact shape of `window.__hfAnime` — Array vs. keyed object | **RESOLVED: Array** — `push()` pattern; adapter iterates as array |
| 2 | Anime.js | Whether HyperFrames offsets `seek()` by `data-start` | **RESOLVED: No** — adapter passes raw global time; author uses `delay:` option |
| 3 | Anime.js | Confirmed CDN version (v3 vs v4) | **RESOLVED: v4 is required** — `animejs@4.0.2/lib/anime.iife.min.js` |
| 4 | WAAPI | Whether `delay` creates correct offset | **RESOLVED: Yes** — adapter sets raw global `currentTime`; WAAPI `delay` shifts the animation's effective start |
| 5 | WAAPI | Whether polyfill needed in headless Chrome | **RESOLVED: No** — SKILL.md contains no polyfill; native WAAPI is assumed |
| 6 | WAAPI | Whether ALL `document.getAnimations()` are sought or only paused | **RESOLVED: ALL** — adapter seeks every animation returned, then pauses each |

### Still UNVERIFIED — Three.js only

| # | Engine | Item | How to confirm |
|---|--------|------|----------------|
| 7 | Three.js | Exact `hf-seek` event payload shape (`event.detail.time`, `event.detail.frame`, other fields?) | Read `skills/three/SKILL.md` or `packages/core/src/runtime/adapters/three.ts` from the GitHub repo |
| 8 | Three.js | Whether `hf-seek` carries global or sub-composition-local time | Same sources as #7 |
| 9 | Three.js | Pinned Three.js version tested with 0.6.6 | `skills/three/SKILL.md` CDN example |
| 10 | Three.js | `AnimationMixer` pattern — `mixer.setTime(t)` vs `mixer.update(delta)` | `skills/three/SKILL.md` or adapter source |

**To resolve Three.js items:** Fetch `https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/three/SKILL.md` and `https://github.com/heygen-com/hyperframes/blob/main/packages/core/src/runtime/adapters/three.ts` — the same approach that verified Anime.js and WAAPI.
