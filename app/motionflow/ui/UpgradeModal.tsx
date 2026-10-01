// The v2 upgrade modal: one surface for every "you hit a wall" moment.
// Free users pick a plan (→ the existing /checkout page) or a one-time pack
// (→ hosted checkout directly). Subscribers switch plans in place
// (POST /api/billing/change-plan — never a second subscription) or top up.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Check, Coins, Crown, Sparkles, Zap, Users } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { cn, formatNumber } from "./format";
import { toast } from "./Toast";
import { getUsageSnapshot } from "./usage-store";
import { confirmPurchase } from "./purchase-return";
import type { UpsellRequest, UpsellTrigger } from "./upsell";
import { track } from "../../lib/analytics";
import {
  PACKS,
  PACK_SIZES,
  PLANS,
  cheapestTierWith,
  tierOf,
  tiersAbove,
  type PackSize,
  type PaidTier,
} from "../../lib/billing/catalog";
import { PLAN_FEATURES } from "../../lib/billing/plan-features";
import { estimateChargeToday } from "../../lib/billing/plan-change";
import { AlreadySubscribedError, changePlan, startCheckout } from "../../lib/billing/checkout-client";

const TIER_ICON = { starter: Zap, pro: Crown, studio: Users } as const;

type Copy = { title: string; description: string };

function copyFor(trigger: UpsellTrigger, ctx: UpsellRequest["context"], isFree: boolean): Copy {
  switch (trigger) {
    case "insufficient_credits":
      return {
        title: "You're out of credits for this one",
        description:
          ctx.needed != null && ctx.balance != null
            ? `This needs about ${formatNumber(ctx.needed)} credits and you have ${formatNumber(ctx.balance)}. Top up once or get credits every month.`
            : "Top up once or get fresh credits every month to keep creating.",
      };
    case "export_4k":
      return { title: "Export in crisp 4K", description: "4K export comes with Pro and Studio — perfect for big screens and ads." };
    case "watermark":
      return { title: "Remove the Videly watermark", description: "Every paid plan exports clean, watermark-free videos you can use commercially." };
    case "duration":
      return {
        title: `Make ${ctx.seconds ? `${ctx.seconds}-second` : "longer"} videos`,
        description: "Free videos are capped at 15 seconds. Starter goes to 30s, Pro and Studio to 60s.",
      };
    case "voiceover":
      return { title: "Add AI voiceover and music", description: "Bring your videos to life with natural voiceover and a soundtrack — included on every paid plan." };
    case "prompt_length":
      return { title: "Write without limits", description: "Free prompts are capped at 700 characters. Paid plans take full scripts." };
    case "first_preview":
      return { title: "Love your video? Make it yours", description: "Export without the watermark, add voiceover, and create longer videos." };
    case "low_credit_banner":
    case "plan_widget":
    default:
      return isFree
        ? { title: "Keep creating with Videly", description: "Get fresh credits every month, no watermark, voiceover and longer videos." }
        : { title: "Get more out of Videly", description: "Move up a plan for more monthly credits, or top up once." };
  }
}

function recommendFor(trigger: UpsellTrigger, ctx: UpsellRequest["context"], current: string, options: PaidTier[]): PaidTier | null {
  if (!options.length) return null;
  let pick: PaidTier | null = null;
  if (trigger === "export_4k") pick = cheapestTierWith("export4k");
  else if (trigger === "watermark" || trigger === "voiceover" || trigger === "prompt_length") pick = cheapestTierWith("audio");
  else if (trigger === "duration") pick = cheapestTierWith("maxStudioDuration", ctx.seconds ?? 30);
  else if (trigger === "insufficient_credits" && ctx.needed) {
    pick = options.find((t) => PLANS[t].monthlyCredits >= ctx.needed!) ?? null;
  }
  if (!pick || !options.includes(pick)) pick = options.includes("pro") ? "pro" : options[0]!;
  return pick;
}

function perksFor(tier: PaidTier): string[] {
  const f = PLAN_FEATURES[tier];
  const perks = [`${formatNumber(PLANS[tier].monthlyCredits)} credits / month`, `Videos up to ${f.maxStudioDuration}s`, "No watermark"];
  if (f.audio) perks.push("AI voiceover & music");
  if (f.export4k) perks.push("4K export");
  if (f.concurrentJobs > 2) perks.push(`${f.concurrentJobs} videos at once`);
  return perks;
}

export function UpgradeModal({ request, onClose }: { request: UpsellRequest | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const openedAt = useRef(0);
  const usage = request ? getUsageSnapshot() : null;
  const current = tierOf(usage?.planTier);
  const sub = usage?.subscription ?? null;
  const isFree = current === "free" || !sub;
  const options = tiersAbove(current);
  const trigger = request?.trigger ?? "plan_widget";
  const ctx = request?.context ?? {};
  const recommended = recommendFor(trigger, ctx, current, options);
  const copy = copyFor(trigger, ctx, isFree);
  const creditsFirst = trigger === "insufficient_credits" || trigger === "low_credit_banner";
  const perVideo = usage?.nextVideoCost && usage.nextVideoCost > 0 ? usage.nextVideoCost : null;

  useEffect(() => {
    if (!request) return;
    openedAt.current = Date.now();
    setBusy(null);
    track("paywall_viewed", {
      trigger: request.trigger,
      surface: request.context.surface ?? null,
      plan_tier: current,
      credits_balance: usage?.creditsBalance ?? null,
      recommended_tier: recommended,
      needed: request.context.needed ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const close = () => {
    if (busy) return;
    track("paywall_dismissed", { trigger, ms_open: Date.now() - openedAt.current });
    onClose();
  };

  const choosePlan = async (tier: PaidTier) => {
    track("upsell_cta_clicked", { trigger, action: isFree ? "subscribe" : "upgrade", target_tier: tier });
    if (isFree) {
      onClose();
      navigate(`/checkout?plan=${tier}&source=${trigger}`);
      return;
    }
    setBusy(tier);
    try {
      await changePlan(tier, trigger);
      onClose();
      toast(`Switching you to ${PLANS[tier].label}…`, "info");
      void confirmPurchase({ kind: "plan", tier });
    } catch (err) {
      setBusy(null);
      toast(err instanceof Error ? err.message : "Could not switch plans", "error");
    }
  };

  const choosePack = async (pack: PackSize) => {
    track("upsell_cta_clicked", { trigger, action: "pack", pack });
    setBusy(pack);
    try {
      await startCheckout({ pack, source: trigger });
    } catch (err) {
      setBusy(null);
      if (err instanceof AlreadySubscribedError) return; // packs never hit this
      toast(err instanceof Error ? err.message : "Could not open checkout", "error");
    }
  };

  const plans = options.length > 0 && (
    <section aria-label="Plans">
      <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-silver">
        {isFree ? "Monthly plans" : "Upgrade your plan"}
      </h3>
      {sub?.cancelAtPeriodEnd ? (
        <p className="rounded-xl border border-slate/50 bg-ink-800 p-3 text-sm text-silver">
          Your plan is set to cancel at the end of this period. Resume it in{" "}
          <button type="button" className="font-semibold text-coral hover:text-coral-400" onClick={() => { onClose(); navigate("/settings?tab=plans"); }}>
            Settings
          </button>{" "}
          to switch plans — or top up below.
        </p>
      ) : (
        <div className={cn("grid gap-3", options.length >= 3 ? "sm:grid-cols-3" : options.length === 2 ? "sm:grid-cols-2" : "")}>
          {options.map((tier) => {
            const p = PLANS[tier];
            const Icon = TIER_ICON[tier];
            const rec = tier === recommended;
            const charge = sub ? estimateChargeToday(sub.provider, current, tier, sub.remainingFraction) : null;
            return (
              <div
                key={tier}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-4",
                  rec ? "border-coral/70 bg-[linear-gradient(180deg,rgb(239_131_84/0.14),rgb(24_26_36/0.6))] shadow-[0_0_28px_-10px_rgb(239_131_84/0.7)]" : "border-slate/50 bg-ink-800",
                )}
              >
                {rec && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-coral px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
                    Recommended
                  </span>
                )}
                <div className="flex items-center gap-2 text-[15px] font-semibold text-paper">
                  <Icon className="size-4 text-coral" aria-hidden />
                  {p.label}
                </div>
                <p className="mt-1.5 text-paper">
                  <span className="text-2xl font-bold tabular-nums">${p.priceUsd}</span>
                  <span className="text-sm text-silver"> / month</span>
                </p>
                {perVideo && (
                  <p className="text-[12px] text-silver">≈ {Math.max(1, Math.floor(p.monthlyCredits / perVideo))} videos a month</p>
                )}
                <ul className="mt-3 space-y-1.5 text-[13px] text-[#d3d5da]">
                  {perksFor(tier).map((perk) => (
                    <li key={perk} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                      {perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-4">
                  <Button
                    variant={rec ? "primary" : "secondary"}
                    className="w-full"
                    loading={busy === tier}
                    disabled={busy !== null && busy !== tier}
                    onClick={() => choosePlan(tier)}
                    data-autofocus={rec ? true : undefined}
                  >
                    {isFree ? `Get ${p.label}` : `Switch to ${p.label}`}
                  </Button>
                  {charge != null && (
                    <p className="mt-1.5 text-center text-[11.5px] text-silver">≈ ${charge.toFixed(2)} today (estimate)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const packs = (
    <section aria-label="Credit packs">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-silver">
        <Coins className="size-3.5" aria-hidden />
        {options.length ? "Or top up once" : "Top up credits"} · never expire
      </h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {PACK_SIZES.map((size) => {
          const pk = PACKS[size];
          return (
            <button
              key={size}
              type="button"
              onClick={() => choosePack(size)}
              disabled={busy !== null}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border border-slate/50 bg-ink-800 px-3.5 py-3 text-left transition-colors hover:border-coral/60 hover:bg-coral/[0.06] disabled:opacity-50",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
              )}
            >
              <span>
                <span className="block text-sm font-semibold text-paper">+{formatNumber(pk.credits)}</span>
                <span className="block text-[11.5px] text-silver">
                  credits{perVideo ? ` · ≈ ${Math.max(1, Math.floor(pk.credits / perVideo))} videos` : ""}
                </span>
              </span>
              <span className="text-sm font-bold tabular-nums text-coral">{busy === size ? "…" : `$${pk.priceUsd}`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <Modal
      open={request !== null}
      onClose={close}
      title={copy.title}
      description={copy.description}
      size="lg"
      dismissible={busy === null}
    >
      <div className="space-y-5">
        {creditsFirst ? (
          <>
            {packs}
            {plans}
          </>
        ) : (
          <>
            {plans}
            {packs}
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate/40 pt-4 text-[13px]">
          <span className="flex items-center gap-1.5 text-silver">
            <Sparkles className="size-3.5 text-coral" aria-hidden />
            Secure checkout · cancel anytime
          </span>
          <span className="flex items-center gap-3">
            <button
              type="button"
              className="font-semibold text-silver hover:text-paper"
              onClick={() => {
                track("upsell_cta_clicked", { trigger, action: "compare" });
                onClose();
                navigate("/pricing");
              }}
            >
              Compare all plans
            </button>
            <Button variant="ghost" size="sm" onClick={close} disabled={busy !== null}>
              Maybe later
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
