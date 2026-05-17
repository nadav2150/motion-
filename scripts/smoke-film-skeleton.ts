// Smoke: build a film skeleton from mock storyboard + identity + fills and
// run `npx hyperframes lint --json` against it. Verifies the skeleton itself
// is lint-clean by construction, independent of any LLM.
//
// Run: npx tsx scripts/smoke-film-skeleton.ts

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildFilmSkeleton,
  type FilmFills,
  type Storyboard,
  type VisualIdentity,
} from "../app/lib/hyperframes/llm-director";

const identity: VisualIdentity = {
  scriptAnalysis: "smoke test",
  paletteName: "Smoke Test",
  background: "linear-gradient(180deg, #05060B 0%, #0E1530 100%)",
  accents: ["#7AA2FF", "#A78BFA", "#67E8F9"],
  ink: "#ffffff",
  inkMuted: "rgba(255,255,255,0.65)",
  headlineFont: "Inter",
  bodyFont: "Inter",
  monoFont: "JetBrains Mono",
  motionLanguage: "editorial",
  signatureMove: "thin vertical accent bar in dominant accent on the left edge",
  assetPolicy: "type-only",
  imageKeyword: "",
  language: "en",
  textDirection: "ltr",
};

const storyboard: Storyboard = {
  title: "Smoke Film",
  visualIdentity: identity,
  scenes: [
    { id: "scene_01", copy: "Hello.", durationSeconds: 4, sceneConcept: "massive_typography_takeover", motionHook: "staggered_word_impact", pacingIntent: "beat" },
    { id: "scene_02", copy: "We make things.", durationSeconds: 5, sceneConcept: "kinetic_word_wall", motionHook: "scale_snap", pacingIntent: "cinematic" },
    { id: "scene_03", copy: "Try it.", durationSeconds: 3, sceneConcept: "glowing_ring_or_arc_or_particle_system", motionHook: "final_logo_lockup", pacingIntent: "punch" },
  ],
};

const fills: FilmFills = {
  cssVariables: {},
  scenes: [
    {
      id: "s1",
      contentHtml: `<h1 id="s1-hero" style="font-size:200px; color:var(--accent-1);">Hello.</h1>`,
      sceneCss: `#s1-hero { position: absolute; left: 120px; top: 360px; opacity: 0; }`,
      timeline: `tl.to("#s1-hero", { opacity: 1, duration: 0.6, ease: "expo.out" }, t + 0.2);`,
      transitionIn: "hard_cut",
    },
    {
      id: "s2",
      contentHtml: `<h2 id="s2-line" style="font-size:140px;">We make things.</h2>`,
      sceneCss: `#s2-line { position: absolute; left: 120px; top: 420px; opacity: 0; transform: scale(0.85); }`,
      timeline: `tl.fromTo("#s2-line", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "expo.out" }, t + 0.1);`,
      transitionIn: "hard_cut",
    },
    {
      id: "s3",
      contentHtml: `<div id="s3-cta" style="font-size:180px; color:var(--accent-1);">Try it.</div>`,
      sceneCss: `#s3-cta { position: absolute; left: 120px; top: 420px; opacity: 0; }`,
      timeline: `tl.to("#s3-cta", { opacity: 1, duration: 0.5, ease: "power3.out" }, t + 0.1);`,
      transitionIn: "shader_flash",
    },
  ],
};

async function main() {
  const html = buildFilmSkeleton(storyboard, identity, fills);
  const dir = await mkdtemp(path.join(tmpdir(), "film-skeleton-smoke-"));
  const file = path.join(dir, "index.html");
  await writeFile(file, html, "utf8");
  console.log(`[smoke] wrote skeleton to ${file} (${html.length} bytes)`);

  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";
  const args = ["hyperframes", "lint", ".", "--json"];

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const code: number | null = await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: dir, shell: isWin, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", (d) => stdoutChunks.push(Buffer.from(d)));
    child.stderr?.on("data", (d) => stderrChunks.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", resolve);
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  console.log(`[smoke] lint exit code: ${code}`);
  console.log(`[smoke] stdout:\n${stdout.trim()}`);
  if (stderr.trim()) console.log(`[smoke] stderr:\n${stderr.trim()}`);

  try {
    const parsed = JSON.parse(stdout) as { findings?: Array<{ code: string; severity: string; message: string }> };
    const errors = (parsed.findings ?? []).filter((f) => f.severity === "error");
    if (errors.length === 0) {
      console.log("[smoke] ✓ skeleton is lint-clean (0 errors)");
    } else {
      console.log(`[smoke] ✗ ${errors.length} errors:`);
      for (const e of errors) console.log(`  - [${e.code}] ${e.message}`);
    }
  } catch {
    console.log("[smoke] non-JSON lint output — see stdout above");
  }

  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
