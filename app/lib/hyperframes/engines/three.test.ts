import { expect, test } from "vitest";
import { threeAdapter } from "./three";
import type { Layer, LayerEmitContext } from "./types";

const layer: Layer = {
  id: "bg3d",
  engine: "three",
  html: `<canvas id="c3d"></canvas>`,
  code: `import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.2/+esm";
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c3d"), alpha: true });
function renderAt(t) { renderer.render(scene, camera); }
window.addEventListener("hf-seek", (e) => renderAt(e.detail.time - __sceneStartS));
renderAt((window.__hfThreeTime || 0) - __sceneStartS);`,
};
const ctx: LayerEmitContext = { sceneId: "s1", start: 3, duration: 4, index: 0, total: 2 };

test("three adapter is module-kind with no CDN tag (ESM import lives in layer code)", () => {
  expect(threeAdapter.cdn).toBeNull();
  expect(threeAdapter.jsKind).toBe("module");
});

test("emitDom stacks like the other adapters", () => {
  expect(threeAdapter.emitDom(layer, ctx)).toContain(`z-index:0`);
  expect(threeAdapter.emitDom(layer, { ...ctx, total: 1 })).toBe(`<canvas id="c3d"></canvas>`);
});

test("emitJs exposes __sceneStartS in SECONDS and includes the layer code", () => {
  const js = threeAdapter.emitJs(layer, ctx);
  expect(js).toContain(`const __sceneStartS = 3;`);
  expect(js).toContain(`hf-seek`);
  expect(js).toContain(`window.__hfThreeTime || 0`);
  // No IIFE wrapper — module scope isolates; top-level import must stay top-level.
  expect(js).not.toContain(`(function () {`);
});

test("emitJs returns empty string for empty code", () => {
  expect(threeAdapter.emitJs({ ...layer, code: "" }, ctx)).toBe("");
});
