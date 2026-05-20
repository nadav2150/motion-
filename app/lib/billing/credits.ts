// Credits ledger + balance manipulation. The ledger (credit_ledger table) is
// the source of truth — every credit movement appends a row. user_billing
// holds a denormalised running balance for fast read at gate time.
//
// Atomicity rule: balance and reservations are only ever mutated via the
// helpers in this module. Direct UPDATEs elsewhere will desync the ledger.
//
// Phase A note: in observability-only mode, reserveCredits() is a no-op
// returning success. recordConsumption() still appends ledger rows so we get
// real cost telemetry without blocking jobs. isBillingEnabled() flips to
// Phase B+ behaviour when PADDLE_API_KEY is set.

import { getSupabase } from "../supabase";

export type ConsumptionReason =
  | "opus_director"
  | "opus_blueprint"
  | "opus_film_html"
  | "opus_scene_fill"
  | "opus_audio_direction"
  | "opus_film_critique"
  | "sonnet_scene_critique"
  | "gpt4o_vision"
  | "replicate_image"
  | "replicate_video"
  | "elevenlabs_tts"
  | "jamendo_search"
  | "freesound_search";

export type LedgerKind = "grant" | "purchase" | "reserve" | "consume" | "refund" | "adjust";

export type UserBilling = {
  user_id: string;
  paddle_customer_id: string | null;
  plan_tier: string;
  credits_balance: number;
  credits_reserved: number;
  monthly_grant: number;
  period_end: string | null;
};

// Returns true once the user has opted in to billing by configuring Paddle.
// In dev environments without Paddle keys, gates short-circuit to "allowed"
// so the dev loop stays unblocked — but the ledger still records consumption
// so cost dashboards work locally.
export function isBillingEnabled(): boolean {
  return Boolean(process.env.PADDLE_API_KEY);
}

export async function getOrCreateBilling(userId: string): Promise<UserBilling> {
  const db = getSupabase();
  // Try insert-then-select; on conflict select the existing row.
  const { data: inserted, error: insErr } = await db
    .from("user_billing")
    .insert({ user_id: userId })
    .select("*")
    .maybeSingle();
  if (inserted) return inserted as UserBilling;
  // Insert failed (likely conflict). Fall back to select.
  if (insErr && insErr.code !== "23505") {
    // 23505 = unique_violation = expected conflict.
    throw new Error(`getOrCreateBilling(${userId}) insert failed: ${insErr.message}`);
  }
  const { data, error } = await db
    .from("user_billing")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new Error(
      `getOrCreateBilling(${userId}) select failed: ${error?.message ?? "no row"}`,
    );
  }
  return data as UserBilling;
}

export type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; required: number; balance: number };

// Atomic reserve. Single UPDATE...WHERE balance>=amount returning row. If 0
// rows update, the user doesn't have enough — return their current balance
// so the API can include it in the 402 response. Ledger row appended on
// success with kind='reserve' and a deterministic idempotency_key so retries
// (e.g. a network blip between reserve and createJob) don't double-charge.
//
// Pass `jobId=null` when reserving BEFORE the job row exists, then call
// attachReservationToJob() once you have the id. (Phase B caller pattern.)
export async function reserveCredits(
  userId: string,
  amount: number,
  jobId: string | null,
  idempotencyKey: string,
): Promise<ReserveResult> {
  if (amount <= 0) return { ok: true, reservationId: idempotencyKey };
  const db = getSupabase();

  // Atomic decrement via the reserve_credits() Postgres function (see
  // 20260602_billing.sql). supabase-js can't express "x = x - $1 where x >= $1"
  // directly, so we round-trip through an RPC.
  const { data: rpcData, error: rpcErr } = await db.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (rpcErr) {
    throw new Error(`reserveCredits RPC failed: ${rpcErr.message}`);
  }
  const result = rpcData as { ok: boolean; balance: number } | null;
  if (!result || !result.ok) {
    // Get a fresh balance for the error response.
    const { data: row } = await db
      .from("user_billing")
      .select("credits_balance")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = (row?.credits_balance as number) ?? 0;
    return { ok: false, required: amount, balance };
  }

  // Append the ledger row. If the idempotency_key already exists (retry),
  // we ignore the conflict — the prior reservation already happened.
  const { error: ledgerErr } = await db
    .from("credit_ledger")
    .insert({
      user_id: userId,
      job_id: jobId,
      delta: -amount,
      kind: "reserve",
      reason: "reservation",
      idempotency_key: idempotencyKey,
    });
  if (ledgerErr && ledgerErr.code !== "23505") {
    throw new Error(`reserveCredits ledger insert failed: ${ledgerErr.message}`);
  }

  return { ok: true, reservationId: idempotencyKey };
}

// Once the job row is created, attach its id to the reservation ledger entry
// so reconcileJob() can find it later.
export async function attachReservationToJob(
  idempotencyKey: string,
  jobId: string,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("credit_ledger")
    .update({ job_id: jobId })
    .eq("idempotency_key", idempotencyKey)
    .is("job_id", null);
  if (error) {
    throw new Error(`attachReservationToJob failed: ${error.message}`);
  }
}

// Append a 'consume' row to the ledger. Does NOT touch user_billing.balance
// — the reservation already deducted upfront. Idempotency key combines the
// jobId + reason + an increment so retries within meter() don't double-log.
//
// USD telemetry: callers now pass provider/model/units/costUsdMicros so the
// real dollar cost (not just credits) lands in dedicated columns. Older call
// paths that omit these fields still work — columns simply stay NULL.
export type ProviderTag =
  | "anthropic"
  | "elevenlabs"
  | "replicate_image"
  | "replicate_video"
  | "openai_gpt4o"
  | "freesound"
  | "jamendo";

export type UnitKind = "tokens" | "characters" | "calls" | "seconds";

export async function recordConsumption(args: {
  userId: string;
  jobId: string | null;
  amount: number;
  reason: ConsumptionReason;
  meta?: Record<string, unknown>;
  idempotencyKey?: string;
  // USD telemetry fields. All optional for backwards compatibility — if a
  // caller hasn't been updated to compute USD yet, the ledger row is still
  // valid, it just lacks the cost_usd columns.
  provider?: ProviderTag;
  model?: string;
  units?: number;
  unitKind?: UnitKind;
  costUsdMicros?: number;
}): Promise<void> {
  if (args.amount <= 0) return;
  const db = getSupabase();
  const idempotencyKey =
    args.idempotencyKey ?? `${args.jobId ?? "none"}:${args.reason}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await db.from("credit_ledger").insert({
    user_id: args.userId,
    job_id: args.jobId,
    delta: -args.amount,
    kind: "consume",
    reason: args.reason,
    meta: args.meta ?? null,
    idempotency_key: idempotencyKey,
    provider: args.provider ?? null,
    model: args.model ?? null,
    units: args.units ?? null,
    unit_kind: args.unitKind ?? null,
    cost_usd_micros: args.costUsdMicros ?? null,
  });
  if (error && error.code !== "23505") {
    // Don't throw on ledger failure during runJob — the job has already paid
    // for the upstream call and we don't want to fail it for accounting.
    // Log loudly so operators notice the drift.
    console.error(
      `[billing] recordConsumption failed (job=${args.jobId} reason=${args.reason}): ${error.message}`,
    );
  }
}

// Append a grant or refund row AND bump the balance. Used by:
//   - Paddle webhook (purchase: kind='purchase', renewal: kind='grant')
//   - reconcileJob (refund unused reservation: kind='refund')
//   - one-off backfill SQL (kind='grant', reason='backfill')
export async function adjustBalance(args: {
  userId: string;
  jobId?: string | null;
  amount: number; // positive
  kind: LedgerKind;
  reason: string;
  meta?: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<void> {
  if (args.amount <= 0) return;
  const db = getSupabase();

  // RPC bumps balance + decrements credits_reserved for refunds.
  const { error: rpcErr } = await db.rpc("adjust_credits", {
    p_user_id: args.userId,
    p_delta_balance: args.kind === "refund" ? args.amount : args.amount,
    p_delta_reserved: args.kind === "refund" ? -args.amount : 0,
  });
  if (rpcErr) {
    throw new Error(`adjustBalance RPC failed: ${rpcErr.message}`);
  }

  const { error: ledgerErr } = await db.from("credit_ledger").insert({
    user_id: args.userId,
    job_id: args.jobId ?? null,
    delta: args.amount,
    kind: args.kind,
    reason: args.reason,
    meta: args.meta ?? null,
    idempotency_key: args.idempotencyKey,
  });
  if (ledgerErr && ledgerErr.code !== "23505") {
    throw new Error(`adjustBalance ledger insert failed: ${ledgerErr.message}`);
  }
}

// Sums consume rows for this job. Refunds the unspent portion of the
// reservation back to balance (and decrements credits_reserved). Idempotent
// — repeated calls produce no additional refund because the idempotency_key
// hits the unique constraint on the ledger.
export async function reconcileJob(jobId: string): Promise<void> {
  const db = getSupabase();

  // Find the reservation row for this job.
  const { data: reserveRow, error: reserveErr } = await db
    .from("credit_ledger")
    .select("user_id, delta")
    .eq("job_id", jobId)
    .eq("kind", "reserve")
    .maybeSingle();
  if (reserveErr) {
    throw new Error(`reconcileJob(${jobId}) reserve lookup failed: ${reserveErr.message}`);
  }
  if (!reserveRow) {
    // Job was created with billing disabled. Nothing to reconcile.
    return;
  }
  const userId = reserveRow.user_id as string;
  const reservedAmount = -Number(reserveRow.delta as number); // delta is negative; absolute value

  // Sum consume rows. Also pull provider/cost_usd_micros so we can roll up
  // a per-provider USD breakdown for the job without a second round-trip.
  const { data: consumeRows, error: consumeErr } = await db
    .from("credit_ledger")
    .select("delta, provider, cost_usd_micros")
    .eq("job_id", jobId)
    .eq("kind", "consume");
  if (consumeErr) {
    throw new Error(`reconcileJob(${jobId}) consume sum failed: ${consumeErr.message}`);
  }
  const consumedAmount = (consumeRows ?? []).reduce(
    (acc, r) => acc + -Number(r.delta as number),
    0,
  );

  // Sum USD micros, grouped by provider. Rows without provider/cost_usd_micros
  // (legacy or unmetered) bucket into "unknown" so totals always reconcile.
  const costByProvider: Record<string, number> = {};
  let totalUsdMicros = 0;
  for (const row of consumeRows ?? []) {
    const micros = Number(row.cost_usd_micros ?? 0);
    if (!micros) continue;
    const provider = (row.provider as string | null) ?? "unknown";
    costByProvider[provider] = (costByProvider[provider] ?? 0) + micros;
    totalUsdMicros += micros;
  }

  const refund = Math.max(0, reservedAmount - consumedAmount);

  // Backfill the job row's actual cost regardless of refund amount. Include
  // USD totals only when we have non-zero data (preserves NULL semantics for
  // jobs that ran before the telemetry was wired).
  const jobsPatch: Record<string, unknown> = { cost_actual_credits: consumedAmount };
  if (totalUsdMicros > 0) {
    jobsPatch.cost_actual_usd_micros = totalUsdMicros;
    jobsPatch.cost_by_provider = costByProvider;
  }
  await db.from("jobs").update(jobsPatch).eq("id", jobId);

  if (refund > 0) {
    await adjustBalance({
      userId,
      jobId,
      amount: refund,
      kind: "refund",
      reason: "reconcile_unused_reservation",
      idempotencyKey: `refund:${jobId}`,
    });
  } else if (consumedAmount > reservedAmount) {
    // Should be impossible given worst-case reservation. Log + record an
    // adjust row so operators see the drift. Defensive posture says never
    // claw back retroactively — the next job's reservation will fail until
    // the user tops up.
    const overrun = consumedAmount - reservedAmount;
    await db.from("credit_ledger").insert({
      user_id: userId,
      job_id: jobId,
      delta: -overrun,
      kind: "adjust",
      reason: "reconcile_overrun",
      idempotency_key: `overrun:${jobId}`,
      meta: { reserved: reservedAmount, consumed: consumedAmount },
    });
    console.error(
      `[billing] reservation overrun on job ${jobId}: reserved=${reservedAmount} consumed=${consumedAmount} overrun=${overrun} — adjust your estimator`,
    );
  }
}

export async function grantCredits(args: {
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await adjustBalance({
    userId: args.userId,
    amount: args.amount,
    kind: "grant",
    reason: args.reason,
    idempotencyKey: args.idempotencyKey,
    meta: args.meta,
  });
}
