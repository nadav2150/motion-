import { expect, test } from "vitest";
import { stackLayerDom } from "./dom";

test("returns html unwrapped when it is the only layer", () => {
  expect(stackLayerDom(`<h1>X</h1>`, 0, 1)).toBe(`<h1>X</h1>`);
});

test("wraps in a positioned layer div with z-index when stacked", () => {
  const out = stackLayerDom(`<h1>X</h1>`, 2, 3);
  expect(out).toBe(
    `<div class="layer" style="position:absolute;inset:0;z-index:2"><h1>X</h1></div>`,
  );
});

test("empty html stays empty when unstacked", () => {
  expect(stackLayerDom("", 0, 1)).toBe("");
});
