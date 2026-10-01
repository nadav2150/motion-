// Soft, dismissible banner at the top of the app when credits run low.
// - "empty": balance can't cover the next typical video (usage.lowCredit).
// - "low":   paid plan under 25% of its monthly grant.
// A dismissal is remembered per bucket for 7 days; dropping into a lower
// bucket shows it again.

import { useEffect, useState } from "react";
import { Coins, X } from "lucide-react";
import { cn, formatNumber } from "./format";
import { focusRing } from "./Button";
import { openUpsell } from "./upsell";
import type { UsageInfo } from "./api";
import { track } from "../../lib/analytics";
import { PLANS, nextTier } from "../../lib/billing/catalog";

const STORAGE_KEY = "videly.lowCreditBanner.dismissed";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const BUCKET_RANK = { low: 1, empty: 2 } as const;
type Bucket = keyof typeof BUCKET_RANK;

function bucketFor(u: UsageInfo): Bucket | null {
  if (u.lowCredit) return "empty";
  if (u.planTier !== "free" && u.creditsMonthly > 0 && u.creditsBalance < u.creditsMonthly * 0.25) return "low";
  return null;
}

function isDismissed(bucket: Bucket): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw) as { bucket: Bucket; at: number };
    if (Date.now() - d.at > SNOOZE_MS) return false;
    return BUCKET_RANK[bucket] <= BUCKET_RANK[d.bucket];
  } catch {
    return false;
  }
}

function remember(bucket: Bucket) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bucket, at: Date.now() }));
  } catch {
    // storage blocked: the banner just comes back next visit
  }
}

export function LowCreditBanner({ usage }: { usage: UsageInfo | null }) {
  const bucket = usage ? bucketFor(usage) : null;
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!bucket) return setHidden(true);
    const dismissed = isDismissed(bucket);
    setHidden(dismissed);
    if (!dismissed) track("low_credit_banner_viewed", { bucket, credits_balance: usage?.creditsBalance, plan_tier: usage?.planTier });
    // Re-evaluate only when the bucket changes, not on every balance tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  if (!usage || !bucket || hidden) return null;

  const isFree = usage.planTier === "free";
  const up = nextTier(usage.planTier);
  const message = isFree
    ? bucket === "empty"
      ? `You have ${formatNumber(usage.creditsBalance)} credits left — not enough for another video. Starter gives you ${formatNumber(PLANS.starter.monthlyCredits)} every month.`
      : `You have ${formatNumber(usage.creditsBalance)} credits left.`
    : bucket === "empty"
      ? `You have ${formatNumber(usage.creditsBalance)} credits left — not enough for another video. Top up or ${up ? `move to ${PLANS[up].label}` : "add a pack"}.`
      : `Running low: ${formatNumber(usage.creditsBalance)} of ${formatNumber(usage.creditsMonthly)} monthly credits left.`;

  return (
    <div
      role="status"
      className={cn(
        "mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
        bucket === "empty" ? "border-coral/45 bg-coral/[0.09]" : "border-slate/50 bg-ink-800",
      )}
    >
      <Coins className="size-4 shrink-0 text-coral" aria-hidden />
      <p className="min-w-0 flex-1 text-[#e4e5e8]">{message}</p>
      <button
        type="button"
        onClick={() => {
          track("low_credit_banner_clicked", { bucket, credits_balance: usage.creditsBalance });
          openUpsell("low_credit_banner", { balance: usage.creditsBalance, needed: usage.nextVideoCost, surface: "banner" });
        }}
        className={cn("shrink-0 rounded-lg bg-coral px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-coral-400", focusRing)}
      >
        {isFree ? "Upgrade" : "Get credits"}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          remember(bucket);
          setHidden(true);
          track("low_credit_banner_dismissed", { bucket, credits_balance: usage.creditsBalance });
        }}
        className={cn("shrink-0 rounded-lg p-1 text-silver hover:bg-slate/30 hover:text-paper", focusRing)}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
