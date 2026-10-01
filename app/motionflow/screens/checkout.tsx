import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  Loader2,
  Lock,
  Mail,
  Plus,
  ShieldCheck,
  Star,
  User,
  UserRound,
  X,
} from "lucide-react";
import { PACKS, PLANS } from "../../lib/billing/catalog";
import { Logo, LogoMark } from "../ui/Logo";
import { focusRing } from "../ui/Button";
import { cn } from "../ui/format";

export type CheckoutTier = "starter" | "pro" | "studio";
export type CheckoutPack = "small" | "medium" | "large";

const TIER_LABEL: Record<CheckoutTier, string> = {
  starter: "Videly Starter",
  pro: "Videly Pro",
  studio: "Videly Studio",
};
// Prices and grants come from the shared catalog (app/lib/billing/catalog.ts),
// which the Polar/Dodo webhook catalogs also read.
const TIER_MONTHLY_USD: Record<CheckoutTier, number> = {
  starter: PLANS.starter.priceUsd,
  pro: PLANS.pro.priceUsd,
  studio: PLANS.studio.priceUsd,
};
const TIER_MONTHLY_CREDITS: Record<CheckoutTier, number> = {
  starter: PLANS.starter.monthlyCredits,
  pro: PLANS.pro.monthlyCredits,
  studio: PLANS.studio.monthlyCredits,
};
// What each plan includes — surfaced in the "What's included" card above
// the account form. Mirrors PLANS[].perks in app/motionflow/screens/pricing.tsx;
// keep in sync when feature lists change.
const TIER_PERKS: Record<CheckoutTier, string[]> = {
  starter: [
    "Up to 10 scenes per film",
    "Voiceover, music, and SFX",
    "Vision critique on every scene",
    "Brand kit (logo + colors)",
    "No watermark · commercial use",
    "2 concurrent jobs",
  ],
  pro: [
    "Up to 14 scenes per film",
    "Everything in Starter",
    "One-click polish from comments",
    "4K export",
    "5 concurrent jobs",
  ],
  studio: [
    "Everything in Pro",
    "3 team seats included",
    "Programmatic API access",
    "10 concurrent jobs",
  ],
};
// Optional credit-pack add-on. Mirrors the PACKS table in pricing.tsx and
// the Polar credit-pack catalog (POLAR_<ENV>_PRODUCT_PACK_* in polar.ts). Keep
// all three in sync — pricing.tsx is the source of truth for the slider values
// users see, this map is the source of truth for the checkout total.
const PACK_LABEL: Record<CheckoutPack, string> = {
  small: "Credit Pack — Small",
  medium: "Credit Pack — Medium",
  large: "Credit Pack — Large",
};
const PACK_PRICE_USD: Record<CheckoutPack, number> = {
  small: PACKS.small.priceUsd,
  medium: PACKS.medium.priceUsd,
  large: PACKS.large.priceUsd,
};
const PACK_CREDITS: Record<CheckoutPack, number> = {
  small: PACKS.small.credits,
  medium: PACKS.medium.credits,
  large: PACKS.large.credits,
};

// Existing subscriber switching plans in place: only the copy changes.
export type CheckoutPlanChange = {
  fromLabel: string;
  direction: "up" | "down";
  // Estimated prorated charge today for the plan (excludes any pack).
  estimateUsd: number;
};

export function CheckoutScreen({
  onBack,
  onComplete,
  tier = "pro",
  pack = null,
  email,
  firstName,
  lastName,
  submitting = false,
  planChange = null,
  error = null,
}: {
  onBack?: () => void;
  onComplete?: (selected: { monthlyUsd: number; pack: CheckoutPack | null }) => void;
  tier?: CheckoutTier;
  pack?: CheckoutPack | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  submitting?: boolean;
  planChange?: CheckoutPlanChange | null;
  error?: string | null;
}) {
  const monthlyUsd = TIER_MONTHLY_USD[tier];
  // Pack price is a one-time charge added alongside the subscription in the
  // same Polar checkout. We show pre-tax totals here because Polar (merchant of
  // record) computes the final tax based on the customer's verified location at
  // the hosted checkout, so any estimate we render in-page would diverge from
  // the actual invoice.
  const packPrice = pack ? PACK_PRICE_USD[pack] : 0;
  const dueTodayRaw = (planChange ? planChange.estimateUsd : monthlyUsd) + packPrice;
  const dueToday = Number.isInteger(dueTodayRaw) ? dueTodayRaw : dueTodayRaw.toFixed(2);
  const credits = TIER_MONTHLY_CREDITS[tier].toLocaleString();
  const perks = [`${credits} credits per month`, ...TIER_PERKS[tier]];
  const shortName = TIER_LABEL[tier].replace("Videly ", "");

  return (
    <div className="vd-root relative min-h-screen overflow-x-hidden">
      <Glow />

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-10 sm:py-5">
        <Logo size={30} textClassName="text-[17px]" />

        {/* Full step indicator on desktop, compact chip on phones. */}
        <span className="rounded-full border border-slate/50 bg-ink/60 px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] text-silver md:hidden">
          1 / 3 · ACCOUNT
        </span>
        <ol className="hidden items-center gap-3.5 md:flex">
          <CoStep n={1} label="Account" active />
          <CoSep />
          <CoStep n={2} label="Payment" />
          <CoSep />
          <CoStep n={3} label="Done" />
        </ol>

        <button
          type="button"
          onClick={onBack}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-silver transition-colors hover:text-paper sm:px-2.5",
            focusRing,
          )}
        >
          <X className="size-4" aria-hidden />
          <span className="hidden sm:inline">Cancel</span>
          <span className="sr-only sm:hidden">Cancel</span>
        </button>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1200px] items-start gap-6 px-4 pb-14 pt-7 sm:px-10 sm:pb-20 sm:pt-12 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
        <div className="flex flex-col gap-6 sm:gap-8">
          <div className="lg:pl-9">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-silver">
              Upgrade to Videly
            </div>
            <h1 className="mt-2 text-[30px] font-bold leading-[1.08] tracking-[-0.03em] text-paper sm:text-[44px]">
              Complete your{" "}
              <span className="bg-gradient-to-r from-coral-600 via-coral to-[#FF9F5A] bg-clip-text text-transparent">
                upgrade
              </span>
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-silver sm:text-[17px]">
              Unlimited renders, premium engine, 4K export — start creating in seconds.
            </p>
          </div>

          <section className="rounded-2xl border border-slate/40 bg-ink-800/60 p-5 shadow-soft backdrop-blur-sm sm:p-7">
            <div className="flex items-center gap-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-coral/30 bg-coral/10 text-coral">
                <Star className="size-4 fill-current" aria-hidden />
              </span>
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-silver">
                What's included in {TIER_LABEL[tier]}
              </h2>
              <span className="hidden h-px flex-1 bg-white/[0.07] sm:block" />
            </div>
            <ul className="mt-5 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
              {perks.map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-[14.5px] text-paper/90">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-coral/45 bg-coral/10 text-coral">
                    <Check className="size-3.5" strokeWidth={2.75} aria-hidden />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center gap-2.5">
              <User className="size-4 text-coral" aria-hidden />
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-silver">Your account</h2>
            </div>
            <p className="mt-1.5 text-sm text-silver">Your upgrade applies to this Videly account.</p>

            <div className="mt-4 grid gap-4">
              <CoField label="Email address" icon={<Mail className="size-4" aria-hidden />}>
                <CoInput type="email" placeholder="you@example.com" defaultValue={email} autoComplete="email" readOnly />
              </CoField>
              <div className="grid gap-4 sm:grid-cols-2">
                <CoField label="First name" icon={<UserRound className="size-4" aria-hidden />}>
                  <CoInput placeholder="First name" defaultValue={firstName} autoComplete="given-name" />
                </CoField>
                <CoField label="Last name" icon={<UserRound className="size-4" aria-hidden />}>
                  <CoInput placeholder="Last name" defaultValue={lastName} autoComplete="family-name" />
                </CoField>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate/40 bg-ink/40 px-4 py-3 text-[13px] leading-snug text-silver">
              <Lock className="size-4 shrink-0 text-silver" aria-hidden />
              Payment details are collected securely by our payment processor once you continue.
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
          <div className="relative overflow-hidden rounded-3xl border border-coral/35 bg-gradient-to-b from-ink-800/95 to-ink-900/95 p-5 shadow-[0_30px_80px_-30px_rgb(239_131_84/0.45)] backdrop-blur-sm sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-coral/15 blur-[80px]"
            />

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-silver">
                  Order summary
                </span>
                <span className="rounded-lg border border-coral/60 bg-coral/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-coral">
                  {shortName} plan
                </span>
              </div>

              <div className="mt-6 flex items-start gap-3 border-b border-white/[0.07] pb-6 sm:gap-4">
                <span className="shrink-0 rounded-2xl shadow-[0_10px_30px_-8px_rgb(239_131_84/0.6)]">
                  <LogoMark size={64} className="size-12 sm:size-16" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-semibold tracking-[-0.01em] text-paper">{TIER_LABEL[tier]}</div>
                  <div className="mt-1 text-sm font-semibold text-coral sm:text-[15px]">{credits} credits/month</div>
                  <div className="mt-1 text-[12.5px] text-silver sm:text-[13px]">Billed monthly · Cancel anytime</div>
                </div>
                <div className="shrink-0 text-right text-xl font-bold tracking-[-0.02em] text-paper sm:text-2xl">
                  ${monthlyUsd}
                  <span className="block text-xs font-normal text-silver sm:ml-1 sm:inline sm:text-sm">/month</span>
                </div>
              </div>

              {pack && (
                <div className="flex items-start gap-4 border-b border-white/[0.07] py-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-coral/35 bg-coral/10 text-coral">
                    <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-paper">{PACK_LABEL[pack]}</div>
                    <div className="mt-0.5 text-[13px] font-semibold text-coral">
                      +{PACK_CREDITS[pack].toLocaleString()} credits
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-silver">One-time · never expires</div>
                  </div>
                  <div className="shrink-0 text-right text-[17px] font-semibold text-paper">
                    ${PACK_PRICE_USD[pack]}
                    <span className="ml-1 text-xs font-normal text-silver">once</span>
                  </div>
                </div>
              )}

              <div className="pt-6">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xl font-semibold text-paper sm:text-[22px]">
                    {planChange ? "Due today (estimate)" : "Due today"}
                  </span>
                  <span className="text-[28px] font-bold tracking-[-0.02em] text-paper sm:text-[32px]">
                    ${dueToday}
                    <span className="ml-1.5 text-base font-normal text-silver">USD</span>
                  </span>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-silver">
                  {planChange
                    ? planChange.direction === "up"
                      ? `Switching from ${planChange.fromLabel}: you're charged the prorated difference now, and your credits for the new plan are added right away. Tax may apply.`
                      : `Switching from ${planChange.fromLabel} takes effect now. Your current credits stay, and your next bill is $${monthlyUsd}/month.`
                    : "Local sales tax and any promo codes are applied at the secure checkout based on your billing location."}
                </p>
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate/40 bg-ink/40 px-4 py-3 text-[13px] text-silver">
                  <CalendarDays className="size-4 shrink-0" aria-hidden />
                  Renews monthly · Cancel anytime
                </div>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={() => onComplete?.({ monthlyUsd, pack })}
                className={cn(
                  "mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-coral-400 via-coral to-coral-600 px-4 text-[15px] font-semibold sm:text-base text-white shadow-[0_16px_40px_-12px_rgb(239_131_84/0.75),inset_0_1px_0_rgb(255_255_255/0.25)] transition-[filter,transform] hover:-translate-y-px hover:brightness-110 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:brightness-100",
                  focusRing,
                )}
              >
                {submitting && <Loader2 className="size-4 vd-spin" aria-hidden />}
                <span>
                  {planChange
                    ? submitting
                      ? "Switching your plan…"
                      : `Switch to ${shortName} · $${dueToday}`
                    : submitting
                      ? "Opening secure checkout…"
                      : `Continue to secure checkout · $${dueToday}`}
                </span>
                {!submitting && <ArrowRight className="size-[18px]" aria-hidden />}
              </button>
              {error && (
                <div role="alert" className="mt-3 text-[13px] leading-snug text-danger">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 rounded-2xl border border-slate/40 bg-ink-800/60 py-4 backdrop-blur-sm">
            <Trust icon={<CircleCheck className="size-6" aria-hidden />} title="Cancel anytime" sub="No questions asked" />
            <Trust icon={<ShieldCheck className="size-6" aria-hidden />} title="30-day guarantee" sub="Money-back guarantee" divided />
            <Trust icon={<Lock className="size-6" aria-hidden />} title="Secure checkout" sub="SSL encrypted" divided />
          </div>

          <p className="text-center text-[12.5px] leading-relaxed text-silver">
            By starting your subscription, you agree to our{" "}
            <Link to="/terms" className="font-medium text-paper underline underline-offset-2 hover:text-coral">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="font-medium text-paper underline underline-offset-2 hover:text-coral">
              Privacy Policy
            </Link>
            .
          </p>
        </aside>
      </main>
    </div>
  );
}

// Ambient glows, same recipe as the pricing page so the hand-off feels continuous.
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-48 top-24 size-[620px] rounded-full bg-slate/25 blur-[120px]" />
      <div className="absolute -right-40 top-10 size-[600px] rounded-full bg-coral/10 blur-[130px]" />
      <div className="absolute -bottom-40 left-1/3 h-[380px] w-[800px] rounded-full bg-slate/20 blur-[140px]" />
    </div>
  );
}

function CoStep({ n, label, active }: { n: number; label: string; active?: boolean }) {
  return (
    <li className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full font-mono text-xs font-semibold",
          active
            ? "bg-coral text-white shadow-[0_4px_16px_-2px_rgb(239_131_84/0.6)]"
            : "border border-slate/60 text-silver",
        )}
      >
        {n}
      </span>
      <span className={cn("text-[13.5px]", active ? "font-semibold text-paper" : "text-silver")}>{label}</span>
    </li>
  );
}

function CoSep() {
  return <li aria-hidden className="h-px w-5 bg-slate/60" />;
}

function CoField({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-paper/90">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-silver">{icon}</span>
        {children}
      </span>
    </label>
  );
}

function CoInput(props: {
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      {...props}
      type={props.type ?? "text"}
      defaultValue={props.defaultValue ?? ""}
      className="h-12 w-full rounded-xl border border-slate/50 bg-ink-950/50 pl-11 pr-4 text-[14.5px] text-paper outline-none transition-[border-color,box-shadow,background-color] placeholder:text-silver/60 hover:border-slate focus:border-coral/60 focus:bg-ink-950/70 focus:shadow-[0_0_0_4px_rgb(239_131_84/0.14)] read-only:text-paper/80"
    />
  );
}

function Trust({ icon, title, sub, divided }: { icon: ReactNode; title: string; sub: string; divided?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center px-2 text-center", divided && "border-l border-white/[0.07]")}>
      <span className="text-coral">{icon}</span>
      <span className="mt-2 text-[13px] font-semibold text-paper sm:text-sm">{title}</span>
      <span className="mt-0.5 text-[11.5px] text-silver sm:text-[12.5px]">{sub}</span>
    </div>
  );
}
