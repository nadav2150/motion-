import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { IconArrowRight, IconCheck } from "../primitives";

// Container-width based mobile detection — same pattern as landing.tsx.
// We measure the scroll container rather than the viewport so the page
// stays responsive when previewed inside fixed-width artboards.
function useIsMobile(ref: RefObject<HTMLDivElement | null>, threshold = 720) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number) => setM(w < threshold);
    apply(el.clientWidth);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [ref, threshold]);
  return m;
}

// Subscription tiers shown on /pricing. Numbers come from the real billing
// catalog: polar.ts buildCatalog() grants + checkout.tsx TIER_MONTHLY_USD
// + plan-features.ts PLAN_FEATURES. Keep all three in sync when prices or
// grants change.
export type PricingTierKey = "free" | "starter" | "pro" | "studio";

// Add-on credit packs, optional per tier. Slider snaps to one of the 4
// stops; "none" = no add-on (default). The three paid sizes map to the
// Polar credit-pack products in POLAR_<ENV>_PRODUCT_PACK_*.
export type PackKey = "none" | "small" | "medium" | "large";

type Plan = {
  key: PricingTierKey;
  name: string;
  tagline: string;
  monthlyUsd: number;
  baseCredits: number;
  accent: string;
  gradient: string;
  popular?: boolean;
  perks: string[];
};

const PACK_VALUES: Record<PackKey, number> = {
  none: 0,
  small: 5_000,
  medium: 25_000,
  large: 75_000,
};
const PACK_PRICE_USD: Record<PackKey, number> = {
  none: 0,
  small: 13,
  medium: 59,
  large: 159,
};
const PACK_STOPS: PackKey[] = ["none", "small", "medium", "large"];
const PACK_MAX_CREDITS = PACK_VALUES.large; // slider range top
const PACK_LABEL_SHORT: Record<PackKey, string> = {
  none: "Just the plan",
  small: "+5K credits ($13)",
  medium: "+25K credits ($59)",
  large: "+75K credits ($159)",
};

const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Try Videly with a starter grant — no card required.",
    monthlyUsd: 0,
    baseCredits: 3_100,
    accent: "#9CA3AF",
    gradient: "linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)",
    perks: [
      "3,100 credits / month",
      "Up to 2 scenes per film",
      "Videly watermark",
      "Community templates",
      "1 concurrent job",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    tagline: "For founders shipping launch films solo.",
    monthlyUsd: 19,
    baseCredits: 8_000,
    accent: "#7AA2FF",
    gradient: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 100%)",
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
    accent: "#A78BFA",
    gradient: "linear-gradient(135deg, #A78BFA 0%, #67E8F9 100%)",
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
    accent: "#67E8F9",
    gradient: "linear-gradient(135deg, #67E8F9 0%, #A6F0BD 100%)",
    perks: [
      "60,000 credits / month",
      "Everything in Pro",
      "3 team seats included",
      "Programmatic API access",
      "10 concurrent jobs",
    ],
  },
];

function packForCredits(credits: number): PackKey {
  // Snap a raw credit count to the nearest available pack stop. Distances
  // computed in credit-space so the snap feels right on the slider track.
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

export function PricingScreen({
  onSelectTier,
  onBack,
  onSignIn: _onSignIn,
  onCta: _onCta,
}: {
  // Click on a tier's CTA. Caller routes free → /register, paid → /checkout.
  onSelectTier?: (tier: PricingTierKey, pack: PackKey) => void;
  // Top-left back button. When unset the button is hidden.
  onBack?: () => void;
  // Accepted for API parity but unused in the slim layout.
  onSignIn?: () => void;
  onCta?: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<PricingTierKey>("pro");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const m = useIsMobile(scrollRef, 720);

  // Per-card pack selection. Each plan card has its own slider so users can
  // explore add-ons across plans without losing state.
  const initialPacks = useMemo(
    () =>
      Object.fromEntries(PLANS.map((p) => [p.key, "none"])) as Record<
        PricingTierKey,
        PackKey
      >,
    [],
  );
  const [packs, setPacks] = useState<Record<PricingTierKey, PackKey>>(initialPacks);

  return (
    <div
      ref={scrollRef}
      style={{
        width: "100%",
        minHeight: "100%",
        overflow: "auto",
        background: "var(--bg-0)",
        color: "var(--ink-0)",
        fontFamily: "'Geist', system-ui, sans-serif",
        position: "relative",
      }}
    >
      <Bloom />

      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            position: "absolute",
            top: 22,
            left: 24,
            zIndex: 3,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "8px 12px 8px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--line)",
            color: "var(--ink-2)",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
            backdropFilter: "blur(20px)",
            transition: "background 160ms, color 160ms, border-color 160ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.07)";
            e.currentTarget.style.color = "white";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color = "var(--ink-2)";
          }}
        >
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <IconArrowRight size={13} />
          </span>
          Back
        </button>
      )}

      <section
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1320,
          margin: "0 auto",
          padding: m ? "56px 20px 12px" : "64px 56px 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: m ? 34 : 60,
            fontWeight: 500,
            letterSpacing: "-0.035em",
            lineHeight: m ? 1.05 : 1.02,
          }}
        >
          Plans that scale with your{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            render volume
          </span>
        </h1>
        <p
          style={{
            margin: m ? "14px auto 0" : "16px auto 0",
            maxWidth: 600,
            fontSize: m ? 14 : 16,
            color: "var(--ink-2)",
            lineHeight: 1.55,
            letterSpacing: "-0.005em",
          }}
        >
          Drag the slider on any plan to add extra one-time credits.
          Credits never expire and stack on top of your monthly grant.
        </p>
      </section>

      {m ? (
        // Mobile: horizontal swipe deck. Cards keep a fixed width and snap
        // into place; the container scrolls horizontally with one card
        // centered per swipe. Side padding becomes scroll-padding so the
        // first/last cards center cleanly too.
        <section
          style={{
            position: "relative",
            zIndex: 2,
            padding: "20px 0 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "0 20px",
              overflowX: "auto",
              overflowY: "hidden",
              scrollSnapType: "x mandatory",
              scrollPaddingLeft: 20,
              scrollPaddingRight: 20,
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
            }}
          >
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                style={{
                  flex: "0 0 84%",
                  maxWidth: 320,
                  scrollSnapAlign: "center",
                }}
              >
                <PricingCard
                  plan={plan}
                  packKey={packs[plan.key]}
                  onPackChange={(next) =>
                    setPacks((prev) => ({ ...prev, [plan.key]: next }))
                  }
                  selected={selectedKey === plan.key}
                  onSelect={() => setSelectedKey(plan.key)}
                  onChoose={() => onSelectTier?.(plan.key, packs[plan.key])}
                  mobile
                />
              </div>
            ))}
          </div>
          <div
            className="mf-mono"
            style={{
              marginTop: 10,
              fontSize: 9.5,
              color: "var(--ink-4)",
              letterSpacing: "0.14em",
              textAlign: "center",
            }}
          >
            ← SWIPE TO COMPARE PLANS →
          </div>
        </section>
      ) : (
        <section
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1440,
            margin: "0 auto",
            padding: "40px 40px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
            alignItems: "stretch",
          }}
        >
          {PLANS.map((plan) => (
            <PricingCard
              key={plan.key}
              plan={plan}
              packKey={packs[plan.key]}
              onPackChange={(next) =>
                setPacks((prev) => ({ ...prev, [plan.key]: next }))
              }
              selected={selectedKey === plan.key}
              onSelect={() => setSelectedKey(plan.key)}
              onChoose={() => onSelectTier?.(plan.key, packs[plan.key])}
            />
          ))}
        </section>
      )}

      <section
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1320,
          margin: m ? "32px auto 0" : "40px auto 0",
          padding: m ? "0 20px" : "0 56px",
        }}
      >
        <div
          style={{
            padding: m ? "18px 18px" : "20px 26px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--line)",
            display: "grid",
            gridTemplateColumns: m ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: m ? 16 : 24,
          }}
        >
          {[
            {
              l: "Cancel anytime",
              s: "Stop renewing, keep your remaining credits this period.",
            },
            {
              l: "Hard-blocked overages",
              s: "Jobs never start unless your balance covers the worst case.",
            },
            {
              l: "Top-up anytime",
              s: "Buy extra credit packs without changing your plan.",
            },
            {
              l: "Team-ready",
              s: "Studio includes 3 seats and programmatic API access.",
            },
          ].map((c) => (
            <div
              key={c.l}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    flexShrink: 0,
                    background: "rgba(166,240,189,0.10)",
                    border: "1px solid rgba(166,240,189,0.30)",
                    color: "#A6F0BD",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <IconCheck size={11} />
                </span>
                <span
                  style={{ fontSize: 13, color: "white", fontWeight: 500 }}
                >
                  {c.l}
                </span>
              </div>
              <p
                style={{
                  margin: "0 0 0 26px",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  lineHeight: 1.4,
                }}
              >
                {c.s}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1100,
          margin: m ? "48px auto 0" : "64px auto 0",
          padding: m ? "0 20px 56px" : "0 56px 80px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: m ? 24 : 32 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 10 }}>
            FAQ · CREDITS DEMYSTIFIED
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: m ? 24 : 32,
              fontWeight: 500,
              letterSpacing: "-0.025em",
            }}
          >
            Questions about credits & pricing
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: m ? "1fr" : "1fr 1fr",
            gap: m ? 12 : 14,
          }}
        >
          {[
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
          ].map((it) => (
            <div
              key={it.q}
              style={{
                padding: "18px 20px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--line)",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "white",
                  letterSpacing: "-0.01em",
                }}
              >
                {it.q}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                }}
              >
                {it.a}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Ambient background bloom — three soft radial gradients positioned to match
// the design's color scheme (blue top-left, purple top-right, cyan bottom).
function Bloom() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: -300,
          left: "8%",
          width: 800,
          height: 800,
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(circle, rgba(122,162,255,0.13), transparent 60%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 200,
          right: "5%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(circle, rgba(167,139,250,0.10), transparent 60%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          left: "30%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(circle, rgba(103,232,249,0.08), transparent 60%)",
          filter: "blur(60px)",
        }}
      />
    </>
  );
}

function PricingCard({
  plan,
  packKey,
  onPackChange,
  selected,
  onSelect,
  onChoose,
  mobile = false,
}: {
  plan: Plan;
  packKey: PackKey;
  onPackChange: (next: PackKey) => void;
  selected: boolean;
  onSelect: () => void;
  onChoose: () => void;
  // When true, the card is rendered inside the horizontal swipe deck:
  // padding tightens and the desktop `minHeight: 720` is dropped so the
  // card collapses to its natural height per swipe.
  mobile?: boolean;
}) {
  const dollars = plan.monthlyUsd;
  const cents = "00";

  const extraCredits = PACK_VALUES[packKey];
  const extraPrice = PACK_PRICE_USD[packKey];
  const totalCredits = plan.baseCredits + extraCredits;
  const ctaLabel = selected ? `Choose ${plan.name}` : `Pick ${plan.name}`;

  return (
    <div
      onClick={onSelect}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: mobile ? "22px 20px 20px" : "28px 24px 26px",
        borderRadius: 18,
        background: selected
          ? "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${selected ? "rgba(255,255,255,0.18)" : "var(--line)"}`,
        boxShadow: selected
          ? `0 24px 60px -20px ${plan.accent}55, 0 0 0 1px ${plan.accent}40, inset 0 1px 0 rgba(255,255,255,0.04)`
          : "0 6px 22px -10px rgba(0,0,0,0.6)",
        cursor: "pointer",
        transition: "all 280ms cubic-bezier(.2,.8,.2,1)",
        overflow: "hidden",
        minHeight: mobile ? 0 : 720,
        height: mobile ? "100%" : undefined,
      }}
    >
      {plan.popular && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 2,
            padding: "4px 9px",
            borderRadius: 999,
            background: plan.gradient,
            fontSize: 9.5,
            fontFamily: "'Geist Mono', monospace",
            letterSpacing: "0.10em",
            fontWeight: 600,
            color: "#0B0C10",
          }}
        >
          MOST POPULAR
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: -40,
          left: -40,
          width: 200,
          height: 200,
          borderRadius: "50%",
          pointerEvents: "none",
          background: plan.gradient,
          opacity: selected ? 0.18 : 0.08,
          filter: "blur(40px)",
          transition: "opacity 280ms",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: plan.gradient,
              boxShadow: `0 0 16px ${plan.accent}80`,
            }}
          />
          <span
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "white",
              letterSpacing: "-0.01em",
            }}
          >
            {plan.name}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: "var(--ink-3)",
            lineHeight: 1.5,
            minHeight: 36,
          }}
        >
          {plan.tagline}
        </p>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          marginTop: 22,
          paddingBottom: 18,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span
            style={{
              fontSize: 14,
              color: "var(--ink-3)",
              fontWeight: 400,
            }}
          >
            $
          </span>
          <span
            style={{
              fontSize: 48,
              fontWeight: 500,
              color: "white",
              letterSpacing: "-0.035em",
              lineHeight: 1,
            }}
          >
            {dollars}
          </span>
          <span
            style={{
              fontSize: 18,
              color: "var(--ink-3)",
              fontWeight: 400,
              marginLeft: -2,
            }}
          >
            .{cents}
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6 }}>
            / month
          </span>
        </div>
        <div
          className="mf-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.06em",
            color: "var(--ink-4)",
            marginTop: 6,
          }}
        >
          {plan.monthlyUsd === 0
            ? "FREE FOREVER · NO CARD REQUIRED"
            : "BILLED MONTHLY · CANCEL ANYTIME"}
        </div>
      </div>

      {plan.key !== "free" && (
        <div style={{ position: "relative", zIndex: 1, marginTop: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <span
              className="mf-mono"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.12em",
                color: "var(--ink-3)",
              }}
            >
              EXTRA CREDITS
            </span>
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 14,
                fontWeight: 500,
                color: extraCredits > 0 ? plan.accent : "var(--ink-3)",
                letterSpacing: "-0.005em",
              }}
            >
              {extraCredits > 0
                ? `+${extraCredits.toLocaleString()}`
                : "None"}
            </span>
          </div>

          <CreditSlider
            value={PACK_VALUES[packKey]}
            accent={plan.accent}
            gradient={plan.gradient}
            onChange={(v) => onPackChange(packForCredits(v))}
            onCardClick={onSelect}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <span
              className="mf-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                color: "var(--ink-4)",
              }}
            >
              0
            </span>
            <span
              className="mf-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                color: "var(--ink-4)",
              }}
            >
              +75K
            </span>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "8px 11px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid var(--line)",
              fontSize: 11,
              color: "var(--ink-2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>
              {totalCredits.toLocaleString()} credits total
            </span>
            <span
              className="mf-mono"
              style={{
                color: extraPrice > 0 ? plan.accent : "var(--ink-3)",
                fontSize: 10.5,
                whiteSpace: "nowrap",
              }}
            >
              {extraPrice > 0 ? `+$${extraPrice} once` : PACK_LABEL_SHORT.none}
            </span>
          </div>
        </div>
      )}

      <ul
        style={{
          position: "relative",
          zIndex: 1,
          margin: "22px 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          flex: 1,
        }}
      >
        {plan.perks.map((perk) => (
          <li
            key={perk}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              fontSize: 12.5,
              color: "var(--ink-1)",
              lineHeight: 1.45,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                flexShrink: 0,
                marginTop: 1,
                background: `${plan.accent}1F`,
                border: `1px solid ${plan.accent}55`,
                color: plan.accent,
                display: "grid",
                placeItems: "center",
              }}
            >
              <IconCheck size={10} />
            </span>
            {perk}
          </li>
        ))}
      </ul>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onChoose();
        }}
        style={{
          marginTop: 22,
          width: "100%",
          padding: "13px 16px",
          borderRadius: 10,
          border: selected
            ? "1px solid rgba(255,255,255,0.18)"
            : "1px solid var(--line-2)",
          background: selected ? plan.gradient : "rgba(255,255,255,0.04)",
          color: selected ? "#0B0C10" : "white",
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          boxShadow: selected ? `0 12px 30px -10px ${plan.accent}80` : "none",
          transition: "all 220ms",
        }}
      >
        {ctaLabel}
        <IconArrowRight size={13} />
      </button>
    </div>
  );
}

// Custom drag slider matching the design — pointer-driven so the thumb
// stays under the cursor, tick marks at the 4 pack stops, gradient track
// fill + white-on-gradient thumb with a soft halo. Snaps to the nearest
// pack stop on every movement so price and credits stay coherent.
function CreditSlider({
  value,
  onChange,
  accent,
  gradient,
  onCardClick,
}: {
  value: number;
  onChange: (next: number) => void;
  accent: string;
  gradient: string;
  onCardClick?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const pct = (value / PACK_MAX_CREDITS) * 100;

  // Convert a pointer X coordinate to a credit value, snapped to the nearest
  // pack stop. Track is the full visible width of the slider div.
  const setFromClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const raw = ratio * PACK_MAX_CREDITS;
    // Snap to nearest pack stop
    const snapped = PACK_VALUES[packForCredits(raw)];
    onChange(snapped);
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
    // setFromClientX closes over current trackRef; safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Tick positions for the 4 pack stops, in % of slider width.
  const tickPositions = PACK_STOPS.map(
    (k) => (PACK_VALUES[k] / PACK_MAX_CREDITS) * 100,
  );

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        onCardClick?.();
        setDragging(true);
        setFromClientX(e.clientX);
      }}
      style={{
        position: "relative",
        height: 28,
        cursor: "pointer",
        touchAction: "none",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: 6,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid var(--line)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          height: 6,
          width: `${pct}%`,
          borderRadius: 999,
          background: gradient,
          boxShadow: `0 0 18px ${accent}80`,
        }}
      />
      {tickPositions.map((t, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${t}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 2,
            height: 6,
            borderRadius: 1,
            background:
              t <= pct ? "rgba(11,12,16,0.4)" : "rgba(255,255,255,0.10)",
            pointerEvents: "none",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: `${pct}%`,
          transform: "translateX(-50%)",
          width: dragging ? 22 : 20,
          height: dragging ? 22 : 20,
          borderRadius: "50%",
          background: "white",
          boxShadow: `0 0 0 4px ${accent}30, 0 4px 14px ${accent}80, inset 0 -1px 0 rgba(0,0,0,0.1)`,
          cursor: "grab",
          transition: "width 120ms, height 120ms",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 4,
            borderRadius: "50%",
            background: gradient,
          }}
        />
      </div>
    </div>
  );
}

