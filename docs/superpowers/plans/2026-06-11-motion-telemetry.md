# Motion Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure real rendered motion (jank, pop-ins, dead air, linear easing, unsettled endings) per scene and feed it into the existing critique→refine loop at zero additional LLM-call cost.

**Architecture:** A pure-function module (`motion-telemetry.ts`) computes `MotionMetrics` from element rect/opacity samples; a Playwright sampler in `thumbnail.ts` collects those samples by seeking the master timeline (same machinery as the motion-trail composite); `jobs.ts:captureScenes` persists metrics to a new `shots.motion_telemetry` JSONB column; `critiqueAndPolishJob` injects a rendered telemetry text block into the existing `generateVisionCritique` call and merges hard-gate issues into `buildRefinementSet`.

**Tech Stack:** TypeScript, Playwright (already a dep), vitest, Supabase (Postgres JSONB), existing HyperFrames pipeline.

**Spec:** `docs/superpowers/specs/2026-06-11-motion-telemetry-design.md`

**Branch policy:** Commit directly to `main` (user preference — no feature branches).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/lib/hyperframes/motion-telemetry.ts` | Create | Types, thresholds, `computeMotionMetrics`, `telemetryGates`, `renderTelemetryBlock` — all pure |
| `app/lib/hyperframes/motion-telemetry.test.ts` | Create | Unit tests with synthetic motion profiles |
| `app/lib/hyperframes/thumbnail.ts` | Modify | Add `captureSceneMotionTelemetry` + in-page sampler (reuses `getBrowser`, seek machinery) |
| `app/lib/hyperframes/llm-director.ts` | Modify | `generateVisionCritique` optional telemetry block; `VISION_CRITIQUE_SYSTEM_PROMPT` telemetry section; `buildRefinementSet` third param |
| `app/lib/hyperframes/refinement-set.test.ts` | Create | Unit tests for `buildRefinementSet` telemetry merge |
| `app/lib/jobs.ts` | Modify | `captureScenes` telemetry step; `critiqueAndPolishJob` wiring |
| `app/lib/supabase.ts` | Modify | `ShotRow.motion_telemetry` |
| `supabase/migrations/20260611_motion_telemetry.sql` | Create | `alter table shots add column motion_telemetry jsonb` |
| `scripts/smoke-motion-telemetry.ts` | Create | End-to-end Playwright smoke (real GSAP timeline → real metrics) |

Verification commands used throughout: `npm test` (vitest), `npx tsc --noEmit` (type check), `npx tsx scripts/smoke-motion-telemetry.ts` (browser smoke).

---

### Task 1: Types, thresholds, and basic metrics (movement census + energy)

**Files:**
- Create: `app/lib/hyperframes/motion-telemetry.ts`
- Create: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/hyperframes/motion-telemetry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeMotionMetrics,
  type SceneMotionSamples,
} from "./motion-telemetry";

/**
 * Synthetic sample builder. Each element is a trajectory function of
 * scene-local time t → rect + opacity. Defaults: 16 samples over 4s,
 * 1920×1080 viewport.
 */
export function makeSamples(opts: {
  duration?: number;
  n?: number;
  elements: Array<{
    selector: string;
    kind?: "text" | "media";
    at: (t: number) => {
      x: number;
      y: number;
      w?: number;
      h?: number;
      opacity?: number;
    };
  }>;
}): SceneMotionSamples {
  const duration = opts.duration ?? 4;
  const n = opts.n ?? 16;
  const times = Array.from({ length: n }, (_, i) => (i / (n - 1)) * duration);
  return {
    sceneId: "s1",
    sampleTimesSeconds: times,
    durationSeconds: duration,
    viewport: { w: 1920, h: 1080 },
    elements: opts.elements.map((e) => ({
      selector: e.selector,
      kind: e.kind ?? "text",
      rects: times.map((t) => {
        const p = e.at(t);
        return { x: p.x, y: p.y, w: p.w ?? 300, h: p.h ?? 80 };
      }),
      opacities: times.map((t) => e.at(t).opacity ?? 1),
    })),
  };
}

describe("computeMotionMetrics — movement census", () => {
  it("counts moving vs static elements and sums motion energy", () => {
    const samples = makeSamples({
      elements: [
        // Moves 400px over the scene (eased-ish doesn't matter here).
        { selector: "h1#hero@0", at: (t) => ({ x: 100 + t * 100, y: 200 }) },
        // Never moves.
        { selector: "p#sub@1", at: () => ({ x: 100, y: 400 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.elementCount).toBe(2);
    expect(m.movingElementCount).toBe(1);
    expect(m.totalMotionEnergy).toBeGreaterThan(0.1);
    expect(m.sceneId).toBe("s1");
    expect(m.sampleCount).toBe(16);
  });

  it("reports a fully static scene as zero moving elements and ~zero energy", () => {
    const samples = makeSamples({
      elements: [
        { selector: "h1#a@0", at: () => ({ x: 100, y: 200 }) },
        { selector: "p#b@1", at: () => ({ x: 100, y: 400 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.movingElementCount).toBe(0);
    expect(m.totalMotionEnergy).toBeLessThan(0.01);
  });

  it("counts an opacity-only fade as movement", () => {
    const samples = makeSamples({
      elements: [
        {
          selector: "h1#fade@0",
          at: (t) => ({ x: 100, y: 200, opacity: Math.min(1, t / 2) }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.movingElementCount).toBe(1);
  });

  it("throws on fewer than 2 samples", () => {
    const samples = makeSamples({ n: 1, elements: [] });
    expect(() => computeMotionMetrics(samples)).toThrow(/need/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: FAIL — `Cannot find module './motion-telemetry'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `app/lib/hyperframes/motion-telemetry.ts`:

```ts
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

  return {
    sceneId: s.sceneId,
    durationSeconds: s.durationSeconds,
    sampleCount: n,
    elementCount: s.elements.length,
    movingElementCount,
    totalMotionEnergy: Number(totalMotionEnergy.toFixed(2)),
    // Filled in by later tasks:
    deadAirFraction: 0,
    deadAirWindow: null,
    unsettledSelectors: [],
    teleports: [],
    popIns: [],
    mechanicalSelectors: [],
    offscreenSelectors: [],
    textOverlaps: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): motion telemetry types + movement census metrics"
```

---

### Task 2: Dead air + unsettled-ending detection

**Files:**
- Modify: `app/lib/hyperframes/motion-telemetry.ts`
- Modify: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/hyperframes/motion-telemetry.test.ts`:

```ts
describe("computeMotionMetrics — dead air", () => {
  it("flags a scene where motion stops early", () => {
    // Element moves only during the first 20% of a 4s scene; still after.
    const samples = makeSamples({
      elements: [
        {
          selector: "h1#early@0",
          at: (t) => ({ x: t < 0.8 ? 100 + t * 500 : 500, y: 200 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    // ~0.8s..3.6s (settle excluded) of a 4s scene is dead → well over 0.4.
    expect(m.deadAirFraction).toBeGreaterThan(0.4);
    expect(m.deadAirWindow).not.toBeNull();
    expect(m.deadAirWindow!.fromSeconds).toBeGreaterThan(0.5);
    expect(m.deadAirWindow!.toSeconds).toBeGreaterThan(3);
  });

  it("does not count the settle window (final 10%) as dead air", () => {
    // Constant motion until exactly the settle boundary (3.6s of 4s).
    const samples = makeSamples({
      elements: [
        {
          selector: "h1#busy@0",
          at: (t) => ({ x: t < 3.6 ? 100 + t * 200 : 100 + 3.6 * 200, y: 200 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.deadAirFraction).toBeLessThan(0.15);
  });
});

describe("computeMotionMetrics — unsettled ending", () => {
  it("lists elements still moving in the final 10%", () => {
    const samples = makeSamples({
      elements: [
        // Moves the entire scene including the settle window.
        { selector: "h1#restless@0", at: (t) => ({ x: 100 + t * 300, y: 200 }) },
        // Settles at 3s.
        {
          selector: "p#calm@1",
          at: (t) => ({ x: Math.min(3, t) * 100, y: 400 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.unsettledSelectors).toEqual(["h1#restless@0"]);
  });

  it("reports a clean settle when everything stops before the final 10%", () => {
    const samples = makeSamples({
      elements: [
        { selector: "h1#calm@0", at: (t) => ({ x: Math.min(3, t) * 100, y: 200 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.unsettledSelectors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: the 4 new tests FAIL (deadAirFraction stays 0, unsettledSelectors stays []); Task 1 tests still pass.

- [ ] **Step 3: Implement**

In `computeMotionMetrics`, after the `movingElementCount`/energy block and before the `return`, add:

```ts
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
```

Then update the `return` to use the real values:

```ts
    deadAirFraction: Number(deadAirFraction.toFixed(3)),
    deadAirWindow,
    unsettledSelectors,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): dead-air + unsettled-ending telemetry metrics"
```

---

### Task 3: Teleport + pop-in detection

**Files:**
- Modify: `app/lib/hyperframes/motion-telemetry.ts`
- Modify: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
describe("computeMotionMetrics — teleports", () => {
  it("detects a position jump with still neighbors", () => {
    // Static at x=100 until 2.0s, then instantly at x=900 (800px jump,
    // > 15% of the 2203px viewport diagonal), static after.
    const samples = makeSamples({
      elements: [
        { selector: "div#jumper@0", at: (t) => ({ x: t < 2 ? 100 : 900, y: 300 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.teleports).toHaveLength(1);
    expect(m.teleports[0].selector).toBe("div#jumper@0");
    expect(m.teleports[0].distancePx).toBeGreaterThan(700);
    expect(m.teleports[0].atSeconds).toBeGreaterThan(1.8);
    expect(m.teleports[0].atSeconds).toBeLessThan(2.4);
  });

  it("does not flag smooth fast motion as a teleport", () => {
    // 800px over the whole scene — every interval moves, neighbors not still.
    const samples = makeSamples({
      elements: [
        { selector: "div#smooth@0", at: (t) => ({ x: 100 + t * 200, y: 300 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.teleports).toHaveLength(0);
  });

  it("ignores jumps while the element is hidden", () => {
    const samples = makeSamples({
      elements: [
        {
          selector: "div#offstage@0",
          at: (t) => ({ x: t < 2 ? 100 : 900, y: 300, opacity: 0 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.teleports).toHaveLength(0);
  });
});

describe("computeMotionMetrics — pop-ins", () => {
  it("detects a large element appearing instantly mid-scene", () => {
    const samples = makeSamples({
      elements: [
        {
          selector: "h2#pop@0",
          // 1000×300 = 14.5% of the viewport; opacity snaps 0→1 at 2s.
          at: (t) => ({ x: 400, y: 400, w: 1000, h: 300, opacity: t < 2 ? 0 : 1 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.popIns).toHaveLength(1);
    expect(m.popIns[0].selector).toBe("h2#pop@0");
    expect(m.popIns[0].atSeconds).toBeGreaterThan(1.8);
  });

  it("allows instant appearance within the first 300ms grace window", () => {
    const samples = makeSamples({
      elements: [
        {
          selector: "h2#opener@0",
          at: (t) => ({ x: 400, y: 400, w: 1000, h: 300, opacity: t < 0.2 ? 0 : 1 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.popIns).toHaveLength(0);
  });

  it("ignores small elements popping in", () => {
    const samples = makeSamples({
      elements: [
        {
          selector: "span#chip@0",
          // 200×50 ≈ 0.5% of viewport — too small to gate.
          at: (t) => ({ x: 400, y: 400, w: 200, h: 50, opacity: t < 2 ? 0 : 1 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.popIns).toHaveLength(0);
  });

  it("does not flag a gradual fade as a pop-in", () => {
    const samples = makeSamples({
      elements: [
        {
          selector: "h2#fader@0",
          at: (t) => ({
            x: 400, y: 400, w: 1000, h: 300,
            opacity: Math.max(0, Math.min(1, (t - 1) / 1.5)),
          }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.popIns).toHaveLength(0);
  });
});
```

Note: with 16 samples over 4s, one interval ≈ 0.267s, so a 0→1 flip lands entirely inside one interval (delta 1.0 > 0.9 threshold), while the 1.5s fade spreads over ~5 intervals (max delta ≈ 0.18).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: new tests FAIL (arrays stay empty).

- [ ] **Step 3: Implement**

In `computeMotionMetrics`, after the unsettled block, add:

```ts
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
```

Update the `return` to use `teleports` and `popIns`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): teleport + pop-in telemetry detection"
```

---

### Task 4: Mechanical (linear-easing) motion detection

**Files:**
- Modify: `app/lib/hyperframes/motion-telemetry.ts`
- Modify: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
describe("computeMotionMetrics — mechanical motion", () => {
  it("flags constant-speed (linear) motion", () => {
    const samples = makeSamples({
      elements: [
        { selector: "h1#linear@0", at: (t) => ({ x: 100 + t * 200, y: 200 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.mechanicalSelectors).toEqual(["h1#linear@0"]);
  });

  it("does not flag eased (power3.out-like) motion", () => {
    // progress = 1 - (1-p)^3 over the first 3s — speed varies 3x..0x.
    const samples = makeSamples({
      elements: [
        {
          selector: "h1#eased@0",
          at: (t) => {
            const p = Math.min(1, t / 3);
            const progress = 1 - Math.pow(1 - p, 3);
            return { x: 100 + progress * 600, y: 200 };
          },
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.mechanicalSelectors).toEqual([]);
  });

  it("ignores short movements (fewer than 6 moving intervals)", () => {
    // Moves linearly but only for ~3 intervals.
    const samples = makeSamples({
      elements: [
        {
          selector: "h1#blip@0",
          at: (t) => ({ x: t < 0.8 ? 100 + t * 400 : 420, y: 200 }),
        },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.mechanicalSelectors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: first new test FAILS (`mechanicalSelectors` stays `[]`); the other two pass vacuously — that's fine, they pin the negative behavior.

- [ ] **Step 3: Implement**

In `computeMotionMetrics`, after the pop-in block, add:

```ts
  // ── Mechanical motion: near-constant speed across moving intervals ──
  // Samples are evenly spaced, so per-interval displacement is a speed proxy.
  const mechanicalSelectors: string[] = [];
  for (const x of series) {
    const speeds = x.dists.filter((d) => d > TELEMETRY.stillEpsilonPx);
    if (speeds.length < TELEMETRY.mechanicalMinMovingIntervals) continue;
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const variance =
      speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length;
    const cv = Math.sqrt(variance) / mean;
    if (cv < TELEMETRY.mechanicalSpeedCvMax) {
      mechanicalSelectors.push(x.el.selector);
    }
  }
```

Update the `return` to use `mechanicalSelectors`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): mechanical-motion (linear easing) telemetry detection"
```

---

### Task 5: Offscreen + text-overlap detection (final frame)

**Files:**
- Modify: `app/lib/hyperframes/motion-telemetry.ts`
- Modify: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
describe("computeMotionMetrics — final-frame layout", () => {
  it("flags a visible element that ends mostly offscreen", () => {
    const samples = makeSamples({
      elements: [
        // Ends at x=1900 with w=300 → only 20px of 300 visible (≈6%).
        { selector: "h1#gone@0", at: (t) => ({ x: 100 + t * 450, y: 200 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.offscreenSelectors).toEqual(["h1#gone@0"]);
  });

  it("flags two text elements colliding at the final frame", () => {
    const samples = makeSamples({
      elements: [
        { selector: "h1#a@0", at: () => ({ x: 100, y: 200 }) },
        { selector: "h2#b@1", at: () => ({ x: 150, y: 230 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.textOverlaps).toEqual([{ a: "h1#a@0", b: "h2#b@1" }]);
  });

  it("ignores overlaps involving hidden or media elements", () => {
    const samples = makeSamples({
      elements: [
        { selector: "h1#a@0", at: () => ({ x: 100, y: 200 }) },
        { selector: "h2#hidden@1", at: () => ({ x: 150, y: 230, opacity: 0 }) },
        { selector: "img#bg@2", kind: "media", at: () => ({ x: 100, y: 200, w: 1920, h: 1080 }) },
      ],
    });
    const m = computeMotionMetrics(samples);
    expect(m.textOverlaps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: first two new tests FAIL.

- [ ] **Step 3: Implement**

In `computeMotionMetrics`, after the mechanical block, add:

```ts
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
```

Update the `return` to use `offscreenSelectors` and `textOverlaps`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): offscreen + text-overlap final-frame telemetry"
```

---

### Task 6: `telemetryGates` — hard-gate issue synthesis

**Files:**
- Modify: `app/lib/hyperframes/motion-telemetry.ts`
- Modify: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file (add `telemetryGates` to the import from `./motion-telemetry`):

```ts
import {
  computeMotionMetrics,
  telemetryGates,
  type SceneMotionSamples,
} from "./motion-telemetry";
```

```ts
describe("telemetryGates", () => {
  it("fires teleport, pop_in, dead_air, and fully_static gates", () => {
    const teleportScene = computeMotionMetrics(
      makeSamples({
        elements: [
          { selector: "div#jumper@0", at: (t) => ({ x: t < 2 ? 100 : 900, y: 300 }) },
        ],
      }),
    );
    const gates = telemetryGates(teleportScene);
    const kinds = gates.map((g) => g.gate);
    expect(kinds).toContain("teleport");
    // One brief jump in a 4s scene also leaves it mostly motionless.
    expect(kinds).toContain("dead_air");
    expect(gates.find((g) => g.gate === "teleport")!.description).toMatch(
      /div#jumper@0.*teleports/,
    );

    const staticScene = computeMotionMetrics(
      makeSamples({
        elements: [{ selector: "h1#a@0", at: () => ({ x: 100, y: 200 }) }],
      }),
    );
    const staticKinds = telemetryGates(staticScene).map((g) => g.gate);
    expect(staticKinds).toContain("fully_static");
  });

  it("fires unsettled_ending only above the count threshold", () => {
    const restless = (sel: string) => ({
      selector: sel,
      at: (t: number) => ({ x: 100 + t * 300, y: 200 }),
    });
    const threeRestless = computeMotionMetrics(
      makeSamples({ elements: [restless("a@0"), restless("b@1"), restless("c@2")] }),
    );
    expect(telemetryGates(threeRestless).map((g) => g.gate)).toContain(
      "unsettled_ending",
    );

    const twoRestless = computeMotionMetrics(
      makeSamples({ elements: [restless("a@0"), restless("b@1")] }),
    );
    expect(telemetryGates(twoRestless).map((g) => g.gate)).not.toContain(
      "unsettled_ending",
    );
  });

  it("returns no gates for a healthy scene", () => {
    const healthy = computeMotionMetrics(
      makeSamples({
        elements: [
          {
            selector: "h1#hero@0",
            at: (t) => {
              const p = Math.min(1, t / 3);
              const progress = 1 - Math.pow(1 - p, 3);
              return { x: 100 + progress * 600, y: 200 };
            },
          },
        ],
      }),
    );
    expect(telemetryGates(healthy)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: FAIL — `telemetryGates` is not exported.

- [ ] **Step 3: Implement**

Append to `motion-telemetry.ts`:

```ts
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

  for (const t of m.teleports.slice(0, 3)) {
    issues.push({
      gate: "teleport",
      description: `element ${t.selector} teleports ${t.distancePx}px at ~${t.atSeconds.toFixed(1)}s — tween the move or remove the jump`,
    });
  }

  for (const p of m.popIns.slice(0, 3)) {
    issues.push({
      gate: "pop_in",
      description: `element ${p.selector} (≈${Math.round(p.areaFraction * 100)}% of frame) pops in at ~${p.atSeconds.toFixed(1)}s with no transition — fade or scale it in over ≥250ms`,
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (24 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): telemetry hard gates synthesize refinement issues"
```

---

### Task 7: `renderTelemetryBlock` — critique prompt text

**Files:**
- Modify: `app/lib/hyperframes/motion-telemetry.ts`
- Modify: `app/lib/hyperframes/motion-telemetry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append (add `renderTelemetryBlock` to the import):

```ts
describe("renderTelemetryBlock", () => {
  it("renders all signal lines for a problematic scene", () => {
    const m = computeMotionMetrics(
      makeSamples({
        elements: [
          { selector: "div#jumper@0", at: (t) => ({ x: t < 2 ? 100 : 900, y: 300 }) },
          { selector: "h1#linear@1", at: (t) => ({ x: 100 + t * 200, y: 500 }) },
        ],
      }),
    );
    const block = renderTelemetryBlock(m);
    expect(block).toContain("MEASURED MOTION TELEMETRY");
    expect(block).toContain("elements tracked: 2");
    expect(block).toContain("teleports");
    expect(block).toContain("div#jumper@0");
    expect(block).toContain("mechanical motion");
    expect(block).toContain("h1#linear@1");
  });

  it("renders clean lines for a healthy scene", () => {
    const m = computeMotionMetrics(
      makeSamples({
        elements: [
          {
            selector: "h1#hero@0",
            at: (t) => {
              const p = Math.min(1, t / 3);
              return { x: 100 + (1 - Math.pow(1 - p, 3)) * 600, y: 200 };
            },
          },
        ],
      }),
    );
    const block = renderTelemetryBlock(m);
    expect(block).toContain("teleports: none");
    expect(block).toContain("pop-ins: none");
    expect(block).toContain("settle: clean");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: FAIL — `renderTelemetryBlock` not exported.

- [ ] **Step 3: Implement**

Append to `motion-telemetry.ts`:

```ts
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
  lines.push(
    m.deadAirWindow
      ? `  dead air: ${Math.round(m.deadAirFraction * 100)}% of pre-settle intervals motionless; longest still stretch ${m.deadAirWindow.fromSeconds.toFixed(1)}s–${m.deadAirWindow.toSeconds.toFixed(1)}s`
      : "  dead air: none — something is always moving",
  );
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/motion-telemetry.test.ts`
Expected: PASS (26 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/motion-telemetry.ts app/lib/hyperframes/motion-telemetry.test.ts
git commit -m "feat(hyperframes): renderTelemetryBlock for vision-critique prompt"
```

---

### Task 8: Playwright sampler + smoke script

**Files:**
- Modify: `app/lib/hyperframes/thumbnail.ts`
- Create: `scripts/smoke-motion-telemetry.ts`

No vitest here — browser capture follows the repo's smoke-script pattern (`scripts/smoke-multi-engine.ts`). Pure-metric correctness is already unit-tested; this task proves the *sampler* against a real rendered GSAP timeline.

- [ ] **Step 1: Add the capture function to `thumbnail.ts`**

Add imports at the top of `thumbnail.ts`:

```ts
import {
  TELEMETRY,
  type ElementKind,
  type ElementMotionSamples,
  type SceneMotionSamples,
} from "./motion-telemetry";
```

Append at the end of the file (before `shutdownThumbnailBrowser`):

```ts
// ─── Motion telemetry sampling ───────────────────────────────────────────

export type CaptureSceneTelemetryArgs = {
  html: string;
  /** Matches the scene <section id> in the film skeleton. */
  sceneId: string;
  /** Master-timeline start of the scene, seconds. */
  sceneStartSeconds: number;
  sceneDurationSeconds: number;
  /** Total master timeline length, seconds (for seek clamping). */
  totalDurationSeconds: number;
};

// Layout reads don't need the screenshot compositor flush (80ms) — style
// application after seek is synchronous; a small wait covers WAAPI/rAF lag.
const TELEMETRY_SEEK_FLUSH_MS = 30;

type RawElementSample = {
  selector: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
};

// Runs IN THE PAGE via page.evaluate — must stay fully self-contained
// (Playwright serializes the function source; no module closures allowed).
// First call tags up to maxElements visual leaves (direct-text elements +
// media) with data-hf-telemetry so the same element set is sampled at every
// timepoint regardless of visibility changes.
function sampleSceneElementsInPage(arg: {
  sceneId: string;
  maxElements: number;
}): Array<{
  selector: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
}> {
  const root: Element =
    document.getElementById(arg.sceneId) ??
    document.querySelector(`[data-composition-id="${arg.sceneId}"]`) ??
    document.body;

  let tagged = Array.from(root.querySelectorAll("[data-hf-telemetry]")) as HTMLElement[];
  if (tagged.length === 0) {
    const all = Array.from(root.querySelectorAll("*")) as HTMLElement[];
    const isMedia = (el: Element) =>
      ["IMG", "SVG", "CANVAS", "VIDEO"].includes(el.tagName.toUpperCase());
    const hasDirectText = (el: Element) =>
      Array.from(el.childNodes).some(
        (nd) => nd.nodeType === 3 && (nd.textContent ?? "").trim().length > 0,
      );
    const candidates = all.filter(
      (el) =>
        !["SCRIPT", "STYLE"].includes(el.tagName.toUpperCase()) &&
        (isMedia(el) || hasDirectText(el)),
    );
    candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    let chosen = candidates.slice(0, arg.maxElements);
    // Drop descendants of other chosen elements — a parent with direct text
    // and its inline child would double-count and fake overlap pairs.
    chosen = chosen.filter(
      (el) => !chosen.some((other) => other !== el && other.contains(el)),
    );
    chosen.forEach((el, i) => {
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? "." + el.className.trim().split(/\s+/)[0]
          : "";
      const id = el.id ? `#${el.id}` : "";
      el.setAttribute(
        "data-hf-telemetry",
        `${el.tagName.toLowerCase()}${id}${cls}@${i}`,
      );
      el.setAttribute("data-hf-kind", isMedia(el) ? "media" : "text");
    });
    tagged = chosen;
  }

  return tagged.map((el) => {
    const r = el.getBoundingClientRect();
    // Effective opacity: multiply ancestors up to (and including) the scene
    // root — LLM code often fades a group wrapper, not each element.
    let eff = 1;
    let node: Element | null = el;
    while (node && node !== root.parentElement) {
      const cs = getComputedStyle(node);
      eff *= parseFloat(cs.opacity || "1");
      if (cs.visibility === "hidden" || cs.display === "none") eff = 0;
      node = node.parentElement;
    }
    return {
      selector: el.getAttribute("data-hf-telemetry") || "?",
      kind: el.getAttribute("data-hf-kind") || "text",
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      opacity: eff,
    };
  });
}

/**
 * Sample one scene's rendered motion: seek the master timeline to N evenly
 * spaced timepoints across the scene window and read element rects/opacities
 * at each. Same seek machinery as captureMotionTrailComposite; own context.
 * Throws on page-load failure — callers treat telemetry as non-fatal.
 */
export async function captureSceneMotionTelemetry(
  args: CaptureSceneTelemetryArgs,
): Promise<SceneMotionSamples> {
  const d = args.sceneDurationSeconds;
  const sampleCount = Math.max(
    TELEMETRY.minSamples,
    Math.min(TELEMETRY.maxSamples, Math.round(d * TELEMETRY.samplesPerSecond)),
  );
  const localTimes = Array.from(
    { length: sampleCount },
    (_, i) => (i / (sampleCount - 1)) * Math.max(0.1, d - 0.05),
  );

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 1,
  });
  const page: Page = await context.newPage();

  try {
    await page.setContent(args.html, { waitUntil: "load" });
    await page
      .waitForFunction(
        () => {
          const tls = (window as unknown as { __timelines?: Record<string, unknown> })
            .__timelines;
          return !!(tls && Object.keys(tls).length > 0);
        },
        { timeout: TIMELINE_WAIT_MS },
      )
      .catch(() => {
        // No timeline — sample whatever static state the page settled into.
      });

    const perSample: RawElementSample[][] = [];
    for (const local of localTimes) {
      const seekTime = Math.max(
        0,
        Math.min(args.totalDurationSeconds - 0.1, args.sceneStartSeconds + local),
      );
      await page
        .evaluate((t: number) => {
          const tls = (window as unknown as {
            __timelines?: Record<string, { pause: () => void; seek: (s: number) => void }>;
          }).__timelines;
          if (!tls) return;
          const tl = tls[Object.keys(tls)[0]];
          if (!tl) return;
          tl.pause();
          tl.seek(t);
        }, seekTime)
        .catch(() => {});
      await page.waitForTimeout(TELEMETRY_SEEK_FLUSH_MS);
      perSample.push(
        await page.evaluate(sampleSceneElementsInPage, {
          sceneId: args.sceneId,
          maxElements: TELEMETRY.maxElements,
        }),
      );
    }

    // Assemble per-element series keyed by the minted selector. Tagging is
    // sticky, so misses should not happen; zero-rect fallback keeps series
    // aligned if they somehow do.
    const keys = perSample[0].map((raw) => raw.selector);
    const elements: ElementMotionSamples[] = keys.map((key) => {
      const rects = perSample.map((arr) => {
        const hit = arr.find((raw) => raw.selector === key);
        return hit
          ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h }
          : { x: 0, y: 0, w: 0, h: 0 };
      });
      const opacities = perSample.map(
        (arr) => arr.find((raw) => raw.selector === key)?.opacity ?? 0,
      );
      const kind: ElementKind =
        perSample[0].find((raw) => raw.selector === key)?.kind === "media"
          ? "media"
          : "text";
      return { selector: key, kind, rects, opacities };
    });

    return {
      sceneId: args.sceneId,
      sampleTimesSeconds: localTimes.map((t) => Number(t.toFixed(3))),
      durationSeconds: d,
      viewport: { w: VIEWPORT_W, h: VIEWPORT_H },
      elements,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no new errors — pre-existing errors, if any, are unchanged).

- [ ] **Step 3: Write the smoke script**

Create `scripts/smoke-motion-telemetry.ts`:

```ts
// End-to-end smoke for motion telemetry: real Chromium + real GSAP timeline.
//
// What it proves:
//   captureSceneMotionTelemetry actually drives window.__timelines seeks and
//   reads rendered rects/opacities, and computeMotionMetrics + telemetryGates
//   detect (a) linear/mechanical motion and (b) a pop-in from a live page —
//   not just from synthetic unit-test samples.
//
// The fixture timeline:
//   • #title tweens x 0→800 over 3s with ease:"none"  → mechanical expected
//   • #pop (1000×300 ≈ 14.5% of frame) opacity .set() at 2.0s → pop_in gate
//   • motion ends at 3.2s of a 4s scene                → clean settle
//
// Run: npx tsx scripts/smoke-motion-telemetry.ts
// Needs network (GSAP CDN) + headless Chromium, like the other smokes.
// Prints "SMOKE PASS" / "SMOKE FAIL: <reason>" and exits 0/1.

import {
  captureSceneMotionTelemetry,
  shutdownThumbnailBrowser,
} from "../app/lib/hyperframes/thumbnail";
import {
  computeMotionMetrics,
  telemetryGates,
  renderTelemetryBlock,
} from "../app/lib/hyperframes/motion-telemetry";

const HTML = `<!doctype html>
<html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js"></script>
<style>
  body { margin: 0; background: #0a0a0a; color: #fff; font-family: sans-serif; }
  .scene { position: absolute; inset: 0; }
</style>
</head><body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="4">
  <section id="s1" class="scene" data-start="0" data-duration="4">
    <h1 id="title" style="position:absolute;left:100px;top:200px;font-size:80px;margin:0">LINEAR MOVER</h1>
    <h2 id="pop" style="position:absolute;left:400px;top:600px;width:1000px;height:300px;font-size:120px;margin:0;opacity:0">POP</h2>
  </section>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.to("#title", { x: 800, duration: 3, ease: "none" }, 0.2);
  tl.set("#pop", { opacity: 1 }, 2.0);
  // Pad the timeline to the full 4s scene.
  tl.set({}, {}, 4.0);
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
</script>
</body></html>`;

async function main(): Promise<void> {
  console.log("[smoke] sampling fixture scene…");
  const samples = await captureSceneMotionTelemetry({
    html: HTML,
    sceneId: "s1",
    sceneStartSeconds: 0,
    sceneDurationSeconds: 4,
    totalDurationSeconds: 4,
  });
  console.log(
    `[smoke] ${samples.elements.length} elements × ${samples.sampleTimesSeconds.length} samples`,
  );

  const metrics = computeMotionMetrics(samples);
  console.log("[smoke] metrics:", JSON.stringify(metrics, null, 2));
  console.log("[smoke] telemetry block:\n" + renderTelemetryBlock(metrics));
  const gates = telemetryGates(metrics);
  console.log("[smoke] gates:", JSON.stringify(gates, null, 2));

  const failures: string[] = [];
  if (!metrics.mechanicalSelectors.some((sel) => sel.includes("title"))) {
    failures.push(
      `expected #title flagged mechanical, got [${metrics.mechanicalSelectors.join(", ")}]`,
    );
  }
  if (!gates.some((g) => g.gate === "pop_in" && g.description.includes("pop"))) {
    failures.push("expected a pop_in gate for #pop");
  }
  if (metrics.teleports.length > 0) {
    failures.push(`expected no teleports, got ${JSON.stringify(metrics.teleports)}`);
  }
  if (metrics.unsettledSelectors.length > 0) {
    failures.push(
      `expected clean settle, got unsettled: [${metrics.unsettledSelectors.join(", ")}]`,
    );
  }

  if (failures.length > 0) {
    console.error("SMOKE FAIL:\n  " + failures.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("SMOKE PASS");
  }
}

main()
  .catch((err) => {
    console.error("SMOKE FAIL:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => shutdownThumbnailBrowser());
```

- [ ] **Step 4: Run the smoke**

Run: `npx tsx scripts/smoke-motion-telemetry.ts`
Expected: `SMOKE PASS`. If the environment blocks the GSAP CDN or headless Chromium, the script prints `SMOKE FAIL: <reason>` — that's an environment limit; verify `npx tsc --noEmit` is clean and note the skip in the commit message.

- [ ] **Step 5: Commit**

```bash
git add app/lib/hyperframes/thumbnail.ts scripts/smoke-motion-telemetry.ts
git commit -m "feat(hyperframes): Playwright motion-telemetry sampler + smoke"
```

---

### Task 9: DB migration + `ShotRow` type

**Files:**
- Create: `supabase/migrations/20260611_motion_telemetry.sql`
- Modify: `app/lib/supabase.ts` (the `ShotRow` type, next to `scene_critique` around line 247)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260611_motion_telemetry.sql`:

```sql
-- Motion telemetry: deterministic per-scene motion measurements (MotionMetrics
-- JSON) computed from rendered element rects/opacities sampled at ~4 Hz.
-- Captured alongside the motion-trail composite in jobs.ts:captureScenes;
-- consumed by the vision critique (telemetry text block) and refinement
-- gating (telemetryGates). Null when sampling failed or hasn't run.
--
-- See app/lib/hyperframes/motion-telemetry.ts and
-- docs/superpowers/specs/2026-06-11-motion-telemetry-design.md.

alter table shots
  add column if not exists motion_telemetry jsonb;
```

- [ ] **Step 2: Add the column to `ShotRow`**

In `app/lib/supabase.ts`, directly after the `scene_critique: unknown;` field, add:

```ts
  // Motion telemetry (see supabase/migrations/20260611_motion_telemetry.sql).
  // MotionMetrics JSON measured from the rendered scene at capture time.
  motion_telemetry: unknown;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Apply the migration**

Check how previous migrations were applied (the repo uses the Supabase CLI):

Run: `npx supabase db push`
Expected: the new migration applies. If the CLI isn't linked in this environment, note it — the migration must be applied to the hosted project before deploy (same procedure as the previous `2026*` migrations).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260611_motion_telemetry.sql app/lib/supabase.ts
git commit -m "feat(hyperframes): shots.motion_telemetry column"
```

---

### Task 10: `buildRefinementSet` telemetry merge

**Files:**
- Modify: `app/lib/hyperframes/llm-director.ts` (`buildRefinementSet`, ~line 5393)
- Create: `app/lib/hyperframes/refinement-set.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/lib/hyperframes/refinement-set.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRefinementSet, type SceneCritique } from "./llm-director";

function shipCritique(sceneId: string): SceneCritique {
  return {
    sceneId,
    scores: {
      composition: 80,
      typographyHierarchy: 80,
      colorTension: 80,
      focalClarity: 80,
      motionClarity: 80,
      brandFidelity: 80,
      restraintQuality: 80,
      creativeDistinctiveness: 80,
      overall: 80,
    },
    verdict: "ship",
    issues: [],
  };
}

describe("buildRefinementSet — telemetry merge", () => {
  it("forces a shipped scene into refinement when telemetry gates fire", () => {
    const telemetry = new Map<string, string[]>([
      ["s2", ["element h2#pop@0 pops in at ~2.0s with no transition — fade or scale it in over ≥250ms"]],
    ]);
    const set = buildRefinementSet(
      [shipCritique("s1"), shipCritique("s2")],
      null,
      telemetry,
    );
    expect(set).toHaveLength(1);
    expect(set[0].sceneId).toBe("s2");
    expect(set[0].feedbackText).toContain("MEASURED MOTION ISSUES");
    expect(set[0].feedbackText).toContain("pops in at ~2.0s");
  });

  it("appends telemetry issues to a scene already flagged by critique", () => {
    const critique = shipCritique("s1");
    critique.verdict = "refine";
    critique.issues = [
      {
        severity: "major",
        dimension: "motionClarity",
        description: "entrance is chaotic",
        suggestedFix: "stagger the three headline words 80ms apart",
      },
    ];
    const telemetry = new Map<string, string[]>([
      ["s1", ["scene ends mid-motion (h1#a@0, p#b@1, div#c@2 still moving in the final 10%) — pull animations forward so the final frame settles"]],
    ]);
    const set = buildRefinementSet([critique], null, telemetry);
    expect(set).toHaveLength(1);
    expect(set[0].feedbackText).toContain("PER-SCENE ISSUES");
    expect(set[0].feedbackText).toContain("MEASURED MOTION ISSUES");
  });

  it("behaves exactly as before when no telemetry map is given", () => {
    const set = buildRefinementSet([shipCritique("s1")], null);
    expect(set).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/lib/hyperframes/refinement-set.test.ts`
Expected: FAIL — `buildRefinementSet` doesn't accept a third argument / no `MEASURED MOTION ISSUES` section. (The third test may pass — fine.)

- [ ] **Step 3: Implement**

Replace `buildRefinementSet` in `llm-director.ts` (keep the existing doc comment, extend it) with:

```ts
/**
 * Translate critique outputs into a single refinement set: scenes flagged
 * for refine/reject at the per-scene level, PLUS scenes referenced by film-
 * level major-issue affectedSceneIds, PLUS scenes whose measured motion
 * telemetry tripped a hard gate (telemetryGates) — telemetry can force a
 * refinement even when the vision critic said "ship", because the critic
 * judges a still composite and cannot see timing defects. Per-scene, film-
 * level, and telemetry feedback for the SAME scene is concatenated into one
 * labeled feedback block.
 */
export function buildRefinementSet(
  perSceneCritiques: SceneCritique[],
  filmCritique: FilmCritique | null,
  telemetryIssuesBySceneId?: Map<string, string[]>,
): SceneRefinementRequest[] {
  const bySceneId = new Map<
    string,
    { sceneIssues: string[]; filmIssues: string[]; telemetryIssues: string[] }
  >();

  for (const c of perSceneCritiques) {
    const needsRefine =
      c.verdict === "refine" ||
      c.verdict === "reject" ||
      c.issues.some((i) => i.severity === "major");
    if (!needsRefine) continue;
    const lines = c.issues.map(
      (i) =>
        `  [${i.severity}] ${i.dimension}: ${i.description} → ${i.suggestedFix}`,
    );
    bySceneId.set(c.sceneId, { sceneIssues: lines, filmIssues: [], telemetryIssues: [] });
  }

  if (filmCritique) {
    for (const f of filmCritique.filmLevelIssues) {
      if (f.severity !== "major" && filmCritique.verdict !== "redesign_rhythm") continue;
      const line = `  [${f.severity}] ${f.dimension}: ${f.description} → ${f.suggestedFix}`;
      for (const sid of f.affectedSceneIds) {
        const entry =
          bySceneId.get(sid) ?? { sceneIssues: [], filmIssues: [], telemetryIssues: [] };
        entry.filmIssues.push(line);
        bySceneId.set(sid, entry);
      }
    }
  }

  if (telemetryIssuesBySceneId) {
    for (const [sid, issues] of telemetryIssuesBySceneId) {
      if (issues.length === 0) continue;
      const entry =
        bySceneId.get(sid) ?? { sceneIssues: [], filmIssues: [], telemetryIssues: [] };
      entry.telemetryIssues.push(...issues.map((i) => `  [major] ${i}`));
      bySceneId.set(sid, entry);
    }
  }

  return Array.from(bySceneId.entries()).map(
    ([sceneId, { sceneIssues, filmIssues, telemetryIssues }]) => {
      const parts: string[] = [];
      if (sceneIssues.length > 0) {
        parts.push("PER-SCENE ISSUES (from this scene's own vision critique):");
        parts.push(...sceneIssues);
      }
      if (filmIssues.length > 0) {
        if (parts.length > 0) parts.push("");
        parts.push("FILM-LEVEL ISSUES (this scene contributes to a film-level problem):");
        parts.push(...filmIssues);
      }
      if (telemetryIssues.length > 0) {
        if (parts.length > 0) parts.push("");
        parts.push(
          "MEASURED MOTION ISSUES (deterministic telemetry from the rendered scene — these are measured facts, fix them all):",
        );
        parts.push(...telemetryIssues);
      }
      return { sceneId, feedbackText: parts.join("\n") };
    },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/hyperframes/refinement-set.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite (guard against regressions)**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/lib/hyperframes/llm-director.ts app/lib/hyperframes/refinement-set.test.ts
git commit -m "feat(hyperframes): buildRefinementSet merges telemetry hard-gate issues"
```

---

### Task 11: Pipeline wiring — capture, critique prompt, polish job

**Files:**
- Modify: `app/lib/jobs.ts` (`captureScenes` ~line 1746, `critiqueAndPolishJob` ~line 1370)
- Modify: `app/lib/hyperframes/llm-director.ts` (`generateVisionCritique` ~line 3321, `renderVisionCritiqueUserPrompt` ~line 3285, `VISION_CRITIQUE_SYSTEM_PROMPT` ~line 3169)

- [ ] **Step 1: Teach `generateVisionCritique` the telemetry block**

In `llm-director.ts`, change `renderVisionCritiqueUserPrompt` to accept and embed the block. New signature and body changes:

```ts
function renderVisionCritiqueUserPrompt(
  blueprint: FilmBlueprint,
  sceneIndex: number,
  critiqueImageUrl: string,
  telemetryBlock?: string | null,
): { text: string; imageUrl: string } {
```

and change the final template so the block sits between the image note and the emit instruction:

```ts
  const text = `SCENE TO CRITIQUE — ${sid} (${curr.durationSeconds}s)

  copy:               ${curr.copy}
  brief:              ${curr.brief}
  motionPattern:      ${curr.motionPattern}
  focalElementHint:   ${curr.focalElementHint}
  pacingIntent:       ${curr.pacingIntent ?? "(not set)"}
  film rhythm role:   ${roleLabel} (energy ${r.energyCurve[sceneIndex]?.toFixed(2) ?? "?"} / cadence ${r.cadenceMode})
  transitionInChoice: ${curr.transitionInChoice}

The attached image is the motion-trail composite: 4 frames blended with descending alpha. Read it for motion, focal hierarchy, and the dead-frame-vs-restraint distinction. The scene's role above tells you whether stillness should be intentional restraint.
${telemetryBlock ? `\n${telemetryBlock}\n` : ""}
Emit a SceneCritique JSON now. sceneId MUST be "${sid}".`;
```

Then thread the parameter through `generateVisionCritique`:

```ts
export async function generateVisionCritique(
  blueprint: FilmBlueprint,
  sceneIndex: number,
  critiqueImageUrl: string,
  telemetryBlock?: string | null,
): Promise<SceneCritique> {
  const { text, imageUrl } = renderVisionCritiqueUserPrompt(
    blueprint,
    sceneIndex,
    critiqueImageUrl,
    telemetryBlock,
  );
```

(rest of the function unchanged).

- [ ] **Step 2: Extend `VISION_CRITIQUE_SYSTEM_PROMPT`**

In `llm-director.ts`, inside the `VISION_CRITIQUE_SYSTEM_PROMPT` template literal, insert this section between the `═══ CRITICAL: DEAD FRAMES vs INTENTIONAL RESTRAINT ═══` section and `═══ VERDICTS ═══`:

```
═══ MEASURED MOTION TELEMETRY ═══

Some scenes arrive with a "MEASURED MOTION TELEMETRY" block — deterministic measurements sampled from the rendered scene (element rects + opacities at ~4 Hz). The composite image cannot show timing; these numbers can. Trust them over your visual read for jank, pacing, and rhythm:

  • teleports / pop-ins are real rendering defects the sampler measured — file each as an issue (dimension motionClarity) with a concrete suggestedFix, unless the scene's brief clearly intends a hard cut.
  • "mechanical motion" means near-constant speed = linear easing. File at least a minor motionClarity issue naming the element and the easing fix (e.g. "swap linear for power3.out on h1#title").
  • high dead air on a build/punch/beat scene is a pacing failure (low motionClarity); on a HOLD/REST/CLIMAX scene it may be earned restraint — use the film rhythm role from the user message.
  • "still moving in the final 10%" matters most on scenes that should settle; a scene whose transitionInChoice hands off mid-motion may be intentional.

The telemetry block is measurement, not verdict — you still decide severity and whether the scene's role excuses the signal.
```

Note: the system prompt has `cache_control: ephemeral` — changing it invalidates the prompt cache once. Expected and fine.

- [ ] **Step 3: Capture telemetry in `captureScenes` (jobs.ts)**

Add imports to the `./hyperframes/thumbnail` import in `jobs.ts` (it currently imports `captureMotionTrailComposite` and `captureSceneThumbnail`) — add `captureSceneMotionTelemetry`. Add to the `./hyperframes/motion-telemetry` import (new):

```ts
import {
  computeMotionMetrics,
  renderTelemetryBlock,
  telemetryGates,
  type MotionMetrics,
} from "./hyperframes/motion-telemetry";
```

In `captureScenes`, after the motion-trail `try/catch` block (the one ending `motionTrailUrls[i] = trail.publicUrl; } catch (trailErr) { … }`), add a third independent step:

```ts
    try {
      const samples = await captureSceneMotionTelemetry({
        html,
        sceneId: scene.id,
        sceneStartSeconds: sceneStart,
        sceneDurationSeconds: scene.durationSeconds,
        totalDurationSeconds: totalFilmSeconds,
      });
      const metrics = computeMotionMetrics(samples);
      await patchShot(shot.id, { motion_telemetry: metrics as unknown as object });
    } catch (telemetryErr) {
      // Telemetry is strictly additive — never blocks capture or critique.
      console.warn(
        `[hyperframes ${jobId}] motion telemetry failed for ${scene.id}:`,
        telemetryErr instanceof Error ? telemetryErr.message : telemetryErr,
      );
    }
```

- [ ] **Step 4: Feed telemetry into the critique + refinement in `critiqueAndPolishJob`**

In `critiqueAndPolishJob` (jobs.ts), after `const motionTrailUrls = …` (~line 1367), add:

```ts
  const telemetryByIndex: (MotionMetrics | null)[] = insertedScenes.map(
    (s) => (s.motion_telemetry ?? null) as MotionMetrics | null,
  );
```

Change the per-scene critique dispatch (~line 1382) from:

```ts
          generateVisionCritique(blueprint, x.i, x.url),
```

to:

```ts
          generateVisionCritique(
            blueprint,
            x.i,
            x.url,
            telemetryByIndex[x.i] ? renderTelemetryBlock(telemetryByIndex[x.i]!) : null,
          ),
```

Change the refinement-set build (~line 1432) from:

```ts
  const refinements = buildRefinementSet(perSceneCritiques, filmCritique);
```

to:

```ts
  const telemetryIssues = new Map<string, string[]>();
  blueprint.sceneOutline.forEach((outline, i) => {
    const metrics = telemetryByIndex[i];
    if (!metrics) return;
    const gates = telemetryGates(metrics);
    if (gates.length > 0) {
      telemetryIssues.set(outline.id, gates.map((g) => g.description));
    }
  });
  if (telemetryIssues.size > 0) {
    console.log(
      `[hyperframes ${jobId}] telemetry gates fired for: ${Array.from(telemetryIssues.keys()).join(", ")}`,
    );
  }
  const refinements = buildRefinementSet(perSceneCritiques, filmCritique, telemetryIssues);
```

- [ ] **Step 5: Type-check + full test suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/lib/jobs.ts app/lib/hyperframes/llm-director.ts
git commit -m "feat(hyperframes): wire motion telemetry into capture, critique, and refinement gating"
```

---

### Task 12: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Browser smoke**

Run: `npx tsx scripts/smoke-motion-telemetry.ts`
Expected: `SMOKE PASS` (skip-with-note if the environment blocks Chromium/CDN — see Task 8 Step 4).

- [ ] **Step 4: Confirm migration applied**

Confirm `supabase db push` succeeded in Task 9 (or that the migration is queued for the hosted project). The pipeline tolerates a missing column read (`motion_telemetry` would be undefined → telemetry treated as null), but `patchShot` writes would log errors until applied.

- [ ] **Step 5: Update memory + wrap up**

Update the multi-engine memory file if appropriate, then report completion against the spec:
- telemetry sampled per scene at capture ✓
- metrics persisted on shots ✓
- telemetry block in vision critique ✓
- hard gates force refinement ✓
- zero new LLM calls ✓
```
