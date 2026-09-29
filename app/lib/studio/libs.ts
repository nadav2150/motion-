// Vendored libraries a generated document may load from /studio-libs/ (see
// public/studio-libs/README.md for versions and licenses). LIBRARY_DOCS is the
// exact text the director prompt includes; libraryHead() builds the tags.

import type { StudioLibrary } from "./types";

export const STUDIO_LIBS_BASE = "/studio-libs";

export const STUDIO_LIBRARIES: StudioLibrary[] = ["gsap", "three", "lottie", "anime", "splitting", "simplex-noise"];

export type LibraryDoc = {
  scripts: string[]; // exact tags for <head>, in order
  importMap?: Record<string, string>; // merged into one <script type="importmap">
  usage: string;
};

const GSAP_PLUGINS = ["SplitText", "CustomEase", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin", "Flip"];
const GSAP_EXTRA_PLUGINS = ["ScrambleTextPlugin", "TextPlugin", "CustomWiggle", "CustomBounce", "EasePack", "Physics2DPlugin"];

export const LIBRARY_DOCS: Record<StudioLibrary, LibraryDoc> = {
  gsap: {
    scripts: [
      `<script src="${STUDIO_LIBS_BASE}/gsap/gsap.min.js"></script>`,
      ...GSAP_PLUGINS.map((p) => `<script src="${STUDIO_LIBS_BASE}/gsap/${p}.min.js"></script>`),
    ],
    usage: [
      "GSAP 3.15 (global `gsap`) with SplitText, CustomEase, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin and Flip loaded; call `gsap.registerPlugin(SplitText, CustomEase, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, Flip)` once.",
      `Also available (add the tag yourself): ${GSAP_EXTRA_PLUGINS.map((p) => `${STUDIO_LIBS_BASE}/gsap/${p}.min.js`).join(", ")}.`,
      "Build the whole video as ONE paused master timeline and expose it: `const tl = gsap.timeline({ paused: true }); window.__videly.timeline = tl;` The renderer calls `tl.seek(t)` for every frame, so place everything with absolute positions (`tl.to(el, {...}, 3.2)`) and labels. Tweens on the global timeline also work (the renderer drives gsap.updateRoot).",
      "SplitText: `const s = SplitText.create('.headline', { type: 'chars,words', mask: 'chars' }); tl.from(s.chars, { yPercent: 110, stagger: 0.025, ease: 'expo.out', duration: 0.8 }, 0.4);` — call it after fonts are ready if the font is not self-hosted: `window.__videly.ready = document.fonts.ready.then(build)`.",
      "Do not use ScrollTrigger, Draggable, Observer or anything interactive, and never read `gsap.ticker.deltaRatio()` or accumulate per-frame deltas.",
    ].join("\n"),
  },
  three: {
    scripts: [],
    importMap: {
      three: `${STUDIO_LIBS_BASE}/three/three.module.min.js`,
      "three/addons/": `${STUDIO_LIBS_BASE}/three/addons/`,
    },
    usage: [
      "three.js r186 as an ES module: `<script type=\"module\">import * as THREE from 'three';</script>` (the import map is added for you).",
      "Addons available: three/addons/postprocessing/{EffectComposer,RenderPass,UnrealBloomPass,OutputPass,ShaderPass,AfterimagePass,FilmPass,FXAAPass,GlitchPass}.js, three/addons/environments/RoomEnvironment.js, three/addons/geometries/RoundedBoxGeometry.js.",
      "Render from absolute time in a requestAnimationFrame loop: `function frame(){ const t = performance.now() / 1000; mesh.rotation.y = t * 0.8; composer.render(); requestAnimationFrame(frame); } requestAnimationFrame(frame);` Never use THREE.Clock.getDelta() or accumulate deltas — the renderer jumps straight to each frame's time (and backwards when scrubbing).",
      "`new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })`, `renderer.setPixelRatio(window.devicePixelRatio)`, size it to the canvas CSS size. WebGL runs on a CPU rasteriser (SwiftShader): keep scenes modest (< 200k triangles, no shadow maps above 1024, at most one bloom pass).",
      "Seeded randomness: Math.random is deterministic per video, so scattering particles with it at load is fine.",
    ].join("\n"),
  },
  lottie: {
    scripts: [`<script src="${STUDIO_LIBS_BASE}/lottie/lottie.min.js"></script>`],
    usage: [
      "lottie-web 5.13 (global `lottie`). Inline the animation JSON (network is blocked) and drive it from the clock:",
      "`const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, animationData: DATA }); window.__videly.ready = new Promise(r => anim.addEventListener('DOMLoaded', r)); window.__videly.onSeek(t => anim.goToAndStop(Math.max(0, t - START) * 1000, false));`",
    ].join("\n"),
  },
  anime: {
    scripts: [`<script src="${STUDIO_LIBS_BASE}/anime/anime.umd.min.js"></script>`],
    usage: [
      "anime.js v4 (global `anime`; ESM also at /studio-libs/anime/anime.esm.min.js). `const { createTimeline, animate, stagger, utils } = anime;`",
      "Always create with `autoplay: false` and seek from the clock (times in ms): `const tl = createTimeline({ autoplay: false }); tl.add('.dot', { y: [-40, 0], delay: stagger(60) }, 500); window.__videly.onSeek(t => tl.seek(t * 1000));`",
    ].join("\n"),
  },
  splitting: {
    scripts: [
      `<link rel="stylesheet" href="${STUDIO_LIBS_BASE}/splitting/splitting.css">`,
      `<link rel="stylesheet" href="${STUDIO_LIBS_BASE}/splitting/splitting-cells.css">`,
      `<script src="${STUDIO_LIBS_BASE}/splitting/splitting.min.js"></script>`,
    ],
    usage: [
      "Splitting 1.1 (global `Splitting`). `Splitting({ target: '.title', by: 'chars' })` wraps each char in `.char` with `--char-index`; animate with CSS keyframes, e.g. `animation: rise 0.8s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(1.2s + var(--char-index) * 35ms);` — CSS animations are seeked by the renderer automatically.",
    ].join("\n"),
  },
  "simplex-noise": {
    scripts: [],
    importMap: { "simplex-noise": `${STUDIO_LIBS_BASE}/simplex-noise/simplex-noise.js` },
    usage: [
      "simplex-noise 4 as an ES module: `import { createNoise2D, createNoise3D, createNoise4D } from 'simplex-noise';` Create the noise functions ONCE at load with `createNoise3D(Math.random)` (seeded, deterministic) and sample with time as a coordinate: `noise3D(x * 0.002, y * 0.002, t * 0.3)` where `t = performance.now() / 1000`.",
    ].join("\n"),
  },
};

// Self-hosted fonts (always available, no network needed).
export const STUDIO_FONTS_DOC = [
  `Inter (variable 100-900, latin + latin-ext): <link rel="stylesheet" href="${STUDIO_LIBS_BASE}/fonts/inter/inter.css"> then font-family: 'Inter', sans-serif.`,
  "Any Google Font via <link href=\"https://fonts.googleapis.com/css2?family=...&display=block\" rel=\"stylesheet\">. System fallbacks in the renderer include Noto (Latin, Hebrew, Arabic, CJK) and Noto Color Emoji.",
].join("\n");

// How the virtual clock behaves — include in the director prompt next to the
// document contract.
export const DOCUMENT_RUNTIME_NOTES = [
  "The page runs on a virtual clock. performance.now(), Date, requestAnimationFrame, setTimeout/setInterval, CSS animations/transitions, Web Animations (element.animate), SVG SMIL and <video> all follow the video time, and Math.random / crypto.getRandomValues are seeded.",
  "For every frame the renderer calls seek(t): due timers run, GSAP's global timeline and window.__videly.timeline are seeked to t, __videly.onSeek hooks run, one requestAnimationFrame pass runs, CSS/WAAPI animations are set to t, and videos are seeked to t - data-start.",
  "Write pure functions of time: draw from `performance.now() / 1000` (seconds since the video started), never from accumulated deltas. Scrubbing and looping jump backwards; timers that already fired are not undone, so prefer timeline positions over setTimeout.",
  "window.__videly.onSeek(fn) registers fn(t) (t in seconds; may return a Promise). window.__videly.ready (optional Promise) delays the first frame until your async setup finishes (15 s cap). Fonts, <img> decoding and <video> first frames are awaited automatically.",
  "<video src=... muted playsinline data-start=\"2.5\"> starts at 2.5 s of the video; never autoplay audio (the renderer mixes voiceover and music).",
  "Network: only /studio-libs/, Google Fonts and the asset URLs you were given load; fetch/XHR/WebSocket and every other URL are blocked.",
].join("\n");

// <head> tags for a set of libraries: one merged import map first, then the
// script/link tags in a stable order.
export function libraryHead(libs: StudioLibrary[]): string {
  const ordered = STUDIO_LIBRARIES.filter((l) => libs.includes(l));
  const imports: Record<string, string> = {};
  for (const l of ordered) Object.assign(imports, LIBRARY_DOCS[l].importMap ?? {});
  const tags: string[] = [];
  if (Object.keys(imports).length) tags.push(`<script type="importmap">${JSON.stringify({ imports })}</script>`);
  for (const l of ordered) tags.push(...LIBRARY_DOCS[l].scripts);
  return tags.join("\n");
}
