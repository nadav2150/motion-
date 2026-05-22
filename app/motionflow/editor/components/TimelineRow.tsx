import { useEffect, useRef, useState } from "react";
import {
  IconImage,
  IconLogo,
  IconMusic,
  IconType,
  IconWand,
} from "../../primitives";
import { fmtTime, isSceneAssetArray, readDraggedAsset } from "../utils";
import type { JobAsset, SceneAssetKind, ShotRow } from "../types";

// Tracks the playhead position; a click anywhere on a track seeks `time`. All
// tracks, the ruler, and the playhead share ONE coordinate space: absolute %
// of total duration inside the track-area. That guarantees pixel-perfect
// alignment between the playhead, the tile under it, and the ruler tick — no
// gap-accumulation drift like the old flex-based layout had.
export const TimelineRow = ({
  shots,
  totalDuration,
  time,
  setTime,
  setPlaying,
  selectedId,
  onSelect,
  onPreview,
  sceneTimings,
  onAssetDrop,
  isThinking,
  thinkingLabel,
}: {
  shots: ShotRow[];
  totalDuration: number;
  time: number;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  sceneTimings: Map<string, { startSeconds: number; durationSeconds: number; totalSeconds: number }>;
  onAssetDrop?: (
    shotId: string,
    trackKind: "video" | "motion" | "text" | "audio",
    asset: JobAsset,
  ) => void;
  // While true, the timeline is covered by a blurred Videly-logo overlay so
  // the user can't interact with mid-flight scene tiles. The parent flips
  // this back to false once the job reaches a TERMINAL status.
  isThinking?: boolean;
  thinkingLabel?: string;
}) => {
  // Tracks which scene tile currently has a draggable hovering over it, so we
  // can light up just that tile's border. Cleared on dragleave / drop.
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null);

  // Diagnostic: log `time` once per second so we can verify the UI is
  // receiving fresh values. Remove once timeline desync work is done.
  const renderCount = useRef(0);
  const timeRef = useRef(time);
  const totalRef = useRef(totalDuration);
  renderCount.current++;
  timeRef.current = time;
  totalRef.current = totalDuration;
  useEffect(() => {
    const id = setInterval(() => {
      const t = timeRef.current;
      const tot = totalRef.current;
      console.log(
        `[timeline-ui] time=${t.toFixed(3)}s · total=${tot.toFixed(3)}s · pct=${(t / Math.max(tot, 0.001)).toFixed(4)} · renders_last_sec=${renderCount.current}`,
      );
      renderCount.current = 0;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(totalDuration, 0.001);
  const tickStep = total > 30 ? 10 : total > 10 ? 5 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= total; t += tickStep) ticks.push(t);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setTime(pct * total);
  };

  // Helper that returns the [startPct, widthPct] of a scene on the master
  // film. Both are percentages of totalDuration so they live in the same
  // coordinate system as the playhead.
  const sceneRect = (shotId: string, duration: number) => {
    const start = sceneTimings.get(shotId)?.startSeconds ?? 0;
    return {
      leftPct: (start / total) * 100,
      widthPct: (duration / total) * 100,
    };
  };

  const playheadPct = Math.max(0, Math.min(1, time / total)) * 100;

  return (
    <div style={{ position: "relative", borderTop: "1px solid var(--line)", background: "rgba(8,9,13,0.55)", padding: "16px 28px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        <span className="mf-eyebrow">TIMELINE</span>
        <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>
          {shots.length} {shots.length === 1 ? "SCENE" : "SCENES"} · 4 TRACKS
        </span>
      </div>

      {/* Ruler — same coordinate system as the tracks. */}
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, marginBottom: 6 }}>
        <div/>
        <div style={{ position: "relative", height: 14 }}>
          {ticks.map((t, i) => (
            <div key={i} style={{ position: "absolute", left: `${(t / total) * 100}%`, transform: i === ticks.length - 1 ? "translateX(-100%)" : undefined }}>
              <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.08em" }}>
                {fmtTime(t).slice(0, 5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tracks — each row uses the same 110px label + 1fr track-area grid,
          with the track-area as a position:relative container so we can
          absolutely position scene tiles AND the playhead by percentage of
          totalDuration. Same coordinate space → things align by construction. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {([
          { l: "SCENES", icon: <IconImage size={11}/>, kind: "video" as const },
          { l: "VOICE OVER", icon: <IconWand size={11}/>, kind: "motion" as const },
          { l: "SOUND EFFECTS", icon: <IconType size={11}/>, kind: "text" as const },
          { l: "AUDIO", icon: <IconMusic size={11}/>, kind: "audio" as const },
        ]).map((tr, trackIdx) => {
          const isLastTrack = trackIdx === 3;
          return (
            <div key={tr.l} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", minWidth: 0 }}>
                {tr.icon}
                <span
                  className="mf-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tr.l}
                </span>
              </div>
              <div
                onClick={handleSeek}
                style={{
                  position: "relative",
                  height: tr.kind === "audio" ? 30 : 28,
                  cursor: "pointer",
                  userSelect: "none",
                  background: "rgba(255,255,255,0.012)",
                  borderRadius: 4,
                }}
              >
                {tr.kind === "audio" || tr.kind === "motion" || tr.kind === "text" ? (
                  // Per-scene asset blocks for the audio-style tracks. Each
                  // shot's slot is at start%, width=duration%; if the shot
                  // has a matching asset, the slot is filled; otherwise
                  // empty/dashed.
                  (() => {
                    const targetKind: SceneAssetKind =
                      tr.kind === "motion"
                        ? "voiceover"
                        : tr.kind === "text"
                          ? "sfx"
                          : "music";
                    const emptyLabel =
                      tr.kind === "motion"
                        ? "NO VOICE OVER"
                        : tr.kind === "text"
                          ? "NO SOUND EFFECTS"
                          : "NO AUDIO";
                    const accent =
                      tr.kind === "audio"
                        ? "rgba(167,139,250,0.18)"
                        : tr.kind === "motion"
                          ? "rgba(122,162,255,0.18)"
                          : "rgba(103,232,249,0.18)";
                    const anyAttached = shots.some(
                      (s) =>
                        isSceneAssetArray(s.assets) &&
                        s.assets.some((a) => a.kind === targetKind),
                    );
                    if (!anyAttached) {
                      return (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 4,
                            background: "rgba(255,255,255,0.015)",
                            border: "1px dashed var(--line-2)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--ink-4)",
                          }}
                        >
                          <span
                            className="mf-mono"
                            style={{
                              fontSize: 9,
                              letterSpacing: "0.14em",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {emptyLabel}
                          </span>
                        </div>
                      );
                    }
                    return shots.map((s) => {
                      const { leftPct, widthPct } = sceneRect(s.id, Number(s.duration) || 0);
                      const allAssets = isSceneAssetArray(s.assets) ? s.assets : [];
                      const matched = allAssets.find((a) => a.kind === targetKind);
                      return (
                        <div
                          key={s.id}
                          title={matched?.name ?? `${emptyLabel} on scene ${s.shot_index + 1}`}
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            borderRadius: 4,
                            background: matched ? accent : "rgba(255,255,255,0.015)",
                            border: `1px ${matched ? "solid" : "dashed"} ${
                              matched ? "rgba(255,255,255,0.10)" : "var(--line-2)"
                            }`,
                            padding: "0 8px",
                            display: "flex",
                            alignItems: "center",
                            overflow: "hidden",
                            boxSizing: "border-box",
                          }}
                        >
                          {matched ? (
                            tr.kind === "audio" ? (
                              <div
                                style={{
                                  flex: 1,
                                  height: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 2,
                                  overflow: "hidden",
                                }}
                              >
                                {Array.from({ length: 24 }).map((_, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      width: 2,
                                      height: `${20 + Math.abs(Math.sin((i + s.shot_index * 3) / 2.4)) * 70}%`,
                                      background: "rgba(167,139,250,0.7)",
                                      borderRadius: 1,
                                      flexShrink: 0,
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span
                                className="mf-mono"
                                style={{
                                  fontSize: 9,
                                  color: "rgba(255,255,255,0.85)",
                                  letterSpacing: "0.04em",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {matched.name.toUpperCase()}
                              </span>
                            )
                          ) : null}
                        </div>
                      );
                    });
                  })()
                ) : (
                  // Scenes track — one tile per shot, positioned absolutely
                  // by [startSeconds, duration] / totalDuration. No gaps —
                  // borders separate tiles, so the coordinate system matches
                  // the playhead exactly.
                  shots.map((s) => {
                    const { leftPct, widthPct } = sceneRect(s.id, Number(s.duration) || 0);
                    const isSelected = selectedId === s.id;
                    const thumb = s.scene_thumbnail_path ?? s.image_url ?? null;
                    const baseBg = thumb
                      ? `#050505 center/cover no-repeat url(${thumb})`
                      : "linear-gradient(135deg, #1F2937, #5468FF)";
                    const isDropTarget = dragOverShotId === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(s.id);
                          const start = sceneTimings.get(s.id)?.startSeconds ?? 0;
                          setTime(start + 0.001);
                          setPlaying(true);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onPreview(s.id);
                        }}
                        onDragOver={(e) => {
                          if (!onAssetDrop) return;
                          if (
                            Array.from(e.dataTransfer.types).includes(
                              "application/x-mg-asset",
                            )
                          ) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                            setDragOverShotId(s.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverShotId === s.id) setDragOverShotId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOverShotId(null);
                          if (!onAssetDrop) return;
                          const asset = readDraggedAsset(e);
                          if (!asset) return;
                          onAssetDrop(s.id, tr.kind, asset);
                        }}
                        title={s.shot_goal ?? ""}
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          borderRadius: 4,
                          background: baseBg,
                          border: `1px solid ${
                            isDropTarget
                              ? "rgba(122,162,255,0.9)"
                              : isSelected
                                ? "rgba(122,162,255,0.7)"
                                : "rgba(255,255,255,0.18)"
                          }`,
                          padding: "0 10px",
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          cursor: "pointer",
                          boxShadow: isDropTarget
                            ? "0 0 0 2px rgba(122,162,255,0.55), 0 10px 30px -8px rgba(122,162,255,0.55)"
                            : isSelected
                              ? "0 0 0 1px rgba(122,162,255,0.4), 0 8px 24px -8px rgba(122,162,255,0.4)"
                              : "none",
                          transition: "border-color 120ms, box-shadow 120ms",
                          boxSizing: "border-box",
                        }}
                      >
                        {thumb && (
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.55))" }}/>
                        )}
                        <span
                          className="mf-mono"
                          style={{
                            position: "relative",
                            fontSize: 9, color: "rgba(255,255,255,0.85)",
                            letterSpacing: "0.04em", whiteSpace: "nowrap",
                            overflow: "hidden", textOverflow: "ellipsis",
                          }}
                        >
                          {(s.shot_goal ?? `SCENE ${s.shot_index + 1}`).toUpperCase()}
                        </span>
                      </div>
                    );
                  })
                )}

                {/* Per-track playhead overlay — same coordinate space as the
                    tiles, so the line lands inside whatever scene contains
                    `time`, pixel-accurate. We render it on every track so the
                    line spans the full timeline visually. On the last track
                    we extend it down for the dot at the bottom too. */}
                <div
                  style={{
                    position: "absolute",
                    top: trackIdx === 0 ? -10 : -5,
                    bottom: isLastTrack ? -2 : -5,
                    left: `${playheadPct}%`,
                    width: 1,
                    background: "#7AA2FF",
                    boxShadow: "0 0 10px rgba(122,162,255,0.8)",
                    pointerEvents: "none",
                    transform: "translateX(-0.5px)",
                  }}
                >
                  {trackIdx === 0 && (
                    <div style={{ position: "absolute", top: -6, left: -4, width: 9, height: 9, borderRadius: "50%", background: "#7AA2FF", boxShadow: "0 0 12px rgba(122,162,255,0.9)" }}/>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isThinking && (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "grid",
            placeItems: "center",
            background: "rgba(8,9,13,0.55)",
            backdropFilter: "blur(10px) saturate(140%)",
            WebkitBackdropFilter: "blur(10px) saturate(140%)",
            borderTop: "1px solid var(--line)",
            cursor: "wait",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, pointerEvents: "none" }}>
            <div
              className="mf-float"
              style={{
                position: "relative",
                display: "grid",
                placeItems: "center",
                width: 72,
                height: 72,
                borderRadius: 20,
                background: "rgba(122,162,255,0.10)",
                border: "1px solid rgba(122,162,255,0.30)",
                boxShadow: "0 0 60px rgba(122,162,255,0.35), inset 0 0 20px rgba(167,139,250,0.18)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -6,
                  borderRadius: 24,
                  border: "1px solid rgba(122,162,255,0.35)",
                  animation: "mf-ring-pulse 2.4s ease-out infinite",
                }}
              />
              <IconLogo size={36} />
            </div>
            <span
              className="mf-mono"
              style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--ink-1)" }}
            >
              {thinkingLabel ?? "GENERATING"}…
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                animation: "mf-pulse-soft 1.6s ease-in-out infinite",
              }}
            >
              Videly is building your timeline
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
