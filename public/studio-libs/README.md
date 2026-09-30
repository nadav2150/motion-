# studio-libs

Pinned, vendored libraries that Videly v2 ("Studio") documents may load from
`/studio-libs/`. The renderer serves these files from disk (no CDN at render
time), and the app serves them statically for the browser preview. The exact
tags and usage notes given to the director model live in
`app/lib/studio/libs.ts` (`LIBRARY_DOCS`).

Regenerate with `node scripts/vendor-studio-libs.mjs <dir-with-extracted-npm-packs>`
(see the header of that script). Bump the versions here and in the script together.

| Path | Package | Version | License |
|---|---|---|---|
| `gsap/` | gsap: core + SplitText, MorphSVGPlugin, DrawSVGPlugin, Flip, CustomEase, MotionPathPlugin, ScrambleTextPlugin, TextPlugin, CustomWiggle, CustomBounce, EasePack, Physics2DPlugin | 3.15.0 | GSAP Standard "no charge" license, https://gsap.com/standard-license (all plugins free since 3.13) |
| `three/three.module.min.js`, `three/three.core.min.js` | three: build/three.module.js + three.core.js, minified with esbuild | 0.186.1 | MIT (`three/LICENSE`) |
| `three/addons/` | three examples/jsm: postprocessing (EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, MaskPass, Pass, AfterimagePass, FilmPass, FXAAPass, GlitchPass) and their shaders, environments/RoomEnvironment, geometries/RoundedBoxGeometry | 0.186.1 | MIT (`three/LICENSE`) |
| `lottie/lottie.min.js` | lottie-web (svg/canvas/html player) | 5.13.0 | MIT |
| `anime/anime.umd.min.js`, `anime/anime.esm.min.js` | animejs | 4.5.0 | MIT (`anime/LICENSE.md`) |
| `splitting/` | splitting (js, css, cells css) | 1.1.0 | MIT |
| `simplex-noise/simplex-noise.js` | simplex-noise (ESM) | 4.0.3 | MIT |
| `fonts/inter/` | @fontsource-variable/inter (latin, latin-ext, latin italic); `inter.css` declares the family `Inter` | 5.3.0 | SIL OFL 1.1 (`fonts/inter/LICENSE`) |

Total size is about 1.9 MB.

Three.js addons import the bare specifier `three`, so documents that use them
need the import map from `LIBRARY_DOCS.three.importMap`.

Preview note: the preview iframe is sandboxed with an opaque origin, so ES
module scripts (three, simplex-noise, anime ESM) are fetched in CORS mode and
need `Access-Control-Allow-Origin: *` on `/studio-libs/*` responses.
