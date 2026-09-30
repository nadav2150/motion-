// Reference-video analysis via Google Gemini (REST, no SDK dependency).
//
// Flow: the user pastes a link or uploads a clip → we hand the video to
// Gemini → Gemini returns a structured breakdown (pacing, palette, motion,
// typography, per-beat timeline, suggested copy) → formatReferenceBrief()
// turns it into a text block the Opus director reads alongside the script.
//
//   • YouTube links go straight to Gemini as file_data.file_uri (Gemini
//     fetches them itself).
//   • Anything else (direct .mp4/.mov/.webm URLs, and our own uploads in the
//     storyboards bucket) is downloaded and pushed through the Gemini Files
//     API, then polled until the file is ACTIVE.
//
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (default gemini-3.5-flash).

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { recordModelCost } from "./billing/track-cost";
import { usdMicrosForGemini, type GeminiUsageMetadata } from "./billing/pricing-usd";

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
// Tried in order; a busy/unavailable model hands over to the next. Checked
// against this key's model list: gemini-3.8-flash answered while 3.7 was
// overloaded and 3.5 hung.
const DEFAULT_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview"];
const DEFAULT_GEMINI_MODEL = DEFAULT_GEMINI_MODELS[0]!;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024; // 200 MB
const FILE_POLL_INTERVAL_MS = 3000;
const FILE_POLL_TIMEOUT_MS = 5 * 60 * 1000;
// Per-request timeouts. generateContent on a long video can legitimately take
// a couple of minutes; each Files API step (start, upload, status poll,
// delete) should be quick.
const GENERATE_TIMEOUT_MS = 180_000;
const FILES_STEP_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_REDIRECTS = 3;

// Per-beat visual spec (optional: analyses stored before it existed lack it).
export type ReferenceColorUse = { element: string; hex: string };

export type ReferenceBeatVisual = {
  layout: string; // grid / element positions in % of the frame
  background: string; // color, gradient, texture, imagery, depth
  textStyle: string; // weight, case, tracking, size relative to frame height, alignment
  uiElements: string; // mockups, cards, icons, shapes, lines, badges
  colorUsage: ReferenceColorUse[]; // which element carries which color
  transitionIn: string; // type + easing + duration
  transitionOut: string;
  camera: string; // push / pan / parallax / zoom
  keyFrame: string; // exhaustive description of the representative frame
};

export type ReferenceBeat = {
  start: number;
  end: number;
  description: string;
  onScreenText: string;
  motion: string;
  transitionOut: string;
  keyTime?: number; // the most representative (fully composed) moment of the beat
  visual?: ReferenceBeatVisual;
};

// A still of the reference stored at jobs/<jobId>/v2/reference/frame-<n>.jpg.
export type ReferenceFrame = {
  time: number; // seconds into the reference (0 for a YouTube thumbnail)
  url: string;
  path: string;
  beatIndex: number | null;
};

export type ReferenceAnalysis = {
  summary: string;
  totalDurationSeconds: number;
  aspectRatio: string;
  pacing: string;
  editingRhythm: string;
  colorPalette: string[];
  typography: string;
  motionStyle: string;
  cameraMoves: string;
  transitions: string[];
  audioMood: string;
  beats: ReferenceBeat[];
  suggestedScript: string;
  recreationNotes: string;
  model: string;
  // Richer visual spec (optional; newer analyses only).
  designSystem?: string; // grid, margins, type scale, recurring elements
  fontMatches?: string[]; // closest Google Fonts families
  source?: "video" | "youtube";
  // Stills extracted after the analysis (studio pipeline). `frames` present
  // (even empty) means extraction ran; framesError says why it produced none.
  frames?: ReferenceFrame[];
  framesError?: string;
  frameSource?: "video" | "youtube_thumbnail";
};

export const ANALYSIS_PROMPT = `You are a senior motion designer breaking down a reference video so another designer can recreate its LOOK AND FEEL in a new motion-graphics film (HTML/CSS/GSAP) with different content. The other designer will match layouts, typography, colors, pacing and transitions from your spec, so it must be precise enough to rebuild each moment without watching the video.

Watch the whole video and return ONLY a JSON object with exactly these keys:
{
  "summary": string,                 // 2-3 sentences: what the video is and why it works
  "totalDurationSeconds": number,
  "aspectRatio": string,             // e.g. "16:9", "9:16", "1:1"
  "pacing": string,                  // overall tempo, average shot length, where it speeds up / slows down
  "editingRhythm": string,           // cut timing relative to music/beats, holds, build-ups
  "colorPalette": string[],          // 3-6 dominant colors as #rrggbb hex
  "typography": string,              // type families/classes, weights, sizes, casing, how text animates in/out
  "motionStyle": string,             // easing character, kinetic type, layering, parallax, 2D/3D, signature moves
  "cameraMoves": string,             // virtual camera: pushes, pans, zooms, rotations, rack focus
  "transitions": string[],           // concrete transition types in order of frequency
  "audioMood": string,               // music genre/energy/BPM feel, SFX usage, voiceover presence
  "designSystem": string,            // the recurring system: grid/columns, margins in % of width/height, type scale (px at 1080p and % of frame height), corner radii, stroke weights, shadows, recurring graphic devices
  "fontMatches": string[],           // 1-3 closest Google Fonts families for the typefaces used (display first)
  "beats": [                         // one entry per distinct shot/beat, in order, covering the whole video
    {
      "start": number, "end": number,
      "keyTime": number,             // the most representative moment of this beat (fully composed, not mid-transition), between start and end
      "description": string, "onScreenText": string, "motion": string, "transitionOut": string,
      "visual": {
        "layout": string,            // where each element sits, as % of frame (e.g. "headline left-aligned at x 8%, y 38-52%; phone mockup centered at x 62%, 70% of frame height")
        "background": string,        // color/gradient (hex), texture, imagery, depth planes
        "textStyle": string,         // weight (e.g. 800), case, tracking (em), size as % of frame height, line height, alignment, color
        "uiElements": string,        // mockups, cards, icons, shapes, lines, badges, charts — how they look (radius, border, shadow)
        "colorUsage": [ { "element": string, "hex": "#rrggbb" } ],
        "transitionIn": string,      // type + easing + duration (e.g. "masked wipe up, expo.out, 0.6s")
        "transitionOut": string,     // type + easing + duration
        "camera": string,            // push/pan/zoom/parallax with amounts, or "static"
        "keyFrame": string           // exhaustive description of the frame at keyTime, as if for someone who cannot see it
      }
    }
  ],
  "suggestedScript": string,         // the video's message rewritten as a concise script (the spoken/on-screen copy), in the video's language
  "recreationNotes": string          // the 5-8 most important instructions for recreating this LOOK AND FEEL in HTML/CSS/GSAP motion graphics
}
Be concrete and specific (numbers, percentages, hex codes, named easings, durations in seconds). No markdown, no commentary outside the JSON.`;

// Added for YouTube links: we never download those, so the downstream
// designer sees at most the public thumbnail and relies on this text.
export const YOUTUBE_ANALYSIS_NOTE = `The downstream designer will NOT see this video, only your JSON. Make every beat's "visual" block exhaustive — exact positions, sizes relative to the frame, hex colors per element, type weight/case/tracking, and transition easing + duration — and split the video into enough beats (up to 30) that no distinct layout is missing.`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY must be set to analyze reference videos.");
  }
  return key;
}

/** GEMINI_MODEL may be one model or a comma-separated fallback chain. */
export function getGeminiModels(env: string | undefined = process.env.GEMINI_MODEL): string[] {
  const list = (env ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_GEMINI_MODELS;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * https://www.youtube.com/watch?v=ID for any single-video YouTube link
 * (watch?v=, youtu.be/, /shorts/, /embed/, /live/, music.youtube.com), dropping
 * playlist, timestamp and tracking parameters. null when there is no video id.
 */
export function canonicalYouTubeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "music.youtube.com") {
    id = u.searchParams.get("v");
    if (!id) {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

// Gemini returns 503 "model is currently experiencing high demand" and 429 in
// bursts that can last minutes, per model. Each round tries every model in the
// chain (an overloaded or hung model hands over to the next one), then waits
// before the next round. Models that don't exist for this key (404, or a 400
// about the model name) are dropped for the rest of the call.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const ROUND_DELAYS_MS = [5_000, 15_000, 40_000];

export type GeminiAttempt = { model: string; outcome: string };

export async function generateWithFallback(
  models: string[],
  apiKey: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ res: Response; model: string; attempts: GeminiAttempt[] }> {
  const attempts: GeminiAttempt[] = [];
  let pool = [...new Set(models)];
  let last: { res: Response; model: string } | null = null;
  for (let round = 0; round <= ROUND_DELAYS_MS.length; round++) {
    for (const model of [...pool]) {
      let res: Response;
      try {
        res = await fetchImpl(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
        });
      } catch (err) {
        attempts.push({ model, outcome: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network error" });
        continue; // hung or unreachable: try the next model
      }
      if (res.ok) return { res, model, attempts: [...attempts, { model, outcome: "ok" }] };
      attempts.push({ model, outcome: `HTTP ${res.status}` });
      if (res.status === 404 || (res.status === 400 && (await modelNameError(res.clone())))) {
        pool = pool.filter((m) => m !== model); // not available to this key
        await res.body?.cancel().catch(() => {});
        continue;
      }
      if (!RETRY_STATUSES.has(res.status)) return { res, model, attempts }; // a real request error
      await res.body?.cancel().catch(() => {});
      last = { res, model };
    }
    if (!pool.length || round === ROUND_DELAYS_MS.length) break;
    console.warn(
      `[reference-video] Gemini busy (${attempts.slice(-pool.length).map((a) => `${a.model}: ${a.outcome}`).join(", ")}), next round in ${ROUND_DELAYS_MS[round]! / 1000}s`,
    );
    await sleep(ROUND_DELAYS_MS[round]!);
  }
  const summary = attempts.map((a) => `${a.model}: ${a.outcome}`).join("; ");
  if (last) return { res: new Response(`Gemini is overloaded right now (${summary}).`, { status: last.res.status }), model: last.model, attempts };
  return { res: new Response(`No Gemini model answered (${summary}).`, { status: 503 }), model: models[0] ?? DEFAULT_GEMINI_MODEL, attempts };
}

async function modelNameError(res: Response): Promise<boolean> {
  const text = await res.text().catch(() => "");
  return /model name|models\/|no longer available|not found/i.test(text);
}

export function isYouTubeUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^www\.|^m\./, "");
    return host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com";
  } catch {
    return false;
  }
}

/**
 * Accepts only public http(s) URLs. Rejects loopback / private-range IP
 * literals and bare hostnames so a pasted link can't make the server fetch
 * internal endpoints.
 */
export function validateReferenceUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Reference link is not a valid URL.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Reference link must start with http:// or https://.";
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host.startsWith("[")
  ) {
    return "Reference link must be a public URL.";
  }
  return null;
}

/** True for loopback, private, link-local, CGNAT, unspecified and ULA addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(lower);
  }
  return true; // not an IP at all → treat as unsafe
}

// DNS rebinding / private-host guard: every address the hostname resolves to
// must be public. Throws a user-facing error otherwise.
export async function assertPublicHost(
  hostname: string,
  resolve: (host: string) => Promise<{ address: string }[]> = (h) => lookup(h, { all: true }),
): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host).catch(() => []);
  if (addrs.length === 0) throw new Error("Reference link host could not be resolved.");
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Reference link must be a public URL.");
  }
}

// fetch with redirect:"manual": each hop is re-validated (URL shape + DNS)
// before it is followed, at most MAX_REDIRECTS hops.
export async function fetchPublicUrl(
  rawUrl: string,
  init: { signal?: AbortSignal; fetchImpl?: typeof fetch; resolve?: (host: string) => Promise<{ address: string }[]> } = {},
): Promise<Response> {
  const doFetch = init.fetchImpl ?? fetch;
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const urlError = validateReferenceUrl(current);
    if (urlError) throw new Error(urlError);
    await assertPublicHost(new URL(current).hostname, init.resolve);
    const res = await doFetch(current, { redirect: "manual", signal: init.signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Reference link redirected without a Location (HTTP ${res.status}).`);
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error(`Reference link redirected more than ${MAX_REDIRECTS} times.`);
}

async function downloadVideo(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetchPublicUrl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Could not download reference video (HTTP ${res.status}).`);
  }
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("video/")) {
    throw new Error(
      "That link is a web page, not a video file. Paste a YouTube link or a direct .mp4/.mov/.webm link, or upload the file.",
    );
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Reference video is larger than ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Reference video is larger than ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB.`);
  }
  return { bytes, mimeType };
}

type GeminiFile = { name: string; uri: string; mimeType: string; state?: string };

/** Resumable upload to the Gemini Files API, then poll until ACTIVE. */
async function uploadToGemini(bytes: Buffer, mimeType: string, apiKey: string): Promise<GeminiFile> {
  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `videly-reference-${Date.now()}` } }),
    signal: AbortSignal.timeout(FILES_STEP_TIMEOUT_MS),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    throw new Error(`Gemini upload start failed (HTTP ${start.status}): ${await start.text()}`);
  }

  const done = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(FILES_STEP_TIMEOUT_MS),
  });
  if (!done.ok) {
    throw new Error(`Gemini upload failed (HTTP ${done.status}): ${await done.text()}`);
  }
  let file = ((await done.json()) as { file: GeminiFile }).file;

  try {
    const deadline = Date.now() + FILE_POLL_TIMEOUT_MS;
    while (file.state === "PROCESSING") {
      if (Date.now() > deadline) throw new Error("Gemini is still processing the reference video; try again.");
      await new Promise((r) => setTimeout(r, FILE_POLL_INTERVAL_MS));
      const poll = await fetch(`${GEMINI_BASE}/v1beta/${file.name}`, {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(FILES_STEP_TIMEOUT_MS),
      });
      if (!poll.ok) throw new Error(`Gemini file status failed (HTTP ${poll.status}).`);
      file = (await poll.json()) as GeminiFile;
    }
    if (file.state === "FAILED") throw new Error("Gemini could not process the reference video.");
    return file;
  } catch (err) {
    // The file exists on Gemini's side even though we are giving up on it.
    await deleteGeminiFile(file.name, apiKey);
    throw err;
  }
}

// Awaited so the upload never outlives the analysis; failures are logged,
// never thrown (Gemini expires files after 48h anyway).
async function deleteGeminiFile(name: string, apiKey: string): Promise<void> {
  try {
    const res = await fetch(`${GEMINI_BASE}/v1beta/${name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(FILES_STEP_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 404) {
      console.warn(`[reference-video] Gemini file delete ${name} failed (HTTP ${res.status})`);
    }
  } catch (err) {
    console.warn(
      `[reference-video] Gemini file delete ${name} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function hexColor(v: unknown): string | null {
  const c = str(v).toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return null;
}

// Free-text fields Gemini sometimes returns as a list of strings.
function prose(v: unknown): string {
  return Array.isArray(v) ? v.map(str).filter(Boolean).join("; ") : str(v);
}

const MAX_SPEC_CHARS = 700;

function spec(v: unknown): string {
  return prose(v).slice(0, MAX_SPEC_CHARS);
}

function normalizeVisual(raw: unknown): ReferenceBeatVisual | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const colorUsage = Array.isArray(v.colorUsage)
    ? (v.colorUsage as unknown[])
        .map((c) => {
          if (!c || typeof c !== "object") return null;
          const o = c as Record<string, unknown>;
          const hex = hexColor(o.hex);
          const element = str(o.element).slice(0, 80);
          return hex && element ? { element, hex } : null;
        })
        .filter((c): c is ReferenceColorUse => c !== null)
        .slice(0, 8)
    : [];
  const visual: ReferenceBeatVisual = {
    layout: spec(v.layout),
    background: spec(v.background),
    textStyle: spec(v.textStyle),
    uiElements: spec(v.uiElements),
    colorUsage,
    transitionIn: spec(v.transitionIn),
    transitionOut: spec(v.transitionOut),
    camera: spec(v.camera),
    keyFrame: str(v.keyFrame).slice(0, 1200),
  };
  const empty = Object.values(visual).every((x) => (Array.isArray(x) ? x.length === 0 : !x));
  return empty ? undefined : visual;
}

/** Coerce Gemini's JSON into a ReferenceAnalysis; tolerant of missing / mistyped fields. */
export function normalizeAnalysis(raw: Record<string, unknown>, model: string): ReferenceAnalysis {
  const beats = Array.isArray(raw.beats)
    ? (raw.beats as unknown[]).filter((b): b is Record<string, unknown> => !!b && typeof b === "object" && !Array.isArray(b))
    : [];
  const analysis: ReferenceAnalysis = {
    summary: str(raw.summary),
    totalDurationSeconds: Math.max(0, num(raw.totalDurationSeconds)),
    aspectRatio: str(raw.aspectRatio),
    pacing: str(raw.pacing),
    editingRhythm: str(raw.editingRhythm),
    colorPalette: Array.isArray(raw.colorPalette)
      ? (raw.colorPalette as unknown[])
          .map(hexColor)
          .filter((c): c is string => c !== null)
          .slice(0, 6)
      : [],
    typography: str(raw.typography),
    motionStyle: str(raw.motionStyle),
    cameraMoves: str(raw.cameraMoves),
    transitions: Array.isArray(raw.transitions) ? (raw.transitions as unknown[]).map(str).filter(Boolean) : [],
    audioMood: str(raw.audioMood),
    beats: beats.slice(0, 40).map((b) => {
      const start = Math.max(0, num(b.start));
      const end = Math.max(start, num(b.end));
      const beat: ReferenceBeat = {
        start,
        end,
        description: str(b.description),
        onScreenText: str(b.onScreenText),
        motion: str(b.motion),
        transitionOut: str(b.transitionOut),
      };
      if (b.keyTime !== undefined && b.keyTime !== null && b.keyTime !== "") {
        const key = num(b.keyTime);
        if (end > start && key >= start && key <= end) beat.keyTime = key;
      }
      const visual = normalizeVisual(b.visual);
      if (visual) beat.visual = visual;
      return beat;
    }),
    suggestedScript: str(raw.suggestedScript),
    recreationNotes: prose(raw.recreationNotes),
    model,
  };
  const designSystem = prose(raw.designSystem).slice(0, 1500);
  if (designSystem) analysis.designSystem = designSystem;
  if (Array.isArray(raw.fontMatches)) {
    const fonts = (raw.fontMatches as unknown[])
      .map((f) => str(f).replace(/[^\w .'-]/g, "").trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 3);
    if (fonts.length) analysis.fontMatches = fonts;
  }
  return analysis;
}

/** The 11-character video id of a single-video YouTube link, or null. */
export function youTubeVideoId(raw: string): string | null {
  const canonical = canonicalYouTubeUrl(raw);
  return canonical ? new URL(canonical).searchParams.get("v") : null;
}

/**
 * Public thumbnail URLs for a YouTube video, best first (maxresdefault is
 * missing for some videos; hqdefault always exists). We never download the
 * video itself.
 */
export function youTubeThumbnailUrls(raw: string): string[] {
  const id = youTubeVideoId(raw);
  return id ? [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`] : [];
}

export { downloadVideo as downloadReferenceVideo };

/** Analyze a reference video (YouTube link or direct/public video URL) with Gemini. */
export async function analyzeReferenceVideo(
  videoUrl: string,
  opts: {
    maxScriptChars?: number | null;
    // Receives the downloaded bytes of a non-YouTube reference (so frames can
    // be extracted without a second download). Errors are logged, not thrown.
    onVideoBytes?: (bytes: Buffer, mimeType: string) => void | Promise<void>;
  } = {},
): Promise<ReferenceAnalysis> {
  const urlError = validateReferenceUrl(videoUrl);
  if (urlError) throw new Error(urlError);

  const apiKey = getApiKey();
  const models = getGeminiModels();
  let model = models[0]!;

  let videoPart: Record<string, unknown>;
  let uploadedName: string | null = null;
  const youtube = isYouTubeUrl(videoUrl);
  if (youtube) {
    // Gemini rejects anything but a plain video link (a &list= playlist
    // parameter returns 400 INVALID_ARGUMENT), so always send watch?v=ID.
    const canonical = canonicalYouTubeUrl(videoUrl);
    if (!canonical) throw new Error("That YouTube link doesn't point to a single video. Paste the link of one video.");
    videoPart = { file_data: { file_uri: canonical } };
  } else {
    const { bytes, mimeType } = await downloadVideo(videoUrl);
    if (opts.onVideoBytes) {
      try {
        await opts.onVideoBytes(bytes, mimeType);
      } catch (err) {
        console.warn("[reference-video] onVideoBytes failed:", err instanceof Error ? err.message : err);
      }
    }
    const file = await uploadToGemini(bytes, mimeType, apiKey);
    uploadedName = file.name;
    videoPart = { file_data: { file_uri: file.uri, mime_type: file.mimeType || mimeType } };
  }

  const startedAt = Date.now();
  try {
    const { res, model: usedModel } = await generateWithFallback(models, apiKey, {
      contents: [{ role: "user", parts: [videoPart, { text: youtube ? `${ANALYSIS_PROMPT}\n\n${YOUTUBE_ANALYSIS_NOTE}` : ANALYSIS_PROMPT }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    model = usedModel;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      if (youtube && res.status === 400) {
        throw new Error(
          "Gemini couldn't open that YouTube video. Make sure it's public (not private, unlisted-only or age-restricted), or upload the file instead.",
        );
      }
      throw new Error(`Gemini analysis failed (HTTP ${res.status}): ${body}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
      usageMetadata?: GeminiUsageMetadata;
      modelVersion?: string;
    };
    meterGemini(model, data.usageMetadata, Date.now() - startedAt, uploadedName ? "files_api" : "youtube");
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini declined the reference video (${data.promptFeedback.blockReason}).`);
    }
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) {
      throw new Error(`Gemini returned no analysis (finishReason=${data.candidates?.[0]?.finishReason ?? "unknown"}).`);
    }
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      throw new Error("Gemini returned an analysis that is not valid JSON.");
    }
    const analysis = normalizeAnalysis(parsed, model);
    analysis.source = youtube ? "youtube" : "video";
    const maxChars = opts.maxScriptChars;
    if (typeof maxChars === "number" && maxChars > 0 && analysis.suggestedScript.length > maxChars) {
      analysis.suggestedScript = truncateAtWord(analysis.suggestedScript, maxChars);
    }
    return analysis;
  } finally {
    if (uploadedName) await deleteGeminiFile(uploadedName, apiKey);
  }
}

export function truncateAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

// Cost telemetry for the generateContent call (no-op outside a meter context).
function meterGemini(
  model: string,
  usage: GeminiUsageMetadata | undefined,
  latencyMs: number,
  source: string,
): void {
  if (!usage) return;
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  void recordModelCost({
    provider: "google_gemini",
    model,
    reason: "gemini_reference",
    unitKind: "tokens",
    units: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    costUsdMicros: usdMicrosForGemini(model, usage),
    latencyMs,
    extra: { source, thoughts_tokens: usage.thoughtsTokenCount ?? 0 },
  });
}

const DEFAULT_BRIEF_HEADER =
  "REFERENCE VIDEO (analyzed by Gemini — match its LOOK, PACING and MOTION FEEL; write original content from the SCRIPT, do not copy the reference's content):";
const MAX_BRIEF_CHARS = 24_000;

/** One beat's visual spec as indented lines (empty when the beat has none). */
export function formatBeatVisual(v: ReferenceBeatVisual | undefined, indent: string, opts: { keyFrame?: boolean } = {}): string[] {
  if (!v) return [];
  const out: string[] = [];
  const add = (k: string, val: string) => {
    if (val) out.push(`${indent}${k}: ${val}`);
  };
  add("layout", v.layout);
  add("background", v.background);
  add("text", v.textStyle);
  add("ui", v.uiElements);
  if (v.colorUsage.length) out.push(`${indent}colors: ${v.colorUsage.map((c) => `${c.element} ${c.hex}`).join("; ")}`);
  add("in", v.transitionIn);
  add("out", v.transitionOut);
  add("camera", v.camera);
  if (opts.keyFrame) add("keyFrame", v.keyFrame);
  return out;
}

/**
 * Render the analysis as the REFERENCE VIDEO block the Opus director reads.
 * `keyFrames` adds each beat's exhaustive key-frame description (useful when
 * no stills of the reference are attached, e.g. YouTube links).
 */
export function formatReferenceBrief(
  a: ReferenceAnalysis,
  opts: { header?: string; keyFrames?: boolean } = {},
): string {
  const build = (detail: "full" | "compact") => {
    const lines: string[] = [
      opts.header ?? DEFAULT_BRIEF_HEADER,
      `  summary:        ${a.summary}`,
      `  duration:       ${a.totalDurationSeconds}s · aspect ${a.aspectRatio || "unknown"}`,
      `  pacing:         ${a.pacing}`,
      `  editingRhythm:  ${a.editingRhythm}`,
      `  colorPalette:   ${a.colorPalette.join(", ") || "(not detected)"}`,
      `  typography:     ${a.typography}`,
      `  motionStyle:    ${a.motionStyle}`,
      `  cameraMoves:    ${a.cameraMoves}`,
      `  transitions:    ${a.transitions.join(" · ")}`,
      `  audioMood:      ${a.audioMood}`,
    ];
    if (a.designSystem) lines.push(`  designSystem:   ${a.designSystem}`);
    if (a.fontMatches?.length) lines.push(`  closestFonts:   ${a.fontMatches.join(", ")} (Google Fonts)`);
    if (a.beats.length > 0) {
      lines.push("  beats:");
      a.beats.forEach((b, i) => {
        lines.push(
          `    #${i + 1} ${b.start.toFixed(1)}–${b.end.toFixed(1)}s: ${b.description}` +
            (b.onScreenText ? ` | text: "${b.onScreenText}"` : "") +
            (b.motion ? ` | motion: ${b.motion}` : "") +
            (b.transitionOut ? ` | out: ${b.transitionOut}` : ""),
        );
        if (detail === "full") lines.push(...formatBeatVisual(b.visual, "       ", { keyFrame: opts.keyFrames }));
      });
    }
    if (a.recreationNotes) lines.push(`  recreationNotes: ${a.recreationNotes}`);
    return lines.join("\n");
  };
  const full = build("full");
  if (full.length <= MAX_BRIEF_CHARS) return full;
  // Very long analyses: drop the per-beat visual blocks (the frames and their
  // labels still carry them for the beats that have a still).
  return build("compact").slice(0, MAX_BRIEF_CHARS);
}
