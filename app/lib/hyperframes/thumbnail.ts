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
import {
  TELEMETRY,
  type ElementKind,
  type ElementMotionSamples,
  type SceneMotionSamples,
} from "./motion-telemetry";

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

// ─── Motion telemetry sampling ───────────────────────────────────────────

export type CaptureSceneTelemetryArgs = {
  html: string;
  /** Matches the scene <section id> in the film skeleton. */
  sceneId: string;
  /** Master-timeline start of the scene, seconds. */
  sceneStartSeconds: number;
  sceneDurationSeconds: number;
  /** Total master timeline length, seconds (for seek clamping). */
  totalDurationSeconds: number;
};

// Layout reads don't need the screenshot compositor flush (80ms) — style
// application after seek is synchronous; a small wait covers WAAPI/rAF lag.
const TELEMETRY_SEEK_FLUSH_MS = 30;

type RawElementSample = {
  selector: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
};

// Runs IN THE PAGE via page.evaluate — passed as a string to avoid esbuild
// __name() helper injection that breaks Playwright's function serialization.
// First call tags up to maxElements visual leaves (direct-text elements +
// media) with data-hf-telemetry so the same element set is sampled at every
// timepoint regardless of visibility changes.
const SAMPLE_SCENE_ELEMENTS_FN = /* js */ `
(function(arg) {
  var root =
    document.getElementById(arg.sceneId) ||
    document.querySelector('[data-composition-id="' + arg.sceneId + '"]') ||
    document.body;

  var tagged = Array.from(root.querySelectorAll("[data-hf-telemetry]"));
  if (tagged.length === 0) {
    var all = Array.from(root.querySelectorAll("*"));
    function isMedia(el) {
      return ["IMG", "SVG", "CANVAS", "VIDEO"].includes(el.tagName.toUpperCase());
    }
    function hasDirectText(el) {
      return Array.from(el.childNodes).some(function(nd) {
        return nd.nodeType === 3 && (nd.textContent || "").trim().length > 0;
      });
    }
    var candidates = all.filter(function(el) {
      return !["SCRIPT", "STYLE"].includes(el.tagName.toUpperCase()) &&
        (isMedia(el) || hasDirectText(el));
    });
    candidates.sort(function(a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    var chosen = candidates.slice(0, arg.maxElements);
    chosen = chosen.filter(function(el) {
      return !chosen.some(function(other) { return other !== el && other.contains(el); });
    });
    chosen.forEach(function(el, i) {
      var cls = typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\\s+/)[0]
        : "";
      var id = el.id ? "#" + el.id : "";
      el.setAttribute(
        "data-hf-telemetry",
        el.tagName.toLowerCase() + id + cls + "@" + i
      );
      el.setAttribute("data-hf-kind", isMedia(el) ? "media" : "text");
    });
    tagged = chosen;
  }

  return tagged.map(function(el) {
    var r = el.getBoundingClientRect();
    var eff = 1;
    var node = el;
    while (node && node !== root.parentElement) {
      var cs = getComputedStyle(node);
      eff *= parseFloat(cs.opacity || "1");
      if (cs.visibility === "hidden" || cs.display === "none") eff = 0;
      node = node.parentElement;
    }
    return {
      selector: el.getAttribute("data-hf-telemetry") || "?",
      kind: el.getAttribute("data-hf-kind") || "text",
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      opacity: eff,
    };
  });
})
`;

/**
 * Sample one scene's rendered motion: seek the master timeline to N evenly
 * spaced timepoints across the scene window and read element rects/opacities
 * at each. Same seek machinery as captureMotionTrailComposite; own context.
 * Throws on page-load failure — callers treat telemetry as non-fatal.
 */
export async function captureSceneMotionTelemetry(
  args: CaptureSceneTelemetryArgs,
): Promise<SceneMotionSamples> {
  const d = args.sceneDurationSeconds;
  const sampleCount = Math.max(
    TELEMETRY.minSamples,
    Math.min(TELEMETRY.maxSamples, Math.round(d * TELEMETRY.samplesPerSecond)),
  );
  const localTimes = Array.from(
    { length: sampleCount },
    (_, i) => (i / (sampleCount - 1)) * Math.max(0.1, d - 0.05),
  );

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
          const tls = (window as unknown as { __timelines?: Record<string, unknown> })
            .__timelines;
          return !!(tls && Object.keys(tls).length > 0);
        },
        { timeout: TIMELINE_WAIT_MS },
      )
      .catch(() => {
        // No timeline — sample whatever static state the page settled into.
      });

    const perSample: RawElementSample[][] = [];
    for (const local of localTimes) {
      const seekTime = Math.max(
        0,
        Math.min(args.totalDurationSeconds - 0.1, args.sceneStartSeconds + local),
      );
      await page
        .evaluate((t: number) => {
          const tls = (window as unknown as {
            __timelines?: Record<string, { pause: () => void; seek: (s: number) => void }>;
          }).__timelines;
          if (!tls) return;
          const tl = tls[Object.keys(tls)[0]];
          if (!tl) return;
          tl.pause();
          tl.seek(t);
        }, seekTime)
        .catch(() => {});
      await page.waitForTimeout(TELEMETRY_SEEK_FLUSH_MS);
      perSample.push(
        await page.evaluate(
          // String-based evaluate avoids esbuild __name() injection that breaks
          // Playwright's function serialization when run via tsx.
          SAMPLE_SCENE_ELEMENTS_FN + `(${JSON.stringify({ sceneId: args.sceneId, maxElements: TELEMETRY.maxElements })})`,
        ) as RawElementSample[],
      );
    }

    // Assemble per-element series keyed by the minted selector. Tagging is
    // sticky, so misses should not happen; zero-rect fallback keeps series
    // aligned if they somehow do.
    const keys = perSample[0].map((raw) => raw.selector);
    const elements: ElementMotionSamples[] = keys.map((key) => {
      const rects = perSample.map((arr) => {
        const hit = arr.find((raw) => raw.selector === key);
        return hit
          ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h }
          : { x: 0, y: 0, w: 0, h: 0 };
      });
      const opacities = perSample.map(
        (arr) => arr.find((raw) => raw.selector === key)?.opacity ?? 0,
      );
      const kind: ElementKind =
        perSample[0].find((raw) => raw.selector === key)?.kind === "media"
          ? "media"
          : "text";
      return { selector: key, kind, rects, opacities };
    });

    return {
      sceneId: args.sceneId,
      sampleTimesSeconds: localTimes.map((t) => Number(t.toFixed(3))),
      durationSeconds: d,
      viewport: { w: VIEWPORT_W, h: VIEWPORT_H },
      elements,
    };
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
