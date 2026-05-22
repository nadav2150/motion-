import { useEffect, useRef, useState } from "react";
import { IconMic, IconPause, IconPlay, Switch } from "../../../primitives";
import { AccordionSection, ComingSoonPanel } from "../shared";
import type { ShotRow } from "../../types";
import { PlanLockedBadge } from "./PlanLockedBadge";

// Per-scene voiceover viewer. Reads each shot's voiceover_url + voiceover_text
// (written by the auto-audio pipeline in app/lib/jobs.ts:persistResolvedAudio)
// and lets the user preview each one with a small play button. Owns ONE
// <audio> element shared across rows — clicking a different row pauses the
// previous one and seeks the shared element to the new src.
//
// The header switch opts the next Generate call into voiceover synthesis;
// it's read once at Generate time (see use-script.ts → /api/jobs body).
// Once the job is no longer pending (`locked`), the switch is disabled —
// toggling after the fact does NOT regenerate.
export const VoiceoverSection = ({
  open,
  onToggle,
  shots,
  enabled,
  onEnabledChange,
  locked,
  planLocked = false,
  onUpsell,
}: {
  open: boolean;
  onToggle: () => void;
  shots: ShotRow[];
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  locked: boolean;
  // True when the current plan does not include audio. Replaces the
  // enable-switch with a crown badge that fires `onUpsell` on click.
  planLocked?: boolean;
  onUpsell?: () => void;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingShotId, setPlayingShotId] = useState<string | null>(null);

  const withVoiceover = shots.filter((s) => !!s.voiceover_url);
  const count = withVoiceover.length;

  // Pause + clear src on unmount so the element doesn't keep buffering.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
      }
    };
  }, []);

  const toggle = (shot: ShotRow) => {
    const a = audioRef.current;
    if (!a || !shot.voiceover_url) return;
    if (playingShotId === shot.id) {
      a.pause();
      setPlayingShotId(null);
      return;
    }
    a.src = shot.voiceover_url;
    a.currentTime = 0;
    void a
      .play()
      .then(() => setPlayingShotId(shot.id))
      .catch(() => setPlayingShotId(null));
  };

  return (
    <AccordionSection
      label="VOICEOVER"
      badge={
        planLocked
          ? "PRO"
          : count > 0
            ? `✨ ${count}/${shots.length}`
            : enabled
              ? "ON"
              : "OFF"
      }
      open={open}
      onToggle={onToggle}
      headerControl={
        planLocked ? (
          <PlanLockedBadge onClick={onUpsell} />
        ) : (
          <Switch
            checked={enabled}
            onChange={onEnabledChange}
            disabled={locked}
            label="Enable voiceover for next generation"
          />
        )
      }
    >
      <audio ref={audioRef} onEnded={() => setPlayingShotId(null)} preload="none" />

      {count === 0 ? (
        <ComingSoonPanel
          icon={<IconMic size={14} />}
          title={enabled ? "Voiceover enabled" : "Voiceover off"}
          hint={
            enabled
              ? "Generate this project to synthesize a short ElevenLabs narration for each scene."
              : "Toggle on before Generate to add per-scene narration."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {withVoiceover.map((s) => {
            const isPlaying = playingShotId === s.id;
            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(122,162,255,0.05)",
                  border: "1px solid rgba(122,162,255,0.20)",
                }}
              >
                <span
                  className="mf-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--ink-4)",
                    letterSpacing: "0.08em",
                    width: 22,
                    flexShrink: 0,
                  }}
                >
                  {String(s.shot_index + 1).padStart(2, "0")}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-1)",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {s.voiceover_text || "(no text)"}
                  </div>
                </div>
                <button
                  onClick={() => toggle(s)}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    display: "grid",
                    placeItems: "center",
                    background: isPlaying
                      ? "rgba(122,162,255,0.18)"
                      : "transparent",
                    border: "1px solid var(--line)",
                    color: "var(--ink-1)",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </AccordionSection>
  );
};
