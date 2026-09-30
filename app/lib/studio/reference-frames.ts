// Stills of the user's reference video, so Opus can SEE what it should match.
//
//   selectFrameTimes()       which moments to grab: each beat's key moment
//                            (Gemini's keyTime, else the beat midpoint), ≤ 10,
//                            evenly spaced when there are no beats (pure)
//   extractVideoFrames()     ffmpeg → sharp: ≤ 1280 px wide JPEG q82
//   ensureReferenceFrames()  the pipeline step: extract / fetch + upload to
//                            jobs/<id>/v2/reference/frame-<n>.jpg, returns the
//                            analysis with `frames` set (the resume checkpoint)
//   loadReferenceImages()    download the stored stills for the Opus calls
//
// YouTube links are never downloaded (YouTube ToS): the only still is the
// public thumbnail, and the detailed per-beat spec from Gemini carries the rest.

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  downloadReferenceVideo,
  isYouTubeUrl,
  youTubeThumbnailUrls,
  type ReferenceAnalysis,
  type ReferenceFrame,
} from "../reference-video";
import { uploadBuffer } from "../storage";
import { probeDuration } from "./audio";

export const MAX_REFERENCE_FRAMES = 10;
export const REFERENCE_FRAME_MAX_WIDTH = 1280;
export const REFERENCE_FRAME_QUALITY = 82;
const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FRAME_TIMEOUT_MS = 30_000;
const THUMB_TIMEOUT_MS = 15_000;

export type FrameTime = { time: number; beatIndex: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The moments to grab. One per beat (its keyTime when Gemini gave a valid one,
 * else its midpoint); more beats than `max` → an evenly spread subset of
 * beats; no usable beats → `max` evenly spaced times. Times stay inside the
 * video (a hair before the end, where the last frame still decodes).
 */
export function selectFrameTimes(
  analysis: Pick<ReferenceAnalysis, "beats" | "totalDurationSeconds">,
  videoDuration: number | null,
  max = MAX_REFERENCE_FRAMES,
): FrameTime[] {
  if (max <= 0) return [];
  const beatsEnd = Math.max(0, ...analysis.beats.map((b) => b.end || 0));
  const duration =
    videoDuration && videoDuration > 0
      ? videoDuration
      : analysis.totalDurationSeconds > 0
        ? analysis.totalDurationSeconds
        : beatsEnd;
  if (!(duration > 0)) return [];
  const last = Math.max(0, duration - 0.05);
  const clamp = (t: number) => round2(Math.min(last, Math.max(0, t)));

  const beats = analysis.beats
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start && b.start < duration);

  let picks: FrameTime[];
  if (beats.length > 0) {
    let chosen = beats;
    if (beats.length > max) {
      const idx = new Set(
        Array.from({ length: max }, (_, k) => (max === 1 ? 0 : Math.round((k * (beats.length - 1)) / (max - 1)))),
      );
      chosen = beats.filter((_, j) => idx.has(j));
    }
    picks = chosen.map(({ b, i }) => {
      const key = typeof b.keyTime === "number" && b.keyTime >= b.start && b.keyTime <= b.end ? b.keyTime : (b.start + b.end) / 2;
      return { time: clamp(key), beatIndex: i };
    });
  } else {
    picks = Array.from({ length: max }, (_, k) => ({ time: clamp(((k + 0.5) / max) * duration), beatIndex: null }));
  }

  // Beats that clamp onto the same instant (e.g. past the real end) collapse.
  const out: FrameTime[] = [];
  for (const p of picks) {
    if (!out.some((o) => Math.abs(o.time - p.time) < 0.05)) out.push(p);
  }
  return out;
}

/** Resize any image to ≤ 1280 px wide JPEG q82. */
export async function toReferenceJpeg(image: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(image)
    .rotate()
    .resize({ width: REFERENCE_FRAME_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: REFERENCE_FRAME_QUALITY, mozjpeg: true })
    .toBuffer();
}

function grabFrame(file: string, time: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      time.toFixed(3),
      "-i",
      file,
      "-frames:v",
      "1",
      "-an",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "pipe:1",
    ];
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), FRAME_TIMEOUT_MS);
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg failed to start: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code === 0 && out.length > 0) resolve(out);
      else reject(new Error(`ffmpeg frame @${time}s exited ${code}: ${stderr.trim().slice(-300) || "no image"}`));
    });
  });
}

/**
 * Extract stills from a video file's bytes. `pick` chooses the times once the
 * real duration is known (ffprobe). Frames that fail to decode are skipped.
 */
export async function extractVideoFrames(
  bytes: Buffer,
  pick: (videoDuration: number | null) => FrameTime[],
): Promise<{ time: number; beatIndex: number | null; jpeg: Buffer }[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "videly-ref-"));
  const file = path.join(dir, "reference.bin");
  try {
    await fs.writeFile(file, bytes);
    const duration = await probeDuration(file).catch(() => null);
    const times = pick(duration);
    const out: { time: number; beatIndex: number | null; jpeg: Buffer }[] = [];
    // A few at a time: each ffmpeg seeks independently.
    for (let i = 0; i < times.length; i += 3) {
      const batch = await Promise.all(
        times.slice(i, i + 3).map(async (t) => {
          try {
            return { ...t, jpeg: await toReferenceJpeg(await grabFrame(file, t.time)) };
          } catch (err) {
            console.warn(`[reference-frames] frame @${t.time}s skipped:`, err instanceof Error ? err.message : err);
            return null;
          }
        }),
      );
      for (const f of batch) if (f) out.push(f);
    }
    return out;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export function referenceFramePath(jobId: string, n: number): string {
  return `jobs/${jobId}/v2/reference/frame-${n}.jpg`;
}

async function fetchThumbnail(url: string, fetchImpl: typeof fetch): Promise<Buffer | null> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(THUMB_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get("content-type") ?? "image/").startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch {
    return null;
  }
}

export type EnsureFramesDeps = {
  upload?: typeof uploadBuffer;
  fetchImpl?: typeof fetch;
  download?: (url: string) => Promise<{ bytes: Buffer }>;
  downloadStored?: (storagePath: string) => Promise<Buffer>;
  extract?: typeof extractVideoFrames;
};

/**
 * The frames step. Skipped (returns `analysis` unchanged) when frames were
 * already extracted — `frames` present, even empty, is the checkpoint. Never
 * throws: a failure is recorded as `frames: [], framesError`.
 *
 * `videoBytes`: the bytes the analysis already downloaded (fresh runs), else
 * the file is fetched again — from our own storage when `storagePath` is set.
 */
export async function ensureReferenceFrames(
  args: {
    jobId: string;
    videoUrl: string;
    analysis: ReferenceAnalysis;
    videoBytes?: Buffer | null;
    storagePath?: string | null;
    max?: number;
  },
  deps: EnsureFramesDeps = {},
): Promise<ReferenceAnalysis> {
  const { jobId, videoUrl, analysis } = args;
  if (Array.isArray(analysis.frames)) return analysis;
  const upload = deps.upload ?? uploadBuffer;
  const max = args.max ?? MAX_REFERENCE_FRAMES;
  try {
    if (isYouTubeUrl(videoUrl)) {
      for (const url of youTubeThumbnailUrls(videoUrl)) {
        const img = await fetchThumbnail(url, deps.fetchImpl ?? fetch);
        if (!img) continue;
        const up = await upload({ storagePath: referenceFramePath(jobId, 1), body: await toReferenceJpeg(img), contentType: "image/jpeg" });
        return {
          ...analysis,
          frames: [{ time: 0, url: up.publicUrl, path: up.storagePath, beatIndex: null }],
          frameSource: "youtube_thumbnail",
        };
      }
      return { ...analysis, frames: [], frameSource: "youtube_thumbnail", framesError: "No YouTube thumbnail available." };
    }

    let bytes = args.videoBytes ?? null;
    if (!bytes) {
      if (args.storagePath && deps.downloadStored) bytes = await deps.downloadStored(args.storagePath);
      else bytes = (await (deps.download ?? downloadReferenceVideo)(videoUrl)).bytes;
    }
    const extracted = await (deps.extract ?? extractVideoFrames)(bytes, (d) => selectFrameTimes(analysis, d, max));
    const frames: ReferenceFrame[] = [];
    for (let i = 0; i < extracted.length; i++) {
      const f = extracted[i]!;
      const up = await upload({ storagePath: referenceFramePath(jobId, i + 1), body: f.jpeg, contentType: "image/jpeg" });
      frames.push({ time: f.time, url: up.publicUrl, path: up.storagePath, beatIndex: f.beatIndex });
    }
    return {
      ...analysis,
      frames,
      frameSource: "video",
      ...(frames.length ? {} : { framesError: "No frames could be extracted from the reference video." }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[studio ${jobId}] reference frames failed: ${message}`);
    return { ...analysis, frames: [], framesError: message.slice(0, 300) };
  }
}

export type ReferenceImage = {
  time: number;
  beatIndex: number | null;
  thumbnail: boolean; // a YouTube poster frame (time unknown)
  jpeg: Buffer;
};

/** Download the stored stills (skipping any that fail), capped at 10. */
export async function loadReferenceImages(
  analysis: ReferenceAnalysis | null,
  download: (storagePath: string) => Promise<Buffer>,
): Promise<ReferenceImage[]> {
  const frames = analysis?.frames ?? [];
  if (!frames.length) return [];
  const thumbnail = analysis?.frameSource === "youtube_thumbnail";
  const loaded = await Promise.all(
    frames.slice(0, MAX_REFERENCE_FRAMES).map(async (f) => {
      try {
        return { time: f.time, beatIndex: f.beatIndex, thumbnail, jpeg: await download(f.path) };
      } catch (err) {
        console.warn(`[reference-frames] could not load ${f.path}:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );
  return loaded.filter((x): x is ReferenceImage => x !== null);
}
