// End-to-end smoke for the new hyperframes pipeline.
//
// Bypasses the HTTP layer (api.jobs.tsx is a thin pass-through; typecheck
// covers it). Calls createJob + runJob directly with a tight 2-scene
// script to keep render time short.
//
// Run: npx tsx scripts/smoke-hyperframes-pipeline.ts

import "dotenv/config";
import { createJob, runJob, getJob } from "../app/lib/jobs";

const SCRIPT = `Two sentences. One short film.`;

async function main() {
  console.log("[smoke] creating job…");
  const { jobId } = await createJob({ script: SCRIPT });
  console.log(`[smoke] jobId = ${jobId}`);

  // Run the worker synchronously so we can observe failures directly.
  console.log("[smoke] running job…");
  await runJob(jobId);

  console.log("[smoke] fetching final state…");
  const result = await getJob(jobId);
  if (!result) {
    throw new Error(`getJob returned null for ${jobId}`);
  }

  const { job, shots } = result;
  console.log("[smoke] final job state:");
  console.log("  status            =", job.status);
  console.log("  title             =", job.title);
  console.log("  shot_count        =", job.shot_count);
  console.log("  generation_mode   =", job.generation_mode);
  console.log("  final_video_url   =", job.final_video_url);
  console.log("  final_video_status=", job.final_video_status);
  console.log("  error             =", job.error);
  console.log(`  shots             = ${shots.length}`);
  for (const s of shots) {
    console.log(
      `    [${s.shot_index}] ${s.narration_part?.slice(0, 60) ?? ""} | render_status=${s.render_status} | url=${s.rendered_video_url ? "set" : "null"}`,
    );
  }

  if (job.status !== "completed") {
    process.exit(2);
  }
  if (!job.final_video_url) {
    console.error("[smoke] FAIL: final_video_url not set");
    process.exit(3);
  }
  console.log("\n[smoke] ✓ end-to-end pass");
}

main().catch((err) => {
  console.error("[smoke] FAIL:", err);
  process.exit(1);
});
