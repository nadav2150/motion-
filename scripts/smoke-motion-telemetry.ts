// End-to-end smoke for motion telemetry: real Chromium + real GSAP timeline.
//
// What it proves:
//   captureSceneMotionTelemetry actually drives window.__timelines seeks and
//   reads rendered rects/opacities, and computeMotionMetrics + telemetryGates
//   detect (a) linear/mechanical motion and (b) a pop-in from a live page —
//   not just from synthetic unit-test samples.
//
// The fixture timeline:
//   • #title tweens x 0→800 over 3s with ease:"none", starting at t=0.2s
//     → exercises the boundary-trim path (tween boundaries land mid-interval)
//     → mechanical detection expected
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
  // 0.2s start offset deliberately exercises the boundary-trim path: tween
  // boundaries land mid-interval, producing partial-displacement outliers at
  // run edges that would inflate CV above 0.15 without trimming.
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
  if (!gates.some((g) => g.gate === "pop_in" && g.description.includes("h2#pop"))) {
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
