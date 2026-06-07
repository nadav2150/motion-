import { expect, test } from "vitest";
import { validateLayer } from "./validate";
import type { Layer } from "./types";

const base = (over: Partial<Layer>): Layer => ({
  id: "l1", engine: "anime", html: "<div></div>", code: "", ...over,
});

test("flags nondeterminism in any engine layer", () => {
  for (const bad of ["Math.random()", "Date.now()", "requestAnimationFrame(loop)", "setInterval(f, 16)", "fetch('/x')"]) {
    const v = validateLayer(base({ engine: "waapi", code: `var a = 1; ${bad};` }));
    expect(v.length, bad).toBeGreaterThan(0);
  }
});

test("anime: requires __hfAnime.push and autoplay:false; forbids v3 anime({}) call", () => {
  expect(validateLayer(base({ code: `var tl = anime.createTimeline({ autoplay: false }); window.__hfAnime.push(tl);` }))).toEqual([]);
  expect(validateLayer(base({ code: `var tl = anime.createTimeline({ autoplay: false });` })).join()).toMatch(/__hfAnime/);
  expect(validateLayer(base({ code: `var tl = anime.createTimeline({}); window.__hfAnime.push(tl);` })).join()).toMatch(/autoplay/);
  expect(validateLayer(base({ code: `var a = anime({ targets: ".x" }); window.__hfAnime.push(a); /* autoplay: false */` })).join()).toMatch(/v3/);
});

test("waapi: requires fill both and pause()", () => {
  const good = `var a = el.animate([{opacity:0},{opacity:1}], { duration: 500, delay: __sceneStartMs, fill: "both", iterations: 1 }); a.pause();`;
  expect(validateLayer(base({ engine: "waapi", code: good }))).toEqual([]);
  expect(validateLayer(base({ engine: "waapi", code: good.replace(`fill: "both", `, "") })).join()).toMatch(/fill/);
  expect(validateLayer(base({ engine: "waapi", code: good.replace(" a.pause();", "") })).join()).toMatch(/pause/);
});

test("three: requires BOTH the hf-seek listener and the __hfThreeTime initial render", () => {
  const good = `window.addEventListener("hf-seek", (e) => renderAt(e.detail.time - __sceneStartS));
renderAt((window.__hfThreeTime || 0) - __sceneStartS);`;
  expect(validateLayer(base({ engine: "three", code: good }))).toEqual([]);
  expect(validateLayer(base({ engine: "three", code: `window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));` })).join()).toMatch(/__hfThreeTime/);
  expect(validateLayer(base({ engine: "three", code: `renderAt(window.__hfThreeTime || 0);` })).join()).toMatch(/hf-seek/);
});

test("gsap layers pass through with no engine-specific rules", () => {
  expect(validateLayer(base({ engine: "gsap", code: `tl.to("#x", {}, 0);` }))).toEqual([]);
});
