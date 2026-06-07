# Multi-Engine Animation Layers — Design

**Date:** 2026-06-07
**Status:** Approved (design)
**Branch:** `feat/multi-engine-animation-layers`

## Problem

Videly generates animated HyperFrames compositions where every scene's motion is
written by an LLM as **GSAP-only** code. The entire pipeline is hard-wired to one
master GSAP timeline:

- `buildFilmSkeleton` (`app/lib/hyperframes/llm-director.ts`) injects only the GSAP
  CDN and wires `window.__timelines["main"]`.
- Each `SceneFill` returns a single `timeline` field containing GSAP code.
- The blueprint and scene-fill system prompts teach the model to think only in GSAP.

GSAP alone caps the visual ceiling. We want richer motion: 3D / particles / shaders
(Three.js), designer-grade native motion (Anime.js), and native browser animation
(WAAPI) — and we want to **mix engines within a single scene** (e.g. a Three.js
volumetric background under a GSAP headline).

## Goals

- Support four engines: **GSAP** (existing), **Three.js**, **Anime.js**, **WAAPI**.
- Allow **multiple engines mixed within one scene** (layer-based model).
- Never regress existing jobs: backward compatible with the current single-GSAP
  `SceneFill` shape; the critique/improve loop keeps working.
- The film never fails because of one engine layer (graceful degradation).
- Leave a clean extension point for Lottie later.

## Non-Goals

- **Lottie** is explicitly deferred (no good `.json` sourcing decided yet). The
  engine registry must be extensible so Lottie slots in later, but we do not build
  it now.
- No new editor UI for picking engines — engine selection is an LLM decision in the
  blueprint/scene-fill stages.

## Key Architectural Finding

The film is one HyperFrames composition built around a **single master GSAP
timeline** (`tl` / `window.__timelines["main"]`). Each scene is authored in
scene-local time (0 = scene start) and wrapped in an IIFE that maps local positions
to master offsets. HyperFrames seeks that one clock per captured frame.

The new engines do **not** join the GSAP timeline. Each registers on its own global
and HyperFrames seeks all of them to the same time on every frame:

| Engine   | Registration / seek mechanism            | CDN needed     |
| -------- | ---------------------------------------- | -------------- |
| GSAP     | `window.__timelines`                     | already loaded |
| Anime.js | `window.__hfAnime`                       | yes            |
| WAAPI    | `document.getAnimations()` (auto)        | none (native)  |
| Three.js | `hf-seek` events → render at global time | yes            |

This per-global seeking is what makes mixing engines in one composition possible.

> **Assumption to verify in Phase 0:** the HyperFrames version we render with
> actually seeks Three/Anime/WAAPI via these globals. Confirmed by the
> `hf-example/CLAUDE.md` skill list (which documents all four), but must be smoke-
> tested against the pinned version before building the generator.

## Design

### 1. Data model — layers

Extend `SceneFill` with an optional `layers` array. Each scene becomes a stack of
layers, ordered back→front by array index:

```ts
type LayerEngine = "gsap" | "three" | "anime" | "waapi";

type Layer = {
  id: string;          // unique within the scene
  engine: LayerEngine;
  html?: string;       // this layer's DOM (a <canvas> for three)
  css?: string;
  code: string;        // engine-specific JS, scene-local time axis (0 = scene start)
};
```

**Backward compatibility:** when `layers` is absent, fall back to the existing
`contentHtml` + `timeline` fields, treated as a single implicit GSAP layer. Every
existing job row and the critique/improve loop keep working with no migration.

### 2. `buildFilmSkeleton` changes

1. **Engine detection** — scan all fills' layers and collect the set of engines used
   film-wide.
2. **Conditional CDN injection** — emit a `<script>` only for engines actually used
   (three, anime). GSAP stays as-is; WAAPI needs nothing.
3. **Per-layer DOM** — inside each `<section>`, render each layer as
   `<div class="layer" style="z-index:N">…</div>` (a three layer gets a `<canvas>`).
4. **Per-engine code wiring + scene offset:**
   - **GSAP** → unchanged (existing IIFE position-wrapper into the master `tl`).
   - **Anime / WAAPI / Three** → each layer's code registers on its engine global.
     The scene offset is provided through one small runtime helper injected once into
     the skeleton: `__mgSceneClock(sceneId, start, dur)` returns the layer's
     scene-local time and active/inactive state, so layer code stays simple and
     uniform.
5. **Visibility automation** — the existing `autoAlpha` per `#sid` still governs the
   whole `<section>`; layers inherit it.

### 3. Blueprint stage

Add an `engines` recommendation to each per-scene brief (e.g. "scene 1: three for a
particle-field background + gsap for the headline"). The blueprint system prompt
gains: each engine's strengths, when to reach for it, and a **render-budget cap**
(max N three-scenes per film, since Three.js frame capture is the heaviest).

### 4. Scene-fill stage

- Schema returns `layers[]` (in addition to the legacy fields for compat).
- The scene-fill system prompt gains per-engine authoring rules: the registration
  globals, the scene-local time axis, determinism (no `Date.now`, no `Math.random`,
  no network), and the HyperFrames `data-*` contract. Exact rules sourced from the
  HyperFrames docs/skills so they are accurate.
- **Three.js is free-written** by the LLM in this design (pure Approach A), protected
  by graceful degradation below. If Three proves unreliable in practice, we add a
  small library of parameterized recipes (a touch of Approach C) — but not now.

### 5. Lint + graceful degradation

- Extend `lintCompositionHTML` to understand the layer DOM structure and verify
  per-engine registration is present and determinism rules hold.
- The existing per-scene lint retry generalizes to re-fire a failing **layer**.
- **If a layer still fails after retry → drop that layer, keep the rest of the
  scene.** This mirrors the existing "ship the film without audio on failure"
  philosophy. The film never hard-fails because of one engine layer. This is the
  primary safeguard for free-written Three.js.

### 6. Render-path prerequisite

`render.ts` currently runs `npx hyperframes render` — **unpinned, no `--yes`**.
Before building anything, pin it (`npx --yes hyperframes@0.6.6 render`, matching
`hf-example/package.json`) so engines render against a known, tested version, and so
a clean environment can't hang on an install prompt.

## Components & Boundaries

- **`SceneFill` / `Layer` types** (`hyperframes/types.ts` or alongside the schema in
  `llm-director.ts`) — the contract between scene-fill output and the skeleton
  builder. New `layers` field, legacy fields retained.
- **`buildFilmSkeleton`** — deterministic emitter. Owns: engine detection, CDN
  injection, per-layer DOM, the `__mgSceneClock` helper, per-engine registration
  wiring. No LLM.
- **Engine adapters** (new, small per-engine modules) — each knows how to: emit a
  layer's DOM scaffold (e.g. canvas for three), wrap the layer's code with the
  correct global registration + scene-offset, and declare its CDN. `buildFilmSkeleton`
  dispatches to these by `layer.engine`. This is the extension point for Lottie.
- **Blueprint prompt / schema** — recommends engines per scene.
- **Scene-fill prompt / schema** — emits `layers[]`.
- **`lintCompositionHTML`** — validates layers + per-engine rules; drives the
  drop-layer degradation.

## Error Handling

- Layer lint failure after retry → drop the layer, keep the scene.
- Engine adapter receives an unknown engine → skip the layer, log, continue.
- Three.js render-budget cap exceeded in the blueprint → blueprint stage trims extra
  three recommendations down to GSAP before scene-fill.
- All consistent with the pipeline's existing "degrade, never block the film" stance.

## Testing

- **Phase 0 smoke:** hand-written composition per engine + one mixed-engine scene,
  run through `renderScene`, assert an MP4 is produced and (via existing
  `captureScenes`) that frames differ across time (motion is actually present and
  seeked). Lives next to `scripts/smoke-*.ts`.
- **Unit:** `buildFilmSkeleton` emits the correct CDN set + the correct per-engine
  registration for a given `fills` fixture (per engine, and for a mixed scene).
- **Backward-compat unit:** a legacy `SceneFill` (no `layers`) produces a functionally
  identical skeleton to today — same GSAP wiring, same master-timeline registration,
  same rendered result.
- **Degradation unit:** a layer that fails lint is dropped while sibling layers
  survive.

## Phasing (all within Approach A)

- **Phase 0** — pin HyperFrames + smoke-verify Three/Anime/WAAPI are seekable.
- **Phase 1** — layer model + multi-engine emission in `buildFilmSkeleton` + the
  `__mgSceneClock` helper, with **GSAP-only layers** (refactor existing into the
  layer model, zero behavior change). Proves backward compat.
- **Phase 2** — add WAAPI + Anime adapters (code-only engines, low risk).
- **Phase 3** — add Three.js adapter (+ graceful degradation + budget cap).
- **Phase 4** — blueprint + scene-fill prompt/schema changes so the LLM actually
  produces multi-engine layers.

Each phase ships independently and is verifiable on its own.

## Open Questions

- Exact HyperFrames `data-*` / global contract for each engine — to be confirmed
  against the pinned version's docs during Phase 0 (drives the adapter code).
- The numeric render-budget cap `N` for three-scenes — tune after Phase 3 smoke
  timings; start conservative (e.g. 1–2 per film).
