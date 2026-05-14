import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AppChrome,
  Button,
  IconArrowRight,
  IconChevron,
  IconClose,
  IconFolder,
  IconLayers,
  IconMic,
  IconMusic,
  IconPalette,
  IconPlus,
  IconShare,
  IconSparkle,
  IconUpload,
  IconWand,
  IconWave,
  Pill,
  useFrame,
  type NavKey,
} from "../primitives";

type JobStatus =
  | "pending"
  | "directing"
  | "rendering"
  | "generating_scenes"
  | "scenes_ready"
  | "rendering_scenes"
  | "stitching"
  | "completed"
  | "failed"
  | "canceled";

type ShotStatus = "pending" | "generating" | "ready" | "failed";
type ClipStatus = "pending" | "generating" | "ready" | "failed" | "skipped";

type JobRow = {
  id: string;
  script: string;
  product_description: string | null;
  brand_style: string | null;
  brand_logo_url: string | null;
  brand_logo_storage_path: string | null;
  brand_colors: string[] | null;
  title: string | null;
  status: JobStatus;
  shot_count: number | null;
  director_model: string | null;
  image_model: string | null;
  video_model: string | null;
  film_mode: string | null;
  continuity: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type ShotRow = {
  id: string;
  job_id: string;
  shot_index: number;
  duration: number;
  narration_part: string | null;
  shot_goal: string | null;
  visual_style: string | null;
  image_prompt: string;
  video_prompt: string | null;
  negative_prompt: string | null;
  composition: string | null;
  focal_point: string | null;
  camera_motion: string | null;
  lighting: string | null;
  transition_out: string | null;
  ui_density: string | null;
  text_overlay: string | null;
  color_palette: string | null;
  shot_type: string | null;
  subject: string | null;
  ui_description: string | null;
  ui_motion: string | null;
  lighting_motion: string | null;
  depth_cue: string | null;
  atmosphere: string | null;
  pacing: string | null;
  intent: string | null;
  domain: string | null;
  grounding: unknown;
  visual_anchors: unknown;
  motion_anchors: unknown;
  style_notes: string | null;
  validation_passed: boolean | null;
  validation_warnings: string | null;
  validation_attempts: number | null;
  status: ShotStatus;
  image_url: string | null;
  error: string | null;
  clip_status: ClipStatus;
  clip_url: string | null;
  clip_error: string | null;
  // HyperFrames additions:
  scene_html_path: string | null;
  scene_thumbnail_path: string | null;
  rendered_video_url: string | null;
  render_status: string | null;
};

type JobResponse = { job: JobRow; shots: ShotRow[] };

// Polling stops when status is in TERMINAL. `scenes_ready` is a *pause*
// state for the split pipeline — polling stops so the Export button
// activates; clicking Export resumes polling via pollNonce bump.
const TERMINAL: JobStatus[] = ["completed", "failed", "canceled", "scenes_ready"];

type DisplayStatus = ShotStatus | "clip_generating" | "clip_failed" | "clip_skipped" | "clip_ready";

function deriveShotDisplay(shot: ShotRow): { status: DisplayStatus; label: string; error: string | null } {
  if (shot.status === "failed") return { status: "failed", label: "IMG FAILED", error: shot.error };
  if (shot.status === "pending") return { status: "pending", label: "QUEUED", error: null };
  if (shot.status === "generating") return { status: "generating", label: "RENDERING IMG", error: null };
  // image ready — look at clip
  if (shot.clip_status === "ready") return { status: "clip_ready", label: "CLIP READY", error: null };
  if (shot.clip_status === "generating") return { status: "clip_generating", label: "RENDERING CLIP", error: null };
  if (shot.clip_status === "failed") return { status: "clip_failed", label: "CLIP FAILED", error: shot.clip_error };
  // 'skipped' or 'pending' → clip not yet generated; image is the deliverable.
  return { status: "clip_skipped", label: "IMG READY", error: null };
}

const STATUS_TONE: Record<JobStatus, { tone: "default" | "glow" | "success"; dot: string; label: string }> = {
  pending: { tone: "default", dot: "#7AA2FF", label: "QUEUED" },
  directing: { tone: "glow", dot: "#A78BFA", label: "DIRECTING" },
  rendering: { tone: "glow", dot: "#67E8F9", label: "RENDERING" },
  generating_scenes: { tone: "glow", dot: "#A78BFA", label: "GENERATING SCENES" },
  scenes_ready: { tone: "default", dot: "#A6F0BD", label: "SCENES READY · CLICK EXPORT" },
  rendering_scenes: { tone: "glow", dot: "#67E8F9", label: "RENDERING SCENES" },
  stitching: { tone: "glow", dot: "#67E8F9", label: "STITCHING" },
  completed: { tone: "success", dot: "#A6F0BD", label: "READY" },
  failed: { tone: "default", dot: "#FCA5A5", label: "FAILED" },
  canceled: { tone: "default", dot: "#9CA3AF", label: "CANCELED" },
};

const fmtDuration = (s: number) => `${s.toFixed(1).replace(/\.0$/, "")}s`;

const GenerateButton = ({
  onClick,
  label = "Generate",
  loading = false,
  disabled = false,
}: {
  onClick?: () => void;
  label?: string;
  loading?: boolean;
  disabled?: boolean;
}) => {
  const [hover, setHover] = useState(false);
  const dim = disabled || loading;
  return (
    <button
      onClick={onClick}
      disabled={dim}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "0 16px", height: 32, borderRadius: 8,
        border: "1px solid rgba(167,139,250,0.45)",
        background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
        backgroundSize: "200% 100%",
        backgroundPosition: hover && !dim ? "100% 0" : "0% 0",
        transition: "background-position 600ms ease, transform 200ms, box-shadow 200ms, opacity 200ms",
        transform: hover && !dim ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hover && !dim
          ? "0 8px 28px rgba(122,162,255,0.45), 0 0 0 1px rgba(167,139,250,0.5), inset 0 1px 0 rgba(255,255,255,0.25)"
          : "0 4px 14px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.18)",
        color: "#0B0C10", fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.005em",
        fontFamily: "inherit", cursor: dim ? "not-allowed" : "pointer",
        opacity: dim ? 0.65 : 1,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(120px 40px at 30% 0%, rgba(255,255,255,0.4), transparent 70%)",
          opacity: hover && !dim ? 1 : 0.55, transition: "opacity 300ms",
        }}
      />
      {loading ? (
        <span
          style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "2px solid rgba(11,12,16,0.25)",
            borderTopColor: "#0B0C10",
            animation: "mf-spin-slow 0.6s linear infinite",
          }}
        />
      ) : (
        <IconWand size={13}/>
      )}
      <span style={{ position: "relative" }}>{loading ? "Directing…" : label}</span>
      <span
        className="mf-mono"
        style={{
          position: "relative",
          fontSize: 9.5, letterSpacing: "0.06em",
          padding: "2px 5px", borderRadius: 4,
          background: "rgba(11,12,16,0.18)",
          border: "1px solid rgba(11,12,16,0.20)",
          color: "rgba(11,12,16,0.75)",
        }}
      >
        ⌘ ⏎
      </span>
    </button>
  );
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.25)",
  border: "1px solid var(--line)",
  color: "var(--ink-1)",
  fontSize: 12.5,
  lineHeight: 1.55,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const AccordionSection = ({
  label,
  badge,
  open,
  onToggle,
  disabled = false,
  children,
}: {
  label: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <div
    style={{
      borderBottom: "1px solid var(--line)",
      opacity: disabled ? 0.55 : 1,
    }}
  >
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 2px",
        background: "transparent",
        border: "none",
        color: "var(--ink-1)",
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <IconChevron
        size={11}
        style={{
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 200ms cubic-bezier(.2,.8,.2,1)",
          color: "var(--ink-3)",
          flexShrink: 0,
        }}
      />
      <span
        className="mf-mono"
        style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--ink-2)", flex: 1 }}
      >
        {label}
      </span>
      {badge !== undefined && badge !== null && (
        <span
          className="mf-mono"
          style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.08em" }}
        >
          {badge}
        </span>
      )}
    </button>
    {open && <div style={{ padding: "4px 2px 16px" }}>{children}</div>}
  </div>
);

const ComingSoonPanel = ({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
}) => (
  <div
    style={{
      padding: "18px 14px",
      borderRadius: 10,
      border: "1px dashed var(--line-2)",
      background: "rgba(255,255,255,0.015)",
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
    }}
  >
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: "rgba(122,162,255,0.10)",
        border: "1px solid rgba(122,162,255,0.25)",
        color: "#7AA2FF",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: "var(--ink-1)", fontWeight: 500 }}>{title}</div>
      <div
        className="mf-mono"
        style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.08em", marginTop: 3 }}
      >
        COMING SOON
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
        {hint}
      </div>
    </div>
  </div>
);

const StatusPill = ({ status }: { status: JobStatus }) => {
  const meta = STATUS_TONE[status];
  return (
    <Pill tone={meta.tone} icon={<span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />}>
      <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>
        {meta.label}
      </span>
    </Pill>
  );
};

const ShotStatusChip = ({ display }: { display: { status: DisplayStatus; label: string } }) => {
  const map: Record<DisplayStatus, { bg: string; border: string; color: string }> = {
    pending:         { bg: "rgba(122,162,255,0.10)", border: "rgba(122,162,255,0.30)", color: "#DCE4FF" },
    generating:      { bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.40)", color: "#E2D6FF" },
    ready:           { bg: "rgba(122,162,255,0.10)", border: "rgba(122,162,255,0.30)", color: "#DCE4FF" },
    failed:          { bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.40)", color: "#FCA5A5" },
    clip_generating: { bg: "rgba(103,232,249,0.10)", border: "rgba(103,232,249,0.40)", color: "#A7E5F0" },
    clip_ready:      { bg: "rgba(74,222,128,0.10)",  border: "rgba(74,222,128,0.35)",  color: "#A6F0BD" },
    clip_failed:     { bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.40)", color: "#FCA5A5" },
    clip_skipped:    { bg: "rgba(255,255,255,0.04)", border: "var(--line)",            color: "var(--ink-3)" },
  };
  const m = map[display.status];
  return (
    <span
      className="mf-mono"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.10em",
        padding: "3px 7px",
        borderRadius: 6,
        background: m.bg,
        border: `1px solid ${m.border}`,
        color: m.color,
      }}
    >
      {display.label}
    </span>
  );
};

type ActionButtonTone = "image" | "clip";

const ActionButton = ({
  onClick,
  busy,
  label,
  busyLabel = "Working…",
  tone = "image",
  size = "sm",
}: {
  onClick: (e: React.MouseEvent) => void;
  busy?: boolean;
  label: string;
  busyLabel?: string;
  tone?: ActionButtonTone;
  size?: "sm" | "md";
}) => {
  const palette = tone === "clip"
    ? { bg: "rgba(103,232,249,0.12)", border: "rgba(103,232,249,0.45)", color: "#A7E5F0" }
    : { bg: "rgba(122,162,255,0.10)", border: "rgba(122,162,255,0.45)", color: "#DCE4FF" };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: size === "md" ? "8px 12px" : "5px 10px",
        borderRadius: 8,
        background: busy ? "rgba(255,255,255,0.04)" : palette.bg,
        border: `1px solid ${busy ? "var(--line)" : palette.border}`,
        color: busy ? "var(--ink-3)" : palette.color,
        fontSize: size === "md" ? 12 : 11,
        fontWeight: 500,
        letterSpacing: "0.02em",
        cursor: busy ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        backdropFilter: "blur(8px)",
      }}
    >
      {busy ? (
        <span
          style={{
            width: 10, height: 10, borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.25)",
            borderTopColor: palette.color,
            animation: "mf-spin-slow 0.6s linear infinite",
          }}
        />
      ) : (
        <IconWand size={11}/>
      )}
      {busy ? busyLabel : label}
    </button>
  );
};

/**
 * Plays only the [start, start+duration] slice of a master film MP4 and loops
 * within that window. The hyperframes export writes the same master URL onto
 * every shot row, so without this each scene tile would autoplay the full
 * film — see jobs.ts runHyperframesExport.
 */
const SceneWindowVideo = ({
  src,
  startSeconds,
  durationSeconds,
  poster,
}: {
  src: string;
  startSeconds: number;
  durationSeconds: number;
  poster?: string;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const start = Math.max(0, startSeconds);
  const end = durationSeconds > 0 ? start + durationSeconds : null;

  // Media Fragments URI gives most browsers a hint on initial decode; the
  // timeupdate handler below is what actually enforces the loop window.
  const fragmentedSrc = end != null ? `${src}#t=${start},${end}` : `${src}#t=${start}`;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seekStart = () => {
      try {
        v.currentTime = start;
      } catch {}
    };
    const onTime = () => {
      if (end != null && v.currentTime >= end - 0.05) {
        seekStart();
        void v.play().catch(() => {});
      }
    };
    if (v.readyState >= 1) seekStart();
    else v.addEventListener("loadedmetadata", seekStart, { once: true });
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", seekStart);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [src, start, end]);

  return (
    <video
      ref={videoRef}
      key={fragmentedSrc}
      src={fragmentedSrc}
      poster={poster}
      autoPlay
      muted
      playsInline
      preload="metadata"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
};

const ShotCard = ({
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
      <div style={{ position: "relative", aspectRatio: "16/9", background: "rgba(0,0,0,0.5)", overflow: "hidden" }}>
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
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : shot.status === "ready" && shot.image_url ? (
          <img
            src={shot.image_url}
            alt={shot.shot_goal ?? `Shot ${shot.shot_index + 1}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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

const EmptyState = ({ f }: { f: number }) => (
  <div style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", padding: 40, position: "relative" }}>
    <div
      style={{
        position: "absolute", left: "50%", top: "45%",
        width: 720, height: 720, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(122,162,255,0.18), transparent 60%)",
        filter: "blur(40px)",
        transform: `translate(-50%, -50%) scale(${1 + Math.sin(f / 60) * 0.08})`,
        pointerEvents: "none",
      }}
    />
    <div style={{ position: "relative", textAlign: "center", maxWidth: 540 }}>
      <div
        style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--grad-aurora)",
          display: "grid", placeItems: "center", color: "white", margin: "0 auto 22px",
          boxShadow: "0 12px 32px -8px rgba(122,162,255,0.55)",
        }}
      >
        <IconSparkle size={20} stroke={2}/>
      </div>
      <div className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#7AA2FF", marginBottom: 14 }}>
        AI FILM DIRECTION SYSTEM
      </div>
      <h2 style={{ margin: 0, fontSize: 40, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
        Write a script. <br/>Get a <span className="mf-grad-text">cinematic storyboard</span>.
      </h2>
      <p style={{ marginTop: 16, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
        The director splits your script into scenes, generates HyperFrames code for each, and stitches the rendered clips into a final video.
      </p>
    </div>
  </div>
);

// Scene HTML is authored against a fixed 1920×1080 stage (see emit.ts and
// the llm-director spec). HyperFrames renders it at a true 1920×1080
// viewport, but the preview iframe is much smaller, so without scaling the
// stage overflows. The shim transforms `body` rather than `#stage` so it
// doesn't clobber GSAP tweens that animate the stage's own transform.
const fitToViewportShim = `
<style id="mg-preview-fit">
  html, body { margin: 0; padding: 0; background: #050505; overflow: hidden; }
  body { transform-origin: 0 0; position: absolute; }
</style>
<script id="mg-preview-fit-script">
(function(){
  function fit(){
    var stage = document.getElementById("stage") || document.getElementById("root");
    if(!stage) return;
    var w = parseFloat(stage.getAttribute("data-width")) || 1920;
    var h = parseFloat(stage.getAttribute("data-height")) || 1080;
    var s = Math.min(window.innerWidth / w, window.innerHeight / h);
    var b = document.body;
    b.style.width = w + "px";
    b.style.height = h + "px";
    b.style.transform = "scale(" + s + ")";
    b.style.left = ((window.innerWidth - w * s) / 2) + "px";
    b.style.top = ((window.innerHeight - h * s) / 2) + "px";
  }
  if(document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fit);
  } else { fit(); }
  window.addEventListener("resize", fit);
})();
</script>`;

// When previewing a single scene we want the iframe to play just that
// scene's window of the master timeline and loop within it — otherwise the
// composition.html's own tl.play() starts at t=0 and the viewer always sees
// scene 1 first. We attach to window.__timelines.main once it exists, pause
// the auto-play, seek to the scene's start, and clamp+loop via onUpdate.
function sceneScopeShim(startSeconds: number, durationSeconds: number): string {
  return `
<script id="mg-scene-scope">
(function(){
  var START = ${startSeconds};
  var END = ${startSeconds + durationSeconds};
  function attach(){
    var tl = window.__timelines && window.__timelines.main;
    if (!tl) { setTimeout(attach, 16); return; }
    tl.pause();
    tl.seek(START);
    tl.eventCallback("onUpdate", function(){
      if (tl.time() >= END) tl.seek(START);
    });
    tl.play();
  }
  attach();
})();
</script>`;
}

function injectPreviewFit(
  html: string,
  scope?: { startSeconds: number; durationSeconds: number },
): string {
  const head = scope ? fitToViewportShim : fitToViewportShim;
  const tailScope = scope ? sceneScopeShim(scope.startSeconds, scope.durationSeconds) : "";
  let out = html;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${head}</head>`);
  } else {
    out = head + out;
  }
  if (tailScope) {
    if (out.includes("</body>")) {
      out = out.replace("</body>", `${tailScope}</body>`);
    } else {
      out = out + tailScope;
    }
  }
  return out;
}

const ScenePreviewModal = ({
  shot,
  sceneStartSeconds = 0,
  filmTotalSeconds,
  onClose,
}: {
  shot: ShotRow;
  /** Scene start time on the master film timeline (single-composition era). */
  sceneStartSeconds?: number;
  /** Total film duration (sum of all scenes), so we can clamp seek + show context. */
  filmTotalSeconds?: number;
  onClose: () => void;
}) => {
  const [playKey, setPlayKey] = useState<number | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // When the rendered film is available, seek it to this scene's start every
  // time the modal opens for a different shot.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seek = () => {
      v.currentTime = sceneStartSeconds;
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [sceneStartSeconds, shot.rendered_video_url]);

  const hasVideo = !!shot.rendered_video_url;
  const hasHtml = !!shot.scene_html_path;
  const playing = playKey !== null;

  const handlePlay = async () => {
    setPlayKey((k) => (k ?? 0) + 1);
    if (!shot.scene_html_path) return;
    setLoadStatus("loading");
    setLoadError(null);
    try {
      // Route handles both public-URL and legacy storage-path values and
      // always returns text/html, sidestepping Supabase Content-Type quirks.
      const res = await fetch(`/api/shots/${shot.id}/scene-html`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const text = await res.text();
      setHtml(
        injectPreviewFit(text, {
          startSeconds: sceneStartSeconds,
          durationSeconds: Number(shot.duration) || 0,
        }),
      );
      setLoadStatus("idle");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoadStatus("error");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(3,4,8,0.78)",
        backdropFilter: "blur(10px)",
        display: "grid", placeItems: "center",
        padding: 28,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1200px, 92vw)",
          maxHeight: "92vh",
          background: "rgba(8,9,13,0.96)",
          border: "1px solid rgba(122,162,255,0.30)",
          borderRadius: 16,
          boxShadow: "0 40px 120px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px",
          borderBottom: "1px solid var(--line)",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)" }}>
              SCENE {String(shot.shot_index + 1).padStart(2, "0")} · {Number(shot.duration).toFixed(1).replace(/\.0$/, "")}s
            </span>
            {shot.shot_goal && (
              <span style={{
                fontSize: 13, color: "var(--ink-1)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {shot.shot_goal}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--ink-2)",
              fontFamily: "inherit", fontSize: 12, cursor: "pointer",
            }}
          >
            Close · Esc
          </button>
        </div>

        <div style={{
          position: "relative",
          aspectRatio: "16/9",
          background: "#050505",
          overflow: "hidden",
        }}>
          {hasVideo ? (
            <video
              ref={videoRef}
              key={shot.rendered_video_url ?? "no-video"}
              src={shot.rendered_video_url ?? undefined}
              autoPlay
              loop
              controls
              playsInline
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                background: "#050505",
                objectFit: "contain",
              }}
            />
          ) : playing && html ? (
            <iframe
              key={playKey}
              srcDoc={html}
              title={`Scene ${shot.shot_index + 1} preview`}
              sandbox="allow-scripts"
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                border: "none", background: "#050505",
              }}
            />
          ) : playing && loadStatus === "loading" ? (
            <div style={{
              position: "absolute", inset: 0,
              display: "grid", placeItems: "center",
              color: "var(--ink-3)", fontSize: 12,
            }}>
              Loading scene…
            </div>
          ) : shot.scene_thumbnail_path ? (
            <img
              src={shot.scene_thumbnail_path}
              alt={`Scene ${shot.shot_index + 1} thumbnail`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#050505" }}
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0,
              display: "grid", placeItems: "center",
              color: "var(--ink-3)", fontSize: 12,
            }}>
              No preview available yet.
            </div>
          )}

          {hasHtml && (
            <button
              onClick={handlePlay}
              style={{
                position: "absolute",
                bottom: 16, left: "50%", transform: "translateX(-50%)",
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 999,
                border: "1px solid rgba(167,139,250,0.55)",
                background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
                color: "#0B0C10",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 10px 30px -8px rgba(122,162,255,0.55)",
              }}
            >
              <span style={{
                width: 0, height: 0,
                borderLeft: "9px solid #0B0C10",
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                marginLeft: 2,
              }} />
              {playing ? "Replay" : "Play scene"}
            </button>
          )}
        </div>

        {loadError && (
          <div style={{
            padding: "10px 18px",
            borderTop: "1px solid rgba(255,80,80,0.25)",
            background: "rgba(255,80,80,0.06)",
            fontSize: 12, color: "#FF8A8A",
          }}>
            Could not load scene HTML: {loadError}
          </div>
        )}

        {shot.narration_part && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
            <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-4)", marginRight: 10 }}>BEAT</span>
            {shot.narration_part}
          </div>
        )}
      </div>
    </div>
  );
};

export const EditorScreen = ({
  onNav,
  onContinue,
  empty = false,
  initialJobId,
}: {
  onNav?: (k: NavKey) => void;
  onContinue?: (jobId?: string | null) => void;
  empty?: boolean;
  initialJobId?: string | null;
}) => {
  const f = useFrame();
  const [script, setScript] = useState(
    empty
      ? ""
      : `Meet Lattice — the OS for high-performing teams.\nBuilt for teams that ship.\nFrom goals to growth, every conversation lives here.\nStart free. Ship faster.`,
  );
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["script"]),
  );
  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Brand state. After upload, `brandLogoUrl` holds the persisted public URL
  // (not a blob). Hydrated from the job row when one is loaded; auto-saved
  // via PATCH /api/jobs/:id on every change once a job exists.
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandLogoStoragePath, setBrandLogoStoragePath] = useState<string | null>(null);
  const [brandLogoName, setBrandLogoName] = useState<string | null>(null);
  const [brandLogoUploading, setBrandLogoUploading] = useState(false);
  const [brandLogoError, setBrandLogoError] = useState<string | null>(null);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [draftColor, setDraftColor] = useState<string>("#7AA2FF");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const brandHydratedJobIdRef = useRef<string | null>(null);

  const jobIdRef = useRef<string | null>(null);
  // Best-effort PATCH to persist a brand patch onto the current job. No-op
  // when no job exists yet (the brand will be saved with createJob instead).
  const persistBrandPatch = async (patch: {
    brandLogoUrl?: string | null;
    brandLogoStoragePath?: string | null;
    brandColors?: string[];
  }) => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      /* network errors are surfaced via job polling */
    }
  };

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBrandLogoError(null);
    setBrandLogoUploading(true);
    setBrandLogoName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brand/logo", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        logoUrl?: string;
        storagePath?: string;
        error?: string;
      };
      if (!res.ok || !data.logoUrl) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setBrandLogoUrl(data.logoUrl);
      setBrandLogoStoragePath(data.storagePath ?? null);
      void persistBrandPatch({
        brandLogoUrl: data.logoUrl,
        brandLogoStoragePath: data.storagePath ?? null,
      });
    } catch (err) {
      setBrandLogoError(err instanceof Error ? err.message : String(err));
      setBrandLogoName(null);
    } finally {
      setBrandLogoUploading(false);
    }
  };

  const clearLogo = () => {
    setBrandLogoUrl(null);
    setBrandLogoStoragePath(null);
    setBrandLogoName(null);
    setBrandLogoError(null);
    void persistBrandPatch({ brandLogoUrl: null, brandLogoStoragePath: null });
  };

  const addColor = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(draftColor)) return;
    const c = draftColor.toLowerCase();
    setBrandColors((prev) => {
      if (prev.includes(c)) return prev;
      const next = [...prev, c];
      void persistBrandPatch({ brandColors: next });
      return next;
    });
  };

  const removeColor = (c: string) =>
    setBrandColors((prev) => {
      const next = prev.filter((x) => x !== c);
      void persistBrandPatch({ brandColors: next });
      return next;
    });

  const deriveLogoName = (url: string): string => {
    try {
      const path = new URL(url).pathname;
      return decodeURIComponent(path.split("/").pop() ?? "logo");
    } catch {
      return "logo";
    }
  };

  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewShotId, setPreviewShotId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [generatingClips, setGeneratingClips] = useState<Set<string>>(new Set());
  const [pollNonce, setPollNonce] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleGenerate = async () => {
    const trimmed = script.trim();
    if (!trimmed || generating) return;
    setGenerating(true);
    setError(null);
    setJob(null);
    setShots([]);
    setSelected(null);
    stopPolling();

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: trimmed,
          brandLogoUrl: brandLogoUrl ?? null,
          brandLogoStoragePath: brandLogoStoragePath ?? null,
          brandColors: brandColors.length > 0 ? brandColors : null,
        }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setJobId(data.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // Hydrate brand state once per job. Subsequent polls won't overwrite local
  // edits because we gate on brandHydratedJobIdRef.
  useEffect(() => {
    if (!job) return;
    if (brandHydratedJobIdRef.current === job.id) return;
    setBrandLogoUrl(job.brand_logo_url ?? null);
    setBrandLogoStoragePath(job.brand_logo_storage_path ?? null);
    setBrandLogoName(job.brand_logo_url ? deriveLogoName(job.brand_logo_url) : null);
    setBrandColors(Array.isArray(job.brand_colors) ? job.brand_colors : []);
    setBrandLogoError(null);
    brandHydratedJobIdRef.current = job.id;
  }, [job]);

  useEffect(() => {
    if (!jobId) return;
    let canceled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          if (canceled) return;
          setError(`Poll failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as JobResponse;
        if (canceled) return;
        setJob(data.job);
        setShots(data.shots);
        const anyShotInFlight = data.shots.some(
          (s) =>
            s.status === "pending" ||
            s.status === "generating" ||
            s.clip_status === "pending" ||
            s.clip_status === "generating",
        );
        if (TERMINAL.includes(data.job.status) && !anyShotInFlight) {
          stopPolling();
        }
      } catch (e) {
        if (canceled) return;
        console.error("poll error:", e);
      }
    };

    void poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      canceled = true;
      stopPolling();
    };
  }, [jobId, pollNonce]);

  const handleRetry = async (shotId: string) => {
    if (retrying.has(shotId)) return;
    setRetrying((prev) => {
      const next = new Set(prev);
      next.add(shotId);
      return next;
    });
    try {
      const res = await fetch(`/api/shots/${shotId}/retry`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Retry failed (${res.status})`);
      } else {
        setShots((prev) =>
          prev.map((s) =>
            s.id === shotId ? { ...s, status: "generating", error: null } : s,
          ),
        );
        setPollNonce((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry network error");
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  };

  useEffect(() => {
    setRetrying((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const id of prev) {
        const shot = shots.find((s) => s.id === id);
        if (!shot) continue;
        const inFlight = shot.status === "generating" || shot.status === "pending";
        if (!inFlight) next.delete(id);
      }
      return next.size === prev.size ? prev : next;
    });
    setGeneratingClips((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const id of prev) {
        const shot = shots.find((s) => s.id === id);
        if (!shot) continue;
        if (shot.clip_status !== "generating" && shot.clip_status !== "pending") {
          next.delete(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [shots]);

  const handleGenerateClip = async (shotId: string) => {
    if (generatingClips.has(shotId)) return;
    setGeneratingClips((prev) => {
      const next = new Set(prev);
      next.add(shotId);
      return next;
    });
    try {
      const res = await fetch(`/api/shots/${shotId}/clip`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Clip generation failed (${res.status})`);
        setGeneratingClips((prev) => {
          const next = new Set(prev);
          next.delete(shotId);
          return next;
        });
      } else {
        setShots((prev) =>
          prev.map((s) =>
            s.id === shotId ? { ...s, clip_status: "generating", clip_error: null } : s,
          ),
        );
        setPollNonce((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clip network error");
      setGeneratingClips((prev) => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleGenerate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, generating]);

  const status: JobStatus = job?.status ?? (generating ? "pending" : "pending");
  const showStoryboard = jobId !== null;

  const totalDuration = useMemo(
    () => shots.reduce((acc, s) => acc + Number(s.duration || 0), 0),
    [shots],
  );

  const selectedShot = useMemo(
    () => shots.find((s) => s.id === selected) ?? null,
    [shots, selected],
  );

  const previewShot = useMemo(
    () => shots.find((s) => s.id === previewShotId) ?? null,
    [shots, previewShotId],
  );

  // Cumulative scene start times for the master film (one MP4 holds all
  // scenes after the single-composition refactor). The modal seeks the
  // shared video to this scene's start. Ordered list is `shots` already
  // sorted by shot_index in the loader.
  const sceneTimings = useMemo(() => {
    let cumulative = 0;
    const map = new Map<string, { startSeconds: number; durationSeconds: number; totalSeconds: number }>();
    for (const s of shots) {
      map.set(s.id, {
        startSeconds: cumulative,
        durationSeconds: s.duration,
        totalSeconds: 0, // patched below
      });
      cumulative += s.duration;
    }
    for (const entry of map.values()) entry.totalSeconds = cumulative;
    return map;
  }, [shots]);

  const previewTiming = previewShot ? sceneTimings.get(previewShot.id) ?? null : null;

  return (
    <>
    <AppChrome
      active="editor"
      onNav={onNav}
      project={job?.title ?? "Untitled launch"}
      right={
        <>
          {showStoryboard ? (
            <StatusPill status={status} />
          ) : (
            <Pill icon={<span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7AA2FF" }} />}>
              <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>NEW PROJECT · DRAFT</span>
            </Pill>
          )}
          <Button variant="ghost" size="sm" icon={<IconShare size={12}/>}>Share preview</Button>
          <GenerateButton
            onClick={handleGenerate}
            loading={generating || (showStoryboard && !TERMINAL.includes(status))}
            disabled={!script.trim()}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!jobId) return;
              if (status === "scenes_ready") {
                // Kick off the render+stitch phase. Bump pollNonce to resume polling.
                try {
                  const res = await fetch(`/api/jobs/${jobId}/export`, { method: "POST" });
                  const data = (await res.json()) as { error?: string };
                  if (!res.ok) {
                    setError(data.error ?? `Export failed (${res.status})`);
                    return;
                  }
                  setPollNonce((n) => n + 1);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Network error");
                }
              } else if (status === "completed") {
                onContinue?.(jobId);
              } else {
                onContinue?.(jobId);
              }
            }}
            iconRight={<IconArrowRight size={12}/>}
          >
            {status === "scenes_ready" ? "Export · render video" : "Export"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", height: "100%", minHeight: 0 }}>
        {/* Left: script input */}
        <aside
          style={{
            borderRight: "1px solid var(--line)",
            background: "rgba(8,9,13,0.5)",
            padding: "22px 20px",
            overflowY: "auto",
            display: "flex", flexDirection: "column", gap: 18,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <AccordionSection
              label="SCRIPT"
              badge={`${script.trim().length} CHARS`}
              open={openSections.has("script")}
              onToggle={() => toggleSection("script")}
            >
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste your script — release notes, a feature list, or a paragraph about your launch…"
                style={{ ...inputStyle, minHeight: 200, resize: "vertical" }}
              />
            </AccordionSection>

            <AccordionSection
              label="SCENES"
              badge={shots.length > 0 ? `${shots.length} ${shots.length === 1 ? "SHOT" : "SHOTS"}` : "—"}
              open={openSections.has("scenes")}
              onToggle={() => toggleSection("scenes")}
            >
              {shots.length === 0 ? (
                <ComingSoonPanel
                  icon={<IconLayers size={14}/>}
                  title="No scenes yet"
                  hint="Direct your script to generate scenes. Each scene becomes a HyperFrame in the storyboard."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {shots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPreviewShotId(s.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: selected === s.id ? "rgba(122,162,255,0.08)" : "transparent",
                        border: `1px solid ${selected === s.id ? "rgba(122,162,255,0.25)" : "transparent"}`,
                        color: "inherit",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <span
                        className="mf-mono"
                        style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}
                      >
                        {String(s.shot_index + 1).padStart(2, "0")}
                      </span>
                      <span
                        style={{
                          fontSize: 12, color: "var(--ink-1)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {s.shot_goal ?? "Untitled shot"}
                      </span>
                      <span
                        className="mf-mono"
                        style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.06em" }}
                      >
                        {Number(s.duration).toFixed(1).replace(/\.0$/, "")}s
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </AccordionSection>

            <AccordionSection
              label="VOICEOVER"
              badge="—"
              open={openSections.has("voiceover")}
              onToggle={() => toggleSection("voiceover")}
            >
              <ComingSoonPanel
                icon={<IconMic size={14}/>}
                title="Voiceover narration"
                hint="Record or upload narration per scene. The director will sync timing to your audio."
              />
            </AccordionSection>

            <AccordionSection
              label="MUSIC"
              badge="—"
              open={openSections.has("music")}
              onToggle={() => toggleSection("music")}
            >
              <ComingSoonPanel
                icon={<IconMusic size={14}/>}
                title="Music bed"
                hint="Choose a track from the library or upload your own. Pacing will respect downbeats."
              />
            </AccordionSection>

            <AccordionSection
              label="SFX"
              badge="—"
              open={openSections.has("sfx")}
              onToggle={() => toggleSection("sfx")}
            >
              <ComingSoonPanel
                icon={<IconWave size={14}/>}
                title="Sound effects"
                hint="Tie SFX to transitions, focal beats, and UI interactions per scene."
              />
            </AccordionSection>

            <AccordionSection
              label="ASSETS"
              badge="0 FILES"
              open={openSections.has("assets")}
              onToggle={() => toggleSection("assets")}
            >
              <ComingSoonPanel
                icon={<IconFolder size={14}/>}
                title="Project assets"
                hint="Upload logos, product screenshots, and reference media to ground the director."
              />
            </AccordionSection>

            <AccordionSection
              label="BRAND"
              badge={
                brandLogoUrl || brandColors.length > 0
                  ? `${brandLogoUrl ? "LOGO" : ""}${brandLogoUrl && brandColors.length ? " · " : ""}${brandColors.length ? `${brandColors.length} ${brandColors.length === 1 ? "COLOR" : "COLORS"}` : ""}`
                  : "—"
              }
              open={openSections.has("brand")}
              onToggle={() => toggleSection("brand")}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Logo */}
                <div>
                  <div
                    className="mf-mono"
                    style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}
                  >
                    LOGO
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onLogoChange}
                    style={{ display: "none" }}
                  />
                  {brandLogoUrl ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--line)",
                      }}
                    >
                      <div
                        style={{
                          width: 44, height: 44, borderRadius: 8,
                          background: `url(${brandLogoUrl}) center/contain no-repeat, rgba(255,255,255,0.04)`,
                          border: "1px solid var(--line)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 12, color: "var(--ink-1)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {brandLogoName ?? "logo"}
                        </div>
                        <button
                          onClick={() => logoInputRef.current?.click()}
                          disabled={brandLogoUploading}
                          style={{
                            marginTop: 4, padding: 0,
                            background: "transparent", border: "none",
                            color: "var(--ink-3)", fontSize: 11,
                            cursor: brandLogoUploading ? "wait" : "pointer",
                            fontFamily: "inherit",
                            textDecoration: "underline",
                            opacity: brandLogoUploading ? 0.55 : 1,
                          }}
                        >
                          {brandLogoUploading ? "Uploading…" : "Replace"}
                        </button>
                      </div>
                      <button
                        onClick={clearLogo}
                        disabled={brandLogoUploading}
                        aria-label="Remove logo"
                        title="Remove logo"
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          display: "grid", placeItems: "center",
                          background: "transparent",
                          border: "1px solid var(--line)",
                          color: "var(--ink-3)", cursor: "pointer", padding: 0,
                          opacity: brandLogoUploading ? 0.55 : 1,
                        }}
                      >
                        <IconClose size={12}/>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      disabled={brandLogoUploading}
                      style={{
                        width: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "16px 12px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.015)",
                        border: "1px dashed var(--line-2)",
                        color: "var(--ink-2)",
                        cursor: brandLogoUploading ? "wait" : "pointer",
                        fontFamily: "inherit", fontSize: 12,
                        opacity: brandLogoUploading ? 0.65 : 1,
                      }}
                    >
                      {brandLogoUploading ? (
                        <>
                          <span
                            style={{
                              width: 12, height: 12, borderRadius: "50%",
                              border: "2px solid rgba(255,255,255,0.18)",
                              borderTopColor: "var(--ink-1)",
                              animation: "mf-spin-slow 0.6s linear infinite",
                            }}
                          />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <IconUpload size={13}/>
                          Upload logo
                        </>
                      )}
                    </button>
                  )}
                  {brandLogoError && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "rgba(255,107,107,0.08)",
                        border: "1px solid rgba(255,107,107,0.30)",
                        color: "#FCA5A5",
                        fontSize: 11,
                        lineHeight: 1.45,
                      }}
                    >
                      {brandLogoError}
                    </div>
                  )}
                </div>

                {/* Colors */}
                <div>
                  <div
                    className="mf-mono"
                    style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}
                  >
                    BRAND COLORS
                  </div>

                  {brandColors.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {brandColors.map((c) => (
                        <div
                          key={c}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "4px 8px 4px 6px",
                            borderRadius: 7,
                            background: "rgba(255,255,255,0.025)",
                            border: "1px solid var(--line)",
                          }}
                        >
                          <span
                            style={{
                              width: 14, height: 14, borderRadius: 4,
                              background: c,
                              border: "1px solid rgba(255,255,255,0.10)",
                              boxShadow: `0 0 8px ${c}40`,
                            }}
                          />
                          <span
                            className="mf-mono"
                            style={{ fontSize: 10.5, color: "var(--ink-1)", letterSpacing: "0.04em" }}
                          >
                            {c.toUpperCase()}
                          </span>
                          <button
                            onClick={() => removeColor(c)}
                            aria-label={`Remove ${c}`}
                            style={{
                              display: "grid", placeItems: "center",
                              width: 16, height: 16, borderRadius: 4,
                              background: "transparent", border: "none",
                              color: "var(--ink-3)", cursor: "pointer", padding: 0,
                            }}
                          >
                            <IconClose size={9}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: 6,
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    <label
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: draftColor,
                        border: "1px solid rgba(255,255,255,0.15)",
                        cursor: "pointer",
                        flexShrink: 0,
                        position: "relative",
                        overflow: "hidden",
                      }}
                      title="Pick color"
                    >
                      <input
                        type="color"
                        value={draftColor}
                        onChange={(e) => setDraftColor(e.target.value)}
                        style={{
                          position: "absolute", inset: 0,
                          opacity: 0, cursor: "pointer", border: "none",
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={draftColor}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
                          setDraftColor(v.startsWith("#") ? v : `#${v}`);
                        }
                      }}
                      placeholder="#7AA2FF"
                      className="mf-mono"
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        color: "var(--ink-1)",
                        fontSize: 11.5, letterSpacing: "0.04em",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      onClick={addColor}
                      disabled={!/^#[0-9a-fA-F]{6}$/.test(draftColor) || brandColors.includes(draftColor.toLowerCase())}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "5px 10px",
                        borderRadius: 7,
                        background: "rgba(122,162,255,0.10)",
                        border: "1px solid rgba(122,162,255,0.35)",
                        color: "var(--ink-0)",
                        fontFamily: "inherit", fontSize: 11, fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      <IconPlus size={11}/>
                      Add
                    </button>
                  </div>

                  {brandColors.length === 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11, color: "var(--ink-4)", lineHeight: 1.55,
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <IconPalette size={11}/>
                      Pick a swatch, then click Add.
                    </div>
                  )}
                </div>
              </div>
            </AccordionSection>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!script.trim() || generating}
            style={{
              padding: "10px 14px", borderRadius: 10,
              border: "1px solid rgba(167,139,250,0.45)",
              background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
              color: "#0B0C10", fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.005em",
              fontFamily: "inherit",
              cursor: !script.trim() || generating ? "not-allowed" : "pointer",
              opacity: !script.trim() || generating ? 0.65 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            {generating ? (
              <span
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(11,12,16,0.25)",
                  borderTopColor: "#0B0C10",
                  animation: "mf-spin-slow 0.6s linear infinite",
                }}
              />
            ) : (
              <IconWand size={12}/>
            )}
            {generating ? "Creating job…" : "Direct storyboard"}
          </button>

          {error && (
            <div
              style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,107,107,0.08)",
                border: "1px solid rgba(255,107,107,0.35)",
                fontSize: 11.5, color: "#FCA5A5", lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          )}

          {job && (
            <div
              style={{
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid var(--line)",
                display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12.5, color: "var(--ink-1)", lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {job.title ?? "Untitled"}
                </span>
                <StatusPill status={job.status} />
              </div>
              {job.error && (
                <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>{job.error}</div>
              )}
            </div>
          )}
        </aside>

        {/* Right: storyboard / inspector */}
        <section style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <div className="mf-bg-bloom"/>
          {!showStoryboard ? (
            <EmptyState f={f} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: selectedShot ? "1fr 340px" : "1fr", flex: 1, minHeight: 0 }}>
              <div style={{ overflow: "auto", padding: "24px 28px 40px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
                  <div>
                    <div className="mf-eyebrow" style={{ marginBottom: 6 }}>STORYBOARD</div>
                    <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.015em" }}>
                      {job?.title ?? "Directing…"}
                    </div>
                  </div>
                  <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em" }}>
                    {shots.length}/{job?.shot_count ?? "—"} SHOTS · {totalDuration.toFixed(1)}s
                  </div>
                </div>

                {shots.length === 0 ? (
                  <div
                    style={{
                      padding: "60px 32px", borderRadius: 14,
                      border: "1px dashed var(--line-2)",
                      background: "rgba(255,255,255,0.015)",
                      textAlign: "center",
                    }}
                  >
                    <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.18em", marginBottom: 8 }}>
                      {status === "directing" ? "DIRECTING SHOTS…" : "WAITING FOR DIRECTOR…"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 360, margin: "0 auto" }}>
                      The director is splitting your script into cinematic beats and writing image prompts.
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {shots.map((shot) => {
                      const timing = sceneTimings.get(shot.id);
                      return (
                        <ShotCard
                          key={shot.id}
                          shot={shot}
                          f={f}
                          selected={selected === shot.id}
                          retrying={retrying.has(shot.id) || shot.status === "generating"}
                          clipBusy={
                            generatingClips.has(shot.id) || shot.clip_status === "generating"
                          }
                          sceneStartSeconds={timing?.startSeconds ?? 0}
                          sceneDurationSeconds={timing?.durationSeconds ?? (Number(shot.duration) || 0)}
                          onSelect={() => setSelected(selected === shot.id ? null : shot.id)}
                          onPreview={() => setPreviewShotId(shot.id)}
                          onRetry={() => void handleRetry(shot.id)}
                          onGenerateClip={() => void handleGenerateClip(shot.id)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedShot && (
                <aside
                  style={{
                    borderLeft: "1px solid var(--line)", background: "rgba(8,9,13,0.5)",
                    padding: "22px 20px", overflow: "auto",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 6 }}>
                    <div className="mf-eyebrow">
                      SHOT {String(selectedShot.shot_index + 1).padStart(2, "0")} · INSPECTOR
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {selectedShot.status === "failed" && (
                        <ActionButton
                          size="sm"
                          busy={retrying.has(selectedShot.id)}
                          label="Retry shot"
                          busyLabel="Retrying…"
                          tone="image"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRetry(selectedShot.id);
                          }}
                        />
                      )}
                      {selectedShot.status === "ready" && selectedShot.image_url && (
                        <ActionButton
                          size="sm"
                          busy={generatingClips.has(selectedShot.id) || selectedShot.clip_status === "generating"}
                          label={
                            selectedShot.clip_status === "ready"
                              ? "Regenerate clip"
                              : selectedShot.clip_status === "failed"
                                ? "Retry clip"
                                : "Generate clip"
                          }
                          busyLabel="Rendering…"
                          tone="clip"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleGenerateClip(selectedShot.id);
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {selectedShot.clip_status === "ready" && selectedShot.clip_url ? (
                    <div style={{ marginBottom: 18, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
                      <video
                        key={selectedShot.clip_url}
                        src={selectedShot.clip_url}
                        poster={selectedShot.image_url ?? undefined}
                        autoPlay
                        muted
                        loop
                        playsInline
                        controls
                        style={{ width: "100%", display: "block" }}
                      />
                    </div>
                  ) : selectedShot.image_url ? (
                    <div style={{ marginBottom: 18, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
                      <img
                        src={selectedShot.image_url}
                        alt={selectedShot.shot_goal ?? ""}
                        style={{ width: "100%", display: "block" }}
                      />
                    </div>
                  ) : null}

                  <InspectorSection label="NARRATIVE" />
                  <InspectorRow label="GOAL" value={selectedShot.shot_goal} />
                  <InspectorRow label="NARRATION" value={selectedShot.narration_part} />
                  <InspectorRow label="TEXT OVERLAY" value={selectedShot.text_overlay} />
                  <InspectorRow label="DURATION" value={`${Number(selectedShot.duration).toFixed(2)}s`} mono />

                  <InspectorSection label="INTENT · DOMAIN" />
                  <InspectorRow label="INTENT" value={selectedShot.intent} mono />
                  <InspectorRow label="DOMAIN" value={selectedShot.domain} mono />

                  <InspectorSection label="GROUNDING" />
                  <GroundingRows grounding={selectedShot.grounding} />

                  <InspectorSection label="ANCHORS" />
                  <AnchorList label="VISUAL" anchors={selectedShot.visual_anchors} />
                  <MotionAnchorList anchors={selectedShot.motion_anchors} />

                  {selectedShot.validation_passed === false && (
                    <>
                      <InspectorSection label="VALIDATION" />
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "rgba(255,107,107,0.08)",
                          border: "1px solid rgba(255,107,107,0.35)",
                          marginBottom: 14,
                        }}
                      >
                        <div className="mf-mono" style={{ fontSize: 9.5, color: "#FCA5A5", letterSpacing: "0.14em", marginBottom: 4 }}>
                          REJECTED BY VISION CHECK ({selectedShot.validation_attempts ?? 0} attempt{(selectedShot.validation_attempts ?? 0) === 1 ? "" : "s"})
                        </div>
                        <div style={{ fontSize: 11.5, color: "rgba(252,165,165,0.85)", lineHeight: 1.5 }}>
                          {selectedShot.validation_warnings ?? "Unknown reason"}
                        </div>
                      </div>
                    </>
                  )}

                  <InspectorSection label="STYLE · ATMOSPHERE" />
                  <InspectorRow label="ATMOSPHERE" value={selectedShot.atmosphere} />
                  <InspectorRow label="UI MOTION" value={selectedShot.ui_motion} />
                  <InspectorRow label="LIGHTING MOTION" value={selectedShot.lighting_motion} />
                  <InspectorRow label="PACING" value={selectedShot.pacing} mono />
                  <InspectorRow label="PALETTE" value={selectedShot.color_palette} mono />
                  <InspectorRow label="STYLE NOTES" value={selectedShot.style_notes} />
                  <InspectorRow label="TRANSITION" value={selectedShot.transition_out} mono />

                  <InspectorSection label="ASSEMBLED PROMPTS" />
                  <InspectorRow label="IMAGE PROMPT" value={selectedShot.image_prompt} mono multiline />
                  <InspectorRow label="VIDEO PROMPT" value={selectedShot.video_prompt} mono multiline />
                  <InspectorRow label="NEGATIVE" value={selectedShot.negative_prompt} mono multiline />
                </aside>
              )}
            </div>
          )}
        </section>
      </div>
    </AppChrome>
    {previewShot && (
      <ScenePreviewModal
        shot={previewShot}
        sceneStartSeconds={previewTiming?.startSeconds ?? 0}
        filmTotalSeconds={previewTiming?.totalSeconds ?? previewShot.duration}
        onClose={() => setPreviewShotId(null)}
      />
    )}
    </>
  );
};

type GroundingShape = {
  environment?: {
    locationType?: string;
    spaceType?: string;
    timeOfDay?: string;
    lightingSource?: string;
    weather?: string;
  };
  workspace?: {
    desk?: boolean;
    monitorCount?: number;
    surfaces?: string[];
  };
  human?: {
    visible?: boolean;
    style?: string;
    position?: string;
    emotion?: string;
  };
  camera?: {
    shotType?: string;
    lens?: string;
    angle?: string;
    motion?: string;
  };
  composition?: {
    layout?: string;
    primaryFocus?: string;
    secondaryFocus?: string;
    negativeSpace?: string;
  };
};

const GroundingRows = ({ grounding }: { grounding: unknown }) => {
  const g = (grounding ?? {}) as GroundingShape;
  if (!g.environment && !g.workspace && !g.camera) {
    return (
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontStyle: "italic", marginBottom: 14 }}>
        No grounding (legacy shot before the staged pipeline).
      </div>
    );
  }
  const env = g.environment ?? {};
  const ws = g.workspace ?? {};
  const hu = g.human ?? {};
  const cam = g.camera ?? {};
  const comp = g.composition ?? {};
  const monitors = typeof ws.monitorCount === "number" ? ws.monitorCount : null;
  return (
    <>
      <InspectorRow label="LOCATION" value={[env.locationType, env.spaceType].filter(Boolean).join(" · ")} mono />
      <InspectorRow label="TIME · LIGHT" value={[env.timeOfDay, env.lightingSource].filter(Boolean).join(" · ")} mono />
      <InspectorRow label="WORKSPACE" value={
        ws.desk || (ws.surfaces && ws.surfaces.length > 0)
          ? `${ws.desk ? "desk; " : ""}${monitors !== null ? `${monitors} monitor${monitors === 1 ? "" : "s"}; ` : ""}${ws.surfaces && ws.surfaces.length ? ws.surfaces.join(", ") : "no surfaces"}`
          : "none"
      } />
      <InspectorRow label="HUMAN" value={
        hu.visible
          ? [hu.style, hu.position, hu.emotion].filter(Boolean).join(" · ")
          : "absent"
      } mono />
      <InspectorRow label="CAMERA" value={[cam.shotType, cam.lens, cam.angle, cam.motion].filter(Boolean).join(" · ")} mono />
      <InspectorRow label="LAYOUT" value={comp.layout} mono />
      <InspectorRow label="PRIMARY FOCUS" value={comp.primaryFocus} />
      <InspectorRow label="SECONDARY FOCUS" value={comp.secondaryFocus} />
      <InspectorRow label="NEGATIVE SPACE" value={comp.negativeSpace} mono />
    </>
  );
};

const AnchorList = ({ label, anchors }: { label: string; anchors: unknown }) => {
  if (!Array.isArray(anchors) || anchors.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 5 }}>
        {label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, color: "var(--ink-1)", fontSize: 12, lineHeight: 1.5 }}>
        {(anchors as unknown[]).map((a, i) => (
          <li key={i} style={{ marginBottom: 2 }}>{String(a)}</li>
        ))}
      </ul>
    </div>
  );
};

type MotionPair = { object?: string; motion?: string };
type MotionRecipeShape = {
  shotType?: string;
  primary?: MotionPair;
  secondary?: MotionPair;
  ambient?: MotionPair;
  rhythm?: string;
  lightResponse?: string;
  personality?: string;
  depthForeground?: string;
  depthMidground?: string;
  depthBackground?: string;
};

const MotionPairRow = ({ tier, pair }: { tier: string; pair: MotionPair | undefined }) => {
  if (!pair || (!pair.object && !pair.motion)) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, fontSize: 11.5, lineHeight: 1.5, alignItems: "baseline", marginBottom: 6 }}>
      <span className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em" }}>{tier}</span>
      <div style={{ color: "var(--ink-1)" }}>
        <span className="mf-mono" style={{ color: "var(--ink-2)" }}>{pair.object ?? "?"}</span>
        <span style={{ color: "var(--ink-3)" }}> → </span>
        <span className="mf-mono" style={{ color: "#A7E5F0" }}>{pair.motion ?? "?"}</span>
      </div>
    </div>
  );
};

const MotionAnchorList = ({ anchors }: { anchors: unknown }) => {
  // Legacy shape: array of {object, motion}
  if (Array.isArray(anchors)) {
    if (anchors.length === 0) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <div className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 5 }}>
          MOTION (legacy)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(anchors as MotionPair[]).map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, lineHeight: 1.5 }}>
              <span className="mf-mono" style={{ color: "var(--ink-2)", minWidth: 0, flex: "1 1 0" }}>
                {a.object ?? "?"}
              </span>
              <span style={{ color: "var(--ink-3)" }}>→</span>
              <span className="mf-mono" style={{ color: "#A7E5F0", flex: "1 1 0" }}>{a.motion ?? "?"}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // New shape: motion recipe object
  if (!anchors || typeof anchors !== "object") return null;
  const m = anchors as MotionRecipeShape;
  if (!m.primary && !m.secondary && !m.ambient && !m.shotType) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 5 }}>
        MOTION
      </div>
      {m.shotType && (
        <div style={{ fontSize: 12, color: "var(--ink-1)", lineHeight: 1.5, marginBottom: 8 }}>
          {m.shotType}
        </div>
      )}
      <MotionPairRow tier="PRIMARY" pair={m.primary} />
      <MotionPairRow tier="SECONDARY" pair={m.secondary} />
      <MotionPairRow tier="AMBIENT" pair={m.ambient} />
      {m.rhythm && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <span className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em" }}>
            RHYTHM ·{" "}
          </span>
          {m.rhythm}
        </div>
      )}
      {m.lightResponse && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <span className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em" }}>
            LIGHT_RESPONSE ·{" "}
          </span>
          {m.lightResponse}
        </div>
      )}
      {m.personality && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <span className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em" }}>
            PERSONALITY ·{" "}
          </span>
          {m.personality}
        </div>
      )}
      {(m.depthForeground || m.depthMidground || m.depthBackground) && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)", fontSize: 11, lineHeight: 1.5 }}>
          {m.depthForeground && (
            <div style={{ marginBottom: 3 }}>
              <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.12em" }}>FG · </span>
              {m.depthForeground}
            </div>
          )}
          {m.depthMidground && (
            <div style={{ marginBottom: 3 }}>
              <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.12em" }}>MG · </span>
              {m.depthMidground}
            </div>
          )}
          {m.depthBackground && (
            <div>
              <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.12em" }}>BG · </span>
              {m.depthBackground}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const InspectorSection = ({ label }: { label: string }) => (
  <div
    className="mf-mono"
    style={{
      fontSize: 9.5,
      letterSpacing: "0.16em",
      color: "#7AA2FF",
      marginTop: 18,
      marginBottom: 10,
      paddingBottom: 6,
      borderBottom: "1px solid rgba(122,162,255,0.18)",
    }}
  >
    {label}
  </div>
);

const InspectorRow = ({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  multiline?: boolean;
}) => {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mf-mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 5 }}>
        {label}
      </div>
      <div
        className={mono ? "mf-mono" : undefined}
        style={{
          fontSize: mono ? 11.5 : 12.5,
          lineHeight: 1.5,
          color: "var(--ink-1)",
          letterSpacing: mono ? "0.02em" : undefined,
          whiteSpace: multiline ? "pre-wrap" : "normal",
          wordBreak: multiline ? "break-word" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
};
