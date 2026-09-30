// Real-browser renderer tests. Slow (headless Chromium + ffmpeg), so gated:
//   RUN_RENDER_TESTS=1 npx vitest run app/lib/studio/render.smoke.test.ts

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shutdownBrowser } from "./browser";
import { makeContactSheet } from "./contact-sheet";
import { muxAudio } from "./mux";
import { captureFrames, renderVideo, type RenderInput } from "./render";

const run = promisify(execFile);
const ENABLED = process.env.RUN_RENDER_TESTS === "1";
const FIXTURE = path.join(__dirname, "__fixtures__", "kitchen-sink.html");
const T = 180_000;

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// Largest per-channel difference and the fraction of pixels that differ.
async function pixelDiff(a: Buffer, b: Buffer): Promise<{ maxDelta: number; changed: number }> {
  const ra = await sharp(a).raw().toBuffer({ resolveWithObject: true });
  const rb = await sharp(b).raw().toBuffer();
  const c = ra.info.channels;
  let maxDelta = 0;
  let changed = 0;
  for (let p = 0; p < ra.data.length; p += c) {
    let px = 0;
    for (let k = 0; k < Math.min(3, c); k++) px = Math.max(px, Math.abs(ra.data[p + k] - rb[p + k]));
    if (px) changed++;
    maxDelta = Math.max(maxDelta, px);
  }
  return { maxDelta, changed: changed / (ra.data.length / c) };
}

async function ffprobe(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,nb_frames", "-of", "json", file]);
  return JSON.parse(stdout) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number; nb_frames?: string }[] };
}

describe.skipIf(!ENABLED)("studio renderer (real browser)", () => {
  let input: RenderInput;
  let tmp: string;
  // 60 frames spread over the 4 s fixture: frame i is at i/15 s, so frame 30 is
  // t = 2.0 s, exactly when the fixture's setTimeout fires.
  const times = Array.from({ length: 60 }, (_, i) => i / 15);
  let firstRun: Buffer[] = [];

  beforeAll(async () => {
    input = {
      html: await readFile(FIXTURE, "utf8"),
      width: 1280,
      height: 720,
      fps: 30,
      duration: 4,
      seed: 1234,
      allowedHosts: [],
    };
    tmp = await mkdtemp(path.join(tmpdir(), "videly-render-"));
  });

  afterAll(async () => {
    await shutdownBrowser();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("renders 60 PNG frames identically twice, with WebGL and no page issues", async () => {
    const a = await captureFrames(input, times, { format: "png" });
    const b = await captureFrames(input, times, { format: "png" });
    expect(a.issues).toEqual([]);
    expect(a.webglAvailable).toBe(true);
    expect(a.meta).toEqual({ duration: 4, fps: 30, width: 1280, height: 720 });
    expect(a.frames).toHaveLength(60);
    const ha = a.frames.map((f) => sha(f.jpeg));
    const hb = b.frames.map((f) => sha(f.jpeg));
    expect(hb).toEqual(ha);
    // The video actually moves: every frame differs from the previous one.
    for (let i = 1; i < ha.length; i++) expect(ha[i], `frame ${i} equals frame ${i - 1}`).not.toBe(ha[i - 1]);
    firstRun = a.frames.map((f) => f.jpeg);
  }, T);

  it("reproduces frames after backward seeks (pure and across a fired timer)", async () => {
    expect(firstRun).toHaveLength(60);
    // 1.9 -> 1.0: no timer crossed, the shim seeks backwards in place.
    // 3.9 -> 2.0: the 2.0 s timer already fired, the renderer reloads the page.
    const r = await captureFrames(input, [1.9, 1.0, 3.9, 2.0], { format: "png" });
    const direct = await captureFrames(input, [1.0, 2.0], { format: "png" });
    expect(r.issues).toEqual([]);
    // Bit-exact against jumping straight to the same time...
    expect(sha(r.frames[1].jpeg)).toBe(sha(direct.frames[0].jpeg));
    expect(sha(r.frames[3].jpeg)).toBe(sha(direct.frames[1].jpeg));
    // ...and visually identical to the sequential render. Chrome reuses raster
    // tiles of composited layers across frames, so a history-dependent
    // antialiasing difference of a few levels on a handful of glyph pixels is
    // expected; anything larger is a real seek bug.
    for (const [frame, seq] of [[r.frames[1].jpeg, firstRun[15]], [r.frames[3].jpeg, firstRun[30]]] as const) {
      const d = await pixelDiff(frame, seq);
      expect(d.maxDelta).toBeLessThanOrEqual(8);
      expect(d.changed).toBeLessThan(0.001);
    }
  }, T);

  it("puts the linear probe where GSAP says at t = 1.0 s", async () => {
    const r = await captureFrames(input, [1.0], { format: "png" });
    const { data, info } = await sharp(r.frames[0].jpeg).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // x = 100 + 200 * t = 300 -> the 40 px box spans 300..340 at y 640..680.
    const [r1, g1, b1] = px(320, 660);
    expect(r1).toBeGreaterThan(230);
    expect(g1).toBeLessThan(30);
    expect(b1).toBeLessThan(30);
    expect(px(120, 660)[0]).toBeLessThan(100);
    expect(px(360, 660)[0]).toBeLessThan(100);
  }, T);

  it("renders an MP4 whose duration is within one frame, then muxes audio + subtitles", async () => {
    const out = path.join(tmp, "video.mp4");
    const progress: number[] = [];
    const res = await renderVideo({ ...input, outPath: out, crf: 20, onProgress: (f) => progress.push(f) });
    expect(res.frames).toBe(120);
    expect(res.issues).toEqual([]);
    expect(progress.at(-1)).toBe(1);
    const probe = await ffprobe(out);
    expect(Math.abs(Number(probe.format.duration) - 4)).toBeLessThanOrEqual(1 / 30 + 1e-6);
    const v = probe.streams.find((s) => s.codec_type === "video")!;
    expect([v.width, v.height]).toEqual([1280, 720]);

    const vo = path.join(tmp, "vo.wav");
    const music = path.join(tmp, "music.wav");
    await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5", vo]);
    await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=1.5", music]);
    const srt = path.join(tmp, "subs.srt");
    await writeFile(srt, "1\n00:00:00,500 --> 00:00:02,500\nHello from Videly\n");
    const final = path.join(tmp, "final.mp4");
    const mux = await muxAudio({ videoPath: out, voiceoverPath: vo, musicPath: music, duration: 4, outPath: final, subtitlesSrtPath: srt });
    expect(mux).toMatchObject({ hasAudio: true, reencoded: true });
    const fp = await ffprobe(final);
    expect(fp.streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
    expect(Math.abs(Number(fp.format.duration) - 4)).toBeLessThan(0.1);
  }, T);

  it("renders at deviceScaleFactor 1.5 (1080p from a 720p document)", async () => {
    const r = await captureFrames({ ...input, scale: 1.5 }, [0.5]);
    const m = await sharp(r.frames[0].jpeg).metadata();
    expect([m.width, m.height]).toEqual([1920, 1080]);
  }, T);

  it("blocks network and reports contract problems", async () => {
    const html = `<!doctype html><html><head><script>
      fetch("https://example.com/x").catch(function () {});
    </script></head><body style="margin:0;width:320px;height:180px"></body></html>`;
    const r = await captureFrames({ ...input, html, width: 320, height: 180 }, [0]);
    expect(r.meta).toBeNull();
    expect(r.issues.some((i) => i.kind === "blocked_request" && i.message.includes("https://example.com/x"))).toBe(true);
    expect(r.issues.some((i) => i.kind === "contract" && i.message.includes("__videly"))).toBe(true);
    expect(r.frames).toHaveLength(1);
  }, T);

  it("reports page errors and keeps going", async () => {
    const html = `<!doctype html><html><head><script>
      window.__videly = { duration: 1, fps: 30, width: 320, height: 180 };
      requestAnimationFrame(function () { throw new Error("boom in raf"); });
    </script></head><body style="margin:0;width:320px;height:180px;background:#123"></body></html>`;
    const r = await captureFrames({ ...input, html, width: 320, height: 180, duration: 1 }, [0, 0.5]);
    expect(r.frames).toHaveLength(2);
    expect(r.issues.some((i) => i.kind === "pageerror" && i.message.includes("boom in raf"))).toBe(true);
  }, T);

  it("times out a hung page instead of hanging the render", async () => {
    const html = `<!doctype html><html><head><script>
      window.__videly = { duration: 2, fps: 30, width: 320, height: 180 };
      setTimeout(function () { for (;;) {} }, 500);
    </script></head><body style="margin:0;width:320px;height:180px;background:#321"></body></html>`;
    const hung = { ...input, html, width: 320, height: 180, duration: 2 };
    const r = await captureFrames(hung, [0, 1, 1.5]);
    expect(r.frames).toHaveLength(1);
    expect(r.issues.some((i) => i.kind === "timeout" && i.message.includes("seek to 1.000s"))).toBe(true);
    await expect(renderVideo({ ...hung, outPath: path.join(tmp, "hung.mp4") })).rejects.toThrow(/timed out/);
    // The shared browser recovers for the next job.
    const ok = await captureFrames(input, [0.5]);
    expect(ok.frames).toHaveLength(1);
  }, T);

  it("builds a contact sheet from captured frames", async () => {
    const r = await captureFrames(input, [0.5, 1.5, 2.5, 3.5, 3.9]);
    const sheet = await makeContactSheet(r.frames, 4);
    const m = await sharp(sheet).metadata();
    expect(m.format).toBe("jpeg");
    expect(m.width).toBeGreaterThan(1000);
    expect(m.height).toBeGreaterThan(400);
  }, T);
});
