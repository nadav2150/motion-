import { expect, test } from "vitest";
import { waapiAdapter } from "./waapi";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "fx",
  engine: "waapi",
  html: `<div id="box"></div>`,
  code: `var a = document.getElementById("box").animate([{opacity:0},{opacity:1}], { duration:500, delay: __sceneStartMs + 0, fill:"both", iterations:1 }); a.pause();`,
};
const ctx: LayerEmitContext = { sceneId: "s2", start: 3, duration: 4, index: 0, total: 1 };

test("waapi adapter has no CDN (native)", () => {
  expect(waapiAdapter.cdn).toBeNull();
});

test("emitDom returns html unwrapped when only layer", () => {
  expect(waapiAdapter.emitDom(layer, ctx)).toBe(`<div id="box"></div>`);
});

test("emitDom wraps when stacked", () => {
  expect(waapiAdapter.emitDom(layer, { ...ctx, index: 1, total: 2 })).toContain(`z-index:1`);
});

test("emitJs exposes __sceneStartMs (start*1000) and includes the layer code", () => {
  const js = waapiAdapter.emitJs(layer, ctx);
  expect(js).toContain(`var __sceneStartMs = 3000;`);
  expect(js).toContain(`.animate([{opacity:0},{opacity:1}]`);
  expect(js).toContain(`a.pause();`);
});

test("emitJs returns empty string for empty code", () => {
  expect(waapiAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
