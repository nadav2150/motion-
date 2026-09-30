import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./format";
import { focusRing } from "./Button";

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

// Small accessible dropdown menu (button + role="menu").
export function Menu({
  trigger,
  label,
  items,
  align = "right",
  className,
  triggerClassName,
  header,
}: {
  trigger: ReactNode;
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
  triggerClassName?: string;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => itemRefs.current.find((el) => el && !el.disabled)?.focus());
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const move = (from: number, dir: 1 | -1) => {
    const els = itemRefs.current;
    for (let i = 1; i <= els.length; i++) {
      const idx = (from + dir * i + els.length) % els.length;
      if (els[idx] && !els[idx]!.disabled) {
        els[idx]!.focus();
        return;
      }
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn("inline-flex items-center justify-center", focusRing, triggerClassName)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute z-50 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-slate/55 bg-ink-800 p-1.5 shadow-[var(--shadow-lift)]",
            align === "right" ? "right-0" : "left-0",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {items.map((it, i) => (
            <button
              key={it.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-40",
                it.danger ? "text-danger hover:bg-danger/10" : "text-paper hover:bg-slate/40",
                "focus-visible:bg-slate/40 focus-visible:outline-none",
              )}
            >
              {it.icon && <span className="text-silver [&>svg]:size-4">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
