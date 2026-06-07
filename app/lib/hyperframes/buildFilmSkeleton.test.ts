import { expect, test } from "vitest";
import { buildFilmSkeleton } from "./llm-director";
import type { FilmFills } from "./llm-director";

const identity: any = {
  background: "#000",
  ink: "#fff",
  inkMuted: "#aaa",
  accents: ["#7c5cff"],
  headlineFont: "Inter",
  bodyFont: "Inter",
  monoFont: "Mono",
  language: "en",
  textDirection: "ltr",
};

const storyboard: any = {
  title: "T",
  scenes: [
    { id: "s1", copy: "First", durationSeconds: 3 },
    { id: "s2", copy: "Second", durationSeconds: 4 },
  ],
};

test("legacy fills (no layers) still produce the GSAP wiring and scene content", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: `<h1 id="a">First</h1>`,
        sceneCss: `#a { color: red; }`,
        timeline: `tl.from("#a", { opacity: 0 }, 0);`,
        transitionIn: "hard_cut",
      },
      {
        id: "s2",
        contentHtml: `<h1 id="b">Second</h1>`,
        sceneCss: "",
        timeline: `tl.from("#b", { y: 20 }, 0);`,
        transitionIn: "hard_cut",
      },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);

  expect(html).toContain(`window.__timelines["main"] = tl;`);
  expect(html).toContain(`<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>`);
  expect(html).toContain(`<h1 id="a">First</h1>`);
  expect(html).not.toContain(`class="layer"`);
  expect(html).toContain(`<div class="scene-content">`);
  expect(html).toContain(`})(tl, 3);`);
  expect(html).toContain(`tl.from("#b", { y: 20 }, 0);`);
  expect(html).not.toContain(`anime.min.js`);
  expect(html).not.toContain(`three.min.js`);
});

test("three + gsap layers coexist: three emitted as module script, gsap siblings survive", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: "",
        sceneCss: "",
        timeline: "",
        transitionIn: "hard_cut",
        layers: [
          { id: "bg", engine: "three", html: `<canvas id="c"></canvas>`, code: `/* three */` },
          { id: "fg", engine: "gsap", html: `<h1 id="t">Hi</h1>`, code: `tl.to("#t", {}, 0);` },
        ],
      },
      {
        id: "s2",
        contentHtml: `<h1 id="b">Second</h1>`,
        sceneCss: "",
        timeline: "",
        transitionIn: "hard_cut",
      },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  // three IS registered — canvas and module code both appear.
  expect(html).toContain(`<canvas id="c">`);
  expect(html).toContain(`/* three */`);
  expect(html).toContain(`<script type="module">`);
  expect(html).toContain(`const __sceneStartS = 0;`);
  // GSAP sibling also emitted; layers are stacked (z-index present).
  expect(html).toContain(`<h1 id="t">Hi</h1>`);
  expect(html).toContain(`z-index`);
});

test("a mixed gsap+anime+waapi scene emits each engine correctly", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: "",
        sceneCss: "",
        timeline: "",
        transitionIn: "hard_cut",
        layers: [
          { id: "bg", engine: "waapi", html: `<div id="box"></div>`, code: `document.getElementById("box").animate([{opacity:0},{opacity:1}],{duration:500,delay:__sceneStartMs+0,fill:"both",iterations:1}).pause();` },
          { id: "mid", engine: "anime", html: `<h1 class="mark">Hi</h1>`, code: `var anim = anime.createTimeline({autoplay:false}).add(".mark",{opacity:{from:0,to:1},duration:600,delay:__sceneStartMs+0}); window.__hfAnime.push(anim);` },
          { id: "fg", engine: "gsap", html: `<p id="cap">Cap</p>`, code: `tl.from("#cap", { y: 10 }, 0);` },
        ],
      },
      { id: "s2", contentHtml: `<h1 id="b">Second</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);

  // Anime CDN injected exactly once; WAAPI has no CDN.
  expect(html).toContain(`https://cdn.jsdelivr.net/npm/animejs@4.0.2/lib/anime.iife.min.js`);
  expect(html.match(/animejs@4\.0\.2/g)?.length).toBe(1);
  // Each engine's code present.
  expect(html).toContain(`window.__hfAnime.push(anim);`);
  expect(html).toContain(`.animate([{opacity:0},{opacity:1}]`);
  expect(html).toContain(`tl.from("#cap", { y: 10 }, 0);`);
  // Scene offset exposed for the code-driven engines (s1 starts at 0ms).
  expect(html).toContain(`var __sceneStartMs = 0;`);
  // All three layers stacked (total=3) so each is wrapped.
  expect(html).toContain(`<div id="box"></div>`);
  expect(html).toContain(`<h1 class="mark">Hi</h1>`);
});

test("no module scripts are emitted when every layer engine is inline", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      { id: "s1", contentHtml: `<h1 id="a">A</h1>`, sceneCss: "", timeline: `tl.from("#a", {}, 0);`, transitionIn: "hard_cut" },
      { id: "s2", contentHtml: `<h1 id="b">B</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  expect(html).not.toContain(`<script type="module">`);
});

test("a fill with backgroundLayers stacks the engine layer behind the gsap base", () => {
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: `<h1 id="hero">Hero</h1>`,
        sceneCss: `#hero { color: white; }`,
        timeline: `tl.from("#hero", { opacity: 0 }, 0);`,
        transitionIn: "hard_cut",
        backgroundLayers: [
          { id: "bgw", engine: "waapi", html: `<div id="amb"></div>`, css: `#amb { position: absolute; inset: 0; }`,
            code: `document.getElementById("amb").animate([{opacity:0.2},{opacity:0.5}],{duration:2000,delay:__sceneStartMs+0,fill:"both",iterations:1}).pause();` },
        ],
      },
      { id: "s2", contentHtml: `<h1 id="b">Second</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  // Two stacked layers in s1: background (z-index:0) below the gsap base (z-index:1).
  expect(html).toContain(`z-index:0"><div id="amb"></div>`);
  expect(html).toContain(`z-index:1"><h1 id="hero">Hero</h1>`);
  // Both engines' code present; background css merged into the scene <style>.
  expect(html).toContain(`document.getElementById("amb").animate`);
  expect(html).toContain(`tl.from("#hero", { opacity: 0 }, 0);`);
  expect(html).toContain(`#amb { position: absolute; inset: 0; }`);
  // The waapi layer got its scene offset (s1 starts at 0).
  expect(html).toContain(`var __sceneStartMs = 0;`);
});

test("a layer with an unregistered engine is dropped while siblings survive", () => {
  // "lottie" is a plausible future engine with no adapter yet — cast to
  // exercise the skeleton's degradation path (warn + skip, never fail).
  const fills: FilmFills = {
    cssVariables: {},
    scenes: [
      {
        id: "s1",
        contentHtml: "",
        sceneCss: "",
        timeline: "",
        transitionIn: "hard_cut",
        layers: [
          { id: "future", engine: "lottie" as unknown as "gsap", html: `<div id="lot"></div>`, code: `/* lottie */` },
          { id: "fg", engine: "gsap", html: `<h1 id="t">Hi</h1>`, code: `tl.to("#t", {}, 0);` },
        ],
      },
      { id: "s2", contentHtml: `<h1 id="b">B</h1>`, sceneCss: "", timeline: "", transitionIn: "hard_cut" },
    ],
  };
  const html = buildFilmSkeleton(storyboard, identity, fills);
  expect(html).not.toContain(`<div id="lot">`);
  expect(html).not.toContain(`/* lottie */`);
  // Sole surviving layer is emitted unwrapped (emittable total = 1).
  expect(html).toContain(`<h1 id="t">Hi</h1>`);
  expect(html).not.toContain(`class="layer"><h1 id="t">`);
});
