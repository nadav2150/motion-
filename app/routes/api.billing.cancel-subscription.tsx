// POST /api/billing/cancel-subscription — cancels the signed-in user's
// currently active Paddle subscription at the end of the billing period.
//
// Paddle's cancel() with no effective_from defaults to `next_billing_period`,
// which sets a `scheduled_change` on the subscription. Status stays `active`
// until the period ends; we mirror this locally by flipping
// `subscriptions.cancel_at_period_end = true`. The webhook
// (subscription.updated → subscription.canceled) will eventually overwrite
// this row with Paddle's authoritative state, but the optimistic update lets
// the UI confirm the action without waiting for the round-trip.

import type { Route } from "./+types/api.billing.cancel-subscription";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { getPaddle } from "../lib/billing/paddle";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);
  const db = getSupabase();

  const { data: sub, error: lookupErr } = await db
    .from("subscriptions")
    .select("paddle_subscription_id, status, cancel_at_period_end, current_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    console.error(`[billing] cancel subscription lookup failed for ${user.id}: ${lookupErr.message}`);
    return Response.json({ error: "Failed to load subscription" }, { status: 500, headers });
  }

  if (!sub) {
    return Response.json({ error: "No active subscription to cancel" }, { status: 400, headers });
  }

  if (sub.cancel_at_period_end) {
    return Response.json(
      { error: "Subscription is already scheduled to cancel", endsAt: sub.current_period_end },
      { status: 400, headers },
    );
  }

  const paddle = getPaddle();
  try {
    await paddle.subscriptions.cancel(sub.paddle_subscription_id as string, {
      effectiveFrom: "next_billing_period",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[billing] paddle cancel failed for ${user.id} sub=${sub.paddle_subscription_id}: ${msg}`);
    return Response.json({ error: "Paddle cancel failed" }, { status: 502, headers });
  }

  const { error: updateErr } = await db
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("paddle_subscription_id", sub.paddle_subscription_id);
  if (updateErr) {
    console.error(`[billing] local cancel mirror failed for ${user.id}: ${updateErr.message}`);
  }

  return Response.json(
    { ok: true, endsAt: sub.current_period_end },
    { headers },
  );
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
