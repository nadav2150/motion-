import { useId, useRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "./format";
import { focusRing } from "./Button";

// ------------------------------------------------------------------ Chip

export function Chip({
  active,
  icon,
  children,
  className,
  onRemove,
  removeLabel,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const cls = cn(
    "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
    active
      ? "border-coral/70 bg-coral/15 text-paper"
      : "border-slate/55 bg-ink-800 text-silver hover:border-slate hover:bg-slate/35 hover:text-paper",
    className,
  );
  if (onRemove) {
    return (
      <span className={cn(cls, "pr-1.5")}>
        {icon}
        <span className="max-w-[180px] truncate">{children}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Remove"}
          className={cn("ml-0.5 inline-flex size-6 items-center justify-center rounded-full hover:bg-slate/60", focusRing)}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={cn(cls, focusRing)} aria-pressed={active} {...rest}>
      {icon}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Tabs (pill)

export type TabItem<K extends string> = { key: K; label: string; count?: number };

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
  size = "md",
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next]!.key);
      refs.current[next]?.focus();
    }
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("vd-noscrollbar -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-1", className)}
    >
      {items.map((it, i) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(it.key)}
            className={cn(
              "shrink-0 rounded-full font-medium transition-colors",
              size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-9 px-4 text-sm",
              active ? "bg-coral text-white" : "text-silver hover:bg-slate/35 hover:text-paper",
              focusRing,
            )}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className={cn("ml-1.5 text-xs", active ? "text-white/80" : "text-silver/70")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Select

export type SelectOption = { value: string; label: string; disabled?: boolean };

// Styled native <select>: keyboard + screen-reader behaviour for free.
export function Select({
  value,
  onChange,
  options,
  label,
  icon,
  className,
  selectClassName,
  disabled,
  hideLabel = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  label: string;
  icon?: ReactNode;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-[13px] font-medium text-silver"}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-silver" aria-hidden>
            {icon}
          </span>
        )}
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate/55 bg-ink-800 pr-9 text-sm font-medium text-paper transition-colors hover:border-slate disabled:cursor-not-allowed disabled:opacity-50",
            icon ? "pl-9" : "pl-3.5",
            focusRing,
            selectClassName,
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled} className="bg-ink text-paper">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-silver" aria-hidden />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Toggle

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  showLabel = false,
  className,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("group inline-flex items-center gap-2.5 rounded-full disabled:cursor-not-allowed disabled:opacity-50", focusRing, className)}
    >
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors",
          sm ? "h-5 w-9" : "h-6 w-11",
          checked ? "bg-coral" : "bg-slate/70",
        )}
      >
        <span
          className={cn(
            "absolute rounded-full bg-white shadow transition-transform",
            sm ? "left-0.5 size-4" : "left-0.5 size-5",
            checked ? (sm ? "translate-x-4" : "translate-x-5") : "translate-x-0",
          )}
        />
      </span>
      {showLabel && <span className="text-sm text-paper">{label}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ SearchBar

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search…",
  label = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-silver" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 w-full rounded-xl border border-slate/50 bg-ink pl-10 pr-3 text-sm text-paper placeholder:text-silver/70 transition-colors hover:border-slate",
          focusRing,
        )}
      />
    </form>
  );
}

// ------------------------------------------------------------------ Field (text input with label)

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className,
  inputClassName,
  hideLabel,
  icon,
  onKeyDown,
  disabled,
  autoFocus,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  inputClassName?: string;
  hideLabel?: boolean;
  icon?: ReactNode;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-[13px] font-medium text-silver"}>
        {label}
      </label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-silver">{icon}</span>}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 w-full rounded-xl border border-slate/55 bg-ink-800 pr-3 text-sm text-paper placeholder:text-silver/60 transition-colors hover:border-slate disabled:opacity-50",
            icon ? "pl-9" : "pl-3.5",
            focusRing,
            inputClassName,
          )}
        />
      </div>
    </div>
  );
}
