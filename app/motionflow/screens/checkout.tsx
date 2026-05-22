import { useState, type ReactNode } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconClose,
  IconLogo,
  IconPlus,
  IconSparkle,
} from "../primitives";

export type CheckoutTier = "starter" | "pro" | "studio";
export type CheckoutPack = "small" | "medium" | "large";

const TIER_LABEL: Record<CheckoutTier, string> = {
  starter: "Videly Starter",
  pro: "Videly Pro",
  studio: "Videly Studio",
};
const TIER_MONTHLY_USD: Record<CheckoutTier, number> = {
  starter: 19,
  pro: 49,
  studio: 149,
};
// Monthly credit grant per tier. Mirrors PADDLE_PRICE_* custom_data.monthlyGrant
// and the buildCatalog() defaults in app/lib/billing/paddle.ts — keep in sync.
const TIER_MONTHLY_CREDITS: Record<CheckoutTier, number> = {
  starter: 8000,
  pro: 20000,
  studio: 60000,
};
// What each plan includes — surfaced in the "What's included" section above
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
const TIER_ACCENT: Record<CheckoutTier, string> = {
  starter: "#7AA2FF",
  pro: "#A78BFA",
  studio: "#67E8F9",
};
// Optional credit-pack add-on. Mirrors the PACKS table in pricing.tsx and
// the Paddle credit-pack price catalog (VITE_PADDLE_PRICE_PACK_*). Keep all
// three in sync — pricing.tsx is the source of truth for the slider values
// users see, this map is the source of truth for the checkout total.
const PACK_LABEL: Record<CheckoutPack, string> = {
  small: "Credit Pack — Small",
  medium: "Credit Pack — Medium",
  large: "Credit Pack — Large",
};
const PACK_PRICE_USD: Record<CheckoutPack, number> = {
  small: 13,
  medium: 59,
  large: 159,
};
const PACK_CREDITS: Record<CheckoutPack, number> = {
  small: 5000,
  medium: 25000,
  large: 75000,
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
}: {
  onBack?: () => void;
  onComplete?: (selected: { monthlyUsd: number; pack: CheckoutPack | null }) => void;
  tier?: CheckoutTier;
  pack?: CheckoutPack | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  submitting?: boolean;
}) {
  const monthlyUsd = TIER_MONTHLY_USD[tier];
  // Pack price is a one-time charge that lands in the same Paddle cart as
  // the subscription. We show pre-tax totals here because Paddle computes
  // the final tax based on the customer's verified location at the Paddle
  // overlay — tax_mode is "location" on every price (see paddle.ts catalog),
  // so any estimate we render in-page would diverge from the actual invoice.
  const packPrice = pack ? PACK_PRICE_USD[pack] : 0;
  const dueToday = monthlyUsd + packPrice;

  return (
    <div
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
      <div
        style={{
          position: "absolute",
          top: -200,
          left: "20%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(circle, rgba(122,162,255,0.15), transparent 60%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 100,
          right: "10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(circle, rgba(167,139,250,0.12), transparent 60%)",
          filter: "blur(60px)",
        }}
      />

      <header
        style={{
          position: "relative",
          zIndex: 2,
          padding: "20px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconLogo size={26} />
          <span style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: "-0.01em" }}>Videly</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
          <CoStep n={1} active label="Account" />
          <CoSep />
          <CoStep n={2} label="Payment" />
          <CoSep />
          <CoStep n={3} label="Done" />
        </div>

        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink-2)",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          <IconClose size={12} /> Cancel
        </button>
      </header>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1180,
          margin: "0 auto",
          padding: "40px 40px 80px",
          display: "grid",
          gridTemplateColumns: "1.15fr 1fr",
          gap: 40,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
              Complete your{" "}
              <span
                style={{
                  background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                upgrade
              </span>
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Unlimited renders, premium engine, 4K export — start in seconds. Cancel anytime.
            </p>
          </div>

          <CoSection title={`01 · What's included in ${TIER_LABEL[tier]}`}>
            <div
              style={{
                padding: "20px 22px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: TIER_ACCENT[tier],
                      boxShadow: `0 0 14px ${TIER_ACCENT[tier]}80`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: TIER_ACCENT[tier],
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {TIER_MONTHLY_CREDITS[tier].toLocaleString()} credits / month
                  </span>
                </div>
                <span
                  className="mf-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: "var(--ink-4)",
                  }}
                >
                  CANCEL ANYTIME
                </span>
              </div>

              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "9px 18px",
                }}
              >
                {TIER_PERKS[tier].map((perk) => (
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
                        background: `${TIER_ACCENT[tier]}1F`,
                        border: `1px solid ${TIER_ACCENT[tier]}55`,
                        color: TIER_ACCENT[tier],
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <IconCheck size={10} stroke={2.5} />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          </CoSection>

          <CoSection title="02 · Account">
            <CoField label="Email">
              <CoInput placeholder="you@company.com" type="email" defaultValue={email ?? ""} />
            </CoField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <CoField label="First name">
                <CoInput placeholder="Alex" defaultValue={firstName ?? ""} />
              </CoField>
              <CoField label="Last name">
                <CoInput placeholder="Morgan" defaultValue={lastName ?? ""} />
              </CoField>
            </div>
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(122,162,255,0.05)",
                border: "1px solid rgba(122,162,255,0.18)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                color: "var(--ink-2)",
                lineHeight: 1.45,
              }}
            >
              <CoLockIcon />
              Payment details are collected securely by Paddle once you continue.
            </div>
          </CoSection>

        </div>

        <aside style={{ position: "sticky", top: 30, display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              position: "relative",
              padding: "26px 26px 22px",
              borderRadius: 16,
              background: "linear-gradient(180deg, #0E1018 0%, #08090E 100%)",
              border: "1px solid rgba(122,162,255,0.20)",
              boxShadow:
                "0 20px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(122,162,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -60,
                right: -60,
                width: 280,
                height: 280,
                borderRadius: "50%",
                pointerEvents: "none",
                background: "radial-gradient(circle, rgba(122,162,255,0.18), transparent 60%)",
                filter: "blur(30px)",
              }}
            />

            <div style={{ position: "relative" }}>
              <div className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "#7AA2FF", marginBottom: 14 }}>
                ORDER SUMMARY
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  paddingBottom: 18,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    flexShrink: 0,
                    background: "linear-gradient(135deg, #7AA2FF, #A78BFA)",
                    display: "grid",
                    placeItems: "center",
                    color: "#0B0C10",
                    boxShadow: "0 6px 20px -4px rgba(122,162,255,0.45)",
                  }}
                >
                  <IconSparkle size={18} stroke={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "white", letterSpacing: "-0.01em" }}>
                    {TIER_LABEL[tier]}
                  </div>
                  <div style={{ fontSize: 12, color: "#A6F0BD", marginTop: 3, fontWeight: 500 }}>
                    {TIER_MONTHLY_CREDITS[tier].toLocaleString()} credits/month
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                    Billed monthly · cancel anytime
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "white" }}>
                    ${monthlyUsd}
                    <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400 }}>/month</span>
                  </div>
                </div>
              </div>

              {pack && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    paddingTop: 14,
                    paddingBottom: 18,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: "rgba(166,240,189,0.10)",
                      border: "1px solid rgba(166,240,189,0.28)",
                      display: "grid",
                      placeItems: "center",
                      color: "#A6F0BD",
                    }}
                  >
                    <IconPlus size={14} stroke={2.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "white", letterSpacing: "-0.005em" }}>
                      {PACK_LABEL[pack]}
                    </div>
                    <div style={{ fontSize: 12, color: "#A6F0BD", marginTop: 3, fontWeight: 500 }}>
                      +{PACK_CREDITS[pack].toLocaleString()} credits
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                      One-time · never expires
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "white" }}>
                      ${PACK_PRICE_USD[pack]}
                      <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400, marginLeft: 2 }}>
                        once
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ paddingTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ fontSize: 14, color: "white", fontWeight: 500 }}>
                    Due today
                  </span>
                  <span
                    style={{
                      fontSize: 22,
                      color: "white",
                      fontWeight: 500,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    ${dueToday}
                    <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }}>USD</span>
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-3)",
                    lineHeight: 1.45,
                  }}
                >
                  Local sales tax and any promo codes are applied at the secure Paddle checkout based on your billing location.
                </div>
                <div
                  className="mf-mono"
                  style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.06em", marginTop: 2 }}
                >
                  RENEWS MONTHLY · CANCEL ANYTIME
                </div>
              </div>
            </div>
          </div>

          <button
            disabled={submitting}
            onClick={() => onComplete?.({ monthlyUsd, pack })}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 12,
              border: "1px solid rgba(167,139,250,0.50)",
              background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
              backgroundSize: "200% 100%",
              color: "#0B0C10",
              fontSize: 14.5,
              fontWeight: 600,
              fontFamily: "inherit",
              letterSpacing: "-0.005em",
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 14px 36px -8px rgba(122,162,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
              transition: "transform 160ms, background-position 600ms",
            }}
            onMouseEnter={(e) => {
              if (submitting) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.backgroundPosition = "100% 0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.backgroundPosition = "0% 0";
            }}
          >
            <span>{submitting ? "Opening secure checkout…" : `Continue to secure checkout · $${dueToday}`}</span>
            <IconArrowRight size={14} />
          </button>

          <div
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--line)",
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            {[
              { i: <IconCheck size={11} />, t: "Cancel anytime — no questions" },
              { i: <IconCheck size={11} />, t: "30-day money-back guarantee" },
              { i: <CoLockIcon />, t: "Secured by Paddle · SSL encrypted" },
            ].map((it, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--ink-2)" }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    background: "rgba(166,240,189,0.10)",
                    border: "1px solid rgba(166,240,189,0.30)",
                    color: "#A6F0BD",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {it.i}
                </span>
                {it.t}
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ display: "flex" }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, oklch(0.72 0.18 ${230 + i * 30}), oklch(0.55 0.18 ${280 + i * 20}))`,
                      border: "2px solid var(--bg-0)",
                      marginLeft: i === 0 ? 0 : -7,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                Joined by <strong style={{ color: "white" }}>12,400+</strong> founders &amp; teams
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45, fontStyle: "italic" }}>
              &ldquo;Replaced our entire launch-video workflow. We ship in hours, not weeks.&rdquo;
            </div>
            <div
              className="mf-mono"
              style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em", marginTop: 6 }}
            >
              — DANIEL R. · HEAD OF GROWTH @ VERCEL
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--ink-4)", textAlign: "center", lineHeight: 1.5, paddingTop: 6 }}>
            By starting your subscription, you agree to our{" "}
            <span style={{ color: "var(--ink-2)", cursor: "pointer" }}>Terms</span> and{" "}
            <span style={{ color: "var(--ink-2)", cursor: "pointer" }}>Privacy Policy</span>.
          </div>
        </aside>
      </div>
    </div>
  );
}

function CoStep({ n, label, active, done }: { n: number; label: string; active?: boolean; done?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: "Geist Mono, monospace",
          background: active
            ? "linear-gradient(135deg, #7AA2FF, #A78BFA)"
            : done
            ? "rgba(166,240,189,0.15)"
            : "rgba(255,255,255,0.04)",
          color: active ? "#0B0C10" : done ? "#A6F0BD" : "var(--ink-3)",
          border: done ? "1px solid rgba(166,240,189,0.35)" : active ? "none" : "1px solid var(--line)",
          boxShadow: active ? "0 4px 14px rgba(122,162,255,0.45)" : "none",
        }}
      >
        {done ? "✓" : n}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: active ? "white" : done ? "var(--ink-2)" : "var(--ink-3)",
          fontWeight: active ? 500 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function CoSep() {
  return <div style={{ width: 20, height: 1, background: "var(--line)" }} />;
}

function CoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--ink-3)" }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function CoField({
  label,
  children,
  right,
}: {
  label: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--ink-2)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          {label}
        </span>
        {right}
      </div>
      {children}
    </label>
  );
}

function CoInput({
  placeholder,
  type = "text",
  defaultValue,
  mono,
}: {
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      defaultValue={defaultValue}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "11px 14px",
        borderRadius: 9,
        background: "rgba(0,0,0,0.25)",
        border: "1px solid var(--line)",
        color: "white",
        fontSize: 13.5,
        fontFamily: mono ? "Geist Mono, monospace" : "inherit",
        letterSpacing: mono ? "0.02em" : "normal",
        outline: "none",
        transition: "border-color 160ms, background 160ms",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "rgba(122,162,255,0.45)";
        e.currentTarget.style.background = "rgba(0,0,0,0.35)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--line)";
        e.currentTarget.style.background = "rgba(0,0,0,0.25)";
      }}
    />
  );
}

function CoLockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

