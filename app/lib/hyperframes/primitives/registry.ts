// Primitive registry + forbidden-name lint.
//
// Atomic primitives only. Forbidden names: any scene-level identifier
// (HeroScene, FeatureScene, CTAImpact, PricingFlow, ...). The lint runs at
// module load and throws if a forbidden name slips in.

import type { Primitive, PrimitiveCategory } from "../types";
import focalCollapse from "./focal-collapse";
import staggerWordReveal from "./stagger-word-reveal";
import depthShift from "./depth-shift";

// Forbidden substrings (case-insensitive). Atomic-verb names like
// `focalCollapse`, `staggerWordReveal`, `depthShift` pass; scene-level
// names like `heroReveal`, `featureScene`, `ctaImpact`, `pricingFlow` fail.
const FORBIDDEN_SUBSTRINGS = [
  "scene",
  "template",
  "hero",
  "feature",
  "pricing",
  "cta",
  "card",
  "page",
  "section",
  "module",
];

function lintPrimitiveId(id: string): void {
  const lower = id.toLowerCase();
  for (const f of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(f)) {
      throw new Error(
        `[primitives/registry] Forbidden primitive id "${id}" — contains scene-level token "${f}". Primitives must be atomic motion verbs.`,
      );
    }
  }
}

const ALL: Primitive[] = [focalCollapse, staggerWordReveal, depthShift];

// Run lint at module load.
for (const p of ALL) lintPrimitiveId(p.id);

export const PRIMITIVES: Readonly<Record<string, Primitive>> = Object.freeze(
  Object.fromEntries(ALL.map((p) => [p.id, p])),
);

export function getPrimitive(id: string): Primitive {
  const p = PRIMITIVES[id];
  if (!p) throw new Error(`Unknown primitive: ${id}`);
  return p;
}

export function listPrimitives(): Primitive[] {
  return Object.values(PRIMITIVES);
}

export function primitivesByCategory(category: PrimitiveCategory): Primitive[] {
  return listPrimitives().filter((p) => p.category === category);
}
