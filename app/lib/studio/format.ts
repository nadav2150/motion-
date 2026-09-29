// Format presets, "match reference" resolution, export scaling and the
// per-format composition rules (safe areas, type scale) the prompts quote.
// Pure — safe to import anywhere.

import {
  DEFAULT_FPS,
  DURATION_OPTIONS,
  FORMAT_PRESETS,
  type ExportOptions,
  type ExportQuality,
  type ExportResolution,
  type FormatPreset,
  type StudioFormat,
} from "./types";

type PresetKey = Exclude<StudioFormat, "match">;

const PRESET_RATIOS: { key: PresetKey; ratio: number }[] = [
  { key: "16:9", ratio: 16 / 9 },
  { key: "1:1", ratio: 1 },
  { key: "9:16", ratio: 9 / 16 },
];

/**
 * Parse whatever Gemini wrote for aspectRatio ("16:9", "9 x 16", "1.78:1",
 * "2.35", "vertical", "portrait (9:16)") into width/height. null when unknown.
 */
export function parseAspectRatio(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  const pair = s.match(/(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)/);
  if (pair) {
    const w = Number(pair[1]);
    const h = Number(pair[2]);
    if (w > 0 && h > 0) return w / h;
  }
  const single = s.match(/^(\d+(?:\.\d+)?)$/);
  if (single) {
    const r = Number(single[1]);
    if (r > 0) return r;
  }
  if (/vertical|portrait|story|stories|reel|shorts|tiktok/.test(s)) return 9 / 16;
  if (/square/.test(s)) return 1;
  if (/landscape|horizontal|widescreen/.test(s)) return 16 / 9;
  return null;
}

/** Nearest preset by log-ratio distance (so 4:5 → 1:1, 21:9 → 16:9). */
export function nearestPreset(ratio: number): FormatPreset {
  let best = PRESET_RATIOS[0]!;
  let bestDist = Infinity;
  for (const p of PRESET_RATIOS) {
    const d = Math.abs(Math.log(ratio) - Math.log(p.ratio));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return FORMAT_PRESETS[best.key];
}

/**
 * Resolve the user's format choice to a concrete preset. "match" uses the
 * reference analysis; without a usable aspect ratio it falls back to 16:9.
 */
export function resolveFormat(
  format: StudioFormat,
  reference?: { aspectRatio?: string | null } | null,
): FormatPreset {
  if (format !== "match") return FORMAT_PRESETS[format];
  const ratio = parseAspectRatio(reference?.aspectRatio ?? null);
  return ratio ? nearestPreset(ratio) : FORMAT_PRESETS["16:9"];
}

export function isStudioFormat(v: unknown): v is StudioFormat {
  return v === "16:9" || v === "9:16" || v === "1:1" || v === "match";
}

export function formatForSize(width: number, height: number): PresetKey {
  return nearestPreset(width / height).format;
}

// ─── Export scaling ────────────────────────────────────────────────────────
// Documents are always authored at the preset size (1080 on the short side).
// Export resolution scales deviceScaleFactor, so 720p renders at 2/3 and 4K
// at 2x without the document knowing.
export const RESOLUTION_SCALE: Record<ExportResolution, number> = {
  "720p": 2 / 3,
  "1080p": 1,
  "4k": 2,
};

export function exportDimensions(
  preset: { width: number; height: number },
  resolution: ExportResolution,
): { width: number; height: number; scale: number } {
  const scale = RESOLUTION_SCALE[resolution];
  // Encoders need even dimensions.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(preset.width * scale), height: even(preset.height * scale), scale };
}

export const QUALITY_CRF: Record<ExportQuality, number> = { standard: 23, high: 18 };

// ─── Duration ──────────────────────────────────────────────────────────────

/** Snap an arbitrary number to an allowed option and clamp to the plan cap. */
export function clampTargetDuration(target: number, planMax: number): number {
  const allowed = DURATION_OPTIONS.filter((d) => d <= planMax);
  const options = allowed.length > 0 ? allowed : [DURATION_OPTIONS[0]];
  if (!Number.isFinite(target)) return options[0]!;
  let best: number = options[0]!;
  for (const d of options) if (Math.abs(d - target) < Math.abs(best - target)) best = d;
  return best;
}

/** Hard ceiling for the final video length (voiceover can push past the target). */
export function maxVideoDuration(target: number, planMax: number): number {
  return Math.min(planMax + 5, Math.ceil(target * 1.3) + 2);
}

export function roundToFrame(seconds: number, fps = DEFAULT_FPS): number {
  return Math.round(seconds * fps) / fps;
}

// ─── Composition rules per format ──────────────────────────────────────────

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export type FormatGuide = {
  safeArea: SafeArea; // px the important content must stay inside of
  headlinePx: [number, number]; // min/max headline size
  bodyPx: [number, number];
  captionZone: string; // where burned-in subtitles land
  composition: string;
};

export function formatGuide(preset: FormatPreset): FormatGuide {
  switch (preset.format) {
    case "9:16":
      return {
        // Platform UI (profile, caption, buttons) covers the bottom ~20% and
        // the right rail on Reels/TikTok/Shorts.
        safeArea: { top: 220, right: 140, bottom: 420, left: 90 },
        headlinePx: [110, 200],
        bodyPx: [46, 64],
        captionZone: "y 1350–1500px (above the platform UI band)",
        composition:
          "Vertical stack: one idea per screen, headline in the upper-middle third, product/visual centered, never more than ~5 words per line. Type is BIG — a phone at arm's length. Motion travels vertically (rises, drops, vertical wipes, scroll-like pushes) more than horizontally.",
      };
    case "1:1":
      return {
        safeArea: { top: 90, right: 90, bottom: 150, left: 90 },
        headlinePx: [90, 160],
        bodyPx: [38, 54],
        captionZone: "y 880–990px",
        composition:
          "Centered or strict-grid composition; square crops punish wide layouts, so stack text over or under the visual. Use corners for small brand marks. Feed-first: the first frame must already read as an image.",
      };
    default:
      return {
        safeArea: { top: 80, right: 120, bottom: 120, left: 120 },
        headlinePx: [96, 180],
        bodyPx: [34, 48],
        captionZone: "y 900–1010px",
        composition:
          "Widescreen: use asymmetry (focal point on a third), layered depth, lateral camera moves and split layouts (text left, visual right). Headlines can run long and horizontal.",
      };
  }
}

// ─── Route helpers (pure; kept out of route modules so client bundles never
// pull server code) ────────────────────────────────────────────────────────

/** Validate an Export modal body. Watermark is forced on for plans that require it. */
export function parseExportOptions(
  body: unknown,
  plan: { watermark: boolean; export4k: boolean },
): ExportOptions | { error: string; status: number } {
  if (!body || typeof body !== "object") return { error: "Body must be ExportOptions", status: 400 };
  const b = body as Record<string, unknown>;
  const resolution = b.resolution ?? "1080p";
  if (resolution !== "720p" && resolution !== "1080p" && resolution !== "4k") {
    return { error: "resolution must be 720p, 1080p or 4k", status: 400 };
  }
  if (resolution === "4k" && !plan.export4k) return { error: "4K export needs the Pro plan", status: 403 };
  const quality = b.quality ?? "standard";
  if (quality !== "standard" && quality !== "high") return { error: "quality must be standard or high", status: 400 };
  let revision: number | undefined;
  if (b.revision !== undefined && b.revision !== null) {
    revision = Number(b.revision);
    if (!Number.isInteger(revision) || revision < 1) return { error: "Unknown revision", status: 400 };
  }
  return {
    ...(revision !== undefined ? { revision } : {}),
    resolution,
    quality,
    includeSubtitles: b.includeSubtitles === true,
    includeVoiceover: b.includeVoiceover !== false,
    watermark: plan.watermark ? true : b.watermark === true,
  };
}

/** CSP for GET /api/jobs/:id/document (docs/studio-v2-contract.md). */
export function buildDocumentCsp(storage: string | null): string {
  const s = storage ? ` https://${storage}` : "";
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'self'",
    "style-src 'unsafe-inline' 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self'${s} data: blob:`,
    `media-src 'self'${s} blob:`,
    "connect-src 'none'",
  ].join("; ");
}

/** Insert the clock shim as the first script inside <head> (or prepend when there is no head). */
export function injectShim(html: string, shimJs: string): string {
  const tag = `<script>${shimJs.replace(/<\/script/gi, "<\\/script")}</script>`;
  const head = html.match(/<head\b[^>]*>/i);
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  return tag + html;
}

export function downloadFilename(title: string | null, revision: number): string {
  const base = (title ?? "videly-video")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  return `${base || "videly-video"}-v${revision}.mp4`;
}
