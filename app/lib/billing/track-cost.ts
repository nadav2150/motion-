// Single entry point for cost telemetry. Every external-API call site calls
// recordModelCost() with provider/model/units/USD-micros. This helper:
//   1. Appends a typed consume row to credit_ledger (existing path).
//   2. Captures a `model_cost` PostHog event tagged with the same data so
//      analytics dashboards (avg USD per job, per-provider breakdown) work
//      without joining Supabase.
//
// Wrapped in try/catch — never throws. A failed ledger insert or PostHog
// outage cannot fail a job that already burned the upstream API spend.

import {
  recordConsumption,
  type ConsumptionReason,
  type ProviderTag,
  type UnitKind,
} from "./credits";
import { getMeterContext } from "./meter";
import { microsToCredits } from "./pricing-usd";
import { getPostHog } from "../posthog";

export type RecordModelCostInput = {
  // Provider/model identification.
  provider: ProviderTag;
  model: string;
  reason: ConsumptionReason;

  // Usage. Anthropic supplies inputTokens / outputTokens; everything else uses
  // units + unitKind (chars, calls, seconds).
  unitKind: UnitKind;
  units: number;
  inputTokens?: number;
  outputTokens?: number;

  // Real measured cost in USD micros. Credits are derived from this if not
  // explicitly provided (so call sites only need to compute USD).
  costUsdMicros: number;
  creditsCharged?: number;

  // Wall-clock for the API call, when easily available.
  latencyMs?: number;

  // Freeform jsonb stamped on the ledger meta — voice_id, mode, cache stats, etc.
  extra?: Record<string, unknown>;
};

export async function recordModelCost(input: RecordModelCostInput): Promise<void> {
  const ctx = getMeterContext();
  // No real user context (script, smoke test) → skip both sinks.
  if (!ctx.userId) return;

  const credits = input.creditsCharged ?? microsToCredits(input.costUsdMicros);

  // 1) Supabase ledger row. Fire-and-forget; recordConsumption already
  //    swallows insert errors with console.error.
  void recordConsumption({
    userId: ctx.userId,
    jobId: ctx.jobId,
    amount: credits,
    reason: input.reason,
    provider: input.provider,
    model: input.model,
    units: input.units,
    unitKind: input.unitKind,
    costUsdMicros: input.costUsdMicros,
    meta: {
      ...(input.extra ?? {}),
      ...(input.inputTokens != null ? { input_tokens: input.inputTokens } : {}),
      ...(input.outputTokens != null ? { output_tokens: input.outputTokens } : {}),
      ...(input.latencyMs != null ? { latency_ms: input.latencyMs } : {}),
    },
  });

  // 2) PostHog model_cost event. Stub when key unset.
  try {
    getPostHog().capture({
      distinctId: ctx.userId,
      event: "model_cost",
      properties: {
        job_id: ctx.jobId,
        plan_tier: ctx.planTier ?? null,
        provider: input.provider,
        model: input.model,
        reason: input.reason,
        unit_kind: input.unitKind,
        units: input.units,
        input_tokens: input.inputTokens ?? null,
        output_tokens: input.outputTokens ?? null,
        cost_usd_micros: input.costUsdMicros,
        cost_usd: input.costUsdMicros / 1_000_000,
        credits_charged: credits,
        latency_ms: input.latencyMs ?? null,
        ...(input.extra ?? {}),
      },
    });
  } catch (err) {
    console.error(
      `[posthog] capture model_cost failed (${input.provider}/${input.model}):`,
      err instanceof Error ? err.message : err,
    );
  }
}
