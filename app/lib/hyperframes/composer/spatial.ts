// Spatial Intelligence Layer.
//
// Three archetypes (asymmetricLeft, centeredCompressed, layeredDepth) wrap
// the explicit spatial concepts the system commits to: eye-flow, focal
// gravity, negative-space balancing, density rhythm, reading flow. The
// archetypes are deterministic — no random placement, no hash-seeded
// scatter. Every coordinate decision is the resolution of a stated rule.

import { LAW_CONSTANTS } from "../philosophy";
import type {
  Archetype,
  LayoutBias,
  LayoutNode,
  LayoutTopology,
  Scene,
  RhythmSlot,
} from "../types";

export function composeLayout(
  archetype: Archetype,
  scene: Scene,
  slot: RhythmSlot,
  bias: LayoutBias = {},
): LayoutTopology {
  if (bias.preferredArchetype) archetype = bias.preferredArchetype;

  switch (archetype) {
    case "asymmetricLeft":
      return composeAsymmetricLeft(scene, slot, bias);
    case "centeredCompressed":
      return composeCenteredCompressed(scene, slot, bias);
    case "layeredDepth":
      return composeLayeredDepth(scene, slot, bias);
  }
}

// ─── asymmetricLeft ────────────────────────────────────────────────────────
//   Focal placement: focal-x in [0.18, 0.38]. Confident asymmetry.
//   Reading flow: left → right. Negative space concentrated on right.
function composeAsymmetricLeft(
  scene: Scene,
  slot: RhythmSlot,
  bias: LayoutBias,
): LayoutTopology {
  const focalX = clamp(
    bias.focalRegion?.x ?? 0.28,
    LAW_CONSTANTS.asymmetricLeftFocalXMin,
    LAW_CONSTANTS.asymmetricLeftFocalXMax,
  );
  const focalY = 0.42;

  const root: LayoutNode = {
    id: "stage",
    tag: "div",
    classList: ["mg-stage", "mg-asymmetric-left"],
    position: { x: 0, y: 0, width: 1, height: 1 },
    depthLayer: 0,
    zIndex: 0,
    children: [
      {
        id: "background",
        tag: "div",
        classList: ["mg-background"],
        position: { x: 0, y: 0, width: 1, height: 1 },
        depthLayer: 3,
        zIndex: -10,
        children: [],
      },
      {
        id: "focal",
        tag: "section",
        classList: ["mg-focal"],
        position: { x: focalX - 0.18, y: focalY - 0.12, width: 0.36, height: 0.32 },
        depthLayer: 0,
        zIndex: 10,
        children: [
          {
            id: "headline",
            tag: "h1",
            classList: ["mg-headline"],
            position: { x: 0, y: 0, width: 1, height: 1 },
            depthLayer: 0,
            zIndex: 11,
            textContent: scene.text.headline,
            children: [],
          },
        ],
      },
      satellite("sat0", 0, 0.72, 0.22),
      satellite("sat1", 1, 0.66, 0.66),
      satellite("sat2", 2, 0.84, 0.4),
    ],
  };

  const negativeSpace = computeNegativeSpace(root);
  return {
    archetype: "asymmetricLeft",
    root,
    eyeFlow: ["focal", "headline", "sat0"],
    focalCenter: { x: focalX, y: focalY },
    tensionZones: [{ x: focalX - 0.1, y: focalY - 0.1, width: 0.2, height: 0.2 }],
    negativeSpaceCoverage: negativeSpace,
    readingFlow: "leftToRight",
  };
}

// ─── centeredCompressed ───────────────────────────────────────────────────
//   Focal placement: center. Reading flow: center-out. Used only when
//   intent === "establish_problem" OR kinetic === "lockedMomentum" (per CA-3).
function composeCenteredCompressed(
  scene: Scene,
  slot: RhythmSlot,
  bias: LayoutBias,
): LayoutTopology {
  const focalX = 0.5;
  const focalY = 0.5;

  const root: LayoutNode = {
    id: "stage",
    tag: "div",
    classList: ["mg-stage", "mg-centered-compressed"],
    position: { x: 0, y: 0, width: 1, height: 1 },
    depthLayer: 0,
    zIndex: 0,
    children: [
      {
        id: "background",
        tag: "div",
        classList: ["mg-background"],
        position: { x: 0, y: 0, width: 1, height: 1 },
        depthLayer: 3,
        zIndex: -10,
        children: [],
      },
      {
        id: "focal",
        tag: "section",
        classList: ["mg-focal", "mg-centered"],
        position: { x: 0.3, y: 0.38, width: 0.4, height: 0.24 },
        depthLayer: 0,
        zIndex: 10,
        children: [
          {
            id: "headline",
            tag: "h1",
            classList: ["mg-headline"],
            position: { x: 0, y: 0, width: 1, height: 1 },
            depthLayer: 0,
            zIndex: 11,
            textContent: scene.text.headline,
            children: [],
          },
        ],
      },
      satellite("sat0", 0, 0.18, 0.2),
      satellite("sat1", 1, 0.82, 0.22),
      satellite("sat2", 2, 0.22, 0.78),
      satellite("sat3", 3, 0.8, 0.76),
    ],
  };

  const negativeSpace = computeNegativeSpace(root);
  return {
    archetype: "centeredCompressed",
    root,
    eyeFlow: ["focal", "headline"],
    focalCenter: { x: focalX, y: focalY },
    tensionZones: [{ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }],
    negativeSpaceCoverage: negativeSpace,
    readingFlow: "centerOut",
  };
}

// ─── layeredDepth ─────────────────────────────────────────────────────────
//   Four depth layers (≤ max). Reading flow: diagonal.
function composeLayeredDepth(
  scene: Scene,
  slot: RhythmSlot,
  bias: LayoutBias,
): LayoutTopology {
  const focalX = bias.focalRegion?.x ?? 0.34;
  const focalY = bias.focalRegion?.y ?? 0.5;

  const root: LayoutNode = {
    id: "stage",
    tag: "div",
    classList: ["mg-stage", "mg-layered-depth"],
    position: { x: 0, y: 0, width: 1, height: 1 },
    depthLayer: 0,
    zIndex: 0,
    children: [
      depthLayer("layer3", 3, 0.04, 0.12, 0.92, 0.12),
      depthLayer("layer2", 2, 0.1, 0.32, 0.86, 0.18),
      depthLayer("layer1", 1, 0.18, 0.56, 0.72, 0.22),
      {
        id: "focal",
        tag: "section",
        classList: ["mg-focal", "mg-layered-focal"],
        position: { x: focalX - 0.16, y: focalY - 0.1, width: 0.32, height: 0.28 },
        depthLayer: 0,
        zIndex: 20,
        children: [
          {
            id: "headline",
            tag: "h1",
            classList: ["mg-headline"],
            position: { x: 0, y: 0, width: 1, height: 1 },
            depthLayer: 0,
            zIndex: 21,
            textContent: scene.text.headline,
            children: [],
          },
        ],
      },
    ],
  };

  const negativeSpace = computeNegativeSpace(root);
  return {
    archetype: "layeredDepth",
    root,
    eyeFlow: ["focal", "headline", "layer1", "layer2", "layer3"],
    focalCenter: { x: focalX, y: focalY },
    tensionZones: [{ x: focalX - 0.08, y: focalY - 0.08, width: 0.16, height: 0.16 }],
    negativeSpaceCoverage: negativeSpace,
    readingFlow: "diagonal",
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function satellite(id: string, depth: number, x: number, y: number): LayoutNode {
  return {
    id,
    tag: "div",
    classList: ["mg-satellite"],
    position: { x: x - 0.04, y: y - 0.04, width: 0.08, height: 0.08 },
    depthLayer: depth,
    zIndex: 5,
    children: [],
  };
}

function depthLayer(
  id: string,
  depth: number,
  x: number,
  y: number,
  w: number,
  h: number,
): LayoutNode {
  return {
    id,
    tag: "div",
    classList: ["mg-depth-layer"],
    position: { x, y, width: w, height: h },
    depthLayer: depth,
    zIndex: 10 - depth,
    children: [],
  };
}

// Coarse negative-space estimate: viewport area minus union of node areas.
// Overlap is ignored for speed; this is a heuristic for the dominant-negative
// space hard law.
function computeNegativeSpace(root: LayoutNode): number {
  let covered = 0;
  for (const c of root.children) {
    if (c.id === "background") continue; // background is not "occupied"
    covered += c.position.width * c.position.height;
  }
  return Math.max(0, 1 - covered);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
