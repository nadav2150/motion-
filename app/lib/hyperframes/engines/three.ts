// app/lib/hyperframes/engines/three.ts
// Three.js adapter (verified contract, HyperFrames 0.6.6):
//   • Layer code is an ES MODULE — it imports three via
//     "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm" itself, so cdn: null
//     and jsKind: "module" (the skeleton emits a separate <script type="module">).
//   • Seek: window "hf-seek" CustomEvent, e.detail = { time } in SECONDS.
//   • Initial frame: renderAt(window.__hfThreeTime || 0) right after setup —
//     mandatory, otherwise the canvas is blank until the first seek.
//   • Determinism: renderer.setSize(1920,1080,false) + setPixelRatio(1);
//     no rAF / setAnimationLoop; render is a pure function of seek time.
// The wrapper exposes __sceneStartS (SECONDS — unlike anime/waapi's ms) so
// layer code can convert global seek time to scene-local time.

import { stackLayerDom } from "./dom";
import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

export const threeAdapter: EngineAdapter = {
  engine: "three",
  cdn: null,
  jsKind: "module",

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    return stackLayerDom(layer.html ?? "", ctx.index, ctx.total);
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    // No IIFE: this is a module (own scope), and top-level `import` statements
    // must remain at module top level. __sceneStartS is in SECONDS to match
    // the hf-seek event's e.detail.time unit.
    return [
      `// Three.js layer "${layer.id}" (scene ${ctx.sceneId}) — hf-seek drives renderAt;`,
      `// scene-local time = e.detail.time - __sceneStartS (seconds).`,
      `const __sceneStartS = ${ctx.start};`,
      body,
    ].join("\n");
  },
};
