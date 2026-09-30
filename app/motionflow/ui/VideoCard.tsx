import type { ReactNode } from "react";
import { Link } from "react-router";
import { Play, Star } from "lucide-react";
import type { StudioStage, StudioVideoCard } from "../../lib/studio/types";
import { GENERATING_STAGES } from "./api";
import { cn, formatClock, timeAgo } from "./format";
import { focusRing } from "./Button";

export type VideoStatusKind = "generating" | "ready" | "draft" | "failed" | "rendering";

export function videoStatus(card: Pick<StudioVideoCard, "stage" | "progress" | "status" | "generationMode">): {
  kind: VideoStatusKind;
  pct: number;
} {
  const pct = Math.round((card.progress ?? 0) * 100);
  if (card.generationMode !== "v2") {
    if (card.status === "failed") return { kind: "failed", pct };
    if (card.status === "completed") return { kind: "ready", pct: 100 };
    if (card.status === "draft" || card.status === "queued") return { kind: "draft", pct: 0 };
    return { kind: "generating", pct };
  }
  const stage = card.stage as StudioStage | null;
  if (stage === "failed" || card.status === "failed") return { kind: "failed", pct };
  if (stage === "queued" && pct === 0) return { kind: "draft", pct: 0 };
  if (stage && GENERATING_STAGES.has(stage)) return { kind: "generating", pct };
  if (stage === "rendering" || stage === "mixing_audio") return { kind: "rendering", pct };
  return { kind: "ready", pct: 100 };
}

export function StatusLine({
  kind,
  pct,
  when,
  className,
}: {
  kind: VideoStatusKind;
  pct: number;
  when?: string | null;
  className?: string;
}) {
  const map: Record<VideoStatusKind, { dot: string; text: string; label: string }> = {
    generating: { dot: "bg-coral vd-pulse", text: "text-coral", label: `Generating · ${pct}%` },
    rendering: { dot: "bg-coral vd-pulse", text: "text-coral", label: `Exporting · ${pct}%` },
    ready: { dot: "bg-ready", text: "text-ready", label: when ? `Ready · ${timeAgo(when)}` : "Ready" },
    draft: { dot: "bg-silver", text: "text-silver", label: "Draft" },
    failed: { dot: "bg-danger", text: "text-danger", label: "Failed" },
  };
  const s = map[kind];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", s.text, className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function Thumb({
  src,
  alt,
  duration,
  className,
  children,
  eager,
  showPlay = true,
}: {
  src: string | null;
  alt: string;
  duration?: number | null;
  className?: string;
  children?: ReactNode;
  eager?: boolean;
  showPlay?: boolean;
}) {
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-xl bg-ink-800", className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_10%,rgb(79_93_117/0.7),transparent_60%),linear-gradient(135deg,#2d3142,#1f222e)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" aria-hidden />
      {showPlay && (
        <span
          className="absolute bottom-2.5 left-2.5 flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
          aria-hidden
        >
          <Play className="size-3.5 translate-x-[1px] fill-current" />
        </span>
      )}
      {duration != null && duration > 0 && (
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {formatClock(duration)}
        </span>
      )}
      {children}
    </div>
  );
}

export function VideoCard({
  card,
  href,
  menu,
  eager,
}: {
  card: StudioVideoCard;
  href: string;
  menu?: ReactNode;
  eager?: boolean;
}) {
  const st = videoStatus(card);
  return (
    <article className="group relative min-w-0">
      <Link to={href} className={cn("block rounded-xl", focusRing)} aria-label={`Open ${card.title}`}>
        <Thumb src={card.thumbUrl} alt="" duration={card.duration} eager={eager}>
          {(st.kind === "generating" || st.kind === "rendering") && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <div className="h-full bg-coral transition-[width] duration-700" style={{ width: `${Math.max(4, st.pct)}%` }} />
            </div>
          )}
          {card.favorite && (
            <span className="absolute left-2.5 top-2.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-coral backdrop-blur-sm">
              <Star className="size-3.5 fill-current" aria-label="Favorite" />
            </span>
          )}
        </Thumb>
      </Link>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-paper">
            <Link to={href} className="hover:underline focus-visible:outline-none" tabIndex={-1}>
              {card.title}
            </Link>
          </h3>
          <StatusLine kind={st.kind} pct={st.pct} when={card.updatedAt} className="mt-1" />
        </div>
        {menu}
      </div>
    </article>
  );
}

export function VideoCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="vd-skeleton aspect-video w-full rounded-xl" />
      <div className="vd-skeleton mt-3 h-4 w-3/4 rounded-md" />
      <div className="vd-skeleton mt-2 h-3 w-1/3 rounded-md" />
    </div>
  );
}

export function videoHref(card: Pick<StudioVideoCard, "id" | "generationMode">): string {
  return card.generationMode === "v2" ? `/videos/${card.id}` : `/editor?job=${encodeURIComponent(card.id)}`;
}
