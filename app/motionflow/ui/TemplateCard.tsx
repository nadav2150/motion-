import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router";
import type { StudioTemplate } from "../../lib/studio/types";
import { cn, formatClock } from "./format";
import { focusRing } from "./Button";

// Template tile: poster, preview video on hover (when one exists), duration
// badge, name and "30s · 16:9".
export function TemplateCard({
  t,
  href,
  className,
  eager,
  onOpen,
  busy,
}: {
  t: StudioTemplate;
  href: string;
  className?: string;
  eager?: boolean;
  // Open the template in the editor instead of following href.
  onOpen?: () => void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const start = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true; // autoplay policy: must be muted before play()
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {});
  };
  const stop = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setPlaying(false);
  };
  // 9:16 and 1:1 previews are shown whole on a blurred copy of the poster
  // instead of being center-cropped into the 16:9 tile.
  const fit = t.format === "16:9" ? "object-cover" : "object-contain";
  return (
    <Link
      to={href}
      className={cn("group block min-w-0 rounded-2xl", focusRing, className)}
      onClick={(e) => {
        if (!onOpen) return;
        e.preventDefault();
        onOpen();
      }}
      aria-busy={busy || undefined}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      aria-label={`${t.name} template — ${t.tagline}, ${t.duration} seconds, ${t.format}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate/40 bg-ink-800">
        {t.posterUrl && t.format !== "16:9" && (
          <img src={t.posterUrl} alt="" loading="lazy" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-xl" />
        )}
        {t.posterUrl ? (
          <img
            src={t.posterUrl}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className={cn("absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.04]", fit)}
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#4f5d75,#2d3142)]" />
        )}
        {t.previewVideoUrl && (
          <video
            ref={videoRef}
            src={t.previewVideoUrl}
            muted
            loop
            playsInline
            preload="none"
            className={cn("absolute inset-0 size-full transition-opacity", fit, playing ? "opacity-100" : "opacity-0")}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-[13px] font-medium text-white">
            <Loader2 className="size-4 vd-spin text-coral" aria-hidden />
            Opening editor…
          </div>
        )}
        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {formatClock(t.duration)}
        </span>
      </div>
      <div className="mt-3 px-0.5">
        <p className="truncate text-[15px] font-semibold text-paper">{t.name}</p>
        <p className="mt-0.5 truncate text-[13px] text-silver">
          {t.tagline} · {t.duration}s · {t.format}
        </p>
      </div>
    </Link>
  );
}
