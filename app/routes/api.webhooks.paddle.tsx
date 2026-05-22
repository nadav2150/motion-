// POST /api/webhooks/paddle — receives signed events from Paddle.
//
// Flow:
//   1. Read RAW body (signature is over the bytes, can't parse JSON first).
//   2. Verify signature via Paddle SDK unmarshal().
//   3. Dedupe via paddle_events.event_id INSERT — conflict means we already
//      processed this delivery.
//   4. Dispatch by eventType. Each handler is idempotent on its own.
//
// userId resolution:
//   - prefer event.data.customData.userId (we set this when opening checkout)
//   - fall back to user_billing row lookup by paddle_customer_id

import type { Route } from "./+types/api.webhooks.paddle";
import { EventName } from "@paddle/paddle-node-sdk";
import { getPaddle, getWebhookSecret, lookupPrice } from "../lib/billing/paddle";
import { getSupabase } from "../lib/supabase";
import { adjustBalance } from "../lib/billing/credits";
import { getPostHog, flushPostHog } from "../lib/posthog";
import type { PlanTier } from "../lib/billing/plan-features";

const SIGNATURE_HEADER = "paddle-signature";

// Single-line structured logger so dev terminal shows clean key=value rows.
function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) {
  const parts = [`[paddle-webhook] ${msg}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    parts.push(`${k}=${s}`);
  }
  const line = parts.join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!signature) {
    log("warn", "missing signature header");
    return Response.json({ error: "Missing paddle-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();
  const paddle = getPaddle();

  let event: Awaited<ReturnType<typeof paddle.webhooks.unmarshal>>;
  try {
    event = await paddle.webhooks.unmarshal(rawBody, getWebhookSecret(), signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", "signature verify failed", { error: msg });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!event) {
    log("warn", "unparseable event");
    return Response.json({ error: "Unparseable event" }, { status: 400 });
  }

  log("info", "received", { type: event.eventType, id: event.eventId });

  // Idempotency: only process each event id once.
  const db = getSupabase();
  const { error: dedupeErr } = await db
    .from("paddle_events")
    .insert({ event_id: event.eventId, event_type: event.eventType });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      log("info", "deduped (already processed)", { type: event.eventType, id: event.eventId });
      return Response.json({ ok: true, deduped: true });
    }
    log("error", "dedupe insert failed", { id: event.eventId, error: dedupeErr.message });
    return Response.json({ error: "Dedupe failure" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await handleSubscriptionCreated(event.data);
        break;
      case EventName.SubscriptionUpdated:
        await handleSubscriptionUpdated(event.data);
        break;
      case EventName.SubscriptionCanceled:
        await handleSubscriptionCanceled(event.data);
        break;
      case EventName.TransactionCompleted:
        await handleTransactionCompleted(event.data);
        break;
      default:
        log("info", "unhandled (recorded for audit)", { type: event.eventType, id: event.eventId });
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "dispatch failed", { type: event.eventType, id: event.eventId, error: msg });
    // Return 500 so Paddle retries. dedupe row is already in place, so we let
    // the retry hit the same row again — that's OK because handlers are
    // idempotent on the ledger side.
    return Response.json({ error: "Dispatch failed" }, { status: 500 });
  }

  log("info", "processed", { type: event.eventType, id: event.eventId, ms: Date.now() - startedAt });

  // Flush PostHog so identify/capture calls land before the lambda/process exits.
  void flushPostHog();

  return Response.json({ ok: true });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

// ───────── Helpers ─────────

// Event data shapes vary by event type; the SDK provides discriminated unions
// but we read fields opportunistically (customData, items[].price.id, etc.)
// rather than narrowing each variant. Typed as `any` deliberately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

async function resolveUserId(data: AnyData): Promise<string | null> {
  const fromCustom = (data.customData as { userId?: unknown } | null | undefined)?.userId;
  if (typeof fromCustom === "string" && fromCustom) return fromCustom;
  if (typeof data.customerId === "string" && data.customerId) {
    const db = getSupabase();
    const { data: row } = await db
      .from("user_billing")
      .select("user_id")
      .eq("paddle_customer_id", data.customerId)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }
  return null;
}

function firstSubscriptionPriceId(items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    const price = (it as { price?: { id?: string } }).price;
    if (price?.id) return price.id;
  }
  return null;
}

async function handleSubscriptionCreated(data: AnyData): Promise<void> {
  const subscriptionId = (data as any).id as string;
  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "subscription.created without resolvable userId", { sub: subscriptionId });
    return;
  }
  const priceId = firstSubscriptionPriceId((data as any).items);
  const entry = priceId ? lookupPrice(priceId) : null;
  if (!entry || entry.kind !== "subscription") {
    log("warn", "unknown subscription price (skipping)", { sub: subscriptionId, price_id: priceId, user_id: userId });
    return;
  }

  const status = ((data as any).status as string) ?? "active";
  const periodStart = ((data as any).currentBillingPeriod?.startsAt as string) ?? null;
  const periodEnd = ((data as any).currentBillingPeriod?.endsAt as string) ?? null;

  const db = getSupabase();
  await db.from("subscriptions").upsert(
    {
      paddle_subscription_id: subscriptionId,
      user_id: userId,
      paddle_price_id: priceId!,
      plan_tier: entry.planTier,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    },
    { onConflict: "paddle_subscription_id" },
  );

  await applyPlanAndGrant(userId, entry.planTier, entry.monthlyGrant, periodEnd, `sub_create:${subscriptionId}`);

  identifyPlan(userId, {
    plan_tier: entry.planTier,
    monthly_grant: entry.monthlyGrant,
    paddle_subscription_id: subscriptionId,
    paddle_price_id: priceId!,
    subscription_status: status,
    current_period_end: periodEnd,
    paddle_customer_id: (data as any).customerId ?? null,
  });

  log("info", "subscription.created applied", {
    sub: subscriptionId,
    user_id: userId,
    plan_tier: entry.planTier,
    monthly_grant: entry.monthlyGrant,
    period_end: periodEnd,
  });
}

async function handleSubscriptionUpdated(data: AnyData): Promise<void> {
  const subscriptionId = (data as any).id as string;
  const status = ((data as any).status as string) ?? "active";
  const periodStart = ((data as any).currentBillingPeriod?.startsAt as string) ?? null;
  const periodEnd = ((data as any).currentBillingPeriod?.endsAt as string) ?? null;
  const cancelFlag = Boolean((data as any).scheduledChange?.action === "cancel");

  const db = getSupabase();
  // Fetch current row to detect a renewal (period_end advanced).
  const { data: current } = await db
    .from("subscriptions")
    .select("user_id, plan_tier, paddle_price_id, current_period_end")
    .eq("paddle_subscription_id", subscriptionId)
    .maybeSingle();

  await db.from("subscriptions").update({
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelFlag,
  }).eq("paddle_subscription_id", subscriptionId);

  if (!current) {
    log("info", "subscription.updated for untracked sub (no local row)", { sub: subscriptionId, status });
    return;
  }

  const isRenewal =
    periodEnd &&
    current.current_period_end &&
    new Date(periodEnd as string).getTime() > new Date(current.current_period_end as string).getTime();

  identifyPlan(current.user_id as string, {
    plan_tier: current.plan_tier,
    paddle_subscription_id: subscriptionId,
    subscription_status: status,
    cancel_at_period_end: cancelFlag,
    current_period_end: periodEnd,
  });

  if (!isRenewal) {
    log("info", "subscription.updated (no renewal)", {
      sub: subscriptionId,
      user_id: current.user_id,
      status,
      cancel_at_period_end: cancelFlag,
    });
    return;
  }

  const entry = lookupPrice(current.paddle_price_id as string);
  if (!entry || entry.kind !== "subscription") {
    log("warn", "renewal skipped — price not in catalog", { sub: subscriptionId, price_id: current.paddle_price_id });
    return;
  }
  await applyPlanAndGrant(
    current.user_id as string,
    entry.planTier,
    entry.monthlyGrant,
    periodEnd,
    `sub_renew:${subscriptionId}:${periodEnd}`,
  );

  log("info", "subscription.updated renewed", {
    sub: subscriptionId,
    user_id: current.user_id,
    plan_tier: entry.planTier,
    monthly_grant: entry.monthlyGrant,
    period_end: periodEnd,
  });
}

async function handleSubscriptionCanceled(data: AnyData): Promise<void> {
  const subscriptionId = (data as any).id as string;
  const db = getSupabase();
  const { data: row } = await db
    .from("subscriptions")
    .select("user_id, plan_tier")
    .eq("paddle_subscription_id", subscriptionId)
    .maybeSingle();

  await db.from("subscriptions").update({
    status: "canceled",
    cancel_at_period_end: true,
  }).eq("paddle_subscription_id", subscriptionId);

  if (row?.user_id) {
    identifyPlan(row.user_id as string, {
      plan_tier: row.plan_tier,
      paddle_subscription_id: subscriptionId,
      subscription_status: "canceled",
      cancel_at_period_end: true,
    });
  }

  log("info", "subscription.canceled applied", {
    sub: subscriptionId,
    user_id: row?.user_id ?? null,
    plan_tier: row?.plan_tier ?? null,
  });
}

async function handleTransactionCompleted(data: AnyData): Promise<void> {
  // Credit-pack purchases come through as transaction.completed with no
  // subscription_id. Subscription bills also produce transaction.completed but
  // they're already covered by subscription.created / subscription.updated, so
  // we only grant here when the line item is a credit pack.
  const transactionId = (data as any).id as string;
  const items = (data as any).items;
  if (!Array.isArray(items) || items.length === 0) {
    log("info", "transaction.completed with no items", { tx: transactionId });
    return;
  }

  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "transaction.completed without resolvable userId", { tx: transactionId });
    return;
  }

  const db = getSupabase();
  let grantedTotal = 0;
  let grantedItems = 0;

  for (const item of items) {
    const priceId = (item.price?.id ?? item.priceId) as string | undefined;
    if (!priceId) continue;
    const entry = lookupPrice(priceId);
    if (!entry || entry.kind !== "credit_pack") continue;

    const quantity = Number(item.quantity ?? 1);
    const credits = entry.credits * Math.max(1, quantity);
    const amountCents = Number((item.totals?.total ?? item.unitPrice?.amount ?? 0));

    // Record the purchase. Idempotent via primary key on paddle_transaction_id.
    await db.from("credit_purchases").upsert(
      {
        paddle_transaction_id: transactionId,
        user_id: userId,
        paddle_price_id: priceId,
        credits_granted: credits,
        amount_usd_cents: amountCents,
        status: "completed",
      },
      { onConflict: "paddle_transaction_id" },
    );

    await adjustBalance({
      userId,
      amount: credits,
      kind: "purchase",
      reason: `credit_pack:${entry.packSize}`,
      idempotencyKey: `purchase:${transactionId}:${priceId}`,
    });

    grantedTotal += credits;
    grantedItems += 1;
  }

  if (grantedItems > 0) {
    // Bump person properties so PostHog reflects the latest pack purchase.
    identifyPlan(userId, {
      last_credit_purchase_tx: transactionId,
      last_credit_purchase_at: new Date().toISOString(),
    });
    log("info", "transaction.completed credit pack granted", {
      tx: transactionId,
      user_id: userId,
      credits: grantedTotal,
      items: grantedItems,
    });
  } else {
    log("info", "transaction.completed (no credit-pack items, subscription bill covered elsewhere)", {
      tx: transactionId,
      user_id: userId,
    });
  }
}

async function applyPlanAndGrant(
  userId: string,
  planTier: PlanTier,
  monthlyGrant: number,
  periodEnd: string | null,
  idempotencyKey: string,
): Promise<void> {
  const db = getSupabase();
  await db.from("user_billing").update({
    plan_tier: planTier,
    monthly_grant: monthlyGrant,
    period_end: periodEnd,
  }).eq("user_id", userId);

  await adjustBalance({
    userId,
    amount: monthlyGrant,
    kind: "grant",
    reason: `monthly_grant:${planTier}`,
    idempotencyKey,
  });

  log("info", "plan applied + monthly grant", {
    user_id: userId,
    plan_tier: planTier,
    monthly_grant: monthlyGrant,
    period_end: periodEnd,
    idempotency_key: idempotencyKey,
  });
}

// Bumps PostHog person properties so dashboards see the current plan_tier and
// subscription state. Fails open: PostHog outages must never block a webhook.
function identifyPlan(userId: string, properties: Record<string, unknown>): void {
  try {
    getPostHog().identify({ distinctId: userId, properties });
  } catch (err) {
    log("warn", "posthog identify failed (non-fatal)", {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
