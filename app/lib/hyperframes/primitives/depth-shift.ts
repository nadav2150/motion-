// depthShift — depth primitive. Reorders or shifts elements between depth
// layers using simultaneous scale + blur + opacity modulation.
//
// Hard law (Compressed Depth): max 4 simultaneous layers, ≥ 18% gap.

import type { Primitive } from "../types";
import { EASINGS } from "./easing";

const depthShift: Primitive = {
  id: "depthShift",
  category: "depth",
  params: {
    durationMs: { type: "number", range: [600, 1800], default: 1000 },
    layersFromTo: { type: "string", default: "[[1,0],[2,1],[3,2]]" }, // JSON-encoded pairs
    blurDelta: { type: "number", range: [2, 14], default: 6 },
    scaleDelta: { type: "number", range: [0.02, 0.12], default: 0.06 },
    easing: {
      type: "enum",
      enum: ["power3.inOut", "expoOut", "customCubic1"],
      default: "power3.inOut",
    },
  },
  physics: {
    visualWeight: 0.55,
    energyCost: 0.4,
    attentionCost: 0.55,
    complexityCost: 0.6,
    aggressiveness: 0.35,
    readabilityImpact: -0.1,
    philosophyAlignment: 0.8, // serves "compressed depth" tenet
    kineticAffinity: {
      pressureBuild: 0.9,
      releaseDecay: 0.6,
      lockedMomentum: 0.4,
      unstableGravity: 0.7,
    },
  },
  signature: {
    category: "depth",
    motionVector: "in",
    topology: "cascade",
    durationBucket: "long",
  },
  js(params, target, tl, startAt) {
    const dur = Number(params.durationMs ?? 1000) / 1000;
    const blur = Number(params.blurDelta ?? 6);
    const scale = Number(params.scaleDelta ?? 0.06);
    const easingId = String(params.easing ?? "power3.inOut") as keyof typeof EASINGS;
    const easing = EASINGS[easingId]?.gsapName ?? "power3.inOut";

    // depthShift animates [data-depth] elements within the target. Each depth
    // layer N gets blur = N * blurDelta and scale = 1 - (N * scaleDelta).
    // Tightens the perceived stack.
    return `
{
  const _t = document.querySelector(${JSON.stringify(target)});
  if (_t) {
    const _layers = _t.querySelectorAll("[data-depth]");
    _layers.forEach((el) => {
      const d = parseInt(el.dataset.depth || "0", 10) || 0;
      ${tl}.to(el, {
        filter: "blur(" + (d * ${blur}) + "px)",
        scale: 1 - d * ${scale},
        opacity: Math.max(0.3, 1 - d * 0.15),
        duration: ${dur},
        ease: ${JSON.stringify(easing)}
      }, ${startAt});
    });
  }
}
`.trim();
  },
};

export default depthShift;
