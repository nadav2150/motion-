// app/lib/hyperframes/engines/waapi.ts
// Web Animations API adapter. Native — no CDN, no registration global:
// HyperFrames auto-discovers animations via document.getAnimations() and seeks
// each one's currentTime per frame. Layer code must create animations with
// fill:"both" + iterations:1 and pause() them; scene offset is added to delay
// via the exposed __sceneStartMs (ms).

import { stackLayerDom } from "./dom";
import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

export const waapiAdapter: EngineAdapter = {
  engine: "waapi",
  cdn: null,

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    const startMs = Math.round(ctx.start * 1000);
    return [
      `  (function () {`,
      `    // WAAPI layer "${layer.id}" (scene ${ctx.sceneId}). Author el.animate(keyframes,`,
      `    // { delay: __sceneStartMs + localDelayMs, fill: "both", iterations: 1 }) then pause().`,
      `    var __sceneStartMs = ${startMs};`,
      indentLines(body, "    "),
      `  })();`,
    ].join("\n");
  },
};
