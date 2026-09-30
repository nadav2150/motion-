// Render any Studio (v2) HTML document to MP4 for manual checks.
//
//   npx tsx scripts/studio-render.ts <file.html> [out.mp4] [--scale 1.5] [--crf 18]
//       [--seed 1] [--duration 4] [--fps 30] [--sheet out.jpg] [--allow host,host]
//
// Width/height/fps/duration default to what the document declares in
// window.__videly. --sheet also writes a 12-frame contact sheet.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { shutdownBrowser } from "../app/lib/studio/browser";
import { makeContactSheet } from "../app/lib/studio/contact-sheet";
import { captureFrames, renderVideo, type RenderInput } from "../app/lib/studio/render";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--")));
  const [file, outArg] = positional;
  if (!file) {
    console.error("usage: npx tsx scripts/studio-render.ts <file.html> [out.mp4] [--scale n] [--crf n] [--seed n] [--sheet out.jpg]");
    process.exit(1);
  }
  const html = await readFile(file, "utf8");
  const out = outArg ?? path.join("out", `${path.basename(file, path.extname(file))}.mp4`);
  const base: RenderInput = {
    html,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 1,
    seed: Number(flag("seed") ?? 1),
    allowedHosts: (flag("allow") ?? "").split(",").filter(Boolean),
    scale: Number(flag("scale") ?? 1),
  };

  // Probe the declared metadata first.
  const probe = await captureFrames(base, []);
  const meta = probe.meta;
  const input: RenderInput = {
    ...base,
    width: meta?.width ?? base.width,
    height: meta?.height ?? base.height,
    fps: Number(flag("fps") ?? meta?.fps ?? 30),
    duration: Number(flag("duration") ?? meta?.duration ?? 5),
  };
  console.log(`document: ${input.width}x${input.height} @${input.fps}fps, ${input.duration}s, scale ${input.scale}, webgl=${probe.webglAvailable}`);

  const res = await renderVideo({
    ...input,
    outPath: out,
    crf: Number(flag("crf") ?? 18),
    onProgress: (f) => process.stdout.write(`\r${(f * 100).toFixed(0).padStart(3)}%`),
  });
  process.stdout.write("\n");
  const t = res.timings!;
  console.log(`wrote ${res.outPath}: ${res.frames} frames (${res.seconds}s video) in ${(t.totalMs / 1000).toFixed(1)}s`);
  console.log(`load ${t.loadMs} ms · per frame ${t.frameMs.toFixed(1)} ms (seek ${t.seekMs.toFixed(1)} ms, capture ${t.captureMs.toFixed(1)} ms)`);
  for (const i of res.issues) console.log(`issue [${i.kind}] ${i.message}`);

  const sheet = flag("sheet");
  if (sheet) {
    const times = Array.from({ length: 12 }, (_, i) => (i / 12) * input.duration + input.duration / 24);
    const cap = await captureFrames(input, times);
    await writeFile(sheet, await makeContactSheet(cap.frames, 4));
    console.log(`wrote ${sheet}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => shutdownBrowser());
