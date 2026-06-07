# Multi-Engine Phases 3+4 — Three.js Adapter + LLM Emission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Phase 3 — a working Three.js adapter (proven by the render smoke). Phase 4 — the generate pipeline actually USES the engines: the blueprint recommends a background engine per scene (with a Three budget cap), scene-fill emits optional `backgroundLayers`, invalid layers are statically validated and dropped (film never fails), and the prompts teach the verified per-engine authoring patterns.

**Architecture:** Background layers are **additive**: the LLM keeps emitting `contentHtml`/`sceneCss`/`timeline` (the GSAP base scene — fully backward compatible with critique/refine/editor), plus an optional `backgroundLayers` array (≤1 entry, engines `three|anime|waapi`) stacked BEHIND the base. `resolveLayers` composes `[...backgroundLayers, base]`. A static validator (`engines/validate.ts`) drops malformed layers pre-skeleton. The Three budget is enforced twice: blueprint normalization caps `backgroundEngine:"three"` recommendations (MAX_THREE_SCENES=2), and scene-fill post-parse drops unbudgeted three layers.

**Three.js contract (VERIFIED — `docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md`, commit 18ccc2d):**
- Three loads as an **ESM module**: `import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm"` inside `<script type="module">`. NO IIFE CDN — so the adapter has `cdn: null` and the new `jsKind: "module"`; the skeleton emits module layers as separate `<script type="module">` blocks (a module can't nest in the classic inline script).
- Seek: `window.addEventListener("hf-seek", (e) => renderAt(e.detail.time))` — `e.detail` = `{ time }` in **SECONDS**. Initial frame: `renderAt(window.__hfThreeTime || 0)` synchronously after setup (mandatory, else blank first frame).
- Determinism: `renderer.setSize(1920, 1080, false)` + `setPixelRatio(1)`; no rAF/`setAnimationLoop`; render is a pure function of seek time; `mixer.setTime(t)` not `update(delta)`.
- Therefore the three wrapper exposes `__sceneStartS` (**seconds**), while anime/waapi keep `__sceneStartMs` (their seek units are ms).

**Tech Stack:** TypeScript, Vitest, Anthropic structured outputs (json_schema).

---

## File Structure

**Create:**
- `app/lib/hyperframes/engines/three.ts` + `three.test.ts` — Three.js adapter.
- `app/lib/hyperframes/engines/validate.ts` + `validate.test.ts` — static layer validation.

**Modify:**
- `app/lib/hyperframes/engines/types.ts` — `jsKind` on `EngineAdapter`.
- `app/lib/hyperframes/llm-director.ts` — `buildFilmSkeleton` module-script emission; `SceneFill`/`SCENE_FILL_SCHEMA`/`generateSceneFill`; `SceneBrief`/`FILM_BLUEPRINT_SCHEMA`/blueprint prompt+normalization; `FILM_SYSTEM_PROMPT`; `buildSceneFillUserPrompt`.
- `app/lib/hyperframes/engines/registry.ts` + `registry.test.ts` — register three.
- `app/lib/hyperframes/engines/layers.ts` + `layers.test.ts` — `backgroundLayers` composition.
- `app/lib/hyperframes/buildFilmSkeleton.test.ts` — module-script + backgroundLayers integration tests.
- `scripts/smoke-multi-engine.ts` — add a three layer.

## Task ordering

Tasks are numbered in execution order — do them top to bottom, 1 → 9. (Notably, Task 6 adds `SceneBrief.backgroundEngine`, which Task 7's guard reads — do not swap them.)

---

# Phase 3 — Three.js adapter

### Task 1: `jsKind` on EngineAdapter + module-script emission in the skeleton

Three's code is an ES module (top-level `import`), which cannot live inside the existing classic inline `<script>`. Add a `jsKind` discriminator to the adapter interface and teach `buildFilmSkeleton` to emit module-kind layer JS as separate `<script type="module">` blocks after the main inline script.

**Files:** Modify `app/lib/hyperframes/engines/types.ts`, `app/lib/hyperframes/llm-director.ts` (`buildFilmSkeleton`), `app/lib/hyperframes/buildFilmSkeleton.test.ts`.

- [ ] **Step 1:** In `engines/types.ts`, add to the `EngineAdapter` type (after `cdn`):

```ts
  /**
   * How this engine's emitJs output is embedded:
   *   "inline" (default) — concatenated into the composition's single classic
   *   inline <script> alongside the GSAP master timeline.
   *   "module" — emitted as its own <script type="module"> after the inline
   *   script (required for engines whose code uses top-level ESM imports,
   *   e.g. Three via jsDelivr +esm).
   */
  jsKind?: "inline" | "module";
```

- [ ] **Step 2:** In `buildFilmSkeleton` (`llm-director.ts`), update the `sceneTimelineBlocks` builder: where it currently pushes every layer's `adapter.emitJs(...)` into `blocks`, ONLY push when `(adapter.jsKind ?? "inline") === "inline"`. Then add, right after the `sceneTimelineBlocks` definition, a module-block collector (same loop shape):

```ts
  // Module-kind layer scripts (e.g. Three via ESM import). Each becomes its
  // own <script type="module"> after the main inline script — a module can't
  // nest inside a classic script, and module scope keeps layers isolated.
  const moduleScriptBlocks: string[] = [];
  storyboard.scenes.forEach((scene, i) => {
    const sid = `s${i + 1}`;
    const fill = fillById.get(sid) ?? fillById.get(scene.id);
    const start = starts[i];
    const layers = resolveLayers({
      layers: fill?.layers,
      backgroundLayers: fill?.backgroundLayers,
      contentHtml: fill?.contentHtml ?? "",
      sceneCss: fill?.sceneCss ?? "",
      timeline: fill?.timeline ?? "",
    });
    const emittable = layers.filter((l) => getEngineAdapter(l.engine) !== null);
    emittable.forEach((layer, index) => {
      const adapter = getEngineAdapter(layer.engine)!;
      if ((adapter.jsKind ?? "inline") !== "module") return;
      const js = adapter.emitJs(layer, {
        sceneId: sid,
        start,
        duration: scene.durationSeconds,
        index,
        total: emittable.length,
      });
      if (js.trim()) moduleScriptBlocks.push(`<script type="module">\n${js}\n</script>`);
    });
  });
  const moduleScriptsHtml = moduleScriptBlocks.length > 0 ? `\n${moduleScriptBlocks.join("\n")}` : "";
```

NOTE: `backgroundLayers: fill?.backgroundLayers` will not compile until Task 4 adds the field — for THIS task, omit that line here AND in the existing three resolveLayers call sites; Task 4 adds it everywhere. Keep this task's collector consistent with the existing call sites.

Then in the returned template, append `${moduleScriptsHtml}` immediately after the closing `</script>` of the main inline script (before `</body>`).

- [ ] **Step 3:** Append a regression test to `buildFilmSkeleton.test.ts` (using a fake module-kind situation is not possible until the three adapter exists — so for THIS task just assert no `<script type="module">` appears for the existing all-inline fixtures):

```ts
test("no module scripts are emitted when every layer engine is inline", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      { id: "s1", contentHtml: `<h1 id="a">A</h1>`, sceneCss: "", timeline: `tl.from("#a", {}, 0);`, transitionIn: "hard_cut" },
      { id: "s2", contentHtml: `<h1 id="b">B</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  expect(html).not.toContain(`<script type="module">`);
});
```

- [ ] **Step 4:** `npx vitest run app/lib/hyperframes` (all green) + `npx tsc --noEmit`.

- [ ] **Step 5: Commit:** `feat(hyperframes): module-script emission for ESM engine layers`

### Task 2: Three.js adapter + registration

API-agnostic like anime/waapi, but `jsKind: "module"`, `cdn: null` (the ESM import lives in the layer code), and the wrapper exposes `__sceneStartS` (SECONDS — `hf-seek` time is seconds).

**Files:** Create `app/lib/hyperframes/engines/three.ts`, `three.test.ts`. Modify `registry.ts`, `registry.test.ts`.

- [ ] **Step 1: Failing test** `three.test.ts`:

```ts
import { expect, test } from "vitest";
import { threeAdapter } from "./three";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "bg3d",
  engine: "three",
  html: `<canvas id="c3d"></canvas>`,
  code: `import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm";
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c3d"), alpha: true });
function renderAt(t) { renderer.render(scene, camera); }
window.addEventListener("hf-seek", (e) => renderAt(e.detail.time - __sceneStartS));
renderAt((window.__hfThreeTime || 0) - __sceneStartS);`,
};
const ctx: LayerEmitContext = { sceneId: "s1", start: 3, duration: 4, index: 0, total: 2 };

test("three adapter is module-kind with no CDN tag (ESM import lives in layer code)", () => {
  expect(threeAdapter.cdn).toBeNull();
  expect(threeAdapter.jsKind).toBe("module");
});

test("emitDom stacks like the other adapters", () => {
  expect(threeAdapter.emitDom(layer, ctx)).toContain(`z-index:0`);
  expect(threeAdapter.emitDom(layer, { ...ctx, total: 1 })).toBe(`<canvas id="c3d"></canvas>`);
});

test("emitJs exposes __sceneStartS in SECONDS and includes the layer code", () => {
  const js = threeAdapter.emitJs(layer, ctx);
  expect(js).toContain(`const __sceneStartS = 3;`);
  expect(js).toContain(`hf-seek`);
  expect(js).toContain(`window.__hfThreeTime || 0`);
  // No IIFE wrapper — module scope isolates; top-level import must stay top-level.
  expect(js).not.toContain(`(function () {`);
});

test("emitJs returns empty string for empty code", () => {
  expect(threeAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `app/lib/hyperframes/engines/three.ts`:

```ts
// app/lib/hyperframes/engines/three.ts
// Three.js adapter (verified contract, HyperFrames 0.6.6):
//   • Layer code is an ES MODULE — it imports three via
//     "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm" itself, so cdn: null
//     and jsKind: "module" (the skeleton emits a separate <script type="module">).
//   • Seek: window "hf-seek" CustomEvent, e.detail = { time } in SECONDS.
//   • Initial frame: renderAt(window.__hfThreeTime || 0) right after setup —
//     mandatory, otherwise the canvas is blank until the first seek.
//   • Determinism: renderer.setSize(1920,1080,false) + setPixelRatio(1);
//     no rAF / setAnimationLoop; render is a pure function of seek time.
// The wrapper exposes __sceneStartS (SECONDS — unlike anime/waapi's ms) so
// layer code can convert global seek time to scene-local time.

import { stackLayerDom } from "./dom";
import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

export const threeAdapter: EngineAdapter = {
  engine: "three",
  cdn: null,
  jsKind: "module",

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    // No IIFE: this is a module (own scope), and top-level `import` statements
    // must remain at module top level. __sceneStartS is in SECONDS to match
    // the hf-seek event's e.detail.time unit.
    return [
      `// Three.js layer "${layer.id}" (scene ${ctx.sceneId}) — hf-seek drives renderAt;`,
      `// scene-local time = e.detail.time - __sceneStartS (seconds).`,
      `const __sceneStartS = ${ctx.start};`,
      body,
    ].join("\n");
  },
};
```

- [ ] **Step 4: Register.** In `registry.ts`: `import { threeAdapter } from "./three";` and add `three: threeAdapter` to `ADAPTERS`. In `registry.test.ts`:
  - extend the "registered adapters" test with `expect(getEngineAdapter("three")!.engine).toBe("three");`
  - the "returns null for an unregistered engine" test no longer has an unregistered member — REPLACE it with:
    ```ts
    test("three contributes no CDN tag (ESM import lives in layer code)", () => {
      const layers: Layer[] = [{ id: "a", engine: "three", code: "" }];
      expect(collectExtraCdn(layers)).toEqual([]);
    });
    ```
  - likewise REPLACE the "ignores engines with no registered adapter" test body with a `three`-based no-CDN assertion or delete it (it duplicates the above) — keep the suite meaningful, no dead tests.

- [ ] **Step 5:** `npx vitest run app/lib/hyperframes` + `npx tsc --noEmit` — green/clean.

- [ ] **Step 6: Commit:** `feat(hyperframes): Three.js engine adapter (ESM module, seconds-based seek)`

### Task 3: Extend the render smoke with a Three layer

**Files:** Modify `scripts/smoke-multi-engine.ts`, and `buildFilmSkeleton.test.ts` (one assertion).

- [ ] **Step 1:** Add a fourth layer (`engine: "three"`) to the smoke's mixed scene using the VERBATIM contract pattern: canvas html; code = ESM import of `three@0.181.2/+esm`, `WebGLRenderer({ canvas, alpha: true, antialias: true })`, `renderer.setSize(1920, 1080, false)`, `setPixelRatio(1)`, a `PerspectiveCamera`, one rotating colored mesh whose rotation is a pure function of scene-local time (`renderAt(t)` with `mesh.rotation.y = t * 0.7`), `window.addEventListener("hf-seek", (e) => renderAt(Math.max(0, e.detail.time - __sceneStartS)))`, and the mandatory initial `renderAt(Math.max(0, (window.__hfThreeTime || 0) - __sceneStartS));`.
- [ ] **Step 2:** Update `buildFilmSkeleton.test.ts`'s mixed-engine test (or add one assertion to it): when a `three` layer is present, the html contains `<script type="module">` and the layer code. (Add the three layer to the existing mixed-engine fixture's layers array and assert.)
- [ ] **Step 3:** Run the smoke: `npx tsx scripts/smoke-multi-engine.ts`. Expect `SMOKE PASS` with frame-diff. If the sandbox can't render, type-check + document per the Phase 2 convention. If the render fails ON the three layer specifically, iterate the layer code against the contract doc and report the final working pattern (Task 8's prompt must match it).
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit`.
- [ ] **Step 5: Commit:** `test(hyperframes): three layer in render smoke + mixed test`

---

# Phase 4 — the LLM emits engine layers

### Task 4: `backgroundLayers` composition in `resolveLayers` + `SceneFill` type + skeleton threading

**Files:** Modify `engines/layers.ts` + `layers.test.ts`; `llm-director.ts` (`SceneFill` type + the three `resolveLayers` call sites + the Task 1 module collector).

- [ ] **Step 1: Failing tests** — append to `layers.test.ts`:

```ts
test("composes backgroundLayers behind the legacy base layer", () => {
  const bg = [{ id: "bg3d", engine: "three" as const, html: "<canvas></canvas>", code: "/*…*/" }];
  const layers = resolveLayers({
    backgroundLayers: bg,
    contentHtml: `<h1>Hi</h1>`,
    sceneCss: "",
    timeline: `tl.to("#x", {}, 0);`,
  });
  expect(layers).toHaveLength(2);
  expect(layers[0]).toBe(bg[0]);                  // background first (backmost)
  expect(layers[1].id).toBe("base");              // gsap base on top
  expect(layers[1].engine).toBe("gsap");
});

test("explicit layers still supersede backgroundLayers", () => {
  const explicit = [{ id: "only", engine: "gsap" as const, html: "", code: "" }];
  const layers = resolveLayers({
    layers: explicit,
    backgroundLayers: [{ id: "bg", engine: "waapi" as const, code: "" }],
    contentHtml: "", sceneCss: "", timeline: "",
  });
  expect(layers).toBe(explicit);
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** in `layers.ts` — extend `ResolvableFill` with `backgroundLayers?: Layer[];` and:

```ts
export function resolveLayers(fill: ResolvableFill): Layer[] {
  if (fill.layers && fill.layers.length > 0) {
    return fill.layers;
  }
  const base: Layer = {
    id: "base",
    engine: "gsap",
    html: fill.contentHtml,
    css: fill.sceneCss,
    code: fill.timeline,
  };
  if (fill.backgroundLayers && fill.backgroundLayers.length > 0) {
    return [...fill.backgroundLayers, base];
  }
  return [base];
}
```

- [ ] **Step 4:** In `llm-director.ts`: add to `SceneFill` (after `layers?`):

```ts
  /**
   * Optional LLM-emitted engine layers stacked BEHIND the contentHtml base
   * (≤1 in practice; schema-capped). Unlike `layers` (full supersede, used by
   * hand-authored compositions), these are ADDITIVE: resolveLayers composes
   * [...backgroundLayers, gsapBase]. Statically validated; invalid entries
   * are dropped, never fatal.
   */
  backgroundLayers?: Layer[];
```

Then add `backgroundLayers: fill?.backgroundLayers,` to ALL `resolveLayers({...})` call sites in `buildFilmSkeleton` (the sectionsHtml builder, the sceneTimelineBlocks builder, the allLayers CDN collector, and Task 1's module collector — 4 sites total).

- [ ] **Step 5:** Full hyperframes suite + typecheck.

- [ ] **Step 6: Commit:** `feat(hyperframes): additive backgroundLayers in resolveLayers + SceneFill`

### Task 5: Static layer validation (`engines/validate.ts`)

**Files:** Create `app/lib/hyperframes/engines/validate.ts` + `validate.test.ts`.

- [ ] **Step 1: Failing tests** `validate.test.ts`:

```ts
import { expect, test } from "vitest";
import { validateLayer } from "./validate";
import type { Layer } from "./types";

const base = (over: Partial<Layer>): Layer => ({
  id: "l1", engine: "anime", html: "<div></div>", code: "", ...over,
});

test("flags nondeterminism in any engine layer", () => {
  for (const bad of ["Math.random()", "Date.now()", "requestAnimationFrame(loop)", "setInterval(f, 16)", "fetch('/x')"]) {
    const v = validateLayer(base({ engine: "waapi", code: `var a = 1; ${bad};` }));
    expect(v.length, bad).toBeGreaterThan(0);
  }
});

test("anime: requires __hfAnime.push and autoplay:false; forbids v3 anime({}) call", () => {
  expect(validateLayer(base({ code: `var tl = anime.createTimeline({ autoplay: false }); window.__hfAnime.push(tl);` }))).toEqual([]);
  expect(validateLayer(base({ code: `var tl = anime.createTimeline({ autoplay: false });` })).join()).toMatch(/__hfAnime/);
  expect(validateLayer(base({ code: `var tl = anime.createTimeline({}); window.__hfAnime.push(tl);` })).join()).toMatch(/autoplay/);
  expect(validateLayer(base({ code: `var a = anime({ targets: ".x" }); window.__hfAnime.push(a); /* autoplay: false */` })).join()).toMatch(/v3/);
});

test("waapi: requires fill both and pause()", () => {
  const good = `var a = el.animate([{opacity:0},{opacity:1}], { duration: 500, delay: __sceneStartMs, fill: "both", iterations: 1 }); a.pause();`;
  expect(validateLayer(base({ engine: "waapi", code: good }))).toEqual([]);
  expect(validateLayer(base({ engine: "waapi", code: good.replace(`fill: "both", `, "") })).join()).toMatch(/fill/);
  expect(validateLayer(base({ engine: "waapi", code: good.replace(" a.pause();", "") })).join()).toMatch(/pause/);
});

test("three: requires BOTH the hf-seek listener and the __hfThreeTime initial render", () => {
  const good = `window.addEventListener("hf-seek", (e) => renderAt(e.detail.time - __sceneStartS));
renderAt((window.__hfThreeTime || 0) - __sceneStartS);`;
  expect(validateLayer(base({ engine: "three", code: good }))).toEqual([]);
  expect(validateLayer(base({ engine: "three", code: `window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));` })).join()).toMatch(/__hfThreeTime/);
  expect(validateLayer(base({ engine: "three", code: `renderAt(window.__hfThreeTime || 0);` })).join()).toMatch(/hf-seek/);
});

test("gsap layers pass through with no engine-specific rules", () => {
  expect(validateLayer(base({ engine: "gsap", code: `tl.to("#x", {}, 0);` }))).toEqual([]);
});
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** `engines/validate.ts`:

```ts
// app/lib/hyperframes/engines/validate.ts
// Cheap static checks on engine layers. The pipeline drops (never fails on)
// layers that violate them — mirroring the "ship the film without audio"
// degradation stance. Rules come from the verified HyperFrames contracts in
// docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md.

import type { Layer } from "./types";

const NONDETERMINISM: Array<[RegExp, string]> = [
  [/Math\.random\s*\(/, "uses Math.random (nondeterministic)"],
  [/Date\.now\s*\(/, "uses Date.now (nondeterministic)"],
  [/requestAnimationFrame\s*\(/, "uses requestAnimationFrame (HyperFrames owns the clock)"],
  [/setInterval\s*\(|setTimeout\s*\(/, "uses timers (HyperFrames owns the clock)"],
  [/fetch\s*\(|XMLHttpRequest/, "performs network I/O (renders must be hermetic)"],
];

/** Returns a list of violations; empty = layer is acceptable. */
export function validateLayer(layer: Layer): string[] {
  const code = layer.code ?? "";
  const out: string[] = [];

  for (const [re, msg] of NONDETERMINISM) {
    if (re.test(code)) out.push(msg);
  }

  if (layer.engine === "anime") {
    if (!/__hfAnime\s*\.\s*push/.test(code)) out.push("anime layer never registers on window.__hfAnime");
    if (!/autoplay\s*:\s*false/.test(code)) out.push("anime layer missing autoplay: false");
    if (/\banime\s*\(\s*\{/.test(code)) out.push("uses the v3 anime({...}) call — v4 IIFE exposes an object; use anime.createTimeline/animate");
  }

  if (layer.engine === "waapi") {
    if (!/fill\s*:\s*["']both["']/.test(code)) out.push('waapi layer missing fill: "both"');
    if (!/\.pause\s*\(\s*\)/.test(code)) out.push("waapi layer never pause()s its animation");
  }

  if (layer.engine === "three") {
    if (!/hf-seek/.test(code)) out.push("three layer has no hf-seek listener (seek wiring)");
    if (!/__hfThreeTime/.test(code)) out.push("three layer missing the __hfThreeTime initial render (blank first frame)");
  }

  return out;
}
```

- [ ] **Step 4: Run, confirm PASS. Typecheck.**

- [ ] **Step 5: Commit:** `feat(hyperframes): static engine-layer validation`

### Task 6: Blueprint recommends a background engine (+ Three budget)

**Files:** Modify `llm-director.ts` (`SceneBrief`, `FILM_BLUEPRINT_SCHEMA`, `FILM_BLUEPRINT_SYSTEM_PROMPT`, normalization in `generateFilmBlueprint`).

- [ ] **Step 1:** Add to `SceneBrief`:

```ts
  /**
   * Which engine (if any) should render this scene's background depth layer.
   * "none" for most scenes. "three" is render-budget-capped film-wide
   * (MAX_THREE_SCENES); normalization downgrades extras to "none".
   */
  backgroundEngine?: "none" | "three" | "anime" | "waapi";
  /** 1-sentence concept for the background layer (only when != "none"). */
  backgroundConcept?: string;
```

- [ ] **Step 2:** Add both to `FILM_BLUEPRINT_SCHEMA`'s sceneOutline item `properties` and append `"backgroundEngine", "backgroundConcept"` to the item's `required` array (structured output then fills them for every scene; "none" + "" is the explicit no-op):

```ts
          backgroundEngine: { type: "string", enum: ["none", "three", "anime", "waapi"] },
          backgroundConcept: { type: "string" },
```

- [ ] **Step 3:** Add at module scope near the blueprint schema:

```ts
// Render-budget cap: each three-layer scene adds WebGL frame cost at render
// time. Keep the hero moments, downgrade the rest.
const MAX_THREE_SCENES = 2;
```

- [ ] **Step 4:** In `FILM_BLUEPRINT_SYSTEM_PROMPT`'s sceneOutline field list (after the `transitionInChoice` line), add (the prompt is a template literal — interpolate `${MAX_THREE_SCENES}`):

```
       backgroundEngine         — "none" | "three" | "anime" | "waapi". An OPTIONAL living background layer rendered by a second animation engine BEHIND the scene's typography. "none" for MOST scenes — depth must be earned, not default. Choose:
                                    • "three"  — true 3D/WebGL depth (particle fields, volumetric gradients, slow geometry). HERO moments only: AT MOST ${MAX_THREE_SCENES} scenes per film (hard budget — extras get downgraded to "none").
                                    • "anime"  — organic 2D motion textures (drifting shapes, morphing accents) when GSAP-on-DOM would feel flat.
                                    • "waapi"  — featherweight native motion (subtle gradient pans, slow ambient drift).
       backgroundConcept        — 1 sentence: WHAT the background layer shows and why it serves this beat. Empty string when backgroundEngine="none".
```

- [ ] **Step 5:** In `generateFilmBlueprint`'s normalization (where `normalizedOutline` is built), enforce the budget after assembly:

```ts
  // Enforce the three budget: keep the first MAX_THREE_SCENES "three"
  // recommendations (blueprint order ≈ narrative priority), downgrade extras.
  let threeCount = 0;
  for (const brief of normalizedOutline) {
    if (brief.backgroundEngine === "three") {
      threeCount += 1;
      if (threeCount > MAX_THREE_SCENES) {
        console.warn(
          `[hyperframes blueprint] downgrading backgroundEngine=three on ${brief.id} (budget ${MAX_THREE_SCENES})`,
        );
        brief.backgroundEngine = "none";
        brief.backgroundConcept = "";
      }
    }
    if (!brief.backgroundEngine) brief.backgroundEngine = "none";
  }
```

- [ ] **Step 6:** Typecheck + full suite. **Commit:** `feat(hyperframes): blueprint recommends background engine with three budget`

### Task 7: Scene-fill schema + post-parse guard

**Files:** Modify `llm-director.ts` (`SCENE_FILL_SCHEMA`, `generateSceneFill`).

- [ ] **Step 1:** Add to `SCENE_FILL_SCHEMA.properties` (NOT to `required`):

```ts
    backgroundLayers: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "engine", "html", "css", "code"],
        properties: {
          id: { type: "string" },
          engine: { type: "string", enum: ["three", "anime", "waapi"] },
          html: { type: "string" },
          css: { type: "string" },
          code: { type: "string" },
        },
      },
    },
```

- [ ] **Step 2:** Import `validateLayer` (`import { validateLayer } from "./engines/validate";`) next to the other engine imports. In `generateSceneFill`, after `parsed` is obtained and before the final return, add:

```ts
  // Background-layer guard: cap at 1, drop layers that fail static validation,
  // and drop three layers the blueprint didn't budget for this scene. Dropping
  // is silent degradation — the GSAP base scene always survives.
  let backgroundLayers = Array.isArray(parsed.backgroundLayers)
    ? parsed.backgroundLayers.slice(0, 1)
    : undefined;
  if (backgroundLayers && backgroundLayers.length > 0) {
    backgroundLayers = backgroundLayers.filter((layer) => {
      if (layer.engine === "three" && curr.backgroundEngine !== "three") {
        console.warn(
          `[hyperframes scene ${curr.id}] dropping unbudgeted three layer "${layer.id}" (brief recommends ${curr.backgroundEngine ?? "none"})`,
        );
        return false;
      }
      const violations = validateLayer(layer);
      if (violations.length > 0) {
        console.warn(
          `[hyperframes scene ${curr.id}] dropping invalid ${layer.engine} layer "${layer.id}": ${violations.join("; ")}`,
        );
        return false;
      }
      return true;
    });
    if (backgroundLayers.length === 0) backgroundLayers = undefined;
  }
```

And include it in the final return:

```ts
  return {
    ...parsed,
    id: curr.id,
    transitionIn: curr.transitionInChoice,
    backgroundLayers,
  };
```

- [ ] **Step 3:** Typecheck + full suite. **Commit:** `feat(hyperframes): scene-fill emits validated backgroundLayers`

### Task 8: Teach the prompts the verified authoring patterns

**Files:** Modify `llm-director.ts` (`FILM_SYSTEM_PROMPT`, `buildSceneFillUserPrompt`).

- [ ] **Step 1:** Append this section to `FILM_SYSTEM_PROMPT` (after its GSAP/animation rules). The three pattern must match the WORKING smoke code from Task 3 — adjust if Task 3 iterated:

```
═══ ENGINE BACKGROUND LAYERS (OPTIONAL DEPTH — RESTRAINT REQUIRED) ═══

Beyond the GSAP scene, you MAY emit ONE background layer rendered by a second
animation engine, stacked BEHIND your contentHtml. Use it ONLY when the scene
brief sets backgroundEngine != "none", implementing the brief's
backgroundConcept. The background is a backdrop — copy, headlines, and focal
elements stay in contentHtml. Most scenes have none.

Emit via the optional backgroundLayers array (exactly 0 or 1 entries):
  { id, engine: "three" | "anime" | "waapi", html, css, code }

Rules for ALL engine layers:
  • DETERMINISM: no Math.random, no Date.now, no requestAnimationFrame, no
    timers, no network. Violations get the layer dropped at build time.
  • html is the layer's own DOM (a <canvas> for three). css is scoped to it.
  • The layer sits behind the scene content — keep contrast low enough that
    the typography stays readable.

anime (Anime.js v4 — the global `anime` is an OBJECT, NOT callable):
  Your code runs with __sceneStartMs defined (this scene's start on the film's
  global clock, in MILLISECONDS). Engines seek with global time — add
  __sceneStartMs to every delay.
    var tl = anime.createTimeline({ autoplay: false });
    tl.add(".bg-shape", { translateX: { from: -120, to: 0 }, opacity: { from: 0, to: 1 },
                          duration: 900, delay: __sceneStartMs + 200 });
    window.__hfAnime.push(tl);
  → autoplay:false and window.__hfAnime.push are MANDATORY. NEVER call anime({...}).

waapi (native Web Animations API — no library):
  __sceneStartMs is defined (ms, as above).
    var a = document.getElementById("bg-el").animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 900, delay: __sceneStartMs + 0, fill: "both", iterations: 1 });
    a.pause();
  → fill:"both", finite iterations, and .pause() are MANDATORY.

three (WebGL — ONLY when the brief sets backgroundEngine="three"):
  Your code is an ES MODULE with __sceneStartS defined (this scene's start in
  SECONDS). Import three yourself and render as a pure function of seek time:
    import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm";
    const canvas = document.getElementById("bg-canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(1920, 1080, false);
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1920 / 1080, 0.1, 100);
    camera.position.set(0, 0, 6);
    // ...geometry/lights...
    function renderAt(t) {            // t = scene-local seconds, may exceed scene end
      mesh.rotation.y = t * 0.7;
      renderer.render(scene, camera);
    }
    window.addEventListener("hf-seek", (e) => renderAt(Math.max(0, e.detail.time - __sceneStartS)));
    renderAt(Math.max(0, (window.__hfThreeTime || 0) - __sceneStartS));  // initial frame — MANDATORY
  → setSize(1920,1080,false), setPixelRatio(1), the hf-seek listener, and the
    initial __hfThreeTime render are MANDATORY. No rAF / setAnimationLoop.
```

- [ ] **Step 2:** In `buildSceneFillUserPrompt`:
  - In the CURRENT SCENE BRIEF block (after the `transitionInChoice` line) add:
    ```ts
  backgroundEngine:   ${curr.backgroundEngine ?? "none"}${curr.backgroundConcept ? `
  backgroundConcept:  ${curr.backgroundConcept}` : ""}
    ```
  - In the OUTPUT CONTRACT, after the `continuitySummary` bullet, add a conditional fragment:
    ```ts
${curr.backgroundEngine && curr.backgroundEngine !== "none"
  ? `  • backgroundLayers    — REQUIRED here: exactly one { id, engine: "${curr.backgroundEngine}", html, css, code }
                          implementing the backgroundConcept ("${curr.backgroundConcept ?? ""}").
                          Follow the engine's authoring rules from the system prompt exactly.`
  : `  • backgroundLayers    — OMIT the field entirely (this scene's brief has no background engine).`}
    ```
  - In the LENGTH BUDGET block add: `  • backgroundLayers: at most 1 layer; its code ≤ 40 lines, html ≤ 15 lines.`

- [ ] **Step 3:** Typecheck + full suite. **Commit:** `feat(hyperframes): prompts teach engine background layers`

### Task 9: Integration test — backgroundLayers end-to-end through the skeleton

**Files:** Modify `app/lib/hyperframes/buildFilmSkeleton.test.ts`.

- [ ] **Step 1:** Append:

```ts
test("a fill with backgroundLayers stacks the engine layer behind the gsap base", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: `<h1 id="hero">Hero</h1>`,
        sceneCss: `#hero { color: white; }`,
        timeline: `tl.from("#hero", { opacity: 0 }, 0);`,
        transitionIn: "hard_cut",
        backgroundLayers: [
          { id: "bgw", engine: "waapi", html: `<div id="amb"></div>`, css: `#amb { position: absolute; inset: 0; }`,
            code: `document.getElementById("amb").animate([{opacity:0.2},{opacity:0.5}],{duration:2000,delay:__sceneStartMs+0,fill:"both",iterations:1}).pause();` },
        ],
      },
      { id: "s2", contentHtml: `<h1 id="b">Second</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  // Two stacked layers in s1: background (z-index:0) below the gsap base (z-index:1).
  expect(html).toContain(`z-index:0"><div id="amb"></div>`);
  expect(html).toContain(`z-index:1"><h1 id="hero">Hero</h1>`);
  // Both engines' code present; background css merged into the scene <style>.
  expect(html).toContain(`document.getElementById("amb").animate`);
  expect(html).toContain(`tl.from("#hero", { opacity: 0 }, 0);`);
  expect(html).toContain(`#amb { position: absolute; inset: 0; }`);
});
```

- [ ] **Step 2:** Full suite + typecheck — green/clean.

- [ ] **Step 3: Commit:** `test(hyperframes): backgroundLayers integration through buildFilmSkeleton`

---

## Final verification

- [ ] `npx vitest run` green; `npx tsc --noEmit` clean.
- [ ] Render smoke (with three): `npx tsx scripts/smoke-multi-engine.ts` → SMOKE PASS.
- [ ] Real-pipeline check (manual, user-run): generate a film in the dev app and confirm (a) the blueprint sets `backgroundEngine` on 1+ scenes, (b) scene fills include `backgroundLayers`, (c) the composition renders and the editor preview still works, (d) a film with zero background layers is unchanged.
