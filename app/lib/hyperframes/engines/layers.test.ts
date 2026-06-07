import { expect, test } from "vitest";
import { resolveLayers } from "./layers";

test("synthesizes a single GSAP base layer from legacy fields", () => {
  const layers = resolveLayers({
    contentHtml: `<h1>Hi</h1>`,
    sceneCss: `#s1 { color: red; }`,
    timeline: `tl.from("#h", {}, 0);`,
  });
  expect(layers).toEqual([
    {
      id: "base",
      engine: "gsap",
      html: `<h1>Hi</h1>`,
      css: `#s1 { color: red; }`,
      code: `tl.from("#h", {}, 0);`,
    },
  ]);
});

test("passes through an explicit layers array unchanged", () => {
  const explicit = [
    { id: "bg", engine: "three" as const, html: "<canvas></canvas>", code: "/*…*/" },
    { id: "fg", engine: "gsap" as const, html: "<h1>X</h1>", code: "tl.to(…)" },
  ];
  expect(resolveLayers({ layers: explicit, contentHtml: "ignored", sceneCss: "", timeline: "" })).toBe(
    explicit,
  );
});

test("ignores an empty layers array and falls back to legacy", () => {
  const layers = resolveLayers({
    layers: [],
    contentHtml: `<p>L</p>`,
    sceneCss: "",
    timeline: "",
  });
  expect(layers).toHaveLength(1);
  expect(layers[0].engine).toBe("gsap");
  expect(layers[0].html).toBe(`<p>L</p>`);
});
