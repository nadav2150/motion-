// Sprint 0 smoke verification.
//
// Hand-author a CompositionPlan + LayoutTopology for one scene; run it
// through assemble → emit → frame-taste; write the result to disk for
// manual browser inspection.
//
// Pass condition: scene plays standalone via window.__timelines[id].play()
// (open out/sprint-0/scene_01/index.html, open dev console, confirm
// __timelines[scene_01] exists and animates).
//
// Run with: npx tsx scripts/sprint-0-smoke.ts

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assemble } from "../app/lib/hyperframes/composer/assemble";
import { emitSceneCode } from "../app/lib/hyperframes/composer/emit";
import { deriveExitState } from "../app/lib/hyperframes/composer/exit-state";
import { composeLayout } from "../app/lib/hyperframes/composer/spatial";
import { evaluateFrameTaste } from "../app/lib/hyperframes/frame-taste";
import { computeBudgets } from "../app/lib/hyperframes/budgets";
import { compose as silenceFirstCompose } from "../app/lib/hyperframes/composer/silence-first";
import type {
  CompositionPlan,
  RhythmSlot,
  Scene,
} from "../app/lib/hyperframes/types";

async function main() {
  // ── Hand-author one scene ─────────────────────────────────────────────
  const scene: Scene = {
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

  const slot: RhythmSlot = {
    energy: 0.45,
    isRest: false,
    isImpact: false,
    isRelease: false,
    cadenceShift: 0.0,
  };

  // ── Spatial topology ──────────────────────────────────────────────────
  const topology = composeLayout("asymmetricLeft", scene, slot);
  console.log(
    `[smoke] topology archetype=${topology.archetype} focalCenter=(${topology.focalCenter.x},${topology.focalCenter.y}) negSpace=${topology.negativeSpaceCoverage.toFixed(3)}`,
  );

  // ── Hand-authored CompositionPlan ─────────────────────────────────────
  // Three primitives spaced to satisfy hard laws:
  //   - first 250ms is motion-free (ES-1)
  //   - text reveal completes before any other motion (TM-3)
  //   - depthShift fires after text reveal completes
  const plan: CompositionPlan = {
    sceneId: scene.id,
    archetype: "asymmetricLeft",
    primitives: [
      {
        primitiveId: "staggerWordReveal",
        target: "#headline",
        startAt: 0.3,
        duration: 1.4,
        params: {
          staggerMs: 110,
          durationPerWordMs: 420,
          yOffsetPx: 28,
          easing: "expoOut",
        },
      },
      {
        primitiveId: "depthShift",
        target: "#stage",
        startAt: 1.9,
        duration: 1.2,
        params: {
          durationMs: 1200,
          blurDelta: 5,
          scaleDelta: 0.05,
          easing: "power3.inOut",
        },
      },
      {
        primitiveId: "focalCollapse",
        target: "#focal",
        startAt: 3.3,
        duration: 1.0,
        params: {
          durationMs: 1000,
          magnitude: 0.08,
          direction: "centerIn",
          easing: "customCubic1",
        },
      },
    ],
    beats: [0.3, 1.9, 3.3],
    carryovers: { blur: false, velocity: false, glow: false, motionDirection: false },
    isHoldScene: false,
  };

  // ── Silence-first run-through (Sprint 0 sanity) ──────────────────────
  const budgets = computeBudgets(scene, slot);
  console.log(
    `[smoke] budgets attention=${budgets.attention.toFixed(2)} motion=${budgets.motion.toFixed(2)} complexity=${budgets.complexity.toFixed(2)}`,
  );

  const silenceResult = silenceFirstCompose({
    scene,
    slot,
    candidates: plan.primitives.map((p) => ({
      primitiveId: p.primitiveId,
      params: p.params,
      target: p.target,
      startAt: p.startAt,
      duration: p.duration,
      justificationScore: 0.78, // hand-set; selector will compute in Sprint 1
      hardConstraintSatisfier: false,
    })),
    budgets,
  });
  console.log(
    `[smoke] silence-first selected ${silenceResult.selected.length}/${plan.primitives.length} (rejected: ${silenceResult.rejected.length})`,
  );

  // ── Assemble + emit ──────────────────────────────────────────────────
  const comp = assemble({ scene, topology, plan });
  console.log(
    `[smoke] assembled: applyPreRevealCompression=${comp.applyPreRevealCompression} lateRelease=${(comp.lateReleaseExtension * 1000).toFixed(0)}ms heldTail=${(comp.heldFrameTail * 1000).toFixed(0)}ms emittedDuration=${comp.emittedDuration.toFixed(3)}s`,
  );

  const files = emitSceneCode(comp);

  // ── Frame-taste evaluation ───────────────────────────────────────────
  const ft = evaluateFrameTaste(comp);
  console.log("[smoke] frame-taste:", {
    hardLawsPassed: ft.hardLawsPassed,
    easingCurveFit: ft.easingCurveFit.toFixed(3),
    opacityTimingOk: ft.opacityTimingOk,
    subSecondPacingOk: ft.subSecondPacingOk,
    frameDensityPeak: ft.frameDensityPeak,
    frameDensityMean: ft.frameDensityMean.toFixed(2),
    softWarnings: ft.softWarnings,
  });

  // ── Exit state ───────────────────────────────────────────────────────
  const exit = deriveExitState(comp);
  console.log("[smoke] exit state:", exit);

  // ── Write files ──────────────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "out", "sprint-0", scene.id);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), files.html, "utf8");
  await writeFile(path.join(outDir, "style.css"), files.css, "utf8");
  await writeFile(path.join(outDir, "animation.js"), files.js, "utf8");
  console.log(`\n[smoke] wrote scene to: ${outDir}`);
  console.log(`[smoke] open index.html in a browser; confirm window.__timelines["${scene.id}"] is registered and playing.`);

  if (!ft.hardLawsPassed) {
    console.error("[smoke] HARD LAWS FAILED — see softWarnings.");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
