// Motion Telemetry — deterministic measurement of rendered scene motion.
//
// The vision critique reads blended motion-trail composites, which cannot
// show timing problems: teleport jank, pop-ins, dead air, linear/mechanical
// easing, unsettled endings. This module computes those signals from real
// rendered samples (element rects + opacities at ~4 Hz, captured by
// thumbnail.ts:captureSceneMotionTelemetry) and turns them into:
//   • renderTelemetryBlock — text injected into the existing vision-critique
//     call (no new LLM calls)
//   • telemetryGates — hard, unambiguous failures that force a scene into
//     the existing refinement round even if the critic said "ship"
//
// Everything in this module is pure — samples in, metrics/text out — so the
// bulk of confidence comes from unit tests with synthetic motion profiles.
// See docs/superpowers/specs/2026-06-11-motion-telemetry-design.md.

export type ElementKind = "text" | "media";

export type SampledRect = { x: number; y: number; w: number; h: number };

export type ElementMotionSamples = {
  /** Stable label minted by the in-page sampler, e.g. "h1#title.hero@2". */
  selector: string;
  kind: ElementKind;
  /** Bounding rects per sample, aligned with sampleTimesSeconds. */
  rects: SampledRect[];
  /** Effective (ancestor-multiplied) opacity per sample. */
  opacities: number[];
};

export type SceneMotionSamples = {
  sceneId: string;
  /** Scene-local sample times (0 = scene start), evenly spaced. */
  sampleTimesSeconds: number[];
  durationSeconds: number;
  viewport: { w: number; h: number };
  elements: ElementMotionSamples[];
};

// Tunable thresholds. Initial values per the design spec — conservative so
// hard gates only fire on unambiguous failures. Exported for tests and for
// tuning from real-run telemetry later.
export const TELEMETRY = {
  samplesPerSecond: 4,
  minSamples: 12,
  maxSamples: 24,
  maxElements: 30,
  /** Center+size displacement below this (px/interval) counts as still. */
  stillEpsilonPx: 2,
  opacityEpsilon: 0.02,
  /** Final fraction of the scene treated as the settle window. */
  settleFraction: 0.1,
  /** Teleport: one-interval jump > this × viewport diagonal… */
  teleportViewportFraction: 0.15,
  /** …while both neighboring intervals moved < this × diagonal. */
  teleportNeighborMaxFraction: 0.02,
  /** Below this effective opacity an element is "hidden" (may relocate freely). */
  hiddenOpacity: 0.05,
  /** Pop-in: opacity rises ≥ this in one interval… */
  popInOpacityDelta: 0.9,
  /** …on an element covering ≥ this fraction of the viewport… */
  popInMinAreaFraction: 0.1,
  /** …after this many seconds (instant entrances in the first beat are fine). */
  popInGraceSeconds: 0.3,
  /** Mechanical: coefficient of variation of speed below this = linear easing. */
  mechanicalSpeedCvMax: 0.15,
  /** Min moving intervals for the mechanical check to be meaningful. */
  mechanicalMinMovingIntervals: 6,
  /** Dead-air hard-gate threshold (fraction of pre-settle intervals). */
  deadAirGateFraction: 0.4,
  /** Unsettled hard gate: strictly more than this many elements moving in settle. */
  unsettledGateCount: 2,
  /** Offscreen: visible fraction of the element's rect below this flags it. */
  offscreenMaxVisibleFraction: 0.2,
  /** Overlap: intersection / min(areaA, areaB) above this flags a collision. */
  overlapMinFraction: 0.3,
} as const;

export type TeleportEvent = {
  selector: string;
  atSeconds: number;
  distancePx: number;
};

export type PopInEvent = {
  selector: string;
  atSeconds: number;
  areaFraction: number;
};

export type MotionMetrics = {
  sceneId: string;
  durationSeconds: number;
  sampleCount: number;
  elementCount: number;
  movingElementCount: number;
  /** Σ per-interval (displacement/diagonal + |Δopacity|·0.5) over all elements. */
  totalMotionEnergy: number;
  /** Fraction of pre-settle intervals where nothing moved or faded. */
  deadAirFraction: number;
  /** Longest consecutive dead stretch (pre-settle), null when none. */
  deadAirWindow: { fromSeconds: number; toSeconds: number } | null;
  /** Elements still moving/fading inside the settle window (final 10%). */
  unsettledSelectors: string[];
  teleports: TeleportEvent[];
  popIns: PopInEvent[];
  /** Elements whose motion has near-constant speed (linear easing). */
  mechanicalSelectors: string[];
  /** Visible elements mostly outside the viewport at the final sample. */
  offscreenSelectors: string[];
  /** Text-element pairs colliding at the final sample (soft signal only). */
  textOverlaps: Array<{ a: string; b: string }>;
};

type ElementSeries = {
  el: ElementMotionSamples;
  /** n-1 per-interval center+size displacements, px. */
  dists: number[];
  /** n-1 per-interval opacity deltas. */
  dOps: number[];
  /** n-1 — element moved or faded during this interval. */
  movingIv: boolean[];
};

export function computeMotionMetrics(s: SceneMotionSamples): MotionMetrics {
  const n = s.sampleTimesSeconds.length;
  if (n < 2) {
    throw new Error(`computeMotionMetrics(${s.sceneId}): need ≥2 samples, got ${n}`);
  }
  const diag = Math.hypot(s.viewport.w, s.viewport.h);
  if (diag === 0) {
    throw new Error(
      `computeMotionMetrics(${s.sceneId}): viewport diagonal is 0 — check sampler output`,
    );
  }

  const series: ElementSeries[] = s.elements.map((el) => {
    const dists: number[] = [];
    const dOps: number[] = [];
    for (let i = 1; i < n; i++) {
      const a = el.rects[i - 1];
      const b = el.rects[i];
      const dx = b.x + b.w / 2 - (a.x + a.w / 2);
      const dy = b.y + b.h / 2 - (a.y + a.h / 2);
      const sizeDelta = (Math.abs(b.w - a.w) + Math.abs(b.h - a.h)) / 2;
      dists.push(Math.hypot(dx, dy) + sizeDelta);
      dOps.push(el.opacities[i] - el.opacities[i - 1]);
    }
    const movingIv = dists.map(
      (d, i) =>
        d > TELEMETRY.stillEpsilonPx ||
        Math.abs(dOps[i]) > TELEMETRY.opacityEpsilon,
    );
    return { el, dists, dOps, movingIv };
  });

  const movingElementCount = series.filter((x) => x.movingIv.some(Boolean)).length;

  let totalMotionEnergy = 0;
  for (const x of series) {
    for (let i = 0; i < n - 1; i++) {
      totalMotionEnergy += x.dists[i] / diag + Math.abs(x.dOps[i]) * 0.5;
    }
  }

  const settleStartS = s.durationSeconds * (1 - TELEMETRY.settleFraction);

  // ── Dead air: pre-settle intervals where no element moves or fades ──
  const intervalMid = (i: number) =>
    (s.sampleTimesSeconds[i] + s.sampleTimesSeconds[i + 1]) / 2;
  const consideredIdx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (intervalMid(i) < settleStartS) consideredIdx.push(i);
  }
  const deadSet = new Set(
    consideredIdx.filter((i) => !series.some((x) => x.movingIv[i])),
  );
  const deadAirFraction =
    consideredIdx.length === 0 ? 0 : deadSet.size / consideredIdx.length;

  let deadAirWindow: { fromSeconds: number; toSeconds: number } | null = null;
  {
    let best: { from: number; to: number } | null = null;
    let cur: { from: number; to: number } | null = null;
    for (const i of consideredIdx) {
      if (deadSet.has(i)) {
        if (cur && i === cur.to + 1) cur.to = i;
        else cur = { from: i, to: i };
        if (!best || cur.to - cur.from > best.to - best.from) best = { ...cur };
      } else {
        cur = null;
      }
    }
    if (best) {
      deadAirWindow = {
        fromSeconds: Number(s.sampleTimesSeconds[best.from].toFixed(2)),
        toSeconds: Number(s.sampleTimesSeconds[best.to + 1].toFixed(2)),
      };
    }
  }

  // ── Unsettled ending: elements moving in intervals that end inside settle ──
  const unsettledSelectors = series
    .filter((x) => {
      for (let i = 0; i < n - 1; i++) {
        if (x.movingIv[i] && s.sampleTimesSeconds[i + 1] > settleStartS) return true;
      }
      return false;
    })
    .map((x) => x.el.selector);

  // ── Teleports: one-interval jumps with still neighbors ──
  const teleports: TeleportEvent[] = [];
  for (const x of series) {
    for (let i = 0; i < n - 1; i++) {
      if (x.dists[i] < TELEMETRY.teleportViewportFraction * diag) continue;
      // Hidden elements may relocate freely (staging for an entrance).
      if (
        x.el.opacities[i] < TELEMETRY.hiddenOpacity &&
        x.el.opacities[i + 1] < TELEMETRY.hiddenOpacity
      ) {
        continue;
      }
      const prevStill =
        i === 0 || x.dists[i - 1] < TELEMETRY.teleportNeighborMaxFraction * diag;
      const nextStill =
        i === n - 2 || x.dists[i + 1] < TELEMETRY.teleportNeighborMaxFraction * diag;
      if (prevStill && nextStill) {
        teleports.push({
          selector: x.el.selector,
          atSeconds: Number(s.sampleTimesSeconds[i + 1].toFixed(2)),
          distancePx: Math.round(x.dists[i]),
        });
      }
    }
  }

  // ── Pop-ins: large elements appearing within a single interval ──
  const viewportArea = s.viewport.w * s.viewport.h;
  const popIns: PopInEvent[] = [];
  for (const x of series) {
    for (let i = 0; i < n - 1; i++) {
      if (x.dOps[i] < TELEMETRY.popInOpacityDelta) continue;
      const t = s.sampleTimesSeconds[i + 1];
      if (t <= TELEMETRY.popInGraceSeconds) continue;
      const r = x.el.rects[i + 1];
      const areaFraction = (r.w * r.h) / viewportArea;
      if (areaFraction < TELEMETRY.popInMinAreaFraction) continue;
      popIns.push({
        selector: x.el.selector,
        atSeconds: Number(t.toFixed(2)),
        areaFraction: Number(areaFraction.toFixed(3)),
      });
    }
  }

  // ── Mechanical motion: near-constant speed across moving intervals ──
  // Samples are evenly spaced, so per-interval displacement is a speed proxy.
  // Tweens start/end mid-interval, so the first and last interval of each
  // contiguous moving run carry partial displacement — trim them before the
  // CV computation or linear motion with offset boundaries escapes detection.
  const mechanicalSelectors: string[] = [];
  for (const x of series) {
    const speeds: number[] = [];
    let runStart = -1;
    for (let i = 0; i <= x.dists.length; i++) {
      const moving = i < x.dists.length && x.dists[i] > TELEMETRY.stillEpsilonPx;
      if (moving && runStart === -1) runStart = i;
      if (!moving && runStart !== -1) {
        // Run is [runStart, i-1]; keep interior intervals only.
        for (let j = runStart + 1; j < i - 1; j++) speeds.push(x.dists[j]);
        runStart = -1;
      }
    }
    if (speeds.length < TELEMETRY.mechanicalMinMovingIntervals) continue;
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance =
      speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv < TELEMETRY.mechanicalSpeedCvMax) {
      mechanicalSelectors.push(x.el.selector);
    }
  }

  // ── Final-frame layout: offscreen + text collisions (soft signals) ──
  const last = n - 1;
  const visibleAtEnd = series.filter(
    (x) =>
      x.el.opacities[last] > 0.5 &&
      x.el.rects[last].w > 0 &&
      x.el.rects[last].h > 0,
  );

  const offscreenSelectors: string[] = [];
  for (const x of visibleAtEnd) {
    const r = x.el.rects[last];
    const ix = Math.max(0, Math.min(r.x + r.w, s.viewport.w) - Math.max(r.x, 0));
    const iy = Math.max(0, Math.min(r.y + r.h, s.viewport.h) - Math.max(r.y, 0));
    const visibleFraction = (ix * iy) / (r.w * r.h);
    if (visibleFraction < TELEMETRY.offscreenMaxVisibleFraction) {
      offscreenSelectors.push(x.el.selector);
    }
  }

  const textOverlaps: Array<{ a: string; b: string }> = [];
  const textAtEnd = visibleAtEnd.filter((x) => x.el.kind === "text");
  for (let i = 0; i < textAtEnd.length; i++) {
    for (let j = i + 1; j < textAtEnd.length; j++) {
      const a = textAtEnd[i].el.rects[last];
      const b = textAtEnd[j].el.rects[last];
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const minArea = Math.min(a.w * a.h, b.w * b.h);
      if (minArea > 0 && (ix * iy) / minArea > TELEMETRY.overlapMinFraction) {
        textOverlaps.push({
          a: textAtEnd[i].el.selector,
          b: textAtEnd[j].el.selector,
        });
      }
    }
  }

  return {
    sceneId: s.sceneId,
    durationSeconds: s.durationSeconds,
    sampleCount: n,
    elementCount: s.elements.length,
    movingElementCount,
    totalMotionEnergy: Number(totalMotionEnergy.toFixed(2)),
    deadAirFraction: Number(deadAirFraction.toFixed(3)),
    deadAirWindow,
    unsettledSelectors,
    teleports,
    popIns,
    mechanicalSelectors,
    offscreenSelectors,
    textOverlaps,
  };
}

export type TelemetryGate =
  | "teleport"
  | "pop_in"
  | "unsettled_ending"
  | "dead_air"
  | "fully_static";

export type TelemetryIssue = { gate: TelemetryGate; description: string };

/**
 * Hard gates — unambiguous, deterministically measured failures. Each issue
 * is written to be fed VERBATIM into a scene-refinement call (same contract
 * as vision-critique issues). Soft signals (mechanical motion, overlaps,
 * low energy) intentionally do NOT gate — they go into the telemetry block
 * for the LLM critic to weigh. Taste stays with the critic.
 */
export function telemetryGates(m: MotionMetrics): TelemetryIssue[] {
  const issues: TelemetryIssue[] = [];

  {
    const shown = m.teleports.slice(0, 3);
    shown.forEach((t, idx) => {
      const isLast = idx === shown.length - 1;
      const suffix =
        isLast && m.teleports.length > shown.length
          ? ` (showing 3 of ${m.teleports.length})`
          : "";
      issues.push({
        gate: "teleport",
        description: `element ${t.selector} teleports ${t.distancePx}px at ~${t.atSeconds.toFixed(1)}s — tween the move or remove the jump${suffix}`,
      });
    });
  }

  {
    const shown = m.popIns.slice(0, 3);
    shown.forEach((p, idx) => {
      const isLast = idx === shown.length - 1;
      const suffix =
        isLast && m.popIns.length > shown.length
          ? ` (showing 3 of ${m.popIns.length})`
          : "";
      issues.push({
        gate: "pop_in",
        description: `element ${p.selector} (≈${Math.round(p.areaFraction * 100)}% of frame) pops in at ~${p.atSeconds.toFixed(1)}s with no transition — fade or scale it in over ≥250ms${suffix}`,
      });
    });
  }

  if (m.unsettledSelectors.length > TELEMETRY.unsettledGateCount) {
    issues.push({
      gate: "unsettled_ending",
      description: `scene ends mid-motion (${m.unsettledSelectors.slice(0, 4).join(", ")} still moving in the final 10%) — pull animations forward so the final frame settles`,
    });
  }

  if (m.deadAirFraction > TELEMETRY.deadAirGateFraction && m.deadAirWindow) {
    issues.push({
      gate: "dead_air",
      description: `scene is motionless for ${Math.round(m.deadAirFraction * 100)}% of its runtime (longest still stretch ${m.deadAirWindow.fromSeconds.toFixed(1)}s–${m.deadAirWindow.toSeconds.toFixed(1)}s) — add secondary/ambient motion or tighten the beat`,
    });
  }

  if (m.movingElementCount === 0 && m.elementCount > 0) {
    issues.push({
      gate: "fully_static",
      description: `nothing animates in this scene — all ${m.elementCount} tracked elements are static for its full duration`,
    });
  }

  return issues;
}

/**
 * Render metrics as a compact text block for the vision-critique user prompt.
 * ~300–600 tokens. The critique system prompt explains how to read it.
 */
export function renderTelemetryBlock(m: MotionMetrics): string {
  const lines: string[] = [];
  lines.push(
    "MEASURED MOTION TELEMETRY (deterministic — element rects/opacities sampled from the rendered scene at ~4 Hz; trust these numbers over your visual read for timing/jank):",
  );
  lines.push(
    `  elements tracked: ${m.elementCount} (${m.elementCount - m.movingElementCount} never move)`,
  );
  lines.push(`  motion energy: ${m.totalMotionEnergy.toFixed(1)} (≈0 = static scene)`);
  if (m.deadAirFraction > 0) {
    const stretch = m.deadAirWindow
      ? `; longest still stretch ${m.deadAirWindow.fromSeconds.toFixed(1)}s–${m.deadAirWindow.toSeconds.toFixed(1)}s`
      : "";
    lines.push(
      `  dead air: ${Math.round(m.deadAirFraction * 100)}% of pre-settle intervals motionless${stretch}`,
    );
  } else {
    lines.push("  dead air: none — something is always moving");
  }
  lines.push(
    m.unsettledSelectors.length > 0
      ? `  settle: ${m.unsettledSelectors.length} element(s) still moving in the final 10% (${m.unsettledSelectors.slice(0, 4).join(", ")})`
      : "  settle: clean — nothing moving in the final 10%",
  );
  lines.push(
    m.teleports.length > 0
      ? `  teleports (position jumps with no tween): ${m.teleports
          .slice(0, 3)
          .map((t) => `${t.selector} ${t.distancePx}px at ~${t.atSeconds.toFixed(1)}s`)
          .join("; ")}`
      : "  teleports: none",
  );
  lines.push(
    m.popIns.length > 0
      ? `  pop-ins (instant appearance, no transition): ${m.popIns
          .slice(0, 3)
          .map((p) => `${p.selector} at ~${p.atSeconds.toFixed(1)}s`)
          .join("; ")}`
      : "  pop-ins: none",
  );
  lines.push(
    m.mechanicalSelectors.length > 0
      ? `  mechanical motion (near-constant speed = linear easing): ${m.mechanicalSelectors.slice(0, 4).join(", ")} — needs real easing`
      : "  mechanical motion: none — speeds vary naturally",
  );
  if (m.offscreenSelectors.length > 0) {
    lines.push(`  offscreen at final frame: ${m.offscreenSelectors.join(", ")}`);
  }
  if (m.textOverlaps.length > 0) {
    lines.push(
      `  text overlaps at final frame: ${m.textOverlaps
        .slice(0, 3)
        .map((o) => `${o.a} × ${o.b}`)
        .join("; ")}`,
    );
  }
  return lines.join("\n");
}
