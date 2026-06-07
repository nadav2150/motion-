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

test("an unregistered engine layer is dropped, GSAP siblings survive", () => {
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
  expect(html).not.toContain(`<canvas id="c">`);
  expect(html).not.toContain(`/* three */`);
  expect(html).toContain(`<h1 id="t">Hi</h1>`);
  expect(html).not.toContain(`class="layer"`);
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
