// Live smoke test for the Studio PLAN call (real Anthropic API, ~$0.2/run).
//   npx tsx scripts/studio-plan-smoke.ts [runs=2]
// Runs the plan call N times so the second run shows cache_read tokens.
import "dotenv/config";
import { callOpus } from "../app/lib/studio/anthropic";
import { buildPlanMessages, PLAN_SCHEMA, PLAN_TASK, systemFor, type RawPlan } from "../app/lib/studio/prompts";
import { normalizePlan } from "../app/lib/studio/generate";
import { FORMAT_PRESETS } from "../app/lib/studio/types";

const runs = Number(process.argv[2] ?? 2);

for (let i = 1; i <= runs; i++) {
  const res = await callOpus<RawPlan>({
    system: systemFor(PLAN_TASK),
    messages: buildPlanMessages({
      prompt: "A 15-second launch teaser for 'Orbit', a calendar app that plans your week with AI. Energetic, modern, ends with 'Try Orbit free'.",
      preset: FORMAT_PRESETS["9:16"],
      targetDuration: 15,
      maxDuration: 20,
      fps: 30,
      language: "en",
      voiceover: true,
      music: true,
      brandKit: null,
      website: null,
      reference: null,
      lockedAssets: [],
      template: null,
    }),
    schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
    effort: "high",
    maxTokens: 32_000,
    reason: "opus_studio_plan",
    label: `smoke-plan-${i}`,
  });
  const plan = normalizePlan(res.json!, { cap: 20, voiceover: true, music: true });
  console.log(
    JSON.stringify(
      {
        run: i,
        model: res.model,
        stop: res.stopReason,
        usage: res.usage,
        title: plan.title,
        beats: plan.beats.length,
        voLines: plan.voiceover.length,
        musicMood: plan.musicMood,
        libraries: plan.libraries,
      },
      null,
      1,
    ),
  );
}
