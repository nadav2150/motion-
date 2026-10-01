// POST /api/billing/change-plan — switch the signed-in user's live
// subscription to another tier in place (no second subscription).
//
// Body: { tier, source? }
//   - Dodo: POST /subscriptions/:id/change-plan, prorated_immediately for an
//     upgrade (charges the difference now, restarts the period) and do_not_bill
//     for a downgrade (lower price from the next renewal).
//   - Polar: subscriptions.update productId, prorationBehavior invoice for an
//     upgrade and next_period for a downgrade.
// The provider is picked from the subscription id, like cancel-subscription.
//
// We record the change in plan_changes with the credits we expect to grant;
// the provider webhook applies the tier + grant (see
// lib/billing/plan-change.server.ts). No optimistic tier update — the client
// polls /api/me/usage until the webhook lands.

import type { Route } from "./+types/api.billing.change-plan";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { getPolar, productIdForTier } from "../lib/billing/polar";
import { changePlan as dodoChangePlan, dodoEnv, dodoProductIdForTier } from "../lib/billing/dodo";
import { isTier } from "../lib/billing/catalog";
import { findActiveSubscription } from "../lib/billing/subscription";
import { changeDirection, estimateChargeToday, planChangeGrant, remainingFraction } from "../lib/billing/plan-change";
import { getPostHog } from "../lib/posthog";

type Body = { tier?: string; source?: string | null };

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);
  const body = (await request.json().catch(() => ({}))) as Body;
  const tier = body.tier;
  if (!isTier(tier)) {
    return Response.json({ error: `Invalid tier "${tier}"` }, { status: 400, headers });
  }

  let sub;
  try {
    sub = await findActiveSubscription(user.id);
  } catch (err) {
    console.error(`[change-plan] ${err instanceof Error ? err.message : String(err)} user=${user.id}`);
    return Response.json({ error: "Failed to load subscription" }, { status: 500, headers });
  }
  if (!sub) {
    return Response.json({ error: "no_subscription" }, { status: 400, headers });
  }
  if (sub.planTier === tier) {
    return Response.json({ error: "already_on_plan" }, { status: 400, headers });
  }
  if (sub.cancelAtPeriodEnd) {
    return Response.json(
      { error: "pending_cancel", detail: "This subscription is set to cancel. Resume it before switching plans." },
      { status: 409, headers },
    );
  }

  const productId = sub.provider === "dodo" ? dodoProductIdForTier(tier) : productIdForTier(tier);
  if (!productId) {
    console.error(`[change-plan] no ${sub.provider} product for tier=${tier}`);
    return Response.json({ error: "Billing is not configured for this plan" }, { status: 500, headers });
  }

  const direction = changeDirection(sub.planTier, tier);
  const fraction = remainingFraction(sub.currentPeriodStart, sub.currentPeriodEnd);
  const expectedGrant = planChangeGrant(sub.provider, sub.planTier, tier, fraction);
  const estimate = estimateChargeToday(sub.provider, sub.planTier, tier, fraction);

  const db = getSupabase();
  const { data: row, error: insertErr } = await db
    .from("plan_changes")
    .insert({
      user_id: user.id,
      provider: sub.provider,
      provider_subscription_id: sub.providerSubscriptionId,
      from_tier: sub.planTier,
      to_tier: tier,
      direction,
      remaining_fraction: fraction,
      expected_grant: expectedGrant,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    console.error(`[change-plan] plan_changes insert failed user=${user.id}: ${insertErr?.message ?? "no row"}`);
    return Response.json({ error: "Could not start plan change" }, { status: 500, headers });
  }

  console.log(
    `[change-plan] user=${user.id} sub=${sub.providerSubscriptionId} ${sub.planTier}->${tier} ` +
      `provider=${sub.provider} fraction=${fraction.toFixed(3)} expected_grant=${expectedGrant}`,
  );

  try {
    if (sub.provider === "dodo") {
      await dodoChangePlan(sub.providerSubscriptionId, productId, direction === "up" ? "prorated_immediately" : "do_not_bill");
    } else {
      await getPolar().subscriptions.update({
        id: sub.providerSubscriptionId,
        subscriptionUpdate: { productId, prorationBehavior: direction === "up" ? "invoice" : "next_period" },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[change-plan] ${sub.provider} change failed user=${user.id} sub=${sub.providerSubscriptionId}: ${msg}`);
    await db.from("plan_changes").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", row.id);
    const expose = sub.provider === "dodo" ? dodoEnv() !== "live_mode" : (process.env.POLAR_ENV ?? "sandbox") !== "production";
    return Response.json(
      { error: "plan_change_failed", ...(expose ? { detail: msg } : {}) },
      { status: 502, headers },
    );
  }

  try {
    getPostHog().capture({
      distinctId: user.id,
      event: "plan_change_requested_server",
      properties: {
        provider: sub.provider,
        from_tier: sub.planTier,
        to_tier: tier,
        direction,
        expected_grant: expectedGrant,
        estimated_charge_usd: estimate,
        source: typeof body.source === "string" ? body.source.slice(0, 40) : null,
      },
    });
  } catch {
    // best-effort
  }

  return Response.json({ ok: true, tier, direction, expectedGrant, estimatedChargeUsd: estimate }, { headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
