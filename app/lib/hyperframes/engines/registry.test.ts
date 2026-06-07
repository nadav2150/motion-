import { expect, test } from "vitest";
import { getEngineAdapter, collectExtraCdn } from "./registry";
import type { Layer } from "./types";

test("getEngineAdapter returns the registered adapters", () => {
  expect(getEngineAdapter("gsap")!.engine).toBe("gsap");
  expect(getEngineAdapter("waapi")!.engine).toBe("waapi");
  expect(getEngineAdapter("anime")!.engine).toBe("anime");
});

test("getEngineAdapter returns null for an unregistered engine", () => {
  // three is not registered until Phase 3.
  expect(getEngineAdapter("three")).toBeNull();
});

test("collectExtraCdn returns no extra scripts for gsap/waapi only (both have no extra CDN)", () => {
  const layers: Layer[] = [
    { id: "a", engine: "gsap", code: "" },
    { id: "b", engine: "waapi", code: "" },
  ];
  expect(collectExtraCdn(layers)).toEqual([]);
});

test("collectExtraCdn includes the anime CDN once when anime is used", () => {
  const layers: Layer[] = [
    { id: "a", engine: "anime", code: "" },
    { id: "b", engine: "anime", code: "" },
    { id: "c", engine: "gsap", code: "" },
  ];
  expect(collectExtraCdn(layers)).toEqual([
    "https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js",
  ]);
});

test("collectExtraCdn ignores engines with no registered adapter", () => {
  const layers: Layer[] = [{ id: "a", engine: "three", code: "" }];
  expect(collectExtraCdn(layers)).toEqual([]);
});
