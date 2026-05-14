// Pull the latest composition.html, inject the scene-scope shim targeting
// scene 3 (offset 12s, duration 8s), then render in headless chromium and
// screenshot ~3 seconds into the scene. Expected output: VOROO brand reveal
// frame, NOT scene 1's word grid.
//
// Run: npx tsx scripts/verify-scene-scope.ts

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getSupabase } from "../app/lib/supabase";
import { STORYBOARDS_BUCKET } from "../app/lib/storage";

const db = getSupabase();
const { data: job } = await db
  .from("jobs")
  .select("id")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (!job) throw new Error("no job");

const compPath = `jobs/${job.id}/scenes/main/composition.html`;
const { data, error } = await db.storage.from(STORYBOARDS_BUCKET).download(compPath);
if (error || !data) throw new Error(error?.message ?? "no data");
const baseHtml = await data.text();

const SCOPE_START = 12;
const SCOPE_DUR = 8;
const shim = `
<script id="mg-scene-scope">
(function(){
  var START = ${SCOPE_START};
  var END = ${SCOPE_START + SCOPE_DUR};
  function attach(){
    var tl = window.__timelines && window.__timelines.main;
    if (!tl) { setTimeout(attach, 16); return; }
    tl.pause();
    tl.seek(START);
    tl.eventCallback("onUpdate", function(){
      if (tl.time() >= END) tl.seek(START);
    });
    tl.play();
  }
  attach();
})();
</script>`;

const html = baseHtml.replace("</body>", `${shim}</body>`);
const outDir = path.resolve("out", "verify-scope", job.id);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "scoped.html"), html);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: "load" });

// Let the shim attach + the timeline progress ~4s into scene 3.
await page.waitForTimeout(4000);

const diag = await page.evaluate(() => {
  // @ts-ignore
  const tl = window.__timelines && window.__timelines.main;
  const sections = Array.from(document.querySelectorAll("section.scene")) as HTMLElement[];
  return {
    timelineTime: tl ? tl.time() : null,
    visible: sections.map((s) => ({
      id: s.id,
      opacity: getComputedStyle(s).opacity,
      visibility: getComputedStyle(s).visibility,
    })),
  };
});
console.log(JSON.stringify(diag, null, 2));

await page.screenshot({ path: path.join(outDir, "after-4s.png") });
await browser.close();
console.log(`[verify] frame at ${path.join(outDir, "after-4s.png")}`);
