// Shared lookup of a user's live subscription. Used by checkout (to stop a
// paying user from opening a second subscription), change-plan and cancel.
// A subscription always lives in one provider: Dodo ids start with "sub_",
// everything else is Polar — whichever provider is currently selling.

import { getSupabase } from "../supabase";
import { tierOf } from "./catalog";
import type { PlanTier } from "./plan-features";

export type SubscriptionProvider = "polar" | "dodo";

export type ActiveSubscription = {
  providerSubscriptionId: string;
  provider: SubscriptionProvider;
  planTier: PlanTier;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

export function providerOf(subscriptionId: string): SubscriptionProvider {
  return subscriptionId.startsWith("sub_") ? "dodo" : "polar";
}

// Newest active/trialing subscription, or null. Throws on a DB error so the
// caller can answer 500 instead of guessing the user has no plan.
export async function findActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  const { data, error } = await getSupabase()
    .from("subscriptions")
    .select("provider_subscription_id, plan_tier, status, cancel_at_period_end, current_period_start, current_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`subscription lookup failed: ${error.message}`);
  if (!data) return null;
  const id = data.provider_subscription_id as string;
  return {
    providerSubscriptionId: id,
    provider: providerOf(id),
    planTier: tierOf(data.plan_tier as string | null),
    status: data.status as string,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    currentPeriodStart: (data.current_period_start as string | null) ?? null,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
  };
}
