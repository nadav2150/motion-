// Render the template showcase with the real pipeline.
//
//   STUDIO_QUEUE=prod npx tsx scripts/make-showcase.ts --email you@example.com product-promo app-showcase ...
//   ... --email you@example.com product-promo=<jobId> ...   resume an existing job (no new charge)
//
// For each template: create a Studio job from the template's prompt / format /
// duration (charged to that user's credits, like any video), let the worker
// on STUDIO_QUEUE generate it, export a 1080p MP4 (no voiceover, no
// subtitles), then copy the MP4 + thumbnail to storyboards/showcase/<id>.{mp4,jpg}
// so the URLs stay stable. Prints the URLs to paste into
// app/lib/studio/templates.ts (previewVideoUrl / posterUrl).
//
// STUDIO_QUEUE=prod hands the work to the production container (same fonts
// and Chromium as real renders); without it a local `npm run worker` must be
// running on the dev queue.
import "dotenv/config";
import { getOrCreateBilling, reserveCredits } from "../app/lib/billing/credits";
import { getPlanFeatures } from "../app/lib/billing/plan-features";
import { STORYBOARDS_BUCKET, uploadBuffer } from "../app/lib/storage";
import { getSupabase } from "../app/lib/supabase";
import { getRevision, getStudioJob, jobDuration, setStage, stageOf, updateRevision } from "../app/lib/studio/db";
import { claimForOperation } from "../app/lib/studio/edit";
import { estimateStudioRender } from "../app/lib/studio/estimate";
import { parseExportOptions } from "../app/lib/studio/format";
import { createStudioJob } from "../app/lib/studio/generate";
import { enqueueClaimedOperation, studioQueue } from "../app/lib/studio/queue";
import { getTemplate } from "../app/lib/studio/templates";

const POLL_MS = 15_000;
const GENERATE_TIMEOUT_MS = 40 * 60_000;
const RENDER_TIMEOUT_MS = 30 * 60_000;

const args = process.argv.slice(2);
const emailIdx = args.indexOf("--email");
const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;
const specs = args.filter((a, i) => !a.startsWith("--") && i !== emailIdx + 1);
const ids = specs.map((s) => s.split("=")[0]!);
const resumeJob = new Map(specs.filter((s) => s.includes("=")).map((s) => s.split("=") as [string, string]));
if (!email || ids.length === 0) {
  console.error("usage: STUDIO_QUEUE=prod npx tsx scripts/make-showcase.ts --email <account> <template-id>...");
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

async function waitFor<T>(what: string, timeoutMs: number, check: () => Promise<T | null>): Promise<T> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const v = await check();
    if (v) return v;
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function copyToShowcase(srcUrl: string, dest: string, contentType: string): Promise<string> {
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`download ${srcUrl} → ${res.status}`);
  const up = await uploadBuffer({ storagePath: dest, body: Buffer.from(await res.arrayBuffer()), contentType });
  return up.publicUrl;
}

async function makeOne(templateId: string, userId: string): Promise<{ id: string; previewVideoUrl: string; posterUrl: string }> {
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

  const generated = await waitFor(`${templateId} generation`, GENERATE_TIMEOUT_MS, async () => {
    const row = await getStudioJob(jobId);
    if (!row) throw new Error(`job ${jobId} vanished`);
    const stage = stageOf(row);
    if (stage === "failed") throw new Error(`generation failed: ${row.error ?? "unknown"}`);
    // A finished generation rests at preview_ready (done only after an export).
    return (stage === "preview_ready" || stage === "done") && (row.current_revision ?? 0) > 0 ? row : null;
  });
  const revision = generated.current_revision!;
  log(templateId, `generated revision ${revision}`);

  // Same steps as POST /api/jobs/:id/render.
  const features = getPlanFeatures((await getOrCreateBilling(userId)).plan_tier);
  const parsed = parseExportOptions(
    { revision, resolution: "1080p", quality: "high", includeSubtitles: false, includeVoiceover: false, watermark: false },
    features,
  );
  if ("error" in parsed) throw new Error(`export options rejected: ${parsed.error}`);
  const restore = await claimForOperation(generated, "rendering");
  const amount = estimateStudioRender(jobDuration(generated) ?? t.duration, parsed.resolution);
  const reserve = await reserveCredits(userId, amount, jobId, `reserve:render:${jobId}:${crypto.randomUUID()}`);
  if (!reserve.ok) {
    await setStage(jobId, restore);
    throw new Error(`not enough credits to render (${reserve.required} needed)`);
  }
  await updateRevision(jobId, revision, { render_status: "queued", render_error: null, render_options: { ...parsed, revision } });
  const queued = await enqueueClaimedOperation(jobId, "render", { options: { ...parsed, revision }, restoreStage: restore });
  if (!queued.ok) throw new Error(`render enqueue failed: ${queued.error}`);
  log(templateId, `render queued`);

  const rendered = await waitFor(`${templateId} render`, RENDER_TIMEOUT_MS, async () => {
    const rev = await getRevision(jobId, revision);
    if (rev?.render_status === "failed") throw new Error(`render failed: ${rev.render_error ?? "unknown"}`);
    return rev?.render_status === "ready" && rev.video_url ? rev : null;
  });

  const thumbUrl = rendered.thumb_path
    ? getSupabase().storage.from(STORYBOARDS_BUCKET).getPublicUrl(rendered.thumb_path).data.publicUrl
    : null;
  const previewVideoUrl = await copyToShowcase(rendered.video_url!, `showcase/${templateId}.mp4`, "video/mp4");
  const posterUrl = thumbUrl ? await copyToShowcase(thumbUrl, `showcase/${templateId}.jpg`, "image/jpeg") : "";
  log(templateId, `published ${previewVideoUrl}`);
  return { id: templateId, previewVideoUrl, posterUrl };
}

const userId = await userIdFor(email);
console.log(`account ${email} → ${userId}; queue "${studioQueue()}"; templates: ${ids.join(", ")}`);
const results = await Promise.allSettled(ids.map((id) => makeOne(id, userId)));
const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
results.forEach((r, i) => r.status === "rejected" && console.error(`${ids[i]} FAILED: ${r.reason instanceof Error ? r.reason.message : r.reason}`));
console.log("\nSHOWCASE_RESULT " + JSON.stringify(ok));
process.exit(ok.length === ids.length ? 0 : 1);
