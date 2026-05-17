import { ActionButton, ShotStatusChip } from "./shared";
import { SceneWindowVideo } from "./SceneWindowVideo";
import { deriveShotDisplay, fmtDuration } from "../utils";
import type { ShotRow } from "../types";

export const ShotCard = ({
  shot,
  f,
  selected,
  retrying,
  clipBusy,
  sceneStartSeconds = 0,
  sceneDurationSeconds,
  onSelect,
  onPreview,
  onRetry,
  onGenerateClip,
}: {
  shot: ShotRow;
  f: number;
  selected: boolean;
  retrying: boolean;
  clipBusy: boolean;
  sceneStartSeconds?: number;
  sceneDurationSeconds?: number;
  onSelect: () => void;
  onPreview: () => void;
  onRetry: () => void;
  onGenerateClip: () => void;
}) => {
  const palette = (shot.color_palette || "")
    .split(/[,\s]+/)
    .filter((c) => /^#?[0-9A-Fa-f]{6}$/.test(c))
    .slice(0, 5)
    .map((c) => (c.startsWith("#") ? c : `#${c}`));

  // Used only for the legacy "inspector" toggle path — currently no UI
  // calls onSelect, but we keep the prop wired so future inspector entry
  // points can flip selection without changing this signature.
  void onSelect;

  return (
    <button
      onClick={onPreview}
      style={{
        textAlign: "left",
        padding: 0,
        background: "rgba(8,9,13,0.55)",
        border: `1px solid ${selected ? "rgba(122,162,255,0.55)" : "var(--line)"}`,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: selected ? "0 10px 32px -10px rgba(122,162,255,0.45)" : "0 6px 18px -12px rgba(0,0,0,0.6)",
        transition: "border-color 200ms, box-shadow 200ms, transform 200ms",
        transform: selected ? "translateY(-1px)" : "translateY(0)",
        color: "inherit",
        fontFamily: "inherit",
        display: "flex", flexDirection: "column", gap: 0,
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16/9", background: "#050505", overflow: "hidden" }}>
        {shot.rendered_video_url ? (
          <SceneWindowVideo
            src={shot.rendered_video_url}
            startSeconds={sceneStartSeconds}
            durationSeconds={sceneDurationSeconds ?? (Number(shot.duration) || 0)}
            poster={shot.scene_thumbnail_path ?? undefined}
          />
        ) : shot.scene_thumbnail_path ? (
          <img
            src={shot.scene_thumbnail_path}
            alt={`Scene ${shot.shot_index + 1}`}
            loading="lazy"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : shot.scene_html_path ? (
          // Fallback for older jobs that ran before thumbnail capture existed.
          <iframe
            key={shot.scene_html_path}
            src={shot.scene_html_path}
            title={`Scene ${shot.shot_index + 1}`}
            sandbox="allow-scripts allow-same-origin"
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: 1920, height: 1080,
              transform: "scale(calc(100% / 1920 * 1))",
              transformOrigin: "top left",
              border: "none",
              background: "#050505",
              pointerEvents: "none",
            }}
            ref={(el) => {
              if (!el) return;
              const parent = el.parentElement;
              if (!parent) return;
              const scale = parent.clientWidth / 1920;
              el.style.transform = `scale(${scale})`;
              el.style.width = "1920px";
              el.style.height = "1080px";
            }}
          />
        ) : shot.clip_status === "ready" && shot.clip_url ? (
          <video
            key={shot.clip_url}
            src={shot.clip_url}
            poster={shot.image_url ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#050505" }}
          />
        ) : shot.status === "ready" && shot.image_url ? (
          <img
            src={shot.image_url}
            alt={shot.shot_goal ?? `Shot ${shot.shot_index + 1}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#050505" }}
          />
        ) : shot.status === "failed" ? (
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(135deg, rgba(255,107,107,0.10), rgba(122,162,255,0.05))",
              display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
              textAlign: "center", padding: 20, gap: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "#FCA5A5", lineHeight: 1.5, maxWidth: "100%" }}>
              <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.12em", marginBottom: 6 }}>IMAGE FAILED</div>
              <div style={{ fontSize: 11, color: "rgba(252,165,165,0.78)" }}>{shot.error?.slice(0, 120) ?? "Unknown error"}</div>
            </div>
            <ActionButton
              busy={retrying}
              label="Retry shot"
              busyLabel="Retrying…"
              tone="image"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
            />
          </div>
        ) : (
          <div
            style={{
              position: "absolute", inset: 0,
              background:
                "linear-gradient(135deg, #1F2937 0%, #0B0E18 60%), radial-gradient(circle at 30% 20%, rgba(167,139,250,0.18), transparent 55%)",
            }}
          >
            <div
              style={{
                position: "absolute", inset: 0, opacity: 0.55,
                background:
                  "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
                backgroundSize: "300% 100%",
                backgroundPosition: `${(f * 1.2) % 300}% 0`,
                transition: "background-position 60ms linear",
              }}
            />
            <div
              style={{
                position: "absolute", inset: 0, display: "grid", placeItems: "center",
              }}
            >
              <div
                className="mf-mono"
                style={{
                  fontSize: 10, letterSpacing: "0.18em",
                  color: shot.status === "generating" ? "#E2D6FF" : "var(--ink-3)",
                }}
              >
                {shot.status === "generating" ? "RENDERING IMG…" : "QUEUED"}
              </div>
            </div>
          </div>
        )}

        {/* Clip-only failure (image rendered fine, clip didn't) */}
        {shot.status === "ready" && shot.image_url && shot.clip_status === "failed" && (
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(11,12,16,0.85), rgba(11,12,16,0.20))",
              display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 14, gap: 8,
            }}
          >
            <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "#FCA5A5" }}>
              CLIP FAILED
            </div>
            <div style={{ fontSize: 11, color: "rgba(252,165,165,0.78)", lineHeight: 1.4 }}>
              {shot.clip_error?.slice(0, 100) ?? "Unknown error"}
            </div>
            <div>
              <ActionButton
                busy={clipBusy}
                label="Retry clip"
                busyLabel="Rendering…"
                tone="clip"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateClip();
                }}
              />
            </div>
          </div>
        )}

        {/* Clip rendering overlay (image is ready, clip is in progress) */}
        {shot.status === "ready" && shot.image_url && shot.clip_status === "generating" && (
          <div
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              padding: "8px 12px",
              background: "linear-gradient(to top, rgba(11,12,16,0.78), transparent)",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span
              style={{
                width: 9, height: 9, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.25)",
                borderTopColor: "#A7E5F0",
                animation: "mf-spin-slow 0.6s linear infinite",
                flexShrink: 0,
              }}
            />
            <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "#A7E5F0" }}>
              RENDERING CLIP…
            </span>
          </div>
        )}

        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6 }}>
          <span
            className="mf-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.10em",
              padding: "3px 7px",
              borderRadius: 6,
              background: "rgba(11,12,16,0.55)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(6px)",
            }}
          >
            {String(shot.shot_index + 1).padStart(2, "0")} · {fmtDuration(Number(shot.duration))}
          </span>
        </div>
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <ShotStatusChip display={deriveShotDisplay(shot)} />
        </div>

        {/* Idle clip → "Generate clip" button (bottom-right corner) */}
        {shot.status === "ready" &&
          shot.image_url &&
          (shot.clip_status === "skipped" || shot.clip_status === "pending") && (
            <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 3 }}>
              <ActionButton
                busy={clipBusy}
                label="Generate clip"
                busyLabel="Rendering…"
                tone="clip"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateClip();
                }}
              />
            </div>
          )}

        {/* Ready clip → small "Regenerate" overlay (subtle, top-right corner of image) */}
        {shot.clip_status === "ready" && (
          <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 3, opacity: 0.85 }}>
            <ActionButton
              busy={clipBusy}
              label="Regenerate"
              busyLabel="Rendering…"
              tone="clip"
              onClick={(e) => {
                e.stopPropagation();
                onGenerateClip();
              }}
            />
          </div>
        )}

        {shot.text_overlay && shot.text_overlay.trim() && shot.clip_status !== "ready" && (
          <div
            style={{
              position: "absolute", left: 14, bottom: 14, right: 14,
              fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em",
              color: "white", textShadow: "0 2px 14px rgba(0,0,0,0.55)",
              lineHeight: 1.15,
            }}
          >
            {shot.text_overlay}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontSize: 13, fontWeight: 500, color: "var(--ink-1)",
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {shot.shot_goal || shot.narration_part || `Shot ${shot.shot_index + 1}`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {[shot.composition, shot.camera_motion, shot.lighting]
            .filter(Boolean)
            .map((tag, i) => (
              <span
                key={i}
                className="mf-mono"
                style={{
                  fontSize: 9.5, letterSpacing: "0.06em",
                  padding: "2px 6px", borderRadius: 5,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--line)",
                  color: "var(--ink-2)",
                }}
              >
                {tag}
              </span>
            ))}
        </div>
        {palette.length > 0 && (
          <div style={{ display: "flex", gap: 3 }}>
            {palette.map((c, i) => (
              <span
                key={i}
                title={c}
                style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: c, border: "1px solid rgba(255,255,255,0.08)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </button>
  );
};
