// Per-scene budgets — attention, motion, complexity.
//
// Budgets are derived deterministically from the scene's tension, rhythm
// slot, and kinetic state. The composer consumes primitives by deducting
// each primitive's physics costs from the running budgets; selection stops
// when budgets are exhausted (silence-first principle).

import type { Budgets, Scene, RhythmSlot, KineticState } from "./types";

// Base capacities at neutral (tension=0.5, mid-energy slot, lockedMomentum).
const BASE_ATTENTION = 1.6;
const BASE_MOTION = 1.4;
const BASE_COMPLEXITY = 1.3;

// Kinetic multipliers — breathingHold collapses everything to zero.
const KINETIC_MULT: Record<KineticState, { attention: number; motion: number; complexity: number }> = {
  lockedMomentum: { attention: 1.0, motion: 1.05, complexity: 0.95 },
  unstableGravity: { attention: 1.05, motion: 1.15, complexity: 1.1 },
  releaseDecay: { attention: 0.85, motion: 0.85, complexity: 0.9 },
  pressureBuild: { attention: 1.1, motion: 1.0, complexity: 1.15 },
  breathingHold: { attention: 0, motion: 0, complexity: 0 },
};

export function computeBudgets(scene: Scene, slot: RhythmSlot): Budgets {
  if (scene.kinetic === "breathingHold") {
    return { attention: 0, motion: 0, complexity: 0 };
  }

  const tension = clamp01(scene.tension);
  const energy = clamp01(slot.energy);

  // Tension scales attention (high tension demands more visual concentration).
  const tensionFactor = 0.6 + tension * 0.8; // 0.6..1.4
  // Energy scales motion budget.
  const energyFactor = 0.5 + energy * 1.0; // 0.5..1.5
  // Complexity follows energy but is dampened by rest moments.
  const complexityFactor = slot.isRest ? 0.5 : 0.7 + energy * 0.6;

  const km = KINETIC_MULT[scene.kinetic];

  return {
    attention: BASE_ATTENTION * tensionFactor * km.attention,
    motion: BASE_MOTION * energyFactor * km.motion,
    complexity: BASE_COMPLEXITY * complexityFactor * km.complexity,
  };
}

export function deductBudgets(
  current: Budgets,
  costs: { attention: number; motion: number; complexity: number },
): Budgets {
  return {
    attention: current.attention - costs.attention,
    motion: current.motion - costs.motion,
    complexity: current.complexity - costs.complexity,
  };
}

export function budgetsExhausted(b: Budgets, threshold = 0.0): boolean {
  return b.attention <= threshold || b.motion <= threshold || b.complexity <= threshold;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
