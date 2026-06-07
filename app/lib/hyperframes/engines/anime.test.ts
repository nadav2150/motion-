import { expect, test } from "vitest";
import { animeAdapter } from "./anime";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "title",
  engine: "anime",
  html: `<h1 class="mark">Hi</h1>`,
  code: `var anim = anime.createTimeline({ autoplay: false }).add(".mark", { opacity: { from: 0, to: 1 }, duration: 600, delay: __sceneStartMs + 0 }); window.__hfAnime.push(anim);`,
};
const ctx: LayerEmitContext = { sceneId: "s2", start: 3, duration: 4, index: 0, total: 1 };

test("anime adapter declares the v4 IIFE CDN", () => {
  expect(animeAdapter.cdn).toBe(
    "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js",
  );
});

test("emitDom returns html unwrapped when only layer", () => {
  expect(animeAdapter.emitDom(layer, ctx)).toBe(`<h1 class="mark">Hi</h1>`);
});

test("emitDom wraps when stacked", () => {
  expect(animeAdapter.emitDom(layer, { ...ctx, index: 1, total: 2 })).toContain(`z-index:1`);
});

test("emitJs exposes __sceneStartMs, inits __hfAnime, and includes the layer code", () => {
  const js = animeAdapter.emitJs(layer, ctx);
  expect(js).toContain(`var __sceneStartMs = 3000;`);
  expect(js).toContain(`window.__hfAnime = window.__hfAnime || [];`);
  expect(js).toContain(`anime.createTimeline({ autoplay: false })`);
  expect(js).toContain(`window.__hfAnime.push(anim);`);
});

test("emitJs returns empty string for empty code", () => {
  expect(animeAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
