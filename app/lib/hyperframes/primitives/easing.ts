// Easing curve registry. Each easing has:
//   - id (used in CompositionPlan)
//   - gsapName (passed to GSAP at emit time)
//   - sample(t): 0..1 → 0..1 (for frame-taste evaluator's curve-fit check)
//   - kineticFit: which kinetic states this easing matches well
//
// Adding an easing requires a philosophy revision, not a config change.

import type { EasingId, KineticState } from "../types";

export type EasingDef = {
  id: EasingId;
  gsapName: string;
  sample: (t: number) => number; // t in 0..1
  kineticFit: Partial<Record<KineticState, number>>; // 0..1 per kinetic
};

// power3.inOut — smooth symmetric s-curve. GSAP power3.inOut formula:
//   t < 0.5 ?  4*t^3
//          : 1 - ((-2*t + 2)^3)/2
function sampleP3InOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.5) return 4 * t * t * t;
  const u = -2 * t + 2;
  return 1 - (u * u * u) / 2;
}

// expoOut — sharp out, near-instant rise. GSAP expoOut: 1 - 2^(-10t).
function sampleExpoOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(2, -10 * t);
}

// customCubic1 — anticipatory back-out (slight overshoot then settle).
// Mirrors cubic-bezier(0.34, 1.56, 0.64, 1). Approximated parametrically.
function sampleCustomCubic1(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export const EASINGS: Record<EasingId, EasingDef> = {
  "power3.inOut": {
    id: "power3.inOut",
    gsapName: "power3.inOut",
    sample: sampleP3InOut,
    kineticFit: {
      pressureBuild: 0.9,
      releaseDecay: 0.7,
      breathingHold: 0.6, // no motion runs, but if it did, this is the calm shape
    },
  },
  expoOut: {
    id: "expoOut",
    gsapName: "expo.out",
    sample: sampleExpoOut,
    kineticFit: {
      lockedMomentum: 0.95,
      releaseDecay: 0.6,
    },
  },
  customCubic1: {
    id: "customCubic1",
    gsapName: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    sample: sampleCustomCubic1,
    kineticFit: {
      unstableGravity: 0.9,
      lockedMomentum: 0.4,
    },
  },
};

export function listEasings(): EasingDef[] {
  return Object.values(EASINGS);
}

export function easingForKinetic(kinetic: KineticState): EasingId {
  // Deterministic pick: highest kineticFit value. Tie-breaker: id alpha order.
  let best: { id: EasingId; fit: number } | null = null;
  for (const def of Object.values(EASINGS)) {
    const fit = def.kineticFit[kinetic] ?? 0;
    if (best === null || fit > best.fit || (fit === best.fit && def.id < best.id)) {
      best = { id: def.id, fit };
    }
  }
  return best!.id;
}

// Canonical curve samples used by frame-taste.ts to score easing-curve fit.
// 10 samples evenly spaced across the easing.
export function canonicalSamples(easingId: EasingId, n = 10): number[] {
  const def = EASINGS[easingId];
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    out.push(def.sample(i / n));
  }
  return out;
}
