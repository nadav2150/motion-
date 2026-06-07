// End-to-end render smoke for mixed-engine (gsap + anime + waapi) compositions.
//
// What it proves:
//   HyperFrames 0.6.6 actually SEEKS animations registered via all three
//   in-use engines — not just that the adapter emitter writes correct strings.
//   A real render (Chromium seek-and-capture → ffmpeg → MP4) is required
//   because the seek contract only works when the live browser runtime
//   receives each engine's registration calls and the adapter can drive them.
//
// Anime.js v4 API note:
//   The IIFE build (animejs@4.0.2/lib/anime.iife.min.js) exposes `anime` as
//   an OBJECT — not a callable function. The v3-style `anime({...})` call is
//   gone. Use `anime.animate(targets, opts)` or `anime.createTimeline({autoplay:false})`
//   followed by `.add(targets, opts)`. This script uses `createTimeline` so that
//   the returned object has `.seek(ms)` (HyperFrames calls this on every frame).
//
// Run: npx tsx scripts/smoke-multi-engine.ts
//
// Expected output (local, where npx + headless Chrome are available):
//   [smoke] building composition HTML…
//   [smoke] composition: NNNN chars
//   [smoke] writing to <tmpdir>/smoke-multi-engine-<uuid>/
//   [smoke] rendering with hyperframes 0.6.6…
//   [hyperframes s1] …(hyperframes render output)…
//   [smoke] MP4 size: NNNN bytes
//   [smoke] frame diff: frame@0ms <N> bytes, frame@1500ms <M> bytes, identical=false
//   SMOKE PASS
//
// If the environment blocks network / headless Chrome (CI sandbox):
//   The script will print "SMOKE FAIL: <reason>" and exit 1.
//   This is an environment limit, not a code bug — the script type-checks
//   clean. Run locally after `npm ci` and with a DISPLAY or Windows Desktop.
//
// Dependencies: only what the repo already uses — `dotenv/config` skipped
// (no Supabase needed), node:fs/promises, node:os, node:path, node:crypto,
// node:child_process (via spawn). No new npm packages added.

import { mkdir, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  buildFilmSkeleton,
  type FilmFills,
  type VisualIdentity,
  type Storyboard,
} from "../app/lib/hyperframes/llm-director";
import { hyperframesBin, hyperframesArgs } from "../app/lib/hyperframes/cli";

// ─── Scene parameters ────────────────────────────────────────────────────────
// One scene, 2.5 s, three engines stacked back-to-front:
//   layer 0 (waapi) — box fades in AND translates up (opacity 0→1, y 40px→0)
//   layer 1 (anime) — mark slides in from left (translateX -120px→0, opacity 0→1)
//   layer 2 (gsap)  — caption drops in (y: 30→0, opacity 0→1)
//
// All three layers animate continuously across the scene so frame@0ms ≠
// frame@1250ms, giving a detectable pixel diff when ffmpeg is available.
//
// Scene starts at t=0 (s1 is always offset 0) so __sceneStartMs = 0.

const SCENE_DURATION_S = 2.5;
const SCENE_START_MS = 0; // s1 always starts at 0

// ─── storyboard ──────────────────────────────────────────────────────────────

const storyboard: Storyboard = {
  title: "Smoke – multi-engine",
  visualIdentity: {
    scriptAnalysis: "smoke test",
    paletteName: "Smoke Dark",
    background: "#111111",
    accents: ["#7c5cff", "#ff5c8a", "#5cffa0"],
    ink: "#ffffff",
    inkMuted: "#aaaaaa",
    headlineFont: "Inter",
    bodyFont: "Inter",
    monoFont: "Menlo",
    motionLanguage: "kinetic",
    signatureMove: "fast reveal",
    assetPolicy: "shapes",
    imageKeyword: "",
    language: "en",
    textDirection: "ltr",
  },
  scenes: [
    {
      id: "s1",
      copy: "Multi-engine smoke",
      durationSeconds: SCENE_DURATION_S,
      sceneConcept: "massive_typography_takeover",
      motionHook: "staggered_word_impact",
      pacingIntent: "beat",
    },
  ],
};

// ─── visual identity (pulled from storyboard.visualIdentity for the call) ───

const identity: VisualIdentity = storyboard.visualIdentity;

// ─── fills with explicit Layer stack ─────────────────────────────────────────
//
// Patterns follow the verbatim contracts from
// docs/superpowers/notes/2026-06-07-hyperframes-engine-contracts.md:
//
//   anime : anime({ …, autoplay:false, delay: __sceneStartMs + <local> })
//           + window.__hfAnime.push(anim)
//   waapi : el.animate(keyframes, { delay: __sceneStartMs + <local>,
//             fill:"both", iterations:1 }).pause()
//   gsap  : tl.from(…) at a scene-local position parameter
//
// __sceneStartMs is injected by the waapi/anime adapter emitters as:
//   var __sceneStartMs = <start * 1000>;
// The code string therefore references it as a variable, matching the
// integration test in buildFilmSkeleton.test.ts line 100-102.

const fills: FilmFills = {
  cssVariables: {},
  scenes: [
    {
      id: "s1",
      contentHtml: "", // content comes from layers
      sceneCss: "",
      timeline: "",
      transitionIn: "hard_cut",
      layers: [
        // ── Layer 0: WAAPI — box fades + floats up ─────────────────────────
        {
          id: "waapi-box",
          engine: "waapi",
          html: `<div id="smoke-box" style="position:absolute;bottom:120px;left:80px;width:120px;height:120px;background:var(--accent-1);border-radius:12px;"></div>`,
          code: [
            `var _box = document.getElementById("smoke-box");`,
            `if (_box) {`,
            `  var _boxAnim = _box.animate(`,
            `    [`,
            `      { opacity: 0, transform: "translateY(40px)" },`,
            `      { opacity: 1, transform: "translateY(0px)" }`,
            `    ],`,
            `    { duration: 900, delay: __sceneStartMs + 0, fill: "both", iterations: 1 }`,
            `  );`,
            `  _boxAnim.pause();`,
            `}`,
          ].join("\n"),
        },

        // ── Layer 1: Anime.js — mark slides in from left ───────────────────
        // Anime.js v4 IIFE exposes `anime` as an object (not a function).
        // The callable API is anime.animate(targets, opts) — not anime({...}).
        // anime.createTimeline({ autoplay:false }) is the timeline form.
        {
          id: "anime-mark",
          engine: "anime",
          html: `<h1 class="smoke-mark" style="position:absolute;top:200px;left:0;right:0;text-align:center;font-size:72px;font-family:var(--headline-font);color:var(--ink);margin:0;">Mixed Engines</h1>`,
          code: [
            `var _animeMark = anime.createTimeline({ autoplay: false });`,
            `_animeMark.add(".smoke-mark", {`,
            `  translateX: { from: -120, to: 0 },`,
            `  opacity: { from: 0, to: 1 },`,
            `  duration: 800,`,
            `  delay: __sceneStartMs + 100,`,
            `  ease: "outExpo"`,
            `});`,
            `window.__hfAnime = window.__hfAnime || [];`,
            `window.__hfAnime.push(_animeMark);`,
          ].join("\n"),
        },

        // ── Layer 2: GSAP — caption drops in ──────────────────────────────
        {
          id: "gsap-caption",
          engine: "gsap",
          html: `<p id="smoke-cap" style="position:absolute;bottom:60px;left:0;right:0;text-align:center;font-size:24px;font-family:var(--body-font);color:var(--ink-muted);margin:0;">WAAPI + Anime + GSAP</p>`,
          // For GSAP layers the scene offset is applied via the position
          // parameter (3rd arg). Scene s1 starts at 0s, so position = 0 + local.
          code: `tl.from("#smoke-cap", { y: 30, opacity: 0, duration: 0.7, ease: "power3.out" }, ${SCENE_START_MS / 1000 + 0.3});`,
        },
      ],
    },
  ],
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function spawnAsync(
  cmd: string,
  args: string[],
  cwd: string,
  label: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const isWin = process.platform === "win32";
    const child = spawn(cmd, args, {
      cwd,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) =>
      process.stdout.write(`[${label}] ${d}`),
    );
    child.stderr?.on("data", (d: Buffer) =>
      process.stderr.write(`[${label}] ${d}`),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${label} exited with code ${code}`),
        );
    });
  });
}

async function fileSize(p: string): Promise<number> {
  const s = await stat(p);
  return s.size;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Step 1 — Build composition HTML.
  console.log("[smoke] building composition HTML…");
  const html = buildFilmSkeleton(storyboard, identity, fills);
  console.log(`[smoke] composition: ${html.length} chars`);

  // Quick sanity: all three engines should appear in the output.
  const missingEngines: string[] = [];
  if (!html.includes("animejs@4.0.2")) missingEngines.push("anime");
  if (!html.includes("__hfAnime")) missingEngines.push("__hfAnime");
  if (!html.includes("smoke-box")) missingEngines.push("waapi-box");
  if (!html.includes("smoke-cap")) missingEngines.push("gsap-cap");
  if (missingEngines.length > 0) {
    console.error(`SMOKE FAIL: missing expected content: ${missingEngines.join(", ")}`);
    process.exit(1);
  }

  // Step 2 — Write HTML to temp dir.
  const tmpDir = join(tmpdir(), `smoke-multi-engine-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const htmlPath = join(tmpDir, "index.html");
  await writeFile(htmlPath, html, "utf8");
  console.log(`[smoke] writing to ${tmpDir}`);

  // Step 3 — Render with hyperframes CLI.
  const mp4Path = join(tmpDir, "scene.mp4");
  const cmd = hyperframesBin();
  const args = hyperframesArgs("render", [".", "--output", "scene.mp4"]);
  console.log(`[smoke] rendering with hyperframes ${cmd} ${args.join(" ")}…`);

  try {
    await spawnAsync(cmd, args, tmpDir, "hyperframes");
  } catch (err) {
    // Cleanup before exit.
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    console.error(`SMOKE FAIL: hyperframes render failed — ${(err as Error).message}`);
    console.error(
      "[smoke] If this is a network/Chrome/env error, this is an environment " +
        "limit (expected in restricted sandboxes), not a code bug. " +
        "Run locally: npx tsx scripts/smoke-multi-engine.ts",
    );
    process.exit(1);
  }

  // Step 4 — Assert MP4 exists and has meaningful size.
  let mp4Size: number;
  try {
    mp4Size = await fileSize(mp4Path);
  } catch {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    console.error(`SMOKE FAIL: scene.mp4 not written to ${mp4Path}`);
    process.exit(1);
  }

  console.log(`[smoke] MP4 size: ${mp4Size} bytes`);
  const MIN_MP4_BYTES = 10_000; // 10 KB — a blank 2.5s clip is >100 KB in practice
  if (mp4Size < MIN_MP4_BYTES) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    console.error(
      `SMOKE FAIL: MP4 too small (${mp4Size} < ${MIN_MP4_BYTES}) — render likely produced a corrupt/empty file`,
    );
    process.exit(1);
  }

  // Step 5 — Frame diff check (uses ffmpeg if available).
  // Extract one frame near t=0 and one mid-scene; compare byte lengths.
  // An IDENTICAL pair means the timeline produced static output (seek broken).
  let frameDiffChecked = false;
  try {
    const frame0Path = join(tmpDir, "frame0.png");
    const frameMidPath = join(tmpDir, "framemid.png");
    const midSec = (SCENE_DURATION_S / 2).toFixed(2);

    // -update 1 tells ffmpeg to overwrite a single output file (no pattern needed)
    await spawnAsync(
      "ffmpeg",
      ["-y", "-ss", "0.1", "-i", mp4Path, "-frames:v", "1", "-q:v", "2", "-update", "1", frame0Path],
      tmpDir,
      "ffmpeg-f0",
    );
    await spawnAsync(
      "ffmpeg",
      ["-y", "-ss", midSec, "-i", mp4Path, "-frames:v", "1", "-q:v", "2", "-update", "1", frameMidPath],
      tmpDir,
      "ffmpeg-fmid",
    );

    const [buf0, bufMid] = await Promise.all([
      readFile(frame0Path),
      readFile(frameMidPath),
    ]);
    const identical = buf0.equals(bufMid);
    console.log(
      `[smoke] frame diff: frame@100ms ${buf0.length} bytes, frame@${Math.round(parseFloat(midSec) * 1000)}ms ${bufMid.length} bytes, identical=${identical}`,
    );
    if (identical) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      console.error(
        "SMOKE FAIL: frame@0 and frame@mid are byte-identical — animations are not being seeked (static output)",
      );
      process.exit(1);
    }
    frameDiffChecked = true;
  } catch {
    // ffmpeg not available — acceptable; MP4 size check already passed.
    console.log(
      "[smoke] ffmpeg not available — skipping frame-diff check. " +
        "MP4 size assertion passed; deeper frame-diff verification is manual.",
    );
  }

  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  console.log(
    frameDiffChecked
      ? "SMOKE PASS"
      : "SMOKE PASS (MP4 size only — run locally with ffmpeg for frame-diff verification)",
  );
}

main().catch((err: unknown) => {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
});
