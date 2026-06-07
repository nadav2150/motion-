import { expect, test } from "vitest";
import { getEngineAdapter, collectExtraCdn } from "./registry";
import type { Layer } from "./types";

test("getEngineAdapter returns the GSAP adapter", () => {
  expect(getEngineAdapter("gsap")!.engine).toBe("gsap");
});

test("getEngineAdapter returns null for an unregistered engine", () => {
  // three/anime/waapi are not registered until the follow-on plan.
  expect(getEngineAdapter("three")).toBeNull();
});

test("collectExtraCdn returns no extra scripts when only GSAP is used", () => {
  const layers: Layer[] = [
    { id: "a", engine: "gsap", code: "" },
    { id: "b", engine: "gsap", code: "" },
  ];
  expect(collectExtraCdn(layers)).toEqual([]);
});

test("collectExtraCdn ignores engines with no registered adapter", () => {
  const layers: Layer[] = [{ id: "a", engine: "three", code: "" }];
  expect(collectExtraCdn(layers)).toEqual([]);
});
