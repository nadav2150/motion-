// app/lib/hyperframes/engines/gsap.ts
// GSAP engine adapter. Reproduces the historical buildFilmSkeleton output:
// the per-scene IIFE shadows `tl` with a wrapper that adds the scene's start
// offset to every numeric position arg, so layer code stays scene-local.

import type { EngineAdapter, Layer, LayerEmitContext } from "./types";

function indentLines(s: string, indent: string): string {
  return s
    .split("\n")
    .map((l) => (l.length ? indent + l : l))
    .join("\n");
}

export const gsapAdapter: EngineAdapter = {
  engine: "gsap",
  // The skeleton already includes the GSAP <script> unconditionally (the master
  // timeline always exists), so the adapter contributes no extra CDN.
  cdn: null,

  emitDom(layer: Layer, ctx: LayerEmitContext): string {
    const html = layer.html ?? "";
    // Single GSAP layer == legacy path: emit the html unwrapped so output is
    // byte-identical to the pre-layer skeleton.
    if (ctx.total <= 1) return html;
    // Stacked: wrap in an absolutely-positioned layer so z-order is explicit.
    return `<div class="layer" style="position:absolute;inset:0;z-index:${ctx.index}">${html}</div>`;
  },

  emitJs(layer: Layer, ctx: LayerEmitContext): string {
    const body = layer.code ?? "";
    if (!body.trim()) return "";
    return [
      `  (function (__tlRoot, t) {`,
      `    function __p(pos) {`,
      `      if (pos == null) return t;`,
      `      return typeof pos === "number" ? pos + t : pos;`,
      `    }`,
      `    var tl = {`,
      `      to:       function (tgt, v, pos)    { __tlRoot.to(tgt, v, __p(pos));       return tl; },`,
      `      from:     function (tgt, v, pos)    { __tlRoot.from(tgt, v, __p(pos));     return tl; },`,
      `      fromTo:   function (tgt, f, v, pos) { __tlRoot.fromTo(tgt, f, v, __p(pos)); return tl; },`,
      `      set:      function (tgt, v, pos)    { __tlRoot.set(tgt, v, __p(pos));      return tl; },`,
      `      add:      function (a, pos)         { __tlRoot.add(a, __p(pos));           return tl; },`,
      `      addLabel: function (l, pos)         { __tlRoot.addLabel(l, __p(pos));      return tl; },`,
      `      call:     function (fn, p2, pos)    { __tlRoot.call(fn, p2, __p(pos));     return tl; },`,
      `    };`,
      indentLines(body, "    "),
      `  })(tl, ${ctx.start});`,
    ].join("\n");
  },
};
