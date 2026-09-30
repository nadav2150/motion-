// Provider-agnostic side effects shared by the Polar and Dodo webhook routes:
// logging, plan + monthly grant application, PostHog identify, and the
// post-grant billing snapshot. Each route passes its provider so log lines and
// telemetry stay distinguishable ([polar-webhook] / polar_credits_applied vs
// [dodo-webhook] / dodo_credits_applied).

import { getSupabase } from "../supabase";
import { adjustBalance } from "./credits";
import { getPostHog } from "../posthog";
import type { PlanTier } from "./plan-features";

export type WebhookProvider = "polar" | "dodo";

export function webhookLog(
  provider: WebhookProvider,
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
) {
  const parts = [`[${provider}-webhook] ${msg}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  const line = parts.join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// After a grant/plan change, read the user's billing row back from Supabase and
// emit a single line showing the resulting plan + balance — so you can confirm
// at a glance that "webhook → DB → credits" actually landed. Mirrors the same
// snapshot to PostHog as an event so it shows up in the dashboard too.
export async function logBillingAfter(
  provider: WebhookProvider,
  userId: string,
  context: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const db = getSupabase();
  const { data, error } = await db
    .from("user_billing")
    .select("plan_tier, credits_balance, credits_reserved, monthly_grant, period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    webhookLog(provider, "warn", `${context}: could not read back billing state`, { user_id: userId, error: error.message });
    return;
  }
  webhookLog(provider, "info", `${context} ✓ billing now`, {
    user_id: userId,
    plan_tier: data?.plan_tier,
    credits_balance: data?.credits_balance,
    credits_reserved: data?.credits_reserved,
    monthly_grant: data?.monthly_grant,
    period_end: data?.period_end,
    ...extra,
  });
  try {
    getPostHog().capture({
      distinctId: userId,
      event: `${provider}_credits_applied`,
      properties: {
        context,
        plan_tier: data?.plan_tier,
        credits_balance: data?.credits_balance,
        monthly_grant: data?.monthly_grant,
        ...extra,
      },
    });
  } catch {
    // PostHog is best-effort; never let telemetry break the grant.
  }
}

export async function applyPlanAndGrant(
  provider: WebhookProvider,
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
  webhookLog(provider, "info", "plan applied + monthly grant", { user_id: userId, plan_tier: planTier, monthly_grant: monthlyGrant });
  await logBillingAfter(provider, userId, `plan applied (${planTier})`, { monthly_grant: monthlyGrant });
}

export function identifyPlan(provider: WebhookProvider, userId: string, properties: Record<string, unknown>): void {
  try {
    getPostHog().identify({ distinctId: userId, properties });
  } catch (err) {
    webhookLog(provider, "warn", "posthog identify failed (non-fatal)", {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
