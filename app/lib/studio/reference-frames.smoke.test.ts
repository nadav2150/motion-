// Real ffmpeg frame extraction. Gated like the renderer tests:
//   RUN_RENDER_TESTS=1 npx vitest run app/lib/studio/reference-frames.smoke.test.ts

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReferenceAnalysis } from "../reference-video";
import { ensureReferenceFrames, extractVideoFrames, selectFrameTimes } from "./reference-frames";

const run = promisify(execFile);
const ENABLED = process.env.RUN_RENDER_TESTS === "1";
const T = 120_000;

describe.skipIf(!ENABLED)("reference frame extraction (real ffmpeg)", () => {
  let dir: string;
  let mp4: Buffer;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "videly-ref-test-"));
    const file = path.join(dir, "src.mp4");
    // 6 s of 1920x1080 test pattern with a running timecode.
    await run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=1920x1080:rate=30:duration=6",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      file,
    ]);
    mp4 = await readFile(file);
  }, T);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it(
    "extracts one ≤1280 px JPEG per requested beat time",
    async () => {
      let probed: number | null = null;
      const frames = await extractVideoFrames(mp4, (d) => {
        probed = d;
        return [
          { time: 0.5, beatIndex: 0 },
          { time: 3, beatIndex: 1 },
          { time: 5.9, beatIndex: 2 },
        ];
      });
      expect(probed).toBeCloseTo(6, 0);
      expect(frames.map((f) => f.time)).toEqual([0.5, 3, 5.9]);
      for (const f of frames) {
        const meta = await sharp(f.jpeg).metadata();
        expect(meta.format).toBe("jpeg");
        expect(meta.width).toBe(1280);
        expect(meta.height).toBe(720);
      }
      // Different moments of testsrc are different images.
      expect(frames[0]!.jpeg.equals(frames[1]!.jpeg)).toBe(false);
    },
    T,
  );

  it(
    "skips times past the end instead of failing",
    async () => {
      const frames = await extractVideoFrames(mp4, () => [
        { time: 1, beatIndex: null },
        { time: 30, beatIndex: null },
      ]);
      expect(frames.map((f) => f.time)).toEqual([1]);
    },
    T,
  );

  it(
    "ensureReferenceFrames end to end (upload mocked), 10-frame fallback without beats",
    async () => {
      const analysis = {
        summary: "",
        totalDurationSeconds: 0,
        aspectRatio: "16:9",
        pacing: "",
        editingRhythm: "",
        colorPalette: [],
        typography: "",
        motionStyle: "",
        cameraMoves: "",
        transitions: [],
        audioMood: "",
        beats: [],
        suggestedScript: "",
        recreationNotes: "",
        model: "gemini",
      } satisfies ReferenceAnalysis;
      const uploaded: string[] = [];
      const out = await ensureReferenceFrames(
        { jobId: "job1", videoUrl: "https://cdn.example/ref.mp4", analysis, videoBytes: mp4 },
        {
          upload: async ({ storagePath }) => {
            uploaded.push(storagePath);
            return { storagePath, publicUrl: `https://cdn/${storagePath}` };
          },
        },
      );
      expect(out.framesError).toBeUndefined();
      expect(out.frames).toHaveLength(10);
      expect(out.frames!.map((f) => f.time)).toEqual(selectFrameTimes(analysis, 6).map((t) => t.time));
      expect(uploaded[9]).toBe("jobs/job1/v2/reference/frame-10.jpg");
    },
    T,
  );
});
