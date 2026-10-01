// Plan + credit-pack catalog — the one place prices and credit grants live.
// Pure (no env, no I/O) so it is safe to import from both the browser bundle
// and server code. The Polar/Dodo catalogs read grants from here; the pricing,
// checkout and paywall screens read prices from here. What a buyer is actually
// charged is still the price on the Polar/Dodo product, so change both
// together.

import { PLAN_FEATURES, type PlanFeatures, type PlanTier } from "./plan-features";

export type PaidTier = Exclude<PlanTier, "free">;
export type PackSize = "small" | "medium" | "large";

export type PlanInfo = { label: string; priceUsd: number; monthlyCredits: number };
export type PackInfo = { label: string; priceUsd: number; credits: number };

export const FREE_SIGNUP_CREDITS = 3_100;

export const PLANS: Record<PaidTier, PlanInfo> = {
  starter: { label: "Starter", priceUsd: 19, monthlyCredits: 8_000 },
  pro: { label: "Pro", priceUsd: 49, monthlyCredits: 20_000 },
  studio: { label: "Studio", priceUsd: 149, monthlyCredits: 60_000 },
};

export const PACKS: Record<PackSize, PackInfo> = {
  small: { label: "Small", priceUsd: 13, credits: 5_000 },
  medium: { label: "Medium", priceUsd: 59, credits: 25_000 },
  large: { label: "Large", priceUsd: 159, credits: 75_000 },
};

export const PAID_TIERS: PaidTier[] = ["starter", "pro", "studio"];
export const PACK_SIZES: PackSize[] = ["small", "medium", "large"];

export const TIER_RANK: Record<PlanTier, number> = { free: 0, starter: 1, pro: 2, studio: 3 };

export function isTier(v: unknown): v is PaidTier {
  return v === "starter" || v === "pro" || v === "studio";
}

export function isPack(v: unknown): v is PackSize {
  return v === "small" || v === "medium" || v === "large";
}

export function tierOf(v: string | null | undefined): PlanTier {
  return v === "starter" || v === "pro" || v === "studio" ? v : "free";
}

// Paid tiers strictly above `tier`, cheapest first.
export function tiersAbove(tier: string | null | undefined): PaidTier[] {
  const rank = TIER_RANK[tierOf(tier)];
  return PAID_TIERS.filter((t) => TIER_RANK[t] > rank);
}

export function nextTier(tier: string | null | undefined): PaidTier | null {
  return tiersAbove(tier)[0] ?? null;
}

// Cheapest paid tier that unlocks a feature. Booleans must be true; numbers
// must reach `atLeast` (e.g. maxStudioDuration 30). Null when no tier has it.
export function cheapestTierWith(feature: keyof PlanFeatures, atLeast?: number): PaidTier | null {
  for (const t of PAID_TIERS) {
    const v = PLAN_FEATURES[t][feature];
    if (typeof v === "boolean" ? v : typeof v === "number" ? v >= (atLeast ?? 1) : v === null) return t;
  }
  return null;
}

export function formatCredits(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
