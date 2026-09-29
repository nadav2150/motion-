// Dev-only mock backend for the v2 UI. Enabled by `?mock=1` (persisted in
// localStorage['videly:mock']) while running the dev server; see api.ts.
// State lives in memory for the tab's lifetime: created jobs walk through the
// generation stages in real time, edits add revisions, exports "render".

import type {
  BrandKit,
  CreateStudioJobInput,
  ExportOptions,
  StudioJobView,
  StudioRevision,
  StudioStage,
  StudioTemplate,
  StudioVideoCard,
  UserAsset,
} from "../../lib/studio/types";
import { FORMAT_PRESETS, STAGE_LABELS } from "../../lib/studio/types";
import { ApiError, type UsageInfo, type VideoFilter } from "./api";
import { FALLBACK_TEMPLATES, photo, type PhotoKey } from "./showcase";

const now = () => Date.now();
const iso = (msAgo: number) => new Date(now() - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Stage walk for a fresh job (seconds after creation → stage).
const STAGE_SCRIPT: StudioStage[] = [
  "queued",
  "planning",
  "voiceover",
  "assets",
  "writing",
  "writing",
  "validating",
  "reviewing",
];
const STAGE_STEP_MS = 2500;

type MockJob = {
  view: StudioJobView;
  card: StudioVideoCard;
  deleted: boolean;
  // When set, the job is generating from this timestamp (initial or edit).
  busySince: number | null;
  pendingRevision: { kind: StudioRevision["kind"]; instruction: string | null } | null;
  render: { rev: number; since: number } | null;
  legacy: boolean;
};

function rev(
  jobId: string,
  n: number,
  kind: StudioRevision["kind"],
  instruction: string | null,
  thumb: string,
  msAgo: number,
  renderStatus: StudioRevision["renderStatus"] = "none",
): StudioRevision {
  return {
    revision: n,
    kind,
    instruction,
    documentUrl: `/api/jobs/${jobId}/document?rev=${n}`,
    thumbUrl: thumb,
    videoUrl: renderStatus === "ready" ? `/mock/${jobId}-${n}.mp4` : null,
    renderStatus,
    renderError: null,
    createdAt: iso(msAgo),
  };
}

function makeJob(opts: {
  id: string;
  title: string;
  prompt: string;
  photoKey: PhotoKey;
  format?: "16:9" | "9:16" | "1:1";
  duration?: number;
  msAgo: number;
  revisions?: number;
  stage?: StudioStage;
  progress?: number;
  favorite?: boolean;
  exported?: boolean;
  voiceId?: string | null;
  legacy?: boolean;
  error?: string | null;
}): MockJob {
  const format = opts.format ?? "16:9";
  const preset = FORMAT_PRESETS[format];
  const thumb = photo(opts.photoKey, 640);
  const stage = opts.stage ?? "preview_ready";
  const revCount = opts.revisions ?? (stage === "preview_ready" || stage === "done" ? 1 : 0);
  const revisions: StudioRevision[] = [];
  for (let i = 1; i <= revCount; i++) {
    const ago = opts.msAgo - (i - 1) * 3 * MIN;
    revisions.push(
      rev(
        opts.id,
        i,
        i === 1 ? "initial" : "edit",
        i === 1 ? null : i === 2 ? "Make the opening faster" : "Add a stronger call to action at the end",
        thumb,
        Math.max(2 * MIN, ago - 40 * MIN * (revCount - i)),
        opts.exported && i === revCount ? "ready" : "none",
      ),
    );
  }
  const view: StudioJobView = {
    id: opts.id,
    generationMode: "v2",
    title: opts.title,
    prompt: opts.prompt,
    status: stage === "failed" ? "failed" : stage === "done" || stage === "preview_ready" ? "completed" : "directing",
    stage,
    stageLabel: STAGE_LABELS[stage],
    progress: opts.progress ?? (stage === "preview_ready" || stage === "done" ? 1 : 0.1),
    error: opts.error ?? null,
    format,
    width: preset.width,
    height: preset.height,
    fps: 30,
    duration: opts.duration ?? 30,
    language: "en",
    voiceId: opts.voiceId ?? "21m00Tcm4TlvDq8ikWAM",
    musicEnabled: true,
    favorite: !!opts.favorite,
    referenceVideoUrl: null,
    referenceSummary: null,
    currentRevision: revCount,
    revisions,
    audio: { voiceover: null, music: null },
    thumbUrl: revCount > 0 || stage !== "queued" ? thumb : null,
    createdAt: iso(opts.msAgo),
    updatedAt: iso(Math.max(0, opts.msAgo - 10 * MIN)),
  };
  const card: StudioVideoCard = {
    id: opts.id,
    generationMode: opts.legacy ? "hyperframes" : "v2",
    title: opts.title,
    status: view.status,
    stage: opts.legacy ? null : stage,
    progress: opts.legacy ? null : view.progress,
    format,
    duration: view.duration,
    thumbUrl: view.thumbUrl,
    favorite: view.favorite,
    hasExport: !!opts.exported,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
  return { view, card, deleted: false, busySince: null, pendingRevision: null, render: null, legacy: !!opts.legacy };
}

const state: {
  jobs: MockJob[];
  brand: BrandKit;
  assets: UserAsset[];
  seq: number;
} = {
  jobs: [
    makeJob({ id: "mock-mountains", title: "Ideas Move the World", prompt: "A cinematic video about exploring mountains at sunset", photoKey: "mountainsSunset", msAgo: 2 * DAY, revisions: 3, favorite: true, exported: true }),
    (() => {
      const j = makeJob({ id: "mock-house", title: "Modern Living — Launch", prompt: "Real estate launch video for a modern house at dusk", photoKey: "modernHouseDusk", msAgo: 4 * MIN, stage: "writing", progress: 0.68 });
      j.busySince = now() - 5 * STAGE_STEP_MS;
      j.pendingRevision = { kind: "initial", instruction: null };
      return j;
    })(),
    makeJob({ id: "mock-concert", title: "Summer Tour Teaser", prompt: "High energy concert teaser with dates", photoKey: "concertCrowd", msAgo: 5 * HOUR, revisions: 2, format: "9:16", duration: 15 }),
    makeJob({ id: "mock-watch", title: "Chrono S2 Product Promo", prompt: "Luxury watch product promo", photoKey: "watchProduct", msAgo: 3 * DAY, revisions: 1, exported: true }),
    makeJob({ id: "mock-draft", title: "Untitled draft", prompt: "App onboarding walkthrough", photoKey: "phoneApp", msAgo: 6 * DAY, stage: "queued", progress: 0 }),
    makeJob({ id: "mock-headphones", title: "Aura Headphones", prompt: "Minimal square product loop for headphones", photoKey: "headphones", msAgo: 8 * DAY, revisions: 1, format: "1:1", duration: 15 }),
    makeJob({ id: "mock-failed", title: "Coffee shop opening", prompt: "Grand opening video for a coffee shop", photoKey: "storefront", msAgo: 9 * DAY, stage: "failed", progress: 0.4, error: "The video document failed validation twice. No credits were charged." }),
    makeJob({ id: "legacy-1234", title: "Q3 launch film (classic editor)", prompt: "", photoKey: "office", msAgo: 30 * DAY, revisions: 1, legacy: true, exported: true }),
  ],
  brand: {
    name: "Videly",
    logoUrl: null,
    colors: ["#ef8354", "#4f5d75", "#2d3142"],
    headingFont: "Inter",
    bodyFont: "Inter",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    styleNotes: "Confident, warm, cinematic.",
    websiteUrl: null,
  },
  assets: [
    { id: "a1", kind: "video", name: "mountain-drone.mp4", url: photo("mountainLake", 480), mime: "video/mp4", bytes: 24 * 1024 * 1024, duration: 12, width: 1920, height: 1080, source: "upload", createdAt: iso(2 * HOUR) },
    { id: "a2", kind: "image", name: "house-dusk.jpg", url: photo("modernHouseDusk", 480), mime: "image/jpeg", bytes: 2.4 * 1024 * 1024, duration: null, width: 2400, height: 1600, source: "upload", createdAt: iso(5 * HOUR) },
    { id: "a3", kind: "audio", name: "voiceover-v3.mp3", url: "", mime: "audio/mpeg", bytes: 640 * 1024, duration: 28, width: null, height: null, source: "voiceover", createdAt: iso(DAY) },
    { id: "a4", kind: "image", name: "watch-hero.png", url: photo("watchProduct", 480), mime: "image/png", bytes: 3.1 * 1024 * 1024, duration: null, width: 2000, height: 2000, source: "upload", createdAt: iso(2 * DAY) },
    { id: "a5", kind: "video", name: "concert-reference.mov", url: photo("concertCrowd", 480), mime: "video/quicktime", bytes: 61 * 1024 * 1024, duration: 34, width: 1080, height: 1920, source: "reference", createdAt: iso(3 * DAY) },
    { id: "a6", kind: "logo", name: "videly-logo.svg", url: "", mime: "image/svg+xml", bytes: 4 * 1024, duration: null, width: 512, height: 512, source: "upload", createdAt: iso(4 * DAY) },
    { id: "a7", kind: "image", name: "headphones.jpg", url: photo("headphones", 480), mime: "image/jpeg", bytes: 1.8 * 1024 * 1024, duration: null, width: 1600, height: 1600, source: "upload", createdAt: iso(5 * DAY) },
    { id: "a8", kind: "audio", name: "sunset-ambient.mp3", url: "", mime: "audio/mpeg", bytes: 4.2 * 1024 * 1024, duration: 62, width: null, height: null, source: "generated", createdAt: iso(6 * DAY) },
  ],
  seq: 1,
};

// ------------------------------------------------------------ time stepping

function tick(j: MockJob) {
  const v = j.view;
  if (j.busySince != null && j.pendingRevision) {
    const elapsed = now() - j.busySince;
    const idx = Math.floor(elapsed / STAGE_STEP_MS);
    if (idx >= STAGE_SCRIPT.length) {
      const n = v.revisions.length + 1;
      const thumb = v.thumbUrl ?? photo("mountainsSunset", 640);
      v.revisions.push(rev(v.id, n, j.pendingRevision.kind, j.pendingRevision.instruction, thumb, 0));
      v.currentRevision = n;
      v.stage = "preview_ready";
      v.progress = 1;
      v.status = "completed";
      v.thumbUrl = thumb;
      j.busySince = null;
      j.pendingRevision = null;
    } else {
      v.stage = STAGE_SCRIPT[idx]!;
      v.progress = Math.min(0.97, (elapsed / (STAGE_SCRIPT.length * STAGE_STEP_MS)) * 0.95 + 0.03);
      v.status = "directing";
    }
    v.stageLabel = STAGE_LABELS[v.stage];
    v.updatedAt = new Date().toISOString();
  }
  if (j.render) {
    const r = v.revisions.find((x) => x.revision === j.render!.rev);
    const elapsed = now() - j.render.since;
    if (r) {
      if (elapsed < 1500) {
        r.renderStatus = "queued";
        v.stage = "rendering";
        v.progress = 0.02;
      } else if (elapsed < 9000) {
        r.renderStatus = "rendering";
        v.stage = elapsed < 7500 ? "rendering" : "mixing_audio";
        v.progress = Math.min(0.99, (elapsed - 1500) / 7500);
      } else {
        r.renderStatus = "ready";
        r.videoUrl = `/mock/${v.id}-${r.revision}.mp4`;
        v.stage = "done";
        v.progress = 1;
        j.render = null;
        j.card.hasExport = true;
      }
      v.stageLabel = STAGE_LABELS[v.stage];
    }
  }
  j.card.stage = j.legacy ? null : v.stage;
  j.card.progress = j.legacy ? null : v.progress;
  j.card.status = v.status;
  j.card.title = v.title ?? "Untitled video";
  j.card.favorite = v.favorite;
  j.card.thumbUrl = v.thumbUrl;
  j.card.updatedAt = v.updatedAt;
}

function find(id: string): MockJob {
  const j = state.jobs.find((x) => x.view.id === id && !x.deleted);
  if (!j) throw new ApiError(404, "Not found");
  tick(j);
  return j;
}

const GENERATING = new Set<StudioStage>(["queued", "analyzing_reference", "planning", "voiceover", "assets", "writing", "validating", "reviewing"]);

function matchesFilter(c: StudioVideoCard, f: VideoFilter): boolean {
  switch (f) {
    case "drafts":
      return c.stage === "queued" && (c.progress ?? 0) === 0;
    case "generating":
      return !!c.stage && GENERATING.has(c.stage) && !((c.progress ?? 0) === 0 && c.stage === "queued");
    case "ready":
      return c.stage === "preview_ready" || c.stage === "done" || c.generationMode !== "v2";
    case "exports":
      return c.hasExport;
    case "favorites":
      return c.favorite;
    default:
      return true;
  }
}

// ------------------------------------------------------------ router

export async function handleMock<T>(method: string, path: string, body?: unknown): Promise<T> {
  await wait(180 + Math.random() * 220);
  const url = new URL(path, "http://mock.local");
  const p = url.pathname;
  const M = method.toUpperCase();
  let m: RegExpMatchArray | null;

  if (M === "GET" && p === "/api/me/usage") {
    return { planTier: "pro", planName: "Pro Plan", creditsBalance: 12_400, creditsMonthly: 30_000 } satisfies UsageInfo as T;
  }

  if (M === "POST" && p === "/api/studio/jobs") {
    const input = body as CreateStudioJobInput;
    if (!input.prompt?.trim() && !input.sources?.length) throw new ApiError(400, "Describe your video or attach a reference.");
    const id = `mock-new-${state.seq++}`;
    const fmt = input.format === "match" ? "16:9" : input.format;
    const j = makeJob({
      id,
      title: input.prompt.trim().split(/\s+/).slice(0, 6).join(" ") || "Untitled video",
      prompt: input.prompt,
      photoKey: "mountainsSunset",
      format: fmt,
      duration: input.targetDuration,
      msAgo: 0,
      stage: "queued",
      progress: 0.02,
      voiceId: input.voiceId,
    });
    j.view.thumbUrl = null;
    j.busySince = now();
    j.pendingRevision = { kind: "initial", instruction: null };
    if (input.sources.some((s) => s.kind === "youtube" || s.kind === "upload" || s.kind === "video_url")) {
      j.view.referenceVideoUrl = "https://www.youtube.com/watch?v=mock";
    }
    state.jobs.unshift(j);
    return { id } as T;
  }

  if (M === "GET" && p === "/api/studio/videos") {
    const filter = (url.searchParams.get("filter") ?? "all") as VideoFilter;
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? 50);
    state.jobs.forEach(tick);
    const items = state.jobs
      .filter((j) => !j.deleted)
      .map((j) => ({ ...j.card }))
      .filter((c) => matchesFilter(c, filter))
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .slice(0, limit);
    return { items, nextCursor: null } as T;
  }

  if ((m = p.match(/^\/api\/studio\/videos\/([^/]+)$/))) {
    const j = find(decodeURIComponent(m[1]!));
    if (M === "PATCH") {
      const b = body as { title?: string; favorite?: boolean };
      if (typeof b.title === "string") j.view.title = b.title.trim() || "Untitled video";
      if (typeof b.favorite === "boolean") j.view.favorite = b.favorite;
      tick(j);
      return { ok: true } as T;
    }
    if (M === "DELETE") {
      j.deleted = true;
      return { ok: true } as T;
    }
  }

  if (M === "POST" && (m = p.match(/^\/api\/studio\/videos\/([^/]+)\/duplicate$/))) {
    const src = find(decodeURIComponent(m[1]!));
    const id = `mock-copy-${state.seq++}`;
    const copy: MockJob = JSON.parse(JSON.stringify(src));
    copy.view.id = id;
    copy.card.id = id;
    copy.view.title = `${src.view.title ?? "Untitled"} (copy)`;
    copy.view.createdAt = copy.view.updatedAt = new Date().toISOString();
    copy.view.revisions = copy.view.revisions.map((r) => ({ ...r, documentUrl: `/api/jobs/${id}/document?rev=${r.revision}` }));
    state.jobs.unshift(copy);
    return { id } as T;
  }

  if (M === "GET" && (m = p.match(/^\/api\/jobs\/([^/]+)$/))) {
    const j = find(decodeURIComponent(m[1]!));
    if (j.legacy) return { id: j.view.id, generationMode: "hyperframes", title: j.view.title } as T;
    return JSON.parse(JSON.stringify(j.view)) as T;
  }

  if (M === "POST" && (m = p.match(/^\/api\/jobs\/([^/]+)\/(edit|regenerate)$/))) {
    const j = find(decodeURIComponent(m[1]!));
    if (j.busySince != null || j.render) throw new ApiError(409, "This video is busy. Try again when the current step finishes.");
    const instruction = m[2] === "edit" ? String((body as { instruction?: string })?.instruction ?? "") : null;
    if (m[2] === "edit" && !instruction?.trim()) throw new ApiError(400, "Describe the change you want.");
    j.busySince = now() - 3 * STAGE_STEP_MS; // edits skip the early stages
    j.pendingRevision = { kind: m[2] === "edit" ? "edit" : "regenerate", instruction };
    tick(j);
    return { revision: j.view.revisions.length + 1 } as T;
  }

  if (M === "POST" && (m = p.match(/^\/api\/jobs\/([^/]+)\/revert$/))) {
    const j = find(decodeURIComponent(m[1]!));
    const r = Number((body as { revision?: number })?.revision);
    if (!j.view.revisions.some((x) => x.revision === r)) throw new ApiError(400, "Unknown revision");
    j.view.currentRevision = r;
    return { currentRevision: r } as T;
  }

  if (M === "GET" && (m = p.match(/^\/api\/jobs\/([^/]+)\/timeline$/))) {
    const j = find(decodeURIComponent(m[1]!));
    const count = Number(url.searchParams.get("count") ?? 12);
    const d = j.view.duration ?? 30;
    const frames = Array.from({ length: count }, (_, i) => {
      const t = (d * (i + 0.5)) / count;
      return { time: t, url: timelineFrameSvg(t / d, j.view.width, j.view.height) };
    });
    return { frames } as T;
  }

  if (M === "POST" && (m = p.match(/^\/api\/jobs\/([^/]+)\/render$/))) {
    const j = find(decodeURIComponent(m[1]!));
    const opts = body as ExportOptions;
    const n = opts.revision ?? j.view.currentRevision;
    const r = j.view.revisions.find((x) => x.revision === n);
    if (!r) throw new ApiError(400, "Nothing to render yet");
    if (r.renderStatus !== "ready") {
      j.render = { rev: n, since: now() };
      r.renderStatus = "queued";
    }
    return { revision: n, renderStatus: r.renderStatus } as T;
  }

  if (p === "/api/brand-kit") {
    if (M === "PUT") state.brand = { ...state.brand, ...(body as BrandKit) };
    return { ...state.brand, colors: [...state.brand.colors] } as T;
  }

  if (M === "POST" && p === "/api/brand/scrape") {
    await wait(900);
    const target = String((body as { url?: string })?.url ?? "");
    return {
      url: target,
      pageTitle: "Acme — Build faster",
      palette: ["#ef8354", "#2d3142", "#4f5d75", "#f4d35e"],
      logoUrl: null,
      headlineFont: "Poppins",
      bodyFont: "Inter",
      background: "#ffffff",
    } as T;
  }

  if (p === "/api/assets" && M === "GET") {
    const kind = url.searchParams.get("kind");
    return { items: state.assets.filter((a) => !kind || a.kind === kind) } as T;
  }
  if (M === "DELETE" && (m = p.match(/^\/api\/assets\/([^/]+)$/))) {
    state.assets = state.assets.filter((a) => a.id !== m![1]);
    return { ok: true } as T;
  }

  if (M === "GET" && p === "/api/studio/templates") {
    const cat = url.searchParams.get("category");
    return { items: FALLBACK_TEMPLATES.filter((t: StudioTemplate) => !cat || t.category === cat) } as T;
  }

  if (M === "GET" && p === "/api/voices") {
    throw new ApiError(404, "Not found");
  }

  throw new ApiError(404, `Mock: no handler for ${M} ${p}`);
}

async function fakeProgress(onProgress?: (f: number) => void, ms = 1400) {
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await wait(ms / steps);
    onProgress?.(i / steps);
  }
}

export async function mockUploadAsset(file: File, onProgress?: (f: number) => void, kind?: UserAsset["kind"]): Promise<UserAsset> {
  await fakeProgress(onProgress);
  const k: UserAsset["kind"] =
    kind ?? (file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image");
  const asset: UserAsset = {
    id: `a-${state.seq++}`,
    kind: k,
    name: file.name,
    url: URL.createObjectURL(file),
    mime: file.type || null,
    bytes: file.size,
    duration: null,
    width: null,
    height: null,
    source: "upload",
    createdAt: new Date().toISOString(),
  };
  state.assets.unshift(asset);
  return asset;
}

export async function mockUploadReference(file: File, onProgress?: (f: number) => void) {
  if (file.size > 95 * 1024 * 1024) throw new ApiError(413, "Reference video must be ≤ 95 MB — paste a link for larger clips.");
  await fakeProgress(onProgress, 2200);
  return { referenceVideoUrl: URL.createObjectURL(file), storagePath: `reference/mock/${file.name}`, name: file.name };
}

// ------------------------------------------------------------ demo document

function timelineFrameSvg(p: number, w: number, h: number): string {
  const hue = Math.round(20 + p * 18);
  const sunY = 70 - p * 30;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='xMidYMid slice'>
<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='hsl(${hue + 200},35%,${18 + p * 10}%)'/><stop offset='0.7' stop-color='hsl(${hue},80%,${55 + p * 8}%)'/></linearGradient></defs>
<rect width='100%' height='100%' fill='url(#s)'/>
<circle cx='${w * 0.62}' cy='${(h * sunY) / 100}' r='${h * 0.09}' fill='#ffd9a8'/>
<path d='M0 ${h * 0.78} L${w * 0.2} ${h * 0.5} L${w * 0.38} ${h * 0.7} L${w * 0.58} ${h * 0.42} L${w * 0.8} ${h * 0.68} L${w} ${h * 0.52} L${w} ${h} L0 ${h}Z' fill='#2d3142'/>
<path d='M0 ${h * 0.88} L${w * 0.3} ${h * 0.68} L${w * 0.55} ${h * 0.84} L${w * 0.82} ${h * 0.7} L${w} ${h * 0.8} L${w} ${h} L0 ${h}Z' fill='#1f222e'/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// A tiny self-contained Videly document that implements the preview
// postMessage protocol from app/lib/studio/clock-shim.ts:
//   parent → iframe: videly:seek {time} · videly:play · videly:pause
//   iframe → parent: videly:ready {duration,width,height} · videly:time {time,playing}
export function mockDocument(jobId: string, revNo: number): string {
  const j = state.jobs.find((x) => x.view.id === jobId);
  const w = j?.view.width ?? 1920;
  const h = j?.view.height ?? 1080;
  const d = j?.view.duration ?? 30;
  const title = (j?.view.title ?? "Ideas Move the World.").replace(/[<>&"]/g, "");
  const words = title.split(/\s+/);
  const head = words.slice(0, Math.max(1, words.length - 2)).join(" ");
  const tail = words.slice(Math.max(1, words.length - 2)).join(" ");
  return `<!doctype html><html><head><meta charset="utf-8">
<script>window.__videly={duration:${d},fps:30,width:${w},height:${h}};</script>
<style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#1f222e;font-family:Inter,system-ui,sans-serif}
#sky{position:absolute;inset:0}
#sun{position:absolute;border-radius:50%;background:radial-gradient(circle,#ffe2b8 0%,#ffb27a 45%,rgba(255,140,90,0) 70%)}
.m{position:absolute;left:-5%;width:110%;bottom:0}
#t{position:absolute;left:8%;right:8%;top:30%;color:#fff;font-weight:800;letter-spacing:-0.03em;line-height:1.02}
#t b{color:#ef8354;font-weight:800}
#sub{position:absolute;left:8%;color:rgba(255,255,255,.8);font-weight:500}
#badge{position:absolute;right:3%;top:4%;color:rgba(255,255,255,.55);font:600 ${Math.round(h * 0.022)}px Inter,sans-serif;letter-spacing:.1em}
</style></head><body>
<div id="sky"></div><div id="sun"></div>
<svg class="m" id="m1" viewBox="0 0 100 40" preserveAspectRatio="none" style="height:55%"><path d="M0 40 L0 22 L14 8 L26 20 L40 4 L56 22 L70 10 L86 24 L100 12 L100 40Z" fill="#4f5d75"/></svg>
<svg class="m" id="m2" viewBox="0 0 100 40" preserveAspectRatio="none" style="height:38%"><path d="M0 40 L0 26 L18 12 L34 28 L52 14 L68 30 L84 16 L100 26 L100 40Z" fill="#2d3142"/></svg>
<svg class="m" id="m3" viewBox="0 0 100 40" preserveAspectRatio="none" style="height:20%"><path d="M0 40 L0 24 L22 14 L44 28 L66 18 L88 30 L100 22 L100 40Z" fill="#1f222e"/></svg>
<div id="t"><span id="h1">${head}</span> <b id="h2">${tail}</b></div>
<div id="sub">Made with Videly · V${revNo}</div>
<div id="badge">MOCK PREVIEW</div>
<script>
(function(){
  var D=${d},W=${w},H=${h},t=0,playing=false,last=0;
  var $=function(id){return document.getElementById(id)};
  var fs=Math.round(Math.min(W,H*1.6)*0.075);
  $("t").style.fontSize=fs+"px";$("sub").style.fontSize=Math.round(fs*0.32)+"px";
  function ease(x){x=Math.max(0,Math.min(1,x));return 1-Math.pow(1-x,3)}
  function draw(){
    var p=t/D;
    $("sky").style.background="linear-gradient(180deg,hsl("+(225-p*20)+",35%,"+(14+p*8)+"%) 0%,hsl("+(18+p*10)+",85%,"+(58-p*6)+"%) 75%)";
    var s=H*0.26;$("sun").style.width=$("sun").style.height=s+"px";
    $("sun").style.left=(W*0.58)+"px";$("sun").style.top=(H*(0.18+p*0.3))+"px";
    $("m1").style.transform="translateX("+(-p*2)+"%)";
    $("m2").style.transform="translateX("+(-p*4)+"%)";
    $("m3").style.transform="translateX("+(-p*7)+"%)";
    var a=ease((t+0.9)/1.2),b=ease((t+0.2)/1.2);
    $("h1").style.opacity=a;$("h1").style.display="inline-block";$("h1").style.transform="translateY("+((1-a)*40)+"px)";
    $("h2").style.opacity=b;$("h2").style.display="inline-block";$("h2").style.transform="translateY("+((1-b)*40)+"px)";
    var c=ease((t+0.5)/1);$("sub").style.opacity=c;$("sub").style.top=(H*0.3+fs*2.6+(1-c)*20)+"px";
  }
  function post(m){try{parent.postMessage(m,"*")}catch(e){}}
  function loop(now){
    if(playing){t+= (now-last)/1000; if(t>=D){t=D;playing=false}}
    last=now;draw();post({type:"videly:time",time:t,playing:playing});
    requestAnimationFrame(loop);
  }
  window.addEventListener("message",function(e){
    var m=e.data||{};
    if(m.type==="videly:seek"){t=Math.max(0,Math.min(D,+m.time||0));draw();post({type:"videly:time",time:t,playing:playing})}
    else if(m.type==="videly:play"){if(t>=D)t=0;playing=true}
    else if(m.type==="videly:pause"){playing=false}
  });
  draw();post({type:"videly:ready",duration:D,width:W,height:H});
  requestAnimationFrame(function(n){last=n;loop(n)});
})();
</script></body></html>`;
}
