// Pull the most recent composition.html from Supabase storage and dump:
//   - file size
//   - number of <section id="sN"> blocks
//   - data-start / data-duration for each section
//   - tl.set timing instructions for each scene id
// Run: npx tsx scripts/inspect-composition.ts [jobId]

import "dotenv/config";
import { getSupabase } from "../app/lib/supabase";
import { STORYBOARDS_BUCKET } from "../app/lib/storage";

const arg = process.argv[2];
const db = getSupabase();

async function pickJobId(): Promise<string> {
  if (arg) return arg;
  const { data, error } = await db
    .from("jobs")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`No jobs found: ${error?.message ?? "empty"}`);
  return data.id;
}

const jobId = await pickJobId();
const path = `jobs/${jobId}/scenes/main/composition.html`;
console.log(`[inspect] job ${jobId}`);
console.log(`[inspect] path ${path}`);

const { data, error } = await db.storage
  .from(STORYBOARDS_BUCKET)
  .download(path);
if (error || !data) {
  throw new Error(`download failed: ${error?.message ?? "no data"}`);
}
const html = await data.text();

console.log(`[inspect] html size = ${html.length} chars`);

// Count sections.
const sectionMatches = [...html.matchAll(/<section\s+id="(s\d+)"\s+class="scene[^"]*"\s+data-start="([\d.]+)"\s+data-duration="([\d.]+)"/g)];
console.log(`[inspect] found ${sectionMatches.length} <section> scene blocks:`);
for (const m of sectionMatches) {
  console.log(`  ${m[1]}: start=${m[2]}s  duration=${m[3]}s`);
}

// Visibility block: tl.set("#sN", { autoAlpha: 1 }, start)
const setMatches = [...html.matchAll(/tl\.set\("#(s\d+)",\s*\{\s*([^}]+)\s*\},\s*([\d.]+)\)/g)];
console.log(`[inspect] found ${setMatches.length} tl.set() visibility calls:`);
for (const m of setMatches) {
  console.log(`  #${m[1]}  ${m[2].trim()}  @ t=${m[3]}s`);
}

// Per-scene IIFE blocks (the LLM-authored timelines).
const iifeStarts = [...html.matchAll(/\/\/ ── (s\d+) [^\n]*offset ([\d.]+)s/g)];
console.log(`[inspect] found ${iifeStarts.length} per-scene timeline IIFEs:`);
for (const m of iifeStarts) {
  console.log(`  ${m[1]} @ offset ${m[2]}s`);
}

// Tail of the script — confirms tl.play() and total duration anchor.
const tailIdx = html.lastIndexOf("tl.set({}, {}, ");
if (tailIdx >= 0) {
  console.log(`[inspect] tail: ${html.slice(tailIdx, tailIdx + 80)}`);
}

// Dump first 4 KB so we can eyeball the head of the doc.
console.log(`\n[inspect] ─── first 1500 chars ───\n${html.slice(0, 1500)}`);

// Dump the script block (visibility + scene IIFEs).
const scriptStart = html.indexOf("<script>\n  var tl = gsap.timeline");
if (scriptStart >= 0) {
  const scriptEnd = html.indexOf("</script>", scriptStart);
  console.log(`\n[inspect] ─── script block (${scriptEnd - scriptStart} chars) ───`);
  console.log(html.slice(scriptStart, Math.min(scriptStart + 4000, scriptEnd)));
  if (scriptEnd - scriptStart > 4000) {
    console.log(`...[truncated ${scriptEnd - scriptStart - 4000} chars]...`);
    console.log(html.slice(scriptEnd - 800, scriptEnd));
  }
}
