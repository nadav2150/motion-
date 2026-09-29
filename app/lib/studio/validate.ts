// Validation for generated Studio documents.
//
//   staticCheck(html, expect)  — pure: parse, __videly numbers, body size,
//                                network/URL policy, embedded audio, size.
//   smokeRender(html, ...)     — renders 6 frames (0,10,30,50,80,99%) with the
//                                renderer, collects page errors / blocked
//                                requests / contract issues and flags blank
//                                or static frames (sharp stats).
//   validateDocument(...)      — both, returning structured issues the repair
//                                prompt consumes.

import { captureFrames, type CaptureResult, type PageIssue } from "./render";

export type IssueSeverity = "error" | "warning";

export type ValidationIssue = {
  code:
    | "parse"
    | "meta_missing"
    | "meta_mismatch"
    | "body_size"
    | "network_api"
    | "external_url"
    | "script_src"
    | "embedded_audio"
    | "too_large"
    | "page_error"
    | "console_error"
    | "blocked_request"
    | "timeout"
    | "contract"
    | "blank_frame"
    | "static_video"
    | "render_failed";
  severity: IssueSeverity;
  message: string;
  time?: number;
};

export type ExpectedMeta = { duration: number; fps: number; width: number; height: number };

export type StaticCheckOptions = {
  expect: ExpectedMeta;
  allowedHosts: string[]; // hosts asset URLs may point to (storage, etc.)
  maxBytes?: number;
};

export const MAX_DOCUMENT_BYTES = 600 * 1024;

const ALWAYS_ALLOWED_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Namespace / spec URLs that appear in markup but are never fetched.
const NAMESPACE_URL = /^https?:\/\/(www\.)?w3\.org\//i;

const NETWORK_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /\bfetch\s*\(/, what: "fetch()" },
  { re: /\bXMLHttpRequest\b/, what: "XMLHttpRequest" },
  { re: /\bnew\s+WebSocket\b/, what: "WebSocket" },
  { re: /\bEventSource\b/, what: "EventSource" },
  { re: /\bsendBeacon\b/, what: "navigator.sendBeacon" },
  { re: /\bimportScripts\s*\(/, what: "importScripts()" },
  { re: /\bimport\s*\(\s*["'`]https?:/, what: "dynamic import from a URL" },
  { re: /<iframe\b/i, what: "<iframe>" },
  { re: /<form\b/i, what: "<form>" },
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Parse window.__videly = { duration, fps, width, height } from the source. */
export function parseVidelyMeta(html: string): Partial<ExpectedMeta> | null {
  const m = html.match(/__videly\s*=\s*\{([^}]*)\}/);
  if (!m) return null;
  const body = m[1]!;
  const out: Partial<ExpectedMeta> = {};
  for (const key of ["duration", "fps", "width", "height"] as const) {
    const km = body.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    if (km) out[key] = Number(km[1]);
  }
  return out;
}

/**
 * The pipeline knows duration/fps/size, so it owns window.__videly rather than
 * failing a whole video because the model wrote it in an unexpected shape (or
 * forgot it). When the source doesn't declare the exact expected numbers, add
 * the declaration as the first <head> script and a backfill at the end of
 * <body> that restores the numbers if the document later reassigns
 * window.__videly (e.g. `window.__videly = { timeline: tl }`).
 */
export function ensureVidelyMeta(html: string, expect: ExpectedMeta): string {
  // Always inject (idempotent via the marker): a declaration that looks right
  // in the source can still never run — e.g. it sits in a <script type="module">
  // whose import fails — which is how two finished videos failed validation.
  if (html.includes("data-videly-meta")) return html;

  const nums = `duration: ${expect.duration}, fps: ${expect.fps}, width: ${expect.width}, height: ${expect.height}`;
  const decl = `<script data-videly-meta>window.__videly = { ${nums} };</script>`;
  const backfill =
    `<script data-videly-meta>(function () { var m = { ${nums} }; var v = window.__videly;` +
    ` if (!v || typeof v !== "object") { window.__videly = m; return; } for (var k in m) v[k] = m[k]; })();</script>`;
  const head = html.match(/<head\b[^>]*>/i);
  let out = head && head.index !== undefined ? html.slice(0, head.index + head[0].length) + decl + html.slice(head.index + head[0].length) : decl + html;
  const bodyEnd = out.toLowerCase().lastIndexOf("</body>");
  out = bodyEnd !== -1 ? out.slice(0, bodyEnd) + backfill + out.slice(bodyEnd) : out + backfill;
  return out;
}

function checkBodySize(html: string, width: number, height: number): boolean {
  // Collect declarations of every CSS rule whose selector list mentions body
  // (body, html,body, html > body …) plus an inline style on <body>.
  const decls: string[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  for (const style of html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []) {
    let r: RegExpExecArray | null;
    while ((r = ruleRe.exec(style))) {
      if (/(^|[\s,>])body\b/i.test(r[1]!.replace(/<style[^>]*>/i, ""))) decls.push(r[2]!);
    }
  }
  const inline = html.match(/<body\b[^>]*\bstyle\s*=\s*"([^"]*)"/i);
  if (inline) decls.push(inline[1]!);
  const all = decls.join(";");
  const w = new RegExp(`(^|[;\\s{])width\\s*:\\s*${width}px`, "i").test(all);
  const h = new RegExp(`(^|[;\\s{])height\\s*:\\s*${height}px`, "i").test(all);
  return w && h;
}

export function staticCheck(html: string, opts: StaticCheckOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: ValidationIssue["code"], message: string) => issues.push({ code, severity: "error", message });
  const warn = (code: ValidationIssue["code"], message: string) => issues.push({ code, severity: "warning", message });

  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html) || !/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    err("parse", "Not a complete HTML document (needs <html>, <head>, <body> and </html>).");
    return issues;
  }

  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > (opts.maxBytes ?? MAX_DOCUMENT_BYTES)) {
    err("too_large", `Document is ${Math.round(bytes / 1024)} KB; keep it under ${Math.round((opts.maxBytes ?? MAX_DOCUMENT_BYTES) / 1024)} KB.`);
  }

  // __videly declared in <head>, with numbers matching the expected values.
  const headEnd = html.search(/<\/head>/i);
  const metaIdx = html.search(/__videly\s*=/);
  const meta = parseVidelyMeta(html);
  if (!meta || metaIdx === -1) {
    err("meta_missing", "window.__videly = { duration, fps, width, height } is missing.");
  } else {
    if (headEnd !== -1 && metaIdx > headEnd) {
      err("meta_missing", "window.__videly must be set synchronously inside <head>, before other scripts.");
    }
    const e = opts.expect;
    for (const key of ["duration", "fps", "width", "height"] as const) {
      const v = meta[key];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        err("meta_missing", `window.__videly.${key} must be a number literal (expected ${e[key]}).`);
      } else if (key === "duration" ? Math.abs(v - e.duration) > 0.5 : v !== e[key]) {
        err("meta_mismatch", `window.__videly.${key} is ${v}; expected ${e[key]}.`);
      }
    }
  }

  if (!checkBodySize(html, opts.expect.width, opts.expect.height)) {
    err("body_size", `<body> must be exactly ${opts.expect.width}px x ${opts.expect.height}px (width/height in a body CSS rule), margin:0, overflow:hidden.`);
  }

  // Only scan scripts/markup, not text nodes — good enough in practice.
  for (const p of NETWORK_PATTERNS) {
    if (p.re.test(html)) err("network_api", `Disallowed network/embedding API: ${p.what}.`);
  }
  if (/<audio\b/i.test(html) || /new\s+Audio\s*\(/.test(html)) {
    err("embedded_audio", "Audio must not be embedded in the document; the renderer muxes voiceover and music.");
  }

  // <script src> must be same-origin /studio-libs/.
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1]!;
    if (!src.startsWith("/studio-libs/")) {
      err("script_src", `Script "${src}" is not allowed; load libraries only from /studio-libs/.`);
    }
  }

  // Every absolute URL must point to an allowed host.
  const allowed = new Set([...ALWAYS_ALLOWED_HOSTS, ...opts.allowedHosts.map((h) => h.toLowerCase())]);
  const seen = new Set<string>();
  for (const m of html.matchAll(/https?:\/\/[^\s"'()<>`\\]+/gi)) {
    const url = m[0]!;
    if (NAMESPACE_URL.test(url) || seen.has(url)) continue;
    seen.add(url);
    const host = hostOf(url);
    if (!host || !allowed.has(host)) {
      err("external_url", `URL not allowed: ${url.slice(0, 120)} — use only the provided asset URLs, /studio-libs/ and Google Fonts.`);
    }
  }
  if (/\/\/cdn\.|unpkg\.com|jsdelivr|cdnjs/i.test(html) && !issues.some((i) => i.code === "script_src")) {
    warn("external_url", "Looks like a CDN reference; libraries must come from /studio-libs/.");
  }

  return issues;
}

// ─── Frame analysis (sharp) ────────────────────────────────────────────────

export type FrameStats = { blank: boolean; signature: Buffer };

/** Uniform frame (all channels near-zero stdev) → blank. Signature: 32x18 grey. */
export async function analyzeFrame(jpeg: Buffer): Promise<FrameStats> {
  const sharp = (await import("sharp")).default;
  const stats = await sharp(jpeg).stats();
  const blank = stats.channels.slice(0, 3).every((c) => c.stdev < 2.5);
  const signature = await sharp(jpeg).resize(32, 18, { fit: "fill" }).greyscale().raw().toBuffer();
  return { blank, signature };
}

export function signatureDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / n; // mean absolute difference, 0..255
}

export const SMOKE_FRACTIONS = [0, 0.1, 0.3, 0.5, 0.8, 0.99];

export function smokeTimes(duration: number, fps: number): number[] {
  const last = Math.max(0, duration - 1 / fps);
  return SMOKE_FRACTIONS.map((f) => Math.min(last, Math.round(duration * f * fps) / fps));
}

function pageIssueToValidation(p: PageIssue): ValidationIssue {
  switch (p.kind) {
    case "pageerror":
      return { code: "page_error", severity: "error", message: `Uncaught error: ${p.message}` };
    case "console":
      return { code: "console_error", severity: "warning", message: `console.error: ${p.message}` };
    case "blocked_request":
      return { code: "blocked_request", severity: "error", message: `Blocked request: ${p.message}` };
    case "timeout":
      return { code: "timeout", severity: "error", message: `Timed out: ${p.message}` };
    default:
      return { code: "contract", severity: "error", message: p.message };
  }
}

export type SmokeInput = {
  html: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  seed: number;
  allowedHosts: string[];
};

export type SmokeResult = {
  issues: ValidationIssue[];
  frames: { time: number; jpeg: Buffer }[];
  capture: CaptureResult | null;
};

type CaptureFn = typeof captureFrames;

export async function smokeRender(
  input: SmokeInput,
  capture: CaptureFn = captureFrames,
): Promise<SmokeResult> {
  const times = smokeTimes(input.duration, input.fps);
  let result: CaptureResult;
  try {
    result = await capture(
      {
        html: input.html,
        width: input.width,
        height: input.height,
        fps: input.fps,
        duration: input.duration,
        seed: input.seed,
        allowedHosts: input.allowedHosts,
      },
      times,
    );
  } catch (err) {
    return {
      issues: [{ code: "render_failed", severity: "error", message: `Smoke render failed: ${err instanceof Error ? err.message : String(err)}` }],
      frames: [],
      capture: null,
    };
  }

  const issues: ValidationIssue[] = [];
  // De-duplicate repeated console noise.
  const seen = new Set<string>();
  for (const p of result.issues) {
    const key = `${p.kind}:${p.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(pageIssueToValidation(p));
  }
  if (!result.meta) {
    issues.push({ code: "meta_missing", severity: "error", message: "The rendered page did not expose window.__videly." });
  } else if (result.meta.width !== input.width || result.meta.height !== input.height) {
    issues.push({
      code: "meta_mismatch",
      severity: "error",
      message: `Page declared ${result.meta.width}x${result.meta.height}; expected ${input.width}x${input.height}.`,
    });
  }

  const analyses = await Promise.all(result.frames.map((f) => analyzeFrame(f.jpeg).catch(() => null)));
  analyses.forEach((a, i) => {
    const t = result.frames[i]!.time;
    // t=0 may legitimately be a solid color (pre-reveal); every later sample
    // must show something, including the held final lockup.
    if (a?.blank && i > 0) {
      issues.push({
        code: "blank_frame",
        severity: "error",
        time: t,
        message: `Frame at ${t.toFixed(2)}s is a single flat color — nothing visible.`,
      });
    }
  });
  const sigs = analyses.filter((a): a is FrameStats => !!a).map((a) => a.signature);
  if (sigs.length >= 3) {
    let maxDiff = 0;
    for (let i = 1; i < sigs.length; i++) maxDiff = Math.max(maxDiff, signatureDiff(sigs[i - 1]!, sigs[i]!));
    if (maxDiff < 1.5) {
      issues.push({
        code: "static_video",
        severity: "error",
        message: "All sampled frames look the same — the animation is not advancing with time (is the timeline registered and driven by the virtual clock?).",
      });
    }
  }

  return { issues, frames: result.frames, capture: result };
}

export type ValidationReport = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  frames: { time: number; jpeg: Buffer }[];
};

export async function validateDocument(
  html: string,
  opts: StaticCheckOptions & { seed: number },
  capture: CaptureFn = captureFrames,
): Promise<ValidationReport> {
  const staticIssues = staticCheck(html, opts);
  const staticErrors = staticIssues.filter((i) => i.severity === "error");
  // A document that fails parsing/meta checks is not worth rendering.
  const skipRender = staticErrors.some((i) => i.code === "parse" || i.code === "too_large");
  const smoke = skipRender
    ? { issues: [], frames: [] as { time: number; jpeg: Buffer }[] }
    : await smokeRender(
        {
          html,
          width: opts.expect.width,
          height: opts.expect.height,
          fps: opts.expect.fps,
          duration: opts.expect.duration,
          seed: opts.seed,
          allowedHosts: opts.allowedHosts,
        },
        capture,
      );
  const all = [...staticIssues, ...smoke.issues];
  const errors = all.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, errors, warnings: all.filter((i) => i.severity === "warning"), frames: smoke.frames };
}
