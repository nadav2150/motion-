import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioBeat, StudioPlan, VoLine } from "./types";

vi.mock("./anthropic", async (orig) => ({
  ...(await orig<typeof import("./anthropic")>()),
  callOpus: vi.fn(),
}));

const anthropic = await import("./anthropic");
const {
  assembleDocument,
  checkSceneCode,
  mapLimit,
  sanitizeFontsHead,
  sceneBudgetKb,
  scopeSceneCss,
  splitScenes,
  splitSignature,
  targetSceneCount,
  writeScenesParallel,
} = await import("./scenes");
const { ensureVidelyMeta, staticCheck } = await import("./validate");
const { FORMAT_PRESETS } = await import("./types");
type SceneSpec = import("./scenes").SceneSpec;
type StyleFoundation = import("./scenes").StyleFoundation;
type SceneCode = import("./scenes").SceneCode;

function beatsEvery(duration: number, len: number): StudioBeat[] {
  const out: StudioBeat[] = [];
  for (let t = 0; t < duration - 1e-9; t += len) {
    out.push({ start: t, end: Math.min(duration, t + len), visual: `v${t}`, technique: "t" });
  }
  return out;
}

function plan(duration: number, beats: StudioBeat[], voiceover: VoLine[] = []): Pick<StudioPlan, "beats" | "voiceover" | "duration"> {
  return { duration, beats, voiceover };
}

function expectContiguous(scenes: SceneSpec[], duration: number, beatCount: number) {
  expect(scenes[0]!.start).toBe(0);
  expect(scenes.at(-1)!.end).toBe(duration);
  for (let i = 1; i < scenes.length; i++) expect(scenes[i]!.start).toBe(scenes[i - 1]!.end);
  expect(scenes.reduce((a, s) => a + s.beats.length, 0)).toBe(beatCount);
  scenes.forEach((s, i) => expect(s.index).toBe(i + 1));
}

describe("splitScenes", () => {
  it("scene counts: 15 s → 3, 30 s → 5, 60 s → 6", () => {
    expect(targetSceneCount(15)).toBe(3);
    expect(targetSceneCount(20)).toBe(4);
    expect(targetSceneCount(30)).toBe(5);
    expect(targetSceneCount(45)).toBe(6);
    expect(targetSceneCount(60)).toBe(6);
    expect(targetSceneCount(5)).toBe(2);
  });

  it("15 s with 3 s beats → 3 balanced scenes", () => {
    const s = splitScenes(plan(15, beatsEvery(15, 3)));
    expect(s).toHaveLength(3);
    expectContiguous(s, 15, 5);
    expect(s.map((x) => x.end - x.start).sort()).toEqual([3, 6, 6]);
  });

  it("15 s with 7.5 s beats → 2 scenes (never more than beats)", () => {
    expect(splitScenes(plan(15, beatsEvery(15, 7.5))).map((x) => [x.start, x.end])).toEqual([
      [0, 7.5],
      [7.5, 15],
    ]);
  });

  it("30 s with 2.5 s beats → 5 scenes of ~6 s", () => {
    const s = splitScenes(plan(30, beatsEvery(30, 2.5)));
    expect(s).toHaveLength(5);
    expectContiguous(s, 30, 12);
    for (const x of s) expect(x.end - x.start).toBeGreaterThanOrEqual(5);
    for (const x of s) expect(x.end - x.start).toBeLessThanOrEqual(7.5);
  });

  it("60 s with 5 s beats → 6 scenes of 10 s", () => {
    const s = splitScenes(plan(60, beatsEvery(60, 5)));
    expect(s).toHaveLength(6);
    expectContiguous(s, 60, 12);
    expect(s.map((x) => x.end - x.start)).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it("never more scenes than beats; one beat → one scene", () => {
    expect(splitScenes(plan(30, beatsEvery(30, 10)))).toHaveLength(3);
    expect(splitScenes(plan(15, [{ start: 0, end: 15, visual: "v", technique: "t" }]))).toHaveLength(1);
    expect(splitScenes(plan(15, []))).toEqual([]);
  });

  it("moves a cut off a voiceover line that would straddle it", () => {
    // 10 s, 2.5 s beats → 2 scenes; the balanced cut is 5. A line runs
    // 4–6.5 s, so 5 is inside it: the split must cut at 7.5 (or 2.5).
    const vo = [
      { text: "a", start: 0.2, end: 3.8 },
      { text: "b", start: 4, end: 6.5 },
      { text: "c", start: 7.6, end: 9.5 },
    ];
    const s = splitScenes(plan(10, beatsEvery(10, 2.5), vo));
    expect(s.map((x) => x.end)).toEqual([7.5, 10]);
    expect(s[0]!.voLines.map((l) => l.text)).toEqual(["a", "b"]);
    expect(s[1]!.voLines.map((l) => l.text)).toEqual(["c"]);
  });

  it("assigns each VO line to the scene where it starts", () => {
    const vo = [
      { text: "one", start: 0.3, end: 2 },
      { text: "two", start: 6, end: 8 },
      { text: "three", start: 12, end: 14.5 },
    ];
    const s = splitScenes(plan(15, beatsEvery(15, 3), vo));
    expect(s.flatMap((x) => x.voLines.map((l) => l.text))).toEqual(["one", "two", "three"]);
  });

  it("scene budgets split the document budget proportionally", () => {
    const s = splitScenes(plan(30, beatsEvery(30, 2.5)));
    const total = s.reduce((a, x) => a + sceneBudgetKb(x, 30), 0);
    expect(total).toBeGreaterThanOrEqual(38);
    expect(total).toBeLessThanOrEqual(46);
  });
});

describe("scopeSceneCss", () => {
  it("prefixes selectors, keeps keyframes, recurses into @media", () => {
    const css = `h1, .s2-a { color: red }
#scene-2 .x { top: 0 }
:root { --k: 1 }
@keyframes s2-spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }
@media (min-width: 10px) { p { margin: 0 } }
/* comment { } */`;
    const out = scopeSceneCss(css, 2);
    expect(out).toContain("#scene-2 h1,#scene-2 .s2-a{");
    expect(out).toContain("#scene-2 .x{");
    expect(out).toContain("#scene-2{ --k: 1 }");
    expect(out).toContain("@keyframes s2-spin{ from { transform: rotate(0) } to { transform: rotate(1turn) } }");
    expect(out).toContain("@media (min-width: 10px){#scene-2 p{ margin: 0 }}");
    expect(out).not.toContain("comment");
  });
});

describe("checkSceneCode", () => {
  it("wraps a bare fragment in the scene section", () => {
    const r = checkSceneCode({ html: "<div class='s1-a'>x</div>", css: "", js: "" }, 1);
    expect(r.problem).toBeNull();
    expect(r.code.html).toMatch(/^<section class="scene" id="scene-1">/);
  });
  it("adds the scene class to a section that lacks it", () => {
    const r = checkSceneCode({ html: '<section id="scene-3"><p>x</p></section>', css: "", js: "" }, 3);
    expect(r.code.html).toMatch(/^<section class="scene" id="scene-3">/);
  });
  it("rejects a JS syntax error, scripts in html and empty html", () => {
    expect(checkSceneCode({ html: '<section class="scene" id="scene-1"></section>', css: "", js: "tl.to(root, {x: }, 1)" }, 1).problem).toMatch(/^js:/);
    expect(checkSceneCode({ html: "<script>1</script>", css: "", js: "" }, 1).problem).toMatch(/script/);
    expect(checkSceneCode({ html: "", css: "", js: "" }, 1).problem).toBe("empty html");
    expect(checkSceneCode(undefined, 1).problem).toBe("no scene JSON");
  });
  it("accepts await and dynamic import (async body)", () => {
    const js = `const m = await import("three/addons/geometries/RoundedBoxGeometry.js"); tl.to(root, { x: 1 }, 0);`;
    expect(checkSceneCode({ html: '<section class="scene" id="scene-1"></section>', css: "", js }, 1).problem).toBeNull();
  });
  it("rejects a redeclared parameter (strict module semantics)", () => {
    expect(checkSceneCode({ html: '<section class="scene" id="scene-1"></section>', css: "", js: "const tl = 1;" }, 1).problem).toMatch(/^js:/);
  });
});

describe("sanitizeFontsHead", () => {
  it("keeps font links and studio-libs scripts only", () => {
    const head = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;800&display=block" rel="stylesheet">
<link rel="stylesheet" href="https://evil.example/x.css">
<script src="/studio-libs/gsap/ScrambleTextPlugin.min.js"></script>
<script src="/studio-libs/gsap/gsap.min.js"></script>
<script src="https://cdn.example/x.js"></script>
<script>alert(1)</script>`;
    const out = sanitizeFontsHead(head, '<script src="/studio-libs/gsap/gsap.min.js"></script>');
    expect(out).toContain("fonts.gstatic.com");
    expect(out).toContain("family=Sora");
    expect(out).toContain("ScrambleTextPlugin");
    expect(out).not.toContain("evil");
    expect(out).not.toContain("cdn.example");
    expect(out).not.toContain("alert");
    expect(out).not.toContain("gsap/gsap.min.js");
  });
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const FOUNDATION: StyleFoundation = {
  fontsHead: '<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;800&display=block" rel="stylesheet">',
  css: ":root{--c-bg:#0b0d12;--c-ink:#f4f1ea;--c-accent:#ff5a36;--font-display:'Sora',sans-serif}\n.v-title{font-family:var(--font-display);color:var(--c-ink);font-weight:800}",
  helpersJs: "CustomEase.create('snap','M0,0 C0.14,0 0.24,1.02 0.44,1.02 0.64,1.02 0.7,1 1,1');\nV.clamp = (x, a, b) => Math.min(b, Math.max(a, x));\nV.rise = (tl, el, at) => tl.from(el, { yPercent: 100, autoAlpha: 0, duration: 0.6, ease: 'snap' }, at);",
  motionLanguage: "snap for entrances 0.6s, power2.in exits 0.3s",
  transitionStyle: "hard cuts on VO starts with an accent flood",
  scenes: [
    { index: 1, summary: "hook" },
    { index: 2, summary: "lockup" },
  ],
  handoffs: [{ after: 1, frame: "accent flood covers the frame" }],
};

function sceneFixture(n: number, start: number, end: number): SceneCode {
  return {
    html: `<section class="scene" id="scene-${n}"><div class="s${n}-bg"></div><h1 class="v-title s${n}-t">Scene ${n}</h1></section>`,
    css: `.s${n}-bg{position:absolute;inset:0;background:var(--c-bg)} .s${n}-t{position:absolute;left:10%;top:40%;font-size:120px}`,
    js: `const t = root.querySelector(".s${n}-t");\nV.rise(tl, t, ${start + 0.1});\ntl.to(root.querySelector(".s${n}-bg"), { backgroundColor: "#223344", duration: ${(end - start) / 2} }, ${start});`,
  };
}

describe("assembleDocument", () => {
  const scenes: SceneSpec[] = [
    { index: 1, start: 0, end: 6, beats: [], voLines: [] },
    { index: 2, start: 6, end: 15, beats: [], voLines: [] },
  ];
  const preset = FORMAT_PRESETS["16:9"];
  const html = assembleDocument({
    foundation: FOUNDATION,
    scenes,
    code: [sceneFixture(1, 0, 6), sceneFixture(2, 6, 15)],
    libraries: ["gsap", "three"],
    preset,
    duration: 15,
    fps: 30,
    language: "en",
  });

  it("passes the static checks, before and after ensureVidelyMeta", () => {
    const opts = { expect: { duration: 15, fps: 30, width: 1920, height: 1080 }, allowedHosts: [] };
    expect(staticCheck(html, opts).filter((i) => i.severity === "error")).toEqual([]);
    const withMeta = ensureVidelyMeta(html, opts.expect);
    expect(staticCheck(withMeta, opts).filter((i) => i.severity === "error")).toEqual([]);
    expect(withMeta).toContain("data-videly-meta");
  });

  it("declares __videly first in <head>, then the libraries and fonts", () => {
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head.indexOf("window.__videly")).toBeLessThan(head.indexOf("/studio-libs/gsap/gsap.min.js"));
    expect(head).toContain('"three":"/studio-libs/three/three.module.min.js"');
    expect(head).toContain("family=Sora");
  });

  it("stage holds every section in order; the module script builds each scene in try/catch", () => {
    expect(html.indexOf('id="scene-1"')).toBeLessThan(html.indexOf('id="scene-2"'));
    expect(html).toContain('<script type="module">');
    expect(html).toContain('import * as THREE from "three";');
    expect(html).toContain("window.__videly.timeline = tl;");
    expect(html).toContain("gsap.timeline({ paused: true })");
    expect(html).toContain("tl.set({}, {}, DURATION);");
    expect(html).toMatch(/try \{\s*pending\.push/);
    expect(html).toContain("#scene-2 .s2-bg{");
    expect(html).toContain("#stage>#scene-1{visibility:visible}");
  });

  it("the assembled script parses (module = strict)", () => {
    const script = html.slice(html.indexOf('<script type="module">') + 22, html.lastIndexOf("</script>"));
    const body = script.replace(/^import .*$/gm, "");
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    expect(() => new AsyncFunction(`"use strict";\n${body}`)).not.toThrow();
  });

  it("escapes </script> inside scene code", () => {
    const bad = { ...sceneFixture(1, 0, 6), js: 'const s = "</script>";' };
    const doc = assembleDocument({ foundation: FOUNDATION, scenes: scenes.slice(0, 1), code: [bad], libraries: ["gsap"], preset, duration: 6, fps: 30 });
    expect(doc.match(/<\/script>/g)!.length).toBe(doc.match(/<script\b/g)!.length);
  });
});

// Real browser: the assembled document renders, switches scenes at the
// boundary, and a throwing scene is reported without blanking the others.
describe.runIf(process.env.RUN_RENDER_TESTS === "1")("assembled document in the real renderer", () => {
  const preset = { width: 640, height: 360 };
  const scenes: SceneSpec[] = [
    { index: 1, start: 0, end: 2, beats: [], voLines: [] },
    { index: 2, start: 2, end: 4, beats: [], voLines: [] },
  ];
  const color = (n: number, bg: string): SceneCode => ({
    html: `<section class="scene" id="scene-${n}"><div class="s${n}-bg"></div><div class="s${n}-dot"></div></section>`,
    css: `.s${n}-bg{position:absolute;inset:0;background:${bg}} .s${n}-dot{position:absolute;left:20px;top:150px;width:60px;height:60px;background:#fff}`,
    js: `tl.to(root.querySelector(".s${n}-dot"), { x: 400, duration: 1.8, ease: "none" }, ${scenes[n - 1]!.start});`,
  });

  it("switches scenes at the boundary and reports a throwing scene", async () => {
    const { captureFrames } = await import("./render");
    const { shutdownBrowser } = await import("./browser");
    const sharp = (await import("sharp")).default;
    const broken = { ...color(2, "#0000ff"), js: `throw new Error("kaboom");` };
    const html = ensureVidelyMeta(
      assembleDocument({ foundation: { ...FOUNDATION, fontsHead: "" }, scenes, code: [color(1, "#ff0000"), broken], libraries: ["gsap"], preset, duration: 4, fps: 30 }),
      { duration: 4, fps: 30, ...preset },
    );
    try {
      const r = await captureFrames({ html, ...preset, fps: 30, duration: 4, seed: 1, allowedHosts: [] }, [0.5, 1.5, 3]);
      expect(r.meta).toEqual({ duration: 4, fps: 30, ...preset });
      const px = async (jpeg: Buffer) => {
        const { data } = await sharp(jpeg).extract({ left: 600, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
        return [data[0]!, data[1]!, data[2]!];
      };
      const [a, , c] = await Promise.all(r.frames.map((f) => px(f.jpeg)));
      expect(a![0]).toBeGreaterThan(200); // scene 1: red
      expect(c![2]).toBeGreaterThan(200); // scene 2 (its CSS still applies): blue
      expect(r.issues.some((i) => i.kind === "pageerror" && /kaboom/.test(i.message))).toBe(true);
      // Scene 1's dot moved between 0.5 s and 1.5 s.
      const dotX = async (jpeg: Buffer) => {
        const { data, info } = await sharp(jpeg).extract({ left: 0, top: 180, width: 640, height: 1 }).raw().toBuffer({ resolveWithObject: true });
        for (let x = 0; x < 640; x++) if (data[x * info.channels]! > 200 && data[x * info.channels + 1]! > 200) return x;
        return -1;
      };
      expect(await dotX(r.frames[1]!.jpeg)).toBeGreaterThan((await dotX(r.frames[0]!.jpeg)) + 100);
    } finally {
      await shutdownBrowser().catch(() => {});
    }
  }, 120_000);
});

describe("mapLimit", () => {
  it("never exceeds the limit and keeps the order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return x * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
});

// ─── writeScenesParallel ───────────────────────────────────────────────────

const PLAN5: StudioPlan = {
  title: "T",
  concept: "c",
  duration: 30,
  palette: ["#0b0d12", "#ff5a36"],
  typography: { heading: "Sora", body: "Inter" },
  beats: beatsEvery(30, 2.5),
  voiceover: [],
  musicMood: null,
  assetRequests: [],
  libraries: ["gsap"],
};

function args(over: Partial<Parameters<typeof writeScenesParallel>[0]> = {}) {
  const scenes = splitScenes(PLAN5);
  return {
    plan: PLAN5,
    preset: FORMAT_PRESETS["16:9"],
    duration: 30,
    fps: 30,
    language: "en",
    voiceover: [],
    lockedAssets: [],
    generatedAssets: [],
    brandKit: null,
    reference: null,
    scenes,
    jobId: "job1",
    libraries: PLAN5.libraries,
    ...over,
  };
}

type Deferred = { label: string; resolve: () => void; reject: (e: unknown) => void };

function foundationFor(n: number): StyleFoundation {
  return {
    ...FOUNDATION,
    scenes: Array.from({ length: n }, (_, i) => ({ index: i + 1, summary: `s${i + 1}` })),
    handoffs: Array.from({ length: n - 1 }, (_, i) => ({ after: i + 1, frame: `h${i + 1}` })),
  };
}

const sceneIndexOf = (label: string) => Number(label.split("-")[1]);

describe("writeScenesParallel", () => {
  let pending: Deferred[];
  let failing: Record<string, number>;

  beforeEach(() => {
    vi.clearAllMocks();
    pending = [];
    failing = {};
    vi.mocked(anthropic.callOpus).mockImplementation(async (a: { label?: string }) => {
      const label = a.label!;
      if (label === "style") return { json: foundationFor(5), text: "", model: "m", stopReason: "end_turn", usage: {} as never };
      if (failing[label]) {
        failing[label]!--;
        throw new anthropic.TruncatedOutputError(label, 24000);
      }
      const n = sceneIndexOf(label);
      const s = splitScenes(PLAN5)[n - 1]!;
      return { json: sceneFixture(n, s.start, s.end), text: "", model: "m", stopReason: "end_turn", usage: {} as never };
    });
  });

  const labels = () => vi.mocked(anthropic.callOpus).mock.calls.map((c) => c[0].label);

  it("style first, then every scene call starts before any resolves", async () => {
    const started: string[] = [];
    const base = vi.mocked(anthropic.callOpus).getMockImplementation()!;
    vi.mocked(anthropic.callOpus).mockImplementation(async (a) => {
      if (a.label === "style") return base(a);
      started.push(a.label!);
      await new Promise<void>((resolve, reject) => pending.push({ label: a.label!, resolve, reject }));
      return base(a);
    });
    const run = writeScenesParallel(args());
    await vi.waitFor(() => expect(started).toHaveLength(5));
    // Nothing has resolved yet and all five are in flight.
    expect(pending).toHaveLength(5);
    pending.reverse().forEach((p) => p.resolve());
    const out = await run;
    expect(out).not.toBeNull();
    expect(labels()).toEqual(["style", "scene-1", "scene-2", "scene-3", "scene-4", "scene-5"]);
    const style = vi.mocked(anthropic.callOpus).mock.calls[0]![0];
    expect(style.reason).toBe("opus_studio_style");
    expect(style.effort).toBe("medium");
    expect(style.maxTokens).toBe(12_000);
    const scene = vi.mocked(anthropic.callOpus).mock.calls[1]![0];
    expect(scene.reason).toBe("opus_studio_scene");
    expect(scene.effort).toBe("medium");
    // The document has every scene, in order.
    for (let i = 1; i <= 5; i++) expect(out!.html).toContain(`id="scene-${i}"`);
    expect(out!.timings.slowestSceneMs).toBeGreaterThanOrEqual(0);
  });

  it("caps concurrency", async () => {
    let active = 0;
    let peak = 0;
    const base = vi.mocked(anthropic.callOpus).getMockImplementation()!;
    vi.mocked(anthropic.callOpus).mockImplementation(async (a) => {
      if (a.label === "style") return base(a);
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return base(a);
    });
    expect(await writeScenesParallel(args({ concurrency: 2 }))).not.toBeNull();
    expect(peak).toBe(2);
  });

  it("scene calls share the cached prefix: same system, context and foundation blocks", async () => {
    await writeScenesParallel(args());
    const calls = vi.mocked(anthropic.callOpus).mock.calls.map((c) => c[0]);
    const [style, s1, s2] = calls;
    expect(JSON.stringify(style!.system)).toBe(JSON.stringify(s1!.system));
    const blocks = (c: typeof s1) => (c!.messages[0]!.content as { type: string; text?: string; cache?: boolean }[]);
    expect(blocks(s1)[0]).toEqual(blocks(style)[0]); // shared context, cached
    expect(blocks(s1)[0]!.cache).toBe(true);
    expect(blocks(s1)[1]).toEqual(blocks(s2)[1]); // foundation, cached
    expect(blocks(s1)[1]!.cache).toBe(true);
    expect(blocks(s1)[2]!.text).toContain("scene 1 of 5");
    expect(blocks(s2)[2]!.text).toContain("Handoff into you at");
  });

  it("a failing scene is retried once with a tighter budget", async () => {
    failing["scene-3"] = 1;
    const out = await writeScenesParallel(args());
    expect(out).not.toBeNull();
    expect(labels()).toContain("scene-3-retry");
    const retry = vi.mocked(anthropic.callOpus).mock.calls.find((c) => c[0].label === "scene-3-retry")![0];
    expect(retry.effort).toBe("low");
    const first = vi.mocked(anthropic.callOpus).mock.calls.find((c) => c[0].label === "scene-3")![0];
    const kb = (c: typeof first) => Number(JSON.stringify(c.messages).match(/under (\d+) KB/)![1]);
    expect(kb(retry)).toBeLessThan(kb(first));
  });

  it("a scene that fails twice → null (the caller falls back)", async () => {
    failing["scene-2"] = 1;
    failing["scene-2-retry"] = 1;
    expect(await writeScenesParallel(args())).toBeNull();
  });

  it("an invalid scene (syntax error) counts as a failure", async () => {
    const base = vi.mocked(anthropic.callOpus).getMockImplementation()!;
    vi.mocked(anthropic.callOpus).mockImplementation(async (a) => {
      if (a.label?.startsWith("scene-4")) return { json: { html: '<section class="scene" id="scene-4"></section>', css: "", js: "tl.to(" }, text: "" } as never;
      return base(a);
    });
    expect(await writeScenesParallel(args())).toBeNull();
    expect(labels()).toContain("scene-4-retry");
  });

  it("foundation failure → null without any scene call", async () => {
    vi.mocked(anthropic.callOpus).mockImplementation(async () => {
      throw new Error("boom");
    });
    expect(await writeScenesParallel(args())).toBeNull();
    expect(labels()).toEqual(["style"]);
  });

  it("persists the foundation and each scene, then resumes only the missing scenes", async () => {
    const files = new Map<string, string>();
    const cps: unknown[] = [];
    const store = {
      save: vi.fn(async (name: string, body: string) => {
        files.set(`runs/t/${name}`, body);
        return `runs/t/${name}`;
      }),
      load: vi.fn(async (p: string) => {
        const f = files.get(p);
        if (f === undefined) throw new Error("missing");
        return f;
      }),
    };
    failing["scene-5"] = 1;
    failing["scene-5-retry"] = 1;
    let last: import("./db").ParallelCheckpoint | null = null;
    const first = await writeScenesParallel(
      args({
        store,
        onCheckpoint: async (cp) => {
          cps.push(cp);
          last = cp;
        },
      }),
    );
    expect(first).toBeNull();
    expect(last!.stylePath).toBe("runs/t/style.json");
    expect(Object.keys(last!.scenes!).sort()).toEqual(["1", "2", "3", "4"]);
    expect(last!.split).toEqual(splitSignature(splitScenes(PLAN5)));

    vi.mocked(anthropic.callOpus).mockClear();
    const second = await writeScenesParallel(args({ store, saved: last }));
    expect(second).not.toBeNull();
    expect(labels()).toEqual(["scene-5"]);
    expect(second!.timings.resumedScenes.sort()).toEqual([1, 2, 3, 4]);
  });

  it("a checkpoint for a different split is ignored", async () => {
    const store = { save: vi.fn(async (n: string) => n), load: vi.fn(async () => JSON.stringify(foundationFor(5))) };
    await writeScenesParallel(args({ store, saved: { split: [[0, 15], [15, 30]], stylePath: "x", scenes: { "1": "y" } } }));
    expect(labels()[0]).toBe("style");
    expect(store.load).not.toHaveBeenCalled();
  });

  it("fewer than two scenes → null (single call)", async () => {
    const one = splitScenes({ duration: 15, beats: [{ start: 0, end: 15, visual: "", technique: "" }], voiceover: [] });
    expect(await writeScenesParallel(args({ scenes: one }))).toBeNull();
    expect(anthropic.callOpus).not.toHaveBeenCalled();
  });
});
