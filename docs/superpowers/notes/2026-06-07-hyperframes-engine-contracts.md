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
| `https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/three/SKILL.md` | gh API (base64) | **OK — verbatim Three.js skill file** |
| `packages/core/src/runtime/adapters/three.ts` (sha c7ddfc9f) | gh API (base64) | **OK — verbatim Three.js adapter source** |
| `packages/core/src/runtime/adapters/seek-dispatch.ts` (sha 6261cc5a) | gh API (base64) | **OK — verbatim seek-dispatch source** |
| `packages/core/src/runtime/adapters/three.test.ts` (sha eb26beb7) | gh API (base64) | **OK — verbatim Three.js adapter tests** |

**Conclusion on coverage:** GSAP is fully documented. Anime.js, WAAPI, and Three.js are now **fully verified** from two authoritative sources each: the `skills/*/SKILL.md` canonical usage guides and the `packages/core/src/runtime/adapters/*.ts` source code. Dedicated guide pages (`.heygen.com/guides/animejs`, etc.) do not exist in the published docs site but the GitHub skills and source code are definitive.

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

**Yes — mandatory.** Use `autoplay: false`.

> **API correction (2026-06-07):** The Anime.js v4 IIFE build (`animejs@4.0.2`) exposes `anime` as a **plain object, not a callable function**. The v3-style `anime({...})` call and `anime.timeline({...})` both **throw at runtime**. This was confirmed when `scripts/smoke-multi-engine.ts` rendered a real MP4 using the correct v4 API. Use `anime.createTimeline(...)` or `anime.animate(...)` instead.

Single-animation pattern — use `anime.animate(targets, opts)`:

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js"></script>
<script>
  const anim = anime.animate(".mark", {
    translateX: { from: -280, to: 0 },
    opacity: { from: 0, to: 1 },
    duration: 1200,
    easing: "easeOutExpo",
    autoplay: false,          // REQUIRED — HyperFrames owns the clock
  });

  window.__hfAnime = window.__hfAnime || [];
  window.__hfAnime.push(anim);
</script>
```

Timeline pattern — use `anime.createTimeline({ autoplay: false }).add(targets, opts)`:

```javascript
const tl = anime.createTimeline({
  autoplay: false,            // REQUIRED on the timeline object
  easing: "easeOutCubic",
});

tl.add(".title", {
  translateY: { from: 40, to: 0 },
  opacity: { from: 0, to: 1 },
  duration: 650,
}).add(".accent", {
  scaleX: { from: 0, to: 1 },
  duration: 450,
}, 250);

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

const anim = anime.animate(".lower-third", {
  opacity: { from: 0, to: 1 },
  duration: 500,
  delay: SCENE_START_MS,     // Anime.js delays the start by this many ms
  autoplay: false,
});

window.__hfAnime = window.__hfAnime || [];
window.__hfAnime.push(anim);
```

For timelines, use the timeline's `delay` option or the `.add(targets, opts, offset)` position argument:

```javascript
const tl = anime.createTimeline({ autoplay: false });
tl.add(".title", { opacity: { from: 0, to: 1 }, duration: 500 }, SCENE_START_MS);
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

- `autoplay: false` — mandatory on every `anime.createTimeline({})` and `anime.animate()` call.
- No `loop: true` or infinite animations — compute a finite repeat count.
- Do not rely on `anime.running` auto-discovery alone — always `push()` explicitly.
- No `Math.random()` or `Date.now()` in `targets`, `delay`, or `easing` functions.
- Do not build animations inside timers, promises, event handlers, or after async asset loads — create synchronously during composition init.
- Adapter also exposes `pause()` and `play()` (called by HyperFrames lifecycle) — ensure the instance has these methods (all `anime.createTimeline()` and `anime.animate()` return objects do).

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

**Confidence: FULLY VERIFIED** — from `skills/three/SKILL.md` (canonical usage guide), `packages/core/src/runtime/adapters/three.ts` (adapter source), `packages/core/src/runtime/adapters/seek-dispatch.ts` (event dispatch source), and `packages/core/src/runtime/adapters/three.test.ts` (test suite), all from the authoritative `heygen-com/hyperframes` GitHub repo, fetched 2026-06-07.

### hf-seek event mechanism (VERIFIED)

**Event target: `window`** — the adapter calls `window.dispatchEvent(...)` (not `document`).

**Event construction (verbatim from `seek-dispatch.ts`, sha 6261cc5a):**

```typescript
window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
```

**Payload shape:** `event.detail` has exactly **one field**: `{ time: number }`. There is no `frame` field, no `fps` field, no other fields.

**Unit: seconds** — `time` is the clamped/normalised float in seconds (`Math.max(0, Number(ctx.time) || 0)`).

**Deduplication:** `seek-dispatch.ts` deduplicates by exact float equality — if two adapters (e.g. Three.js and TypeGPU) both seek to the same `time` synchronously, only the first call fires the event. This prevents doubled per-frame work when multiple GPU adapters are active.

**Adapter source (verbatim from `three.ts`, sha c7ddfc9f):**

```typescript
import type { RuntimeDeterministicAdapter } from "../types";
import { dispatchSeekEvent } from "./seek-dispatch";

export function createThreeAdapter(): RuntimeDeterministicAdapter {
  let forcedTime: number | null = null;
  let lastForcedTime = 0;

  return {
    name: "three",
    discover: () => {},
    seek: (ctx) => {
      forcedTime = Math.max(0, Number(ctx.time) || 0);
      lastForcedTime = forcedTime;
      window.__hfThreeTime = forcedTime;
      dispatchSeekEvent(forcedTime);
    },
    pause: () => {
      if (forcedTime == null) {
        forcedTime = Math.max(0, lastForcedTime);
      }
    },
    play: () => {
      forcedTime = null;
    },
    revert: () => {
      forcedTime = null;
      lastForcedTime = 0;
    },
  };
}
```

### `window.__hfThreeTime` semantics (VERIFIED)

**Who sets it:** The HyperFrames adapter (`three.ts`) sets `window.__hfThreeTime = forcedTime` on every `seek()` call, before firing the event.

**Who reads it:** The **composition author's code** reads `window.__hfThreeTime` for the initial render call (before any seek event fires):

```javascript
renderAt(window.__hfThreeTime || 0);
```

This provides the correct time on the first synchronous render (which may happen before the first `hf-seek` is dispatched). After the first seek, `window.__hfThreeTime` tracks the current forced time.

**Summary:** HyperFrames writes it; the composition reads it. It is a one-way communication channel from the runtime to the scene.

### Registration mechanism

Three.js integrates via a **DOM event** rather than a global timeline registry. No `window.*` registration step is required. Listen for `"hf-seek"` on `window`:

```javascript
window.addEventListener("hf-seek", (event) => {
  renderAt(event.detail.time);
});
```

### Canonical authoring pattern (VERIFIED — verbatim from `skills/three/SKILL.md`)

```html
<canvas id="three-layer"></canvas>
<script type="module">
  import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm";

  const canvas = document.getElementById("three-layer");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  // Match these to your composition's frame size.
  renderer.setSize(1920, 1080, false);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1920 / 1080, 0.1, 100);
  camera.position.set(0, 0, 6);

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 4),
    new THREE.MeshStandardMaterial({ color: 0x64d2ff, roughness: 0.38 }),
  );
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));

  function renderAt(time) {
    mesh.rotation.y = time * 0.7;
    mesh.rotation.x = Math.sin(time * 0.6) * 0.16;
    renderer.render(scene, camera);
  }

  window.addEventListener("hf-seek", (event) => {
    renderAt(event.detail.time);
  });

  renderAt(window.__hfThreeTime || 0);
</script>
```

```css
#three-layer {
  width: 100%;
  height: 100%;
  display: block;
}
```

### Initial frame (VERIFIED)

The last line of the setup script handles the initial render before any seek event fires:

```javascript
renderAt(window.__hfThreeTime || 0);
```

This is **required**. Without it, the canvas is blank until the first `hf-seek` event. The adapter sets `window.__hfThreeTime` before dispatching the event, but the initial synchronous call uses the pre-set value (or falls back to `0`).

### AnimationMixer pattern (VERIFIED — verbatim from SKILL.md)

For GLTF or authored clip animation, seek the mixer directly:

```javascript
function renderAt(time) {
  mixer.setTime(time);
  renderer.render(scene, camera);
}
```

If several mixers exist, seek all of them from the same `time`. The SKILL.md uses `mixer.setTime(time)` — **not** `mixer.update(delta)`. Do not accumulate deltas.

### Must be created paused?

Three.js does not have a concept of "paused" — it renders on demand. The key rule is: **do NOT use `requestAnimationFrame` or `renderer.setAnimationLoop()`**. The scene must render only when the `hf-seek` event fires:

```javascript
// WRONG — self-driven loop breaks determinism:
renderer.setAnimationLoop(() => renderer.render(scene, camera));

// CORRECT — event-driven render:
window.addEventListener("hf-seek", (e) => {
  renderAt(e.detail.time);
});
```

### CDN URL (VERIFIED — pinned from SKILL.md)

```html
<!-- ES module import (recommended — from SKILL.md verbatim): -->
<script type="module">
  import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm";
</script>
```

- **Version:** `three@0.181.2`
- **Format:** ESM via jsDelivr `+esm` suffix — exposes the `THREE` namespace via `import * as THREE`
- **Global name (IIFE):** The SKILL.md uses ESM only; there is no IIFE CDN URL documented. If an IIFE build is needed (non-module context), use `https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.min.js` which exposes `window.THREE`, but **ESM is the documented pattern**.

### Time offset (placing animation at a scene's start offset)

The adapter dispatches `hf-seek` with the **global composition time** (same as all other adapters). The SKILL.md does not document a built-in offset mechanism — subtract `data-start` manually:

```javascript
const SCENE_START = 1.86; // seconds — matches data-start on the parent element

window.addEventListener("hf-seek", (event) => {
  const localT = Math.max(0, event.detail.time - SCENE_START);
  renderAt(localT);
});
```

### Determinism constraints (VERIFIED — from SKILL.md "Avoid" section and "Contract")

From the SKILL.md contract (verbatim):

> - Create the scene, camera, renderer, materials, and assets synchronously when possible.
> - Render from HyperFrames time, not wall-clock time.
> - Listen for the `hf-seek` event and render exactly that time.
> - Load models, textures, and HDRIs before render-critical seeking. Do not fetch them at seek time.
> - Avoid `requestAnimationFrame` or `renderer.setAnimationLoop` as the source of truth for render-critical motion.

From the SKILL.md "Avoid" section (verbatim):

> - Using `Date.now()`, `performance.now()`, or clock deltas to update scene state.
> - Leaving render-critical work inside a free-running animation loop.
> - Loading remote models or textures at render time.
> - Device-pixel-ratio dependent output. Pin renderer size and pixel ratio for video renders.
> - Post-processing passes that depend on previous frame history unless you can reconstruct state from time.

**Renderer settings** (pinned, required for determinism):

```javascript
renderer.setSize(1920, 1080, false);  // match composition frame size; false = no CSS resize
renderer.setPixelRatio(1);            // must be 1 — device-dependent ratios break determinism
```

No `preserveDrawingBuffer` is mentioned in the SKILL.md or adapter source — this is not required by the HyperFrames contract (HyperFrames captures frames via `HeadlessExperimental.beginFrame`, not via canvas `toDataURL`).

---

## Cross-Engine Summary Table

| Engine | Registration | Seek call | Unit | Paused requirement | Time offset |
|--------|-------------|-----------|------|--------------------|-------------|
| **GSAP** | `window.__timelines["<id>"] = tl` | `tl.totalTime(t)` | seconds | `{ paused: true }` in constructor | Position parameter (3rd arg) on each tween |
| **Anime.js** | `window.__hfAnime.push(instance)` — Array | `instance.seek(t_ms)` where `t_ms = global_s * 1000` | **milliseconds** | `autoplay: false` | `delay: scene_start_ms` in anime options, or `.add({}, offset)` in timeline |
| **WAAPI** | None — `document.getAnimations()` auto-discovery | `anim.currentTime = t_ms` then `anim.pause()` | **milliseconds** | `.pause()` immediately after `.animate()` (adapter also pauses on every seek) | `delay: scene_start_ms` in animate options; adapter passes raw global time |
| **Three.js** | `hf-seek` on `window` — `event.detail.time` (seconds, single field) | `renderer.render(scene, camera)` inside handler; `mixer.setTime(t)` for AnimationMixer | **seconds** | No RAF / no `setAnimationLoop`; `renderAt(window.__hfThreeTime \|\| 0)` for initial frame | Subtract `SCENE_START` from `event.detail.time` manually |

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

All items 1–10 are now **fully resolved** from the authoritative GitHub skill files and adapter source code.

### Resolved — all engines — no further action needed

| # | Engine | Item | Resolution |
|---|--------|------|------------|
| 1 | Anime.js | Exact shape of `window.__hfAnime` — Array vs. keyed object | **RESOLVED: Array** — `push()` pattern; adapter iterates as array |
| 2 | Anime.js | Whether HyperFrames offsets `seek()` by `data-start` | **RESOLVED: No** — adapter passes raw global time; author uses `delay:` option |
| 3 | Anime.js | Confirmed CDN version (v3 vs v4) | **RESOLVED: v4 is required** — `animejs@4.0.2/lib/anime.iife.min.js` |
| 4 | WAAPI | Whether `delay` creates correct offset | **RESOLVED: Yes** — adapter sets raw global `currentTime`; WAAPI `delay` shifts the animation's effective start |
| 5 | WAAPI | Whether polyfill needed in headless Chrome | **RESOLVED: No** — SKILL.md contains no polyfill; native WAAPI is assumed |
| 6 | WAAPI | Whether ALL `document.getAnimations()` are sought or only paused | **RESOLVED: ALL** — adapter seeks every animation returned, then pauses each |
| 7 | Three.js | Exact `hf-seek` event payload shape (`event.detail.time`, `event.detail.frame`, other fields?) | **RESOLVED: `{ time: number }` only** — one field, seconds, no `frame` field. Source: `seek-dispatch.ts` sha 6261cc5a |
| 8 | Three.js | Whether `hf-seek` carries global or sub-composition-local time | **RESOLVED: global time** — adapter passes `ctx.time` (global seconds) directly. Author subtracts `SCENE_START` manually |
| 9 | Three.js | Pinned Three.js version tested with 0.6.6 | **RESOLVED: `three@0.181.2`** — ESM via `https://cdn.jsdelivr.net/npm/three@0.181.2/+esm`. Source: `skills/three/SKILL.md` |
| 10 | Three.js | `AnimationMixer` pattern — `mixer.setTime(t)` vs `mixer.update(delta)` | **RESOLVED: `mixer.setTime(time)`** — called directly with global/local seconds. No delta accumulation. Source: `skills/three/SKILL.md` |
