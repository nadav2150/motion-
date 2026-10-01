// Webhook side of in-place plan changes (see api.billing.change-plan.tsx).
//
// The change-plan route writes a pending plan_changes row with the credits it
// expects to grant. Whichever provider event lands first applies that grant
// (keyed on the row id, so it happens once) and marks the row applied:
//   - Dodo: subscription.plan_changed, or a subscription.active/.renewed for
//     the restarted period if that arrives first.
//   - Polar: order.paid with billing_reason=subscription_update.
// A period event that arrives right after an applied change to the same tier
// must not also grant a full month — `recentPlanChange` lets the period
// handler detect that.

import { getSupabase } from "../supabase";
import { getPostHog } from "../posthog";
import { adjustBalance } from "./credits";
import { tierOf } from "./catalog";
import { changeDirection, planChangeGrant, remainingFraction } from "./plan-change";
import type { PlanTier } from "./plan-features";
import { logBillingAfter, webhookLog, type WebhookProvider } from "./webhook-apply";

// How long after a plan change a period event for the same tier is treated as
// part of that change rather than a genuine renewal.
const PLAN_CHANGE_WINDOW_MS = 30 * 60 * 1000;

type PlanChangeRow = {
  id: string;
  user_id: string;
  from_tier: string;
  to_tier: string;
  expected_grant: number;
  status: string;
  created_at: string;
};

export async function recentPlanChange(
  subscriptionId: string,
  toTier: PlanTier,
  now: number = Date.now(),
): Promise<PlanChangeRow | null> {
  const { data, error } = await getSupabase()
    .from("plan_changes")
    .select("id, user_id, from_tier, to_tier, expected_grant, status, created_at")
    .eq("provider_subscription_id", subscriptionId)
    .eq("to_tier", toTier)
    .in("status", ["pending", "applied"])
    .gte("created_at", new Date(now - PLAN_CHANGE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    // Table missing (migration not applied yet) must not break webhooks.
    console.warn(`[billing] plan_changes lookup failed: ${error.message}`);
    return null;
  }
  return (data as PlanChangeRow | null) ?? null;
}

export type ApplyPlanChangeArgs = {
  provider: WebhookProvider;
  userId: string;
  subscriptionId: string;
  toTier: PlanTier;
  monthlyGrant: number;
  periodEnd: string | null;
  // Used only when no plan_changes row exists (change made in the provider
  // dashboard): the tier and period we knew before the event.
  fallback: { fromTier: PlanTier; periodStart: string | null; periodEnd: string | null; key: string };
};

// Switch the user's tier/grant and apply the one-off upgrade grant once.
export async function applyPlanChange(args: ApplyPlanChangeArgs): Promise<void> {
  const { provider, userId, subscriptionId, toTier, monthlyGrant, periodEnd } = args;
  const db = getSupabase();
  const row = await recentPlanChange(subscriptionId, toTier);

  await db.from("user_billing").update({
    plan_tier: toTier,
    monthly_grant: monthlyGrant,
    ...(periodEnd ? { period_end: periodEnd } : {}),
  }).eq("user_id", userId);

  let fromTier: PlanTier;
  let grant: number;
  let key: string;
  if (row) {
    fromTier = tierOf(row.from_tier);
    grant = row.status === "pending" ? Number(row.expected_grant) : 0;
    key = `plan_change:${row.id}`;
  } else {
    fromTier = args.fallback.fromTier;
    grant = fromTier === toTier
      ? 0
      : planChangeGrant(provider, fromTier, toTier, remainingFraction(args.fallback.periodStart, args.fallback.periodEnd));
    key = args.fallback.key;
  }

  const applied = grant > 0
    ? await adjustBalance({ userId, amount: grant, kind: "grant", reason: `plan_change:${fromTier}->${toTier}`, idempotencyKey: key })
    : false;

  if (row && row.status === "pending") {
    await db.from("plan_changes").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", row.id);
  }

  webhookLog(provider, "info", "plan change applied", {
    user_id: userId,
    sub: subscriptionId,
    from: fromTier,
    to: toTier,
    grant: applied ? grant : 0,
    plan_change_id: row?.id,
  });
  try {
    getPostHog().capture({
      distinctId: userId,
      event: "subscription_plan_changed",
      properties: {
        provider,
        from_tier: fromTier,
        to_tier: toTier,
        direction: fromTier === toTier ? "same" : changeDirection(fromTier, toTier),
        credits_granted: applied ? grant : 0,
        via_app: Boolean(row),
      },
    });
  } catch {
    // best-effort
  }
  await logBillingAfter(provider, userId, `plan change (${fromTier}->${toTier})`, { credits_added: applied ? grant : 0 });
}
