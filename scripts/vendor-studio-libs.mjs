// Re-vendor the libraries served from public/studio-libs/.
//
// Usage:
//   mkdir /tmp/vlibs && cd /tmp/vlibs
//   npm pack gsap@3.15.0 three@0.186.1 lottie-web@5.13.0 animejs@4.5.0 splitting@1.1.0 simplex-noise@4.0.3 @fontsource-variable/inter@5.3.0
//   (extract each tarball into a folder named gsap, three, lottie, anime, splitting, simplex, inter)
//   node scripts/vendor-studio-libs.mjs /tmp/vlibs
//
// Versions are pinned here and in public/studio-libs/README.md; bump both.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = resolve(process.argv[2] ?? "/tmp/vlibs");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "studio-libs");

function cp(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

// GSAP 3 (all plugins are free since 3.13).
const gsapFiles = [
  "gsap", "SplitText", "MorphSVGPlugin", "DrawSVGPlugin", "Flip", "CustomEase", "MotionPathPlugin",
  "ScrambleTextPlugin", "TextPlugin", "CustomWiggle", "CustomBounce", "EasePack", "Physics2DPlugin",
];
for (const f of gsapFiles) cp(join(src, "gsap/package/dist", `${f}.min.js`), join(out, "gsap", `${f}.min.js`));

// three.js addons (examples/jsm), mirrored under three/addons/.
const threeAddons = [
  "postprocessing/EffectComposer", "postprocessing/RenderPass", "postprocessing/UnrealBloomPass",
  "postprocessing/OutputPass", "postprocessing/ShaderPass", "postprocessing/MaskPass", "postprocessing/Pass",
  "postprocessing/AfterimagePass", "postprocessing/FilmPass", "postprocessing/FXAAPass", "postprocessing/GlitchPass",
  "shaders/CopyShader", "shaders/LuminosityHighPassShader", "shaders/OutputShader", "shaders/AfterimageShader",
  "shaders/FilmShader", "shaders/FXAAShader", "shaders/DigitalGlitch",
  "environments/RoomEnvironment", "geometries/RoundedBoxGeometry",
];
for (const f of threeAddons) cp(join(src, "three/package/examples/jsm", `${f}.js`), join(out, "three/addons", `${f}.js`));

// three.js core: minify the two ESM build files (three.module.js imports ./three.core.js).
mkdirSync(join(out, "three"), { recursive: true });
const esbuild = join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
execFileSync(esbuild, [join(src, "three/package/build/three.core.js"), "--minify", "--format=esm", `--outfile=${join(out, "three/three.core.min.js")}`], { stdio: "inherit", shell: process.platform === "win32" });
const moduleSrc = readFileSync(join(src, "three/package/build/three.module.js"), "utf8").replaceAll("'./three.core.js'", "'./three.core.min.js'");
const tmpModule = join(out, "three/.three.module.tmp.js");
writeFileSync(tmpModule, moduleSrc);
execFileSync(esbuild, [tmpModule, "--minify", "--format=esm", `--outfile=${join(out, "three/three.module.min.js")}`], { stdio: "inherit", shell: process.platform === "win32" });
(await import("node:fs")).rmSync(tmpModule);
cp(join(src, "three/package/LICENSE"), join(out, "three/LICENSE"));

cp(join(src, "lottie/package/build/player/lottie.min.js"), join(out, "lottie/lottie.min.js"));
cp(join(src, "anime/package/dist/bundles/anime.umd.min.js"), join(out, "anime/anime.umd.min.js"));
cp(join(src, "anime/package/dist/bundles/anime.esm.min.js"), join(out, "anime/anime.esm.min.js"));
for (const f of ["splitting.min.js", "splitting.css", "splitting-cells.css"]) cp(join(src, "splitting/package/dist", f), join(out, "splitting", f));
cp(join(src, "simplex/package/dist/esm/simplex-noise.js"), join(out, "simplex-noise/simplex-noise.js"));

// Inter (variable, latin + latin-ext), self-hosted.
for (const f of ["inter-latin-wght-normal.woff2", "inter-latin-ext-wght-normal.woff2", "inter-latin-wght-italic.woff2"]) {
  cp(join(src, "inter/package/files", f), join(out, "fonts/inter", f));
}
cp(join(src, "inter/package/LICENSE"), join(out, "fonts/inter/LICENSE"));

console.log("vendored into", out);
