import { useEffect, useState } from "react";
import type { ShotRow } from "../types";
import type { SceneTiming } from "../hooks/use-playback";

/**
 * Toggleable HUD that shows the editor's timing model in real time. Press
 * `D` to toggle. Useful for verifying the global-clock invariants:
 *
 *   - global currentTimeMs / frame
 *   - active shot id, scene start/end on the master film
 *   - local scene time (= currentTime - scene.startMs)
 *   - audio.currentTime values (drift vs. global time should stay < 0.1s)
 */
export const ClockDebugOverlay = ({
  time,
  currentFrame,
  playing,
  activeShot,
  activeSceneTiming,
  localSceneTime,
  audioRef,
  sfxRef,
  voRef,
}: {
  time: number;
  currentFrame: number;
  playing: boolean;
  activeShot: ShotRow | null;
  activeSceneTiming: SceneTiming | null;
  localSceneTime: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  sfxRef: React.RefObject<HTMLAudioElement | null>;
  voRef: React.RefObject<HTMLAudioElement | null>;
}) => {
  const [visible, setVisible] = useState(false);
  // We can't read audio.currentTime in render directly without re-rendering,
  // so we sample it on a 60fps rAF when the overlay is visible.
  const [audioTimes, setAudioTimes] = useState({ music: 0, sfx: 0, vo: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Ignore presses while typing into inputs / textareas — `D` is a
        // common letter and we don't want to hijack it from the script editor.
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      setAudioTimes({
        music: audioRef.current?.currentTime ?? 0,
        sfx: sfxRef.current?.currentTime ?? 0,
        vo: voRef.current?.currentTime ?? 0,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, audioRef, sfxRef, voRef]);

  if (!visible) return null;

  const ms = Math.round(time * 1000);
  const sceneStart = activeSceneTiming?.startSeconds ?? 0;
  const sceneEnd = activeSceneTiming
    ? activeSceneTiming.startSeconds + activeSceneTiming.durationSeconds
    : 0;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(8,9,13,0.92)",
        border: "1px solid rgba(122,162,255,0.35)",
        boxShadow: "0 10px 30px -8px rgba(0,0,0,0.6)",
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        color: "var(--ink-1)",
        letterSpacing: "0.04em",
        minWidth: 280,
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "var(--ink-4)", fontSize: 9, letterSpacing: "0.12em", marginBottom: 6 }}>
        CLOCK · D TO HIDE
      </div>
      <Row label="state" value={playing ? "▶ playing" : "⏸ paused"} />
      <Row label="time" value={`${time.toFixed(3)}s · ${ms}ms`} />
      <Row label="frame" value={String(currentFrame)} hint="(time × 30)" />
      <Row
        label="active"
        value={
          activeShot
            ? `${String(activeShot.shot_index + 1).padStart(2, "0")} · ${activeShot.id.slice(0, 8)}`
            : "—"
        }
      />
      <Row
        label="window"
        value={`${sceneStart.toFixed(2)} → ${sceneEnd.toFixed(2)}s`}
      />
      <Row label="local" value={`${localSceneTime.toFixed(3)}s`} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />
      <Row label="music" value={`${audioTimes.music.toFixed(3)}s`} drift={audioTimes.music - time} />
      <Row label="sfx" value={`${audioTimes.sfx.toFixed(3)}s`} drift={audioTimes.sfx - localSceneTime} />
      <Row label="vo" value={`${audioTimes.vo.toFixed(3)}s`} drift={audioTimes.vo - localSceneTime} />
    </div>
  );
};

const Row = ({
  label,
  value,
  hint,
  drift,
}: {
  label: string;
  value: string;
  hint?: string;
  drift?: number;
}) => {
  const driftBad = drift != null && Math.abs(drift) > 0.15;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, lineHeight: 1.5 }}>
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ color: driftBad ? "#FCA5A5" : "var(--ink-1)" }}>
        {value}
        {hint && <span style={{ color: "var(--ink-4)" }}> {hint}</span>}
        {drift != null && (
          <span style={{ color: driftBad ? "#FCA5A5" : "var(--ink-4)", marginLeft: 6 }}>
            (Δ {drift >= 0 ? "+" : ""}
            {(drift * 1000).toFixed(0)}ms)
          </span>
        )}
      </span>
    </div>
  );
};
