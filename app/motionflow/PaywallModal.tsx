// Premium paywall modal — based on the "03 — Paywall · moment of value
// creation" artboard from the Claude Design bundle. Two-column 960px modal,
// ambient radial glows, gradient title-word, feature grid, shimmer plan
// card, gradient CTA.
//
// Adaptations vs. the original prototype:
//   - No monthly/annual toggle — our catalog is monthly only.
//   - No "Use a free credit / 2 LEFT" pill — the credit balance already
//     lives in the AppChrome top-bar pill, so the secondary CTA is just
//     "Maybe later" → close.
//   - No "Already have an account? Sign in" row — the user is already
//     signed in at the moment this modal fires.
//   - Guarantee strip swapped to match what we actually offer (cancel
//     anytime, top up with packs, Paddle instead of Stripe).
//   - Plan card sources its data from PLAN_CATALOG below — kept in sync
//     with app/motionflow/screens/pricing.tsx (PLANS array).
//
// Trigger variants map to a target plan tier:
//   audio_locked          → starter
//   critique_locked       → starter
//   polish_locked         → pro
//   insufficient_credits  → primary CTA routes to /pricing instead of
//                           /checkout?plan=...  so the user can also pick a
//                           credit pack rather than only a subscription.
//   generate              → starter (generic upsell)

import { useEffect } from "react";
import {
  IconArrowRight,
  IconCheck,
  IconClose,
  IconDownload,
  IconLayers,
  IconShare,
  IconSparkle,
  IconWand,
} from "./primitives";

export type PaywallTrigger =
  | "audio_locked"
  | "critique_locked"
  | "polish_locked"
  | "insufficient_credits"
  | "generate";

type PlanKey = "starter" | "pro" | "studio";

type PlanCatalogEntry = {
  key: PlanKey;
  name: string;
  monthlyUsd: number;
  baseCredits: number;
  popular?: boolean;
};

// Mirror of app/motionflow/screens/pricing.tsx PLANS for the three paid
// tiers. Free is intentionally excluded — the paywall never upsells to it.
const PLAN_CATALOG: Record<PlanKey, PlanCatalogEntry> = {
  starter: { key: "starter", name: "Starter", monthlyUsd: 19,  baseCredits: 8_000 },
  pro:     { key: "pro",     name: "Pro",     monthlyUsd: 49,  baseCredits: 20_000, popular: true },
  studio:  { key: "studio",  name: "Studio",  monthlyUsd: 149, baseCredits: 60_000 },
};

type CopyBlock = {
  eyebrow: string;
  title: string;
  sub: string;
  targetPlan: PlanKey;
};

const COPY: Record<PaywallTrigger, CopyBlock> = {
  audio_locked: {
    eyebrow: "ADD A CINEMATIC SOUNDTRACK",
    title: "Score your film",
    sub: "Voiceover, music, and SFX bring your story to life. Starter unlocks every audio track — and 8,000 monthly credits.",
    targetPlan: "starter",
  },
  critique_locked: {
    eyebrow: "AI-POWERED CRITIQUE",
    title: "Auto-critique every scene",
    sub: "Let Vision + Opus review every frame and rewrite weak scenes. Starter unlocks vision critique and 8,000 monthly credits.",
    targetPlan: "starter",
  },
  polish_locked: {
    eyebrow: "ONE-CLICK FILM POLISH",
    title: "Polish your final cut",
    sub: "Generate a director's-cut pass that rewrites pacing and visuals from comments. Pro unlocks polish, 4K export, and 20,000 monthly credits.",
    targetPlan: "pro",
  },
  insufficient_credits: {
    eyebrow: "OUT OF CREDITS",
    title: "Top up to keep going",
    sub: "Pick up a credit pack to render this film, or upgrade to a monthly plan and get a recurring grant every cycle.",
    targetPlan: "starter",
  },
  generate: {
    eyebrow: "ONE STEP AWAY FROM CINEMA",
    title: "Render your first film",
    sub: "You've built the story — now bring it to life. Starter unlocks unlimited audio, vision critique, and 8,000 monthly credits.",
    targetPlan: "starter",
  },
};

const FEATURES: Array<{ icon: React.ReactNode; t: string; d: string }> = [
  { icon: <IconWand size={13} />,     t: "More AI generations every month",  d: "Recurring credit grant lands on your billing date" },
  { icon: <IconSparkle size={13} />,  t: "Voiceover, music, and SFX",        d: "Score every scene with the full audio stack" },
  { icon: <IconDownload size={13} />, t: "No watermark · commercial use",    d: "Studio-grade output ready for any platform" },
  { icon: <IconLayers size={13} />,   t: "Up to 14 scenes per film",         d: "Tell longer stories without hitting limits" },
  { icon: <IconShare size={13} />,    t: "Brand kit + logo + colors",        d: "Lock your palette across every render" },
  { icon: <IconCheck size={13} />,    t: "Vision critique on every scene",   d: "GPT-4o reviews every frame and flags issues" },
];

export type PaywallModalProps = {
  open: boolean;
  trigger: PaywallTrigger;
  // Currently unused — kept so callers can pass the user's plan if we want
  // to vary copy (e.g., starter → pro upgrade). For now we always upsell
  // to the trigger's target plan.
  planTier?: string | null;
  onClose: () => void;
  // Called with the catalog plan key when the user confirms the upgrade.
  // For insufficient_credits the caller usually routes to /pricing
  // instead so the user can pick a credit pack.
  onUpgrade: (plan: PlanKey) => void;
  onSeePricing: () => void;
};

export function PaywallModal({
  open,
  trigger,
  onClose,
  onUpgrade,
  onSeePricing,
}: PaywallModalProps) {
  // ESC closes; body-scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = COPY[trigger];
  const plan = PLAN_CATALOG[copy.targetPlan];
  const titleWords = copy.title.split(" ");
  const titleLead = titleWords.slice(0, -1).join(" ");
  const titleTail = titleWords[titleWords.length - 1];

  const primaryCtaLabel =
    trigger === "insufficient_credits" ? "Top up credits" : `Upgrade to ${plan.name}`;
  const handlePrimary = () => {
    if (trigger === "insufficient_credits") onSeePricing();
    else onUpgrade(plan.key);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "grid", placeItems: "center",
        background: "rgba(6,7,10,0.78)",
        backdropFilter: "blur(14px) saturate(120%)",
        WebkitBackdropFilter: "blur(14px) saturate(120%)",
        padding: 24,
        animation: "mfPwFadeIn 240ms ease",
        fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes mfPwFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mfPwRiseIn { from { opacity: 0; transform: translateY(12px) scale(0.985) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes mfPwShimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(960px, 100%)",
          maxHeight: "min(720px, 100%)",
          background: "linear-gradient(180deg, #0E1018 0%, #08090E 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          boxShadow:
            "0 40px 120px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(122,162,255,0.10), inset 0 1px 0 rgba(255,255,255,0.05)",
          overflow: "hidden",
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          animation: "mfPwRiseIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <div
          style={{
            position: "absolute", top: -120, left: -80, width: 460, height: 460,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(122,162,255,0.22), transparent 60%)",
            filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
          }}
        />
        <div
          style={{
            position: "absolute", bottom: -120, right: -80, width: 460, height: 460,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(167,139,250,0.18), transparent 60%)",
            filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
          }}
        />

        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 14, right: 14, zIndex: 4,
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.6)", cursor: "pointer",
            display: "grid", placeItems: "center", fontFamily: "inherit",
          }}
        >
          <IconClose size={13} />
        </button>

        {/* LEFT: pitch + features */}
        <div
          style={{
            padding: "40px 38px 36px",
            position: "relative", zIndex: 2,
            display: "flex", flexDirection: "column", gap: 22,
            borderRight: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: "50%", background: "#7AA2FF",
                boxShadow: "0 0 10px rgba(122,162,255,0.9)",
              }}
            />
            <span
              className="mf-mono"
              style={{ fontSize: 10.5, letterSpacing: "0.16em", color: "#7AA2FF" }}
            >
              {copy.eyebrow}
            </span>
          </div>

          <div>
            <h2
              style={{
                margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.025em",
                lineHeight: 1.08, color: "white",
              }}
            >
              {titleLead}
              {titleLead && " "}
              <span
                style={{
                  background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {titleTail}
              </span>
            </h2>
            <p
              style={{
                margin: "12px 0 0", fontSize: 14.5, color: "rgba(255,255,255,0.66)",
                lineHeight: 1.55, maxWidth: 380,
              }}
            >
              {copy.sub}
            </p>
          </div>

          <div
            style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4,
            }}
          >
            {FEATURES.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: "rgba(122,162,255,0.10)",
                    border: "1px solid rgba(122,162,255,0.25)",
                    display: "grid", placeItems: "center", color: "#7AA2FF",
                  }}
                >
                  {it.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "white", lineHeight: 1.3 }}>
                    {it.t}
                  </div>
                  <div
                    style={{
                      fontSize: 11, color: "rgba(255,255,255,0.5)",
                      marginTop: 2, lineHeight: 1.4,
                    }}
                  >
                    {it.d}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "auto", paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", gap: 14,
              color: "rgba(255,255,255,0.5)", fontSize: 11.5,
            }}
          >
            <div style={{ display: "flex" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: `linear-gradient(135deg, oklch(0.72 0.18 ${230 + i * 30}), oklch(0.55 0.18 ${280 + i * 20}))`,
                    border: "2px solid #0E1018",
                    marginLeft: i === 0 ? 0 : -7,
                  }}
                />
              ))}
            </div>
            <span>Loved by founders & product teams shipping every week</span>
          </div>
        </div>

        {/* RIGHT: plan + CTA */}
        <div
          style={{
            padding: "40px 36px 36px",
            position: "relative", zIndex: 2,
            display: "flex", flexDirection: "column",
            background: "linear-gradient(180deg, rgba(122,162,255,0.025), rgba(0,0,0,0))",
          }}
        >
          <div
            style={{
              padding: "22px 22px 20px", borderRadius: 14,
              background: "linear-gradient(180deg, rgba(122,162,255,0.06), rgba(167,139,250,0.03))",
              border: "1px solid rgba(122,162,255,0.25)",
              boxShadow:
                "0 12px 40px -12px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.05)",
              position: "relative", overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
                backgroundSize: "200% 100%",
                animation: "mfPwShimmer 4.5s linear infinite",
                opacity: 0.7,
              }}
            />

            <div
              style={{
                position: "relative", display: "flex", justifyContent: "space-between",
                alignItems: "baseline", marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "white" }}>
                  MotionFlow {plan.name}
                </span>
                {plan.popular && (
                  <span
                    className="mf-mono"
                    style={{
                      fontSize: 9, letterSpacing: "0.08em",
                      padding: "2px 6px", borderRadius: 4,
                      background: "linear-gradient(135deg, #7AA2FF, #A78BFA)",
                      color: "#0B0C10", fontWeight: 600,
                    }}
                  >
                    MOST POPULAR
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, position: "relative" }}>
              <span
                style={{
                  fontSize: 56, fontWeight: 500, letterSpacing: "-0.04em",
                  color: "white", lineHeight: 1,
                }}
              >
                ${plan.monthlyUsd}
              </span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>per month</span>
            </div>
            <div
              className="mf-mono"
              style={{
                marginTop: 8, fontSize: 10.5, letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.45)", position: "relative",
              }}
            >
              {plan.baseCredits.toLocaleString()} CREDITS / MONTH · CANCEL ANYTIME
            </div>
          </div>

          <button
            onClick={handlePrimary}
            style={{
              width: "100%", height: 48, borderRadius: 12, marginBottom: 10,
              border: "1px solid rgba(167,139,250,0.50)",
              background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
              backgroundSize: "200% 100%",
              color: "#0B0C10", fontSize: 14, fontWeight: 600,
              fontFamily: "inherit", letterSpacing: "-0.005em",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow:
                "0 12px 32px -8px rgba(122,162,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
              transition: "transform 160ms, box-shadow 160ms, background-position 600ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.backgroundPosition = "100% 0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.backgroundPosition = "0% 0";
            }}
          >
            <IconSparkle size={14} />
            {primaryCtaLabel}
            <IconArrowRight size={14} />
          </button>

          <button
            onClick={onSeePricing}
            style={{
              width: "100%", height: 40, borderRadius: 10, marginBottom: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white", fontSize: 12.5, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background 160ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
          >
            Compare all plans
          </button>

          <button
            onClick={onClose}
            style={{
              alignSelf: "center", background: "transparent", border: "none",
              color: "rgba(255,255,255,0.55)", fontSize: 12.5,
              fontFamily: "inherit", cursor: "pointer", padding: "6px 12px",
            }}
          >
            Maybe later
          </button>

          <div
            style={{
              marginTop: "auto", paddingTop: 18,
              display: "flex", flexDirection: "column", gap: 7,
              fontSize: 11.5, color: "rgba(255,255,255,0.45)",
            }}
          >
            {[
              "Cancel anytime — credits stay until period end",
              "Top up with one-time credit packs anytime",
              "Secure payment · Paddle",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <IconCheck size={11} style={{ color: "rgba(166,240,189,0.7)" }} />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
