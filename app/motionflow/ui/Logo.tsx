import { Link } from "react-router";
import { cn } from "./format";

// Videly "V-play" mark (public/logo-mark.png, 160px — crisp up to ~50px at 3x).
// `variant`/`color` are kept for call-site compatibility; the mark is full-color.
export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
  variant?: "filled" | "outline";
  color?: string;
}) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("block shrink-0 select-none", className)}
    />
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
