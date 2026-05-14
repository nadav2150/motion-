// Verify the per-scene IIFE wrapper produced by buildFilmSkeleton offsets
// position args by the scene's start time. Builds a 2-scene comp with synthetic
// FilmFills and runs the resulting <script> against a tiny GSAP stub so we can
// see what positions actually land on the master timeline.
//
// Run: npx tsx scripts/verify-scene-offset.ts

import vm from "node:vm";
import {
  buildFilmSkeleton,
  type FilmFills,
  type Storyboard,
  type VisualIdentity,
} from "../app/lib/hyperframes/llm-director";

const identity: VisualIdentity = {
  scriptAnalysis: "verify",
  paletteName: "Verify",
  background: "#000",
  accents: ["#fff", "#ccc", "#999"],
  ink: "#fff",
  inkMuted: "rgba(255,255,255,0.6)",
  headlineFont: "Inter",
  bodyFont: "Inter",
  monoFont: "JetBrains Mono",
  motionLanguage: "editorial",
  signatureMove: "n/a",
  assetPolicy: "type-only",
  imageKeyword: "",
  language: "en",
  textDirection: "ltr",
};

const storyboard: Storyboard = {
  title: "Verify",
  visualIdentity: identity,
  scenes: [
    { id: "scene_01", copy: "one", durationSeconds: 5, sceneConcept: "x", motionHook: "y" },
    { id: "scene_02", copy: "two", durationSeconds: 7, sceneConcept: "x", motionHook: "y" },
    { id: "scene_03", copy: "three", durationSeconds: 4, sceneConcept: "x", motionHook: "y" },
  ],
};

const fills: FilmFills = {
  cssVariables: {},
  scenes: [
    {
      id: "s1",
      contentHtml: "<h1>one</h1>",
      sceneCss: "",
      transitionIn: "hard_cut",
      timeline: `tl.from('#s1 h1', { opacity: 0 }, 0.1);tl.to('#s1 h1', { y: -10 }, 0.5);`,
    },
    {
      id: "s2",
      contentHtml: "<h1>two</h1>",
      sceneCss: "",
      transitionIn: "hard_cut",
      timeline: `tl.from('#s2 h1', { opacity: 0 }, 0.2);tl.to('#s2 h1', { y: -10 }, 0.5);tl.set({}, {}, 7);`,
    },
    {
      id: "s3",
      contentHtml: "<h1>three</h1>",
      sceneCss: "",
      transitionIn: "hard_cut",
      timeline: `tl.from('#s3 h1', { opacity: 0 }, 0.3);`,
    },
  ],
};

const html = buildFilmSkeleton(storyboard, identity, fills);

// Extract <script> body.
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  throw new Error("could not find <script> in skeleton output");
}
const scriptBody = m[1]!;

// Run the script against a GSAP stub that records every position arg.
const calls: { method: string; target: unknown; pos: unknown }[] = [];
const tl: Record<string, (...args: unknown[]) => unknown> = {};
const make = (name: string, posIndex: number) => {
  tl[name] = (...args: unknown[]) => {
    const pos = args[posIndex];
    const target = args[0];
    calls.push({ method: name, target, pos });
    return tl;
  };
};
make("to", 2);
make("from", 2);
make("fromTo", 3);
make("set", 2);

const ctx = {
  gsap: { timeline: () => tl },
  document: { readyState: "complete", addEventListener: () => {} },
  window: {} as Record<string, unknown>,
};
(ctx.window as Record<string, unknown>).__timelines = {};

vm.createContext(ctx);
// Strip the auto-play at the bottom so it doesn't throw when tl.play is missing.
const safeScript = scriptBody.replace(/tl\.play\(\);?/g, "/* tl.play stub */");
vm.runInContext(safeScript, ctx);

const sceneFilter = (sid: string) =>
  calls.filter((c) => typeof c.target === "string" && (c.target as string).includes(`#${sid}`));

console.log("\n=== Calls landing on master timeline ===");
for (const sid of ["s1", "s2", "s3"]) {
  console.log(`\n[${sid}] expected offset = ${{ s1: 0, s2: 5, s3: 12 }[sid]}s`);
  for (const c of sceneFilter(sid)) {
    console.log(`  ${c.method.padEnd(7)} ${c.target}  pos=${c.pos}`);
  }
}

const s2Calls = sceneFilter("s2");
const allShifted = s2Calls.every((c) => typeof c.pos === "number" && c.pos >= 5);
console.log(allShifted
  ? `\n✓ Scene 2 positions all >= 5 — offset wrapper working.`
  : `\n✗ Scene 2 positions NOT all shifted by 5 — wrapper not applied.`);
