// MotionGlass v0 philosophy — declared opinion compiled to rendering laws.
//
// Each tenet lists its concrete laws (numbers, timings, exclusions). The
// composer reads `PHILOSOPHY.laws` to enforce hard constraints during
// selection and emission. Soft warnings flow through frame-taste.ts.
//
// Laws are tunable but exist. Adding a new law or removing one is a
// philosophy revision (v0 → v1), not a configuration change.

import type { RenderingLaw, Tenet } from "./types";

export const PHILOSOPHY_VERSION = "v0";

// Concrete tunables — referenced by composer/select.ts and composer/emit.ts.
// Changing any of these is a philosophy edit, not a parameter tweak.
export const LAW_CONSTANTS = {
  // weightedInevitability
  primaryAccelerationMaxDelayMs: 80,
  easingMonotonicConvergenceFraction: 0.6,

  // earnedSilence
  sceneOpeningMotionFreeWindowMs: 250,
  typographyClearWindowMs: 600,

  // compressedDepth
  maxSimultaneousDepthLayers: 4,
  minDepthLayerGapFraction: 0.18,
  depthLayerCollisionWindowMs: 200,

  // confidentAsymmetry
  asymmetricLeftFocalXMin: 0.18,
  asymmetricLeftFocalXMax: 0.38,
  dominantNegativeSpaceMinCoverage: 0.55,

  // typographyAsMotion
  textEntryExclusivityMs: 600,
  staggerWordRevealMinMs: 60,
  staggerWordRevealMaxMs: 140,

  // Signature Tension — Tell 1: pre-reveal compression
  preRevealCompressionMinMs: 180,
  preRevealCompressionMaxMs: 260,
  preRevealCompressionAmountMin: 0.08, // 8%
  preRevealCompressionAmountMax: 0.15, // 15%

  // Signature Tension — Tell 2: late-release motion
  lateReleaseExtensionMinMs: 80,
  lateReleaseExtensionMaxMs: 120,

  // Intentional Imperfection — held-frame rule (one scene per film)
  holdSceneFinalHoldMinMs: 200,
  holdSceneFinalHoldMaxMs: 400,

  // Intentional Imperfection — density variance
  minDensityVarianceSigma: 1.2,

  // Creative Rebellion — long-hold variant
  longHoldRebellionMinMs: 500,
  longHoldRebellionMaxMs: 700,

  // Frame-taste budgets
  peakDensityMax: 3,
  meanDensityMax: 1.5,
  primitiveStartCollisionWindowMs: 80,
  microCompressionConvergeWindowMs: 60,
  staggerInterDelayJitterMs: 15,
} as const;

export const LAWS: ReadonlyArray<RenderingLaw> = Object.freeze([
  // weightedInevitability
  {
    id: "WI-1",
    tenet: "weightedInevitability",
    description: `Primary primitive acceleration delay < ${LAW_CONSTANTS.primaryAccelerationMaxDelayMs}ms from scene start.`,
  },
  {
    id: "WI-2",
    tenet: "weightedInevitability",
    description: `Easing must monotonically converge within first ${Math.round(LAW_CONSTANTS.easingMonotonicConvergenceFraction * 100)}% of scene (no late-stage re-acceleration).`,
  },
  {
    id: "WI-3",
    tenet: "weightedInevitability",
    description: `Velocity vectors must not reverse within a scene unless intent === "contrast".`,
  },

  // earnedSilence
  {
    id: "ES-1",
    tenet: "earnedSilence",
    description: `First ${LAW_CONSTANTS.sceneOpeningMotionFreeWindowMs}ms of every scene is motion-free unless slot.isImpact === true.`,
  },
  {
    id: "ES-2",
    tenet: "earnedSilence",
    description: `Typography enter must have ≥ ${LAW_CONSTANTS.typographyClearWindowMs}ms with no competing focal movement.`,
  },
  {
    id: "ES-3",
    tenet: "earnedSilence",
    description: `Scene with kinetic === "breathingHold" has primitive count = 0 — silence is the composition.`,
  },

  // compressedDepth
  {
    id: "CD-1",
    tenet: "compressedDepth",
    description: `Max ${LAW_CONSTANTS.maxSimultaneousDepthLayers} simultaneous depth layers active per frame.`,
  },
  {
    id: "CD-2",
    tenet: "compressedDepth",
    description: `Depth gap between adjacent layers ≥ ${Math.round(LAW_CONSTANTS.minDepthLayerGapFraction * 100)}% of total depth range.`,
  },
  {
    id: "CD-3",
    tenet: "compressedDepth",
    description: `No two primitives may share a depth layer in the same ${LAW_CONSTANTS.depthLayerCollisionWindowMs}ms window unless motif-bound.`,
  },

  // confidentAsymmetry
  {
    id: "CA-1",
    tenet: "confidentAsymmetry",
    description: `asymmetricLeft archetype enforces focal-x in [${LAW_CONSTANTS.asymmetricLeftFocalXMin}, ${LAW_CONSTANTS.asymmetricLeftFocalXMax}] of viewport.`,
  },
  {
    id: "CA-2",
    tenet: "confidentAsymmetry",
    description: `Negative-space coverage ≥ ${Math.round(LAW_CONSTANTS.dominantNegativeSpaceMinCoverage * 100)}% when negativeSpace === "dominant".`,
  },
  {
    id: "CA-3",
    tenet: "confidentAsymmetry",
    description: `No centered focal placement unless intent === "establish_problem" or kinetic === "lockedMomentum".`,
  },

  // typographyAsMotion
  {
    id: "TM-1",
    tenet: "typographyAsMotion",
    description: `When text enters, no other primitive may animate for ${LAW_CONSTANTS.typographyClearWindowMs}ms.`,
  },
  {
    id: "TM-2",
    tenet: "typographyAsMotion",
    description: `staggerWordReveal stagger ∈ [${LAW_CONSTANTS.staggerWordRevealMinMs}ms, ${LAW_CONSTANTS.staggerWordRevealMaxMs}ms]; outside is forbidden.`,
  },
  {
    id: "TM-3",
    tenet: "typographyAsMotion",
    description: `Text opacity must reach 1.0 before any secondary motion begins.`,
  },
]);

export type TenetMap = Record<Tenet, RenderingLaw[]>;

export function lawsByTenet(): TenetMap {
  const map: Partial<TenetMap> = {};
  for (const law of LAWS) {
    (map[law.tenet] ??= []).push(law);
  }
  return map as TenetMap;
}

// ─── Vocabulary ────────────────────────────────────────────────────────────

// Banned in every system prompt and every emitted string.
export const BANNED_VOCABULARY: ReadonlyArray<string> = Object.freeze([
  "premium",
  "cinematic SaaS",
  "glassmorphism",
  "floating card",
  "dashboard",
  "gradient overlay",
  "modern minimal",
  "clean UI",
  "outdoor scenery",
  "fake landscapes",
  "fake photography",
  "atmospheric shot",
  "generic cinematic wording",
]);

// Required in director prompts and reviewer vocabulary.
export const REQUIRED_VOCABULARY: ReadonlyArray<string> = Object.freeze([
  "tension",
  "pacing",
  "spatial rhythm",
  "asymmetry",
  "focal guidance",
  "visual compression",
  "motion cadence",
  "depth velocity",
  "rest weight",
  "counterbalance",
  "eye-flow",
  "focal gravity",
  "breathing room",
  "weighted inevitability",
  "earned silence",
  "compressed depth",
  "confident asymmetry",
]);

// Centralized export for the composer to consume.
export const PHILOSOPHY = {
  version: PHILOSOPHY_VERSION,
  constants: LAW_CONSTANTS,
  laws: LAWS,
  bannedVocabulary: BANNED_VOCABULARY,
  requiredVocabulary: REQUIRED_VOCABULARY,
} as const;
