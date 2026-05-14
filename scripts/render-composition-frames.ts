// Pull the latest composition.html from Supabase, run it in a headless
// Chromium with the GSAP timeline paused, seek to each scene's start +1s,
// and dump per-scene PNGs + element-visibility diagnostics.
//
// Run: npx tsx scripts/render-composition-frames.ts [jobId]

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getSupabase } from "../app/lib/supabase";
import { STORYBOARDS_BUCKET } from "../app/lib/storage";

const arg = process.argv[2];
const db = getSupabase();

const { data: row, error } = arg
  ? await db.from("jobs").select("id").eq("id", arg).maybeSingle()
  : await db
      .from("jobs")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
if (error || !row) throw new Error(`No job: ${error?.message ?? "empty"}`);
const jobId = row.id;

const compPath = `jobs/${jobId}/scenes/main/composition.html`;
console.log(`[render] job ${jobId}`);
const { data, error: dlErr } = await db.storage
  .from(STORYBOARDS_BUCKET)
  .download(compPath);
if (dlErr || !data) throw new Error(`download: ${dlErr?.message ?? "no data"}`);
const html = await data.text();

const outDir = path.resolve("out", "render-frames", jobId);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "composition.html"), html);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const logs: string[] = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.setContent(html, { waitUntil: "load" });
// Pause the timeline immediately so we can seek.
await page.evaluate(() => {
  // @ts-ignore
  if (window.__timelines && window.__timelines.main) {
    // @ts-ignore
    window.__timelines.main.pause();
  }
});

const probeTimes = [0.5, 2.5, 4.5, 5.2, 6.5, 8.5, 11.0, 13.5, 16.0, 19.0, 22.0, 28.0, 32.0, 35.0, 37.5, 39.0];
for (const t of probeTimes) {
  // Seek the timeline to t and freeze a single frame.
  const diag = await page.evaluate((seekTo) => {
    // @ts-ignore
    const tl = window.__timelines && window.__timelines.main;
    if (!tl) return { error: "no timeline" };
    tl.seek(seekTo, false);
    const sections = Array.from(document.querySelectorAll("section.scene")) as HTMLElement[];
    const visible = sections.map((s) => {
      const cs = getComputedStyle(s);
      return {
        id: s.id,
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
      };
    });
    return { t: seekTo, visible };
  }, t);
  console.log(`\n[t=${t}s]`, JSON.stringify(diag, null, 2));
  const png = path.join(outDir, `t-${String(t).padStart(5, "0")}.png`);
  await page.screenshot({ path: png, fullPage: false });
}

console.log(`\n[render] frames in ${outDir}`);
if (logs.length > 0) {
  console.log(`\n[render] page console output:`);
  for (const l of logs) console.log(`  ${l}`);
}

await browser.close();
