// Deterministic emitter — translates an AssembledComposition into
// {html, css, js}. No LLM. The two MotionGlass Tells are injected here:
//
//   Tell 1 — Pre-reveal compression: surrounding non-focal elements
//            compress 8–15% toward focal center for 180–260ms before any
//            reveal primitive fires, then snap back at the reveal start.
//
//   Tell 2 — Late-release: the timeline holds for 80–120ms past the
//            last primitive's mathematical resolution. Encoded as a
//            terminal no-op tween of the chosen duration.
//
//   Intentional Imperfection — held-frame tail (200–400ms) on the
//            designated hold scene.
//
// Hard laws enforced here:
//   - ES-3 (breathingHold scene has zero primitives)
//   - TM-2 (staggerWordReveal stagger clamp)
//   - Structural contract (data-composition-id, paused timeline,
//     window.__timelines registration, GSAP CDN)
//
// Throws if any hard law is violated. Soft warnings flow through
// frame-taste.ts.

import { LAW_CONSTANTS } from "../philosophy";
import { getPrimitive } from "../primitives/registry";
import type {
  AssembledComposition,
  LayoutNode,
  PrimitiveInstance,
  SceneFiles,
} from "../types";

const GSAP_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";

export function emitSceneCode(comp: AssembledComposition): SceneFiles {
  enforceHardLaws(comp);

  const html = emitHTML(comp);
  const css = emitCSS(comp);
  const js = emitJS(comp);

  return { html, css, js };
}

// ─── Hard-law enforcement ────────────────────────────────────────────────

function enforceHardLaws(comp: AssembledComposition): void {
  const { scene, resolvedPrimitives } = comp;

  // ES-3 — breathingHold scene has zero primitives.
  if (scene.kinetic === "breathingHold" && resolvedPrimitives.length > 0) {
    throw new Error(
      `[emit] ES-3 violated: breathingHold scene "${scene.id}" has ${resolvedPrimitives.length} primitives.`,
    );
  }

  // TM-2 — staggerWordReveal stagger in [60ms, 140ms].
  for (const p of resolvedPrimitives) {
    if (p.primitiveId === "staggerWordReveal") {
      const stagger = Number(p.params.staggerMs);
      if (
        !Number.isFinite(stagger) ||
        stagger < LAW_CONSTANTS.staggerWordRevealMinMs ||
        stagger > LAW_CONSTANTS.staggerWordRevealMaxMs
      ) {
        throw new Error(
          `[emit] TM-2 violated: staggerWordReveal staggerMs=${stagger} out of [${LAW_CONSTANTS.staggerWordRevealMinMs}, ${LAW_CONSTANTS.staggerWordRevealMaxMs}].`,
        );
      }
    }
  }

  // CA-1 — asymmetricLeft focal-x in [0.18, 0.38].
  if (comp.topology.archetype === "asymmetricLeft") {
    const fx = comp.topology.focalCenter.x;
    if (
      fx < LAW_CONSTANTS.asymmetricLeftFocalXMin ||
      fx > LAW_CONSTANTS.asymmetricLeftFocalXMax
    ) {
      throw new Error(
        `[emit] CA-1 violated: asymmetricLeft focal-x=${fx} out of [${LAW_CONSTANTS.asymmetricLeftFocalXMin}, ${LAW_CONSTANTS.asymmetricLeftFocalXMax}].`,
      );
    }
  }

  // CA-3 — no centered focal placement unless intent="establish_problem"
  // or kinetic="lockedMomentum".
  if (comp.topology.archetype === "centeredCompressed") {
    if (
      scene.intent !== "establish_problem" &&
      scene.kinetic !== "lockedMomentum"
    ) {
      throw new Error(
        `[emit] CA-3 violated: centeredCompressed used with intent=${scene.intent}, kinetic=${scene.kinetic}.`,
      );
    }
  }
}

// ─── HTML ────────────────────────────────────────────────────────────────

function emitHTML(comp: AssembledComposition): string {
  const { scene, topology, emittedDuration } = comp;
  const stageInner = renderNodeInner(topology.root);

  const meta = comp.scene.id;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(comp.scene.text.headline || meta)}</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<div id="stage"
     data-composition-id="${esc(scene.id)}"
     data-start="0"
     data-duration="${num(emittedDuration)}"
     data-width="1920"
     data-height="1080"
     class="${cls(topology.root.classList)}">
${stageInner}
</div>
<script src="${GSAP_CDN}"></script>
<script src="./animation.js"></script>
</body>
</html>`;
}

function renderNodeInner(node: LayoutNode): string {
  return node.children.map(renderNode).join("\n");
}

function renderNode(node: LayoutNode): string {
  const tag = node.tag;
  const cls = node.classList.length
    ? ` class="${esc(node.classList.join(" "))}"`
    : "";
  const id = ` id="${esc(node.id)}"`;
  const depth = ` data-depth="${node.depthLayer}"`;
  const inner = node.textContent !== undefined
    ? esc(node.textContent)
    : node.children.map(renderNode).join("\n");
  return `<${tag}${id}${cls}${depth}>${inner}</${tag}>`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────

function emitCSS(comp: AssembledComposition): string {
  const palette = comp.scene; // for future palette wiring
  void palette;

  const positions = collectPositionRules(comp.topology.root);

  return `
:root {
  --mg-bg: #050505;
  --mg-fg: #ffffff;
  --mg-accent: #7c5cff;
}
html, body { margin: 0; padding: 0; background: var(--mg-bg); color: var(--mg-fg); }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
#stage {
  position: relative;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  background: var(--mg-bg);
}
.mg-background {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 30% 40%, rgba(124,92,255,0.18), transparent 55%),
    radial-gradient(circle at 75% 70%, rgba(255,255,255,0.04), transparent 60%),
    var(--mg-bg);
}
.mg-focal {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
.mg-headline {
  margin: 0;
  font-size: 96px;
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--mg-fg);
}
.mg-subline {
  margin: 0;
  font-size: 28px;
  line-height: 1.3;
  color: rgba(255,255,255,0.62);
}
.mg-satellite {
  position: absolute;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  backdrop-filter: blur(2px);
}
.mg-depth-layer {
  position: absolute;
  background: linear-gradient(120deg, rgba(124,92,255,0.06), rgba(124,92,255,0.02));
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.04);
}
.mg-word { will-change: transform, opacity; }
${positions}
`.trim();
}

function collectPositionRules(node: LayoutNode): string {
  const out: string[] = [];
  const walk = (n: LayoutNode) => {
    if (n.id !== "stage") {
      const { x, y, width, height } = n.position;
      out.push(
        `#${cssEscapeId(n.id)} { left: ${pct(x)}; top: ${pct(y)}; width: ${pct(width)}; height: ${pct(height)}; z-index: ${n.zIndex}; }`,
      );
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out.join("\n");
}

// ─── JS ──────────────────────────────────────────────────────────────────

function emitJS(comp: AssembledComposition): string {
  const { scene, topology, resolvedPrimitives, applyPreRevealCompression, lateReleaseExtension, heldFrameTail } = comp;

  const sceneIdLit = JSON.stringify(scene.id);
  const tlVar = "tl";

  const parts: string[] = [];
  parts.push(`(function(){`);
  parts.push(`var gsap = window.gsap;`);
  parts.push(`var ${tlVar} = gsap.timeline({ paused: true });`);

  // Tell 1 — pre-reveal compression around each reveal-class primitive.
  if (applyPreRevealCompression) {
    const reveals = resolvedPrimitives
      .filter((p) => isRevealPrimitive(p.primitiveId))
      .sort((a, b) => a.startAt - b.startAt);

    for (const r of reveals) {
      const preMs = pickMsInRange(
        LAW_CONSTANTS.preRevealCompressionMinMs,
        LAW_CONSTANTS.preRevealCompressionMaxMs,
        scene.id + r.primitiveId + r.startAt,
      );
      const amount = pickAmountInRange(
        LAW_CONSTANTS.preRevealCompressionAmountMin,
        LAW_CONSTANTS.preRevealCompressionAmountMax,
        scene.id + r.primitiveId + r.startAt,
      );
      const pre = preMs / 1000;
      const compressStart = Math.max(0, r.startAt - pre);
      const fcx = topology.focalCenter.x;
      const fcy = topology.focalCenter.y;

      parts.push(
        `// Tell 1 — pre-reveal compression (amount=${amount.toFixed(3)}, pre=${preMs}ms) for ${r.primitiveId}@${r.startAt}`,
      );
      parts.push(
        `${tlVar}.to(".mg-satellite, .mg-depth-layer", {
          scale: 1 - ${amount},
          x: function(i, el){ var b=el.getBoundingClientRect(), s=document.getElementById("stage").getBoundingClientRect(); var cx=(b.left+b.width/2 - s.left)/s.width, cy=(b.top+b.height/2 - s.top)/s.height; return (${fcx} - cx) * s.width * ${amount}; },
          y: function(i, el){ var b=el.getBoundingClientRect(), s=document.getElementById("stage").getBoundingClientRect(); var cx=(b.left+b.width/2 - s.left)/s.width, cy=(b.top+b.height/2 - s.top)/s.height; return (${fcy} - cy) * s.height * ${amount}; },
          duration: ${pre * 0.65},
          ease: "power3.in"
        }, ${compressStart});`,
      );
      parts.push(
        `${tlVar}.to(".mg-satellite, .mg-depth-layer", {
          scale: 1, x: 0, y: 0,
          duration: ${Math.max(0.08, pre * 0.35)},
          ease: "expo.out"
        }, ${r.startAt});`,
      );
    }
  }

  // Primitive contributions (in plan order).
  for (const inst of resolvedPrimitives) {
    const prim = getPrimitive(inst.primitiveId);
    parts.push(`// primitive: ${inst.primitiveId} @ ${inst.startAt}s`);
    parts.push(prim.js(inst.params, resolveTarget(inst, comp), tlVar, inst.startAt));
  }

  // Tell 2 — late-release tail (only when there is motion).
  if (resolvedPrimitives.length > 0 && lateReleaseExtension > 0) {
    parts.push(`// Tell 2 — late-release (${(lateReleaseExtension * 1000) | 0}ms)`);
    parts.push(
      `${tlVar}.to("#stage", { opacity: 1, duration: ${lateReleaseExtension} }, ${comp.scene.duration});`,
    );
  }

  // Held-frame tail (Intentional Imperfection).
  if (heldFrameTail > 0) {
    parts.push(`// Held-frame tail (${(heldFrameTail * 1000) | 0}ms)`);
    parts.push(
      `${tlVar}.to("#stage", { opacity: 1, duration: ${heldFrameTail} }, ${comp.scene.duration + lateReleaseExtension});`,
    );
  }

  // Auto-play once after registering (HyperFrames captures playback).
  parts.push(`window.__timelines = window.__timelines || {};`);
  parts.push(`window.__timelines[${sceneIdLit}] = ${tlVar};`);
  parts.push(`document.addEventListener("DOMContentLoaded", function(){ ${tlVar}.play(); });`);

  parts.push(`})();`);
  return parts.join("\n");
}

function isRevealPrimitive(id: string): boolean {
  return id === "staggerWordReveal" || id === "focalCollapse";
}

function resolveTarget(inst: PrimitiveInstance, comp: AssembledComposition): string {
  // If the caller provided an absolute target, use it. Otherwise default
  // to the primitive's natural anchor: focal for typography/motion,
  // stage for depth.
  if (inst.target) return inst.target;
  if (inst.primitiveId === "depthShift") return "#stage";
  if (inst.primitiveId === "staggerWordReveal") return "#headline";
  return "#focal";
}

// ─── helpers ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function cls(arr: string[]): string {
  return esc(arr.join(" "));
}
function pct(n: number): string {
  return (n * 100).toFixed(4) + "%";
}
function num(n: number): string {
  return Number(n.toFixed(4)).toString();
}
function cssEscapeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function pickMsInRange(minMs: number, maxMs: number, seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return minMs + ((h >>> 0) % (maxMs - minMs + 1));
}
function pickAmountInRange(min: number, max: number, seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const span = max - min;
  return min + ((h >>> 0) / 0xffffffff) * span;
}
