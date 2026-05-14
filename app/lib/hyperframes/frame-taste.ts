// Frame Taste Layer — sub-second composition evaluation.
//
// Composition-level evaluation (TasteArbitrator) is necessary but not
// sufficient. Apple-level motion lives at 40ms. This module evaluates
// the assembled timeline at sub-second resolution.
//
// Hard laws (gate emission — set hardLawsPassed=false if violated):
//   - Opacity timing (TM-3 — text opacity reaches 1.0 before secondary motion)
//   - Sub-second pacing (no two primitive starts within 80ms unless motif-bound)
//
// Soft warnings (surface, do not block):
//   - Easing curve fit residual against canonical kinetic curve
//   - Spacing delta consistency (stagger inter-element jitter ≤ 15ms)
//   - Micro-compression — final-200ms convergence flag
//   - Frame density per 100ms rolling window (peak ≤ 3, mean ≤ 1.5)

import { LAW_CONSTANTS } from "./philosophy";
import { EASINGS } from "./primitives/easing";
import type {
  AssembledComposition,
  EasingId,
  FrameTasteScorecard,
  KineticState,
  PrimitiveInstance,
} from "./types";

export function evaluateFrameTaste(
  comp: AssembledComposition,
): FrameTasteScorecard {
  const prims = comp.resolvedPrimitives;
  const softWarnings: string[] = [];

  // ─ Hard laws ─────────────────────────────────────────────────────────
  const opacityTimingOk = checkOpacityTiming(prims, softWarnings);
  const subSecondPacingOk = checkSubSecondPacing(prims, softWarnings);

  // ─ Soft scores ───────────────────────────────────────────────────────
  const easingCurveFit = scoreEasingFit(prims, comp.scene.kinetic, softWarnings);
  const spacingDeltaConsistency = scoreSpacingDelta(prims, softWarnings);
  const microCompression = scoreMicroCompression(prims, softWarnings);
  const density = computeFrameDensity(prims, comp.emittedDuration);

  if (density.peak > LAW_CONSTANTS.peakDensityMax) {
    softWarnings.push(
      `peak frame density ${density.peak} > ${LAW_CONSTANTS.peakDensityMax}`,
    );
  }
  if (density.mean > LAW_CONSTANTS.meanDensityMax) {
    softWarnings.push(
      `mean frame density ${density.mean.toFixed(2)} > ${LAW_CONSTANTS.meanDensityMax}`,
    );
  }

  const hardLawsPassed = opacityTimingOk && subSecondPacingOk;

  return {
    easingCurveFit,
    opacityTimingOk,
    spacingDeltaConsistency,
    subSecondPacingOk,
    microCompression,
    frameDensityPeak: density.peak,
    frameDensityMean: density.mean,
    hardLawsPassed,
    softWarnings,
  };
}

// ─── Hard law: opacity timing ────────────────────────────────────────────
// TM-3 — text opacity must reach 1.0 before any secondary motion begins.
// We infer "text reveal complete" as: staggerWordReveal startAt + duration.
// Secondary motion = any non-typography primitive starting strictly after
// text reveal starts but before text reveal completes.

function checkOpacityTiming(
  prims: PrimitiveInstance[],
  warnings: string[],
): boolean {
  const text = prims.filter((p) => p.primitiveId === "staggerWordReveal");
  if (text.length === 0) return true;
  let ok = true;
  for (const t of text) {
    const completeAt = t.startAt + t.duration;
    for (const p of prims) {
      if (p === t) continue;
      if (p.primitiveId === "staggerWordReveal") continue;
      // p starts after text starts but before text finishes → competing focus
      if (p.startAt > t.startAt + 0.001 && p.startAt < completeAt - 0.001) {
        warnings.push(
          `TM-3: primitive "${p.primitiveId}" starts at ${p.startAt}s during text reveal (${t.startAt}..${completeAt}s)`,
        );
        ok = false;
      }
    }
  }
  return ok;
}

// ─── Hard law: sub-second pacing ─────────────────────────────────────────
// No two primitive starts within 80ms unless motif-bound. For Sprint 0
// no primitive is motif-bound; the check is unconditional.

function checkSubSecondPacing(
  prims: PrimitiveInstance[],
  warnings: string[],
): boolean {
  const starts = prims.map((p) => p.startAt).sort((a, b) => a - b);
  const minGapS = LAW_CONSTANTS.primitiveStartCollisionWindowMs / 1000;
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap < minGapS) {
      warnings.push(
        `sub-second pacing: starts ${starts[i - 1].toFixed(3)}s and ${starts[i].toFixed(3)}s are ${Math.round(gap * 1000)}ms apart (< ${LAW_CONSTANTS.primitiveStartCollisionWindowMs}ms)`,
      );
      return false;
    }
  }
  return true;
}

// ─── Soft: easing curve fit against canonical kinetic ────────────────────

function scoreEasingFit(
  prims: PrimitiveInstance[],
  kinetic: KineticState,
  warnings: string[],
): number {
  if (prims.length === 0) return 1;
  let total = 0;
  let count = 0;
  for (const p of prims) {
    const ez = (p.params.easing as EasingId | undefined) ?? "power3.inOut";
    const def = EASINGS[ez];
    if (!def) continue;
    const fit = def.kineticFit[kinetic] ?? 0.3;
    if (fit < 0.4) {
      warnings.push(
        `easing "${ez}" weakly fits kinetic "${kinetic}" on primitive ${p.primitiveId}`,
      );
    }
    total += fit;
    count++;
  }
  return count === 0 ? 1 : total / count;
}

// ─── Soft: stagger spacing delta consistency ─────────────────────────────

function scoreSpacingDelta(
  prims: PrimitiveInstance[],
  warnings: string[],
): number {
  const stags = prims.filter((p) => p.primitiveId === "staggerWordReveal");
  if (stags.length === 0) return 1;
  // For Sprint 0 only one staggerWordReveal expected; check stagger ms is
  // tight around its declared value (no jitter to evaluate). Future: when
  // multiple stagger primitives exist, compare inter-stagger jitter.
  let score = 1;
  for (const s of stags) {
    const stagger = Number(s.params.staggerMs);
    if (stagger < LAW_CONSTANTS.staggerWordRevealMinMs + LAW_CONSTANTS.staggerInterDelayJitterMs) {
      // near the low edge — acceptable
    }
    if (!Number.isFinite(stagger)) {
      warnings.push(`staggerWordReveal staggerMs is not finite`);
      score = 0;
    }
  }
  return score;
}

// ─── Soft: micro-compression ─────────────────────────────────────────────
// Each primitive's final 200ms must converge (delta velocity → 0 within
// 60ms of its end). expoOut + power3.inOut + customCubic1 all converge
// cleanly when sampled; we score by easing identity.

function scoreMicroCompression(
  prims: PrimitiveInstance[],
  warnings: string[],
): number {
  if (prims.length === 0) return 1;
  let total = 0;
  for (const p of prims) {
    const ez = (p.params.easing as EasingId | undefined) ?? "power3.inOut";
    // All v0 easings converge. Score = 0.95 for power3.inOut, 1.0 for
    // expoOut, 0.85 for customCubic1 (slight overshoot).
    const sc =
      ez === "expoOut" ? 1.0 : ez === "power3.inOut" ? 0.95 : 0.85;
    if (sc < 0.9) {
      warnings.push(
        `micro-compression: easing "${ez}" on ${p.primitiveId} may not fully converge in final 60ms`,
      );
    }
    total += sc;
  }
  return total / prims.length;
}

// ─── Frame density per 100ms window ──────────────────────────────────────

function computeFrameDensity(
  prims: PrimitiveInstance[],
  emittedDuration: number,
): { peak: number; mean: number } {
  if (prims.length === 0) return { peak: 0, mean: 0 };
  const win = 0.1; // seconds
  const steps = Math.max(1, Math.ceil(emittedDuration / win));
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * win;
    let active = 0;
    for (const p of prims) {
      if (p.startAt <= t + win && p.startAt + p.duration >= t) active++;
    }
    if (active > peak) peak = active;
    sum += active;
  }
  return { peak, mean: sum / steps };
}
