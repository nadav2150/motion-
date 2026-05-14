// Sprint 1 — render exploration harness.
//
// Generates controlled variations of one base scene by changing
// composition-plan parameters only (no architecture, no laws). Emits each
// variation into its own out/ directory so HyperFrames can render them
// independently. After this script writes the files, render each with:
//
//   npx hyperframes render out/sprint-1/<name> -o out/sprint-1/<name>/scene.mp4
//
// And extract checkpoint frames with ffmpeg (see scripts/sprint-1-render-all.ps1).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assemble } from "../app/lib/hyperframes/composer/assemble";
import { emitSceneCode } from "../app/lib/hyperframes/composer/emit";
import { composeLayout } from "../app/lib/hyperframes/composer/spatial";
import type {
  CompositionPlan,
  PrimitiveInstance,
  RhythmSlot,
  Scene,
} from "../app/lib/hyperframes/types";

// ─── Base scene (kept identical across all variations) ───────────────────

const baseScene: Scene = {
  id: "scene_01",
  duration: 5.0,
  voiceover: "Most stores look the same.",
  goal: "Establish the unifying repetition the rest of the film breaks.",
  visualConcept:
    "Off-balance composition with a single weighted typographic anchor; tension held by negative space; subtle depth field behind.",
  assets: [],
  intent: "establish_problem",
  tension: 0.62,
  cadence: "sustained",
  kinetic: "pressureBuild",
  motionDNA: {
    energy: 0.5,
    cadence: "sustained",
    continuityMode: "carry",
    transitionVector: "rightward-decay",
    motionDensity: 0.4,
  },
  compositionDNA: {
    asymmetry: 0.72,
    negativeSpace: "dominant",
    depthLayers: 4,
    focalPath: "upper-left → center-mass",
    visualCompression: 0.4,
  },
  typographyDNA: {
    revealTiming: "anticipatory",
    rhythm: "slow-paced word stagger",
    weightDistribution: "heavy headline / soft subline",
  },
  continuityDNA: {
    carryBlur: false,
    carryVelocity: false,
    carryGlow: false,
    carryMotionDirection: false,
  },
  text: {
    headline: "Most stores look the same.",
    placement: "left-anchored",
    animation: "word-by-word reveal",
  },
};

const baseSlot: RhythmSlot = {
  energy: 0.45,
  isRest: false,
  isImpact: false,
  isRelease: false,
  cadenceShift: 0,
};

// ─── Primitive presets ───────────────────────────────────────────────────

function P_staggerWordReveal(startAt: number): PrimitiveInstance {
  return {
    primitiveId: "staggerWordReveal",
    target: "#headline",
    startAt,
    duration: 1.4,
    params: {
      staggerMs: 110,
      durationPerWordMs: 420,
      yOffsetPx: 28,
      easing: "expoOut",
    },
  };
}

function P_depthShift(startAt: number): PrimitiveInstance {
  return {
    primitiveId: "depthShift",
    target: "#stage",
    startAt,
    duration: 1.2,
    params: {
      durationMs: 1200,
      blurDelta: 5,
      scaleDelta: 0.05,
      easing: "power3.inOut",
    },
  };
}

function P_focalCollapse(startAt: number): PrimitiveInstance {
  return {
    primitiveId: "focalCollapse",
    target: "#focal",
    startAt,
    duration: 1.0,
    params: {
      durationMs: 1000,
      magnitude: 0.08,
      direction: "centerIn",
      easing: "customCubic1",
    },
  };
}

// ─── Variation specs ─────────────────────────────────────────────────────
//
// Batch 1 — Motion restraint. How much motion does the scene actually need?
// Hypothesis: silence-first means less is more, but the limit is unknown.

type Variation = {
  name: string;
  hypothesis: string;
  scene: Scene;
  primitives: PrimitiveInstance[];
  isHoldScene?: boolean;
  /** Strip all satellite + depth-layer children from topology before assemble. */
  stripSatellites?: boolean;
  /** CSS appended to the emitted style.css (cosmetic; no architecture impact). */
  cssAppend?: string;
};

const variations: Variation[] = [
  {
    name: "v01_silence_only",
    hypothesis:
      "Text alone (no depth, no focal). Silence-first taken to its absolute. " +
      "Tell 1 still fires around the staggerWordReveal. Predicts: the most inevitable read; risks feeling empty.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(0.3)],
  },
  {
    name: "v02_text_plus_depth",
    hypothesis:
      "Text + depth (no focalCollapse outro). The depth field activates the satellites mid-scene; nothing collapses them at the end. Predicts: settles into a stable held composition rather than a converging one.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(0.3), P_depthShift(1.9)],
  },
  {
    name: "v03_full_baseline",
    hypothesis: "Current full baseline — all three primitives. Reference point.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(0.3), P_depthShift(1.9), P_focalCollapse(3.3)],
  },
  {
    name: "v04_text_late",
    hypothesis:
      "Text entry pushed to 1.0s instead of 0.3s. Longer earned silence before reveal. " +
      "Predicts: more anticipation; Tell 1's compression has more room to register; risks feeling like a delay rather than tension.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(1.0), P_depthShift(2.6), P_focalCollapse(3.7)],
  },
  {
    name: "v05_text_very_late",
    hypothesis:
      "Text at 1.8s. Uncomfortable wait. Predicts: either inevitability lands hard, or feels broken. Tests the upper edge of silence-first.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(1.8), P_focalCollapse(3.4)],
  },
  {
    name: "v06_text_only_held",
    hypothesis:
      "Text alone + this scene is the hold-scene. Held-frame tail (200–400ms) is appended at end. " +
      "Tests whether the hold-frame rule itself creates presence when no other motion competes.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(0.6)],
    isHoldScene: true,
  },

  // ─── Batch 2 — Subtraction past satellites ─────────────────────────────
  // Batch 1 motion-trails showed satellites as decorative noise. Strip them
  // and test what the scene becomes when only the headline carries weight.

  {
    name: "v07_no_satellites",
    hypothesis:
      "Pure text on black. Satellites removed from the topology. Tell 1 finds no targets and silently no-ops — silence-first taken to its limit. Predicts: maximum presence per pixel; risks feeling like a slide.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(0.3)],
    stripSatellites: true,
  },
  {
    name: "v08_no_satellites_late",
    hypothesis:
      "v07 + text entry pushed to 1.0s. Two seconds of negative space before the only event. Tests whether silence-first scales with no competing elements.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(1.0)],
    stripSatellites: true,
  },
  {
    name: "v09_huge_headline",
    hypothesis:
      "v07 with the headline pushed to 160 px (from 96 px). Compositional weight via typography size, not via satellite count. Tests whether the scene can carry a single oversized statement without supporting elements.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(0.4)],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v10_huge_headline_late",
    hypothesis:
      "v09 + late entry. Combines the strongest single image (huge type on black) with the strongest anticipation (~1s of pre-reveal silence).",
    scene: baseScene,
    primitives: [P_staggerWordReveal(1.0)],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },

  // ─── Batch 3 — Retime the envelope ──────────────────────────────────────
  // v10 time-strip showed 2.7s of identical frames at the end. The scene is
  // too long for what happens inside it. Probe whether shortening (or
  // holding) restores presence.

  {
    name: "v11_tight_3s",
    hypothesis:
      "v10 structure compressed to 3s. Text at 1.0, reveal completes ~2.4s, Tell 2 trails into 3.119s. " +
      "Predicts: the reveal IS the scene; Tell 2 finally has room to land because there is no static buffer to absorb it.",
    scene: { ...baseScene, duration: 3.0 },
    primitives: [P_staggerWordReveal(1.0)],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v12_breath_4s",
    hypothesis:
      "v10 structure at 4s. Text at 1.0, settles at ~2.4s, ~1.6s of stillness before end. Between tight (v11) and long (v10).",
    scene: { ...baseScene, duration: 4.0 },
    primitives: [P_staggerWordReveal(1.0)],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v13_held_long",
    hypothesis:
      "v10 marked as hold-scene. The trailing stillness becomes Intentional Imperfection: the held frame is meant to over-stay. Predicts: stillness reads as deliberate weight rather than as scene-overrun.",
    scene: baseScene,
    primitives: [P_staggerWordReveal(1.0)],
    stripSatellites: true,
    isHoldScene: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v14_breathe_in_3s_early",
    hypothesis:
      "Tight 3s envelope with text at 0.4s (less anticipation, more breathing-after). Tests whether anticipation or settle-time matters more for presence.",
    scene: { ...baseScene, duration: 3.0 },
    primitives: [P_staggerWordReveal(0.4)],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },

  // ─── Batch 4 — Make Tell 2 the only stillness ───────────────────────────
  // v11 still has 1.1s of static frame at the end. Retime so the reveal
  // completes near scene-end; Tell 2's 119ms tail then becomes the only
  // post-reveal stillness in the scene. Tests whether Tell 2 ever reads
  // as presence when it isn't absorbed by surrounding hold.
  // Also probes two non-expoOut easings on the same envelope.

  {
    name: "v15_tail_only",
    hypothesis:
      "3s scene; text-entry at 1.6s so reveal completes ≈ scene-end. Tell 2's 119ms is the ONLY post-reveal stillness. " +
      "If Tell 2 is ever to register as presence, it must register here.",
    scene: { ...baseScene, duration: 3.0 },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.6,
        duration: 1.4,
        params: {
          staggerMs: 110,
          durationPerWordMs: 280,
          yOffsetPx: 28,
          easing: "expoOut",
        },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v16_tail_only_held",
    hypothesis:
      "v15 + hold-scene flag. Tell 2 (119ms) + held-frame tail (~300ms) = ~400ms of intentional trailing presence after a reveal that lands at scene-end. Tests whether the *combination* of Tell 2 and the Intentional Imperfection held-frame rule creates the 'stay in the room' feeling neither does alone.",
    scene: { ...baseScene, duration: 3.0 },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.6,
        duration: 1.4,
        params: {
          staggerMs: 110,
          durationPerWordMs: 280,
          yOffsetPx: 28,
          easing: "expoOut",
        },
      },
    ],
    stripSatellites: true,
    isHoldScene: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v17_easing_power3",
    hypothesis:
      "v11 with power3.inOut on the reveal instead of expoOut. expoOut snaps in fast and settles; power3.inOut eases both ends. Predicts: less assertive arrival; words feel like they 'wake up' rather than 'snap in.'",
    scene: { ...baseScene, duration: 3.0 },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.0,
        duration: 1.4,
        params: {
          staggerMs: 110,
          durationPerWordMs: 420,
          yOffsetPx: 28,
          easing: "power3.inOut",
        },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v18_easing_cubic1",
    hypothesis:
      "v11 with customCubic1 (back-out with slight overshoot). Predicts: arrival has a *bounce* — risks gimmick territory. The kineticAffinity for pressureBuild is low (0.4 vs expoOut's match), so this should *feel* off — testing the boundary.",
    scene: { ...baseScene, duration: 3.0 },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.0,
        duration: 1.4,
        params: {
          staggerMs: 110,
          durationPerWordMs: 420,
          yOffsetPx: 28,
          easing: "customCubic1",
        },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },

  // ─── Batch 5 — Generalize v11 across headlines ─────────────────────────
  // Same envelope (3s, late text at 1.0s, 160px, no satellites, expoOut).
  // Only the COPY changes. Tests whether the shape is a language or a lucky
  // scene. If the envelope survives an aggressive copy, a soft emotional
  // copy, a question, and a command, v11 starts to be a *form*.

  ...["Yours doesn't.", "Stop blending in.", "Something is different about yours.", "What if yours wasn't?", "Make it impossible to scroll past."].map((text, idx): Variation => ({
    name: `v${19 + idx}_copy_${["short", "aggressive", "emotional", "question", "imperative"][idx]}`,
    hypothesis: `v11 envelope, copy="${text}". Tests whether the shape carries non-baseline content.`,
    scene: { ...baseScene, duration: 3.0, text: { ...baseScene.text, headline: text } },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.0,
        duration: 1.4,
        params: { staggerMs: 110, durationPerWordMs: 420, yOffsetPx: 28, easing: "expoOut" },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  })),

  // ─── Batch 6 — Test v11 envelope across kinetics ───────────────────────
  // Same envelope, same baseline copy. Kinetic changes drive easing
  // selection (per the easing.ts kineticFit table) and one composition
  // tweak per kinetic. breathingHold is structural: hard-law says zero
  // primitives.

  {
    name: "v24_kinetic_releaseDecay",
    hypothesis:
      "releaseDecay on v11 envelope. Easing: power3.inOut (the kinetic's best fit). Predicts: arrival feels less assertive, more like a thought completing than starting.",
    scene: { ...baseScene, duration: 3.0, kinetic: "releaseDecay" },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.0,
        duration: 1.4,
        params: { staggerMs: 110, durationPerWordMs: 420, yOffsetPx: 28, easing: "power3.inOut" },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v25_kinetic_unstableGravity",
    hypothesis:
      "unstableGravity on v11 envelope. Easing: customCubic1 (best fit). Predicts: words arrive with a slight overshoot — anticipatory bounce. May break the v11 feel; testing the breakage.",
    scene: { ...baseScene, duration: 3.0, kinetic: "unstableGravity" },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.0,
        duration: 1.4,
        params: { staggerMs: 110, durationPerWordMs: 420, yOffsetPx: 32, easing: "customCubic1" },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
  {
    name: "v26_kinetic_breathingHold",
    hypothesis:
      "breathingHold on v11 envelope. Hard law: zero primitives. The scene is a 3s static composition with Tell 2 + held tail. Pure stillness. Tests whether silence-first read as composition or as nothing.",
    scene: { ...baseScene, duration: 3.0, kinetic: "breathingHold", text: { ...baseScene.text, headline: "Most stores look the same." } },
    primitives: [],
    stripSatellites: true,
    isHoldScene: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
.mg-headline .mg-word, .mg-headline { opacity: 1 !important; }
`.trim(),
  },
  // ─── Anti-v11 — contrast as identity test ───────────────────────────────
  // Not a refinement of v11. A fundamentally different emotional shape
  // built from the same primitives, architecture, and philosophy.
  //
  // Every dimension is pushed away from v11:
  //   - intent:     establish_problem  →  release
  //   - kinetic:    pressureBuild      →  releaseDecay
  //   - tension:    0.62               →  0.25
  //   - cadence:    sustained          →  legato
  //   - copy:       "Most stores look the same." (problem statement, 5 words, hard period)
  //                 →  "Then it opens." (affirmation, 3 words, opening verb)
  //   - entry:      late (1.0s)        →  early (0.4s)
  //   - reveal:     fast (420ms/word, 110ms stagger)  →  slow (600ms/word, 140ms stagger)
  //   - yOffset:    28px (assertive)   →  14px (soft drift)
  //   - easing:     expoOut (snap-in)  →  power3.inOut (smooth both ends)
  //   - duration:   3.0s               →  3.5s (more breathing room after reveal)
  //   - headline:   160px (commanding) →  120px (calm-confident)
  //
  // Question: can MotionGlass survive this contradiction while still
  // feeling authored by the same system? Watch v11 then v28 back-to-back.
  {
    name: "v28_anti_v11",
    hypothesis:
      "The opposite emotional shape from v11. Release, openness, calm inevitability, early soft reveal. Same architecture and primitives — different temporal feel.",
    scene: {
      ...baseScene,
      duration: 3.5,
      intent: "release",
      tension: 0.25,
      cadence: "legato",
      kinetic: "releaseDecay",
      text: { ...baseScene.text, headline: "Then it opens." },
    },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 0.4,
        duration: 1.6,
        params: {
          staggerMs: 140,
          durationPerWordMs: 600,
          yOffsetPx: 14,
          easing: "power3.inOut",
        },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 120px; line-height: 1.05; letter-spacing: -0.02em; font-weight: 500; }
`.trim(),
  },

  {
    name: "v27_kinetic_lockedMomentum",
    hypothesis:
      "lockedMomentum on v11 envelope. All parameters identical to v11; only the kinetic metadata field changes. NEGATIVE CONTROL: today the kinetic field is metadata only (selector that reads it isn't built yet), so v27 should be pixel-identical to v11. Confirms which kinetic v11 implicitly already lives in.",
    scene: { ...baseScene, duration: 3.0, kinetic: "lockedMomentum" },
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 1.0,
        duration: 1.4,
        params: { staggerMs: 110, durationPerWordMs: 420, yOffsetPx: 28, easing: "expoOut" },
      },
    ],
    stripSatellites: true,
    cssAppend: `
.mg-headline { font-size: 160px; line-height: 1.0; letter-spacing: -0.03em; font-weight: 600; }
`.trim(),
  },
];

// ─── Build & write all variations ────────────────────────────────────────

async function main() {
  const outRoot = path.join(process.cwd(), "out", "sprint-1");
  const manifest: {
    name: string;
    hypothesis: string;
    primitives: string[];
    emittedDuration: number;
    applyPreRevealCompression: boolean;
    lateReleaseExtension: number;
    heldFrameTail: number;
    dir: string;
  }[] = [];

  for (const v of variations) {
    const topology = composeLayout("asymmetricLeft", v.scene, baseSlot);

    if (v.stripSatellites) {
      // Exploration-layer subtraction: remove satellites + depth layers from
      // the topology after spatial composition. No architecture change —
      // just trimming the data before assemble.
      topology.root.children = topology.root.children.filter(
        (c) =>
          !c.classList.includes("mg-satellite") &&
          !c.classList.includes("mg-depth-layer"),
      );
    }

    const plan: CompositionPlan = {
      sceneId: v.scene.id,
      archetype: "asymmetricLeft",
      primitives: v.primitives,
      beats: v.primitives.map((p) => p.startAt),
      carryovers: { blur: false, velocity: false, glow: false, motionDirection: false },
      isHoldScene: v.isHoldScene === true,
    };

    const comp = assemble({ scene: v.scene, topology, plan });
    const files = emitSceneCode(comp);

    if (v.cssAppend) {
      files.css = files.css + "\n\n/* variation override */\n" + v.cssAppend;
    }

    const dir = path.join(outRoot, v.name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), files.html, "utf8");
    await writeFile(path.join(dir, "style.css"), files.css, "utf8");
    await writeFile(path.join(dir, "animation.js"), files.js, "utf8");

    const entry = {
      name: v.name,
      hypothesis: v.hypothesis,
      primitives: v.primitives.map(
        (p) => `${p.primitiveId}@${p.startAt}s(${p.duration}s)`,
      ),
      emittedDuration: comp.emittedDuration,
      applyPreRevealCompression: comp.applyPreRevealCompression,
      lateReleaseExtension: comp.lateReleaseExtension,
      heldFrameTail: comp.heldFrameTail,
      dir,
    };
    manifest.push(entry);

    console.log(
      `[${v.name}] primitives=${entry.primitives.join(", ")} emittedDuration=${comp.emittedDuration.toFixed(3)}s tell2=${(comp.lateReleaseExtension * 1000).toFixed(0)}ms hold=${(comp.heldFrameTail * 1000).toFixed(0)}ms`,
    );
  }

  await writeFile(
    path.join(outRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  console.log(`\nWrote ${variations.length} variations to ${outRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
