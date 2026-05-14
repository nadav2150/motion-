// Headless-Chromium thumbnail capture for HyperFrames scenes.
//
// Loads the scene's index.html via Playwright, waits for the GSAP timeline
// the spec requires (`window.__timelines[<composition-id>]`), pauses it at a
// "settled" frame (~70% through duration), and screenshots at 1920x1080.

import { chromium, type Browser, type Page } from "playwright";

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

export async function shutdownThumbnailBrowser(): Promise<void> {
  if (cachedBrowser) {
    await cachedBrowser.close().catch(() => {});
    cachedBrowser = null;
  }
}
