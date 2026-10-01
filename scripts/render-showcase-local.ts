// Render showcase jobs on this machine instead of the production worker.
//
//   npx tsx scripts/render-showcase-local.ts <template-id>=<jobId> ...
//
// Downloads each job's current revision document, renders it with the same
// renderer + audio mix as an export (1080p, music, no voiceover/subtitles/
// watermark), re-encodes it for the web (H.264 CRF 26, faststart — the
// storage bucket rejects files over 50 MB and these autoplay on Home), and
// uploads the MP4 + a poster frame to storyboards/showcase/<template-id>.{mp4,jpg}.
// Touches no job state. Needs ffmpeg on PATH. Bump SHOWCASE_VERSION in
// app/lib/studio/templates.ts afterwards.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mixAndMux } from "../app/lib/studio/audio";
import { shutdownBrowser } from "../app/lib/studio/browser";
import { downloadBuffer, downloadText, getRevision, getStudioJob } from "../app/lib/studio/db";
import { docContextFor } from "../app/lib/studio/edit";
import { exportDimensions, QUALITY_CRF } from "../app/lib/studio/format";
import { captureFrames, renderVideo } from "../app/lib/studio/render";
import { uploadBuffer } from "../app/lib/storage";

const pairs = process.argv.slice(2).map((a) => a.split("=") as [string, string]);
if (!pairs.length || pairs.some(([t, j]) => !t || !j)) {
  console.error("usage: npx tsx scripts/render-showcase-local.ts <template-id>=<jobId> ...");
  process.exit(1);
}
const log = (id: string, msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${id}: ${msg}`);

async function renderOne(templateId: string, jobId: string) {
  const row = await getStudioJob(jobId);
  if (!row) throw new Error(`job ${jobId} not found`);
  const revision = row.current_revision ?? 0;
  const rev = revision > 0 ? await getRevision(jobId, revision) : null;
  if (!rev) throw new Error(`job ${jobId} has no generated revision yet`);
  const d = docContextFor(row);
  const html = await downloadText(rev.html_path);
  const dims = exportDimensions(d.preset, "1080p");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `showcase-${templateId}-`));
  const silent = path.join(tmp, "silent.mp4");
  const started = Date.now();
  log(templateId, `rendering rev ${revision}: ${d.preset.width}x${d.preset.height} ${d.duration}s @${d.fps}fps`);
  let last = -1;
  await renderVideo({
    html,
    width: d.preset.width,
    height: d.preset.height,
    fps: d.fps,
    duration: d.duration,
    seed: d.seed,
    allowedHosts: d.allowedHosts,
    scale: dims.scale,
    outPath: silent,
    crf: QUALITY_CRF.high,
    onProgress: (f) => {
      const pct = Math.floor(f * 10) * 10;
      if (pct !== last) {
        last = pct;
        log(templateId, `${pct}%`);
      }
    },
  });
  let musicPath: string | null = null;
  if (row.audio?.music?.path) {
    musicPath = path.join(tmp, "music.mp3");
    await fs.writeFile(musicPath, await downloadBuffer(row.audio.music.path));
  }
  const out = path.join(tmp, "video.mp4");
  await mixAndMux({ videoPath: silent, outPath: out, duration: d.duration, voiceoverPath: null, musicPath, subtitles: null });
  const web = path.join(tmp, "web.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", out, "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", web]);
  const video = await uploadBuffer({ storagePath: `showcase/${templateId}.mp4`, body: await fs.readFile(web), contentType: "video/mp4" });

  // Poster: a frame a third of the way in (past intro fades).
  const probe = await captureFrames(
    { html, width: d.preset.width, height: d.preset.height, fps: d.fps, duration: d.duration, seed: d.seed, allowedHosts: d.allowedHosts, scale: 1 },
    [Math.min(d.duration - 0.1, d.duration / 3)],
  );
  const frame = probe.frames[0];
  const poster = frame
    ? await uploadBuffer({ storagePath: `showcase/${templateId}.jpg`, body: Buffer.from(frame.jpeg), contentType: "image/jpeg" })
    : null;
  log(templateId, `done in ${Math.round((Date.now() - started) / 1000)}s → ${video.publicUrl}`);
  await fs.rm(tmp, { recursive: true, force: true });
  return { id: templateId, previewVideoUrl: video.publicUrl, posterUrl: poster?.publicUrl ?? null };
}

const results = [];
for (const [templateId, jobId] of pairs) {
  try {
    results.push(await renderOne(templateId, jobId));
  } catch (err) {
    console.error(`${templateId} FAILED: ${err instanceof Error ? err.message : err}`);
  }
}
await shutdownBrowser();
console.log("\nSHOWCASE_RESULT " + JSON.stringify(results));
process.exit(results.length === pairs.length ? 0 : 1);
