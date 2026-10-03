// AI Voice picker for the prompt card: every voice can be previewed in place,
// with the chosen read speed and tone applied to the preview.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, Lock, Pause, Play, VolumeX } from "lucide-react";
import {
  formatSpeed,
  VOICE_SPEEDS,
  VOICE_TONE_SPECS,
  VOICE_TONES,
  type VoiceSpeed,
  type VoiceTone,
} from "../../lib/studio/voice-style";
import type { VoiceOption } from "./api";
import { focusRing } from "./Button";
import { cn } from "./format";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function previewUrl(voiceId: string, tone: VoiceTone): string {
  return `/api/voices/preview?voiceId=${encodeURIComponent(voiceId)}&tone=${tone}`;
}

export function VoicePicker({
  voices,
  voiceId,
  speed,
  tone,
  locked,
  lockedLabel,
  onVoice,
  onSpeed,
  onTone,
  onLocked,
  trigger,
  triggerClassName,
}: {
  voices: VoiceOption[];
  voiceId: string; // "off" or a voice id
  speed: VoiceSpeed;
  tone: VoiceTone;
  locked: boolean; // plan has no audio: selecting a voice opens the upsell
  lockedLabel: string;
  onVoice: (id: string) => void;
  onSpeed: (s: VoiceSpeed) => void;
  onTone: (t: VoiceTone) => void;
  onLocked: () => void;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setLoading(null);
  };

  const play = (id: string) => {
    if (playing === id || loading === id) return stop();
    start(id);
  };

  const start = (id: string) => {
    stop();
    setFailed(null);
    const a = new Audio(previewUrl(id, tone));
    a.preservesPitch = true;
    a.playbackRate = speed;
    audioRef.current = a;
    setLoading(id);
    a.onended = () => audioRef.current === a && setPlaying(null);
    a.onerror = () => {
      if (audioRef.current !== a) return;
      setLoading(null);
      setPlaying(null);
      setFailed(id);
    };
    a.play()
      .then(() => {
        if (audioRef.current !== a) return a.pause();
        // playbackRate resets on some browsers once the media loads.
        a.playbackRate = speed;
        setLoading(null);
        setPlaying(id);
      })
      .catch(() => {
        if (audioRef.current !== a) return;
        setLoading(null);
        setFailed(id);
      });
  };

  // Speed changes apply live; a tone change needs a different clip.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    const current = playing ?? loading;
    if (current) start(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tone]);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
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
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const select = (id: string) => {
    if (locked && id !== "off") return onLocked();
    onVoice(id);
  };

  const segment = "flex-1 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label="AI voice"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
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
          id={panelId}
          role="dialog"
          aria-label="AI voice settings"
          className="absolute left-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-slate/55 bg-ink-800 shadow-[var(--shadow-lift)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-[300px] overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => select("off")}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-paper transition-colors hover:bg-slate/40",
                focusRing,
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate/40 text-silver">
                <VolumeX className="size-4" aria-hidden />
              </span>
              <span className="flex-1">No voiceover</span>
              {voiceId === "off" && <Check className="size-4 text-coral" aria-hidden />}
            </button>
            {voices.map((v) => {
              const isPlaying = playing === v.id;
              const isLoading = loading === v.id;
              const selected = voiceId === v.id;
              const meta = [v.accent && cap(v.accent), v.gender && cap(v.gender)].filter(Boolean).join(" · ");
              return (
                <div
                  key={v.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate/40",
                    selected && "bg-coral/10",
                  )}
                >
                  <button
                    type="button"
                    aria-label={isPlaying || isLoading ? `Stop ${v.label} preview` : `Play ${v.label} preview`}
                    onClick={() => play(v.id)}
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
                      isPlaying || isLoading
                        ? "border-coral bg-coral text-ink-900"
                        : "border-slate/70 text-paper hover:border-coral hover:text-coral",
                      focusRing,
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : isPlaying ? (
                      <Pause className="size-3.5" aria-hidden />
                    ) : (
                      <Play className="ml-0.5 size-3.5" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => select(v.id)}
                    className={cn("min-w-0 flex-1 text-left", focusRing)}
                  >
                    <span className="block truncate text-sm font-medium text-paper">
                      {v.label}
                      {meta && <span className="font-normal text-silver"> · {meta}</span>}
                    </span>
                    <span className="block truncate text-[12px] text-silver">
                      {failed === v.id ? "Preview unavailable — try again" : v.tone ? cap(v.tone) : ""}
                    </span>
                  </button>
                  {selected ? (
                    <Check className="size-4 shrink-0 text-coral" aria-hidden />
                  ) : locked ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-silver">
                      <Lock className="size-3.5" aria-hidden />
                      {lockedLabel}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-slate/50 p-3">
            <div>
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-silver">Speed</p>
              <div role="radiogroup" aria-label="Voice speed" className="flex gap-1 rounded-xl bg-ink-900/60 p-1">
                {VOICE_SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={speed === s}
                    onClick={() => onSpeed(s)}
                    className={cn(
                      segment,
                      speed === s ? "bg-coral text-ink-900" : "text-paper hover:bg-slate/40",
                      focusRing,
                    )}
                  >
                    {formatSpeed(s)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-silver">Tone</p>
              <div role="radiogroup" aria-label="Voice tone" className="grid grid-cols-4 gap-1 rounded-xl bg-ink-900/60 p-1">
                {VOICE_TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tone === t}
                    onClick={() => onTone(t)}
                    className={cn(
                      segment,
                      tone === t ? "bg-coral text-ink-900" : "text-paper hover:bg-slate/40",
                      focusRing,
                    )}
                  >
                    {VOICE_TONE_SPECS[t].label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[12px] leading-snug text-silver">
              Press <Play className="inline size-3 align-[-1px]" aria-hidden /> to hear a voice with this speed and tone.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
