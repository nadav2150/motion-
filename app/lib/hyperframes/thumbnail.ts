// Headless-Chromium thumbnail capture for HyperFrames scenes.
//
// Loads the scene's index.html via Playwright, waits for the GSAP timeline
// the spec requires (`window.__timelines[<composition-id>]`), pauses it at a
// "settled" frame (~70% through duration), and screenshots at 1920x1080.
//
// Also provides captureMotionTrailComposite — seeks the timeline at multiple
// offsets and blends the captured frames into a single PNG with descending
// alpha. The composite is the v2 review artifact: stills hide motion-feel,
// trails do not.

import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

const VIEWPORT_W = 1920;
const VIEWPORT_H = 1080;
const SETTLED_FRACTION = 0.7;
const TIMELINE_WAIT_MS = 4000;
const FALLBACK_HOLD_MS = 1200;

let cachedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;
  if (launching) return launching;
  launching = chromium
    .launch({ headless: true })
    .then((b) => {
      cachedBrowser = b;
      b.on("disconnected", () => {
        cachedBrowser = null;
      });
      return b;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

export type CaptureSceneThumbnailArgs = {
  html: string;
  /** Total timeline length in seconds (for the master film, this is the sum of all scene durations). */
  durationSeconds: number;
  /**
   * Absolute timestamp on the master timeline to seek to before screenshotting.
   * When omitted, falls back to SETTLED_FRACTION × durationSeconds (legacy
   * single-scene "settled frame" behavior). For a multi-scene composition,
   * pass the desired scene's midpoint here.
   */
  seekSeconds?: number;
};

export async function captureSceneThumbnail(
  args: CaptureSceneThumbnailArgs,
): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 1,
  });
  const page: Page = await context.newPage();

  try {
    await page.setContent(args.html, { waitUntil: "load" });

    // Try to pause the timeline at the requested seek (or a settled-frame
    // fallback if no seekSeconds was provided). If the LLM omitted the
    // window.__timelines registration, fall back to a fixed hold time.
    const requested =
      typeof args.seekSeconds === "number"
        ? args.seekSeconds
        : args.durationSeconds * SETTLED_FRACTION;
    const seekTime = Math.max(0, Math.min(args.durationSeconds - 0.1, requested));

    const paused = await page
      .waitForFunction(
        () => {
          const tls = (window as unknown as { __timelines?: Record<string, unknown> }).__timelines;
          return !!(tls && Object.keys(tls).length > 0);
        },
        { timeout: TIMELINE_WAIT_MS },
      )
      .then(() =>
        page.evaluate((t: number) => {
          const tls = (window as unknown as {
            __timelines?: Record<string, { pause: () => void; seek: (s: number) => void }>;
          }).__timelines;
          if (!tls) return false;
          const key = Object.keys(tls)[0];
          const tl = tls[key];
          if (!tl) return false;
          tl.pause();
          tl.seek(t);
          return true;
        }, seekTime),
      )
      .catch(() => false);

    if (!paused) {
      await page.waitForTimeout(FALLBACK_HOLD_MS);
    } else {
      // Give the browser a tick to flush the seeked frame to the compositor.
      await page.waitForTimeout(100);
    }

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H },
    });
    return Buffer.from(png);
  } finally {
    await context.close().catch(() => {});
  }
}

export type CaptureMotionTrailArgs = {
  html: string;
  /** Total timeline length in seconds. */
  durationSeconds: number;
  /**
   * Master-timeline timestamps to capture (in seconds). For a single scene
   * spanning [sceneStart, sceneStart + sceneDuration] within the master
   * timeline, pass e.g.:
   *   [sceneStart + 0.05*sceneDuration, sceneStart + 0.35*sceneDuration,
   *    sceneStart + 0.65*sceneDuration, sceneStart + 0.95*sceneDuration]
   */
  seekOffsetsSeconds: number[];
  /**
   * Alpha (0..1) for each captured frame, same length as seekOffsetsSeconds.
   * Default: ascending linear 0.25 → 1.0 so the most-recent frame is the
   * most opaque and earlier frames blur backward like a motion trail.
   */
  alphas?: number[];
};

/**
 * Capture N frames from the same composition at the requested seek offsets,
 * then composite them into a single PNG with the supplied alphas. Reuses one
 * Playwright context across all seeks (cheaper than N separate captures) and
 * returns the composited 1920×1080 PNG as a Buffer.
 */
export async function captureMotionTrailComposite(
  args: CaptureMotionTrailArgs,
): Promise<Buffer> {
  const N = args.seekOffsetsSeconds.length;
  if (N === 0) throw new Error("captureMotionTrailComposite: seekOffsetsSeconds is empty");

  const alphas = args.alphas ?? args.seekOffsetsSeconds.map((_, i) =>
    0.25 + (i / Math.max(1, N - 1)) * 0.75,
  );
  if (alphas.length !== N) {
    throw new Error(
      `captureMotionTrailComposite: alphas length (${alphas.length}) must match seekOffsetsSeconds length (${N})`,
    );
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 1,
  });
  const page: Page = await context.newPage();

  try {
    await page.setContent(args.html, { waitUntil: "load" });
    await page
      .waitForFunction(
        () => {
          const tls = (window as unknown as { __timelines?: Record<string, unknown> }).__timelines;
          return !!(tls && Object.keys(tls).length > 0);
        },
        { timeout: TIMELINE_WAIT_MS },
      )
      .catch(() => {
        // Timeline never registered. captureSceneThumbnail's fallback hold
        // strategy doesn't apply here — we just capture whatever state the
        // page settled into, then move on.
      });

    const frames: Buffer[] = [];
    for (const offset of args.seekOffsetsSeconds) {
      const seekTime = Math.max(0, Math.min(args.durationSeconds - 0.1, offset));
      await page
        .evaluate((t: number) => {
          const tls = (window as unknown as {
            __timelines?: Record<string, { pause: () => void; seek: (s: number) => void }>;
          }).__timelines;
          if (!tls) return;
          const key = Object.keys(tls)[0];
          const tl = tls[key];
          if (!tl) return;
          tl.pause();
          tl.seek(t);
        }, seekTime)
        .catch(() => {});
      // Let the compositor flush the seeked frame.
      await page.waitForTimeout(80);

      const png = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H },
      });
      frames.push(Buffer.from(png));
    }

    // Composite: opaque black base, then overlay each frame in order with
    // its alpha factor. sharp's ensureAlpha(value) sets the alpha channel to
    // value * 255 across the image; composite blend "over" then uses that
    // alpha for blending. Result is a motion-trail PNG.
    const facedFrames: Buffer[] = [];
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, Math.min(1, alphas[i]));
      const buf = await sharp(frames[i]).ensureAlpha(a).png().toBuffer();
      facedFrames.push(buf);
    }

    const base = await sharp({
      create: {
        width: VIEWPORT_W,
        height: VIEWPORT_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const composite = await sharp(base)
      .composite(facedFrames.map((input) => ({ input, blend: "over" as const })))
      .png()
      .toBuffer();

    return composite;
  } finally {
    await context.close().catch(() => {});
  }
}

export async function shutdownThumbnailBrowser(): Promise<void> {
  if (cachedBrowser) {
    await cachedBrowser.close().catch(() => {});
    cachedBrowser = null;
  }
}
