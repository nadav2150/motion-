// Dump a project's job row + its scenes from Supabase so we can see what the
// editor is actually rendering against.
//
// Run: npx tsx scripts/inspect-project.ts <jobId>

import "dotenv/config";
import { getSupabase } from "../app/lib/supabase";

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: npx tsx scripts/inspect-project.ts <jobId>");
  process.exit(1);
}

const db = getSupabase();

const { data: job, error: jobErr } = await db
  .from("jobs")
  .select("*")
  .eq("id", jobId)
  .maybeSingle();
if (jobErr || !job) {
  throw new Error(`job not found: ${jobErr?.message ?? "no row"}`);
}

console.log("=== JOB ===");
console.log({
  id: job.id,
  title: job.title,
  status: job.status,
  generation_mode: job.generation_mode,
  final_video_status: job.final_video_status,
  shot_count: job.shot_count,
  brand_logo_url: job.brand_logo_url,
  brand_colors: job.brand_colors,
  brand_style: job.brand_style,
  error: job.error,
  created_at: job.created_at,
  updated_at: job.updated_at,
});

const { data: shots, error: shotsErr } = await db
  .from("shots")
  .select("id, shot_index, duration, shot_goal, status, scene_html_path, scene_thumbnail_path, rendered_video_url, render_status, clip_status, image_url")
  .eq("job_id", jobId)
  .order("shot_index", { ascending: true });
if (shotsErr) throw new Error(`shots fetch failed: ${shotsErr.message}`);

console.log(`\n=== SHOTS (${shots?.length ?? 0}) ===`);
for (const s of shots ?? []) {
  console.log(
    `s${(s.shot_index as number) + 1}  dur=${s.duration}s  status=${s.status}  render=${s.render_status}  ` +
      `html=${s.scene_html_path ? "✓" : "✗"} thumb=${s.scene_thumbnail_path ? "✓" : "✗"} video=${s.rendered_video_url ? "✓" : "✗"} ` +
      `\n      goal: ${s.shot_goal ?? "—"}` +
      (s.scene_html_path ? `\n      html: ${s.scene_html_path}` : "") +
      (s.scene_thumbnail_path ? `\n      thumb: ${s.scene_thumbnail_path}` : ""),
  );
}

const totalDur = (shots ?? []).reduce((a, s) => a + (Number(s.duration) || 0), 0);
console.log(`\nTotal duration: ${totalDur}s across ${shots?.length ?? 0} scenes`);
