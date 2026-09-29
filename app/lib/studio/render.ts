// Frame-by-frame renderer for Videly v2 documents.
//
// CONTRACT STUB — the renderer workstream replaces the bodies below; the
// signatures are what the generation pipeline and the API routes call.

import type { VidelyDocumentMeta } from "./types";

export type RenderInput = {
  html: string; // full HTML document (the generated video)
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  seed: number; // Math.random / crypto seed for determinism
  // Extra hosts the page may load from (Supabase storage, asset mirrors).
  // /studio-libs/ and data:/blob: are always allowed; everything else is blocked.
  allowedHosts: string[];
  scale?: number; // deviceScaleFactor for 4K (2) — default 1
};

export type PageIssue = { kind: "pageerror" | "console" | "blocked_request" | "timeout" | "contract"; message: string };

export type CaptureResult = {
  frames: { time: number; jpeg: Buffer }[];
  meta: VidelyDocumentMeta | null; // what the page declared in window.__videly
  issues: PageIssue[];
  webglAvailable: boolean;
};

export type RenderVideoInput = RenderInput & {
  outPath: string; // local MP4 path
  crf?: number; // 18 = high, 23 = standard
  onProgress?: (fraction: number) => void;
};

export type RenderVideoResult = { outPath: string; frames: number; seconds: number; issues: PageIssue[] };

// Open the document with the virtual clock, wait for readiness, seek to each
// time and capture a JPEG. Used for validation smoke renders, contact sheets,
// thumbnails and the timeline strip.
export async function captureFrames(_input: RenderInput, _times: number[]): Promise<CaptureResult> {
  throw new Error("captureFrames: not implemented yet");
}

// Render every frame (duration * fps) and encode an H.264 MP4 (no audio).
export async function renderVideo(_input: RenderVideoInput): Promise<RenderVideoResult> {
  throw new Error("renderVideo: not implemented yet");
}
