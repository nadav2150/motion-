// Backoffice: what each video actually cost us in USD. Every upstream call
// (Opus, ElevenLabs, Gemini, images, render compute) writes a consume row to
// credit_ledger with provider + cost_usd_micros (billing/track-cost.ts); this
// sums those rows per job. Read live from the ledger rather than
// jobs.cost_actual_usd_micros, which is only filled once a job settles.

import { getSupabase } from "./supabase";

export type CostCategory = "claude" | "voice" | "music" | "gemini" | "images" | "render" | "other";

export const COST_CATEGORIES: { key: CostCategory; label: string }[] = [
  { key: "claude", label: "Claude (code)" },
  { key: "voice", label: "ElevenLabs (voice)" },
  { key: "music", label: "Music" },
  { key: "gemini", label: "Gemini (reference)" },
  { key: "images", label: "Images" },
  { key: "render", label: "Render (compute)" },
  { key: "other", label: "Other" },
];

const CATEGORY_BY_PROVIDER: Record<string, CostCategory> = {
  anthropic: "claude",
  elevenlabs: "voice",
  jamendo: "music",
  freesound: "music",
  google_gemini: "gemini",
  replicate_image: "images",
  replicate_video: "images",
  videly_render: "render",
};

export function costCategory(provider: string | null): CostCategory {
  return (provider && CATEGORY_BY_PROVIDER[provider]) || "other";
}

export type CostCall = {
  id: string;
  created_at: string;
  provider: string | null;
  model: string | null;
  reason: string;
  units: number | null;
  unit_kind: string | null;
  cost_usd_micros: number;
  credits: number;
  meta: Record<string, unknown> | null;
  // Render rows written before 2026-10-03 priced the render at its credit
  // price ($0.005/s of video), not the container time it took.
  creditPriced: boolean;
};

export type JobCost = {
  totalMicros: number;
  byCategory: Record<CostCategory, number>;
  creditsUsed: number;
  calls: number;
  hasCreditPricedRender: boolean;
};

type LedgerRow = Omit<CostCall, "creditPriced" | "credits" | "cost_usd_micros"> & {
  job_id: string;
  delta: number;
  cost_usd_micros: number | null;
};

const LEDGER_COLUMNS = "id, job_id, created_at, provider, model, reason, units, unit_kind, cost_usd_micros, delta, meta";
const PAGE = 1000; // PostgREST max rows per request

function emptyCost(): JobCost {
  const byCategory = Object.fromEntries(COST_CATEGORIES.map((c) => [c.key, 0])) as Record<CostCategory, number>;
  return { totalMicros: 0, byCategory, creditsUsed: 0, calls: 0, hasCreditPricedRender: false };
}

function toCall(row: LedgerRow): CostCall {
  return {
    id: row.id,
    created_at: row.created_at,
    provider: row.provider,
    model: row.model,
    reason: row.reason,
    units: row.units,
    unit_kind: row.unit_kind,
    cost_usd_micros: Number(row.cost_usd_micros ?? 0),
    credits: Math.max(0, -Number(row.delta)),
    meta: row.meta,
    creditPriced: row.provider === "videly_render" && row.meta?.wall_seconds == null,
  };
}

/** Every consume row for the given jobs, oldest first. */
async function loadConsumeRows(jobIds: string[]): Promise<LedgerRow[]> {
  if (!jobIds.length) return [];
  const db = getSupabase();
  const out: LedgerRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("credit_ledger")
      .select(LEDGER_COLUMNS)
      .in("job_id", jobIds)
      .eq("kind", "consume")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`credit_ledger read failed: ${error.message}`);
    out.push(...((data ?? []) as LedgerRow[]));
    if ((data ?? []).length < PAGE) return out;
  }
}

function addCall(cost: JobCost, call: CostCall): void {
  cost.creditsUsed += call.credits;
  if (!call.provider) return; // pre-telemetry row: credits only, no USD
  cost.totalMicros += call.cost_usd_micros;
  cost.byCategory[costCategory(call.provider)] += call.cost_usd_micros;
  cost.calls += 1;
  if (call.creditPriced) cost.hasCreditPricedRender = true;
}

/** USD cost per job, keyed by job id (jobs without rows get zeros). */
export async function loadJobCosts(jobIds: string[]): Promise<Record<string, JobCost>> {
  const out: Record<string, JobCost> = {};
  for (const id of jobIds) out[id] = emptyCost();
  for (const row of await loadConsumeRows(jobIds)) addCall(out[row.job_id] ??= emptyCost(), toCall(row));
  return out;
}

/** One job's cost plus the individual metered calls behind it. */
export async function loadJobCostDetail(jobId: string): Promise<{ cost: JobCost; calls: CostCall[] }> {
  const cost = emptyCost();
  const calls = (await loadConsumeRows([jobId])).map(toCall);
  for (const call of calls) addCall(cost, call);
  return { cost, calls };
}

export function fmtUsd(micros: number): string {
  const usd = micros / 1_000_000;
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(usd < 10 ? 3 : 2)}`;
}
