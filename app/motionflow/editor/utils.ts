import type {
  DisplayStatus,
  JobAsset,
  SceneAsset,
  SceneComment,
  ShotRow,
} from "./types";

export const fmtDuration = (s: number) => `${s.toFixed(1).replace(/\.0$/, "")}s`;

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};

export function deriveShotDisplay(
  shot: ShotRow,
): { status: DisplayStatus; label: string; error: string | null } {
  if (shot.status === "failed") return { status: "failed", label: "IMG FAILED", error: shot.error };
  if (shot.status === "pending") return { status: "pending", label: "QUEUED", error: null };
  if (shot.status === "generating") return { status: "generating", label: "RENDERING IMG", error: null };
  // image ready — look at clip
  if (shot.clip_status === "ready") return { status: "clip_ready", label: "CLIP READY", error: null };
  if (shot.clip_status === "generating") return { status: "clip_generating", label: "RENDERING CLIP", error: null };
  if (shot.clip_status === "failed") return { status: "clip_failed", label: "CLIP FAILED", error: shot.clip_error };
  // 'skipped' or 'pending' → clip not yet generated; image is the deliverable.
  return { status: "clip_skipped", label: "IMG READY", error: null };
}

export function relativeTimeShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return "now";
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export function deriveLogoName(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").pop() ?? "logo");
  } catch {
    return "logo";
  }
}

// Shared DataTransfer parser — the left-side asset cards set
// "application/x-mg-asset" to JSON.stringify(JobAsset) and three drop targets
// read it back (scene tiles, right Assets tab, cinema preview).
export function readDraggedAsset(e: React.DragEvent): JobAsset | null {
  try {
    const raw = e.dataTransfer.getData("application/x-mg-asset");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as JobAsset).id === "string" &&
      typeof (parsed as JobAsset).url === "string" &&
      typeof (parsed as JobAsset).kind === "string"
    ) {
      return parsed as JobAsset;
    }
    return null;
  } catch {
    return null;
  }
}

export function isSceneCommentArray(v: unknown): v is SceneComment[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        typeof (c as { text?: unknown }).text === "string" &&
        typeof (c as { created_at?: unknown }).created_at === "string",
    )
  );
}

export function isJobAssetArray(v: unknown): v is JobAsset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { url?: unknown }).url === "string" &&
        typeof (a as { kind?: unknown }).kind === "string",
    )
  );
}

export function isSceneAssetArray(v: unknown): v is SceneAsset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { kind?: unknown }).kind === "string" &&
        typeof (a as { url?: unknown }).url === "string",
    )
  );
}
