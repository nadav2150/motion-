// RAW CAPABILITY PROBE — pause MotionGlass philosophy.
//
// Question: what does GPT-4o naturally produce when given a script and
// asked to emit HyperFrames-compatible HTML/CSS/JS, with no MotionGlass
// laws, no philosophy injection, no taste protocol, no v11 calibration,
// no deterministic selector?
//
// One script. One generation pass. Minimal cleanup only if rendering
// breaks. Goal is observation, not quality.
//
// Output:
//   out/experiment-raw-llm/scene_NN/{index.html,style.css,animation.js,scene.mp4}
//   out/experiment-raw-llm/final.mp4

import "dotenv/config";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import OpenAI from "openai";

const MODEL = "gpt-4o";
const OUT_ROOT = path.join(process.cwd(), "out", "experiment-raw-llm");

// 40-second product-launch script. 6 beats, ~7s each. Deliberately
// different content from MotionGlass v11 work — clean break.
const SCRIPT: { id: string; durationSeconds: number; beat: string }[] = [
  { id: "scene_01", durationSeconds: 7, beat: "Everything used to take three days." },
  { id: "scene_02", durationSeconds: 7, beat: "Now it takes three minutes." },
  { id: "scene_03", durationSeconds: 7, beat: "Drop in. Connect. Done." },
  { id: "scene_04", durationSeconds: 7, beat: "Trusted by teams at Stripe, Linear, and Vercel." },
  { id: "scene_05", durationSeconds: 7, beat: "No setup. No exports. No friction." },
  { id: "scene_06", durationSeconds: 5, beat: "Try it free." },
];

// HyperFrames format spec — extracted from `npx hyperframes docs`.
const HYPERFRAMES_SPEC = `
HyperFrames composition format:

1. The root element MUST have:
   - id (string)
   - data-composition-id="<same id>"
   - data-width="1920"
   - data-height="1080"
   Example: <div id="root" data-composition-id="root" data-width="1920" data-height="1080">

2. Include GSAP via CDN:
   <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>

3. Create a GSAP timeline with { paused: true }, register on window.__timelines:
   const tl = gsap.timeline({ paused: true });
   window.__timelines = window.__timelines || {};
   window.__timelines["<composition-id>"] = tl;

4. Supported animation properties (use ONLY these — others won't capture):
   opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility

5. The timeline's total length defines the scene duration. Position
   parameter (3rd arg to .to/.from/.fromTo) is absolute seconds.

6. Use inline <style> for CSS — separate style.css is also fine but
   you'll emit a single index.html per scene.

7. Render canvas is 1920x1080 with a black background by default.
`.trim();

const SYSTEM_PROMPT = `You are a motion designer creating one HyperFrames composition per scene for a product launch video.

You will receive:
- a scene id
- a duration in seconds
- a single beat of copy (the voiceover / on-screen text)

For each scene, emit a SINGLE complete index.html file (self-contained, including <style> and <script>) that:
- follows the HyperFrames composition format below
- runs for exactly the requested duration
- visually expresses the beat
- uses GSAP for all animation
- is rendered at 1920x1080
- uses a dark background (#050505 or similar) and bright legible typography
- feels considered, not template

You have full creative freedom — pick the layout, motion, typography, colors, pacing. Use any HTML element, any CSS, any GSAP animation pattern compatible with the supported properties.

${HYPERFRAMES_SPEC}

Output ONLY the index.html content. No markdown fences, no commentary, no explanation. Start with <!doctype html>.`;

const client = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY ?? process.env.OPENAI_API_KEY,
});

async function generateScene(id: string, durationSeconds: number, beat: string): Promise<string> {
  console.log(`[gen] ${id} (${durationSeconds}s): "${beat}"`);
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `scene id: ${id}
duration: ${durationSeconds} seconds
beat: ${beat}

Emit one index.html for this scene.`,
      },
    ],
    temperature: 0.8,
  });
  const html = completion.choices[0]?.message?.content ?? "";
  return html.replace(/^```html\n?/i, "").replace(/```\s*$/, "").trim();
}

function spawnAsync(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const actualCmd = isWin && (cmd === "npx" || cmd === "ffmpeg") ? `${cmd}${cmd === "npx" ? ".cmd" : ""}` : cmd;
    const child = spawn(actualCmd, args, { cwd: opts.cwd, shell: isWin, stdio: ["ignore", "pipe", "pipe"] });
    const errChunks: Buffer[] = [];
    child.stdout?.on("data", (d) => process.stdout.write(`  ${d}`));
    child.stderr?.on("data", (d) => {
      errChunks.push(Buffer.from(d));
      process.stderr.write(`  ${d}`);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr: Buffer.concat(errChunks).toString("utf8") }));
  });
}

async function main() {
  await fs.mkdir(OUT_ROOT, { recursive: true });

  // ── Stage 1 — Generate ──────────────────────────────────────────────
  console.log("\n=== STAGE 1: GENERATE ===\n");
  const results: { id: string; durationSeconds: number; dir: string; renderOk: boolean }[] = [];
  for (const scene of SCRIPT) {
    const dir = path.join(OUT_ROOT, scene.id);
    await fs.mkdir(dir, { recursive: true });
    const html = await generateScene(scene.id, scene.durationSeconds, scene.beat);
    await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
    results.push({ id: scene.id, durationSeconds: scene.durationSeconds, dir, renderOk: false });
  }

  // ── Stage 2 — Render each ───────────────────────────────────────────
  console.log("\n=== STAGE 2: RENDER ===\n");
  for (const r of results) {
    console.log(`[render] ${r.id}`);
    const { code, stderr } = await spawnAsync("npx", ["hyperframes", "render", r.dir, "-o", path.join(r.dir, "scene.mp4")]);
    if (code === 0) {
      r.renderOk = true;
      console.log(`[render] ${r.id} OK`);
    } else {
      console.log(`[render] ${r.id} FAILED — leaving as-is per "no over-engineering" directive`);
      // Save stderr tail for the report.
      await fs.writeFile(path.join(r.dir, "_render_failure.log"), stderr.slice(-4000), "utf8");
    }
  }

  // ── Stage 3 — Stitch ────────────────────────────────────────────────
  console.log("\n=== STAGE 3: STITCH ===\n");
  const successful = results.filter((r) => r.renderOk);
  if (successful.length === 0) {
    console.log("[stitch] no successful renders to stitch.");
  } else {
    const concatList = successful
      .map((r) => `file '${path.join(r.dir, "scene.mp4").replace(/\\/g, "/")}'`)
      .join("\n");
    const concatFile = path.join(OUT_ROOT, "concat.txt");
    await fs.writeFile(concatFile, concatList, "utf8");
    const finalPath = path.join(OUT_ROOT, "final.mp4");
    const { code } = await spawnAsync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", concatFile,
      "-c", "copy", finalPath,
    ]);
    if (code !== 0) {
      console.log("[stitch] copy failed; trying re-encode");
      await spawnAsync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", concatFile,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        finalPath,
      ]);
    }
    console.log(`[stitch] → ${finalPath}`);
  }

  // ── Stage 4 — Summary manifest ──────────────────────────────────────
  const manifest = {
    script: SCRIPT,
    results: results.map((r) => ({ id: r.id, durationSeconds: r.durationSeconds, renderOk: r.renderOk })),
    successCount: successful.length,
    totalScenes: SCRIPT.length,
  };
  await fs.writeFile(path.join(OUT_ROOT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\n=== DONE: ${successful.length}/${SCRIPT.length} scenes rendered ===\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
