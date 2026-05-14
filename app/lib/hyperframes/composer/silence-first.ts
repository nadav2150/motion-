// Silence-first composer skeleton.
//
// In Sprint 0 this is the minimal contract; the selector that produces
// candidate scores from DNA / kinetic / slot / arbitration weights lands
// in composer/select.ts during Sprint 1.
//
// Contract: candidates arrive scored. The composer adds them, in
// descending justification score, only if:
//   - score > justification threshold, AND
//   - all three budget axes remain ≥ 0 after deducting this primitive's
//     physics costs.
// Silence (zero primitives) is a valid output and never coerced upward.

import { deductBudgets, budgetsExhausted } from "../budgets";
import { getPrimitive } from "../primitives/registry";
import type { Budgets, PrimitiveInstance, RhythmSlot, Scene } from "../types";

export type SilenceFirstCandidate = {
  primitiveId: string;
  params: Record<string, unknown>;
  target: string;
  startAt: number;
  duration: number;
  justificationScore: number; // 0..1 — caller computes
  hardConstraintSatisfier?: boolean; // when true, included regardless of threshold
};

export type SilenceFirstResult = {
  selected: PrimitiveInstance[];
  remainingBudgets: Budgets;
  rejected: { candidate: SilenceFirstCandidate; reason: "low_score" | "budget_exhausted" }[];
};

const DEFAULT_THRESHOLD = 0.3;

export function compose(args: {
  scene: Scene;
  slot: RhythmSlot;
  candidates: SilenceFirstCandidate[];
  budgets: Budgets;
  justificationThreshold?: number;
}): SilenceFirstResult {
  const { scene, candidates, budgets } = args;
  const threshold = args.justificationThreshold ?? DEFAULT_THRESHOLD;

  // ES-3 hard law: breathingHold scenes are silent. No primitives, period.
  if (scene.kinetic === "breathingHold") {
    return {
      selected: [],
      remainingBudgets: budgets,
      rejected: candidates.map((c) => ({ candidate: c, reason: "low_score" as const })),
    };
  }

  // Hard constraints first, then descending score.
  const ordered = [...candidates].sort((a, b) => {
    if (!!b.hardConstraintSatisfier !== !!a.hardConstraintSatisfier) {
      return b.hardConstraintSatisfier ? 1 : -1;
    }
    return b.justificationScore - a.justificationScore;
  });

  const selected: PrimitiveInstance[] = [];
  const rejected: SilenceFirstResult["rejected"] = [];
  let running: Budgets = { ...budgets };

  for (const c of ordered) {
    const prim = getPrimitive(c.primitiveId);

    if (!c.hardConstraintSatisfier && c.justificationScore < threshold) {
      rejected.push({ candidate: c, reason: "low_score" });
      continue;
    }

    const next = deductBudgets(running, {
      attention: prim.physics.attentionCost,
      motion: prim.physics.energyCost,
      complexity: prim.physics.complexityCost,
    });

    if (!c.hardConstraintSatisfier && budgetsExhausted(next, -0.01)) {
      rejected.push({ candidate: c, reason: "budget_exhausted" });
      continue;
    }

    selected.push({
      primitiveId: c.primitiveId,
      params: c.params,
      target: c.target,
      startAt: c.startAt,
      duration: c.duration,
    });
    running = next;
  }

  return { selected, remainingBudgets: running, rejected };
}
