// Shared headless Chromium for the Studio renderer and the HyperFrames
// thumbnail helpers: one cached browser per process, a render semaphore, and
// sandboxed per-job contexts whose network is limited to /studio-libs/ (served
// from disk), Google Fonts, data:/blob: and an explicit host allow-list.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import type { PageIssue } from "./render";

// The document is served at this made-up origin through request
// interception, so /studio-libs/... resolves like it does in the app.
export const STUDIO_ORIGIN = "http://videly.local";
export const STUDIO_DOCUMENT_URL = `${STUDIO_ORIGIN}/index.html`;

export const CHROMIUM_ARGS = [
  // WebGL through SwiftShader (CPU) so three.js works in a GPU-less container.
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  // Never throttle a page we are driving frame by frame.
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  // Stable colours and glyph shapes across machines.
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
  "--hide-scrollbars",
  "--mute-audio",
  // Unthrottled BeginFrames: the renderer waits for one real frame after each
  // seek (so re-rasterisation finishes before the capture); without vsync that
  // wait is ~1 ms instead of ~16 ms.
  "--disable-frame-rate-limit",
  "--disable-gpu-vsync",
  // Ops escape hatch for tuning flags without a deploy.
  ...(process.env.STUDIO_CHROMIUM_ARGS ? process.env.STUDIO_CHROMIUM_ARGS.split(" ").filter(Boolean) : []),
];

let cachedBrowser: Browser | null = null;
let launching: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;
  if (launching) return launching;
  launching = chromium
    .launch({ headless: true, args: CHROMIUM_ARGS })
    .then((b) => {
      cachedBrowser = b;
      b.on("disconnected", () => {
        if (cachedBrowser === b) cachedBrowser = null;
      });
      return b;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

export async function shutdownBrowser(): Promise<void> {
  const b = cachedBrowser;
  cachedBrowser = null;
  if (b) {
    await Promise.race([
      b.close().catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
  }
}

// ─── render semaphore ─────────────────────────────────────────────────────
// Full renders are CPU-bound (SwiftShader + x264), so one per process.
// captureFrames (validation smoke renders, thumbnails) does not take a slot.

let renderActive = false;
const renderWaiters: (() => void)[] = [];

export async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (renderActive) await new Promise<void>((resolve) => renderWaiters.push(resolve));
  renderActive = true;
  try {
    return await fn();
  } finally {
    renderActive = false;
    renderWaiters.shift()?.();
  }
}

export function renderSlotBusy(): boolean {
  return renderActive;
}

// ─── /studio-libs on disk ─────────────────────────────────────────────────

let libsDirCache: string | null | undefined;

// public/studio-libs in dev, build/client/studio-libs in the production image
// (the runtime stage ships build/ only). STUDIO_LIBS_DIR overrides both.
export function resolveStudioLibsDir(): string | null {
  if (libsDirCache !== undefined) return libsDirCache;
  const candidates = [
    process.env.STUDIO_LIBS_DIR,
    path.resolve(process.cwd(), "public", "studio-libs"),
    path.resolve(process.cwd(), "build", "client", "studio-libs"),
  ].filter((p): p is string => !!p);
  libsDirCache = candidates.find((p) => existsSync(p)) ?? null;
  return libsDirCache;
}

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const libFileCache = new Map<string, Buffer>();

async function readLibFile(urlPath: string): Promise<{ body: Buffer; contentType: string } | null> {
  const dir = resolveStudioLibsDir();
  if (!dir) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.slice("/studio-libs/".length));
  } catch {
    return null;
  }
  const full = path.resolve(dir, rel);
  if (full !== dir && !full.startsWith(dir + path.sep)) return null; // traversal
  let body = libFileCache.get(full);
  if (!body) {
    try {
      body = await readFile(full);
    } catch {
      return null;
    }
    libFileCache.set(full, body);
  }
  return { body, contentType: MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream" };
}

// ─── Google Fonts cache ───────────────────────────────────────────────────
// Fonts are fetched once per process and replayed, which makes renders faster
// and immune to a flaky fonts CDN mid-render.

const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const FONT_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const fontCache = new Map<string, { status: number; headers: Record<string, string>; body: Buffer }>();
let fontCacheBytes = 0;

async function fulfillFont(route: Route, url: string): Promise<void> {
  const hit = fontCache.get(url);
  if (hit) {
    await route.fulfill({ status: hit.status, headers: hit.headers, body: hit.body });
    return;
  }
  const res = await route.fetch({ timeout: 20_000 });
  const body = await res.body();
  const headers = res.headers();
  if (res.ok() && fontCacheBytes + body.length <= FONT_CACHE_MAX_BYTES) {
    fontCache.set(url, { status: res.status(), headers, body });
    fontCacheBytes += body.length;
  }
  await route.fulfill({ status: res.status(), headers, body });
}

// ─── per-job context ──────────────────────────────────────────────────────

export type StudioContextOptions = {
  width: number;
  height: number;
  scale?: number; // deviceScaleFactor (2 for 4K from a 1080p document)
  // Extra https hosts the page may load from (Supabase storage, asset mirrors).
  // Accepts bare hostnames or URLs.
  allowedHosts?: string[];
};

export type StudioContext = {
  context: BrowserContext;
  page: Page;
  issues: PageIssue[];
  // The HTML served at STUDIO_DOCUMENT_URL.
  setDocument(html: string): void;
  close(): Promise<void>;
};

function normalizeHost(h: string): string | null {
  const s = h.trim();
  if (!s) return null;
  try {
    return new URL(s.includes("://") ? s : `https://${s}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function newStudioContext(opts: StudioContextOptions): Promise<StudioContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: Math.round(opts.width), height: Math.round(opts.height) },
    deviceScaleFactor: opts.scale && opts.scale > 0 ? opts.scale : 1,
    serviceWorkers: "block",
    colorScheme: "light",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC",
    bypassCSP: false,
  });
  const issues: PageIssue[] = [];
  const blockedSeen = new Set<string>();
  const allowed = new Set((opts.allowedHosts ?? []).map(normalizeHost).filter((h): h is string => !!h));
  let documentHtml = "<!doctype html><html><body></body></html>";

  const block = async (route: Route, url: string, why: string) => {
    if (!blockedSeen.has(url) && blockedSeen.size < 50) {
      blockedSeen.add(url);
      issues.push({ kind: "blocked_request", message: `${why}: ${route.request().method()} ${url.slice(0, 300)}` });
    }
    await route.abort("blockedbyclient").catch(() => {});
  };

  await context.route("**", async (route) => {
    const rawUrl = route.request().url();
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return block(route, rawUrl, "blocked");
    }
    try {
      if (url.protocol === "data:" || url.protocol === "blob:") return await route.continue();
      if (url.origin === STUDIO_ORIGIN) {
        if (url.pathname === "/" || url.pathname === "/index.html") {
          return await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: documentHtml,
          });
        }
        if (url.pathname.startsWith("/studio-libs/")) {
          const file = await readLibFile(url.pathname);
          if (!file) return await block(route, rawUrl, "not found in /studio-libs");
          return await route.fulfill({
            status: 200,
            headers: {
              "content-type": file.contentType,
              "access-control-allow-origin": "*",
              "cache-control": "public, max-age=31536000, immutable",
            },
            body: file.body,
          });
        }
        if (url.pathname === "/favicon.ico") return await route.fulfill({ status: 204, body: "" });
        return await block(route, rawUrl, "blocked (only /studio-libs/ is served)");
      }
      if (url.protocol === "https:" && FONT_HOSTS.has(url.hostname)) return await fulfillFont(route, rawUrl);
      if (url.protocol === "https:" && allowed.has(url.hostname.toLowerCase())) return await route.continue();
      return await block(route, rawUrl, "blocked");
    } catch (err) {
      issues.push({ kind: "blocked_request", message: `request failed: ${rawUrl.slice(0, 300)}: ${(err as Error).message}` });
      await route.abort("failed").catch(() => {});
    }
  });

  const page = await context.newPage();

  return {
    context,
    page,
    issues,
    setDocument(html: string) {
      documentHtml = html;
    },
    async close() {
      const closed = await Promise.race([
        context.close().then(() => true, () => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10_000)),
      ]);
      // A renderer stuck in an infinite loop can wedge context.close(); drop
      // the whole browser so the next job gets a fresh one.
      if (!closed) await shutdownBrowser();
    },
  };
}
