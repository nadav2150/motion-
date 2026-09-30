import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { ReferenceAnalysis, ReferenceBeat } from "../reference-video";
import { ensureReferenceFrames, loadReferenceImages, referenceFramePath, selectFrameTimes } from "./reference-frames";

const beat = (start: number, end: number, extra: Partial<ReferenceBeat> = {}): ReferenceBeat => ({
  start,
  end,
  description: `beat ${start}`,
  onScreenText: "",
  motion: "",
  transitionOut: "",
  ...extra,
});

function analysis(over: Partial<ReferenceAnalysis> = {}): ReferenceAnalysis {
  return {
    summary: "s",
    totalDurationSeconds: 12,
    aspectRatio: "16:9",
    pacing: "",
    editingRhythm: "",
    colorPalette: [],
    typography: "",
    motionStyle: "",
    cameraMoves: "",
    transitions: [],
    audioMood: "",
    beats: [beat(0, 4), beat(4, 8), beat(8, 12)],
    suggestedScript: "",
    recreationNotes: "",
    model: "gemini",
    ...over,
  };
}

const jpeg = (w = 1600, h = 900) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg().toBuffer();

describe("selectFrameTimes", () => {
  it("takes the midpoint of each beat", () => {
    expect(selectFrameTimes(analysis(), 12)).toEqual([
      { time: 2, beatIndex: 0 },
      { time: 6, beatIndex: 1 },
      { time: 10, beatIndex: 2 },
    ]);
  });

  it("prefers a valid keyTime and ignores one outside the beat", () => {
    const a = analysis({ beats: [beat(0, 4, { keyTime: 3.5 }), beat(4, 8, { keyTime: 9 })] });
    expect(selectFrameTimes(a, 8).map((f) => f.time)).toEqual([3.5, 6]);
  });

  it("caps at 10 frames spread evenly over the beats", () => {
    const beats = Array.from({ length: 25 }, (_, i) => beat(i, i + 1));
    const picks = selectFrameTimes(analysis({ beats, totalDurationSeconds: 25 }), 25);
    expect(picks).toHaveLength(10);
    expect(picks[0]).toEqual({ time: 0.5, beatIndex: 0 });
    expect(picks.at(-1)).toEqual({ time: 24.5, beatIndex: 24 });
    const idx = picks.map((p) => p.beatIndex!);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("falls back to evenly spaced times without beats", () => {
    const picks = selectFrameTimes(analysis({ beats: [] }), 20);
    expect(picks).toHaveLength(10);
    expect(picks.map((p) => p.time)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
    expect(picks.every((p) => p.beatIndex === null)).toBe(true);
  });

  it("uses Gemini's duration when ffprobe had none, and returns nothing with no duration at all", () => {
    expect(selectFrameTimes(analysis({ beats: [] }), null, 2).map((p) => p.time)).toEqual([3, 9]);
    expect(selectFrameTimes(analysis({ beats: [], totalDurationSeconds: 0 }), null)).toEqual([]);
  });

  it("clamps to the real video and drops beats past its end", () => {
    // Gemini thought 12 s; the file is 7 s long.
    const picks = selectFrameTimes(analysis(), 7);
    expect(picks).toEqual([
      { time: 2, beatIndex: 0 },
      { time: 6, beatIndex: 1 },
    ]);
    // Beats that clamp to the same last instant collapse into one frame.
    const late = selectFrameTimes(analysis({ beats: [beat(0, 2), beat(3, 10), beat(4, 12)] }), 5);
    expect(late).toEqual([
      { time: 1, beatIndex: 0 },
      { time: 4.95, beatIndex: 1 },
    ]);
  });

  it("skips degenerate beats", () => {
    const picks = selectFrameTimes(analysis({ beats: [beat(3, 3), beat(0, 2)] }), 12);
    expect(picks).toEqual([{ time: 1, beatIndex: 1 }]);
  });
});

describe("ensureReferenceFrames", () => {
  const upload = vi.fn(async ({ storagePath }: { storagePath: string }) => ({ storagePath, publicUrl: `https://cdn/${storagePath}` }));

  it("is a no-op when frames were already stored (resume checkpoint)", async () => {
    const a = analysis({ frames: [], framesError: "earlier failure" });
    const extract = vi.fn();
    const out = await ensureReferenceFrames({ jobId: "j", videoUrl: "https://cdn/v.mp4", analysis: a }, { upload, extract });
    expect(out).toBe(a);
    expect(extract).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("YouTube: stores the public thumbnail only (maxres, then hq fallback)", async () => {
    upload.mockClear();
    const img = await jpeg(480, 360);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("maxresdefault")
        ? new Response("nope", { status: 404 })
        : new Response(new Uint8Array(img), { status: 200, headers: { "content-type": "image/jpeg" } }),
    ) as unknown as typeof fetch;
    const download = vi.fn();
    const out = await ensureReferenceFrames(
      { jobId: "job1", videoUrl: "https://youtu.be/mtPqxJBMXCQ?si=x", analysis: analysis() },
      { upload, fetchImpl, download },
    );
    expect(vi.mocked(fetchImpl).mock.calls.map((c) => String(c[0]))).toEqual([
      "https://i.ytimg.com/vi/mtPqxJBMXCQ/maxresdefault.jpg",
      "https://i.ytimg.com/vi/mtPqxJBMXCQ/hqdefault.jpg",
    ]);
    expect(download).not.toHaveBeenCalled(); // never downloads the video
    expect(out.frameSource).toBe("youtube_thumbnail");
    expect(out.frames).toEqual([
      { time: 0, beatIndex: null, path: "jobs/job1/v2/reference/frame-1.jpg", url: "https://cdn/jobs/job1/v2/reference/frame-1.jpg" },
    ]);
  });

  it("YouTube without any thumbnail records the failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const out = await ensureReferenceFrames({ jobId: "j", videoUrl: "https://www.youtube.com/watch?v=mtPqxJBMXCQ", analysis: analysis() }, { upload, fetchImpl });
    expect(out.frames).toEqual([]);
    expect(out.framesError).toMatch(/thumbnail/);
  });

  it("video: extracts at the beat times from the bytes it is given and uploads each still", async () => {
    upload.mockClear();
    const still = await jpeg(320, 180);
    const download = vi.fn();
    const extract = vi.fn(async (_bytes: Buffer, pick: (d: number | null) => { time: number; beatIndex: number | null }[]) =>
      pick(12).map((t) => ({ ...t, jpeg: still })),
    );
    const out = await ensureReferenceFrames(
      { jobId: "job1", videoUrl: "https://cdn/ref.mp4", analysis: analysis(), videoBytes: Buffer.from("mp4") },
      { upload, extract, download },
    );
    expect(download).not.toHaveBeenCalled();
    expect(extract.mock.calls[0]![0].toString()).toBe("mp4");
    expect(upload.mock.calls.map((c) => c[0].storagePath)).toEqual([1, 2, 3].map((n) => referenceFramePath("job1", n)));
    expect(out.frameSource).toBe("video");
    expect(out.frames!.map((f) => [f.time, f.beatIndex])).toEqual([
      [2, 0],
      [6, 1],
      [10, 2],
    ]);
    expect(out.framesError).toBeUndefined();
  });

  it("video on resume: re-reads an upload from our storage", async () => {
    const downloadStored = vi.fn(async () => Buffer.from("stored"));
    const download = vi.fn();
    const extract = vi.fn(async () => []);
    const out = await ensureReferenceFrames(
      { jobId: "j", videoUrl: "https://cdn/ref.mp4", analysis: analysis(), storagePath: "uploads/u/ref.mp4" },
      { upload, extract, download, downloadStored },
    );
    expect(downloadStored).toHaveBeenCalledWith("uploads/u/ref.mp4");
    expect(download).not.toHaveBeenCalled();
    expect(out.frames).toEqual([]);
    expect(out.framesError).toMatch(/No frames/);
  });

  it("never throws: a failed download is recorded", async () => {
    const out = await ensureReferenceFrames(
      { jobId: "j", videoUrl: "https://cdn/ref.mp4", analysis: analysis() },
      { upload, download: async () => Promise.reject(new Error("HTTP 403")) },
    );
    expect(out.frames).toEqual([]);
    expect(out.framesError).toBe("HTTP 403");
  });
});

describe("loadReferenceImages", () => {
  it("downloads stored stills, skips failures, marks thumbnails", async () => {
    const a = analysis({
      frameSource: "video",
      frames: [
        { time: 2, url: "u1", path: "p1", beatIndex: 0 },
        { time: 6, url: "u2", path: "p2", beatIndex: 1 },
      ],
    });
    const imgs = await loadReferenceImages(a, async (p) => {
      if (p === "p2") throw new Error("gone");
      return Buffer.from(p);
    });
    expect(imgs).toEqual([{ time: 2, beatIndex: 0, thumbnail: false, jpeg: Buffer.from("p1") }]);
    const yt = await loadReferenceImages({ ...a, frameSource: "youtube_thumbnail", frames: [a.frames![0]!] }, async () => Buffer.from("t"));
    expect(yt[0]!.thumbnail).toBe(true);
    expect(await loadReferenceImages(null, async () => Buffer.from(""))).toEqual([]);
  });
});
