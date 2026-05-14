// MotionGlass — HyperFrames type system.
//
// The LLM emits intent/tension/cadence/kinetic + DNA + rhythm + motifs (Director
// types). The deterministic composer reads those + film/motif memory + arbitrator
// weights and produces a CompositionPlan → LayoutTopology → AssembledComposition
// → SceneFiles. Code emission is mechanical.

// ─── Director / Storyboard ─────────────────────────────────────────────────

export type Intent =
  | "introduce"
  | "establish_problem"
  | "contrast"
  | "reveal"
  | "deepen"
  | "release"
  | "conclude";

export type Cadence =
  | "staccato"
  | "legato"
  | "syncopated"
  | "sustained"
  | "interrupted";

export type KineticState =
  | "lockedMomentum"
  | "unstableGravity"
  | "releaseDecay"
  | "pressureBuild"
  | "breathingHold";

export type CadenceMode =
  | "slow_build_then_release"
  | "staccato_pulse"
  | "ebb_flow";

export type ContinuityMode = "carry" | "break" | "invert" | "decay";

export type NegativeSpace = "dominant" | "balanced" | "compressed" | "absent";

export type RevealTiming =
  | "anticipatory"
  | "synchronous"
  | "delayed"
  | "interrupting";

export type EasingId = "power3.inOut" | "expoOut" | "customCubic1";

export type Archetype =
  | "asymmetricLeft"
  | "centeredCompressed"
  | "layeredDepth";

export type AspectRatio = "16:9";

export type MotionDNA = {
  energy: number; // 0..1
  cadence: Cadence;
  continuityMode: ContinuityMode;
  transitionVector: string;
  motionDensity: number; // 0..1
};

export type CompositionDNA = {
  asymmetry: number; // 0..1
  negativeSpace: NegativeSpace;
  depthLayers: number; // integer 1..6
  focalPath: string;
  visualCompression: number; // 0..1
};

export type TypographyDNA = {
  revealTiming: RevealTiming;
  rhythm: string;
  weightDistribution: string;
};

export type ContinuityDNA = {
  carryBlur: boolean;
  carryVelocity: boolean;
  carryGlow: boolean;
  carryMotionDirection: boolean;
};

export type SceneText = {
  headline: string;
  placement: string;
  animation: string;
};

export type FilmRhythm = {
  energyCurve: number[]; // per-scene normalized 0..1
  restMoments: number[]; // absolute seconds
  impactMoments: number[];
  releaseMoments: number[];
  cadenceMode: CadenceMode;
};

export type RhythmSlot = {
  energy: number;
  isRest: boolean;
  isImpact: boolean;
  isRelease: boolean;
  cadenceShift: number; // energy[i] - energy[i-1]
};

export type Scene = {
  id: string;
  duration: number;
  voiceover: string;
  goal: string;
  visualConcept: string;
  assets: string[];

  intent: Intent;
  tension: number; // 0..1
  cadence: Cadence;
  kinetic: KineticState;

  motionDNA: MotionDNA;
  compositionDNA: CompositionDNA;
  typographyDNA: TypographyDNA;
  continuityDNA: ContinuityDNA;

  text: SceneText;

  rhythmSlot?: RhythmSlot; // set by RhythmEngine after director output
};

export type StoryboardStyle = {
  visualTone: string;
  palette: string[];
  typography: string;
  motionLanguage: string;
  avoid: string[];
};

export type MotionSignature = {
  primitiveIds: string[];
  motionVector: string;
  focalPath: string;
  easingIds: EasingId[];
};

export type MotifVariation = "softer" | "harder" | "inverted" | "release";

export type PlannedRecall = {
  sceneIndex: number;
  variation: MotifVariation;
};

export type MotifDeclaration = {
  id: string;
  name: string;
  signature?: MotionSignature; // instantiated when first selected
  plannedRecalls: PlannedRecall[];
};

export type Storyboard = {
  title: string;
  duration: number;
  aspectRatio: AspectRatio;
  width: 1920;
  height: 1080;
  style: StoryboardStyle;
  rhythm: FilmRhythm;
  motifs: MotifDeclaration[];
  scenes: Scene[];
};

// ─── Primitives ────────────────────────────────────────────────────────────

export type PrimitiveCategory =
  | "blur"
  | "glow"
  | "depth"
  | "motion"
  | "typography"
  | "camera"
  | "easing";

export type PrimitivePhysics = {
  visualWeight: number; // 0..1
  energyCost: number; // 0..1
  attentionCost: number; // 0..1
  complexityCost: number; // 0..1
  aggressiveness: number; // 0..1
  readabilityImpact: number; // -1..1; negative = harms readability
  philosophyAlignment: number; // 0..1; v0 MotionGlass philosophy
  kineticAffinity: Partial<Record<KineticState, number>>; // 0..1 per kinetic
};

export type ParamSpec = {
  type: "number" | "enum" | "string" | "boolean";
  range?: [number, number];
  enum?: readonly string[];
  default: number | string | boolean;
};

export type PrimitiveSignature = {
  category: PrimitiveCategory;
  motionVector: "static" | "left" | "right" | "up" | "down" | "diagonal" | "in" | "out" | "radial";
  topology: "single" | "stagger" | "cascade" | "wipe";
  durationBucket: "short" | "medium" | "long";
};

export type SelectorRef = string; // a CSS selector resolved at emit time

export type Primitive = {
  id: string; // atomic verb (lint enforced)
  category: PrimitiveCategory;
  params: Record<string, ParamSpec>;
  physics: PrimitivePhysics;
  signature: PrimitiveSignature;
  /** Optional CSS contribution (resolved at emit time). */
  css?: (params: Record<string, unknown>) => string;
  /** Required JS fragment that registers a GSAP timeline contribution. */
  js: (
    params: Record<string, unknown>,
    target: SelectorRef,
    timelineVar: string,
    startAt: number,
  ) => string;
};

export type PrimitiveInstance = {
  primitiveId: string;
  params: Record<string, unknown>;
  target: SelectorRef;
  startAt: number; // seconds into scene
  duration: number; // seconds; final emitted duration may be extended by Tell 2
};

// ─── Composition pipeline ─────────────────────────────────────────────────

export type LayoutNodeId = string;

export type LayoutNode = {
  id: LayoutNodeId;
  tag: "div" | "section" | "h1" | "p" | "span";
  classList: string[];
  /** Spatial placement in normalized 0..1 viewport units. */
  position: { x: number; y: number; width: number; height: number };
  depthLayer: number; // 0..5
  zIndex: number;
  textContent?: string;
  children: LayoutNode[];
};

export type LayoutTopology = {
  archetype: Archetype;
  root: LayoutNode;
  /** Eye-flow path through node ids. */
  eyeFlow: LayoutNodeId[];
  /** Focal gravity center in normalized 0..1 viewport units. */
  focalCenter: { x: number; y: number };
  /** Tension zones (high-motion regions). */
  tensionZones: { x: number; y: number; width: number; height: number }[];
  /** Computed at composition time. */
  negativeSpaceCoverage: number; // 0..1 (fraction of viewport empty)
  readingFlow: "leftToRight" | "centerOut" | "diagonal";
};

export type CompositionPlan = {
  sceneId: string;
  archetype: Archetype;
  primitives: PrimitiveInstance[];
  /** Set of beat timestamps (seconds) at which timeline transitions occur. */
  beats: number[];
  /** The chosen continuity carryovers from the previous scene's exit state. */
  carryovers: {
    blur: boolean;
    velocity: boolean;
    glow: boolean;
    motionDirection: boolean;
  };
  /** Motif callback metadata if this composition instantiates / recalls a motif. */
  motifCallback?: {
    motifId: string;
    variation: MotifVariation | "introduce";
  };
  /** Records that the rebellion budget fired and which rule was broken. */
  rebellion?: {
    kind: RebellionKind;
    sceneId: string;
  };
  /** When true, this scene is the film's hold-scene (Intentional Imperfection). */
  isHoldScene: boolean;
};

export type AssembledComposition = {
  scene: Scene;
  topology: LayoutTopology;
  plan: CompositionPlan;
  /** Final z-ordered primitive instances, with timing resolved. */
  resolvedPrimitives: PrimitiveInstance[];
  /** Total emitted duration, including Tell 2 extension and any held-frame tail. */
  emittedDuration: number;
  /** When true, Tell 1 wrap (pre-reveal compression) is applied around the reveal target. */
  applyPreRevealCompression: boolean;
  /** Tell 2 late-release extension in seconds. Constant for v0: 0.08..0.12. */
  lateReleaseExtension: number;
  /** Held-frame tail in seconds (only set on the hold scene). */
  heldFrameTail: number;
};

export type SceneFiles = {
  html: string;
  css: string;
  js: string;
};

export type SceneExitState = {
  blur: { magnitude: number; direction: string } | null;
  velocity: { magnitude: number; vector: string } | null;
  glow: { intensity: number; color: string } | null;
  motionDirection: string | null;
  pacing: number; // 0..1
  rhythm: string;
};

// ─── Budgets & rebellion ──────────────────────────────────────────────────

export type Budgets = {
  attention: number;
  motion: number;
  complexity: number;
};

export type RebellionKind =
  | "bypass_law"
  | "exceed_budget"
  | "force_saturated_primitive"
  | "long_hold"
  | "early_motion";

export type DeviationBudget = {
  used: boolean;
  spentOnSceneId: string | null;
  kind: RebellionKind | null;
};

// ─── Memory ───────────────────────────────────────────────────────────────

export type FilmMemoryState = {
  primitiveUseCount: Record<string, number>;
  categoryUseCount: Record<PrimitiveCategory, number>;
  motionVectorHistogram: Record<string, number>;
  compositionShapeHistogram: Record<string, number>;
  focalPathHistogram: Record<string, number>;
  transitionVectorHistogram: Record<string, number>;
  easingUseCount: Record<EasingId, number>;
  typographyRhythmCount: Record<string, number>;
  archetypeUseCount: Record<Archetype, number>;
};

export type MotifMemoryState = {
  /** Declared motifs, with their materialized signatures once introduced. */
  motifs: MotifDeclaration[];
  /** Which scene indexes have executed each motif's planned recalls. */
  executedRecalls: Record<string, number[]>;
};

// ─── Quality / scoring ────────────────────────────────────────────────────

export type SimilarityAxes = {
  dom: number;
  layout: number;
  timeline: number;
  typography: number;
  palette: number;
  motionPattern: number;
  filmCumulative: number;
};

export type SimilarityResult = {
  aggregate: number;
  axes: SimilarityAxes;
  flagged: boolean;
  matchedMotif: boolean;
};

export type TasteScorecard = {
  motionOverload: number;
  attentionOverload: number;
  simultaneousEffectsExcess: number;
  typographyPressure: number;
  focalInstability: number;
  visualDensity: number;
  pacingNoise: number;
  easingInconsistency: number;
  categoryAbuse: number;
  transitionAggression: number;
  totalUnderBudget: boolean;
};

export type FrameTasteScorecard = {
  easingCurveFit: number; // 0..1; lower = worse fit
  opacityTimingOk: boolean; // hard law
  spacingDeltaConsistency: number; // 0..1
  subSecondPacingOk: boolean; // hard law (no two starts within 80ms)
  microCompression: number; // 0..1
  frameDensityPeak: number; // count
  frameDensityMean: number;
  hardLawsPassed: boolean;
  softWarnings: string[];
};

// ─── Rendering laws (declarative summary) ─────────────────────────────────
// Actual enforcement lives in composer/select.ts and composer/emit.ts.
// This list is for inspection / logging / debugging.

export type Tenet =
  | "weightedInevitability"
  | "earnedSilence"
  | "compressedDepth"
  | "confidentAsymmetry"
  | "typographyAsMotion";

export type RenderingLaw = {
  id: string;
  tenet: Tenet;
  description: string;
};

// ─── Arbitration ──────────────────────────────────────────────────────────

export type ArbitrationWeights = {
  rhythm: number;
  continuity: number;
  readability: number;
  motionIntensity: number;
  layout: number;
  filmMemory: number;
  motif: number;
  philosophy: number;
  kinetic: number;
};

export type HardConstraint =
  | { kind: "mustInclude"; category: PrimitiveCategory; reason: string }
  | { kind: "mustExclude"; primitiveId: string; reason: string }
  | { kind: "boundParam"; primitiveId: string; param: string; range: [number, number]; reason: string };

export type LayoutBias = {
  preferredArchetype?: Archetype;
  forceNegativeSpace?: NegativeSpace;
  focalRegion?: { x: number; y: number; radius: number };
};

export type ArbitrationResult = {
  weights: ArbitrationWeights;
  hardConstraints: HardConstraint[];
  layoutBias: LayoutBias;
};
