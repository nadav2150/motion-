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
import type { PlanTier } from "../lib/billing/plan-features";

const SIGNATURE_HEADER = "paddle-signature";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!signature) {
    return Response.json({ error: "Missing paddle-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();
  const paddle = getPaddle();

  let event: Awaited<ReturnType<typeof paddle.webhooks.unmarshal>>;
  try {
    event = await paddle.webhooks.unmarshal(rawBody, getWebhookSecret(), signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[paddle-webhook] signature verify failed: ${msg}`);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!event) {
    return Response.json({ error: "Unparseable event" }, { status: 400 });
  }

  // Idempotency: only process each event id once.
  const db = getSupabase();
  const { error: dedupeErr } = await db
    .from("paddle_events")
    .insert({ event_id: event.eventId, event_type: event.eventType });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      // Already processed.
      return Response.json({ ok: true, deduped: true });
    }
    console.error(`[paddle-webhook] dedupe insert failed: ${dedupeErr.message}`);
    return Response.json({ error: "Dedupe failure" }, { status: 500 });
  }

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
        // Unhandled event types are still recorded in paddle_events for audit.
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[paddle-webhook] dispatch failed for ${event.eventType} (${event.eventId}): ${msg}`);
    // Return 500 so Paddle retries. dedupe row is already in place, so we let
    // the retry hit the same row again — that's OK because handlers are
    // idempotent on the ledger side.
    return Response.json({ error: "Dispatch failed" }, { status: 500 });
  }

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
  const userId = await resolveUserId(data);
  if (!userId) {
    console.warn(`[paddle-webhook] subscription.created without resolvable userId; sub=${(data as any).id}`);
    return;
  }
  const priceId = firstSubscriptionPriceId((data as any).items);
  const entry = priceId ? lookupPrice(priceId) : null;
  if (!entry || entry.kind !== "subscription") {
    console.warn(`[paddle-webhook] unknown subscription price ${priceId} on sub ${(data as any).id}`);
    return;
  }

  const subscriptionId = (data as any).id as string;
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

  if (!current) return;

  const isRenewal =
    periodEnd &&
    current.current_period_end &&
    new Date(periodEnd as string).getTime() > new Date(current.current_period_end as string).getTime();
  if (!isRenewal) return;

  const entry = lookupPrice(current.paddle_price_id as string);
  if (!entry || entry.kind !== "subscription") return;
  await applyPlanAndGrant(
    current.user_id as string,
    entry.planTier,
    entry.monthlyGrant,
    periodEnd,
    `sub_renew:${subscriptionId}:${periodEnd}`,
  );
}

async function handleSubscriptionCanceled(data: AnyData): Promise<void> {
  const subscriptionId = (data as any).id as string;
  const db = getSupabase();
  await db.from("subscriptions").update({
    status: "canceled",
    cancel_at_period_end: true,
  }).eq("paddle_subscription_id", subscriptionId);
}

async function handleTransactionCompleted(data: AnyData): Promise<void> {
  // Credit-pack purchases come through as transaction.completed with no
  // subscription_id. Subscription bills also produce transaction.completed but
  // they're already covered by subscription.created / subscription.updated, so
  // we only grant here when the line item is a credit pack.
  const items = (data as any).items;
  if (!Array.isArray(items) || items.length === 0) return;

  const userId = await resolveUserId(data);
  if (!userId) {
    console.warn(`[paddle-webhook] transaction.completed without resolvable userId; tx=${(data as any).id}`);
    return;
  }

  const transactionId = (data as any).id as string;
  const db = getSupabase();

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
}
