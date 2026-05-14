// Pure assembler: binds primitives onto topology and resolves Tells.
//
// AssembledComposition is the input to emit.ts. It declares:
//   - applyPreRevealCompression (Tell 1) for reveal-bearing scenes
//   - lateReleaseExtension (Tell 2) for every non-silent scene
//   - heldFrameTail (Intentional Imperfection — held-frame rule) on the
//     designated hold scene
// emit.ts mechanically translates this into HTML/CSS/JS.

import { LAW_CONSTANTS } from "../philosophy";
import type {
  AssembledComposition,
  CompositionPlan,
  LayoutTopology,
  Scene,
  SceneExitState,
} from "../types";

export type AssembleArgs = {
  scene: Scene;
  topology: LayoutTopology;
  plan: CompositionPlan;
  prevExit?: SceneExitState | null;
};

export function assemble(args: AssembleArgs): AssembledComposition {
  const { scene, topology, plan, prevExit } = args;

  // Resolve z-order: primitives keep the order given by the plan (the
  // selector is the source of truth for stacking). Continuity adjustments
  // — e.g. velocityCarry — would be threaded here when those primitives
  // exist; for Sprint 0 we honor prevExit by passing it through unchanged.
  void prevExit;

  const resolvedPrimitives = plan.primitives.map((p) => ({ ...p }));

  // Tell 1 — pre-reveal compression: applies if any primitive in the plan
  // is a reveal-bearing primitive starting in the first half of the scene.
  const applyPreRevealCompression = resolvedPrimitives.some(
    (p) => isRevealPrimitive(p.primitiveId) && p.startAt < scene.duration * 0.5,
  );

  // Tell 2 — late-release: every scene that has any motion extends its
  // last primitive's effective duration by this delta. breathingHold
  // scenes (zero primitives) get no extension.
  const lateReleaseExtension =
    resolvedPrimitives.length === 0
      ? 0
      : pickMs(
          LAW_CONSTANTS.lateReleaseExtensionMinMs,
          LAW_CONSTANTS.lateReleaseExtensionMaxMs,
          scene.id,
        ) / 1000;

  // Held-frame rule: only the designated hold scene carries a long tail.
  const heldFrameTail = plan.isHoldScene
    ? pickMs(
        LAW_CONSTANTS.holdSceneFinalHoldMinMs,
        LAW_CONSTANTS.holdSceneFinalHoldMaxMs,
        scene.id,
      ) / 1000
    : 0;

  const emittedDuration = scene.duration + lateReleaseExtension + heldFrameTail;

  return {
    scene,
    topology,
    plan,
    resolvedPrimitives,
    emittedDuration,
    applyPreRevealCompression,
    lateReleaseExtension,
    heldFrameTail,
  };
}

function isRevealPrimitive(id: string): boolean {
  return id === "staggerWordReveal" || id === "focalCollapse";
}

// Deterministic pick within a closed integer range, seeded by string.
// Used for Tell 2 (80–120ms) and held-frame (200–400ms) so the same scene
// id always yields the same emitted duration.
function pickMs(minMs: number, maxMs: number, seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const span = maxMs - minMs;
  const norm = (h >>> 0) % (span + 1);
  return minMs + norm;
}
