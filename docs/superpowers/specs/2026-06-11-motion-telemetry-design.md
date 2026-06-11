# Motion Telemetry — Design

**Date:** 2026-06-11
**Status:** Approved
**Goal:** Make motion timing, jank, and rhythm *measurable* in the HyperFrames pipeline so the existing critique→refine loop can see and fix them — at zero additional LLM call cost.

## Problem

The LLM director writes raw timing values (durations, easings, delays) directly, and LLMs are mediocre at precise timing. The only motion feedback today is the motion-trail composite — a blended still PNG — which physically cannot show bad easing, teleport jank, dead air, or unsettled endings. Three of the four observed quality problems (timing/rhythm, jank, inconsistency) are invisible to the loop that is supposed to catch them. `frame-taste.ts`, the sub-second evaluator built for the old primitive-composer pipeline, is dead code on the LLM path: it evaluates `resolvedPrimitives`, which raw LLM-written GSAP timelines don't have.

## Constraints (user-set)

- **Zero increase** in LLM calls or refinement rounds. Improvements ride existing calls.
- The LLM keeps writing raw timing freely; deterministic code measures and corrects — this design is the *measurement* half (chosen as the first project; a static auto-correct "Motion Doctor" pass and prompt-side motion grammar are explicitly follow-on work, out of scope here).
- All work committed directly to `main` (user preference).

## Architecture

New module **`app/lib/hyperframes/motion-telemetry.ts`** with four units:

### 1. `sampleSceneMotion(page, opts)`

Runs inside the existing Playwright session used for capture (shares the seek machinery in `thumbnail.ts` — `window.__timelines[key].pause()/.seek(t)` on the master timeline, which drives all four engines: GSAP, Anime, WAAPI, Three).

- Seeks to N evenly spaced timepoints across the scene's master-timeline window: **4 samples/second, clamped to 12–24 per scene**.
- At each timepoint, enumerates **visible elements inside the scene root** (the `[data-composition-id]` section), capped at ~30 elements selected largest-first.
- Records per element per sample: stable selector path, `getBoundingClientRect()` (includes applied transforms), computed `opacity`, visibility.

Output: `SceneMotionSamples` — `{ sceneId, sampleTimesSeconds[], elements: [{ selector, rects[], opacities[] }] }`.

### 2. `computeMotionMetrics(samples)` — pure function

Samples → `MotionMetrics`. All detection from rendered truth, engine-agnostic:

| Metric | Definition |
|---|---|
| **Jank / teleport** | Position delta between adjacent samples that spikes inconsistently with neighboring intervals (element jumps rather than tweens) |
| **Pop-in** | Opacity 0→1 within one interval on a large element |
| **Mechanical motion** | Per moving element: coefficient of variation of speed across its motion window near zero ⇒ linear easing |
| **Dead air %** | Fraction of intervals where no element moves and no opacity changes, excluding the settle window (final 10% of the scene) |
| **Unsettled ending** | Elements still in motion during the final 10% of the scene |
| **Static scene** | % of elements that never move + a total motion-energy scalar |
| **Off-screen / overlap** | Text-bearing elements clipped outside the viewport or colliding at the final sample |

### 3. `renderTelemetryBlock(metrics)` — pure function

Metrics → compact text block (~300–600 tokens) injected into the **existing** per-scene vision-critique call. The `VISION_CRITIQUE_SYSTEM_PROMPT` gains a section explaining the block: *measured, deterministic data from the rendered scene — trust it over the visual read for timing/jank questions*.

### 4. `telemetryGates(metrics)` — pure function

Hard thresholds → synthesized refinement issues that force a scene into the existing refinement set even when the vision critique verdict is `ship`. Stays within the existing refinement-set cap; telemetry-gated scenes take priority within it. No new rounds, no new calls.

## Gate thresholds (initial — tune from real runs)

Hard gates fire only on unambiguous failures:

| Gate | Threshold | Synthesized issue (fed verbatim to refinement) |
|---|---|---|
| Teleport jank | jump >15% of viewport in one interval, inconsistent with neighbor intervals | "element X teleports at ~T s — tween the move or remove the jump" |
| Pop-in | opacity 0→1 in one interval, element >10% of viewport, after the first 300 ms | "element X pops in at ~T s with no transition" |
| Unsettled ending | >2 elements moving in final 10% | "scene ends mid-motion — pull animations forward so the final frame settles" |
| Dead air | >40% of intervals motionless (final settle excluded) | "scene is static from T1–T2 s — add secondary/ambient motion" |
| Fully static | total motion energy ≈ 0 | "nothing animates in this scene" |

Soft signals (mechanical/linear easing, low motion energy, overlaps) appear only in the telemetry text block — the LLM critic weighs them but they never force a verdict. Hard gates are reserved for things that are always wrong; taste stays with the critic.

## Data flow & integration

1. **Capture:** `captureScenes` (`app/lib/jobs.ts`) runs telemetry sampling in the same pass as motion-trail capture → `patchShot` writes metrics to a new **`motion_telemetry JSONB`** column on `shots` (one Supabase migration).
2. **Critique:** `critiqueAndPolishJob` loads per-shot telemetry, passes the rendered block into `generateVisionCritique` (signature gains an optional telemetry-block parameter).
3. **Refinement targeting:** `buildRefinementSet` merges `telemetryGates` issues with critique-driven refinements, respecting the existing cap with telemetry issues prioritized.

## Known limitations

- **Three.js canvas interiors are invisible** to DOM sampling — only the canvas element's rect/opacity is seen. The vision critique still covers canvas content; telemetry covers everything else.
- Sampling resolution (~250 ms at 4 Hz) catches teleports and rhythm but not sub-100 ms micro-timing.

## Error handling

Telemetry is strictly additive and non-fatal at every step:

- Sampling failure → log warning, store `null` (mirrors today's missing-motion-trail handling).
- Missing/`null` telemetry → critique proceeds without the block; gates don't fire.
- A telemetry bug can never block a film.

## Testing

- **Unit (bulk of confidence, no browser):** `computeMotionMetrics` + `telemetryGates` against synthetic sample sets — linear vs eased motion profiles, a teleport, a pop-in, a static scene, a clean settle ending.
- **Integration:** one Playwright test following the existing render-smoke pattern — fixture HTML with a known GSAP tween, assert samples capture the motion and metrics are sane.
- **Snapshot:** `renderTelemetryBlock` output.

## Cost

~1.3 s extra Playwright time per scene (N seeks × ~80 ms flush wait, same session). ~300–600 extra input tokens inside critique calls that already happen. Zero new LLM calls.

## Follow-on work (out of scope)

- **Motion Doctor:** static AST-level auto-correct of LLM-emitted timing (snap easings, clamp durations, inject stagger), informed by which smells telemetry actually observes in production.
- **Motion grammar + filmstrip:** prompt-side beat grammar (anticipation→action→settle) and replacing the blended trail composite with a discrete filmstrip grid for the critique image.
