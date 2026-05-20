// Smoke test for the per-call cost telemetry pipeline.
//
// What it does:
//   1. Loads .env / .env.local (so POSTHOG_API_KEY is picked up the same way
//      runJob() picks it up at runtime).
//   2. Fires three representative model_cost events via the production code
//      path (`recordModelCost`), wrapped in a withMeterContext block so the
//      ambient user_id/job_id/plan_tier are populated.
//   3. Flushes PostHog so events ship before the script exits.
//
// What it does NOT do:
//   • Write to Supabase. The ambient userId is a synthetic UUID — the ledger
//     insert will fail the FK check on credit_ledger.user_id (references
//     auth.users) and recordConsumption() will log the failure but won't
//     throw. That's fine: this script only verifies PostHog. End-to-end
//     Supabase verification happens via a real job run.
//
// Usage:
//   npx tsx scripts/smoke-posthog-cost.ts
//
// Then open https://us.posthog.com/project/{POSTHOG_PROJECT_ID}/activity/explore
// and look for three `model_cost` events with distinct_id = test-user-...

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { withMeterContext } from "../app/lib/billing/meter";
import { recordModelCost } from "../app/lib/billing/track-cost";
import { flushPostHog } from "../app/lib/posthog";
import {
  usdMicrosForAnthropic,
  usdMicrosForElevenLabs,
  usdMicrosForReplicateImage,
} from "../app/lib/billing/pricing-usd";

async function main(): Promise<void> {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    console.error("POSTHOG_API_KEY not set — set it in .env or .env.local first.");
    process.exit(1);
  }
  console.log(`PostHog key:    ${key.slice(0, 12)}...`);
  console.log(`PostHog host:   ${process.env.POSTHOG_HOST ?? "https://us.i.posthog.com (default)"}`);
  console.log(`PostHog project: ${process.env.POSTHOG_PROJECT_ID ?? "(unset)"}`);

  // Use a deterministic test user so repeat runs land in the same person in
  // PostHog. Real prod calls use the Supabase auth user_id.
  const testUserId = "00000000-0000-0000-0000-000000000001";
  const testJobId = `smoke-${Date.now()}`;
  const testPlan = "free";

  console.log(`\nFiring 3 model_cost events under user=${testUserId} job=${testJobId}\n`);

  await withMeterContext(
    { userId: testUserId, jobId: testJobId, planTier: testPlan },
    async () => {
      // 1. Anthropic Opus call (typical storyboard generation).
      const opusInput = 4200;
      const opusOutput = 1800;
      await recordModelCost({
        provider: "anthropic",
        model: "claude-opus-4-7",
        reason: "opus_director",
        unitKind: "tokens",
        units: opusInput + opusOutput,
        inputTokens: opusInput,
        outputTokens: opusOutput,
        costUsdMicros: usdMicrosForAnthropic("claude-opus-4-7", opusInput, opusOutput),
        latencyMs: 8400,
      });
      console.log(
        `  ✓ anthropic opus_director ($${(
          usdMicrosForAnthropic("claude-opus-4-7", opusInput, opusOutput) / 1_000_000
        ).toFixed(4)})`,
      );

      // 2. ElevenLabs TTS call (typical scene voiceover).
      const chars = 320;
      await recordModelCost({
        provider: "elevenlabs",
        model: "eleven_multilingual_v2",
        reason: "elevenlabs_tts",
        unitKind: "characters",
        units: chars,
        costUsdMicros: usdMicrosForElevenLabs("eleven_multilingual_v2", chars),
        latencyMs: 2100,
        extra: { voice_id: "21m00Tcm4TlvDq8ikWAM" },
      });
      console.log(
        `  ✓ elevenlabs elevenlabs_tts ($${(
          usdMicrosForElevenLabs("eleven_multilingual_v2", chars) / 1_000_000
        ).toFixed(4)})`,
      );

      // 3. Replicate image (Ideogram v3 quality).
      const imageModel = "ideogram-ai/ideogram-v3-quality";
      await recordModelCost({
        provider: "replicate_image",
        model: imageModel,
        reason: "replicate_image",
        unitKind: "calls",
        units: 1,
        costUsdMicros: usdMicrosForReplicateImage(imageModel),
        latencyMs: 14300,
      });
      console.log(
        `  ✓ replicate_image replicate_image ($${(
          usdMicrosForReplicateImage(imageModel) / 1_000_000
        ).toFixed(4)})`,
      );
    },
  );

  console.log("\nFlushing PostHog buffer...");
  await flushPostHog();
  console.log("Done.\n");

  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (projectId) {
    const host = (process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace("//us.i.", "//us.");
    console.log(`Verify at: ${host}/project/${projectId}/activity/explore`);
    console.log(`Filter on: event = "model_cost" AND distinct_id = "${testUserId}"`);
  } else {
    console.log("Set POSTHOG_PROJECT_ID to see a direct link to verify.");
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
