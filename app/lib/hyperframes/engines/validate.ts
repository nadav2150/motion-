// app/lib/hyperframes/engines/validate.ts
// Cheap static checks on engine layers. The pipeline drops (never fails on)
// layers that violate them — mirroring the "ship the film without audio"
// degradation stance. Rules come from the verified HyperFrames contracts in
// docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md.

import type { Layer } from "./types";

const NONDETERMINISM: Array<[RegExp, string]> = [
  [/Math\.random\s*\(/, "uses Math.random (nondeterministic)"],
  [/Date\.now\s*\(/, "uses Date.now (nondeterministic)"],
  [/requestAnimationFrame\s*\(/, "uses requestAnimationFrame (HyperFrames owns the clock)"],
  [/setInterval\s*\(|setTimeout\s*\(/, "uses timers (HyperFrames owns the clock)"],
  [/fetch\s*\(|XMLHttpRequest/, "performs network I/O (renders must be hermetic)"],
];

/** Returns a list of violations; empty = layer is acceptable. */
export function validateLayer(layer: Layer): string[] {
  const code = layer.code ?? "";
  const out: string[] = [];

  for (const [re, msg] of NONDETERMINISM) {
    if (re.test(code)) out.push(msg);
  }

  if (layer.engine === "anime") {
    if (!/__hfAnime\s*\.\s*push/.test(code)) out.push("anime layer never registers on window.__hfAnime");
    if (!/autoplay\s*:\s*false/.test(code)) out.push("anime layer missing autoplay: false");
    if (/\banime\s*\(\s*\{/.test(code)) out.push("uses the v3 anime({...}) call — v4 IIFE exposes an object; use anime.createTimeline/animate");
  }

  if (layer.engine === "waapi") {
    if (!/fill\s*:\s*["']both["']/.test(code)) out.push('waapi layer missing fill: "both"');
    if (!/\.pause\s*\(\s*\)/.test(code)) out.push("waapi layer never pause()s its animation");
  }

  if (layer.engine === "three") {
    if (!/hf-seek/.test(code)) out.push("three layer has no hf-seek listener (seek wiring)");
    if (!/__hfThreeTime/.test(code)) out.push("three layer missing the __hfThreeTime initial render (blank first frame)");
  }

  return out;
}
