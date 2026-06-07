# Multi-Engine Adapters — Phase 2 (WAAPI + Anime.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add working WAAPI and Anime.js engine adapters so a HyperFrames scene can mix those engines with GSAP, proven by unit tests and an end-to-end render smoke.

**Architecture:** Builds on Phase 1's engine-generic `buildFilmSkeleton`. Each adapter is thin and **API-agnostic**: it injects the right CDN (or none), emits the layer DOM (shared stacking helper), and wraps the layer's JS in an IIFE that exposes the scene's start offset (`__sceneStartMs`) and, for Anime, initializes `window.__hfAnime`. The actual engine API calls live in the layer `code` (hand-written in the smoke; LLM-written later in Phase 4). Because Phase 1's skeleton already dispatches to any registered adapter and injects `collectExtraCdn`, **no `buildFilmSkeleton` changes are needed** — registering the adapters is what activates them.

**Tech Stack:** TypeScript, Vitest. Anime.js v4 (IIFE CDN `animejs@4.0.2`). WAAPI is native (no CDN). HyperFrames 0.6.6 frame-adapters seek `window.__hfAnime` (`.seek(ms)`) and `document.getAnimations()` (`.currentTime = ms`) each frame.

**Verified contract:** `docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md` (Anime.js + WAAPI sections confirmed from HeyGen `skills/*/SKILL.md` + adapter source).

---

## Contract summary (drives every task)

**Anime.js (v4):**
- CDN: `<script src="https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js"></script>`
- Global `anime`; `anime({...})` and `anime.timeline({...})`.
- Create with `autoplay: false`; register via `window.__hfAnime.push(anim)`.
- Scene offset: add to `delay` (ms). HyperFrames seeks with **global** time, so author `delay: __sceneStartMs + localDelayMs`.

**WAAPI (native):**
- No CDN, no registration — `document.getAnimations()` auto-discovers.
- `el.animate(keyframes, { duration, delay: __sceneStartMs + localDelayMs, fill: "both", iterations: 1 })` then `animation.pause()`.
- `fill: "both"` is **mandatory** (state must persist outside the active range).

**Offset model:** the adapter exposes `var __sceneStartMs = <round(ctx.start*1000)>;` in the layer's IIFE. Layer code adds it to `delay`. No `__mgSceneClock` needed.

## File Structure

**Create:**
- `app/lib/hyperframes/engines/dom.ts` — `stackLayerDom(html, index, total)` shared by all adapters.
- `app/lib/hyperframes/engines/dom.test.ts`
- `app/lib/hyperframes/engines/waapi.ts` + `waapi.test.ts`
- `app/lib/hyperframes/engines/anime.ts` + `anime.test.ts`
- `scripts/smoke-multi-engine.ts` — end-to-end render smoke.

**Modify:**
- `app/lib/hyperframes/engines/gsap.ts` — use `stackLayerDom` in `emitDom` (behavior identical).
- `app/lib/hyperframes/engines/registry.ts` — register `anime` + `waapi`.
- `app/lib/hyperframes/engines/registry.test.ts` — extend.
- `app/lib/hyperframes/buildFilmSkeleton.test.ts` — add a mixed-engine integration test (no source change to buildFilmSkeleton).

---

### Task 1: Shared layer-DOM stacking helper (+ adopt in GSAP)

The wrap logic ("unwrapped when only layer, else positioned div") is currently inline in `gsap.ts`. Extract it so all adapters share one implementation.

**Files:** Create `app/lib/hyperframes/engines/dom.ts`, `app/lib/hyperframes/engines/dom.test.ts`. Modify `app/lib/hyperframes/engines/gsap.ts`.

- [ ] **Step 1: Write the failing test** at `app/lib/hyperframes/engines/dom.test.ts`:

```ts
import { expect, test } from "vitest";
import { stackLayerDom } from "./dom";

test("returns html unwrapped when it is the only layer", () => {
  expect(stackLayerDom(`<h1>X</h1>`, 0, 1)).toBe(`<h1>X</h1>`);
});

test("wraps in a positioned layer div with z-index when stacked", () => {
  const out = stackLayerDom(`<h1>X</h1>`, 2, 3);
  expect(out).toBe(
    `<div class="layer" style="position:absolute;inset:0;z-index:2"><h1>X</h1></div>`,
  );
});

test("empty html stays empty when unstacked", () => {
  expect(stackLayerDom("", 0, 1)).toBe("");
});
```

- [ ] **Step 2: Run, confirm FAIL:** `npx vitest run app/lib/hyperframes/engines/dom.test.ts` (Cannot find module './dom').

- [ ] **Step 3: Implement** `app/lib/hyperframes/engines/dom.ts`:

```ts
// app/lib/hyperframes/engines/dom.ts
// Shared layer-DOM stacking. A single layer renders unwrapped (byte-identical
// to the pre-layer skeleton); stacked layers get an absolutely-positioned
// wrapper so z-order is explicit. Used by every engine adapter's emitDom.

export function stackLayerDom(html: string, index: number, total: number): string {
  if (total <= 1) return html;
  return `<div class="layer" style="position:absolute;inset:0;z-index:${index}">${html}</div>`;
}
```

- [ ] **Step 4: Run, confirm PASS (3 tests).**

- [ ] **Step 5: Adopt in GSAP.** In `app/lib/hyperframes/engines/gsap.ts`, add the import at the top:

```ts
import { stackLayerDom } from "./dom";
```

Replace the `emitDom` body so it delegates to the helper:

```ts
  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },
```

- [ ] **Step 6: Confirm GSAP tests still pass (output identical):** `npx vitest run app/lib/hyperframes/engines/gsap.test.ts` (5 pass) and `npx tsc --noEmit`.

- [ ] **Step 7: Commit:**

```bash
git add app/lib/hyperframes/engines/dom.ts app/lib/hyperframes/engines/dom.test.ts app/lib/hyperframes/engines/gsap.ts
git commit -m "refactor(hyperframes): shared stackLayerDom helper; adopt in GSAP adapter"
```

---

### Task 2: WAAPI adapter

Native engine — no CDN, no registration global. The adapter exposes `__sceneStartMs`; the layer code calls `el.animate(...)` with `delay: __sceneStartMs + local`, `fill:"both"`, then `pause()`.

**Files:** Create `app/lib/hyperframes/engines/waapi.ts`, `app/lib/hyperframes/engines/waapi.test.ts`.

- [ ] **Step 1: Write the failing test** at `app/lib/hyperframes/engines/waapi.test.ts`:

```ts
import { expect, test } from "vitest";
import { waapiAdapter } from "./waapi";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "fx",
  engine: "waapi",
  html: `<div id="box"></div>`,
  code: `var a = document.getElementById("box").animate([{opacity:0},{opacity:1}], { duration:500, delay: __sceneStartMs + 0, fill:"both", iterations:1 }); a.pause();`,
};
const ctx: LayerEmitContext = { sceneId: "s2", start: 3, duration: 4, index: 0, total: 1 };

test("waapi adapter has no CDN (native)", () => {
  expect(waapiAdapter.cdn).toBeNull();
});

test("emitDom returns html unwrapped when only layer", () => {
  expect(waapiAdapter.emitDom(layer, ctx)).toBe(`<div id="box"></div>`);
});

test("emitDom wraps when stacked", () => {
  expect(waapiAdapter.emitDom(layer, { ...ctx, index: 1, total: 2 })).toContain(`z-index:1`);
});

test("emitJs exposes __sceneStartMs (start*1000) and includes the layer code", () => {
  const js = waapiAdapter.emitJs(layer, ctx);
  expect(js).toContain(`var __sceneStartMs = 3000;`);
  expect(js).toContain(`.animate([{opacity:0},{opacity:1}]`);
  expect(js).toContain(`a.pause();`);
});

test("emitJs returns empty string for empty code", () => {
  expect(waapiAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
```

- [ ] **Step 2: Run, confirm FAIL** (Cannot find module './waapi').

- [ ] **Step 3: Implement** `app/lib/hyperframes/engines/waapi.ts`:

```ts
// app/lib/hyperframes/engines/waapi.ts
// Web Animations API adapter. Native — no CDN, no registration global:
// HyperFrames auto-discovers animations via document.getAnimations() and seeks
// each one's currentTime per frame. Layer code must create animations with
// fill:"both" + iterations:1 and pause() them; scene offset is added to delay
// via the exposed __sceneStartMs (ms).

import { stackLayerDom } from "./dom";
import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

export const waapiAdapter: EngineAdapter = {
  engine: "waapi",
  cdn: null,

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    const startMs = Math.round(ctx.start * 1000);
    return [
      `  (function () {`,
      `    // WAAPI layer "${layer.id}" (scene ${ctx.sceneId}). Author el.animate(keyframes,`,
      `    // { delay: __sceneStartMs + localDelayMs, fill: "both", iterations: 1 }) then pause().`,
      `    var __sceneStartMs = ${startMs};`,
      indentLines(body, "    "),
      `  })();`,
    ].join("\n");
  },
};
```

- [ ] **Step 4: Run, confirm PASS (5 tests).** Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit:**

```bash
git add app/lib/hyperframes/engines/waapi.ts app/lib/hyperframes/engines/waapi.test.ts
git commit -m "feat(hyperframes): WAAPI engine adapter"
```

---

### Task 3: Anime.js adapter

CDN-backed (anime v4 IIFE). The adapter injects the CDN, exposes `__sceneStartMs`, and initializes `window.__hfAnime`. Layer code creates `anime({..., autoplay:false, delay: __sceneStartMs + local})` and pushes to `window.__hfAnime`.

**Files:** Create `app/lib/hyperframes/engines/anime.ts`, `app/lib/hyperframes/engines/anime.test.ts`.

- [ ] **Step 1: Write the failing test** at `app/lib/hyperframes/engines/anime.test.ts`:

```ts
import { expect, test } from "vitest";
import { animeAdapter } from "./anime";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "title",
  engine: "anime",
  html: `<h1 class="mark">Hi</h1>`,
  code: `var anim = anime({ targets: ".mark", opacity: [0,1], duration: 600, delay: __sceneStartMs + 0, autoplay: false }); window.__hfAnime.push(anim);`,
};
const ctx: LayerEmitContext = { sceneId: "s2", start: 3, duration: 4, index: 0, total: 1 };

test("anime adapter declares the v4 IIFE CDN", () => {
  expect(animeAdapter.cdn).toBe(
    "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js",
  );
});

test("emitDom returns html unwrapped when only layer", () => {
  expect(animeAdapter.emitDom(layer, ctx)).toBe(`<h1 class="mark">Hi</h1>`);
});

test("emitDom wraps when stacked", () => {
  expect(animeAdapter.emitDom(layer, { ...ctx, index: 1, total: 2 })).toContain(`z-index:1`);
});

test("emitJs exposes __sceneStartMs, inits __hfAnime, and includes the layer code", () => {
  const js = animeAdapter.emitJs(layer, ctx);
  expect(js).toContain(`var __sceneStartMs = 3000;`);
  expect(js).toContain(`window.__hfAnime = window.__hfAnime || [];`);
  expect(js).toContain(`anime({ targets: ".mark"`);
  expect(js).toContain(`window.__hfAnime.push(anim);`);
});

test("emitJs returns empty string for empty code", () => {
  expect(animeAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
```

- [ ] **Step 2: Run, confirm FAIL** (Cannot find module './anime').

- [ ] **Step 3: Implement** `app/lib/hyperframes/engines/anime.ts`:

```ts
// app/lib/hyperframes/engines/anime.ts
// Anime.js v4 adapter. HyperFrames seeks every instance pushed to
// window.__hfAnime (instance.seek(ms)) each frame. Layer code must create
// instances with autoplay:false and push them to window.__hfAnime; scene
// offset is added to `delay` via the exposed __sceneStartMs (ms). The IIFE
// build exposes the global `anime` (anime({...}) / anime.timeline({...})).

import { stackLayerDom } from "./dom";
import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

export const animeAdapter: EngineAdapter = {
  engine: "anime",
  cdn: "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js",

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    const startMs = Math.round(ctx.start * 1000);
    return [
      `  (function () {`,
      `    // Anime.js layer "${layer.id}" (scene ${ctx.sceneId}). Author anime({ ...,`,
      `    // autoplay: false, delay: __sceneStartMs + localDelayMs }) then window.__hfAnime.push(anim).`,
      `    var __sceneStartMs = ${startMs};`,
      `    window.__hfAnime = window.__hfAnime || [];`,
      indentLines(body, "    "),
      `  })();`,
    ].join("\n");
  },
};
```

- [ ] **Step 4: Run, confirm PASS (5 tests).** Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit:**

```bash
git add app/lib/hyperframes/engines/anime.ts app/lib/hyperframes/engines/anime.test.ts
git commit -m "feat(hyperframes): Anime.js v4 engine adapter"
```

---

### Task 4: Register WAAPI + Anime in the registry

**Files:** Modify `app/lib/hyperframes/engines/registry.ts` + `registry.test.ts`.

- [ ] **Step 1: Update the test** `app/lib/hyperframes/engines/registry.test.ts` — replace the two engine-specific tests and add a CDN test. The file should read:

```ts
import { expect, test } from "vitest";
import { getEngineAdapter, collectExtraCdn } from "./registry";
import type { Layer } from "./types";

test("getEngineAdapter returns the registered adapters", () => {
  expect(getEngineAdapter("gsap")!.engine).toBe("gsap");
  expect(getEngineAdapter("waapi")!.engine).toBe("waapi");
  expect(getEngineAdapter("anime")!.engine).toBe("anime");
});

test("getEngineAdapter returns null for an unregistered engine", () => {
  // three is not registered until Phase 3.
  expect(getEngineAdapter("three")).toBeNull();
});

test("collectExtraCdn returns no extra scripts for gsap/waapi only (both have no extra CDN)", () => {
  const layers: Layer[] = [
    { id: "a", engine: "gsap", code: "" },
    { id: "b", engine: "waapi", code: "" },
  ];
  expect(collectExtraCdn(layers)).toEqual([]);
});

test("collectExtraCdn includes the anime CDN once when anime is used", () => {
  const layers: Layer[] = [
    { id: "a", engine: "anime", code: "" },
    { id: "b", engine: "anime", code: "" },
    { id: "c", engine: "gsap", code: "" },
  ];
  expect(collectExtraCdn(layers)).toEqual([
    "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js",
  ]);
});

test("collectExtraCdn ignores engines with no registered adapter", () => {
  const layers: Layer[] = [{ id: "a", engine: "three", code: "" }];
  expect(collectExtraCdn(layers)).toEqual([]);
});
```

- [ ] **Step 2: Run, confirm FAIL** (anime/waapi not registered yet).

- [ ] **Step 3: Update** `app/lib/hyperframes/engines/registry.ts` — add the imports and registrations:

```ts
import { gsapAdapter } from "./gsap";
import { animeAdapter } from "./anime";
import { waapiAdapter } from "./waapi";
import type { EngineAdapter, Layer, LayerEngine } from "./types";

const ADAPTERS: Partial<Record<LayerEngine, EngineAdapter>> = {
  gsap: gsapAdapter,
  anime: animeAdapter,
  waapi: waapiAdapter,
};
```

(Leave `getEngineAdapter` and `collectExtraCdn` bodies unchanged.)

- [ ] **Step 4: Run, confirm PASS (5 tests).** Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit:**

```bash
git add app/lib/hyperframes/engines/registry.ts app/lib/hyperframes/engines/registry.test.ts
git commit -m "feat(hyperframes): register WAAPI + Anime adapters"
```

---

### Task 5: Mixed-engine integration test (proves the skeleton needs no change)

Add a test to the existing integration suite that a single scene with gsap + anime + waapi layers emits correctly through `buildFilmSkeleton`. No source change to `buildFilmSkeleton` is expected; if this test fails, STOP and report — do not edit `buildFilmSkeleton` without escalating.

**Files:** Modify `app/lib/hyperframes/buildFilmSkeleton.test.ts` (append one test).

- [ ] **Step 1: Append this test** to `app/lib/hyperframes/buildFilmSkeleton.test.ts` (reuse the existing `identity` and `storyboard` fixtures already in the file):

```ts
test("a mixed gsap+anime+waapi scene emits each engine correctly", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: "",
        sceneCss: "",
        timeline: "",
        transitionIn: "hard_cut",
        layers: [
          { id: "bg", engine: "waapi", html: `<div id="box"></div>`, code: `document.getElementById("box").animate([{opacity:0},{opacity:1}],{duration:500,delay:__sceneStartMs+0,fill:"both",iterations:1}).pause();` },
          { id: "mid", engine: "anime", html: `<h1 class="mark">Hi</h1>`, code: `var anim = anime({targets:".mark",opacity:[0,1],duration:600,delay:__sceneStartMs+0,autoplay:false}); window.__hfAnime.push(anim);` },
          { id: "fg", engine: "gsap", html: `<p id="cap">Cap</p>`, code: `tl.from("#cap", { y: 10 }, 0);` },
        ],
      },
      { id: "s2", copy: "Second", contentHtml: `<h1 id="b">Second</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);

  // Anime CDN injected exactly once; WAAPI has no CDN.
  expect(html).toContain(`https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js`);
  expect(html.match(/animejs@4\.0\.2/g)?.length).toBe(1);
  // Each engine's code present.
  expect(html).toContain(`window.__hfAnime.push(anim);`);
  expect(html).toContain(`.animate([{opacity:0},{opacity:1}]`);
  expect(html).toContain(`tl.from("#cap", { y: 10 }, 0);`);
  // Scene offset exposed for the code-driven engines (s1 starts at 0ms).
  expect(html).toContain(`var __sceneStartMs = 0;`);
  // All three layers stacked (total=3) so each is wrapped.
  expect(html).toContain(`<div id="box"></div>`);
  expect(html).toContain(`<h1 class="mark">Hi</h1>`);
});
```

- [ ] **Step 2: Run the full hyperframes suite:** `npx vitest run app/lib/hyperframes` — ALL must pass. Then `npx tsc --noEmit`.

> If the new test fails, the Phase 1 skeleton is not as engine-generic as assumed. STOP and report NEEDS_CONTEXT with the failure — do not modify `buildFilmSkeleton`.

- [ ] **Step 3: Commit:**

```bash
git add app/lib/hyperframes/buildFilmSkeleton.test.ts
git commit -m "test(hyperframes): mixed gsap+anime+waapi composition emits correctly"
```

---

### Task 6: End-to-end render smoke script

A real render is the only proof that HyperFrames actually seeks the mixed engines. This script builds a tiny mixed composition, renders it via the existing `renderScene` path, and checks the MP4 exists and that two sampled frames differ (motion present). It needs network + a headless browser, so it may not run inside a restricted sandbox — in that case, commit the script and document that the user runs it locally.

**Files:** Create `scripts/smoke-multi-engine.ts`.

- [ ] **Step 1: Inspect an existing script** to copy the project's run/import conventions: read `scripts/smoke-hyperframes-pipeline.ts` and `scripts/render-composition-frames.ts`. Match how they import from `app/lib/hyperframes/*`, load env, and how they're invoked (note the exact command, e.g. `npx tsx scripts/<name>.ts` or a node loader — use whatever those files use).

- [ ] **Step 2: Write** `scripts/smoke-multi-engine.ts` that:
  1. Builds a minimal storyboard (1–2 scenes) + `FilmFills` with three layers in one scene: a WAAPI layer, an Anime layer, and a GSAP layer (use the verbatim patterns from `docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md`, with `delay: __sceneStartMs + <local>` for anime/waapi).
  2. Calls `buildFilmSkeleton(storyboard, identity, fills)` to get the composition HTML.
  3. Writes it to a temp dir and renders via `renderScene` (from `app/lib/hyperframes/render.ts`) with an HTML-only `SceneFiles` (`css: ""`, `js: ""`), OR replicate the minimal spawn of `npx --yes hyperframes@0.6.6 render` against the temp dir if `renderScene`'s storage upload is undesirable for a smoke. Prefer the lowest-dependency path that still produces an MP4 locally.
  4. Asserts the MP4 file exists and is non-trivial in size, and (best-effort) extracts two frames at different timestamps (e.g. via the existing frame-extraction approach in `render-composition-frames.ts` if present) and asserts they are not byte-identical.
  5. Logs a clear PASS/FAIL summary and exits non-zero on failure.

  Keep the script self-contained and dependency-light. Do not add new npm dependencies; reuse what `render.ts` / the other scripts already use.

- [ ] **Step 3: Attempt to run it** with the project's runner (from Step 1). 
  - If it runs and PASSES: paste the output.
  - If the environment blocks `npx hyperframes` (no network / no Chromium): that's expected in a sandbox. Confirm the script at least type-checks (`npx tsc --noEmit`) and document in the script header and your report that it must be run locally, with the exact command and expected PASS output.

- [ ] **Step 4: Commit:**

```bash
git add scripts/smoke-multi-engine.ts
git commit -m "test(hyperframes): end-to-end render smoke for mixed engines"
```

---

## Final verification

- [ ] `npx vitest run` — full suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Render smoke: PASS locally (or documented as a local step if the sandbox can't render).

## What Phase 2 delivers (and what it doesn't)

Delivers: WAAPI + Anime adapters that work in a mixed composition, unit-proven and (smoke) render-proven. A developer can now hand-author anime/waapi layers and they render.

Does NOT yet: make the **LLM** emit anime/waapi layers — that's Phase 4 (blueprint `engines` recommendation + scene-fill `layers[]` schema + per-engine authoring rules in the prompts). Until Phase 4, the normal generate pipeline still produces GSAP-only films. Phase 3 (Three.js) is also still pending.
