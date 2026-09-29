import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "./format";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: ToastKind };

let seq = 1;
const listeners = new Set<(t: ToastItem) => void>();

// Fire-and-forget toast; rendered by <ToastHost/> (mounted in AppShell and the
// marketing pages that need it).
export function toast(message: string, kind: ToastKind = "success") {
  const t = { id: seq++, message, kind };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const add = (t: ToastItem) => {
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 3200);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "vd-toast pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border bg-ink-800 px-4 py-3 text-sm text-paper shadow-[var(--shadow-lift)]",
            t.kind === "error" ? "border-danger/50" : "border-slate/60",
          )}
        >
          {t.kind === "success" && <CheckCircle2 className="size-4 shrink-0 text-ready" aria-hidden />}
          {t.kind === "error" && <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />}
          {t.kind === "info" && <Info className="size-4 shrink-0 text-coral" aria-hidden />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
