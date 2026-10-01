// POST /api/webhooks/dodo — receives Standard-Webhooks-signed events from
// Dodo Payments.
//
// Flow (same shape as api.webhooks.polar.tsx):
//   1. Read RAW body (signature is over the bytes).
//   2. Verify via verifyDodoWebhook(rawBody, headers, secret).
//   3. Dedupe via billing_events.event_id INSERT using the webhook-id header.
//   4. Dispatch by event.type. Each handler is idempotent on the ledger side.
//
// Grants:
//   - subscription.active / subscription.renewed grant the monthly batch, keyed
//     on the billing period start (previous_billing_date), so a period is
//     granted exactly once no matter which of the two events arrives, or how
//     often.
//   - payment.succeeded grants every credit-pack product in the payment's cart
//     (packs can ride along with a subscription in one checkout).
//
// userId resolution: metadata.userId → subscriptions row → user_billing lookup
// by provider_customer_id (Dodo customer_id).

import type { Route } from "./+types/api.webhooks.dodo";
import {
  DodoWebhookVerificationError,
  getDodoWebhookSecret,
  lookupDodoProduct,
  normalizeDodoStatus,
  verifyDodoWebhook,
} from "../lib/billing/dodo";
import { getSupabase } from "../lib/supabase";
import { adjustBalance } from "../lib/billing/credits";
import { flushPostHog } from "../lib/posthog";
import { applyPlanAndGrant, identifyPlan, logBillingAfter, webhookLog } from "../lib/billing/webhook-apply";
import { applyPlanChange, recentPlanChange } from "../lib/billing/plan-change.server";
import { tierOf } from "../lib/billing/catalog";
import { getPostHog } from "../lib/posthog";

const log = (level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) =>
  webhookLog("dodo", level, msg, fields);

// Status-only lifecycle events: mirror status / period / cancel flag.
const MIRROR_EVENTS = new Set([
  "subscription.updated",
  "subscription.on_hold",
  "subscription.past_due",
  "subscription.paused",
  "subscription.unpaused",
  "subscription.failed",
  "subscription.expired",
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers) as Record<string, string>;
  const deliveryId = headers["webhook-id"];
  if (!deliveryId) {
    log("warn", "missing webhook-id header");
    return Response.json({ error: "Missing webhook-id" }, { status: 400 });
  }

  try {
    verifyDodoWebhook(rawBody, headers, getDodoWebhookSecret());
  } catch (err) {
    if (err instanceof DodoWebhookVerificationError) {
      log("warn", "signature verify failed", { reason: err.message });
      return Response.json({ error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  log("info", "received", { type: event.type, id: deliveryId });

  const db = getSupabase();
  const { error: dedupeErr } = await db
    .from("billing_events")
    .insert({ event_id: deliveryId, event_type: event.type });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      log("info", "deduped (already processed)", { id: deliveryId });
      return Response.json({ ok: true, deduped: true });
    }
    log("error", "billing_events insert failed", {
      id: deliveryId,
      type: event.type,
      pg_code: dedupeErr.code,
      error: dedupeErr.message,
    });
    return Response.json({ error: "Could not record event", pg_code: dedupeErr.code }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "subscription.active":
      case "subscription.renewed":
        await handleSubscriptionPeriod(event.type, event.data);
        break;
      case "subscription.plan_changed":
        await handlePlanChanged(event.data);
        break;
      case "subscription.cancelled":
        await handleSubscriptionCancelled(event.data);
        break;
      case "payment.succeeded":
        await handlePaymentSucceeded(event.data);
        break;
      default:
        if (MIRROR_EVENTS.has(event.type)) await mirrorSubscription(event.type, event.data);
        else log("info", "unhandled (recorded for audit)", { type: event.type, id: deliveryId });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "dispatch failed", { type: event.type, id: deliveryId, error: msg });
    // Let Dodo retry: drop the dedupe row so the retry isn't swallowed.
    await db.from("billing_events").delete().eq("event_id", deliveryId);
    return Response.json({ error: "Dispatch failed" }, { status: 500 });
  }

  void flushPostHog();
  return Response.json({ ok: true });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

// ───────── Helpers ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

function toIso(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

async function resolveUserId(data: AnyData): Promise<string | null> {
  const fromMeta = data?.metadata?.userId;
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;

  const db = getSupabase();
  const subscriptionId = data?.subscription_id;
  if (typeof subscriptionId === "string" && subscriptionId) {
    const { data: row } = await db
      .from("subscriptions")
      .select("user_id")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }

  const customerId = data?.customer?.customer_id;
  if (typeof customerId === "string" && customerId) {
    const { data: row } = await db
      .from("user_billing")
      .select("user_id")
      .eq("provider_customer_id", customerId)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }
  return null;
}

async function handleSubscriptionPeriod(type: string, data: AnyData): Promise<void> {
  const subscriptionId = data.subscription_id as string;
  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", `${type} without resolvable userId`, { sub: subscriptionId });
    return;
  }
  const productId = data.product_id as string | undefined;
  const entry = productId ? lookupDodoProduct(productId) : null;
  if (!entry || entry.kind !== "subscription") {
    log("warn", "unknown subscription product (skipping)", { sub: subscriptionId, product_id: productId });
    return;
  }

  const status = normalizeDodoStatus(data.status);
  const periodStart = toIso(data.previous_billing_date);
  const periodEnd = toIso(data.next_billing_date);

  const db = getSupabase();
  await db.from("subscriptions").upsert(
    {
      provider_subscription_id: subscriptionId,
      user_id: userId,
      provider_product_id: productId!,
      plan_tier: entry.planTier,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: Boolean(data.cancel_at_next_billing_date),
    },
    { onConflict: "provider_subscription_id" },
  );

  // Persist the customer id so future events without metadata still resolve.
  const customerId = data.customer?.customer_id ?? null;
  if (customerId) {
    await db.from("user_billing").update({ provider_customer_id: customerId }).eq("user_id", userId);
  }

  // An upgrade restarts the Dodo billing period, which can also emit a period
  // event for the new tier. Within the plan-change window that event belongs
  // to the change: grant the proration-matched amount once, not a full month.
  const change = await recentPlanChange(subscriptionId, entry.planTier);
  if (change) {
    await applyPlanChange({
      provider: "dodo",
      userId,
      subscriptionId,
      toTier: entry.planTier,
      monthlyGrant: entry.monthlyGrant,
      periodEnd,
      fallback: { fromTier: entry.planTier, periodStart, periodEnd, key: `dodo_plan_change:${subscriptionId}:${periodStart ?? "initial"}` },
    });
    // Mark the restarted period as granted so a later replay of this event
    // cannot add the full month on top.
    await getSupabase().from("credit_ledger").insert({
      user_id: userId,
      delta: 0,
      kind: "grant",
      reason: `monthly_grant:${entry.planTier}:covered_by_plan_change`,
      idempotency_key: `dodo_sub_period:${subscriptionId}:${periodStart ?? "initial"}`,
    });
  } else {
    await applyPlanAndGrant(
      "dodo",
      userId,
      entry.planTier,
      entry.monthlyGrant,
      periodEnd,
      `dodo_sub_period:${subscriptionId}:${periodStart ?? "initial"}`,
    );
  }
  identifyPlan("dodo", userId, {
    plan_tier: entry.planTier,
    monthly_grant: entry.monthlyGrant,
    provider_subscription_id: subscriptionId,
    subscription_status: status,
    current_period_end: periodEnd,
  });
  log("info", `${type} applied`, { sub: subscriptionId, user_id: userId, plan_tier: entry.planTier });
}

// Upgrade/downgrade (from POST /api/billing/change-plan or the Dodo
// dashboard): switch the tier and its monthly grant, and on an upgrade grant
// the proration-matched credits once (see lib/billing/plan-change.server.ts).
async function handlePlanChanged(data: AnyData): Promise<void> {
  const subscriptionId = data.subscription_id as string;
  const productId = data.product_id as string | undefined;
  const entry = productId ? lookupDodoProduct(productId) : null;
  const userId = await resolveUserId(data);
  if (!userId || !entry || entry.kind !== "subscription") {
    log("warn", "plan_changed skipped", { sub: subscriptionId, product_id: productId, user_id: userId });
    return;
  }
  const db = getSupabase();
  const { data: before } = await db
    .from("subscriptions")
    .select("plan_tier, current_period_start, current_period_end")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  const periodStart = toIso(data.previous_billing_date);
  const periodEnd = toIso(data.next_billing_date);
  await db.from("subscriptions").update({
    provider_product_id: productId!,
    plan_tier: entry.planTier,
    status: normalizeDodoStatus(data.status),
    ...(periodStart ? { current_period_start: periodStart } : {}),
    current_period_end: periodEnd,
  }).eq("provider_subscription_id", subscriptionId);

  await applyPlanChange({
    provider: "dodo",
    userId,
    subscriptionId,
    toTier: entry.planTier,
    monthlyGrant: entry.monthlyGrant,
    periodEnd,
    fallback: {
      fromTier: tierOf(before?.plan_tier as string | null),
      periodStart: (before?.current_period_start as string | null) ?? null,
      periodEnd: (before?.current_period_end as string | null) ?? null,
      key: `dodo_plan_change:${subscriptionId}:${periodStart ?? productId}`,
    },
  });
  // If the upgrade restarted the period, the restarted period is covered by
  // the plan-change grant; claim its key so a later .renewed/.active for the
  // same period start cannot add a full month on top.
  if (periodStart && periodStart !== (before?.current_period_start ?? null)) {
    await db.from("credit_ledger").insert({
      user_id: userId,
      delta: 0,
      kind: "grant",
      reason: `monthly_grant:${entry.planTier}:covered_by_plan_change`,
      idempotency_key: `dodo_sub_period:${subscriptionId}:${periodStart}`,
    });
  }
  identifyPlan("dodo", userId, { plan_tier: entry.planTier, monthly_grant: entry.monthlyGrant });
  log("info", "plan_changed applied", { sub: subscriptionId, user_id: userId, plan_tier: entry.planTier });
}

async function mirrorSubscription(type: string, data: AnyData): Promise<void> {
  const subscriptionId = data.subscription_id as string;
  const status = normalizeDodoStatus(data.status);
  const cancelFlag = Boolean(data.cancel_at_next_billing_date);
  const db = getSupabase();
  const { data: current } = await db
    .from("subscriptions")
    .select("user_id, plan_tier")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  await db.from("subscriptions").update({
    status,
    current_period_start: toIso(data.previous_billing_date),
    current_period_end: toIso(data.next_billing_date),
    cancel_at_period_end: cancelFlag,
  }).eq("provider_subscription_id", subscriptionId);

  if (!current) {
    log("info", `${type} for untracked sub`, { sub: subscriptionId, status });
    return;
  }
  identifyPlan("dodo", current.user_id as string, {
    plan_tier: current.plan_tier,
    provider_subscription_id: subscriptionId,
    subscription_status: status,
    cancel_at_period_end: cancelFlag,
    current_period_end: toIso(data.next_billing_date),
  });
  log("info", `${type} mirrored`, { sub: subscriptionId, status, cancel_at_period_end: cancelFlag });
}

async function handleSubscriptionCancelled(data: AnyData): Promise<void> {
  const subscriptionId = data.subscription_id as string;
  const db = getSupabase();
  const { data: row } = await db
    .from("subscriptions")
    .select("user_id, plan_tier")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  await db.from("subscriptions").update({
    status: "canceled",
    cancel_at_period_end: true,
  }).eq("provider_subscription_id", subscriptionId);

  if (row?.user_id) {
    identifyPlan("dodo", row.user_id as string, {
      plan_tier: row.plan_tier,
      provider_subscription_id: subscriptionId,
      subscription_status: "canceled",
      cancel_at_period_end: true,
    });
  }
  log("info", "subscription.cancelled applied", { sub: subscriptionId, user_id: row?.user_id ?? null });
}

async function handlePaymentSucceeded(data: AnyData): Promise<void> {
  const paymentId = data.payment_id as string;
  const cart: Array<{ product_id?: string; quantity?: number }> = Array.isArray(data.product_cart)
    ? data.product_cart
    : [];
  const packs = cart
    .map((item) => ({ productId: item.product_id, quantity: Math.max(1, Number(item.quantity ?? 1)) }))
    .map((item) => ({ ...item, entry: item.productId ? lookupDodoProduct(item.productId) : null }))
    .filter((item) => item.entry?.kind === "credit_pack");

  if (packs.length === 0) {
    // Subscription charges are granted by subscription.active / .renewed.
    log("info", "payment.succeeded has no credit pack (nothing to grant)", {
      payment: paymentId,
      subscription_id: data.subscription_id,
    });
    return;
  }

  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "payment.succeeded without resolvable userId", { payment: paymentId });
    return;
  }
  const db = getSupabase();
  for (const { productId, quantity, entry } of packs) {
    if (!entry || entry.kind !== "credit_pack") continue;
    const credits = entry.credits * quantity;
    await db.from("credit_purchases").upsert(
      {
        provider_order_id: `${paymentId}:${productId}`,
        user_id: userId,
        provider_product_id: productId!,
        credits_granted: credits,
        amount_usd_cents: packs.length === 1 && !data.subscription_id ? Number(data.total_amount ?? 0) : 0,
        status: "completed",
      },
      { onConflict: "provider_order_id" },
    );
    await adjustBalance({
      userId,
      amount: credits,
      kind: "purchase",
      reason: `credit_pack:${entry.packSize}`,
      idempotencyKey: `purchase:${paymentId}:${productId}`,
    });
    log("info", "payment.succeeded credit pack granted", {
      payment: paymentId,
      user_id: userId,
      credits,
      pack_only: !data.subscription_id,
    });
    try {
      getPostHog().capture({
        distinctId: userId,
        event: "credit_pack_purchased",
        properties: { provider: "dodo", pack: entry.packSize, credits, pack_only: !data.subscription_id, source: data?.metadata?.source },
      });
    } catch {
      // best-effort
    }
    await logBillingAfter("dodo", userId, "credit_pack purchase", {
      payment_id: paymentId,
      pack: entry.packSize,
      credits_added: credits,
    });
  }
  identifyPlan("dodo", userId, {
    last_credit_purchase_order: paymentId,
    last_credit_purchase_at: new Date().toISOString(),
  });
}
