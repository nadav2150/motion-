import { describe, expect, it, vi } from "vitest";
import { buildClockShim, SHIM_EPOCH_MS, type ShimMode } from "./clock-shim";

type FakeAnimation = {
  playState: string;
  playbackRate: number;
  currentTime: number | null;
  pause: () => void;
  effect?: { getComputedTiming: () => { endTime: number } };
};

// A minimal window the shim can run against (the shim only touches `W.*`).
function makeWindow(opts: { seed?: number; mode?: ShimMode; doc?: Record<string, unknown>; setTimeout?: typeof setTimeout } = {}) {
  class FakeDate extends Date {}
  const animations: FakeAnimation[] = [];
  const doc = {
    readyState: "complete",
    images: [],
    fonts: { status: "loaded", ready: Promise.resolve() },
    getAnimations: () => animations.filter((a) => a.playState !== "idle"),
    querySelector: () => null,
    querySelectorAll: () => [],
    ...opts.doc,
  };
  const win: Record<string, any> = {
    Math: Object.create(Math),
    Date: FakeDate,
    performance: { now: () => 987654 },
    crypto: {
      getRandomValues: () => {
        throw new Error("real crypto must not be used");
      },
    },
    document: doc,
    setTimeout: opts.setTimeout ?? setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
  };
  win.window = win;
  new Function("window", buildClockShim({ seed: opts.seed ?? 42, mode: opts.mode ?? "render" }))(win);
  return { win, animations, shim: win.__videlyShim as { seek(t: number): Promise<number>; ready(): Promise<{ ok: boolean; timedOut: string[] }>; state(): any } };
}

function fakeAnimation(extra: Partial<FakeAnimation> = {}): FakeAnimation {
  const a: FakeAnimation = {
    playState: "running",
    playbackRate: 1,
    currentTime: 0,
    pause() {
      if (a.playState !== "idle") a.playState = "paused";
    },
    ...extra,
  };
  return a;
}

describe("buildClockShim", () => {
  it("injects seed and mode and sanitises the seed", () => {
    const src = buildClockShim({ seed: 7, mode: "preview" });
    expect(src).toContain("var SEED = 7;");
    expect(src).toContain('var MODE = "preview";');
    expect(buildClockShim({ seed: Number.NaN, mode: "render" })).toContain("var SEED = 0;");
    expect(buildClockShim({ seed: -1, mode: "render" })).toContain("var SEED = 4294967295;");
    expect(src).not.toMatch(/__SEED__|__MODE__|__EPOCH__/);
  });

  it("installs once", () => {
    const { win } = makeWindow();
    const api = win.__videlyShim;
    new Function("window", buildClockShim({ seed: 1, mode: "render" }))(win);
    expect(win.__videlyShim).toBe(api);
  });
});

describe("virtual time", () => {
  it("drives performance.now and Date from vt with a fixed epoch", async () => {
    const { win, shim } = makeWindow();
    expect(win.performance.now()).toBe(0);
    expect(win.Date.now()).toBe(SHIM_EPOCH_MS);
    await shim.seek(1.5);
    expect(win.performance.now()).toBe(1500);
    expect(win.Date.now()).toBe(SHIM_EPOCH_MS + 1500);
    const d = new win.Date();
    expect(d.toISOString()).toBe("2026-01-01T00:00:01.500Z");
    expect(d instanceof win.Date).toBe(true);
    expect(new win.Date(0).getTime()).toBe(0);
    expect(new win.Date(2020, 0, 1).getFullYear()).toBe(2020);
    expect(typeof win.Date()).toBe("string");
    expect(win.Date.UTC(2026, 0, 1)).toBe(SHIM_EPOCH_MS);
    expect(win.document.timeline).toBeUndefined();
  });

  it("clamps negative seeks to 0", async () => {
    const { win, shim } = makeWindow();
    await shim.seek(-3);
    expect(win.performance.now()).toBe(0);
  });
});

describe("timers", () => {
  it("runs due timers in (time, insertion) order with vt at their due time", async () => {
    const { win, shim } = makeWindow();
    const log: string[] = [];
    const at = (name: string) => () => log.push(`${name}@${win.performance.now()}`);
    win.setTimeout(at("c300"), 300);
    win.setTimeout(at("a100"), 100);
    win.setTimeout(at("b100"), 100);
    const iv = win.setInterval(at("i250"), 250);
    const cancelled = win.setTimeout(at("never"), 200);
    win.clearTimeout(cancelled);
    win.setTimeout((x: string) => log.push(`args:${x}`), 0, "hello");
    await shim.seek(0.6);
    expect(log).toEqual(["args:hello", "a100@100", "b100@100", "i250@250", "c300@300", "i250@500"]);
    expect(win.performance.now()).toBe(600);
    win.clearInterval(iv);
    await shim.seek(2);
    expect(log.length).toBe(6);
  });

  it("runs timers scheduled from timers within the same seek", async () => {
    const { win, shim } = makeWindow();
    const log: number[] = [];
    win.setTimeout(() => {
      log.push(win.performance.now());
      win.setTimeout(() => log.push(win.performance.now()), 50);
    }, 100);
    await shim.seek(0.2);
    expect(log).toEqual([100, 150]);
  });

  it("treats requestIdleCallback as a 0 ms timer", async () => {
    const { win, shim } = makeWindow();
    const cb = vi.fn();
    win.requestIdleCallback(cb);
    expect(cb).not.toHaveBeenCalled();
    await shim.seek(0);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].timeRemaining()).toBeGreaterThan(0);
  });

  it("reports the latest fired timer so the renderer can reload on backward seeks", async () => {
    const { win, shim } = makeWindow();
    expect(shim.state().lastTimerAt).toBe(-1);
    win.setTimeout(() => {}, 2000);
    await shim.seek(1);
    expect(shim.state().lastTimerAt).toBe(-1);
    await shim.seek(3);
    expect(shim.state().lastTimerAt).toBe(2);
    expect(shim.state().pendingTimers).toBe(0);
  });

  it("stops a runaway zero-delay interval", async () => {
    const { win, shim } = makeWindow();
    win.setInterval(() => {}, 0); // clamped to 1 ms
    await shim.seek(0.05);
    expect(win.performance.now()).toBe(50);
  });
});

describe("requestAnimationFrame", () => {
  it("flushes the queue once per seek with vt as the timestamp", async () => {
    const { win, shim } = makeWindow();
    const stamps: number[] = [];
    const loop = (ts: number) => {
      stamps.push(ts);
      win.requestAnimationFrame(loop);
    };
    win.requestAnimationFrame(loop);
    const cancelled = win.requestAnimationFrame(() => stamps.push(-1));
    win.cancelAnimationFrame(cancelled);
    await shim.seek(0.5);
    await shim.seek(0.25); // backward seeks work for rAF loops
    expect(stamps).toEqual([500, 250]);
  });
});

describe("seeded randomness", () => {
  it("is deterministic per seed", () => {
    const a = makeWindow({ seed: 5 }).win;
    const b = makeWindow({ seed: 5 }).win;
    const c = makeWindow({ seed: 6 }).win;
    const seq = (w: any) => Array.from({ length: 5 }, () => w.Math.random());
    const sa = seq(a);
    expect(sa).toEqual(seq(b));
    expect(sa).not.toEqual(seq(c));
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it("seeds crypto.getRandomValues and randomUUID", () => {
    const a = makeWindow({ seed: 9 }).win;
    const b = makeWindow({ seed: 9 }).win;
    const bufA = a.crypto.getRandomValues(new Uint32Array(4));
    expect(Array.from(bufA)).toEqual(Array.from(b.crypto.getRandomValues(new Uint32Array(4))));
    const uuid = a.crypto.randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid).toBe(b.crypto.randomUUID());
    expect(() => a.crypto.getRandomValues(null)).toThrow(TypeError);
  });
});

describe("GSAP", () => {
  it("tames the ticker when gsap is assigned and drives updateRoot on seek", async () => {
    const { win, shim } = makeWindow();
    const updateRoot = vi.fn();
    const gsap = { ticker: { lagSmoothing: vi.fn(), remove: vi.fn() }, updateRoot };
    win.gsap = gsap;
    expect(win.gsap).toBe(gsap);
    expect(gsap.ticker.lagSmoothing).toHaveBeenCalledWith(0);
    expect(gsap.ticker.remove).toHaveBeenCalledWith(updateRoot);
    await shim.seek(2);
    expect(updateRoot).toHaveBeenLastCalledWith(2);
  });

  it("advances GSAP to each timer's time before the timer runs", async () => {
    const { win, shim } = makeWindow();
    const calls: number[] = [];
    win.gsap = { ticker: { lagSmoothing() {}, remove() {} }, updateRoot: (t: number) => calls.push(t) };
    win.setTimeout(() => {}, 700);
    await shim.seek(1);
    expect(calls[0]).toBe(0.7);
    expect(calls.at(-1)).toBe(1);
  });

  it("seeks window.__videly.timeline", async () => {
    const { win, shim } = makeWindow();
    const tl = { paused: vi.fn(() => false), pause: vi.fn(), seek: vi.fn() };
    win.__videly = { duration: 4, fps: 30, width: 1280, height: 720, timeline: tl };
    await shim.seek(1.25);
    expect(tl.pause).toHaveBeenCalled();
    expect(tl.seek).toHaveBeenCalledWith(1.25, false);
  });
});

describe("window.__videly hooks", () => {
  it("adds onSeek(fn) registration and calls hooks with t", async () => {
    const { win, shim } = makeWindow();
    win.__videly = { duration: 4, fps: 30, width: 1280, height: 720 };
    const hook = vi.fn();
    const off = win.__videly.onSeek(hook);
    await shim.seek(1);
    expect(hook).toHaveBeenCalledWith(1);
    off();
    await shim.seek(2);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("calls a document-supplied onSeek function as a hook and awaits promises", async () => {
    const { win, shim } = makeWindow();
    const seen: number[] = [];
    win.__videly = {
      duration: 4,
      fps: 30,
      width: 1,
      height: 1,
      onSeek: (t: number) => new Promise<void>((r) => setTimeout(() => (seen.push(t), r()), 5)),
    };
    await shim.seek(0.5);
    expect(seen).toEqual([0.5]);
  });
});

describe("CSS / WAAPI animations", () => {
  it("pauses animations on first sight and sets currentTime from their birth", async () => {
    const { win, shim, animations } = makeWindow();
    const early = fakeAnimation();
    animations.push(early);
    await shim.seek(0);
    expect(early.playState).toBe("paused");
    expect(early.currentTime).toBe(0);
    await shim.seek(1);
    expect(early.currentTime).toBe(1000);

    // Created by a timer at 1.5 s: birth is the timer's time, not the seek target.
    win.setTimeout(() => animations.push(fakeAnimation({ playbackRate: 2 })), 500); // due at 1.5 s
    await shim.seek(2);
    const late = animations[1];
    expect(late.currentTime).toBe(1000); // (2000 - 1500) * 2
    await shim.seek(0.5); // backward: clamped at 0 before birth
    expect(late.currentTime).toBe(0);
    expect(early.currentTime).toBe(500);
  });

  it("starts reversed animations at their end and drops cancelled ones", async () => {
    const { shim, animations } = makeWindow();
    const rev = fakeAnimation({ playbackRate: -1, effect: { getComputedTiming: () => ({ endTime: 3000 }) } });
    animations.push(rev);
    await shim.seek(1);
    expect(rev.currentTime).toBe(3000);
    await shim.seek(2);
    expect(rev.currentTime).toBe(2000);
    rev.playState = "idle";
    await shim.seek(2.5);
    expect(rev.currentTime).toBe(2000);
    expect(shim.state().animations).toBe(0);
  });
});

describe("preview mode", () => {
  it("posts ready, answers seek/play/pause over postMessage", async () => {
    const posted: any[] = [];
    const listeners: Record<string, ((ev: any) => void)[]> = {};
    const frames: (() => void)[] = [];
    const parent = { postMessage: (m: unknown, origin: string) => posted.push({ m, origin }) };
    class FakeDate extends Date {}
    const win: Record<string, any> = {
      Math: Object.create(Math),
      Date: FakeDate,
      performance: { now: () => realNow },
      document: {
        readyState: "complete",
        images: [],
        fonts: { status: "loaded", ready: Promise.resolve() },
        getAnimations: () => [],
        querySelector: () => null,
        querySelectorAll: () => [],
      },
      parent,
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (cb: () => void) => frames.push(cb),
      cancelAnimationFrame: () => {},
      addEventListener: (type: string, fn: (ev: any) => void) => (listeners[type] ??= []).push(fn),
    };
    let realNow = 1000;
    win.window = win;
    new Function("window", buildClockShim({ seed: 1, mode: "preview" }))(win);
    win.__videly = { duration: 4, fps: 30, width: 1280, height: 720 };

    const flush = () => new Promise((r) => setTimeout(r, 10));
    await flush();
    expect(posted[0]).toEqual({ m: { type: "videly:ready", duration: 4, width: 1280, height: 720 }, origin: "*" });

    const send = (data: unknown) => listeners.message.forEach((fn) => fn({ source: parent, data }));
    send({ type: "videly:seek", time: 1.25 });
    await flush();
    expect(posted.at(-1).m).toEqual({ type: "videly:time", time: 1.25, playing: false });

    // Messages from anything but the parent are ignored.
    listeners.message.forEach((fn) => fn({ source: {}, data: { type: "videly:seek", time: 3 } }));
    await flush();
    expect(win.performance.now()).toBe(1250);

    // Play: the real-rAF driver advances vt by real elapsed time.
    send({ type: "videly:play" });
    realNow += 50;
    frames.splice(0).forEach((cb) => cb());
    await flush();
    expect(win.performance.now()).toBe(1300);
    // Loops at the duration.
    send({ type: "videly:seek", time: 3.99 });
    await flush();
    realNow += 40;
    frames.splice(0).forEach((cb) => cb());
    await flush();
    expect(win.performance.now()).toBeCloseTo(30, 5);

    send({ type: "videly:pause" });
    await flush();
    expect(posted.at(-1).m.playing).toBe(false);
    const before = win.performance.now();
    realNow += 100;
    frames.splice(0).forEach((cb) => cb());
    expect(win.performance.now()).toBe(before);
  });
});

describe("readiness gate", () => {
  it("resolves ok when every gate settles", async () => {
    const { win, shim } = makeWindow();
    let resolveReady!: () => void;
    win.__videly = { duration: 4, fps: 30, width: 1, height: 1, ready: new Promise<void>((r) => (resolveReady = r)) };
    const p = shim.ready();
    resolveReady();
    await expect(p).resolves.toMatchObject({ ok: true, timedOut: [] });
  });

  it("names the gate that timed out", async () => {
    // Shrink the 15 s cap so the test is fast.
    const fastTimeout = ((fn: () => void, ms?: number) => setTimeout(fn, ms && ms >= 15000 ? 5 : ms)) as typeof setTimeout;
    const { win, shim } = makeWindow({ setTimeout: fastTimeout });
    win.__videly = { duration: 4, fps: 30, width: 1, height: 1, ready: new Promise(() => {}) };
    await expect(shim.ready()).resolves.toMatchObject({ ok: false, timedOut: ["__videly.ready"] });
  });

  it("runs t=0 timers and rAF before gating", async () => {
    const { win, shim } = makeWindow();
    const cb = vi.fn();
    win.setTimeout(cb, 0);
    win.requestAnimationFrame(cb);
    await shim.ready();
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
