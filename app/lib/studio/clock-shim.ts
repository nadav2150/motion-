// Virtual clock injected into every Videly v2 document, in the renderer
// (page.addInitScript) and in the browser preview (first inline <script>).
//
// CONTRACT STUB — the renderer workstream replaces the body.
//
// Preview postMessage protocol (parent <-> sandboxed iframe):
//   parent -> iframe: { type: "videly:seek", time } | { type: "videly:play" } | { type: "videly:pause" }
//   iframe -> parent: { type: "videly:ready", duration, width, height }
//                     { type: "videly:time", time, playing }
//                     { type: "videly:error", message }

export type ShimMode = "render" | "preview";

// Returns JavaScript source (no <script> tags) to run before any page script.
export function buildClockShim(_opts: { seed: number; mode: ShimMode }): string {
  throw new Error("buildClockShim: not implemented yet");
}
