import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Box,
  Check,
  Crown,
  Headphones,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { MarketingFooter, MarketingHeader } from "../ui/marketing";
import { photo, type PhotoKey } from "../ui/showcase";
import { cn } from "../ui/format";

// Subscription tiers shown on /pricing. Numbers come from the real billing
// catalog: polar.ts / dodo.ts buildCatalog() grants + checkout.tsx
// TIER_MONTHLY_USD + plan-features.ts PLAN_FEATURES. Keep all of them in sync
// when prices or grants change.
export type PricingTierKey = "free" | "starter" | "pro" | "studio";

// Add-on credit packs, optional per tier. Slider snaps to one of the 4
// stops; "none" = no add-on (default). The three paid sizes map to the
// credit-pack products (POLAR_*/DODO_* PRODUCT_PACK_*).
export type PackKey = "none" | "small" | "medium" | "large";

type Plan = {
  key: PricingTierKey;
  name: string;
  tagline: string;
  monthlyUsd: number;
  baseCredits: number;
  icon: LucideIcon;
  // Accent drives the icon tile, slider, checks and CTA.
  accent: string;
  gradient: string;
  cta: string;
  popular?: boolean;
  perks: string[];
};

const PACK_VALUES: Record<PackKey, number> = { none: 0, small: 5_000, medium: 25_000, large: 75_000 };
const PACK_PRICE_USD: Record<PackKey, number> = { none: 0, small: 13, medium: 59, large: 159 };
const PACK_STOPS: PackKey[] = ["none", "small", "medium", "large"];
const PACK_MAX_CREDITS = PACK_VALUES.large;

const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Get started and explore Videly.",
    monthlyUsd: 0,
    baseCredits: 3_100,
    icon: Box,
    accent: "#BFC0C0",
    gradient: "linear-gradient(135deg, #4F5D75 0%, #BFC0C0 100%)",
    cta: "Get started free",
    perks: [
      "3,100 credits / month",
      "Up to 2 scenes per film",
      "Community templates",
      "Videly watermark",
      "1 concurrent job",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    tagline: "For founders shipping launch films solo.",
    monthlyUsd: 19,
    baseCredits: 8_000,
    icon: Zap,
    accent: "#EF8354",
    gradient: "linear-gradient(90deg, #D96C3D 0%, #F39A73 100%)",
    cta: "Get Starter",
    perks: [
      "8,000 credits / month",
      "Up to 10 scenes per film",
      "Voiceover · music · SFX",
      "Vision critique on every scene",
      "Brand kit (logo + colors)",
      "No watermark · commercial use",
      "2 concurrent jobs",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "For teams iterating on launches every week.",
    monthlyUsd: 49,
    baseCredits: 20_000,
    icon: Crown,
    accent: "#A78BFA",
    gradient: "linear-gradient(90deg, #A855F7 0%, #818CF8 50%, #22D3EE 100%)",
    cta: "Get Pro",
    popular: true,
    perks: [
      "20,000 credits / month",
      "Up to 14 scenes per film",
      "Everything in Starter",
      "One-click polish from comments",
      "4K export",
      "5 concurrent jobs",
    ],
  },
  {
    key: "studio",
    name: "Studio",
    tagline: "For agencies and in-house content engines.",
    monthlyUsd: 149,
    baseCredits: 60_000,
    icon: Users,
    accent: "#22D3EE",
    gradient: "linear-gradient(90deg, #0EA5E9 0%, #22D3EE 100%)",
    cta: "Get Studio",
    perks: [
      "60,000 credits / month",
      "Everything in Pro",
      "3 team seats included",
      "Programmatic API access",
      "10 concurrent jobs",
    ],
  },
];

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Zap, title: "Add credits anytime", body: "Top up with one-time packs whenever you need more." },
  { icon: RefreshCw, title: "No long-term contracts", body: "Cancel anytime and keep your credits until the period ends." },
  { icon: ShieldCheck, title: "Secure payments", body: "Checkout and card details are handled by our payment processor." },
  { icon: Headphones, title: "Real humans on support", body: "Email support@videly.io and we reply within 2 business days." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is a credit?",
    a: "Credits meter the AI cost of your film. A full 14-scene Pro film with audio and critique runs ~20,000 credits. Simpler HTML-only films run far less.",
  },
  {
    q: "What happens if I run out mid-job?",
    a: "Generations are reserved upfront — a job never starts unless your balance covers the worst case. You'll see a clean shortfall message and a one-click top-up.",
  },
  {
    q: "Do unused credits roll over?",
    a: "Plan credits reset each billing period. One-time pack credits never expire and stack with your monthly grant.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes — upgrade instantly or downgrade at the end of your cycle. We pro-rate the difference where applicable.",
  },
];

function packForCredits(credits: number): PackKey {
  // Snap a raw credit count to the nearest pack stop (distance in credit-space
  // so the snap feels right on the slider track).
  let best: PackKey = "none";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const stop of PACK_STOPS) {
    const d = Math.abs(PACK_VALUES[stop] - credits);
    if (d < bestDist) {
      bestDist = d;
      best = stop;
    }
  }
  return best;
}

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace(".0K", "K") : String(n));

export function PricingScreen({
  onSelectTier,
  isAuthed = false,
}: {
  // Click on a tier's CTA. Caller routes free → /register, paid → /checkout.
  onSelectTier?: (tier: PricingTierKey, pack: PackKey) => void;
  isAuthed?: boolean;
}) {
  // Per-card pack selection so users can explore add-ons across plans without
  // losing state.
  const [packs, setPacks] = useState<Record<PricingTierKey, PackKey>>({
    free: "none",
    starter: "none",
    pro: "none",
    studio: "none",
  });

  return (
    <div className="vd-root relative min-h-screen overflow-x-hidden">
      <MarketingHeader isAuthed={isAuthed} />
      <main className="relative">
        <Glow />

        <section className="relative mx-auto max-w-[1440px] px-4 pb-6 pt-14 text-center sm:px-6 lg:pt-20">
          <HeroMedia />
          <div className="relative z-10 mx-auto max-w-[720px]">
            <span className="inline-flex rounded-full border border-coral/40 bg-coral/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-coral">
              Pricing
            </span>
            <h1 className="mt-5 text-[40px] font-bold leading-[1.02] tracking-[-0.035em] text-paper sm:text-6xl lg:text-[68px]">
              Plans that grow
              <span className="block bg-gradient-to-r from-coral-600 via-coral to-[#FF9F5A] bg-clip-text text-transparent">
                with your ambitions
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-[560px] text-base leading-relaxed text-silver sm:text-[17px]">
              Create stunning motion videos for your product, brand and social media. Pick a plan, add credits anytime,
              and start creating today.
            </p>
          </div>
        </section>

        <section className="relative z-10 mx-auto grid max-w-[1320px] gap-5 px-4 pt-8 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              packKey={packs[plan.key]}
              onPackChange={(next) => setPacks((prev) => ({ ...prev, [plan.key]: next }))}
              onChoose={() => onSelectTier?.(plan.key, packs[plan.key])}
            />
          ))}
        </section>

        <section className="relative z-10 mx-auto grid max-w-[1240px] gap-8 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 text-left">
              <Icon className="mt-0.5 size-7 shrink-0 text-silver" strokeWidth={1.5} aria-hidden />
              <div>
                <div className="text-[15px] font-semibold text-paper">{title}</div>
                <p className="mt-1 text-sm leading-relaxed text-silver">{body}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="relative z-10 mx-auto max-w-[1100px] px-4 pb-20 sm:px-6">
          <div className="mb-8 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">FAQ</div>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.025em] text-paper sm:text-[32px]">
              Questions about credits &amp; pricing
            </h2>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            {FAQ.map((it) => (
              <div key={it.q} className="rounded-2xl border border-slate/40 bg-ink-800/60 p-5 text-left">
                <div className="text-[15px] font-semibold text-paper">{it.q}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-silver">{it.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

// Ambient glows: coral from the lower left, violet/blue from the right.
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 top-[520px] size-[700px] rounded-full bg-coral/15 blur-[120px]" />
      <div className="absolute -right-40 top-40 size-[640px] rounded-full bg-[#6D5BF5]/15 blur-[120px]" />
      <div className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-coral/10 blur-[140px]" />
    </div>
  );
}

// Decorative floating video cards around the hero (wide screens only).
function HeroMedia() {
  return (
    // Each side is its own 400px column pinned to the page edge, so the
    // clusters can never reach the centered headline (~560px wide).
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-4 hidden min-[1440px]:block">
      <div className="absolute -left-8 top-0 h-[300px] w-[400px]">
        <div className="absolute left-0 top-6 w-[260px] -rotate-6">
          <VideoTile photoKey="phoneApp" label="Product Launch" time="0:28" className="h-[172px]" big />
        </div>
        <div className="absolute left-[266px] top-0 flex -rotate-6 flex-col gap-1.5 rounded-xl border border-slate/50 bg-ink-800/80 p-2 text-left text-[13px] text-paper/90 shadow-lift backdrop-blur">
          {["Ideas", "Script", "Visuals", "Voiceover", "Export"].map((s) => (
            <span key={s} className="rounded-md bg-ink/70 px-3 py-1.5">
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute -right-8 top-0 h-[320px] w-[400px]">
        <div className="absolute left-10 top-0 w-[175px] -rotate-[10deg]">
          <VideoTile photoKey="phoneApp" label="App Promo" className="h-[112px]" />
        </div>
        <div className="absolute right-0 top-6 w-[175px] rotate-[10deg]">
          <VideoTile photoKey="creatorCamera" label="Brand Story" className="h-[118px]" />
        </div>
        <div className="absolute left-14 top-[135px] w-[160px] rotate-[10deg]">
          <VideoTile photoKey="office" label="Feature Demo" className="h-[104px]" />
        </div>
        <div className="absolute right-6 top-[170px] w-[150px] rotate-[12deg]">
          <VideoTile photoKey="concertCrowd" label="Social Ad" className="h-[100px]" />
        </div>
      </div>
    </div>
  );
}

function VideoTile({
  photoKey,
  label,
  time,
  className,
  big = false,
}: {
  photoKey: PhotoKey;
  label: string;
  time?: string;
  className?: string;
  big?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/15 shadow-lift", className)}>
      <img src={photo(photoKey, 480)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-coral/10" />
      {big && (
        <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 backdrop-blur">
          <Play className="ml-0.5 size-6 fill-white text-white" />
        </span>
      )}
      <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-2 text-left">
        <Play className="size-3.5 shrink-0 fill-white text-white" />
        <span className={cn("font-semibold text-white", big ? "text-lg" : "text-[13px]")}>{label}</span>
        {time && <span className="ml-auto text-sm text-white/85">{time}</span>}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  packKey,
  onPackChange,
  onChoose,
}: {
  plan: Plan;
  packKey: PackKey;
  onPackChange: (next: PackKey) => void;
  onChoose: () => void;
}) {
  const Icon = plan.icon;
  const extraCredits = PACK_VALUES[packKey];
  const extraPrice = PACK_PRICE_USD[packKey];
  const totalCredits = plan.baseCredits + extraCredits;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border p-6 backdrop-blur-sm transition-shadow",
        plan.popular
          ? "border-[#8B5CF6]/70 bg-gradient-to-b from-[#2A2346]/90 to-ink-900/90 shadow-[0_30px_80px_-30px_rgba(139,92,246,0.55)]"
          : "border-slate/40 bg-ink-800/70 shadow-soft",
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 right-5 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] px-3.5 py-1 text-xs font-semibold text-white shadow-lg">
          Most Popular
        </span>
      )}

      <div className="flex items-start gap-3.5">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-xl border"
          style={{ borderColor: `${plan.accent}55`, background: `${plan.accent}1A`, color: plan.accent }}
        >
          <Icon className="size-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-paper">{plan.name}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-silver">{plan.tagline}</p>
        </div>
      </div>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-xl font-semibold text-paper">$</span>
        <span className="text-5xl font-bold leading-none tracking-[-0.03em] text-paper">{plan.monthlyUsd}</span>
        <span className="ml-1.5 text-sm text-silver">/ month</span>
      </div>

      {plan.key === "free" ? (
        <div className="mt-6 border-t border-slate/40" />
      ) : (
        <div className="mt-6">
          <CreditSlider
            value={extraCredits}
            accent={plan.accent}
            gradient={plan.gradient}
            onChange={(v) => onPackChange(packForCredits(v))}
            label={`Extra credits for ${plan.name}`}
          />
          <div className="mt-1.5 flex justify-between text-xs text-silver">
            <span>{compact(plan.baseCredits)}</span>
            <span>{compact(plan.baseCredits + PACK_MAX_CREDITS)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate/45 bg-ink-950/60 px-3.5 py-3 text-sm">
            <span className="font-medium text-paper">
              {totalCredits.toLocaleString("en-US")} credits
              {extraCredits === 0 && <span className="text-silver"> / month</span>}
            </span>
            <span className="whitespace-nowrap font-semibold" style={{ color: plan.accent }}>
              +${extraPrice}
              {extraPrice > 0 && <span className="font-normal text-silver"> once</span>}
            </span>
          </div>
        </div>
      )}

      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-3 text-sm text-paper/90">
            <CheckBox accent={plan.accent} muted={plan.key === "free"} />
            {perk}
          </li>
        ))}
      </ul>

      <PlanCta plan={plan} onClick={onChoose}>
        {plan.cta}
      </PlanCta>
    </div>
  );
}

function CheckBox({ accent, muted }: { accent: string; muted: boolean }) {
  return (
    <span
      className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border"
      style={
        muted
          ? { borderColor: "rgb(191 192 192 / 0.45)", color: "#BFC0C0" }
          : { borderColor: `${accent}80`, background: `${accent}1F`, color: accent }
      }
    >
      <Check className="size-3" strokeWidth={3} aria-hidden />
    </span>
  );
}

function PlanCta({ plan, onClick, children }: { plan: Plan; onClick: () => void; children: ReactNode }) {
  const base =
    "mt-7 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900";
  if (plan.popular) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(base, "text-white shadow-[0_14px_40px_-12px_rgba(168,85,247,0.7)] hover:brightness-110")}
        style={{ background: plan.gradient }}
      >
        {children}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    );
  }
  if (plan.key === "free") {
    return (
      <button type="button" onClick={onClick} className={cn(base, "border border-slate/50 bg-ink-950/70 text-paper hover:bg-ink")}>
        {children}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, "border hover:brightness-125")}
      style={{ borderColor: `${plan.accent}66`, background: `${plan.accent}14`, color: plan.accent }}
    >
      {children}
      <ArrowRight className="size-4" aria-hidden />
    </button>
  );
}

// Pointer-driven slider that snaps to the pack stops so price and credits
// always stay coherent. Arrow keys step between stops.
function CreditSlider({
  value,
  onChange,
  accent,
  gradient,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  accent: string;
  gradient: string;
  label: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const pct = (value / PACK_MAX_CREDITS) * 100;

  const setFromClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(PACK_VALUES[packForCredits(ratio * PACK_MAX_CREDITS)]);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => setFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // setFromClientX closes over the current trackRef; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const step = (dir: 1 | -1) => {
    const i = PACK_STOPS.indexOf(packForCredits(value));
    const next = PACK_STOPS[Math.min(PACK_STOPS.length - 1, Math.max(0, i + dir))];
    onChange(PACK_VALUES[next]);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={PACK_MAX_CREDITS}
      aria-valuenow={value}
      aria-valuetext={value ? `${value.toLocaleString("en-US")} extra credits` : "No extra credits"}
      onPointerDown={(e) => {
        setDragging(true);
        setFromClientX(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          step(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          step(-1);
        }
      }}
      className="relative flex h-7 cursor-pointer touch-none select-none items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
    >
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/10" />
      <div
        className="absolute left-0 h-1.5 rounded-full"
        style={{ width: `${pct}%`, background: gradient, boxShadow: `0 0 14px ${accent}80` }}
      />
      <div
        className="absolute size-5 -translate-x-1/2 rounded-full border-[3px] bg-white transition-[width,height]"
        style={{ left: `${pct}%`, borderColor: accent, boxShadow: `0 0 0 5px ${accent}33, 0 4px 14px ${accent}80` }}
      />
    </div>
  );
}
