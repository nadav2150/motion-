// Client-side checkout: ask our server for a hosted-checkout URL (Polar or
// Dodo), then redirect the browser to it. Product ids stay server-side — the
// browser only sends the chosen tier/pack.

import { track } from "../analytics";

export type StartCheckoutArgs = {
  tier?: "starter" | "pro" | "studio" | null;
  pack?: "small" | "medium" | "large" | null;
  // Upsell surface that sent the buyer (analytics only).
  source?: string | null;
};

// The user already pays for a plan: switch it with changePlan() instead.
export class AlreadySubscribedError extends Error {
  constructor(public currentTier: string, public changePlanAvailable: boolean) {
    super("You already have a subscription. Switch plans instead.");
    this.name = "AlreadySubscribedError";
  }
}

export async function startCheckout(args: StartCheckoutArgs): Promise<void> {
  const tier = args.tier ?? null;
  const pack = args.pack ?? null;
  track("checkout_started", { kind: tier ? "subscription" : "pack", tier, pack, source: args.source ?? null });
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, pack, source: args.source ?? null }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      currentTier?: string;
      changePlanAvailable?: boolean;
    };
    if (res.status === 409 && body.error === "already_subscribed") {
      track("checkout_blocked_already_subscribed", { tier, current_tier: body.currentTier });
      throw new AlreadySubscribedError(body.currentTier ?? "", body.changePlanAvailable !== false);
    }
    track("checkout_failed", { tier, pack, status: res.status, error: body.error });
    throw new Error(body.detail ?? body.error ?? `Checkout failed (${res.status})`);
  }
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error("Checkout response missing url");
  window.location.href = url;
}

export type ChangePlanResult = {
  tier: string;
  direction: "up" | "down";
  expectedGrant: number;
  estimatedChargeUsd: number;
};

const CHANGE_PLAN_ERRORS: Record<string, string> = {
  no_subscription: "You don't have an active plan to switch.",
  already_on_plan: "You're already on this plan.",
  pending_cancel: "Your plan is set to cancel. Resume it before switching plans.",
  plan_change_failed: "Your payment provider declined the change. Check your card and try again.",
};

export async function changePlan(tier: "starter" | "pro" | "studio", source?: string | null): Promise<ChangePlanResult> {
  track("plan_change_requested", { to_tier: tier, source: source ?? null });
  const res = await fetch("/api/billing/change-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, source: source ?? null }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<ChangePlanResult> & { error?: string; detail?: string };
  if (!res.ok) {
    track("plan_change_failed", { to_tier: tier, status: res.status, error: body.error });
    throw new Error(CHANGE_PLAN_ERRORS[body.error ?? ""] ?? body.detail ?? body.error ?? `Plan change failed (${res.status})`);
  }
  track("plan_change_succeeded", { to_tier: tier, direction: body.direction, source: source ?? null });
  return body as ChangePlanResult;
}
