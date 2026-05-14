// Derives SceneExitState from an AssembledComposition's final beat.
//
// The exit state is what the next scene's planner consumes when
// continuityDNA flags carry. In Sprint 0 only a coarse derivation is
// available because the 3 starting primitives don't expose explicit blur
// or glow tail values; later primitives (blurCarry, glowCarry, etc.) will
// produce richer exit states.

import { getPrimitive } from "../primitives/registry";
import type { AssembledComposition, SceneExitState } from "../types";

export function deriveExitState(comp: AssembledComposition): SceneExitState {
  const prims = comp.resolvedPrimitives;
  if (prims.length === 0) {
    // breathingHold or otherwise silent. No carryover.
    return {
      blur: null,
      velocity: null,
      glow: null,
      motionDirection: null,
      pacing: comp.scene.tension * 0.4, // residual pacing from tension
      rhythm: comp.scene.cadence,
    };
  }

  // Pick the last-resolving primitive (max startAt + duration).
  const last = prims.reduce((a, b) =>
    a.startAt + a.duration >= b.startAt + b.duration ? a : b,
  );
  const lastPrim = getPrimitive(last.primitiveId);

  // Blur carryover: depthShift leaves blur on background layers.
  const blur =
    last.primitiveId === "depthShift"
      ? {
          magnitude: Number(last.params.blurDelta ?? 6) * 0.6,
          direction: "background",
        }
      : null;

  // Velocity carryover: focalCollapse leaves an inbound velocity vector.
  const velocity =
    last.primitiveId === "focalCollapse"
      ? {
          magnitude: Number(last.params.magnitude ?? 0.1),
          vector: String(last.params.direction ?? "centerIn"),
        }
      : null;

  return {
    blur,
    velocity,
    glow: null, // no glow primitives in Sprint 0
    motionDirection: lastPrim.signature.motionVector,
    pacing: clamp01(comp.scene.tension * 0.6 + lastPrim.physics.energyCost * 0.4),
    rhythm: comp.scene.cadence,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
