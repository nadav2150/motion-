// Preview player for Videly v2 documents.
//
// The generated video is an HTML document rendered in a sandboxed iframe
// (`sandbox="allow-scripts"`, no same-origin) and driven through the
// postMessage protocol from app/lib/studio/clock-shim.ts:
//   parent → iframe: { type: "videly:seek", time } | { type: "videly:play" } | { type: "videly:pause" }
//   iframe → parent: { type: "videly:ready", duration, width, height }
//                    { type: "videly:time", time, playing }
//                    { type: "videly:error", message }
// Audio (voiceover + music) is never in the document; the parent plays it in
// <audio> elements kept in sync with videly:time.

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Maximize, Minimize, Pause, Play, Repeat, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import type { StudioAudio } from "../../lib/studio/types";
import { api } from "./api";
import { cn, formatTime } from "./format";
import { focusRing } from "./Button";

type PreviewState = {
  ready: boolean;
  time: number;
  duration: number;
  playing: boolean;
  error: string | null;
};

export type PreviewController = PreviewState & {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  loop: boolean;
  setLoop: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  setMuted: (v: boolean) => void;
  voRef: RefObject<HTMLAudioElement | null>;
  musicRef: RefObject<HTMLAudioElement | null>;
  reset: () => void;
};

const MUSIC_GAIN = 0.25; // preview approximation of the final ducked mix

export function usePreviewController(fallbackDuration: number): PreviewController {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const voRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [s, setS] = useState<PreviewState>({ ready: false, time: 0, duration: fallbackDuration, playing: false, error: null });
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const wasPlaying = useRef(false);

  const post = useCallback((m: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(m, "*");
  }, []);

  const audios = () => [voRef.current, musicRef.current].filter(Boolean) as HTMLAudioElement[];

  const syncAudio = useCallback((t: number, playing: boolean) => {
    for (const a of audios()) {
      if (!a.src) continue;
      const within = !Number.isFinite(a.duration) || t < a.duration;
      if (playing && within) {
        if (a.paused) {
          a.currentTime = t;
          a.play().catch(() => {});
        } else if (Math.abs(a.currentTime - t) > 0.3) {
          a.currentTime = t;
        }
      } else if (!a.paused) {
        a.pause();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const m = e.data as { type?: string; time?: number; playing?: boolean; duration?: number; message?: string };
      if (!m || typeof m.type !== "string") return;
      if (m.type === "videly:ready") {
        setS((p) => ({ ...p, ready: true, error: null, duration: Number(m.duration) > 0 ? Number(m.duration) : p.duration }));
      } else if (m.type === "videly:time") {
        const t = Number(m.time) || 0;
        const playing = !!m.playing;
        setS((p) => {
          if (p.time === t && p.playing === playing) return p;
          return { ...p, time: t, playing };
        });
        syncAudio(t, playing);
        if (wasPlaying.current && !playing && loopRef.current) {
          const d = durationRef.current;
          if (t >= d - 0.06) {
            post({ type: "videly:seek", time: 0 });
            post({ type: "videly:play" });
          }
        }
        wasPlaying.current = playing;
      } else if (m.type === "videly:error") {
        setS((p) => ({ ...p, error: String(m.message ?? "The preview hit an error.") }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [post, syncAudio]);

  const durationRef = useRef(s.duration);
  durationRef.current = s.duration;

  useEffect(() => {
    const v = muted ? 0 : volume;
    if (voRef.current) voRef.current.volume = v;
    if (musicRef.current) musicRef.current.volume = v * MUSIC_GAIN;
  }, [volume, muted]);

  const play = useCallback(() => {
    post({ type: "videly:play" });
    // Start audio inside the user gesture so autoplay policies allow it.
    const t = s.time >= s.duration - 0.05 ? 0 : s.time;
    for (const a of audios()) {
      if (!a.src) continue;
      a.currentTime = t;
      a.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, s.time, s.duration]);

  const pause = useCallback(() => {
    post({ type: "videly:pause" });
    audios().forEach((a) => a.pause());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  const seek = useCallback(
    (t: number) => {
      const c = Math.max(0, Math.min(durationRef.current, t));
      post({ type: "videly:seek", time: c });
      setS((p) => ({ ...p, time: c }));
      for (const a of audios()) if (a.src) a.currentTime = c;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post],
  );

  const reset = useCallback(() => {
    setS((p) => ({ ...p, ready: false, time: 0, playing: false, error: null }));
    audios().forEach((a) => a.pause());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...s,
    iframeRef,
    voRef,
    musicRef,
    play,
    pause,
    toggle: () => (s.playing ? pause() : play()),
    seek,
    loop,
    setLoop,
    volume,
    setVolume,
    muted,
    setMuted,
    reset,
  };
}

export function PreviewPlayer({
  ctl,
  jobId,
  revision,
  width,
  height,
  audio,
  poster,
  className,
  variant = "default",
  extra,
}: {
  ctl: PreviewController;
  jobId: string;
  revision: number;
  width: number;
  height: number;
  audio: StudioAudio;
  poster?: string | null;
  className?: string;
  // "banner": fills a wide container edge to edge (cover, not letterbox) with
  // a single-row control bar, as on the home page's Recent Videos.
  variant?: "default" | "banner";
  // Extra control rendered at the end of the bar (banner variant).
  extra?: ReactNode;
}) {
  const banner = variant === "banner";
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [source, setSource] = useState<{ src?: string; srcdoc?: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [hover, setHover] = useState(false);
  const { reset } = ctl;

  useEffect(() => {
    let alive = true;
    reset();
    setSource(null);
    api.previewSource(jobId, revision).then((s) => alive && setSource(s));
    return () => {
      alive = false;
    };
  }, [jobId, revision, reset]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const fit = banner && !fullscreen ? Math.max : Math.min;
  const scale = box.w && box.h ? fit(box.w / width, box.h / height) : 0;
  const left = (box.w - width * scale) / 2;
  const top = (box.h - height * scale) / 2;
  const pct = ctl.duration > 0 ? (ctl.time / ctl.duration) * 100 : 0;

  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT") return;
    if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return; // native activation
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      ctl.toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      ctl.seek(ctl.time + 5);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ctl.seek(ctl.time - 5);
    } else if (e.key === "f") {
      toggleFs();
    } else if (e.key === "m") {
      ctl.setMuted(!ctl.muted);
    }
  };

  const showControls = hover || !ctl.playing;

  return (
    <div
      ref={stageRef}
      className={cn(
        "group/player relative w-full overflow-hidden bg-black",
        fullscreen ? "h-full" : banner ? "h-full rounded-[14px] border border-[#1c232c]" : "aspect-video rounded-2xl border border-slate/40",
        className,
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={onKey}
    >
      {poster && !ctl.ready && (
        <img
          src={poster}
          alt=""
          className={cn("absolute inset-0 size-full", banner ? "object-cover" : "object-contain opacity-60")}
          aria-hidden
        />
      )}
      {source && scale > 0 && (
        <iframe
          ref={ctl.iframeRef}
          title="Video preview"
          sandbox="allow-scripts"
          src={source.src}
          srcDoc={source.srcdoc}
          tabIndex={-1}
          style={{
            position: "absolute",
            left,
            top,
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            border: 0,
            pointerEvents: "none",
            background: "#000",
          }}
        />
      )}
      {!ctl.ready && !ctl.error && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="size-9 rounded-full border-2 border-white/25 border-t-coral vd-spin" />
        </div>
      )}
      {ctl.error && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center">
          <AlertTriangle className="size-6 text-coral" aria-hidden />
          <p className="max-w-md text-sm text-paper">{ctl.error}</p>
        </div>
      )}

      {/* Click layer: toggles play; the document itself is non-interactive. */}
      <button
        type="button"
        aria-label={ctl.playing ? "Pause" : "Play"}
        onClick={ctl.toggle}
        disabled={!ctl.ready}
        className={cn("absolute inset-0 z-[1] cursor-pointer disabled:cursor-default", "focus-visible:outline-none")}
      >
        {banner && ctl.ready && !ctl.playing && (
          <span className="absolute left-1/2 top-1/2 flex size-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/85 bg-black/30 backdrop-blur-sm transition-transform group-hover/player:scale-105">
            <Play className="size-8 translate-x-0.5 fill-white text-white" aria-hidden />
          </span>
        )}
        {!banner && ctl.ready && !ctl.playing && ctl.time < 0.05 && (
          <span className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-coral shadow-[0_10px_40px_-8px_rgb(239_131_84/0.9)] sm:size-20">
            <Play className="size-7 translate-x-0.5 fill-white text-white sm:size-8" aria-hidden />
          </span>
        )}
      </button>

      {banner && !fullscreen ? (
        <div className="absolute inset-x-0 bottom-0 z-[2] flex items-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10 text-white sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={ctl.toggle}
            disabled={!ctl.ready}
            aria-label={ctl.playing ? "Pause" : "Play"}
            className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-white/15", focusRing)}
          >
            {ctl.playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="size-5 fill-current" aria-hidden />}
          </button>
          <span className="shrink-0 text-[14px] font-medium tabular-nums text-white/90">
            {formatTime(ctl.time)} / {formatTime(ctl.duration)}
          </span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={ctl.duration || 0}
            step={0.01}
            value={ctl.time}
            disabled={!ctl.ready}
            onChange={(e) => ctl.seek(Number(e.target.value))}
            aria-valuetext={`${formatTime(ctl.time)} of ${formatTime(ctl.duration)}`}
            className="vd-range mx-2 block h-4 min-w-0 flex-1"
            style={{ ["--vd-fill" as string]: `${pct}%` }}
          />
          <button
            type="button"
            onClick={() => ctl.setMuted(!ctl.muted)}
            aria-label={ctl.muted ? "Unmute" : "Mute"}
            className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-white/15", focusRing)}
          >
            {ctl.muted || ctl.volume === 0 ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={ctl.muted ? 0 : ctl.volume}
            onChange={(e) => {
              ctl.setVolume(Number(e.target.value));
              ctl.setMuted(false);
            }}
            className="vd-range hidden h-4 w-24 sm:block"
            style={{ ["--vd-fill" as string]: `${(ctl.muted ? 0 : ctl.volume) * 100}%` }}
          />
          <button
            type="button"
            onClick={toggleFs}
            aria-label="Full screen"
            className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-white/15", focusRing)}
          >
            <Maximize className="size-5" aria-hidden />
          </button>
          {extra}
        </div>
      ) : (
      <>
      {/* Controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200 sm:px-4",
          showControls ? "opacity-100" : "opacity-0 focus-within:opacity-100",
        )}
      >
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={ctl.duration || 0}
          step={0.01}
          value={ctl.time}
          disabled={!ctl.ready}
          onChange={(e) => ctl.seek(Number(e.target.value))}
          aria-valuetext={`${formatTime(ctl.time)} of ${formatTime(ctl.duration)}`}
          className="vd-range block h-4 w-full"
          style={{ ["--vd-fill" as string]: `${pct}%` }}
        />
        <div className="mt-1.5 flex items-center gap-1 text-white sm:gap-2">
          <button
            type="button"
            onClick={ctl.toggle}
            disabled={!ctl.ready}
            aria-label={ctl.playing ? "Pause" : "Play"}
            className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-white/15", focusRing)}
          >
            {ctl.playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="size-5 fill-current" aria-hidden />}
          </button>
          <span className="text-[13px] font-medium tabular-nums text-white/90">
            {formatTime(ctl.time)} / {formatTime(ctl.duration)}
          </span>
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={() => ctl.setMuted(!ctl.muted)}
              aria-label={ctl.muted ? "Unmute" : "Mute"}
              className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-white/15", focusRing)}
            >
              {ctl.muted || ctl.volume === 0 ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
            </button>
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={ctl.muted ? 0 : ctl.volume}
              onChange={(e) => {
                ctl.setVolume(Number(e.target.value));
                ctl.setMuted(false);
              }}
              className="vd-range hidden h-4 w-20 sm:block"
              style={{ ["--vd-fill" as string]: `${(ctl.muted ? 0 : ctl.volume) * 100}%` }}
            />
            <button
              type="button"
              onClick={() => ctl.setLoop(!ctl.loop)}
              aria-pressed={ctl.loop}
              aria-label="Loop"
              className={cn(
                "flex size-9 items-center justify-center rounded-lg hover:bg-white/15",
                ctl.loop ? "text-coral" : "text-white",
                focusRing,
              )}
            >
              <Repeat className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggleFs}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-white/15", focusRing)}
            >
              {fullscreen ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>

      </>
      )}

      {audio.voiceover?.url && <audio ref={ctl.voRef} src={audio.voiceover.url} preload="auto" />}
      {audio.music?.url && <audio ref={ctl.musicRef} src={audio.music.url} preload="auto" />}
    </div>
  );
}
