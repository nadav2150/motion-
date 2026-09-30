import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./format";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-slate/40 bg-ink shadow-[var(--shadow-soft)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-paper">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-silver">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-paper sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-silver">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate/55 bg-ink/50 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate/35 text-silver" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-paper">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm text-silver">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("vd-skeleton rounded-xl", className)} />;
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate/45", className)}
    >
      <div className="h-full rounded-full bg-coral transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "coral" | "dark"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        tone === "coral" && "bg-coral/15 text-coral",
        tone === "slate" && "bg-slate/50 text-paper",
        tone === "dark" && "bg-black/65 text-white backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}
