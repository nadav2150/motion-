// POST /api/webhooks/polar — receives Standard-Webhooks-signed events from Polar.
//
// Flow:
//   1. Read RAW body (signature is over the bytes).
//   2. Verify via validateEvent(rawBody, headers, secret).
//   3. Dedupe via billing_events.event_id INSERT using the webhook-id header.
//   4. Dispatch by event.type. Each handler is idempotent on the ledger side.
//
// userId resolution: metadata.userId → customer.externalId → user_billing
// lookup by provider_customer_id.

import type { Route } from "./+types/api.webhooks.polar";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { getWebhookSecret, lookupProduct } from "../lib/billing/polar";
import { classifyOrder, extractUserIdHint } from "../lib/billing/webhook-classify";
import { getSupabase } from "../lib/supabase";
import { adjustBalance } from "../lib/billing/credits";
import { flushPostHog } from "../lib/posthog";
import type { PlanTier } from "../lib/billing/plan-features";
import { applyPlanChange } from "../lib/billing/plan-change.server";
import { tierOf } from "../lib/billing/catalog";
import { getPostHog } from "../lib/posthog";
import { reportRedditPurchase } from "../lib/reddit-capi";
import {
  applyPlanAndGrant as sharedApplyPlanAndGrant,
  identifyPlan as sharedIdentifyPlan,
  logBillingAfter as sharedLogBillingAfter,
  webhookLog,
} from "../lib/billing/webhook-apply";

const log = (level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) =>
  webhookLog("polar", level, msg, fields);
const logBillingAfter = (userId: string, context: string, extra: Record<string, unknown> = {}) =>
  sharedLogBillingAfter("polar", userId, context, extra);
const applyPlanAndGrant = (
  userId: string,
  planTier: PlanTier,
  monthlyGrant: number,
  periodEnd: string | null,
  idempotencyKey: string,
) => sharedApplyPlanAndGrant("polar", userId, planTier, monthlyGrant, periodEnd, idempotencyKey);
const identifyPlan = (userId: string, properties: Record<string, unknown>) =>
  sharedIdentifyPlan("polar", userId, properties);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = validateEvent(rawBody, headers, getWebhookSecret());
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      log("warn", "signature verify failed");
      return Response.json({ error: "Invalid signature" }, { status: 403 });
    }
    throw err;
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
    // Not a duplicate — the audit insert genuinely failed. Surface the
    // Postgres code/details so a stale schema (e.g. 42P01: billing_events
    // missing because the rename migration hasn't run) is obvious in logs
    // instead of hiding behind a generic "Dedupe failure".
    log("error", "billing_events insert failed", {
      id: deliveryId,
      type: event.type,
      pg_code: dedupeErr.code,
      error: dedupeErr.message,
      details: dedupeErr.details,
      hint: dedupeErr.hint,
    });
    return Response.json(
      { error: "Could not record event", pg_code: dedupeErr.code, detail: dedupeErr.message },
      { status: 500 },
    );
  }

  try {
    switch (event.type) {
      case "subscription.created":
        await handleSubscriptionCreated(event.data);
        break;
      case "subscription.updated":
        await handleSubscriptionUpdated(event.data);
        break;
      case "subscription.canceled":
        await handleSubscriptionCanceled(event.data);
        break;
      case "order.paid":
        await handleOrderPaid(event.data);
        break;
      default:
        log("info", "unhandled (recorded for audit)", { type: event.type, id: deliveryId });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "dispatch failed", { type: event.type, id: deliveryId, error: msg });
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

// validateEvent returns SDK models whose timestamp fields are Date objects and
// whose keys are camelCase. Normalize a Date | string | null to an ISO string
// for the Postgres timestamptz columns.
function toIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return v;
  return null;
}

async function resolveUserId(data: AnyData): Promise<string | null> {
  const hint = extractUserIdHint(data);
  if (hint) return hint;
  const customerId = data.customerId ?? data.customer?.id;
  if (typeof customerId === "string" && customerId) {
    const db = getSupabase();
    const { data: row } = await db
      .from("user_billing")
      .select("user_id")
      .eq("provider_customer_id", customerId)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }
  return null;
}

async function handleSubscriptionCreated(data: AnyData): Promise<void> {
  const subscriptionId = data.id as string;
  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "subscription.created without resolvable userId", { sub: subscriptionId });
    return;
  }
  const productId = data.productId as string | undefined;
  const entry = productId ? lookupProduct(productId) : null;
  if (!entry || entry.kind !== "subscription") {
    log("warn", "unknown subscription product (skipping)", { sub: subscriptionId, product_id: productId });
    return;
  }

  const status = (data.status as string) ?? "active";
  const periodStart = toIso(data.currentPeriodStart);
  const periodEnd = toIso(data.currentPeriodEnd);

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
      cancel_at_period_end: false,
    },
    { onConflict: "provider_subscription_id" },
  );

  // Persist the customer id so future events without metadata still resolve.
  const customerId = data.customerId ?? data.customer?.id ?? null;
  if (customerId) {
    await db.from("user_billing").update({ provider_customer_id: customerId }).eq("user_id", userId);
  }

  await applyPlanAndGrant(userId, entry.planTier, entry.monthlyGrant, periodEnd, `sub_create:${subscriptionId}`);
  identifyPlan(userId, {
    plan_tier: entry.planTier,
    monthly_grant: entry.monthlyGrant,
    provider_subscription_id: subscriptionId,
    subscription_status: status,
    current_period_end: periodEnd,
  });
  log("info", "subscription.created applied", { sub: subscriptionId, user_id: userId, plan_tier: entry.planTier });
}

async function handleSubscriptionUpdated(data: AnyData): Promise<void> {
  const subscriptionId = data.id as string;
  const status = (data.status as string) ?? "active";
  const periodStart = toIso(data.currentPeriodStart);
  const periodEnd = toIso(data.currentPeriodEnd);
  const cancelFlag = Boolean(data.cancelAtPeriodEnd);

  const db = getSupabase();
  const { data: current } = await db
    .from("subscriptions")
    .select("user_id, plan_tier, provider_product_id")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  // In-place plan change (subscriptions.update productId): record the new
  // product + tier. The upgrade grant itself rides on order.paid
  // (billing_reason=subscription_update); a downgrade grants nothing.
  const productId = data.productId as string | undefined;
  const entry = productId ? lookupProduct(productId) : null;
  const newPlan = current && entry?.kind === "subscription" && productId !== current.provider_product_id
    ? entry
    : null;

  await db.from("subscriptions").update({
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelFlag,
    ...(newPlan ? { provider_product_id: productId!, plan_tier: newPlan.planTier } : {}),
  }).eq("provider_subscription_id", subscriptionId);

  if (!current) {
    log("info", "subscription.updated for untracked sub", { sub: subscriptionId, status });
    return;
  }
  if (newPlan) {
    await db.from("user_billing").update({
      plan_tier: newPlan.planTier,
      monthly_grant: newPlan.monthlyGrant,
    }).eq("user_id", current.user_id as string);
    log("info", "subscription.updated product change", { sub: subscriptionId, from: current.plan_tier, to: newPlan.planTier });
  }
  identifyPlan(current.user_id as string, {
    plan_tier: newPlan ? newPlan.planTier : current.plan_tier,
    provider_subscription_id: subscriptionId,
    subscription_status: status,
    cancel_at_period_end: cancelFlag,
    current_period_end: periodEnd,
  });
  log("info", "subscription.updated mirrored", { sub: subscriptionId, status, cancel_at_period_end: cancelFlag });
}

async function handleSubscriptionCanceled(data: AnyData): Promise<void> {
  const subscriptionId = data.id as string;
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
    identifyPlan(row.user_id as string, {
      plan_tier: row.plan_tier,
      provider_subscription_id: subscriptionId,
      subscription_status: "canceled",
      cancel_at_period_end: true,
    });
  }
  log("info", "subscription.canceled applied", { sub: subscriptionId, user_id: row?.user_id ?? null });
}

async function handleOrderPaid(data: AnyData): Promise<void> {
  const orderId = data.id as string;
  await reportRedditPurchase({
    metadata: data.metadata,
    amountCents: Number(data.netAmount ?? data.totalAmount ?? 0),
    currency: data.currency,
    email: data.customer?.email,
    externalId: extractUserIdHint(data),
  });
  const cls = classifyOrder({ subscription_id: data.subscriptionId, billing_reason: data.billingReason });

  if (cls === "skip") {
    log("info", "order.paid skipped (subscription bill handled elsewhere)", { order: orderId, reason: data.billingReason });
    return;
  }

  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "order.paid without resolvable userId", { order: orderId });
    return;
  }
  const db = getSupabase();

  if (cls === "renewal") {
    const subscriptionId = data.subscriptionId as string;
    const { data: sub } = await db
      .from("subscriptions")
      .select("provider_product_id")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();
    // Order has no period fields; the nested subscription carries the new period.
    const productId = (sub?.provider_product_id ?? data.subscription?.productId ?? data.productId) as string | undefined;
    const entry = productId ? lookupProduct(productId) : null;
    if (!entry || entry.kind !== "subscription") {
      log("warn", "renewal skipped — product not in catalog", { order: orderId, product_id: productId });
      return;
    }
    const periodEnd = toIso(data.subscription?.currentPeriodEnd);
    await applyPlanAndGrant(userId, entry.planTier, entry.monthlyGrant, periodEnd, `sub_renew:${subscriptionId}:${orderId}`);
    log("info", "order.paid renewal granted", { order: orderId, user_id: userId, plan_tier: entry.planTier });
    return;
  }

  if (cls === "plan_change") {
    const subscriptionId = data.subscriptionId as string;
    const { data: sub } = await db
      .from("subscriptions")
      .select("plan_tier, provider_product_id, current_period_start, current_period_end")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();
    const productId = (data.subscription?.productId ?? sub?.provider_product_id ?? data.productId) as string | undefined;
    const entry = productId ? lookupProduct(productId) : null;
    if (!entry || entry.kind !== "subscription") {
      log("warn", "plan change order skipped — product not in catalog", { order: orderId, product_id: productId });
      return;
    }
    await applyPlanChange({
      provider: "polar",
      userId,
      subscriptionId,
      toTier: entry.planTier,
      monthlyGrant: entry.monthlyGrant,
      periodEnd: toIso(data.subscription?.currentPeriodEnd),
      // Without an app-recorded change, subscription.updated has usually
      // already switched the row's tier, so "from" may equal "to" → grant 0.
      fallback: {
        fromTier: tierOf(sub?.plan_tier as string | null),
        periodStart: (sub?.current_period_start as string | null) ?? null,
        periodEnd: (sub?.current_period_end as string | null) ?? null,
        key: `polar_plan_change:${subscriptionId}:${orderId}`,
      },
    });
    return;
  }

  // credit_pack
  const productId = data.productId as string | undefined;
  const entry = productId ? lookupProduct(productId) : null;
  if (!entry || entry.kind !== "credit_pack") {
    log("info", "order.paid one-time but product not a credit pack (skipping)", { order: orderId, product_id: productId });
    return;
  }
  const amountCents = Number(data.totalAmount ?? 0);
  await db.from("credit_purchases").upsert(
    {
      provider_order_id: orderId,
      user_id: userId,
      provider_product_id: productId!,
      credits_granted: entry.credits,
      amount_usd_cents: amountCents,
      status: "completed",
    },
    { onConflict: "provider_order_id" },
  );
  await adjustBalance({
    userId,
    amount: entry.credits,
    kind: "purchase",
    reason: `credit_pack:${entry.packSize}`,
    idempotencyKey: `purchase:${orderId}:${productId}`,
  });
  identifyPlan(userId, {
    last_credit_purchase_order: orderId,
    last_credit_purchase_at: new Date().toISOString(),
  });
  log("info", "order.paid credit pack granted", { order: orderId, user_id: userId, credits: entry.credits });
  try {
    getPostHog().capture({
      distinctId: userId,
      event: "credit_pack_purchased",
      properties: { provider: "polar", pack: entry.packSize, credits: entry.credits, pack_only: true, source: data?.metadata?.source },
    });
  } catch {
    // best-effort
  }
  await logBillingAfter(userId, "credit_pack purchase", {
    order_id: orderId,
    pack: entry.packSize,
    credits_added: entry.credits,
  });
}
