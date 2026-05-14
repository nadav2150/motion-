// staggerWordReveal — typography primitive. Splits a target element's text
// into word-spans and reveals them on a controlled inter-word stagger.
//
// Stagger range is hard-clamped by the Typography law:
// staggerMs ∈ [60, 140]. Out-of-range values are rejected at emit time.

import type { Primitive } from "../types";
import { EASINGS } from "./easing";
import { LAW_CONSTANTS } from "../philosophy";

const staggerWordReveal: Primitive = {
  id: "staggerWordReveal",
  category: "typography",
  params: {
    staggerMs: {
      type: "number",
      range: [LAW_CONSTANTS.staggerWordRevealMinMs, LAW_CONSTANTS.staggerWordRevealMaxMs],
      default: 100,
    },
    durationPerWordMs: { type: "number", range: [220, 700], default: 380 },
    yOffsetPx: { type: "number", range: [12, 40], default: 22 },
    easing: {
      type: "enum",
      enum: ["power3.inOut", "expoOut", "customCubic1"],
      default: "expoOut",
    },
  },
  physics: {
    visualWeight: 0.5,
    energyCost: 0.35,
    attentionCost: 0.85, // text is the most attention-costly motion
    complexityCost: 0.3,
    aggressiveness: 0.3,
    readabilityImpact: 0.2, // text revealed cleanly is readable
    philosophyAlignment: 0.95, // "Typography as motion" tenet's hero primitive
    kineticAffinity: {
      lockedMomentum: 0.8,
      pressureBuild: 0.7,
      releaseDecay: 0.5,
      unstableGravity: 0.4,
    },
  },
  signature: {
    category: "typography",
    motionVector: "up",
    topology: "stagger",
    durationBucket: "medium",
  },
  js(params, target, tl, startAt) {
    const stagger = clamp(
      Number(params.staggerMs ?? 100),
      LAW_CONSTANTS.staggerWordRevealMinMs,
      LAW_CONSTANTS.staggerWordRevealMaxMs,
    ) / 1000;
    const perWord = Number(params.durationPerWordMs ?? 380) / 1000;
    const yOff = Number(params.yOffsetPx ?? 22);
    const easingId = String(params.easing ?? "expoOut") as keyof typeof EASINGS;
    const easing = EASINGS[easingId]?.gsapName ?? "expo.out";

    return `
{
  const _t = document.querySelector(${JSON.stringify(target)});
  if (_t && _t.dataset.mgSplit !== "1") {
    const _txt = _t.textContent || "";
    _t.textContent = "";
    _txt.split(/(\\s+)/).forEach((part) => {
      if (/^\\s+$/.test(part)) {
        _t.appendChild(document.createTextNode(part));
      } else if (part.length) {
        const s = document.createElement("span");
        s.className = "mg-word";
        s.style.display = "inline-block";
        s.style.opacity = "0";
        s.style.transform = "translateY(${yOff}px)";
        s.textContent = part;
        _t.appendChild(s);
      }
    });
    _t.dataset.mgSplit = "1";
  }
  if (_t) {
    const _w = _t.querySelectorAll(".mg-word");
    ${tl}.to(_w, {
      opacity: 1,
      y: 0,
      duration: ${perWord},
      ease: ${JSON.stringify(easing)},
      stagger: ${stagger}
    }, ${startAt});
  }
}
`.trim();
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export default staggerWordReveal;
