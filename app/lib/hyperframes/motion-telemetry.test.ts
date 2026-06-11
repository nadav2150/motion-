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
