// Pure math for in-place plan changes — no I/O, unit tested.
//
// Credits granted on an upgrade must track the money charged, otherwise
// "buy Starter, upgrade tomorrow" would hand out a near-free extra month.
// - Dodo `prorated_immediately` restarts the billing period today and charges
//   the new price minus the unused share of the old one, so we grant the new
//   monthly batch minus the unused share of the old batch.
// - Polar `invoice` keeps the period and charges the prorated difference, so
//   we grant the prorated difference in credits.
// - Downgrades never grant (credits already held stay; the lower batch arrives
//   at the next renewal).

import { PLANS, TIER_RANK, type PaidTier } from "./catalog";
import type { PlanTier } from "./plan-features";
import type { SubscriptionProvider } from "./subscription";

export type ChangeDirection = "up" | "down";

export function changeDirection(from: PlanTier, to: PlanTier): ChangeDirection {
  return TIER_RANK[to] > TIER_RANK[from] ? "up" : "down";
}

// Share of the current period still unused, clamped to [0, 1]. Unknown dates
// count as a full period left (the conservative choice for grants).
export function remainingFraction(
  periodStart: string | null,
  periodEnd: string | null,
  now: number = Date.now(),
): number {
  const start = periodStart ? Date.parse(periodStart) : NaN;
  const end = periodEnd ? Date.parse(periodEnd) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.min(1, Math.max(0, (end - now) / (end - start)));
}

function grantOf(tier: PlanTier): number {
  return tier === "free" ? 0 : PLANS[tier as PaidTier].monthlyCredits;
}

function priceOf(tier: PlanTier): number {
  return tier === "free" ? 0 : PLANS[tier as PaidTier].priceUsd;
}

export function planChangeGrant(
  provider: SubscriptionProvider,
  from: PlanTier,
  to: PlanTier,
  fraction: number,
): number {
  if (changeDirection(from, to) === "down") return 0;
  const f = Math.min(1, Math.max(0, fraction));
  const oldGrant = grantOf(from);
  const newGrant = grantOf(to);
  if (provider === "dodo") return Math.max(0, newGrant - Math.round(oldGrant * f));
  return Math.max(0, Math.round((newGrant - oldGrant) * f));
}

// Estimated amount charged today, in USD (before tax). Shown as an estimate.
export function estimateChargeToday(
  provider: SubscriptionProvider,
  from: PlanTier,
  to: PlanTier,
  fraction: number,
): number {
  if (changeDirection(from, to) === "down") return 0;
  const f = Math.min(1, Math.max(0, fraction));
  const raw = provider === "dodo"
    ? priceOf(to) - priceOf(from) * f
    : (priceOf(to) - priceOf(from)) * f;
  return Math.max(0, Math.round(raw * 100) / 100);
}
