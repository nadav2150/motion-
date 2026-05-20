// Metering wrapper. Wraps an upstream API call, records the actual credit
// cost to the ledger, returns the result. Designed to be sprinkled at every
// external-API call site without invading the wrapped function's signature.
//
// Phase A: log only, never throws on accounting failure (don't break a job
// because a ledger insert hiccuped — log loudly and continue).
// Phase B+: same code, but credits_balance is already debited via the
// reservation upstream, so this is still log-only against the ledger.
//
// Usage:
//   const result = await meter(
//     () => runImage({ model, prompt }),
//     {
//       ctx: meterContext,
//       reason: "replicate_image",
//       credits: ({ model }) => CREDITS_PER_REPLICATE_IMAGE,
//       meta: () => ({ model, prompt: prompt.slice(0, 80) }),
//     }
//   );

import { AsyncLocalStorage } from "node:async_hooks";
import { recordConsumption, type ConsumptionReason } from "./credits";

export type MeterContext = {
  userId: string | null;
  jobId: string | null;
  // Plan tier captured once at job start. Optional — defaults to null when
  // unknown (scripts, smoke tests). Surfaced to PostHog as an event property
  // so cost dashboards can segment by plan without joining user_billing.
  planTier?: string | null;
};

// Thread through any function — when no real user/job is in scope (e.g.
// scripts, smoke tests), pass NULL_METER_CONTEXT and the meter helpers
// become no-ops.
export const NULL_METER_CONTEXT: MeterContext = { userId: null, jobId: null, planTier: null };

// Request-scoped meter context. runJob() wraps its body with
// withMeterContext({ userId, jobId }, () => ...). Any meter() call inside
// that scope — at any nesting depth, in any library function — reads the
// context automatically. No need to thread userId/jobId through every
// library signature.
const meterAls = new AsyncLocalStorage<MeterContext>();

export function withMeterContext<T>(ctx: MeterContext, fn: () => Promise<T>): Promise<T> {
  return meterAls.run(ctx, fn);
}

export function getMeterContext(): MeterContext {
  return meterAls.getStore() ?? NULL_METER_CONTEXT;
}

export type MeterOptions<T> = {
  // Explicit context override. Omit to use the AsyncLocalStorage-backed
  // ambient context set by withMeterContext().
  ctx?: MeterContext;
  reason: ConsumptionReason;
  // Compute credit cost AFTER the call returns. Receives the result so
  // token-count / unit-count meters can compute exact cost from usage.
  credits: (result: T) => number;
  // Optional extra metadata stamped on the ledger row (model name, tokens,
  // duration, etc.). Captured after success.
  meta?: (result: T) => Record<string, unknown>;
};

export async function meter<T>(
  call: () => Promise<T>,
  options: MeterOptions<T>,
): Promise<T> {
  const result = await call();
  const ctx = options.ctx ?? getMeterContext();
  // No real context (script, smoke test, billing disabled before user_billing
  // backfill ran) → skip ledger write. The call still ran; we just didn't
  // bill anyone.
  if (!ctx.userId) return result;
  let credits = 0;
  try {
    credits = Math.max(0, Math.ceil(options.credits(result)));
  } catch (err) {
    console.error(
      `[billing] meter credits() threw for ${options.reason}:`,
      err instanceof Error ? err.message : err,
    );
    return result;
  }
  if (credits <= 0) return result;
  let metaPayload: Record<string, unknown> | undefined;
  if (options.meta) {
    try {
      metaPayload = options.meta(result);
    } catch {
      metaPayload = undefined;
    }
  }
  void recordConsumption({
    userId: ctx.userId,
    jobId: ctx.jobId,
    amount: credits,
    reason: options.reason,
    meta: metaPayload,
  });
  return result;
}

// Per-unit credit costs at the meter level. These are deliberately LARGER
// than the per-scene estimator costs in estimate.ts — the estimator rolls up
// multiple API calls per scene into one number, but the meter sees each call
// individually. Sum of meter charges for a typical scene should land at or
// below the estimator's CREDITS_PER_SCENE_BASE (= 120).
//
// Calibrated against the per-job cost table in the PLAN. Tune after Phase A
// verification — see Task #8.

// 1 credit = $0.001 internal upstream cost.

// Replicate Ideogram v3 quality ≈ $0.08/image → 80 credits.
export const CREDITS_REPLICATE_IMAGE = 80;
// Replicate Kling video ≈ $0.50/5s clip → 500 credits. Not in default flow
// but priced for when video render is enabled per scene.
export const CREDITS_REPLICATE_VIDEO = 500;
// gpt-4o vision validation ≈ $0.0015/call → 2 credits (rounded up).
export const CREDITS_GPT4O_VISION = 2;
// ElevenLabs eleven_multilingual_v2 ≈ $0.10 per ~3s narration → 100 credits.
// Caller may scale by actual character count if available.
export const CREDITS_ELEVENLABS_TTS = 100;
// Freesound search: free API but rate-limited. Treat as ~1 credit per call
// to discourage hammering.
export const CREDITS_FREESOUND_SEARCH = 1;
// Jamendo search: free API. ~1 credit per call.
export const CREDITS_JAMENDO_SEARCH = 1;

// Anthropic Opus 4.7 — credit per 1k tokens. Input: $15/M ≈ 15 credits/k.
// Output: $75/M ≈ 75 credits/k. Caller passes usage.input_tokens /
// usage.output_tokens from the API response.
export function creditsForOpus(input: { input_tokens?: number; output_tokens?: number }): number {
  const inK = (input.input_tokens ?? 0) / 1000;
  const outK = (input.output_tokens ?? 0) / 1000;
  return Math.ceil(inK * 15 + outK * 75);
}

// Anthropic Sonnet 4.6 (vision critique) — $3/M input, $15/M output.
export function creditsForSonnet(input: { input_tokens?: number; output_tokens?: number }): number {
  const inK = (input.input_tokens ?? 0) / 1000;
  const outK = (input.output_tokens ?? 0) / 1000;
  return Math.ceil(inK * 3 + outK * 15);
}

// USD-micros helpers parallel to the credit helpers above. Same usage shape;
// callers compute both side-by-side at each Anthropic call site so PostHog
// gets real dollars and the ledger keeps its rounded credit value.
import {
  usdMicrosForAnthropic,
} from "./pricing-usd";

export function usdMicrosForOpus(usage: { input_tokens?: number; output_tokens?: number }): number {
  return usdMicrosForAnthropic("claude-opus-4-7", usage.input_tokens ?? 0, usage.output_tokens ?? 0);
}

export function usdMicrosForSonnet(usage: { input_tokens?: number; output_tokens?: number }): number {
  return usdMicrosForAnthropic("claude-sonnet-4-6", usage.input_tokens ?? 0, usage.output_tokens ?? 0);
}
