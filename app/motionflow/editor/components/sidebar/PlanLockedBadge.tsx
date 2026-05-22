import { FaCrown } from "react-icons/fa";

// Small crown button rendered in the header of any sidebar section whose
// feature is gated behind a paid plan. Clicking calls onClick (typically a
// setter that opens the paywall modal). The stopPropagation is required
// because AccordionSection wraps the row in a button — without it the
// click would also toggle the accordion open/closed.
export const PlanLockedBadge = ({
  onClick,
  title = "Upgrade to unlock",
}: {
  onClick?: () => void;
  title?: string;
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    title={title}
    aria-label={title}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 26,
      height: 22,
      borderRadius: 6,
      background: "linear-gradient(135deg, rgba(122,162,255,0.10), rgba(167,139,250,0.06))",
      border: "1px solid rgba(167,139,250,0.40)",
      color: "#A78BFA",
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "background 160ms, border-color 160ms",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background =
        "linear-gradient(135deg, rgba(122,162,255,0.18), rgba(167,139,250,0.12))";
      e.currentTarget.style.borderColor = "rgba(167,139,250,0.60)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background =
        "linear-gradient(135deg, rgba(122,162,255,0.10), rgba(167,139,250,0.06))";
      e.currentTarget.style.borderColor = "rgba(167,139,250,0.40)";
    }}
  >
    <FaCrown size={11} />
  </button>
);
