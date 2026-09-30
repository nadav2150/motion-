import { Link } from "react-router";
import { cn } from "./format";

// Coral play-triangle mark. Inline SVG (the repo's logo.svg is ~1 MB).
// `outline` is the hollow-triangle mark used on the marketing landing page.
export function LogoMark({
  size = 28,
  className,
  variant = "filled",
  color = "#f2703f",
}: {
  size?: number;
  className?: string;
  variant?: "filled" | "outline";
  color?: string;
}) {
  if (variant === "outline") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
        <path d="M8 6.5c0-1.6 1.7-2.5 3-1.7l15.2 9.5c1.3.8 1.3 2.6 0 3.4L11 27.2c-1.3.8-3-.1-3-1.7V6.5z" fill="none" stroke={color} strokeWidth="4.2" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="0" y="0" width="32" height="32" rx="9" fill="#ef8354" />
      <path d="M12.2 9.6c0-1.2 1.3-1.9 2.3-1.3l8.6 5.4c1 .6 1 2 0 2.6l-8.6 5.4c-1 .6-2.3-.1-2.3-1.3V9.6z" fill="#fff" />
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  size = 28,
  variant = "filled",
  textClassName,
}: {
  href?: string | null;
  className?: string;
  size?: number;
  variant?: "filled" | "outline";
  textClassName?: string;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} variant={variant} />
      <span className={cn("text-[19px] font-bold tracking-[-0.02em] text-paper", textClassName)}>Videly</span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link
      to={href}
      aria-label="Videly home"
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
    >
      {inner}
    </Link>
  );
}
