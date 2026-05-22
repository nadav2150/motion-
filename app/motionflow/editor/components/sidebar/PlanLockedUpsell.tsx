import { IconArrowRight, IconLogo } from "../../../primitives";

// Inline upsell card rendered inside the body of any sidebar AccordionSection
// whose feature is gated behind a paid plan. Replaces the normal section
// content when the user expands a locked dropdown (Voiceover / Music / SFX).
// Mirrors the upsell pattern used in ScenesPanel's locked comments tab.
export const PlanLockedUpsell = ({
  title,
  description,
  onUpsell,
  priceHint = "FROM $19 / MONTH",
}: {
  title: string;
  description: string;
  onUpsell?: () => void;
  priceHint?: string;
}) => (
  <div
    style={{
      position: "relative",
      padding: "20px 16px 18px",
      borderRadius: 12,
      border: "1px solid rgba(122,162,255,0.22)",
      background:
        "linear-gradient(180deg, rgba(122,162,255,0.06) 0%, rgba(167,139,250,0.04) 60%, rgba(8,9,13,0.4) 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: 12,
      overflow: "hidden",
    }}
  >
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: -50,
        left: "50%",
        transform: "translateX(-50%)",
        width: 200,
        height: 200,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(122,162,255,0.22), transparent 65%)",
        filter: "blur(26px)",
        pointerEvents: "none",
      }}
    />

    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: 48,
        height: 48,
        borderRadius: 12,
        display: "grid",
        placeItems: "center",
        background:
          "linear-gradient(180deg, rgba(122,162,255,0.18), rgba(167,139,250,0.10))",
        border: "1px solid rgba(122,162,255,0.35)",
        boxShadow:
          "0 8px 24px -8px rgba(122,162,255,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      <IconLogo size={26} />
    </div>

    <div style={{ position: "relative", zIndex: 1 }}>
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: "var(--ink-1)",
          letterSpacing: "-0.01em",
          lineHeight: 1.3,
        }}
      >
        {title}{" "}
        <span
          style={{
            background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Videly
        </span>{" "}
        paid feature
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11.5,
          lineHeight: 1.55,
          color: "var(--ink-3)",
          maxWidth: 240,
        }}
      >
        {description}
      </div>
    </div>

    <button
      onClick={() => onUpsell?.()}
      style={{
        position: "relative",
        zIndex: 1,
        marginTop: 2,
        padding: "9px 16px",
        borderRadius: 9,
        border: "1px solid rgba(122,162,255,0.55)",
        background:
          "linear-gradient(180deg, rgba(122,162,255,0.28), rgba(167,139,250,0.20))",
        color: "white",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        boxShadow:
          "0 6px 18px -6px rgba(122,162,255,0.55), inset 0 1px 0 rgba(255,255,255,0.10)",
      }}
    >
      <span>Upgrade to unlock</span>
      <IconArrowRight size={12} />
    </button>

    <span
      className="mf-mono"
      style={{
        position: "relative",
        zIndex: 1,
        fontSize: 9,
        letterSpacing: "0.16em",
        color: "var(--ink-4)",
      }}
    >
      {priceHint}
    </span>
  </div>
);
