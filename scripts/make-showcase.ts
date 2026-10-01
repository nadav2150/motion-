// Make template showcase videos with the real pipeline.
//
//   # terminal 1 — a local worker on the dev queue (renders are fast locally)
//   DOTENV_CONFIG_PATH=../../.env npx tsx -r dotenv/config scripts/studio-worker.ts
//   # terminal 2
//   DOTENV_CONFIG_PATH=../../.env npx tsx scripts/make-showcase.ts --email you@example.com social-media-ad sale-ad ...
//   ... <template-id>=<jobId>   resume an existing job instead of creating one (no new charge)
//
// For each template: create a Studio job from the template's prompt / format /
// duration (charged to that user's credits, like any video, on STUDIO_QUEUE),
// wait for the worker to generate it and render the MP4 (generation ends with
// an automatic export), re-encode it for the web (H.264 CRF 26, faststart —
// the bucket rejects files over 50 MB and these autoplay), grab a poster frame,
// upload both to storyboards/showcase/<id>.{mp4,jpg}, then archive the job so
// it doesn't sit in that user's library. Bump SHOWCASE_VERSION in
// app/lib/studio/templates.ts and set previewVideoUrl/posterUrl afterwards.
// Needs ffmpeg/ffprobe on PATH.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reconcileJob } from "../app/lib/billing/credits";
import { uploadBuffer } from "../app/lib/storage";
import { getSupabase } from "../app/lib/supabase";
import { getRevision, getStudioJob, stageOf } from "../app/lib/studio/db";
import { createStudioJob } from "../app/lib/studio/generate";
import { studioQueue } from "../app/lib/studio/queue";
import { getTemplate } from "../app/lib/studio/templates";

const POLL_MS = 15_000;
const TIMEOUT_MS = 60 * 60_000;

const args = process.argv.slice(2);
const emailIdx = args.indexOf("--email");
const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;
const specs = args.filter((a, i) => !a.startsWith("--") && i !== emailIdx + 1);
const ids = specs.map((s) => s.split("=")[0]!);
const resumeJob = new Map(specs.filter((s) => s.includes("=")).map((s) => s.split("=") as [string, string]));
if (!email || ids.length === 0) {
  console.error("usage: npx tsx scripts/make-showcase.ts --email <account> <template-id>[=<jobId>]...");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (id: string, msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${id}: ${msg}`);

async function userIdFor(addr: string): Promise<string> {
  const db = getSupabase();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === addr.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No user with email ${addr}`);
}

async function publish(templateId: string, videoUrl: string): Promise<{ previewVideoUrl: string; posterUrl: string }> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `showcase-${templateId}-`));
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`download ${videoUrl} → ${res.status}`);
    const src = path.join(tmp, "src.mp4");
    await fs.writeFile(src, Buffer.from(await res.arrayBuffer()));
    const web = path.join(tmp, "web.mp4");
    const poster = path.join(tmp, "poster.jpg");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", web]);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).toString().trim());
    // A third of the way in skips intro fades; check posters by eye — a
    // mid-transition frame (scrambled text) makes a bad thumbnail.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(duration / 3), "-i", src, "-frames:v", "1", "-q:v", "3", poster]);
    const v = await uploadBuffer({ storagePath: `showcase/${templateId}.mp4`, body: await fs.readFile(web), contentType: "video/mp4" });
    const p = await uploadBuffer({ storagePath: `showcase/${templateId}.jpg`, body: await fs.readFile(poster), contentType: "image/jpeg" });
    return { previewVideoUrl: v.publicUrl, posterUrl: p.publicUrl };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function makeOne(templateId: string, userId: string) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown template ${templateId}`);

  let jobId = resumeJob.get(templateId);
  if (jobId) {
    log(templateId, `resuming job ${jobId}`);
  } else {
    const created = await createStudioJob(
      {
        prompt: t.prompt,
        format: t.format,
        targetDuration: t.duration,
        language: "en",
        voiceId: null,
        musicEnabled: true,
        sources: [],
        useBrandKit: false,
        templateId: t.id,
      },
      { id: userId },
    );
    jobId = created.id;
    log(templateId, `job ${jobId} queued on "${studioQueue()}" (≈${created.estimate} credits)`);
  }

  // Generation finishes with an automatic export; wait for the MP4.
  const until = Date.now() + TIMEOUT_MS;
  let lastStage = "";
  let videoUrl: string | null = null;
  while (Date.now() < until) {
    const row = await getStudioJob(jobId);
    if (!row) throw new Error(`job ${jobId} vanished`);
    const stage = stageOf(row);
    if (stage !== lastStage) log(templateId, `stage ${stage}`);
    lastStage = stage;
    if (stage === "failed") throw new Error(`generation failed: ${row.error ?? "unknown"}`);
    const rev = (row.current_revision ?? 0) > 0 ? await getRevision(jobId, row.current_revision!) : null;
    if (rev?.render_status === "ready" && rev.video_url) {
      videoUrl = rev.video_url;
      break;
    }
    if (rev?.render_status === "failed" && stage === "preview_ready") throw new Error(`export failed: ${rev.render_error ?? "unknown"}`);
    await sleep(POLL_MS);
  }
  if (!videoUrl) throw new Error("timed out waiting for the MP4");

  const urls = await publish(templateId, videoUrl);
  await getSupabase().from("jobs").update({ deleted_at: new Date().toISOString() }).eq("id", jobId);
  await reconcileJob(jobId).catch(() => {});
  log(templateId, `published ${urls.previewVideoUrl} (job archived)`);
  return { id: templateId, ...urls };
}

const userId = await userIdFor(email);
console.log(`account ${email} → ${userId}; queue "${studioQueue()}"; templates: ${ids.join(", ")}`);
const results = await Promise.allSettled(ids.map((id) => makeOne(id, userId)));
const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
results.forEach((r, i) => r.status === "rejected" && console.error(`${ids[i]} FAILED: ${r.reason instanceof Error ? r.reason.message : r.reason}`));
console.log("\nSHOWCASE_RESULT " + JSON.stringify(ok));
process.exit(ok.length === ids.length ? 0 : 1);
