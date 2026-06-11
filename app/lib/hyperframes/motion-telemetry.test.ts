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
