import { expect, test } from "vitest";
import { gsapAdapter } from "./gsap";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "base",
  engine: "gsap",
  html: `<h1 id="hl">Hello</h1>`,
  css: "",
  code: `tl.from("#hl", { opacity: 0, duration: 0.5 }, 0);`,
};

const ctx: LayerEmitContext = {
  sceneId: "s2",
  start: 3,
  duration: 4,
  index: 0,
  total: 1,
};

test("gsap adapter has no CDN (skeleton already loads gsap)", () => {
  expect(gsapAdapter.cdn).toBeNull();
});

test("emitDom returns the layer html unwrapped when it is the only layer", () => {
  expect(gsapAdapter.emitDom(layer, ctx)).toBe(`<h1 id="hl">Hello</h1>`);
});

test("emitDom wraps the layer in a positioned div when stacked", () => {
  const dom = gsapAdapter.emitDom(layer, { ...ctx, index: 1, total: 3 });
  expect(dom).toContain(`class="layer"`);
  expect(dom).toContain(`z-index:1`);
  expect(dom).toContain(`<h1 id="hl">Hello</h1>`);
});

test("emitJs wraps the timeline body in the offset IIFE at the scene start", () => {
  const js = gsapAdapter.emitJs(layer, ctx);
  expect(js).toContain(`})(tl, 3);`);
  expect(js).toContain(`tl.from("#hl", { opacity: 0, duration: 0.5 }, 0);`);
  expect(js).toContain(`function __p(pos)`);
});

test("emitJs returns empty string for an empty timeline body", () => {
  expect(gsapAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
