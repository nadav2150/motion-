// Free-tier watermark for stitched final videos. The stitcher overlays the
// PNG produced here in the bottom-right of the final cut whenever the job
// owner is on a plan with `watermark: true` (currently only the Free tier).
//
// Build path: read public/logo.svg → rasterize to a 48px PNG → embed that
// PNG inside an outer SVG alongside "videly.io" text → render the outer
// SVG to a single watermark PNG that ffmpeg consumes as a second input.
// Cached in os.tmpdir() for the lifetime of the process so the PNG is built
// at most once.

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getOrCreateBilling } from "../billing/credits";
import { getPlanFeatures } from "../billing/plan-features";
import { getSupabase } from "../supabase";

let cachedWatermarkPath: string | null = null;

// HTML overlay injected into the HyperFrames master composition before
// headless-Chrome captures the frames. Pure inline-styled markup so it
// doesn't depend on the composition's CSS. A tiled "videly.io" pattern
// covers the whole frame (classic anti-piracy watermark) — Free users
// can't crop it out, only upgrade. Pointer-events disabled so it can
// never block the underlying motion.
//
// Used by app/lib/jobs.ts:runHyperframesExport when the job owner is on a
// plan with `watermark: true` (currently only Free).
export function buildWatermarkOverlayHtml(): string {
  // Single SVG tile containing "videly.io" rotated -30°. Background-repeat
  // tiles it across the whole overlay. Stroke is included so the text
  // stays legible on both light and dark scenes.
  const tile =
    `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='220' viewBox='0 0 360 220'>` +
    `<g transform='rotate(-30 180 110)'>` +
    `<text x='180' y='118' text-anchor='middle' ` +
    `font-family='Inter, Arial, Helvetica, sans-serif' font-size='34' font-weight='700' ` +
    `fill='rgba(255,255,255,0.95)' ` +
    `stroke='rgba(0,0,0,0.55)' stroke-width='1.2' paint-order='stroke fill' ` +
    `letter-spacing='1.5'>videly.io</text>` +
    `</g></svg>`;
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(tile)}`;

  return `
<div id="videly-watermark" style="
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  background-image: url(&quot;${dataUri}&quot;);
  background-repeat: repeat;
  background-position: 0 0;
  opacity: 0.18;
  mix-blend-mode: screen;
"></div>
`.trim();
}

// Injects the overlay just before </body>. Falls back to appending the
// snippet at the very end of the document when </body> is absent (some
// compositions ship a bare fragment without a body tag).
export function injectWatermarkOverlay(html: string): string {
  const overlay = buildWatermarkOverlayHtml();
  const bodyCloseIdx = html.lastIndexOf("</body>");
  if (bodyCloseIdx === -1) {
    return `${html}\n${overlay}`;
  }
  return html.slice(0, bodyCloseIdx) + overlay + html.slice(bodyCloseIdx);
}

// True when the job's owner is on a plan that requires the watermark.
// Anonymous / server-side jobs (no user_id) skip the watermark — they're
// almost always smoke tests.
export async function shouldApplyWatermark(jobId: string): Promise<boolean> {
  const db = getSupabase();
  const { data, error } = await db
    .from("jobs")
    .select("user_id")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data?.user_id) return false;
  const billing = await getOrCreateBilling(data.user_id as string);
  return getPlanFeatures(billing.plan_tier).watermark;
}

// Returns the absolute path to a cached watermark PNG, building it on the
// first call. Falls back to text-only when the logo SVG can't be loaded —
// "videly.io" is the load-bearing brand cue, the logo is decorative.
export async function ensureWatermarkPng(): Promise<string> {
  if (cachedWatermarkPath) return cachedWatermarkPath;

  const sharp = (await import("sharp")).default;

  // Pre-rasterize the logo to a 48px PNG before embedding in the outer SVG.
  // Nested SVG-in-SVG via data URIs is supported by librsvg in theory but
  // unreliable across versions, especially with large gradient-heavy logos.
  let logoPngB64: string | null = null;
  try {
    const logoSvg = await fs.readFile(
      path.join(process.cwd(), "public", "logo.svg"),
    );
    const logoPng = await sharp(logoSvg)
      .resize(48, 48, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    logoPngB64 = logoPng.toString("base64");
  } catch (err) {
    console.warn(
      `[watermark] failed to rasterize logo, falling back to text-only:`,
      err instanceof Error ? err.message : err,
    );
  }

  const textX = logoPngB64 ? 68 : 12;
  const watermarkSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="260" height="64" viewBox="0 0 260 64">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.7)"/>
    </filter>
  </defs>
  ${
    logoPngB64
      ? `<image href="data:image/png;base64,${logoPngB64}" x="8" y="8" width="48" height="48"/>`
      : ""
  }
  <text x="${textX}" y="42" font-family="Arial, Helvetica, sans-serif"
        font-size="26" font-weight="700" fill="white" filter="url(#shadow)">videly.io</text>
</svg>`;

  const pngBuf = await sharp(Buffer.from(watermarkSvg)).png().toBuffer();

  const wmPath = path.join(os.tmpdir(), "videly-watermark.png");
  await fs.writeFile(wmPath, pngBuf);
  cachedWatermarkPath = wmPath;
  return wmPath;
}
