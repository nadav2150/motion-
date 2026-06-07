# Multi-Engine Animation Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for mixing multiple animation engines (GSAP, Three.js, Anime.js, WAAPI) within a single HyperFrames scene, by pinning the render toolchain and refactoring the composition builder to a backward-compatible, adapter-based layer model.

**Architecture:** Approach A from the design spec (`docs/superpowers/specs/2026-06-07-multi-engine-animation-layers-design.md`). Each scene becomes a stack of `Layer`s, each owned by an engine adapter that emits the layer's DOM and JS. This plan implements **Phase 0 (pin + verify) and Phase 1 (layer model + GSAP-only adapter, zero behavior change)**. The non-GSAP adapters and the blueprint/scene-fill prompt changes are deferred to a follow-on plan, because their code depends on the exact HyperFrames per-engine seek contract that Phase 0 documents.

**Tech Stack:** TypeScript, React Router 7, Vitest, HeyGen HyperFrames CLI (`npx hyperframes`), GSAP. Node `child_process` for spawning the CLI.

---

## Scope & Decomposition

This plan = **Phase 0 + Phase 1** of the spec's 5-phase rollout.

- **Phase 0** — pin the HyperFrames CLI version everywhere it's spawned; capture each engine's seek/registration contract into a notes doc; (optional) smoke-render.
- **Phase 1** — introduce the `Layer` type + an `EngineAdapter` abstraction + a GSAP adapter, and refactor `buildFilmSkeleton` to build from layers. Legacy `SceneFill`s (no `layers`) produce a functionally identical composition. No LLM/prompt/schema changes yet.

**Deferred to a follow-on plan (written after Phase 0's contract doc):** Phase 2 (WAAPI + Anime adapters + the `__mgSceneClock` skeleton helper), Phase 3 (Three.js adapter + graceful per-layer degradation + render-budget cap), Phase 4 (blueprint + scene-fill prompt/schema changes so the LLM emits `layers[]`).

## File Structure

**Create:**
- `app/lib/hyperframes/cli.ts` — single source of truth for how the HyperFrames CLI is spawned (pinned version, `--yes`, bin name). Consumed by `render.ts` and `llm-director.ts`.
- `app/lib/hyperframes/cli.test.ts` — unit tests for the arg builder.
- `app/lib/hyperframes/engines/types.ts` — `LayerEngine`, `Layer`, `LayerEmitContext`, `EngineAdapter`.
- `app/lib/hyperframes/engines/gsap.ts` — the GSAP adapter (reproduces today's IIFE master-timeline wrapper exactly).
- `app/lib/hyperframes/engines/gsap.test.ts` — GSAP adapter unit tests.
- `app/lib/hyperframes/engines/registry.ts` — adapter lookup + extra-CDN collection.
- `app/lib/hyperframes/engines/registry.test.ts` — registry unit tests.
- `app/lib/hyperframes/engines/layers.ts` — `resolveLayers` (legacy fill → layers).
- `app/lib/hyperframes/engines/layers.test.ts` — `resolveLayers` unit tests.
- `docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md` — Phase 0 research output.

**Modify:**
- `app/lib/hyperframes/render.ts:90-92` — spawn via `cli.ts`.
- `app/lib/hyperframes/llm-director.ts:2146-2184` (`lintCompositionHTML`) — spawn via `cli.ts`.
- `app/lib/hyperframes/llm-director.ts:1568-1586` (`SceneFill` type) — add optional `layers`.
- `app/lib/hyperframes/llm-director.ts:2264-2516` (`buildFilmSkeleton`) — build from layers via adapters.

---

# Phase 0 — Pin the toolchain + capture engine contracts

### Task 1: Centralize how the HyperFrames CLI is spawned

Today two call sites build `npx hyperframes …` args inline — `render.ts:91-92`
(`["hyperframes", "render", ".", "--output", "scene.mp4"]`) and `lintCompositionHTML`
in `llm-director.ts:2153-2154` (`["hyperframes", "lint", ".", "--json"]`). Both are
**unpinned and omit `--yes`**, so they resolve `hyperframes@latest` at runtime and can
hang on an install prompt. Centralize and pin them.

**Files:**
- Create: `app/lib/hyperframes/cli.ts`
- Test: `app/lib/hyperframes/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/hyperframes/cli.test.ts
import { expect, test } from "vitest";
import { HYPERFRAMES_VERSION, hyperframesBin, hyperframesArgs } from "./cli";

test("HYPERFRAMES_VERSION is pinned to a concrete version", () => {
  expect(HYPERFRAMES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("hyperframesArgs pins the version and passes --yes before the package", () => {
  const args = hyperframesArgs("render", [".", "--output", "scene.mp4"]);
  expect(args).toEqual([
    "--yes",
    `hyperframes@${HYPERFRAMES_VERSION}`,
    "render",
    ".",
    "--output",
    "scene.mp4",
  ]);
});

test("hyperframesArgs works with no extra args", () => {
  expect(hyperframesArgs("lint", ["--json"])).toEqual([
    "--yes",
    `hyperframes@${HYPERFRAMES_VERSION}`,
    "lint",
    "--json",
  ]);
});

test("hyperframesBin uses the .cmd shim on win32 and plain npx elsewhere", () => {
  expect(hyperframesBin("win32")).toBe("npx.cmd");
  expect(hyperframesBin("linux")).toBe("npx");
  expect(hyperframesBin("darwin")).toBe("npx");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/hyperframes/cli.test.ts`
Expected: FAIL — `Cannot find module './cli'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/hyperframes/cli.ts
// Single source of truth for spawning the HeyGen HyperFrames CLI.
//
// Pinned + `--yes` so every render/lint runs against the exact version we
// tested, and so a clean environment never hangs on an npx install prompt.
// Matches hf-example/package.json (hyperframes@0.6.6).

export const HYPERFRAMES_VERSION = "0.6.6";

/** npx is a .cmd shim on Windows; spawn it with shell:true there. */
export function hyperframesBin(platform: NodeJS.Platform | string = process.platform): string {
  return platform === "win32" ? "npx.cmd" : "npx";
}

/**
 * Build the argv for `npx --yes hyperframes@<pinned> <subcommand> <...rest>`.
 * `--yes` must precede the package spec so npx auto-installs without prompting.
 */
export function hyperframesArgs(subcommand: string, rest: string[] = []): string[] {
  return ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, subcommand, ...rest];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/hyperframes/cli.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/cli.ts app/lib/hyperframes/cli.test.ts
git commit -m "feat(hyperframes): pin + centralize CLI spawn args"
```

---

### Task 2: Use the pinned CLI in the renderer

**Files:**
- Modify: `app/lib/hyperframes/render.ts:8-16` (imports), `render.ts:90-99` (spawn)

- [ ] **Step 1: Add the import**

At the top of `render.ts`, alongside the existing imports, add:

```ts
import { hyperframesArgs, hyperframesBin } from "./cli";
```

- [ ] **Step 2: Replace the inline spawn args**

Find this block (`render.ts:90-99`):

```ts
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";
  const args2 = ["hyperframes", "render", ".", "--output", "scene.mp4"];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args2, {
      cwd: dir,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
```

Replace it with:

```ts
  const isWin = process.platform === "win32";
  const cmd = hyperframesBin();
  const args2 = hyperframesArgs("render", [".", "--output", "scene.mp4"]);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args2, {
      cwd: dir,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors in `render.ts`).

- [ ] **Step 4: Commit**

```bash
git add app/lib/hyperframes/render.ts
git commit -m "refactor(hyperframes): render via pinned CLI args"
```

---

### Task 3: Use the pinned CLI in the linter

**Files:**
- Modify: `app/lib/hyperframes/llm-director.ts` (`lintCompositionHTML`, lines 2152-2154) + add the import near the other `./` imports at the top of the file.

- [ ] **Step 1: Add the import**

Near the top of `llm-director.ts` with the other relative imports, add:

```ts
import { hyperframesArgs, hyperframesBin } from "./cli";
```

- [ ] **Step 2: Replace the inline spawn args**

Find (`llm-director.ts:2152-2154`):

```ts
    const isWin = process.platform === "win32";
    const cmd = isWin ? "npx.cmd" : "npx";
    const args = ["hyperframes", "lint", ".", "--json"];
```

Replace with:

```ts
    const isWin = process.platform === "win32";
    const cmd = hyperframesBin();
    const args = hyperframesArgs("lint", [".", "--json"]);
```

(`isWin` is still used below for `shell: isWin` — leave that.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/hyperframes/llm-director.ts
git commit -m "refactor(hyperframes): lint via pinned CLI args"
```

---

### Task 4: Capture the per-engine seek contract (research → notes doc)

This is the de-risking gate. The follow-on plan's adapter code depends on knowing
exactly how HyperFrames 0.6.6 drives each engine. Produce a notes doc from the CLI's
own docs so the contract is recorded against the pinned version.

**Files:**
- Create: `docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md`

- [ ] **Step 1: Pull the docs for each engine from the pinned CLI**

Run each and read the output:

```bash
npx --yes hyperframes@0.6.6 docs rendering
npx --yes hyperframes@0.6.6 docs gsap
npx --yes hyperframes@0.6.6 docs data-attributes
```

Also fetch the machine-readable index `https://hyperframes.heygen.com/llms.txt` and
follow it to the GSAP, Anime.js, WAAPI, and Three.js pages.

- [ ] **Step 2: Write the notes doc**

For each of GSAP, Anime.js, WAAPI, Three.js record, with a verbatim minimal example
from the docs:
- the registration global / mechanism (e.g. `window.__timelines`, `window.__hfAnime`,
  `document.getAnimations()`, `hf-seek` event payload shape);
- whether the engine animation must be created paused, and how it is seeked per frame;
- how a sub-timeline expresses a time offset (for placing a scene at its master
  offset);
- the CDN URL the docs recommend;
- determinism constraints (the CLAUDE.md already states: no `Date.now`, no
  `Math.random`, no network).

Save to `docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md
git commit -m "docs(hyperframes): capture per-engine seek contracts (0.6.6)"
```

---

# Phase 1 — Layer model + GSAP adapter (zero behavior change)

### Task 5: Define the layer + adapter types and extend `SceneFill`

**Files:**
- Create: `app/lib/hyperframes/engines/types.ts`
- Modify: `app/lib/hyperframes/llm-director.ts:1568-1586` (`SceneFill`)

- [ ] **Step 1: Create the engine types**

```ts
// app/lib/hyperframes/engines/types.ts
// Layer model for multi-engine scene composition. A scene is a back-to-front
// stack of layers; each layer is owned by one engine adapter.

export type LayerEngine = "gsap" | "three" | "anime" | "waapi";

export type Layer = {
  /** Unique within the scene. */
  id: string;
  engine: LayerEngine;
  /** DOM for this layer (a <canvas> for three). Optional for code-only layers. */
  html?: string;
  /** Layer-scoped CSS. */
  css?: string;
  /** Engine-specific JS. Scene-local time axis: 0 = scene start. */
  code: string;
};

/** Where/when a layer is being emitted, supplied by buildFilmSkeleton. */
export type LayerEmitContext = {
  /** "s1", "s2", … */
  sceneId: string;
  /** Master-timeline offset for the scene, in seconds. */
  start: number;
  /** Scene duration in seconds. */
  duration: number;
  /** Layer index within the scene (0 = backmost). */
  index: number;
  /** Total layer count in the scene. */
  total: number;
};

export type EngineAdapter = {
  engine: LayerEngine;
  /** CDN <script> src to inject when this engine is used; null = native (WAAPI). */
  cdn: string | null;
  /** HTML emitted into .scene-content for this layer. */
  emitDom(layer: Layer, ctx: LayerEmitContext): string;
  /**
   * Self-contained JS block for this layer, concatenated into the composition's
   * single inline <script> after all CDN libs have loaded. For GSAP this is the
   * IIFE that adds the layer's tweens to the master timeline at the scene offset.
   */
  emitJs(layer: Layer, ctx: LayerEmitContext): string;
};
```

- [ ] **Step 2: Add `layers` to `SceneFill`**

In `llm-director.ts`, add the import near the other `./` imports:

```ts
import type { Layer } from "./engines/types";
```

Then in the `SceneFill` type (currently ending at line 1586), add the field before the
closing `}`:

```ts
  /**
   * Optional multi-engine layer stack (back→front). When present it supersedes
   * contentHtml/sceneCss/timeline. When absent, buildFilmSkeleton synthesizes a
   * single implicit GSAP layer from those legacy fields (full backward compat).
   */
  layers?: Layer[];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/hyperframes/engines/types.ts app/lib/hyperframes/llm-director.ts
git commit -m "feat(hyperframes): layer + engine-adapter types; SceneFill.layers"
```

---

### Task 6: Implement the GSAP adapter

The GSAP adapter must reproduce today's output exactly so the legacy path is
unchanged. Today (`buildFilmSkeleton`): DOM is the raw `contentHtml`; JS is the per-scene
IIFE at `llm-director.ts:2322-2340` that shadows `tl` with an offset-applying wrapper and
runs the scene's timeline body.

**Files:**
- Create: `app/lib/hyperframes/engines/gsap.ts`
- Test: `app/lib/hyperframes/engines/gsap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/hyperframes/engines/gsap.test.ts
import { expect, test } from "vitest";
import { gsapAdapter } from "./gsap";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "base",
  engine: "gsap",
  html: `<h1 id="hl">Hello</h1>`,
  css: "",
  code: `tl.from("#hl", { opacity: 0, duration: 0.5 }, 0);`,
};

const ctx: LayerEmitContext = {
  sceneId: "s2",
  start: 3,
  duration: 4,
  index: 0,
  total: 1,
};

test("gsap adapter has no CDN (skeleton already loads gsap)", () => {
  expect(gsapAdapter.cdn).toBeNull();
});

test("emitDom returns the layer html unwrapped when it is the only layer", () => {
  expect(gsapAdapter.emitDom(layer, ctx)).toBe(`<h1 id="hl">Hello</h1>`);
});

test("emitDom wraps the layer in a positioned div when stacked", () => {
  const dom = gsapAdapter.emitDom(layer, { ...ctx, index: 1, total: 3 });
  expect(dom).toContain(`class="layer"`);
  expect(dom).toContain(`z-index:1`);
  expect(dom).toContain(`<h1 id="hl">Hello</h1>`);
});

test("emitJs wraps the timeline body in the offset IIFE at the scene start", () => {
  const js = gsapAdapter.emitJs(layer, ctx);
  // Offset wrapper invoked with the scene start.
  expect(js).toContain(`})(tl, 3);`);
  // The scene-local timeline body is present.
  expect(js).toContain(`tl.from("#hl", { opacity: 0, duration: 0.5 }, 0);`);
  // The position-mapping helper is present.
  expect(js).toContain(`function __p(pos)`);
});

test("emitJs returns empty string for an empty timeline body", () => {
  expect(gsapAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/hyperframes/engines/gsap.test.ts`
Expected: FAIL — `Cannot find module './gsap'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/lib/hyperframes/engines/gsap.ts
// GSAP engine adapter. Reproduces the historical buildFilmSkeleton output:
// the per-scene IIFE shadows `tl` with a wrapper that adds the scene's start
// offset to every numeric position arg, so layer code stays scene-local.

import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

export const gsapAdapter: EngineAdapter = {
  engine: "gsap",
  // The skeleton already includes the GSAP <script> unconditionally (the master
  // timeline always exists), so the adapter contributes no extra CDN.
  cdn: null,

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    const html = layer.html ?? "";
    // Single GSAP layer == legacy path: emit the html unwrapped so output is
    // byte-identical to the pre-layer skeleton.
    if (ctx.total <= 1) return html;
    // Stacked: wrap in an absolutely-positioned layer so z-order is explicit.
    return `<div class="layer" style="position:absolute;inset:0;z-index:${ctx.index}">${html}</div>`;
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    return [
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
      indentLines(body, "    "),
      `  })(tl, ${ctx.start});`,
    ].join("\n");
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/hyperframes/engines/gsap.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/engines/gsap.ts app/lib/hyperframes/engines/gsap.test.ts
git commit -m "feat(hyperframes): GSAP engine adapter"
```

---

### Task 7: Implement the engine registry

**Files:**
- Create: `app/lib/hyperframes/engines/registry.ts`
- Test: `app/lib/hyperframes/engines/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/hyperframes/engines/registry.test.ts
import { expect, test } from "vitest";
import { getEngineAdapter, collectExtraCdn } from "./registry";
import type { Layer } from "./types";

test("getEngineAdapter returns the GSAP adapter", () => {
  expect(getEngineAdapter("gsap").engine).toBe("gsap");
});

test("getEngineAdapter returns null for an unregistered engine", () => {
  // three/anime/waapi are not registered until the follow-on plan.
  expect(getEngineAdapter("three")).toBeNull();
});

test("collectExtraCdn returns no extra scripts when only GSAP is used", () => {
  const layers: Layer[] = [
    { id: "a", engine: "gsap", code: "" },
    { id: "b", engine: "gsap", code: "" },
  ];
  expect(collectExtraCdn(layers)).toEqual([]);
});

test("collectExtraCdn ignores engines with no registered adapter", () => {
  const layers: Layer[] = [{ id: "a", engine: "three", code: "" }];
  expect(collectExtraCdn(layers)).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/hyperframes/engines/registry.test.ts`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/lib/hyperframes/engines/registry.ts
// Engine adapter registry + CDN collection. Only GSAP is registered in this
// phase; three/anime/waapi adapters land in the follow-on plan and register
// here. getEngineAdapter returns null for unregistered engines so callers can
// degrade gracefully (drop the layer) rather than throw.

import { gsapAdapter } from "./gsap";
import type { EngineAdapter, Layer, LayerEngine } from "./types";

const ADAPTERS: Partial<Record<LayerEngine, EngineAdapter>> = {
  gsap: gsapAdapter,
};

export function getEngineAdapter(engine: LayerEngine): EngineAdapter | null {
  return ADAPTERS[engine] ?? null;
}

/**
 * Extra CDN <script> srcs to inject for the engines used across all layers,
 * deduped, excluding GSAP (the skeleton always loads it) and any engine whose
 * adapter declares no CDN or isn't registered yet.
 */
export function collectExtraCdn(layers: Layer[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const layer of layers) {
    const adapter = getEngineAdapter(layer.engine);
    if (!adapter?.cdn) continue;
    if (seen.has(adapter.cdn)) continue;
    seen.add(adapter.cdn);
    out.push(adapter.cdn);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/hyperframes/engines/registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/engines/registry.ts app/lib/hyperframes/engines/registry.test.ts
git commit -m "feat(hyperframes): engine adapter registry + CDN collection"
```

---

### Task 8: Implement `resolveLayers` (legacy fill → layers)

**Files:**
- Create: `app/lib/hyperframes/engines/layers.ts`
- Test: `app/lib/hyperframes/engines/layers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/hyperframes/engines/layers.test.ts
import { expect, test } from "vitest";
import { resolveLayers } from "./layers";

test("synthesizes a single GSAP base layer from legacy fields", () => {
  const layers = resolveLayers({
    contentHtml: `<h1>Hi</h1>`,
    sceneCss: `#s1 { color: red; }`,
    timeline: `tl.from("#h", {}, 0);`,
  });
  expect(layers).toEqual([
    {
      id: "base",
      engine: "gsap",
      html: `<h1>Hi</h1>`,
      css: `#s1 { color: red; }`,
      code: `tl.from("#h", {}, 0);`,
    },
  ]);
});

test("passes through an explicit layers array unchanged", () => {
  const explicit = [
    { id: "bg", engine: "three" as const, html: "<canvas></canvas>", code: "/*…*/" },
    { id: "fg", engine: "gsap" as const, html: "<h1>X</h1>", code: "tl.to(…)" },
  ];
  expect(resolveLayers({ layers: explicit, contentHtml: "ignored", sceneCss: "", timeline: "" })).toBe(
    explicit,
  );
});

test("ignores an empty layers array and falls back to legacy", () => {
  const layers = resolveLayers({
    layers: [],
    contentHtml: `<p>L</p>`,
    sceneCss: "",
    timeline: "",
  });
  expect(layers).toHaveLength(1);
  expect(layers[0].engine).toBe("gsap");
  expect(layers[0].html).toBe(`<p>L</p>`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/hyperframes/engines/layers.test.ts`
Expected: FAIL — `Cannot find module './layers'`.

- [ ] **Step 3: Write the implementation**

```ts
// app/lib/hyperframes/engines/layers.ts
// Normalize a scene fill into a layer stack. New fills carry `layers`; legacy
// fills carry contentHtml/sceneCss/timeline, which become one implicit GSAP
// layer. The caller resolves the contentHtml/sceneCss/timeline fallbacks
// (including the no-fill <h1> default) before calling in.

import type { Layer } from "./types";

export type ResolvableFill = {
  layers?: Layer[];
  contentHtml: string;
  sceneCss: string;
  timeline: string;
};

export function resolveLayers(fill: ResolvableFill): Layer[] {
  if (fill.layers && fill.layers.length > 0) {
    return fill.layers;
  }
  return [
    {
      id: "base",
      engine: "gsap",
      html: fill.contentHtml,
      css: fill.sceneCss,
      code: fill.timeline,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/hyperframes/engines/layers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/engines/layers.ts app/lib/hyperframes/engines/layers.test.ts
git commit -m "feat(hyperframes): resolveLayers (legacy fill -> layer stack)"
```

---

### Task 9: Refactor `buildFilmSkeleton` to build from layers

Rewire the per-scene DOM and per-scene JS to flow through `resolveLayers` + the engine
adapters, and inject any extra-engine CDN scripts. Output for legacy fills must stay
functionally identical. Non-GSAP layers whose adapter isn't registered yet are dropped
with a warning (the graceful-degradation seed).

**Files:**
- Modify: `app/lib/hyperframes/llm-director.ts` (`buildFilmSkeleton`, lines 2264-2516)
- Test: `app/lib/hyperframes/buildFilmSkeleton.test.ts` (create)

- [ ] **Step 1: Add imports**

Near the other `./engines` import added in Task 5, add:

```ts
import { resolveLayers } from "./engines/layers";
import { collectExtraCdn, getEngineAdapter } from "./engines/registry";
import type { Layer, LayerEmitContext } from "./engines/types";
```

- [ ] **Step 2: Replace the `sectionsHtml` builder**

Find the `sectionsHtml` block (`llm-director.ts:2286-2309`) and replace its `.map`
body so each scene's content comes from its layers' `emitDom`. The new block:

```ts
  // Per-scene sections — content is the back→front layer stack emitted by each
  // engine adapter. Layer-level CSS is concatenated into the section <style>.
  const sectionsHtml = storyboard.scenes
    .map((scene, i) => {
      const sid = `s${i + 1}`;
      const fill = fillById.get(sid) ?? fillById.get(scene.id);
      const transitionIn = fill?.transitionIn ?? "hard_cut";
      const initStyle =
        transitionIn === "hard_cut" ? `visibility:hidden` : `opacity:0`;
      const start = starts[i];

      const layers = resolveLayers({
        layers: fill?.layers,
        contentHtml: fill?.contentHtml ?? `<h1>${escapeHtml(scene.copy)}</h1>`,
        sceneCss: fill?.sceneCss ?? "",
        timeline: fill?.timeline ?? "",
      });

      const domParts: string[] = [];
      const cssParts: string[] = [];
      layers.forEach((layer, index) => {
        const adapter = getEngineAdapter(layer.engine);
        if (!adapter) {
          console.warn(
            `[hyperframes] scene ${sid}: dropping layer "${layer.id}" — no adapter for engine "${layer.engine}"`,
          );
          return;
        }
        const ctx: LayerEmitContext = {
          sceneId: sid,
          start,
          duration: scene.durationSeconds,
          index,
          total: layers.length,
        };
        domParts.push(adapter.emitDom(layer, ctx));
        if (layer.css) cssParts.push(layer.css);
      });

      const sceneCss = cssParts.join("\n");
      const content = domParts.join("\n");
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
```

- [ ] **Step 3: Replace the `sceneTimelineBlocks` builder**

Find the `sceneTimelineBlocks` block (`llm-director.ts:2316-2342`) and replace it so
each scene's JS comes from its layers' `emitJs` (GSAP layers reproduce the old IIFE):

```ts
  // Per-scene JS — each layer's adapter emits a self-contained block. GSAP
  // layers reproduce the historical offset-IIFE; other engines (follow-on)
  // register on their own globals.
  const sceneTimelineBlocks = storyboard.scenes
    .map((scene, i) => {
      const sid = `s${i + 1}`;
      const fill = fillById.get(sid) ?? fillById.get(scene.id);
      const start = starts[i];

      const layers = resolveLayers({
        layers: fill?.layers,
        contentHtml: fill?.contentHtml ?? `<h1>${escapeHtml(scene.copy)}</h1>`,
        sceneCss: fill?.sceneCss ?? "",
        timeline: fill?.timeline ?? "",
      });

      const blocks: string[] = [
        `  // ── ${sid} (${scene.copy.slice(0, 60).replace(/\s+/g, " ")}) — offset ${start}s ──`,
      ];
      layers.forEach((layer, index) => {
        const adapter = getEngineAdapter(layer.engine);
        if (!adapter) return; // already warned in sectionsHtml
        const ctx: LayerEmitContext = {
          sceneId: sid,
          start,
          duration: scene.durationSeconds,
          index,
          total: layers.length,
        };
        const js = adapter.emitJs(layer, ctx);
        if (js.trim()) blocks.push(js);
      });
      return blocks.join("\n");
    })
    .join("\n\n");
```

- [ ] **Step 4: Inject extra-engine CDN scripts**

The skeleton hardcodes the GSAP `<script>` at `llm-director.ts:2487`. Above the
`return` of the template string, compute the extra scripts. Right after the
`sceneTimelineBlocks` definition (and before the audio/return), add:

```ts
  // Extra engine libs (three/anime/…) needed by any layer, injected before the
  // inline script so they're defined when layer code runs. Empty until the
  // non-GSAP adapters register (follow-on plan).
  const allLayers: Layer[] = storyboard.scenes.flatMap((scene, i) => {
    const sid = `s${i + 1}`;
    const fill = fillById.get(sid) ?? fillById.get(scene.id);
    return resolveLayers({
      layers: fill?.layers,
      contentHtml: fill?.contentHtml ?? "",
      sceneCss: fill?.sceneCss ?? "",
      timeline: fill?.timeline ?? "",
    });
  });
  const extraEngineScripts = collectExtraCdn(allLayers)
    .map((src) => `<script src="${src}"></script>`)
    .join("\n");
```

Then in the returned template, change the GSAP script line (`llm-director.ts:2487`) from:

```ts
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
```

to:

```ts
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
${extraEngineScripts ? extraEngineScripts + "\n" : ""}
```

- [ ] **Step 5: Write the backward-compat + stacking test**

```ts
// app/lib/hyperframes/buildFilmSkeleton.test.ts
import { expect, test } from "vitest";
import { buildFilmSkeleton } from "./llm-director";
import type { FilmFills } from "./llm-director";

// Minimal storyboard + identity fixtures. Only the fields buildFilmSkeleton
// reads are populated.
const identity: any = {
  background: "#000",
  ink: "#fff",
  inkMuted: "#aaa",
  accents: ["#7c5cff"],
  headlineFont: "Inter",
  bodyFont: "Inter",
  monoFont: "Mono",
  language: "en",
  textDirection: "ltr",
};

const storyboard: any = {
  title: "T",
  scenes: [
    { id: "s1", copy: "First", durationSeconds: 3 },
    { id: "s2", copy: "Second", durationSeconds: 4 },
  ],
};

test("legacy fills (no layers) still produce the GSAP wiring and scene content", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: `<h1 id="a">First</h1>`,
        sceneCss: `#a { color: red; }`,
        timeline: `tl.from("#a", { opacity: 0 }, 0);`,
        transitionIn: "hard_cut",
      },
      {
        id: "s2",
        contentHtml: `<h1 id="b">Second</h1>`,
        sceneCss: "",
        timeline: `tl.from("#b", { y: 20 }, 0);`,
        transitionIn: "hard_cut",
      },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);

  // Master timeline + registration intact.
  expect(html).toContain(`window.__timelines["main"] = tl;`);
  expect(html).toContain(`<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>`);
  // Scene content present, unwrapped (single layer).
  expect(html).toContain(`<h1 id="a">First</h1>`);
  expect(html).not.toContain(`class="layer"`);
  // s2 timeline placed at its 3s offset via the IIFE wrapper.
  expect(html).toContain(`})(tl, 3);`);
  expect(html).toContain(`tl.from("#b", { y: 20 }, 0);`);
  // No extra engine scripts when everything is GSAP.
  expect(html).not.toContain(`anime.min.js`);
  expect(html).not.toContain(`three.min.js`);
});

test("an unregistered engine layer is dropped, GSAP siblings survive", () => {
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
          { id: "bg", engine: "three", html: `<canvas id="c"></canvas>`, code: `/* three */` },
          { id: "fg", engine: "gsap", html: `<h1 id="t">Hi</h1>`, code: `tl.to("#t", {}, 0);` },
        ],
      },
      {
        id: "s2",
        contentHtml: `<h1 id="b">Second</h1>`,
        sceneCss: "",
        timeline: "",
        transitionIn: "hard_cut",
      },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  // three layer dropped (no adapter yet).
  expect(html).not.toContain(`<canvas id="c">`);
  expect(html).not.toContain(`/* three */`);
  // gsap sibling survives, wrapped because total layers > 1.
  expect(html).toContain(`<h1 id="t">Hi</h1>`);
  expect(html).toContain(`class="layer"`);
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run app/lib/hyperframes/buildFilmSkeleton.test.ts`
Expected: PASS (2 tests).

> If the import of `./llm-director` fails because the module instantiates an
> Anthropic/OpenAI client at module load, do NOT mock around it — instead move
> `buildFilmSkeleton` and its pure helpers (`defaultCssVariables`, `sceneStarts`,
> `escapeHtml`, `indentLines`) into a new `app/lib/hyperframes/skeleton.ts` and
> re-export from `llm-director.ts`, then import `buildFilmSkeleton` from
> `./skeleton` in the test. Confirm with `npx vitest run` before committing.

- [ ] **Step 7: Run the full hyperframes test + typecheck**

Run: `npx vitest run app/lib/hyperframes` and `npx tsc --noEmit`
Expected: PASS for both.

- [ ] **Step 8: Commit**

```bash
git add app/lib/hyperframes/llm-director.ts app/lib/hyperframes/buildFilmSkeleton.test.ts
git commit -m "refactor(hyperframes): build composition from engine layers"
```

---

## Final verification

- [ ] Run the whole suite: `npx vitest run`
- [ ] Typecheck: `npx tsc --noEmit`
- [ ] Confirm no behavior change for existing jobs: the legacy-fill test in Task 9
      asserts identical GSAP wiring, scene content, and offsets.

## Follow-on plan (not in this plan)

After Task 4's contract doc exists, write `docs/superpowers/plans/<date>-multi-engine-adapters.md` covering:
- **Phase 2:** `anime.ts` + `waapi.ts` adapters (register in `registry.ts`), the
  `__mgSceneClock(sceneId, start, dur)` skeleton helper they rely on, adapter tests,
  and a per-engine smoke render.
- **Phase 3:** `three.ts` adapter (free-written by the LLM), graceful per-layer drop on
  lint failure inside `generateFilmHTML`, and the render-budget cap (start 1–2
  three-scenes/film).
- **Phase 4:** blueprint `engines` recommendation + scene-fill `layers[]` schema and
  the per-engine authoring rules in the system prompts, sourced from Task 4's doc.
