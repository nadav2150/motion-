// app/lib/hyperframes/engines/layers.ts
// Normalize a scene fill into a layer stack. New fills carry `layers`; legacy
// fills carry contentHtml/sceneCss/timeline, which become one implicit GSAP
// layer. The caller resolves the contentHtml/sceneCss/timeline fallbacks
// (including the no-fill <h1> default) before calling in.

import type { Layer } from "./types";

export type ResolvableFill = {
  layers?: Layer[];
  contentHtml: string;
  sceneCss: string;
  timeline: string;
};

export function resolveLayers(fill: ResolvableFill): Layer[] {
  if (fill.layers && fill.layers.length > 0) {
    return fill.layers;
  }
  return [
    {
      id: "base",
      engine: "gsap",
      html: fill.contentHtml,
      css: fill.sceneCss,
      code: fill.timeline,
    },
  ];
}
