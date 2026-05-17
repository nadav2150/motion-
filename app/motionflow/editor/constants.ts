import type { CSSProperties } from "react";
import type { JobStatus, SceneAssetKind } from "./types";

// Polling stops when status is in TERMINAL. `scenes_ready` is a *pause*
// state for the split pipeline — polling stops so the Export button
// activates; clicking Export resumes polling via pollNonce bump.
export const TERMINAL: JobStatus[] = ["completed", "failed", "canceled", "scenes_ready"];

export const STATUS_TONE: Record<JobStatus, { tone: "default" | "glow" | "success"; dot: string; label: string }> = {
  pending: { tone: "default", dot: "#7AA2FF", label: "QUEUED" },
  directing: { tone: "glow", dot: "#A78BFA", label: "DIRECTING" },
  asset_planning: { tone: "glow", dot: "#F0B86E", label: "PLANNING ASSETS" },
  rendering: { tone: "glow", dot: "#67E8F9", label: "RENDERING" },
  generating_scenes: { tone: "glow", dot: "#A78BFA", label: "GENERATING SCENES" },
  vision_critique: { tone: "glow", dot: "#F0B86E", label: "VISION CRITIQUE" },
  refining_scenes: { tone: "glow", dot: "#A78BFA", label: "REFINING SCENES" },
  scenes_ready: { tone: "default", dot: "#A6F0BD", label: "SCENES READY · CLICK EXPORT" },
  rendering_scenes: { tone: "glow", dot: "#67E8F9", label: "RENDERING SCENES" },
  stitching: { tone: "glow", dot: "#67E8F9", label: "STITCHING" },
  completed: { tone: "success", dot: "#A6F0BD", label: "READY" },
  failed: { tone: "default", dot: "#FCA5A5", label: "FAILED" },
  canceled: { tone: "default", dot: "#9CA3AF", label: "CANCELED" },
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.25)",
  border: "1px solid var(--line)",
  color: "var(--ink-1)",
  fontSize: 12.5,
  lineHeight: 1.55,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export const ASSET_KINDS: { id: SceneAssetKind; label: string }[] = [
  { id: "video", label: "VIDEO" },
  { id: "image", label: "IMAGES" },
  { id: "screenshot", label: "SCREENSHOTS" },
  { id: "voiceover", label: "VOICE OVER" },
  { id: "sfx", label: "SOUND EFFECTS" },
  { id: "music", label: "MUSIC" },
];
