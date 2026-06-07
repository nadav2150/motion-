// app/lib/hyperframes/engines/anime.ts
// Anime.js v4 adapter. HyperFrames seeks every instance pushed to
// window.__hfAnime (instance.seek(ms)) each frame. Layer code must create
// instances with autoplay:false and push them to window.__hfAnime; scene
// offset is added to `delay` via the exposed __sceneStartMs (ms). The IIFE
// build exposes the global `anime` (anime({...}) / anime.timeline({...})).

import { stackLayerDom } from "./dom";
import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

export const animeAdapter: EngineAdapter = {
  engine: "anime",
  cdn: "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js",

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    const startMs = Math.round(ctx.start * 1000);
    return [
      `  (function () {`,
      `    // Anime.js layer "${layer.id}" (scene ${ctx.sceneId}). Author anime({ ...,`,
      `    // autoplay: false, delay: __sceneStartMs + localDelayMs }) then window.__hfAnime.push(anim).`,
      `    var __sceneStartMs = ${startMs};`,
      `    window.__hfAnime = window.__hfAnime || [];`,
      indentLines(body, "    "),
      `  })();`,
    ].join("\n");
  },
};
