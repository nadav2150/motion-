// Typed client for the Videly v2 ("Studio") API. Calls exactly the endpoints
// in docs/studio-v2-contract.md. In dev, `?mock=1` (or
// localStorage['videly:mock'] === '1') routes every call to ./mock instead, so
// every screen can be built and screenshotted before the backend exists. The
// mock module is only loaded through a dynamic import behind
// `import.meta.env.DEV`, so it never ships in a production bundle.

import type {
  BrandKit,
  CreateStudioJobInput,
  ExportOptions,
  RenderStatus,
  StudioJobView,
  StudioTemplate,
  StudioVideoCard,
  TemplateCategory,
  UserAsset,
} from "../../lib/studio/types";

export type VideoFilter = "all" | "drafts" | "generating" | "ready" | "exports" | "favorites";

export type UsageInfo = {
  planTier: string;
  planName: string;
  creditsBalance: number;
  creditsMonthly: number;
  // Added for the upsell UI; optional so loader fallbacks and mocks still fit.
  creditsReserved?: number;
  nextVideoCost?: number;
  lowCredit?: boolean;
  features?: {
    watermark: boolean;
    export4k: boolean;
    audio: boolean;
    maxStudioDuration: number;
    maxScriptChars: number | null;
  };
  subscription?: {
    tier: string;
    provider: "polar" | "dodo";
    cancelAtPeriodEnd: boolean;
    periodEnd: string | null;
    remainingFraction: number;
  } | null;
};

export type VoiceOption = {
  id: string;
  label: string;
  gender?: string;
  accent?: string;
  tone?: string;
  previewUrl?: string | null;
};

export type ScrapedBrandResult = {
  url: string;
  pageTitle: string | null;
  palette: string[];
  logoUrl: string | null;
  headlineFont: string | null;
  bodyFont: string | null;
  background: string | null;
};

export type ReferenceUpload = { referenceVideoUrl: string; storagePath: string; name: string };

// Legacy (hyperframes / legacy_ai_media) jobs keep the old GET /api/jobs/:id shape.
export type LegacyJobView = { id: string; generationMode?: string; [k: string]: unknown };
export type AnyJobView = StudioJobView | LegacyJobView;

export function isStudioJob(j: AnyJobView | null | undefined): j is StudioJobView {
  return !!j && (j as StudioJobView).generationMode === "v2";
}

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
  get isPaymentRequired() {
    return this.status === 402;
  }
}

// ---------------------------------------------------------------- mock switch

const MOCK_KEY = "videly:mock";

export function isMockMode(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("mock");
    if (q === "1") {
      window.localStorage.setItem(MOCK_KEY, "1");
      // Lets the dev server's page loaders skip auth too (see session.server.ts).
      document.cookie = "videly_mock=1; path=/; SameSite=Lax";
      return true;
    }
    if (q === "0") {
      window.localStorage.removeItem(MOCK_KEY);
      document.cookie = "videly_mock=; path=/; Max-Age=0; SameSite=Lax";
      return false;
    }
    return window.localStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

async function mock() {
  return import("./mock");
}

// ---------------------------------------------------------------- transport

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (import.meta.env.DEV && isMockMode()) {
    const m = await mock();
    return m.handleMock<T>(method, path, body);
  }
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const msg =
      typeof json.error === "string"
        ? json.error
        : res.status === 401
          ? "Your session expired. Sign in again."
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, json);
  }
  return json as T;
}

// Multipart upload with progress (fetch has no upload progress events).
function upload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>;
      } catch {
        json = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(json as T);
      } else {
        reject(new ApiError(xhr.status, typeof json.error === "string" ? json.error : `Upload failed (${xhr.status})`, json));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error during upload"));
    xhr.send(form);
  });
}

function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------- endpoints

export const api = {
  createJob: (input: CreateStudioJobInput) => request<{ id: string }>("POST", "/api/studio/jobs", input),

  getJob: (id: string) => request<AnyJobView>("GET", `/api/jobs/${encodeURIComponent(id)}`),

  // Admin only — public /v/:slug link for an exported revision.
  createShareLink: (jobId: string, revision: number) =>
    request<{ slug: string; url: string }>("POST", "/api/share", { jobId, revision }),

  listVideos: (opts: { filter?: VideoFilter; q?: string; limit?: number; cursor?: string | null } = {}) =>
    request<{ items: StudioVideoCard[]; nextCursor: string | null }>(
      "GET",
      `/api/studio/videos${qs({ filter: opts.filter ?? "all", q: opts.q, limit: opts.limit, cursor: opts.cursor })}`,
    ),

  updateVideo: (id: string, patch: { title?: string; favorite?: boolean }) =>
    request<{ ok: true }>("PATCH", `/api/studio/videos/${encodeURIComponent(id)}`, patch),

  deleteVideo: (id: string) => request<{ ok: true }>("DELETE", `/api/studio/videos/${encodeURIComponent(id)}`),

  duplicateVideo: (id: string) => request<{ id: string }>("POST", `/api/studio/videos/${encodeURIComponent(id)}/duplicate`),

  // Copies a template's example video into the account → open it in the editor.
  useTemplate: (templateId: string) =>
    request<{ id: string }>("POST", `/api/studio/templates/${encodeURIComponent(templateId)}/use`),

  editJob: (id: string, instruction: string, revision?: number) =>
    request<{ revision: number }>("POST", `/api/jobs/${encodeURIComponent(id)}/edit`, { instruction, revision }),

  regenerateJob: (id: string) => request<{ revision: number }>("POST", `/api/jobs/${encodeURIComponent(id)}/regenerate`, {}),

  revertJob: (id: string, revision: number) =>
    request<{ currentRevision: number }>("POST", `/api/jobs/${encodeURIComponent(id)}/revert`, { revision }),

  // The preview iframe either loads the same-origin document URL or, in mock
  // mode, an inline demo document through srcdoc.
  previewSource: async (id: string, rev: number): Promise<{ src?: string; srcdoc?: string }> => {
    if (import.meta.env.DEV && isMockMode()) {
      const m = await mock();
      return { srcdoc: m.mockDocument(id, rev) };
    }
    return { src: `/api/jobs/${encodeURIComponent(id)}/document?rev=${rev}` };
  },

  getTimeline: (id: string, rev: number, count = 12) =>
    request<{ frames: { time: number; url: string }[] }>(
      "GET",
      `/api/jobs/${encodeURIComponent(id)}/timeline${qs({ rev, count })}`,
    ),

  render: (id: string, opts: ExportOptions) =>
    request<{ revision: number; renderStatus: RenderStatus }>("POST", `/api/jobs/${encodeURIComponent(id)}/render`, opts),

  downloadUrl: (id: string, rev: number) => `/api/jobs/${encodeURIComponent(id)}/download?rev=${rev}`,

  getBrandKit: () => request<BrandKit>("GET", "/api/brand-kit"),
  putBrandKit: (kit: BrandKit) => request<BrandKit>("PUT", "/api/brand-kit", kit),

  scrapeBrand: (url: string) => request<ScrapedBrandResult>("POST", "/api/brand/scrape", { url }),

  listAssets: (kind?: UserAsset["kind"] | "all") =>
    request<{ items: UserAsset[] }>("GET", `/api/assets${qs({ kind: kind && kind !== "all" ? kind : undefined })}`),

  uploadAsset: async (file: File, onProgress?: (f: number) => void, kind?: UserAsset["kind"]): Promise<UserAsset> => {
    if (import.meta.env.DEV && isMockMode()) return (await mock()).mockUploadAsset(file, onProgress, kind);
    const form = new FormData();
    form.set("file", file);
    if (kind) form.set("kind", kind);
    return upload<UserAsset>("/api/assets", form, onProgress);
  },

  deleteAsset: (id: string) => request<{ ok: boolean }>("DELETE", `/api/assets/${encodeURIComponent(id)}`),

  uploadReferenceVideo: async (file: File, onProgress?: (f: number) => void): Promise<ReferenceUpload> => {
    if (import.meta.env.DEV && isMockMode()) return (await mock()).mockUploadReference(file, onProgress);
    const form = new FormData();
    form.set("file", file);
    return upload<ReferenceUpload>("/api/reference-video", form, onProgress);
  },

  listTemplates: (category?: TemplateCategory | "all") =>
    request<{ items: StudioTemplate[] }>(
      "GET",
      `/api/studio/templates${qs({ category: category && category !== "all" ? category : undefined })}`,
    ),

  getUsage: () => request<UsageInfo>("GET", "/api/me/usage"),

  // Optional endpoint; callers fall back to the voice list their loader passed.
  listVoices: async (): Promise<VoiceOption[] | null> => {
    try {
      const r = await request<{ items?: VoiceOption[]; voices?: VoiceOption[] } | VoiceOption[]>("GET", "/api/voices");
      if (Array.isArray(r)) return r;
      return r.items ?? r.voices ?? null;
    } catch {
      return null;
    }
  },
};

export const MAX_REFERENCE_MB = 95;
export const GENERATING_STAGES = new Set([
  "queued",
  "analyzing_reference",
  "planning",
  "voiceover",
  "assets",
  "writing",
  "validating",
  "reviewing",
]);
