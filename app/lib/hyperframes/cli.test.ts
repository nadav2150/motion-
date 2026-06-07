import { expect, test } from "vitest";
import { HYPERFRAMES_VERSION, hyperframesBin, hyperframesArgs } from "./cli";

test("HYPERFRAMES_VERSION is pinned to a concrete version", () => {
  expect(HYPERFRAMES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("hyperframesArgs pins the version and passes --yes before the package", () => {
  const args = hyperframesArgs("render", [".", "--output", "scene.mp4"]);
  expect(args).toEqual([
    "--yes",
    `hyperframes@${HYPERFRAMES_VERSION}`,
    "render",
    ".",
    "--output",
    "scene.mp4",
  ]);
});

test("hyperframesArgs works with no extra args", () => {
  expect(hyperframesArgs("lint", ["--json"])).toEqual([
    "--yes",
    `hyperframes@${HYPERFRAMES_VERSION}`,
    "lint",
    "--json",
  ]);
});

test("hyperframesBin uses the .cmd shim on win32 and plain npx elsewhere", () => {
  expect(hyperframesBin("win32")).toBe("npx.cmd");
  expect(hyperframesBin("linux")).toBe("npx");
  expect(hyperframesBin("darwin")).toBe("npx");
});
