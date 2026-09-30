// Parallel scene writing: the "writing" step as one foundation call plus one
// call per scene, all scenes at once, stitched into one document.
//
//   splitScenes()        timed plan → 2–6 contiguous scenes (pure)
//   scopeSceneCss()      prefix a scene's selectors with #scene-N (pure)
//   checkFoundation()    / checkSceneCode(): local checks before assembly (pure)
//   assembleDocument()   foundation + scenes → one HTML document (pure)
//   writeScenesParallel() the calls: foundation → scenes (≤ 6 at once, one
//                        retry each) → assembly. Returns null whenever the
//                        parallel path cannot finish, so the caller falls back
//                        to the single code call. Resumable via a checkpoint.
//
// STUDIO_PARALLEL_SCENES=0 turns the whole path off (generate.ts).

import { callOpus, type OpusEffort } from "./anthropic";
import type { ParallelCheckpoint } from "./db";
import { libraryHead } from "./libs";
import {
  buildSceneMessages,
  buildStyleMessages,
  documentBudgetKb,
  PARALLEL_TASK,
  SCENE_SCHEMA,
  STYLE_SCHEMA,
  systemFor,
  type ParallelContext,
  type SceneCode,
  type SceneSpec,
  type StyleFoundation,
} from "./prompts";
import type { FormatPreset, StudioLibrary, StudioPlan } from "./types";

export type { SceneCode, SceneSpec, StyleFoundation } from "./prompts";

export const parallelScenesEnabled = (): boolean => process.env.STUDIO_PARALLEL_SCENES !== "0";

export const MAX_SCENES = 6;
export const MIN_SCENES = 2;
export const SCENE_CONCURRENCY = 6;
const SECONDS_PER_SCENE = 6.5;
const STYLE_MAX_TOKENS = 12_000;
const SCENE_MAX_TOKENS = 24_000;
const PARALLEL_EFFORT: OpusEffort = "medium";

// ─── Scene split ───────────────────────────────────────────────────────────

/** How many scenes a video of this length gets (before capping at the beat count). */
export function targetSceneCount(duration: number): number {
  return Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round(duration / SECONDS_PER_SCENE)));
}

/**
 * Group the beats into contiguous scenes: about one per 5–8 s (2–6), never
 * splitting a beat, preferring cuts that do not fall inside a voiceover line.
 * Exact DP over the beat boundaries (≤ 14 beats × ≤ 6 scenes). A plan with a
 * single beat yields one scene (the caller then uses the single call).
 */
export function splitScenes(plan: Pick<StudioPlan, "beats" | "voiceover" | "duration">): SceneSpec[] {
  const beats = [...plan.beats].sort((a, b) => a.start - b.start);
  const duration = plan.duration;
  const vo = plan.voiceover ?? [];
  const n = beats.length;
  const k = Math.min(targetSceneCount(duration), n);
  const make = (index: number, from: number, to: number): SceneSpec => {
    const start = from === 0 ? 0 : beats[from]!.start;
    const end = to === n ? duration : beats[to - 1]!.end;
    const last = to === n;
    return {
      index,
      start,
      end,
      beats: beats.slice(from, to),
      voLines: vo.filter((l) => l.start >= start - 1e-6 && (last ? l.start <= end : l.start < end - 1e-6)),
    };
  };
  if (n === 0) return [];
  if (k <= 1) return [make(1, 0, n)];

  const ideal = duration / k;
  const startAt = (i: number) => (i === 0 ? 0 : beats[i]!.start);
  const endAt = (j: number) => (j === n ? duration : beats[j - 1]!.end);
  // A cut inside a voiceover line splits a sentence between two scenes.
  const cutPenalty = (j: number): number => {
    if (j === 0 || j === n) return 0;
    const t = beats[j]!.start;
    return vo.some((l) => l.start < t - 0.05 && l.end > t + 0.05) ? 4 : 0;
  };
  const groupCost = (i: number, j: number) => ((endAt(j) - startAt(i) - ideal) / ideal) ** 2;

  // dp[s][j]: best cost covering beats [0, j) with s scenes.
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(INF));
  const from: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
  dp[0]![0] = 0;
  for (let s = 1; s <= k; s++) {
    for (let j = s; j <= n; j++) {
      for (let i = s - 1; i < j; i++) {
        if (dp[s - 1]![i] === INF) continue;
        const c = dp[s - 1]![i]! + groupCost(i, j) + cutPenalty(i);
        if (c < dp[s]![j]!) {
          dp[s]![j] = c;
          from[s]![j] = i;
        }
      }
    }
  }
  const bounds: number[] = [n];
  for (let s = k, j = n; s > 0; s--) {
    j = from[s]![j]!;
    bounds.unshift(j);
  }
  const scenes: SceneSpec[] = [];
  for (let s = 0; s < k; s++) scenes.push(make(s + 1, bounds[s]!, bounds[s + 1]!));
  return scenes;
}

export function splitSignature(scenes: SceneSpec[]): [number, number][] {
  return scenes.map((s) => [round3(s.start), round3(s.end)]);
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** The scene's share of the document size budget (KB), at least 6. */
export function sceneBudgetKb(scene: Pick<SceneSpec, "start" | "end">, duration: number): number {
  const share = (scene.end - scene.start) / Math.max(1e-6, duration);
  return Math.max(6, Math.round(documentBudgetKb(duration) * share));
}

function sceneMaxTokens(scene: SceneSpec, scenes: SceneSpec[]): number {
  const avg = scenes.reduce((a, s) => a + (s.end - s.start), 0) / Math.max(1, scenes.length);
  return Math.max(16_000, Math.min(32_000, Math.round((SCENE_MAX_TOKENS * (scene.end - scene.start)) / Math.max(1e-6, avg))));
}

// ─── Local checks ──────────────────────────────────────────────────────────

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => unknown;

/** Syntax check without running anything (V8, same parser as the renderer). */
export function jsSyntaxError(body: string, params: string[]): string | null {
  try {
    // Module scripts are strict; so is the check.
    new AsyncFunction(...params, `"use strict";\n${body}`);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function checkFoundation(f: StyleFoundation | undefined): string | null {
  if (!f || typeof f !== "object") return "no foundation";
  for (const k of ["fontsHead", "css", "helpersJs", "motionLanguage", "transitionStyle"] as const) {
    if (typeof f[k] !== "string") return `foundation.${k} missing`;
  }
  if (!Array.isArray(f.scenes) || !Array.isArray(f.handoffs)) return "foundation scenes/handoffs missing";
  const syntax = jsSyntaxError(f.helpersJs, ["V"]);
  if (syntax) return `helpersJs: ${syntax}`;
  return null;
}

/** Normalizes the scene in place of problems it can fix; returns the remaining problem, if any. */
export function checkSceneCode(code: SceneCode | undefined, index: number): { code: SceneCode; problem: string | null } {
  const empty = { html: "", css: "", js: "" };
  if (!code || typeof code !== "object") return { code: empty, problem: "no scene JSON" };
  let html = typeof code.html === "string" ? code.html.trim() : "";
  const css = typeof code.css === "string" ? code.css : "";
  const js = typeof code.js === "string" ? code.js : "";
  if (!html) return { code: { html, css, js }, problem: "empty html" };
  if (/<script\b/i.test(html)) return { code: { html, css, js }, problem: "html contains <script>" };
  const id = `scene-${index}`;
  const opener = new RegExp(`^<section\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`, "i");
  if (!opener.test(html)) {
    // Wrap a bare fragment (or a section with another id) in the scene's section.
    html = `<section class="scene" id="${id}">\n${html}\n</section>`;
  } else if (!/\bclass\s*=\s*["'][^"']*\bscene\b/i.test(html.match(opener)![0])) {
    html = html.replace(/^<section\b/i, `<section class="scene"`);
  }
  const syntax = jsSyntaxError(js, ["tl", "root", "V"]);
  if (syntax) return { code: { html, css, js }, problem: `js: ${syntax}` };
  return { code: { html, css, js }, problem: null };
}

// ─── CSS scoping ───────────────────────────────────────────────────────────

const PASS_THROUGH_AT = /^@(keyframes|-webkit-keyframes|font-face|property|counter-style|page|import|charset|layer\s*;)/i;

/**
 * Prefix every selector of a scene's CSS with #scene-N (unless it already
 * mentions it), recursing into @media / @supports / @container. Keeps a
 * sloppy `h1 { … }` from restyling the other scenes.
 */
export function scopeSceneCss(css: string, index: number): string {
  const scope = `#scene-${index}`;
  const out: string[] = [];
  let i = 0;
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open === -1) {
      const rest = src.slice(i).trim();
      if (rest) out.push(rest);
      break;
    }
    const prelude = src.slice(i, open).trim();
    // Find the matching close brace.
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      const ch = src[j]!;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    // A statement at-rule before the block (e.g. "@import x;") stays as is.
    const semi = prelude.lastIndexOf(";");
    const head = semi !== -1 ? prelude.slice(semi + 1).trim() : prelude;
    if (semi !== -1) out.push(prelude.slice(0, semi + 1));
    if (PASS_THROUGH_AT.test(head)) {
      out.push(`${head}{${body}}`);
    } else if (/^@(media|supports|container|layer)\b/i.test(head)) {
      out.push(`${head}{${scopeSceneCss(body, index)}}`);
    } else if (head.startsWith("@")) {
      out.push(`${head}{${body}}`);
    } else {
      const selectors = head
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.includes(scope) ? s : /^(html|body|:root)\b/i.test(s) ? `${scope}${s.replace(/^(html|body|:root)/i, "")}` : `${scope} ${s}`));
      out.push(`${selectors.join(",")}{${body}}`);
    }
    i = j;
  }
  return out.join("\n");
}

// ─── Assembly ──────────────────────────────────────────────────────────────

const GSAP_PLUGIN_GLOBALS = [
  "SplitText",
  "CustomEase",
  "DrawSVGPlugin",
  "MorphSVGPlugin",
  "MotionPathPlugin",
  "Flip",
  "ScrambleTextPlugin",
  "TextPlugin",
  "CustomWiggle",
  "CustomBounce",
  "EasePack",
  "Physics2DPlugin",
];

/** Only font <link>s and /studio-libs/ scripts survive from the foundation's head. */
export function sanitizeFontsHead(head: string, exclude: string): string {
  const tags: string[] = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const href = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/i.test(href) || href.startsWith("/studio-libs/")) tags.push(m[0]);
  }
  for (const m of head.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](\/studio-libs\/[^"']+)["'][^>]*>\s*<\/script>/gi)) {
    if (!exclude.includes(m[1]!)) tags.push(`<script src="${m[1]}"></script>`);
  }
  return [...new Set(tags)].join("\n");
}

const scriptSafe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
const styleSafe = (s: string) => s.replace(/<\/style/gi, "<\\/style");
const num = (n: number) => String(round3(n));

export type AssembleInput = {
  foundation: StyleFoundation;
  scenes: SceneSpec[];
  code: SceneCode[]; // same order as scenes
  libraries: StudioLibrary[];
  preset: Pick<FormatPreset, "width" | "height">;
  duration: number;
  fps: number;
  language?: string;
};

export function assembleDocument(a: AssembleInput): string {
  const { width: W, height: H } = a.preset;
  const libs: StudioLibrary[] = a.libraries.includes("gsap") ? a.libraries : ["gsap", ...a.libraries];
  const libHead = libraryHead(libs);
  const last = a.scenes[a.scenes.length - 1]!.index;
  const imports: string[] = [];
  if (libs.includes("three")) imports.push(`import * as THREE from "three";`);
  if (libs.includes("simplex-noise")) imports.push(`import { createNoise2D, createNoise3D, createNoise4D } from "simplex-noise";`);

  const css = [
    `html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}`,
    `#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}`,
    `#stage>.scene{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;visibility:hidden;box-sizing:border-box}`,
    `#stage>#scene-${a.scenes[0]!.index}{visibility:visible}`,
    "/* foundation */",
    a.foundation.css,
    ...a.scenes.map((s, i) => `/* scene ${s.index} */\n${scopeSceneCss(a.code[i]!.css, s.index)}`),
  ].join("\n");

  const sceneFns = a.scenes
    .map(
      (s, i) =>
        `  { n: ${s.index}, start: ${num(s.start)}, end: ${num(s.end)}, fn: async function (tl, root, V) {\n${scriptSafe(a.code[i]!.js)}\n  } }`,
    )
    .join(",\n");

  const script = `
${imports.join("\n")}
const V = (window.V = window.V || {});
for (const name of ${JSON.stringify(GSAP_PLUGIN_GLOBALS)}) { if (window[name]) { try { gsap.registerPlugin(window[name]); } catch (e) {} } }
const report = (label, e) => { const err = new Error(label + ": " + (e && e.message ? e.message : String(e))); if (e && e.stack) err.stack = e.stack; (self.reportError ? self.reportError(err) : console.error(err)); };
try {
${scriptSafe(a.foundation.helpersJs)}
} catch (e) { report("foundation helpers", e); }
const DURATION = ${num(a.duration)};
const tl = gsap.timeline({ paused: true });
window.__videly.timeline = tl;
const SCENES = [
${sceneFns}
];
async function build() {
  try { await document.fonts.ready; } catch (e) {}
  const pending = [];
  for (const s of SCENES) {
    const root = document.getElementById("scene-" + s.n);
    if (!root) continue;
    if (s.n !== ${a.scenes[0]!.index}) tl.set(root, { visibility: "visible" }, s.start);
    if (s.n !== ${last}) tl.set(root, { visibility: "hidden" }, s.end);
    try {
      pending.push(Promise.resolve(s.fn(tl, root, V)).catch((e) => report("scene " + s.n, e)));
    } catch (e) { report("scene " + s.n, e); }
  }
  await Promise.all(pending);
  tl.set({}, {}, DURATION);
}
window.__videly.ready = build();
`.trim();

  return [
    "<!DOCTYPE html>",
    `<html lang="${(a.language ?? "en").replace(/[^\w-]/g, "")}">`,
    "<head>",
    '<meta charset="utf-8">',
    `<script>window.__videly = { duration: ${num(a.duration)}, fps: ${a.fps}, width: ${W}, height: ${H} };</script>`,
    libHead,
    sanitizeFontsHead(a.foundation.fontsHead, libHead),
    `<style>\n${styleSafe(css)}\n</style>`,
    "</head>",
    "<body>",
    '<div id="stage">',
    ...a.code.map((c) => c.html),
    "</div>",
    `<script type="module">\n${script}\n</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

// ─── Concurrency ───────────────────────────────────────────────────────────

/** Run fn over items with at most `limit` in flight; results in input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

// ─── The parallel writer ───────────────────────────────────────────────────

export type ParallelStore = {
  save(name: string, body: string): Promise<string>; // → storage path
  load(path: string): Promise<string>;
};

export type ParallelTimings = {
  styleMs: number; // 0 when resumed
  sceneMs: Record<number, number>; // per scene (incl. its retry), resumed scenes absent
  slowestSceneMs: number;
  assemblyMs: number;
  totalMs: number;
  resumedScenes: number[];
};

export type WriteParallelArgs = ParallelContext & {
  jobId: string;
  libraries: StudioLibrary[];
  saved?: ParallelCheckpoint | null; // this run's checkpoint (resume)
  store?: ParallelStore | null; // null: no persistence (no run id)
  onCheckpoint?: (cp: ParallelCheckpoint) => Promise<void>;
  concurrency?: number;
};

export type WriteParallelResult = { html: string; timings: ParallelTimings };

const sameSplit = (a: [number, number][] | undefined, b: [number, number][]) =>
  !!a && a.length === b.length && a.every((x, i) => Math.abs(x[0] - b[i]![0]) < 1e-3 && Math.abs(x[1] - b[i]![1]) < 1e-3);

/**
 * Foundation → scenes (in parallel) → assembled document. Returns null when
 * the parallel path gives up (foundation failed, or a scene failed twice); the
 * caller then writes the video with the single code call. Never throws for a
 * model/validation problem; only the caller's own checkpoint errors are
 * swallowed with a warning.
 */
export async function writeScenesParallel(args: WriteParallelArgs): Promise<WriteParallelResult | null> {
  const t0 = Date.now();
  const tag = `[studio ${args.jobId} parallel]`;
  const scenes = args.scenes;
  if (scenes.length < MIN_SCENES) return null;
  const split = splitSignature(scenes);
  const saved = args.saved && sameSplit(args.saved.split, split) ? args.saved : null;
  let cp: ParallelCheckpoint = { split, stylePath: saved?.stylePath ?? null, scenes: { ...(saved?.scenes ?? {}) } };

  // Checkpoint writes are serialized: scenes finish concurrently.
  let chain: Promise<void> = Promise.resolve();
  const persist = (name: string, body: unknown, apply: (path: string) => void): Promise<void> => {
    const store = args.store;
    if (!store) return Promise.resolve();
    chain = chain.then(async () => {
      try {
        const path = await store.save(name, JSON.stringify(body));
        apply(path);
        await args.onCheckpoint?.(cp);
      } catch (err) {
        console.warn(`${tag} checkpoint ${name} failed:`, err instanceof Error ? err.message : err);
      }
    });
    return chain;
  };
  const loadJson = async <T>(path: string | null | undefined): Promise<T | null> => {
    if (!path || !args.store) return null;
    try {
      return JSON.parse(await args.store.load(path)) as T;
    } catch (err) {
      console.warn(`${tag} saved piece ${path} unreadable:`, err instanceof Error ? err.message : err);
      return null;
    }
  };

  const system = systemFor(PARALLEL_TASK);

  // 1. Foundation.
  let styleMs = 0;
  let foundation = await loadJson<StyleFoundation>(cp.stylePath);
  if (foundation && checkFoundation(foundation)) foundation = null;
  if (!foundation) {
    const ts = Date.now();
    try {
      const res = await callOpus<StyleFoundation>({
        system,
        messages: buildStyleMessages(args),
        schema: STYLE_SCHEMA as unknown as Record<string, unknown>,
        effort: PARALLEL_EFFORT,
        maxTokens: STYLE_MAX_TOKENS,
        reason: "opus_studio_style",
        label: "style",
      });
      const problem = checkFoundation(res.json);
      if (problem) throw new Error(problem);
      foundation = res.json!;
    } catch (err) {
      console.warn(`${tag} foundation failed, falling back to the single call:`, err instanceof Error ? err.message : err);
      return null;
    }
    styleMs = Date.now() - ts;
    cp = { ...cp, scenes: {} }; // scenes written against another foundation are void
    await persist("style.json", foundation, (p) => (cp = { ...cp, stylePath: p }));
  }
  const style = foundation;

  // 2. Scenes, all at once (≤ concurrency), one retry each.
  const code = new Array<SceneCode | null>(scenes.length).fill(null);
  const resumedScenes: number[] = [];
  await Promise.all(
    scenes.map(async (s, i) => {
      const prev = await loadJson<SceneCode>(cp.scenes?.[String(s.index)]);
      if (!prev) return;
      const checked = checkSceneCode(prev, s.index);
      if (!checked.problem) {
        code[i] = checked.code;
        resumedScenes.push(s.index);
      }
    }),
  );
  const todo = scenes.map((s, i) => ({ s, i })).filter(({ i }) => !code[i]);
  const sceneMs: Record<number, number> = {};
  let failed = false;

  const writeScene = async (s: SceneSpec, attempt: 1 | 2): Promise<SceneCode> => {
    const full = sceneBudgetKb(s, args.duration);
    const budget = attempt === 1 ? full : Math.max(5, Math.round(full * 0.6));
    const res = await callOpus<SceneCode>({
      system,
      messages: buildSceneMessages(args, style, s, budget),
      schema: SCENE_SCHEMA as unknown as Record<string, unknown>,
      effort: attempt === 1 ? PARALLEL_EFFORT : "low",
      maxTokens: sceneMaxTokens(s, scenes),
      reason: "opus_studio_scene",
      label: attempt === 1 ? `scene-${s.index}` : `scene-${s.index}-retry`,
    });
    const checked = checkSceneCode(res.json, s.index);
    if (checked.problem) throw new Error(checked.problem);
    return checked.code;
  };

  await mapLimit(todo, args.concurrency ?? SCENE_CONCURRENCY, async ({ s, i }) => {
    if (failed) return;
    const ts = Date.now();
    let result: SceneCode | null = null;
    try {
      result = await writeScene(s, 1);
    } catch (err) {
      console.warn(`${tag} scene ${s.index} failed (${err instanceof Error ? err.message : err}); retrying with a tighter budget`);
      try {
        result = await writeScene(s, 2);
      } catch (err2) {
        console.warn(`${tag} scene ${s.index} failed again:`, err2 instanceof Error ? err2.message : err2);
      }
    }
    sceneMs[s.index] = Date.now() - ts;
    if (!result) {
      failed = true;
      return;
    }
    code[i] = result;
    await persist(`scene-${s.index}.json`, result, (p) => (cp = { ...cp, scenes: { ...(cp.scenes ?? {}), [String(s.index)]: p } }));
  });
  await chain;
  if (failed || code.some((c) => !c)) {
    console.warn(`${tag} a scene could not be written; falling back to the single call`);
    return null;
  }

  // 3. Assembly.
  const ta = Date.now();
  const html = assembleDocument({
    foundation: style,
    scenes,
    code: code as SceneCode[],
    libraries: args.libraries,
    preset: args.preset,
    duration: args.duration,
    fps: args.fps,
    language: args.language,
  });
  const assemblyMs = Date.now() - ta;
  const slowestSceneMs = Math.max(0, ...Object.values(sceneMs));
  const timings: ParallelTimings = { styleMs, sceneMs, slowestSceneMs, assemblyMs, totalMs: Date.now() - t0, resumedScenes };
  console.log(
    `${tag} wrote ${scenes.length} scenes in ${(timings.totalMs / 1000).toFixed(1)}s: style=${(styleMs / 1000).toFixed(1)}s ` +
      `scenes=[${scenes.map((s) => (s.index in sceneMs ? `${s.index}:${(sceneMs[s.index]! / 1000).toFixed(1)}s` : `${s.index}:resumed`)).join(" ")}] ` +
      `slowest=${(slowestSceneMs / 1000).toFixed(1)}s assembly=${assemblyMs}ms size=${Math.round(Buffer.byteLength(html, "utf8") / 1024)}KB`,
  );
  return { html, timings };
}
