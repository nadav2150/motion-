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

**Conclusion on coverage:** GSAP is fully documented. Anime.js, WAAPI, and Three.js are listed in the frame-adapters table with their seek mechanisms, but no dedicated guide pages exist at 0.6.6. The contracts below for those three engines are derived from the frame-adapters reference page (verified) plus the CLAUDE.md cross-check, and are marked accordingly.

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

**Confidence: VERIFIED (frame-adapters table) / PARTIALLY UNVERIFIED (code pattern)**

The seek method (`instance.seek(timeMs)`) and registration global (`window.__hfAnime`) are confirmed by the frame-adapters reference page and CLAUDE.md. No dedicated guide page exists at 0.6.6 — the minimal code example below is inferred from the seek-contract table plus standard Anime.js v3 API. **Confirm the exact registration shape against a running 0.6.6 composition before shipping.**

### Registration global

```javascript
window.__hfAnime = window.__hfAnime || [];
window.__hfAnime.push(animeInstance);
```

The framework collects all instances registered on `window.__hfAnime` and seeks them all on each frame.

> UNVERIFIED: whether `window.__hfAnime` is an Array (push pattern) or an object keyed by ID. The frame-adapters docs say "instance.seek() on window-registered animations" without specifying the shape. CLAUDE.md lists the global but not its shape. **Confirm before implementing the adapter.**

### Must be created paused?

**Yes** — the seek contract requires animations be under framework control, not self-playing. Use `autoplay: false`:

```javascript
const instance = anime({
  targets: "#my-element",
  opacity: [0, 1],
  duration: 500,
  autoplay: false,   // REQUIRED — do not let Anime.js drive its own clock
});

window.__hfAnime = window.__hfAnime || [];
window.__hfAnime.push(instance);
```

### How HyperFrames seeks to a given time

```javascript
instance.seek(t_seconds * 1000); // Anime.js seek() takes milliseconds
```

The frame-adapters table confirms: **`instance.seek(timeMs)`** — note the unit conversion: HyperFrames master clock is in **seconds**; `seek()` expects **milliseconds**.

```
t_ms = (normalizedFrame / fps) * 1000
```

### Time offset (placing animation at a scene's start offset)

Anime.js `seek()` positions within the animation's own duration (0 → `instance.duration` ms). To place an animation at a scene start offset on the global timeline, compute the local time:

```javascript
const SCENE_START_MS = 1860;  // e.g., data-start="1.86" converted to ms

// On each frame, the runtime will call:
// local_t_ms = global_t_ms - SCENE_START_MS
// instance.seek(clamp(local_t_ms, 0, instance.duration))
```

> UNVERIFIED: Whether HyperFrames performs the offset arithmetic internally (most likely, since it knows `data-start`) or whether the author must encode it inside the animation (e.g., using Anime.js timeline delays). **Confirm against running 0.6.6.**

### CDN URL

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js"></script>
```

> UNVERIFIED: HyperFrames docs do not specify which Anime.js version is tested. The v3 CDN URL above is the standard. Anime.js v4 has a different module format — verify compatibility with 0.6.6 before upgrading.

### Determinism constraints

- `autoplay: false` — mandatory.
- No `loop: true` or infinite animations.
- No `Math.random()` or `Date.now()` in `targets`, `delay`, or `easing` functions.
- All easing must be deterministic string references (`'easeInOutQuad'`) or pure mathematical functions.

---

## Engine 3: WAAPI (Web Animations API)

**Confidence: VERIFIED (seek mechanism) / PARTIALLY UNVERIFIED (registration shape)**

Seek via `document.getAnimations()` + `currentTime` is confirmed by both the frame-adapters table and CLAUDE.md. No dedicated guide page exists. The exact `fill` mode requirement and setup pattern are inferred from standard WAAPI usage. **Confirm against running 0.6.6.**

### Registration mechanism

WAAPI animations are **not explicitly registered** on a global. HyperFrames discovers them via the browser-native `document.getAnimations()` API, which returns all `Animation` objects currently attached to the document:

```javascript
const anim = element.animate(
  [{ opacity: 0 }, { opacity: 1 }],
  { duration: 500, fill: "both", delay: 0 }
);
anim.pause(); // REQUIRED immediately after creation
```

No `window.*` registration step — all animations created via `.animate()` or `@keyframes` + `animation:` CSS are automatically discoverable.

> UNVERIFIED: Whether HyperFrames seeks ALL animations returned by `document.getAnimations()` or only those in a specific paused state. **Confirm whether calling `anim.pause()` immediately is sufficient, or whether additional tagging (e.g., a `data-hf-managed` attribute) is expected.**

### Must be created paused?

**Yes.** Call `.pause()` immediately after construction so HyperFrames can take over `currentTime`:

```javascript
const anim = element.animate(keyframes, options);
anim.pause(); // take ownership away from browser clock
```

### How HyperFrames seeks to a given time

```javascript
// For each animation in document.getAnimations():
anim.currentTime = t_ms; // milliseconds
```

The frame-adapters table confirms: **`document.getAnimations()` + `currentTime` property**. The unit is **milliseconds**, same as Anime.js.

```
t_ms = (normalizedFrame / fps) * 1000
```

### Time offset (placing animation at a scene's start offset)

Use WAAPI's `delay` option to push the animation's start time forward within the composition's clock:

```javascript
const SCENE_START_MS = 1860; // data-start="1.86" * 1000

const anim = element.animate(
  [{ opacity: 0 }, { opacity: 1 }],
  {
    duration: 500,
    delay: SCENE_START_MS,   // animation starts at 1.86s on the global clock
    fill: "both",
  }
);
anim.pause();
```

With `fill: "both"`, the element holds its pre-animation state before `delay` and its final state after the animation ends — essential for deterministic frame snapshots.

> UNVERIFIED: Whether HyperFrames sets `currentTime` to the raw global time (so `delay` creates the offset), or whether it adjusts per-animation start times separately. **Confirm delay handling against running 0.6.6.**

### CDN URL

WAAPI is a **native browser API** — no CDN script required for basic usage. For a polyfill or enhanced features:

```html
<!-- Only needed for older browsers or advanced GroupEffect / KeyframeEffect usage -->
<script src="https://cdn.jsdelivr.net/npm/web-animations-js@2/web-animations.min.js"></script>
```

> UNVERIFIED: HyperFrames docs do not mention whether a WAAPI polyfill is needed in Chromium's headless mode. In practice, headless Chrome 112+ supports WAAPI natively. **Verify polyfill requirement with `npx hyperframes@0.6.6 doctor`.**

### Determinism constraints

- Always use `fill: "both"` (or `fill: "forwards"`) — without it, elements snap back to their natural state outside the animation range, causing frame-capture inconsistencies.
- `anim.pause()` immediately after construction — no browser-clock playback.
- No `infinite` iteration counts (`iterations: Infinity`).
- No `Math.random()` in keyframe values.
- CSS `animation:` shorthand with `animation-play-state: paused` also works for keyframe-driven animations, which HyperFrames picks up via `document.getAnimations()`.

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
| **Anime.js** | `window.__hfAnime.push(instance)` | `instance.seek(t_ms)` | **milliseconds** | `autoplay: false` | Computed offset: `local_ms = global_ms - scene_start_ms` (UNVERIFIED) |
| **WAAPI** | None — `document.getAnimations()` discovery | `anim.currentTime = t_ms` | **milliseconds** | `.pause()` immediately after `.animate()` | `delay: scene_start_ms` in options (UNVERIFIED) |
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

The following are marked UNVERIFIED and must be confirmed against a running HyperFrames 0.6.6 instance before the adapter implementations in Tasks 6–8 are finalised:

| # | Engine | Item |
|---|--------|------|
| 1 | Anime.js | Exact shape of `window.__hfAnime` — Array (push) vs. keyed object |
| 2 | Anime.js | Whether HyperFrames offsets `seek()` time by sub-composition `data-start`, or the author must do it |
| 3 | Anime.js | Confirmed CDN version (v3 vs v4; v4 has breaking module format changes) |
| 4 | WAAPI | Whether `delay` in animation options creates the correct offset, or HyperFrames adjusts `currentTime` per-animation relative to some baseline |
| 5 | WAAPI | Whether any polyfill is needed in headless Chrome (likely not, but unverified) |
| 6 | WAAPI | Whether HyperFrames seeks ALL `document.getAnimations()` or only paused ones |
| 7 | Three.js | Exact `hf-seek` event payload shape (`event.detail.time`, `event.detail.frame`, other fields?) |
| 8 | Three.js | Whether `hf-seek` carries global or sub-composition-local time |
| 9 | Three.js | Pinned Three.js version tested with 0.6.6 |
| 10 | Three.js | `AnimationMixer` pattern — `mixer.setTime(t)` vs `mixer.update(delta)` recommendation |

**Fastest verification method**: `npx hyperframes skills` to install engine-specific skill files (which contain authoritative code examples), or create a minimal test composition for each engine and run `npx hyperframes@0.6.6 render`.
