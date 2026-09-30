import { Link } from "react-router";
import { cn } from "./format";

// Coral play-triangle mark. Inline SVG (the repo's logo.svg is ~1 MB).
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="0" y="0" width="32" height="32" rx="9" fill="#ef8354" />
      <path d="M12.2 9.6c0-1.2 1.3-1.9 2.3-1.3l8.6 5.4c1 .6 1 2 0 2.6l-8.6 5.4c-1 .6-2.3-.1-2.3-1.3V9.6z" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = "/", className, size = 28 }: { href?: string | null; className?: string; size?: number }) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="text-[19px] font-bold tracking-[-0.02em] text-paper">Videly</span>
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
