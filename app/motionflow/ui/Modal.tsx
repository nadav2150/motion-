import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./format";
import { Button, IconButton } from "./Button";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideTitle,
  dismissible = true,
  size = "md",
}: {
  size?: "md" | "lg";
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  hideTitle?: boolean;
  dismissible?: boolean;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  // Remember the opener before children (e.g. an autoFocus input) steal focus.
  if (open && !wasOpen.current && typeof document !== "undefined") {
    lastFocus.current = document.activeElement as HTMLElement | null;
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel?.contains(document.activeElement)) {
      const first =
        panel?.querySelector<HTMLElement>("[data-autofocus]") ??
        panel?.querySelector<HTMLElement>(`form ${FOCUSABLE.split(",").join(", form ")}`) ??
        panel?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel) {
        const els = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const firstEl = els[0]!;
        const lastEl = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocus.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 font-sans text-paper sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        aria-hidden
        onClick={() => dismissible && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate/50 bg-ink p-5 shadow-[var(--shadow-lift)] sm:rounded-2xl sm:p-6",
          size === "lg" ? "sm:max-w-[780px]" : "sm:max-w-lg",
          className,
        )}
      >
        <div className={cn("mb-4 flex items-start justify-between gap-4", hideTitle && "sr-only")}>
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-paper">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-silver">
                {description}
              </p>
            )}
          </div>
          {dismissible && !hideTitle && (
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-5" aria-hidden />
            </IconButton>
          )}
        </div>
        {dismissible && hideTitle && (
          <IconButton label="Close" onClick={onClose} className="absolute right-3 top-3 z-10">
            <X className="size-5" aria-hidden />
          </IconButton>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  busy,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={body} dismissible={!busy}>
      <div className="mt-2 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
