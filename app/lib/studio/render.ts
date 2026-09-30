// Frame-by-frame renderer for Videly v2 documents.
//
// The document is loaded in headless Chromium with the virtual clock
// (clock-shim.ts) installed before any page script. For every frame we call
// window.__videlyShim.seek(t) — which advances timers, GSAP, rAF, CSS/WAAPI
// animations and videos to exactly t — and grab the compositor output with CDP
// Page.captureScreenshot. Nothing on the page moves between seeks, so the
// output is deterministic and independent of how slow the machine is.

import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { CDPSession } from "playwright";
import { newStudioContext, STUDIO_DOCUMENT_URL, withRenderSlot, type StudioContext } from "./browser";
import { buildClockShim } from "./clock-shim";
import type { VidelyDocumentMeta } from "./types";

export type RenderInput = {
  html: string; // full HTML document (the generated video)
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  seed: number; // Math.random / crypto seed for determinism
  // Extra hosts the page may load from (Supabase storage, asset mirrors).
  // /studio-libs/ and data:/blob: are always allowed; everything else is blocked.
  allowedHosts: string[];
  scale?: number; // deviceScaleFactor for 4K (2) — default 1
};

export type PageIssue = { kind: "pageerror" | "console" | "blocked_request" | "timeout" | "contract"; message: string };

export type CaptureResult = {
  frames: { time: number; jpeg: Buffer }[];
  meta: VidelyDocumentMeta | null; // what the page declared in window.__videly
  issues: PageIssue[];
  webglAvailable: boolean;
};

export type RenderVideoInput = RenderInput & {
  outPath: string; // local MP4 path
  crf?: number; // 18 = high, 23 = standard
  onProgress?: (fraction: number) => void;
};

export type RenderTimings = {
  loadMs: number; // page load + readiness gate
  frameMs: number; // average wall time per frame (seek + capture + pipe)
  seekMs: number; // average __videlyShim.seek
  captureMs: number; // average Page.captureScreenshot
  totalMs: number;
};

export type RenderVideoResult = {
  outPath: string;
  frames: number;
  seconds: number; // video length (frames / fps)
  issues: PageIssue[];
  timings?: RenderTimings;
};

// Internal/test options for captureFrames. With format "png" the `jpeg` field
// of each frame holds PNG bytes (lossless, used by the determinism tests).
export type CaptureOptions = { format?: "jpeg" | "png"; quality?: number };

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
type Encoder = ChildProcessByStdio<Writable, null, Readable>;
const JPEG_QUALITY = 92;
const SEEK_TIMEOUT_MS = 5_000;
const READY_TIMEOUT_MS = 20_000; // the shim caps its own gate at 15 s
const LOAD_TIMEOUT_MS = 30_000;
const MAX_ISSUES = 100;
// Real browser frames to wait after each seek before capturing. Composited
// layers whose scale changes (CSS/WAAPI scale animations, GSAP force3D tweens,
// will-change) are re-rastered at the new scale asynchronously; capturing
// before that finishes gives run-to-run antialiasing differences.
const SETTLE_FRAMES = 1;

// ─── session ──────────────────────────────────────────────────────────────

type Session = {
  sc: StudioContext;
  cdp: CDPSession;
  input: RenderInput;
  issues: PageIssue[];
  meta: VidelyDocumentMeta | null;
  webglAvailable: boolean;
  lastTime: number; // last seeked time, seconds
  hung: boolean; // a page call timed out; the renderer main thread may be stuck
  lastTimerAt: number; // latest fired timer due time, seconds (-1 = none)
  loadMs: number;
};

class SeekTimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new SeekTimeoutError(`${what} timed out after ${ms} ms`)), ms);
    }),
  ]);
}

// Evaluate in the page with a deadline. A timeout usually means the page's
// main thread is stuck (e.g. an infinite loop), so the session is marked hung
// and every later call fails fast instead of queueing behind it.
async function pageCall<T>(s: Session, expression: string, ms: number, what: string): Promise<T> {
  if (s.hung) throw new SeekTimeoutError(`${what}: page is unresponsive`);
  try {
    return (await withTimeout(s.sc.page.evaluate(expression), ms, what)) as T;
  } catch (err) {
    if (err instanceof SeekTimeoutError) s.hung = true;
    throw err;
  }
}

function pushIssue(issues: PageIssue[], issue: PageIssue) {
  if (issues.length >= MAX_ISSUES) return;
  if (issues.some((i) => i.kind === issue.kind && i.message === issue.message)) return;
  issues.push({ kind: issue.kind, message: issue.message.slice(0, 1000) });
}

function validateMeta(raw: unknown, input: RenderInput, issues: PageIssue[]): VidelyDocumentMeta | null {
  if (!raw || typeof raw !== "object") {
    pushIssue(issues, { kind: "contract", message: "window.__videly = { duration, fps, width, height } is missing" });
    return null;
  }
  const r = raw as Record<string, unknown>;
  const out: Partial<VidelyDocumentMeta> = {};
  for (const key of ["duration", "fps", "width", "height"] as const) {
    const v = Number(r[key]);
    if (!Number.isFinite(v) || v <= 0) {
      pushIssue(issues, { kind: "contract", message: `window.__videly.${key} must be a positive number (got ${JSON.stringify(r[key])})` });
      return null;
    }
    out[key] = v;
  }
  const meta = out as VidelyDocumentMeta;
  if (Math.round(meta.width) !== Math.round(input.width) || Math.round(meta.height) !== Math.round(input.height)) {
    pushIssue(issues, {
      kind: "contract",
      message: `document declares ${meta.width}x${meta.height} but is rendered at ${input.width}x${input.height}`,
    });
  }
  if (Math.abs(meta.duration - input.duration) > 0.5) {
    pushIssue(issues, {
      kind: "contract",
      message: `document declares duration ${meta.duration}s but the render asks for ${input.duration}s`,
    });
  }
  return meta;
}

async function loadDocument(s: Session): Promise<void> {
  const { page } = s.sc;
  const started = Date.now();
  try {
    await page.goto(STUDIO_DOCUMENT_URL, { waitUntil: "load", timeout: LOAD_TIMEOUT_MS });
  } catch (err) {
    pushIssue(s.issues, { kind: "timeout", message: `page load: ${(err as Error).message.split("\n")[0]}` });
  }
  try {
    const report = await pageCall<{ ok: boolean; timedOut: string[]; waitedMs: number } | null>(
      s,
      "window.__videlyShim ? window.__videlyShim.ready() : null",
      READY_TIMEOUT_MS,
      "readiness gate",
    );
    if (!report) {
      pushIssue(s.issues, { kind: "contract", message: "virtual clock shim did not install" });
    } else if (!report.ok) {
      pushIssue(s.issues, { kind: "timeout", message: `readiness gate timed out after 15 s waiting for: ${report.timedOut.join(", ")}` });
    }
  } catch (err) {
    pushIssue(s.issues, { kind: "timeout", message: (err as Error).message });
  }
  s.lastTime = 0;
  s.lastTimerAt = -1;
  s.loadMs = Date.now() - started;
}

async function openSession(input: RenderInput): Promise<Session> {
  if (!(input.width > 0 && input.height > 0)) throw new Error("render: width/height must be positive");
  const sc = await newStudioContext({
    width: input.width,
    height: input.height,
    scale: input.scale,
    allowedHosts: input.allowedHosts,
  });
  const s: Session = {
    sc,
    cdp: null as unknown as CDPSession,
    input,
    issues: sc.issues,
    meta: null,
    webglAvailable: false,
    lastTime: 0,
    lastTimerAt: -1,
    loadMs: 0,
    hung: false,
  };
  try {
    const { page } = sc;
    page.on("pageerror", (err) => pushIssue(s.issues, { kind: "pageerror", message: err.message || String(err) }));
    page.on("console", (msg) => {
      if (msg.type() === "error") pushIssue(s.issues, { kind: "console", message: msg.text() });
    });
    page.on("crash", () => pushIssue(s.issues, { kind: "pageerror", message: "renderer process crashed" }));
    await page.addInitScript({ content: buildClockShim({ seed: input.seed, mode: "render" }) });
    s.cdp = await sc.context.newCDPSession(page);
    const scale = input.scale && input.scale > 0 ? input.scale : 1;
    if (scale !== 1) {
      // Device-metric emulation is per CDP session: without repeating it on
      // our session, Page.captureScreenshot returns CSS-pixel (1x) images.
      await s.cdp.send("Emulation.setDeviceMetricsOverride", {
        width: Math.round(input.width),
        height: Math.round(input.height),
        deviceScaleFactor: scale,
        mobile: false,
      });
    }
    sc.setDocument(input.html);
    await loadDocument(s);

    // Read only the numeric fields: documents also hang the GSAP master timeline
    // and a ready Promise on window.__videly, and serialising that object throws
    // (which used to surface as "window.__videly is missing").
    const META_EXPR =
      "(function () { var v = window.__videly; if (!v || typeof v !== 'object') return null;" +
      " return { duration: v.duration, fps: v.fps, width: v.width, height: v.height }; })()";
    s.meta = validateMeta(await pageCall(s, META_EXPR, SEEK_TIMEOUT_MS, "reading window.__videly").catch(() => null), input, s.issues);
    s.webglAvailable = await pageCall<boolean>(
      s,
      `(function () {
        try {
          var c = document.createElement("canvas");
          var gl = c.getContext("webgl2") || c.getContext("webgl");
          if (!gl) return false;
          var ext = gl.getExtension("WEBGL_lose_context");
          if (ext) ext.loseContext();
          return true;
        } catch (e) { return false; }
      })()`,
      SEEK_TIMEOUT_MS,
      "WebGL probe",
    ).catch(() => false);
    return s;
  } catch (err) {
    await sc.close();
    throw err;
  }
}

// Seek the page to t (seconds). A backward seek across a timer that already
// fired cannot be undone in the page, so the document is reloaded instead.
async function seekTo(s: Session, t: number): Promise<void> {
  if (t < s.lastTime - 1e-9 && s.lastTimerAt > t + 1e-9) await loadDocument(s);
  const lastTimerAt = await pageCall<number>(
    s,
    `window.__videlyShim.seek(${JSON.stringify(t)}).then(function () { return window.__videlyShim.waitFrames(${SETTLE_FRAMES}); }).then(function () { return window.__videlyShim.state().lastTimerAt; })`,
    SEEK_TIMEOUT_MS,
    `seek to ${t.toFixed(3)}s`,
  );
  s.lastTime = t;
  s.lastTimerAt = typeof lastTimerAt === "number" ? lastTimerAt : -1;
}

async function captureShot(s: Session, opts: CaptureOptions = {}): Promise<Buffer> {
  const format = opts.format ?? "jpeg";
  const res = (await s.cdp.send("Page.captureScreenshot", {
    format,
    ...(format === "jpeg" ? { quality: opts.quality ?? JPEG_QUALITY } : {}),
    optimizeForSpeed: true,
    captureBeyondViewport: false,
    fromSurface: true,
  })) as { data: string };
  return Buffer.from(res.data, "base64");
}

async function collectShimIssues(s: Session) {
  if (s.hung) return;
  const shimIssues = await pageCall<string[]>(
    s,
    "window.__videlyShim ? window.__videlyShim.state().issues : []",
    SEEK_TIMEOUT_MS,
    "reading shim state",
  ).catch(() => [] as string[]);
  for (const m of shimIssues) pushIssue(s.issues, { kind: "contract", message: m });
}

// ─── captureFrames ────────────────────────────────────────────────────────

// Open the document with the virtual clock, wait for readiness, seek to each
// time and capture a JPEG. Used for validation smoke renders, contact sheets,
// thumbnails and the timeline strip. Never throws for page problems: they are
// returned as issues (a seek timeout stops capturing further frames).
export async function captureFrames(input: RenderInput, times: number[], opts: CaptureOptions = {}): Promise<CaptureResult> {
  const s = await openSession(input);
  const frames: CaptureResult["frames"] = [];
  try {
    for (const raw of times) {
      const t = Math.max(0, Number(raw) || 0);
      try {
        await seekTo(s, t);
      } catch (err) {
        pushIssue(s.issues, { kind: "timeout", message: (err as Error).message });
        break;
      }
      frames.push({ time: t, jpeg: await captureShot(s, opts) });
    }
    await collectShimIssues(s);
    return { frames, meta: s.meta, issues: s.issues, webglAvailable: s.webglAvailable };
  } finally {
    await s.sc.close();
  }
}

// ─── renderVideo ──────────────────────────────────────────────────────────

export function frameTimes(duration: number, fps: number): number[] {
  const n = Math.max(1, Math.round(duration * fps));
  return Array.from({ length: n }, (_, i) => i / fps);
}

function spawnEncoder(fps: number, crf: number, outPath: string): Encoder {
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
    // Chrome's JPEGs are full-range BT.601; convert to limited-range BT.709
    // (what players assume for HD) and force even dimensions for yuv420p.
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2:in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(fps),
    "-movflags", "+faststart",
    outPath,
  ];
  return spawn(FFMPEG_BIN, args, { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
}

// Render every frame (duration * fps) and encode an H.264 MP4 (no audio).
// Throws on a seek timeout, the wall-clock cap (duration * 20 s + 60 s) or an
// encoder failure; the error carries `issues`.
export async function renderVideo(input: RenderVideoInput): Promise<RenderVideoResult> {
  return withRenderSlot(() => renderVideoUnlocked(input));
}

async function renderVideoUnlocked(input: RenderVideoInput): Promise<RenderVideoResult> {
  const started = Date.now();
  const deadline = started + (input.duration * 20 + 60) * 1000;
  const fps = input.fps > 0 ? input.fps : 30;
  const times = frameTimes(input.duration, fps);
  const crf = input.crf ?? 18;
  await mkdir(path.dirname(path.resolve(input.outPath)), { recursive: true });

  const s = await openSession(input);
  let ff: Encoder | null = null;
  let stderr = "";
  let seekTotal = 0;
  let captureTotal = 0;
  try {
    ff = spawnEncoder(fps, crf, input.outPath);
    ff.stderr.setEncoding("utf8");
    ff.stderr.on("data", (d: string) => {
      stderr = (stderr + d).slice(-4000);
    });
    const exited = once(ff, "close") as Promise<[number | null, NodeJS.Signals | null]>;
    let encoderDead = false;
    void exited.then(() => {
      encoderDead = true;
    });
    const spawnError = once(ff, "error").then(([e]) => {
      throw new Error(`ffmpeg failed to start: ${(e as Error).message}`);
    });
    spawnError.catch(() => {});
    ff.stdin.on("error", () => {}); // EPIPE surfaces through the exit code

    for (let i = 0; i < times.length; i++) {
      if (Date.now() > deadline) {
        throw new Error(`render exceeded the wall-clock cap of ${Math.round((deadline - started) / 1000)} s at frame ${i}/${times.length}`);
      }
      if (encoderDead) throw new Error(`ffmpeg exited early: ${stderr.trim().slice(-500)}`);
      const t0 = performance.now();
      await seekTo(s, times[i]);
      const t1 = performance.now();
      const jpeg = await captureShot(s);
      const t2 = performance.now();
      seekTotal += t1 - t0;
      captureTotal += t2 - t1;
      if (!ff.stdin.write(jpeg)) {
        await Promise.race([once(ff.stdin, "drain"), exited, spawnError]);
      }
      input.onProgress?.(((i + 1) / times.length) * 0.99);
    }
    ff.stdin.end();
    const [code] = await Promise.race([exited, spawnError]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}: ${stderr.trim().slice(-500)}`);
    ff = null;
    await collectShimIssues(s);
    input.onProgress?.(1);
    const totalMs = Date.now() - started;
    return {
      outPath: input.outPath,
      frames: times.length,
      seconds: times.length / fps,
      issues: s.issues,
      timings: {
        loadMs: s.loadMs,
        frameMs: (totalMs - s.loadMs) / times.length,
        seekMs: seekTotal / times.length,
        captureMs: captureTotal / times.length,
        totalMs,
      },
    };
  } catch (err) {
    if (ff) {
      ff.kill("SIGKILL");
      await rm(input.outPath, { force: true }).catch(() => {});
    }
    const e = err instanceof Error ? err : new Error(String(err));
    (e as Error & { issues?: PageIssue[] }).issues = s.issues;
    throw e;
  } finally {
    await s.sc.close();
  }
}
