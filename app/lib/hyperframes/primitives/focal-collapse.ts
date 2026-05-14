// focalCollapse — motion primitive. Collapses surrounding elements toward
// the focal target along a focal-gravity vector. Used both for primary
// reveals (when target IS the focus) and for tension transitions.
//
// Atomic / composable / parameterized / stateless.

import type { Primitive } from "../types";
import { EASINGS } from "./easing";

const focalCollapse: Primitive = {
  id: "focalCollapse",
  category: "motion",
  params: {
    durationMs: { type: "number", range: [400, 1400], default: 800 },
    magnitude: { type: "number", range: [0.04, 0.18], default: 0.1 },
    direction: {
      type: "enum",
      enum: ["centerIn", "diagonalIn", "verticalIn"],
      default: "centerIn",
    },
    easing: {
      type: "enum",
      enum: ["power3.inOut", "expoOut", "customCubic1"],
      default: "power3.inOut",
    },
    childrenSelector: { type: "string", default: ":scope > *" },
  },
  physics: {
    visualWeight: 0.65,
    energyCost: 0.55,
    attentionCost: 0.7,
    complexityCost: 0.5,
    aggressiveness: 0.5,
    readabilityImpact: -0.2,
    philosophyAlignment: 0.85, // pairs strongly with confident asymmetry + compressed depth
    kineticAffinity: {
      lockedMomentum: 0.85,
      pressureBuild: 0.7,
      unstableGravity: 0.5,
      releaseDecay: 0.2,
    },
  },
  signature: {
    category: "motion",
    motionVector: "in",
    topology: "cascade",
    durationBucket: "medium",
  },
  js(params, target, tl, startAt) {
    const dur = Number(params.durationMs ?? 800) / 1000;
    const mag = Number(params.magnitude ?? 0.1);
    const dirRaw = String(params.direction ?? "centerIn");
    const easingId = String(params.easing ?? "power3.inOut") as keyof typeof EASINGS;
    const easing = EASINGS[easingId]?.gsapName ?? "power3.inOut";
    const childSel = String(params.childrenSelector ?? ":scope > *");

    let dx = 0;
    let dy = 0;
    if (dirRaw === "diagonalIn") {
      dx = -mag * 100;
      dy = -mag * 100;
    } else if (dirRaw === "verticalIn") {
      dy = -mag * 100;
    } else {
      // centerIn: each child drifts toward the focal element along its own axis.
      // Handled via stagger function below.
    }

    // Children animate toward focal center; opacity tightens; scale tightens.
    return `
{
  const _t = document.querySelector(${JSON.stringify(target)});
  if (_t) {
    const _kids = _t.querySelectorAll(${JSON.stringify(childSel)});
    ${tl}.to(_kids, {
      x: ${dirRaw === "centerIn" ? `(i, el) => (_t.getBoundingClientRect().width / 2 - (el.offsetLeft + el.offsetWidth / 2)) * ${mag}` : dx},
      y: ${dirRaw === "centerIn" ? `(i, el) => (_t.getBoundingClientRect().height / 2 - (el.offsetTop + el.offsetHeight / 2)) * ${mag}` : dy},
      scale: 1 - ${mag * 0.3},
      filter: "blur(" + (${mag} * 6) + "px)",
      duration: ${dur},
      ease: ${JSON.stringify(easing)},
      stagger: 0.04
    }, ${startAt});
  }
}
`.trim();
  },
};

export default focalCollapse;
