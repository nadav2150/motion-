import { useEffect, useRef, useState } from "react";
import { IconPause, IconPlay, IconWave, Switch } from "../../../primitives";
import { SfxPicker, type CurrentSfx } from "../../../SfxPicker";
import { AccordionSection, ComingSoonPanel } from "../shared";
import type { JobRow, ShotRow } from "../../types";
import { PlanLockedBadge } from "./PlanLockedBadge";
import { PlanLockedUpsell } from "./PlanLockedUpsell";

// Per-scene SFX cue shape (as written by persistResolvedAudio in jobs.ts).
type SfxCueRow = {
  id: string;
  url: string;
  name: string;
  license?: string;
  licenseUrl?: string;
  momentSec: number;
  kind: "punch" | "impact" | "transition" | "ambient";
  volume?: number;
};

function isSfxCueRow(v: unknown): v is SfxCueRow {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as { url?: unknown }).url === "string" &&
    typeof (v as { momentSec?: unknown }).momentSec === "number"
  );
}

export const SfxSection = ({
  open,
  onToggle,
  jobId,
  job,
  shots = [],
  setJob,
  enabled,
  onEnabledChange,
  locked,
  planLocked = false,
  onUpsell,
}: {
  open: boolean;
  onToggle: () => void;
  jobId: string | null;
  job: JobRow | null;
  shots?: ShotRow[];
  setJob: React.Dispatch<React.SetStateAction<JobRow | null>>;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  locked: boolean;
  planLocked?: boolean;
  onUpsell?: () => void;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
      }
    };
  }, []);

  // Flatten per-shot cues into a single list { shotIndex, cue } ordered by
  // shot then by momentSec for predictable scrolling.
  const cues: Array<{ shotIndex: number; key: string; cue: SfxCueRow }> = [];
  for (const s of shots) {
    const raw = s.sfx_cues;
    if (!Array.isArray(raw)) continue;
    for (const row of raw) {
      if (!isSfxCueRow(row)) continue;
      cues.push({
        shotIndex: s.shot_index,
        key: `${s.id}_${row.id}`,
        cue: row,
      });
    }
  }
  cues.sort((a, b) =>
    a.shotIndex !== b.shotIndex
      ? a.shotIndex - b.shotIndex
      : a.cue.momentSec - b.cue.momentSec,
  );

  const toggle = (key: string, url: string) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingKey === key) {
      a.pause();
      setPlayingKey(null);
      return;
    }
    a.src = url;
    a.currentTime = 0;
    void a
      .play()
      .then(() => setPlayingKey(key))
      .catch(() => setPlayingKey(null));
  };

  const badge =
    cues.length > 0
      ? `✨ ${cues.length} ${cues.length === 1 ? "CUE" : "CUES"}`
      : job?.sfx_name
        ? job.sfx_name.length > 18
          ? `${job.sfx_name.slice(0, 18)}…`
          : job.sfx_name
        : enabled
          ? "ON"
          : "OFF";

  return (
    <AccordionSection
      label="SFX"
      badge={planLocked ? "PRO" : badge}
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
            label="Enable per-scene SFX for next generation"
          />
        )
      }
    >
      {planLocked ? (
        <PlanLockedUpsell
          title="Per-scene SFX is a"
          description="Auto-pick Freesound cues that punctuate the impact moments in every scene. Unlock SFX, voiceover, and music on a paid plan."
          onUpsell={onUpsell}
        />
      ) : (
        <>
      <audio ref={audioRef} onEnded={() => setPlayingKey(null)} preload="none" />

      {jobId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                className="mf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--ink-3)",
                  letterSpacing: "0.12em",
                }}
              >
                AUTO SFX (PER SCENE)
              </div>
              {cues.map(({ shotIndex, key, cue }) => {
                const isPlaying = playingKey === key;
                return (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "rgba(103,232,249,0.05)",
                      border: "1px solid rgba(103,232,249,0.20)",
                    }}
                  >
                    <span
                      className="mf-mono"
                      style={{
                        fontSize: 10,
                        color: "var(--ink-4)",
                        letterSpacing: "0.08em",
                        width: 40,
                        flexShrink: 0,
                      }}
                      title={`${cue.kind} at ${cue.momentSec.toFixed(2)}s`}
                    >
                      {String(shotIndex + 1).padStart(2, "0")}
                      <span style={{ color: "var(--ink-4)", opacity: 0.6 }}>·</span>
                      {cue.kind.slice(0, 3).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--ink-1)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cue.name}
                      </div>
                      <div
                        className="mf-mono"
                        style={{
                          fontSize: 10,
                          color: "var(--ink-4)",
                          letterSpacing: "0.04em",
                          marginTop: 2,
                        }}
                      >
                        @ {cue.momentSec.toFixed(2)}s
                        {cue.license ? ` · ${cue.license}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => toggle(key, cue.url)}
                      aria-label={isPlaying ? "Pause" : "Play"}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        display: "grid",
                        placeItems: "center",
                        background: isPlaying
                          ? "rgba(103,232,249,0.18)"
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

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              className="mf-mono"
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.12em",
              }}
            >
              PROJECT SFX (MANUAL)
            </div>
            <SfxPicker
              jobId={jobId}
              current={
                job?.sfx_id && job?.sfx_url
                  ? ({
                      sfxId: job.sfx_id,
                      name: job.sfx_name ?? "",
                      author: job.sfx_author ?? "",
                      previewUrl: job.sfx_url,
                      license: job.sfx_license ?? "",
                    } satisfies CurrentSfx)
                  : null
              }
              onChange={(next) => {
                setJob((prev) =>
                  prev
                    ? {
                        ...prev,
                        sfx_id: next?.sfxId ?? null,
                        sfx_name: next?.name ?? null,
                        sfx_author: next?.author ?? null,
                        sfx_url: next?.previewUrl ?? null,
                        sfx_license: next?.license ?? null,
                      }
                    : prev,
                );
              }}
            />
          </div>
        </div>
      ) : (
        <ComingSoonPanel
          icon={<IconWave size={14} />}
          title={enabled ? "SFX enabled" : "SFX off"}
          hint={
            enabled
              ? "Generate this project to auto-pick per-scene Freesound cues that punctuate impact moments."
              : "Toggle on before Generate to add per-scene sound effects."
          }
        />
      )}
        </>
      )}
    </AccordionSection>
  );
};
