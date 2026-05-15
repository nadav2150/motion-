import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AppChrome,
  Button,
  CinemaPreview,
  IconArrowRight,
  IconChevron,
  IconClose,
  IconFolder,
  IconImage,
  IconLayers,
  IconMic,
  IconMusic,
  IconPalette,
  IconPause,
  IconPlay,
  IconPlus,
  IconScissors,
  IconShare,
  IconSparkle,
  IconType,
  IconUpload,
  IconWand,
  IconWave,
  Pill,
  useFrame,
  type NavKey,
} from "../primitives";
import { MusicPicker, type CurrentMusic } from "../MusicPicker";
import { SfxPicker, type CurrentSfx } from "../SfxPicker";

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
  music_track_id: string | null;
  music_url: string | null;
  music_title: string | null;
  music_artist: string | null;
  sfx_id: string | null;
  sfx_url: string | null;
  sfx_name: string | null;
  sfx_author: string | null;
  sfx_license: string | null;
  // Project-level asset library (see supabase/migrations/20260520_job_assets.sql).
  assets?: unknown;
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
  // Per-scene user comments (see supabase/migrations/20260518_shot_comments.sql).
  comments?: unknown;
  // Per-scene attached assets (see supabase/migrations/20260519_shot_assets.sql).
  assets?: unknown;
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

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};

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
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#050505" }}
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
// stage overflows.
//
// Strategy: force html/body to fill the iframe viewport, flex-center #root,
// then visually scale only #root by min(viewportW/1920, viewportH/1080).
// We DO NOT touch the body or #root's layout dimensions — that keeps GSAP's
// tweens against #root children running against the same 1920×1080 space the
// scene was authored in (no positioning math goes off the rails).
//
// Anything outside the scaled #root falls back to the body's #050505
// background → natural letterbox / pillarbox if the iframe's aspect ratio
// doesn't match 16:9.
//
// `!important` is required because composition.html declares
// `html, body { width: 1920px; height: 1080px; background: var(--bg) }`
// at equal specificity earlier in <head>.
// Bulletproof preview-fit: position #root absolutely at the iframe's
// dead-center, then transform: translate(-50%, -50%) scale(s) where
// s = min(viewportW/1920, viewportH/1080). Centering doesn't depend on
// flex/grid alignment cooperating with the composition's own CSS — the
// element's own transform places it, full stop.
const fitToViewportShim = `
<style id="mg-preview-fit">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    background: #050505 !important;
  }
  body { position: relative !important; }
  #stage, #root {
    position: absolute !important;
    left: 50% !important;
    top: 50% !important;
    transform-origin: 0 0 !important;
    margin: 0 !important;
  }
</style>
<script id="mg-preview-fit-script">
(function(){
  var stage = null;
  function fit(){
    if (!stage) stage = document.getElementById("stage") || document.getElementById("root");
    if (!stage) return;
    var w = parseFloat(stage.getAttribute("data-width")) || 1920;
    var h = parseFloat(stage.getAttribute("data-height")) || 1080;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    if (vw <= 0 || vh <= 0) return;
    var s = Math.min(vw / w, vh / h);
    // translate(-50%, -50%) shifts the element's OWN top-left back by half its
    // own (unscaled) box, so the visual center lands on body's 50%/50% anchor.
    // Then scale(s) shrinks around top-left (transform-origin: 0 0), but the
    // shift was computed against the unscaled box so visual centering survives.
    // Transform order matters: scale runs LAST (applied first to the point in
    // CSS's right-to-left chain), so translate(-50%, -50%) in unscaled local
    // coords becomes (-s*half, -s*half) in body coords — i.e. the offset is
    // also scaled, matching the visual element size exactly. Reversing this
    // (translate then scale) leaves the offset un-scaled and miscentres.
    stage.style.transform = "scale(" + s + ") translate(-50%, -50%)";
    try { console.log("[fit] viewport", vw, "x", vh, "stage", w, "x", h, "→ scale", s.toFixed(4)); } catch(_) {}
  }
  var start = (performance && performance.now) ? performance.now() : Date.now();
  function tick(){
    fit();
    var now = (performance && performance.now) ? performance.now() : Date.now();
    if (now - start < 1000) requestAnimationFrame(tick);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tick);
  } else { tick(); }
  window.addEventListener("resize", fit);
  if (typeof ResizeObserver !== "undefined") {
    try { new ResizeObserver(fit).observe(document.documentElement); } catch(_) {}
  }
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

// Forward all iframe console output + uncaught errors + unhandled promise
// rejections to the parent window via postMessage, so the developer sees one
// merged log stream in their DevTools when debugging a scene.
const consoleBridgeShim = `
<script id="mg-console-bridge">
(function(){
  function serialize(args){
    try { return Array.prototype.slice.call(args).map(function(a){
      if (a && a.stack) return String(a.stack);
      if (typeof a === "object") { try { return JSON.stringify(a); } catch(_) { return String(a); } }
      return String(a);
    }); } catch(_) { return ["<unserializable log args>"]; }
  }
  function send(level, args){
    try {
      parent.postMessage({ __mgScene: true, level: level, args: serialize(args), url: location.href }, "*");
    } catch(_) {}
  }
  ["log","info","warn","error","debug"].forEach(function(level){
    var orig = console[level];
    console[level] = function(){ send(level, arguments); try { orig.apply(console, arguments); } catch(_) {} };
  });
  window.addEventListener("error", function(e){
    send("error", [e.message + " @ " + (e.filename || "?") + ":" + (e.lineno || "?") + ":" + (e.colno || "?")]);
  });
  window.addEventListener("unhandledrejection", function(e){
    var r = e && (e.reason && (e.reason.stack || e.reason.message)) || String(e && e.reason);
    send("error", ["unhandledrejection: " + r]);
  });
  send("log", ["scene iframe loaded — bridge active"]);
})();
</script>`;

function injectPreviewFit(
  html: string,
  scope?: { startSeconds: number; durationSeconds: number },
): string {
  const head = fitToViewportShim + consoleBridgeShim;
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

  // Relay every console / error / rejection event from the scene iframe into
  // this window's console so all scene-debug output lands in one DevTools.
  useEffect(() => {
    const tag = `[scene ${shot.shot_index + 1} · ${shot.id.slice(0, 8)}]`;
    const handler = (e: MessageEvent) => {
      const d = e.data as { __mgScene?: boolean; level?: string; args?: string[] } | null;
      if (!d || !d.__mgScene) return;
      const level = (d.level ?? "log") as "log" | "info" | "warn" | "error" | "debug";
      const fn = (console[level] ?? console.log).bind(console);
      fn(tag, ...(d.args ?? []));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [shot.id, shot.shot_index]);

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
    const tag = `[scene ${shot.shot_index + 1} · ${shot.id.slice(0, 8)}]`;
    console.log(
      tag,
      "play clicked — sceneStart=",
      sceneStartSeconds,
      "s · duration=",
      Number(shot.duration) || 0,
      "s · htmlPath=",
      shot.scene_html_path,
    );
    setPlayKey((k) => (k ?? 0) + 1);
    if (!shot.scene_html_path) {
      console.warn(tag, "no scene_html_path on this shot — nothing to load");
      return;
    }
    setLoadStatus("loading");
    setLoadError(null);
    const t0 = performance.now();
    try {
      // Route handles both public-URL and legacy storage-path values and
      // always returns text/html, sidestepping Supabase Content-Type quirks.
      const url = `/api/shots/${shot.id}/scene-html`;
      console.log(tag, "GET", url);
      const res = await fetch(url);
      console.log(tag, "response", res.status, res.statusText, `${Math.round(performance.now() - t0)}ms`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const text = await res.text();
      console.log(tag, "html size", text.length, "chars · injecting shims + mounting iframe");
      setHtml(
        injectPreviewFit(text, {
          startSeconds: sceneStartSeconds,
          durationSeconds: Number(shot.duration) || 0,
        }),
      );
      setLoadStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(tag, "load failed:", message);
      setLoadError(message);
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

// Loads a scene's HTML via /api/shots/:id/scene-html (which forces text/html
// and bypasses Supabase's Content-Type quirks) and renders it via srcDoc so
// the browser actually executes the scene's JS instead of showing source.
const HtmlScenePane = ({
  shot,
  playing,
  startSeconds,
}: {
  shot: ShotRow;
  playing: boolean;
  /** Scene start time on the master film timeline. The composition.html
   *  contains all N scenes on one GSAP timeline; without seeking to the
   *  correct offset the iframe always replays scene 1 from t=0. */
  startSeconds: number;
}) => {
  const [html, setHtml] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setHtml(null);
  }, [shot.id]);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const tag = `[timeline scene ${shot.shot_index + 1} · ${shot.id.slice(0, 8)}]`;
    const t0 = performance.now();
    console.log(
      tag,
      "play — seeking iframe to startSeconds=",
      startSeconds,
      "duration=",
      Number(shot.duration) || 0,
    );
    (async () => {
      try {
        const url = `/api/shots/${shot.id}/scene-html`;
        console.log(tag, "GET", url);
        const res = await fetch(url);
        console.log(
          tag,
          "response",
          res.status,
          `${Math.round(performance.now() - t0)}ms`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        console.log(tag, "html size", text.length, "chars · mounting iframe");
        setHtml(
          injectPreviewFit(text, {
            startSeconds,
            durationSeconds: Number(shot.duration) || 0,
          }),
        );
        setNonce((n) => n + 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(tag, "load failed:", message);
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playing, shot.id, shot.duration, startSeconds]);

  // While paused (or before fetch resolves) fall back to the static thumbnail
  // so the user sees the right scene rather than a blank frame.
  if (!playing || !html) {
    if (shot.scene_thumbnail_path) {
      return (
        <img
          src={shot.scene_thumbnail_path}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "contain",
            background: "#050505",
          }}
        />
      );
    }
    return null;
  }

  return (
    <iframe
      key={`${shot.id}-${nonce}`}
      srcDoc={html}
      title={`Scene ${shot.shot_index + 1}`}
      sandbox="allow-scripts"
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        border: "none", background: "#050505",
        pointerEvents: "none",
      }}
    />
  );
};

const TransportBtn = ({
  children,
  primary,
  onClick,
}: {
  children: ReactNode;
  primary?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    style={{
      width: primary ? 40 : 32, height: primary ? 40 : 32, borderRadius: "50%",
      background: primary ? "linear-gradient(180deg, #FFFFFF, #E6E8EE)" : "rgba(255,255,255,0.04)",
      border: primary ? "1px solid rgba(255,255,255,0.4)" : "1px solid var(--line)",
      color: primary ? "#06070A" : "var(--ink-1)", cursor: "pointer",
      display: "grid", placeItems: "center",
      boxShadow: primary ? "0 8px 24px -8px rgba(255,255,255,0.4)" : "none",
      fontFamily: "inherit", padding: 0,
    }}
  >
    {children}
  </button>
);

// Tracks the playhead position; a click anywhere on a track seeks `time`. The
// VIDEO row hosts per-scene blocks; MOTION/TEXT/AUDIO are visual stand-ins
// that mirror the scene grid until those pipelines land.
const TimelineRow = ({
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
}) => {
  // Tracks which scene tile currently has a draggable hovering over it, so we
  // can light up just that tile's border. Cleared on dragleave / drop.
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null);
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

  return (
    <div style={{ borderTop: "1px solid var(--line)", background: "rgba(8,9,13,0.55)", padding: "16px 28px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className="mf-eyebrow">TIMELINE</span>
          <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>
            {shots.length} {shots.length === 1 ? "SCENE" : "SCENES"} · 4 TRACKS
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="ghost" size="sm" icon={<IconScissors size={12}/>}>Split</Button>
          <Button variant="ghost" size="sm" icon={<IconWand size={12}/>}>Auto-fit</Button>
        </div>
      </div>

      {/* Ruler */}
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

      {/* Tracks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, position: "relative" }}>
        {([
          { l: "SCENES", icon: <IconImage size={11}/>, kind: "video" as const },
          { l: "VOICE OVER", icon: <IconWand size={11}/>, kind: "motion" as const },
          { l: "SOUND EFFECTS", icon: <IconType size={11}/>, kind: "text" as const },
          { l: "AUDIO", icon: <IconMusic size={11}/>, kind: "audio" as const },
        ]).map((tr) => (
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
                display: "flex", gap: 3, height: tr.kind === "audio" ? 30 : 28,
                cursor: "pointer", userSelect: "none",
              }}
            >
              {tr.kind === "audio" || tr.kind === "motion" || tr.kind === "text" ? (
                // Per-scene asset blocks for audio-style tracks. Each shot
                // either has a matching asset (filled block with name) or
                // nothing (dashed empty placeholder). Tracks aren't drop
                // targets — assets attach to scenes via the scenes row, the
                // right panel, or the cinema preview.
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
                  // If nothing is attached anywhere, render one wide empty
                  // strip rather than N dashed blocks (cleaner empty state).
                  if (!anyAttached) {
                    return (
                      <div
                        style={{
                          flex: 1, borderRadius: 4,
                          background: "rgba(255,255,255,0.015)",
                          border: "1px dashed var(--line-2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
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
                    const len = Number(s.duration) || 0;
                    const allAssets = isSceneAssetArray(s.assets) ? s.assets : [];
                    const matched = allAssets.find((a) => a.kind === targetKind);
                    return (
                      <div
                        key={s.id}
                        title={matched?.name ?? `${emptyLabel} on scene ${s.shot_index + 1}`}
                        style={{
                          flex: len,
                          borderRadius: 4,
                          background: matched ? accent : "rgba(255,255,255,0.015)",
                          border: `1px ${matched ? "solid" : "dashed"} ${
                            matched ? "rgba(255,255,255,0.10)" : "var(--line-2)"
                          }`,
                          padding: "0 8px",
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                        }}
                      >
                        {matched ? (
                          tr.kind === "audio" ? (
                            // Waveform stand-in only for the AUDIO track; voice
                            // / sfx blocks get a plain name label so they read
                            // cleanly even at tile-width.
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
                // Scenes track — one tile per shot, click to seek, double-click to preview.
                shots.map((s) => {
                  const len = Number(s.duration) || 0;
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
                        console.log(
                          `[timeline] clicked scene ${s.shot_index + 1} · ${s.id.slice(0, 8)} — seeking playhead to ${start}s (duration ${Number(s.duration) || 0}s)`,
                        );
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
                        flex: len, borderRadius: 4,
                        background: baseBg,
                        border: `1px solid ${
                          isDropTarget
                            ? "rgba(122,162,255,0.9)"
                            : isSelected
                              ? "rgba(122,162,255,0.7)"
                              : "rgba(255,255,255,0.08)"
                        }`,
                        padding: "0 10px",
                        display: "flex", alignItems: "center", overflow: "hidden",
                        position: "relative", cursor: "pointer",
                        boxShadow: isDropTarget
                          ? "0 0 0 2px rgba(122,162,255,0.55), 0 10px 30px -8px rgba(122,162,255,0.55)"
                          : isSelected
                            ? "0 0 0 1px rgba(122,162,255,0.4), 0 8px 24px -8px rgba(122,162,255,0.4)"
                            : "none",
                        transition: "border-color 120ms, box-shadow 120ms",
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
            </div>
          </div>
        ))}

        {/* Playhead */}
        <div
          style={{
            position: "absolute", top: -10, bottom: -2,
            left: `calc(110px + 10px + (100% - 110px - 10px) * ${Math.max(0, Math.min(1, time / total))})`,
            width: 1, background: "#7AA2FF",
            boxShadow: "0 0 10px rgba(122,162,255,0.8)",
            pointerEvents: "none",
          }}
        >
          <div style={{ position: "absolute", top: -6, left: -4, width: 9, height: 9, borderRadius: "50%", background: "#7AA2FF", boxShadow: "0 0 12px rgba(122,162,255,0.9)" }}/>
        </div>
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
  // When opening an existing project we start blank and let the hydrate
  // effect below fill in `job.script` once the job row loads. Only the
  // empty/new-project flow uses the placeholder copy.
  const [script, setScript] = useState(
    empty || initialJobId
      ? ""
      : `Meet Lattice — the OS for high-performing teams.\nBuilt for teams that ship.\nFrom goals to growth, every conversation lives here.\nStart free. Ship faster.`,
  );
  const scriptHydratedJobIdRef = useRef<string | null>(null);
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
  const [brandSourceUrl, setBrandSourceUrl] = useState<string>("");
  const [brandScraping, setBrandScraping] = useState(false);
  const [brandScrapeError, setBrandScrapeError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const brandHydratedJobIdRef = useRef<string | null>(null);

  // Project-level asset library (left sidebar ASSETS panel).
  const [jobAssets, setJobAssets] = useState<JobAsset[]>([]);
  const [assetsUploading, setAssetsUploading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const assetsInputRef = useRef<HTMLInputElement | null>(null);
  const assetsHydratedJobIdRef = useRef<string | null>(null);

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

  const handleScrapeFromUrl = async () => {
    const trimmed = brandSourceUrl.trim();
    if (!trimmed) return;
    setBrandScrapeError(null);
    setBrandScraping(true);
    try {
      const res = await fetch("/api/brand/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        palette?: string[];
        logoUrl?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Scrape failed (${res.status})`);
      const colors = (data.palette ?? [])
        .map((c) => c.toLowerCase())
        .filter((c) => /^#[0-9a-f]{6}$/.test(c));
      const patch: { brandColors?: string[]; brandLogoUrl?: string | null } = {};
      if (colors.length > 0) {
        setBrandColors(colors);
        patch.brandColors = colors;
      }
      if (data.logoUrl) {
        setBrandLogoUrl(data.logoUrl);
        setBrandLogoStoragePath(null);
        setBrandLogoName(new URL(data.logoUrl).hostname);
        patch.brandLogoUrl = data.logoUrl;
      }
      if (Object.keys(patch).length > 0) {
        void persistBrandPatch(patch);
      }
    } catch (err) {
      setBrandScrapeError(err instanceof Error ? err.message : String(err));
    } finally {
      setBrandScraping(false);
    }
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

  // Transport state for the preview/timeline. `time` is in seconds across the
  // full assembled film; the playhead and scene focus are derived from it.
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewDragOver, setPreviewDragOver] = useState(false);

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

  // Hydrate the asset library once per job. Subsequent polls don't overwrite
  // local additions because we gate on assetsHydratedJobIdRef.
  useEffect(() => {
    if (!job) return;
    if (assetsHydratedJobIdRef.current === job.id) return;
    setJobAssets(isJobAssetArray(job.assets) ? job.assets : []);
    setAssetsError(null);
    assetsHydratedJobIdRef.current = job.id;
  }, [job]);

  const uploadAsset = async (file: File) => {
    const id = jobIdRef.current;
    if (!id) {
      setAssetsError("Generate the storyboard before uploading assets.");
      return;
    }
    setAssetsError(null);
    setAssetsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/jobs/${id}/assets`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        assets?: JobAsset[];
        error?: string;
      };
      if (!res.ok || !data.assets) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setJobAssets(data.assets);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetsUploading(false);
    }
  };

  const onAssetsChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      // sequential to keep server load predictable and surface per-file errors
      await uploadAsset(file);
    }
  };

  // Drop handler — called by the three scene-level drop targets (timeline
  // scene tiles, right Assets tab, cinema preview). Whatever the source
  // asset's kind is, that becomes the SceneAsset kind; image/video/audio map
  // 1:1, anything else is rejected. (Voice-over / sfx classification isn't
  // disambiguated here — audio defaults to "music"; future UX can re-classify.)
  // The `_targetTrackKind` arg is kept for the timeline tile call so the same
  // signature works there, but it's not currently used in the mapping.
  const handleAssetDrop = async (
    shotId: string,
    _targetTrackKind: "video" | "motion" | "text" | "audio",
    asset: JobAsset,
  ) => {
    let sceneKind: SceneAssetKind | null = null;
    if (asset.kind === "image") sceneKind = "image";
    else if (asset.kind === "video") sceneKind = "video";
    else if (asset.kind === "audio") sceneKind = "music";
    if (!sceneKind) {
      console.warn(`[drop] rejected: unsupported asset kind=${asset.kind}`);
      return;
    }

    try {
      const res = await fetch(`/api/shots/${shotId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: sceneKind,
          url: asset.url,
          name: asset.name,
          source_asset_id: asset.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        assets?: unknown;
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.assets)) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setShots((prev) =>
        prev.map((s) => (s.id === shotId ? { ...s, assets: data.assets } : s)),
      );
      console.log(
        `[drop] scene ${shotId.slice(0, 8)} ← ${sceneKind} (from "${asset.name}")`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[drop] failed:`, message);
    }
  };

  const removeAsset = async (assetId: string) => {
    const id = jobIdRef.current;
    if (!id) return;
    setAssetsError(null);
    try {
      const res = await fetch(
        `/api/jobs/${id}/assets?assetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        assets?: JobAsset[];
        error?: string;
      };
      if (!res.ok || !data.assets) {
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      setJobAssets(data.assets);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : String(err));
    }
  };

  // Hydrate the script field from the saved job row once per job. Gated so
  // polling doesn't clobber the user's in-progress edits.
  useEffect(() => {
    if (!job) return;
    if (scriptHydratedJobIdRef.current === job.id) return;
    if (typeof job.script === "string") setScript(job.script);
    scriptHydratedJobIdRef.current = job.id;
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

  // Tick the playhead while playing. Wraps at totalDuration (or pauses at 0
  // when there is nothing to play yet).
  useEffect(() => {
    if (!playing) return;
    if (totalDuration <= 0) return;
    const id = setInterval(() => {
      setTime((t) => {
        const next = t + 0.1;
        return next >= totalDuration ? 0 : next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, totalDuration]);

  // The shot the playhead is currently inside. Independent of `selected`,
  // which tracks the user's pinned inspector target.
  const currentShot = useMemo(() => {
    if (shots.length === 0) return null;
    let acc = 0;
    for (const s of shots) {
      const d = Number(s.duration) || 0;
      if (time < acc + d) return s;
      acc += d;
    }
    return shots[shots.length - 1] ?? null;
  }, [shots, time]);

  // Music asset attached to whichever scene the playhead is in. Background
  // music applied to every scene gives the same URL across all of them so
  // playback is continuous; if a scene has no music attached this becomes
  // null and the <audio> element pauses.
  const activeMusicUrl = useMemo(() => {
    if (!currentShot) return null;
    const list = isSceneAssetArray(currentShot.assets) ? currentShot.assets : [];
    return list.find((a) => a.kind === "music")?.url ?? null;
  }, [currentShot]);

  // Hidden <audio> element drives playback. Two effects sync it with the
  // editor's play/pause state and the active URL:
  //   - URL change → reload src
  //   - playing flip → call .play() / .pause()
  // The rendered scene video is muted so this doesn't double-play.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!activeMusicUrl) {
      a.pause();
      return;
    }
    if (a.src !== activeMusicUrl) {
      a.src = activeMusicUrl;
      a.load();
    }
    if (playing) {
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) =>
          console.warn(
            "[bg-music] play() rejected (likely autoplay policy):",
            err instanceof Error ? err.message : err,
          ),
        );
      }
    } else {
      a.pause();
    }
  }, [activeMusicUrl, playing]);

  // Preview always tracks the playhead so clicking a timeline scene (which
  // seeks `time`) updates the visible scene without depending on selection.
  const previewShotInline = currentShot;

  const goPrevScene = () => {
    if (shots.length === 0) return;
    let acc = 0;
    const starts: number[] = [];
    for (const s of shots) {
      starts.push(acc);
      acc += Number(s.duration) || 0;
    }
    // Find the largest start <= time - small epsilon
    let target = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] < time - 0.2) target = starts[i];
      else break;
    }
    setTime(target);
  };
  const goNextScene = () => {
    if (shots.length === 0) return;
    let acc = 0;
    for (const s of shots) {
      acc += Number(s.duration) || 0;
      if (acc > time + 0.05) {
        setTime(Math.min(acc, Math.max(0, totalDuration - 0.01)));
        return;
      }
    }
  };

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
      <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100%", minHeight: 0, minWidth: 0, width: "100%" }}>
       <div
         style={{
           display: "grid",
           gridTemplateColumns: showStoryboard ? "360px minmax(0, 1fr) 320px" : "360px minmax(0, 1fr)",
           minHeight: 0,
           minWidth: 0,
           width: "100%",
         }}
       >
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
              badge={
                job?.music_title
                  ? job.music_title.length > 18
                    ? `${job.music_title.slice(0, 18)}…`
                    : job.music_title
                  : "—"
              }
              open={openSections.has("music")}
              onToggle={() => toggleSection("music")}
            >
              {jobId ? (
                <MusicPicker
                  jobId={jobId}
                  current={
                    job?.music_track_id && job?.music_url
                      ? ({
                          trackId: job.music_track_id,
                          title: job.music_title ?? "",
                          artist: job.music_artist ?? "",
                          streamUrl: job.music_url,
                        } satisfies CurrentMusic)
                      : null
                  }
                  onChange={(next) => {
                    setJob((prev) =>
                      prev
                        ? {
                            ...prev,
                            music_track_id: next?.trackId ?? null,
                            music_title: next?.title ?? null,
                            music_artist: next?.artist ?? null,
                            music_url: next?.streamUrl ?? null,
                          }
                        : prev,
                    );
                  }}
                  onApplyAsBackground={async (track) => {
                    // Attach the same track as kind="music" to every scene so
                    // it lights up the AUDIO row across the whole timeline.
                    // POSTs are fired sequentially to keep server load
                    // predictable and surface per-scene errors.
                    for (const s of shots) {
                      const res = await fetch(`/api/shots/${s.id}/assets`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          kind: "music",
                          url: track.streamUrl,
                          name: `${track.title} — ${track.artist}`,
                        }),
                      });
                      const data = (await res.json().catch(() => ({}))) as {
                        assets?: unknown;
                        error?: string;
                      };
                      if (!res.ok || !Array.isArray(data.assets)) {
                        console.warn(
                          `[bg-music] failed for scene ${s.id.slice(0, 8)}: ${data.error ?? res.status}`,
                        );
                        continue;
                      }
                      setShots((prev) =>
                        prev.map((row) =>
                          row.id === s.id ? { ...row, assets: data.assets } : row,
                        ),
                      );
                    }
                  }}
                />
              ) : (
                <ComingSoonPanel
                  icon={<IconMusic size={14}/>}
                  title="Music bed"
                  hint="Generate or open a project to choose a track."
                />
              )}
            </AccordionSection>

            <AccordionSection
              label="SFX"
              badge={
                job?.sfx_name
                  ? job.sfx_name.length > 18
                    ? `${job.sfx_name.slice(0, 18)}…`
                    : job.sfx_name
                  : "—"
              }
              open={openSections.has("sfx")}
              onToggle={() => toggleSection("sfx")}
            >
              {jobId ? (
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
              ) : (
                <ComingSoonPanel
                  icon={<IconWave size={14}/>}
                  title="Sound effects"
                  hint="Generate or open a project to choose a sound effect."
                />
              )}
            </AccordionSection>

            <AccordionSection
              label="ASSETS"
              badge={
                jobAssets.length > 0
                  ? `${jobAssets.length} ${jobAssets.length === 1 ? "FILE" : "FILES"}`
                  : "—"
              }
              open={openSections.has("assets")}
              onToggle={() => toggleSection("assets")}
            >
              <input
                ref={assetsInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={onAssetsChange}
                style={{ display: "none" }}
              />

              {jobAssets.length === 0 ? (
                <button
                  onClick={() => assetsInputRef.current?.click()}
                  disabled={assetsUploading || !jobIdRef.current}
                  style={{
                    width: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "16px 12px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.015)",
                    border: "1px dashed var(--line-2)",
                    color: "var(--ink-2)",
                    cursor: assetsUploading ? "wait" : "pointer",
                    fontFamily: "inherit", fontSize: 12,
                    opacity: assetsUploading || !jobIdRef.current ? 0.65 : 1,
                  }}
                >
                  {assetsUploading ? "Uploading…" : (
                    <>
                      <IconUpload size={13}/>
                      Upload assets (images · videos · audio)
                    </>
                  )}
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {jobAssets.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => {
                        // Wire-up for phase 2 drag-and-drop. Encode the asset so a
                        // timeline drop target can read it without DB roundtrips.
                        e.dataTransfer.setData("application/x-mg-asset", JSON.stringify(a));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: 6,
                        borderRadius: 10,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--line)",
                        cursor: "grab",
                      }}
                    >
                      <div
                        style={{
                          width: 44, height: 44,
                          flexShrink: 0,
                          borderRadius: 8,
                          background:
                            a.kind === "image"
                              ? `url(${a.url}) center/cover, rgba(255,255,255,0.04)`
                              : a.kind === "video"
                                ? "linear-gradient(135deg, #1F2937, #5468FF)"
                                : a.kind === "audio"
                                  ? "linear-gradient(135deg, #5b3aa8, #a78bfa)"
                                  : "rgba(255,255,255,0.04)",
                          border: "1px solid var(--line)",
                          display: "grid", placeItems: "center",
                          color: "rgba(255,255,255,0.85)",
                        }}
                      >
                        {a.kind === "video" ? <IconImage size={14}/> :
                         a.kind === "audio" ? <IconMusic size={14}/> :
                         a.kind === "image" ? null : <IconFolder size={14}/>}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 12, color: "var(--ink-1)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {a.name}
                        </div>
                        <div
                          className="mf-mono"
                          style={{
                            fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em",
                            marginTop: 2,
                          }}
                        >
                          {a.kind.toUpperCase()} · {Math.max(1, Math.round(a.size_bytes / 1024))} KB
                        </div>
                      </div>
                      <button
                        onClick={() => removeAsset(a.id)}
                        aria-label={`Remove ${a.name}`}
                        title="Remove"
                        style={{
                          width: 26, height: 26, borderRadius: 6,
                          display: "grid", placeItems: "center",
                          background: "transparent",
                          border: "1px solid var(--line)",
                          color: "var(--ink-3)", cursor: "pointer", padding: 0,
                        }}
                      >
                        <IconClose size={12}/>
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => assetsInputRef.current?.click()}
                    disabled={assetsUploading}
                    style={{
                      marginTop: 4,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.015)",
                      border: "1px dashed var(--line-2)",
                      color: "var(--ink-2)",
                      cursor: assetsUploading ? "wait" : "pointer",
                      fontFamily: "inherit", fontSize: 12,
                      opacity: assetsUploading ? 0.65 : 1,
                    }}
                  >
                    <IconUpload size={12}/>
                    {assetsUploading ? "Uploading…" : "Add more"}
                  </button>
                </div>
              )}

              {assetsError && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>
                  {assetsError}
                </div>
              )}
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
                {/* From URL — auto-populate logo + palette from any public site */}
                <div>
                  <div
                    className="mf-mono"
                    style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}
                  >
                    FROM URL
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="url"
                      value={brandSourceUrl}
                      onChange={(e) => setBrandSourceUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !brandScraping) {
                          e.preventDefault();
                          void handleScrapeFromUrl();
                        }
                      }}
                      placeholder="https://artlist.io"
                      disabled={brandScraping}
                      style={{
                        flex: 1, padding: "8px 10px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.30)",
                        border: "1px solid var(--line)",
                        color: "var(--ink-1)",
                        fontFamily: "inherit", fontSize: 12,
                      }}
                    />
                    <button
                      onClick={() => void handleScrapeFromUrl()}
                      disabled={brandScraping || !brandSourceUrl.trim()}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        background: "rgba(122,162,255,0.16)",
                        border: "1px solid rgba(122,162,255,0.45)",
                        color: "var(--ink-1)",
                        fontFamily: "inherit", fontSize: 12,
                        cursor: brandScraping ? "wait" : "pointer",
                        opacity: brandScraping || !brandSourceUrl.trim() ? 0.6 : 1,
                      }}
                    >
                      {brandScraping ? "Fetching…" : "Fetch"}
                    </button>
                  </div>
                  {brandScrapeError && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11, color: "var(--ink-3)",
                      }}
                    >
                      {brandScrapeError}
                    </div>
                  )}
                </div>

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

        {/* Center: preview + transport */}
        <section style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, position: "relative" }}>
          <div className="mf-bg-bloom"/>
          {!showStoryboard ? (
            <EmptyState f={f} />
          ) : shots.length === 0 ? (
            <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 28px" }}>
              <div
                style={{
                  padding: "60px 32px", borderRadius: 14,
                  border: "1px dashed var(--line-2)",
                  background: "rgba(255,255,255,0.015)",
                  textAlign: "center", maxWidth: 460,
                }}
              >
                <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.18em", marginBottom: 8 }}>
                  {status === "directing" ? "DIRECTING SHOTS…" : "WAITING FOR DIRECTOR…"}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
                  The director is splitting your script into cinematic beats and writing image prompts.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 20, position: "relative", minHeight: 0, flex: 1 }}>
              <div
                onDragOver={(e) => {
                  if (!previewShotInline) return;
                  if (
                    Array.from(e.dataTransfer.types).includes(
                      "application/x-mg-asset",
                    )
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setPreviewDragOver(true);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setPreviewDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setPreviewDragOver(false);
                  if (!previewShotInline) return;
                  const asset = readDraggedAsset(e);
                  if (!asset) return;
                  void handleAssetDrop(previewShotInline.id, "video", asset);
                }}
                style={{
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                  borderRadius: 14,
                  outline: previewDragOver
                    ? "2px dashed rgba(122,162,255,0.7)"
                    : "none",
                  outlineOffset: 4,
                  transition: "outline-color 120ms",
                }}
              >
              <CinemaPreview
                aspect="16 / 9"
                frame={f}
                label={
                  previewShotInline
                    ? `SCENE ${String(previewShotInline.shot_index + 1).padStart(2, "0")} · ${(previewShotInline.shot_goal ?? "UNTITLED").toUpperCase()}`
                    : undefined
                }
                style={{ flex: 1, minHeight: 0 }}
              >
                {/* Underlay: rendered video > html scene (plays iframe / shows
                    thumbnail) > legacy clip > image > standalone thumbnail. */}
                {previewShotInline?.rendered_video_url ? (
                  <video
                    key={previewShotInline.rendered_video_url}
                    src={previewShotInline.rendered_video_url}
                    poster={previewShotInline.scene_thumbnail_path ?? undefined}
                    autoPlay={playing}
                    muted
                    loop
                    playsInline
                    style={{
                      position: "absolute", inset: 0, width: "100%", height: "100%",
                      objectFit: "contain",
                      background: "#050505",
                    }}
                  />
                ) : previewShotInline?.scene_html_path ? (
                  <HtmlScenePane
                    shot={previewShotInline}
                    playing={playing}
                    startSeconds={
                      sceneTimings.get(previewShotInline.id)?.startSeconds ?? 0
                    }
                  />
                ) : previewShotInline?.scene_thumbnail_path ? (
                  <img
                    src={previewShotInline.scene_thumbnail_path}
                    alt=""
                    style={{
                      position: "absolute", inset: 0, width: "100%", height: "100%",
                      objectFit: "contain",
                      background: "#050505",
                    }}
                  />
                ) : previewShotInline?.clip_status === "ready" && previewShotInline.clip_url ? (
                  <video
                    key={previewShotInline.clip_url}
                    src={previewShotInline.clip_url}
                    poster={previewShotInline.image_url ?? undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    style={{
                      position: "absolute", inset: 0, width: "100%", height: "100%",
                      objectFit: "contain",
                      background: "#050505",
                    }}
                  />
                ) : previewShotInline?.image_url ? (
                  <img
                    src={previewShotInline.image_url}
                    alt=""
                    style={{
                      position: "absolute", inset: 0, width: "100%", height: "100%",
                      objectFit: "contain",
                      background: "#050505",
                    }}
                  />
                ) : null}

                {/* Caption overlay from current shot's text */}
                {previewShotInline?.text_overlay && (
                  <div style={{ position: "absolute", left: "50%", bottom: 64, transform: "translateX(-50%)", textAlign: "center", maxWidth: "70%" }}>
                    <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
                      {previewShotInline.text_overlay}
                    </div>
                  </div>
                )}

              </CinemaPreview>
              </div>

              {/* Transport */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="mf-mono" style={{ fontSize: 12, letterSpacing: "0.06em", color: "var(--ink-1)" }}>
                  {fmtTime(time)} <span style={{ color: "var(--ink-4)" }}>/ {fmtTime(totalDuration)}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <TransportBtn onClick={goPrevScene}><IconChevron size={16} style={{ transform: "rotate(90deg)" }}/></TransportBtn>
                  <TransportBtn primary onClick={() => setPlaying((p) => !p)}>
                    {playing ? <IconPause size={14}/> : <IconPlay size={14}/>}
                  </TransportBtn>
                  <TransportBtn onClick={goNextScene}><IconChevron size={16} style={{ transform: "rotate(-90deg)" }}/></TransportBtn>
                </div>
                <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                  {shots.length} SCENES · {totalDuration.toFixed(1)}s
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right: scene panel (assets + comments tabs) — only when generated */}
        {showStoryboard && (
          <ScenesPanel
            shot={selectedShot ?? previewShot ?? currentShot ?? null}
            onShotPatched={(updated) => {
              setShots((prev) =>
                prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
              );
            }}
            onAssetDrop={handleAssetDrop}
            onAssetsChanged={(shotId, assets) => {
              setShots((prev) =>
                prev.map((s) => (s.id === shotId ? { ...s, assets } : s)),
              );
            }}
          />
        )}

       </div>

       {/* Full-width timeline row */}
       {showStoryboard && (
         <TimelineRow
           shots={shots}
           totalDuration={totalDuration}
           time={time}
           setTime={setTime}
           setPlaying={setPlaying}
           selectedId={selected}
           onSelect={(id) => setSelected(id)}
           onPreview={(id) => setPreviewShotId(id)}
           sceneTimings={sceneTimings}
           onAssetDrop={handleAssetDrop}
         />
       )}
      </div>
      {/* Hidden audio element driving the editor's background-music playback.
          Synced with `playing` + `activeMusicUrl` via useEffect above. */}
      <audio ref={audioRef} preload="auto" loop style={{ display: "none" }} />
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

// Right-side comments panel — per-scene threads persisted via
// PATCH /api/shots/:id/comments (jsonb column on shots, see migration
// 20260518_shot_comments.sql).

type SceneComment = {
  id: string;
  text: string;
  created_at: string;
  author?: string | null;
};

function isSceneCommentArray(v: unknown): v is SceneComment[] {
  return (
    Array.isArray(v) &&
    v.every(
      (c) =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as { id?: unknown }).id === "string" &&
        typeof (c as { text?: unknown }).text === "string" &&
        typeof (c as { created_at?: unknown }).created_at === "string",
    )
  );
}

function relativeTimeShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return "now";
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

type ScenesPanelTab = "assets" | "comments";

type JobAssetKind = "video" | "image" | "audio" | "other";

type JobAsset = {
  id: string;
  kind: JobAssetKind;
  url: string;
  storage_path: string;
  name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
};

function isJobAssetArray(v: unknown): v is JobAsset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { url?: unknown }).url === "string" &&
        typeof (a as { kind?: unknown }).kind === "string",
    )
  );
}

// Shared DataTransfer parser — the left-side asset cards set
// "application/x-mg-asset" to JSON.stringify(JobAsset) and three drop targets
// read it back (scene tiles, right Assets tab, cinema preview).
function readDraggedAsset(e: React.DragEvent): JobAsset | null {
  try {
    const raw = e.dataTransfer.getData("application/x-mg-asset");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as JobAsset).id === "string" &&
      typeof (parsed as JobAsset).url === "string" &&
      typeof (parsed as JobAsset).kind === "string"
    ) {
      return parsed as JobAsset;
    }
    return null;
  } catch {
    return null;
  }
}

type SceneAssetKind = "video" | "image" | "screenshot" | "voiceover" | "sfx" | "music";

type SceneAsset = {
  id: string;
  kind: SceneAssetKind;
  url: string;
  name: string;
  created_at: string;
};

function isSceneAssetArray(v: unknown): v is SceneAsset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (a) =>
        a !== null &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string" &&
        typeof (a as { kind?: unknown }).kind === "string" &&
        typeof (a as { url?: unknown }).url === "string",
    )
  );
}

const ASSET_KINDS: { id: SceneAssetKind; label: string }[] = [
  { id: "video", label: "VIDEO" },
  { id: "image", label: "IMAGES" },
  { id: "screenshot", label: "SCREENSHOTS" },
  { id: "voiceover", label: "VOICE OVER" },
  { id: "sfx", label: "SOUND EFFECTS" },
  { id: "music", label: "MUSIC" },
];

const ScenesAssetsTab = ({
  shot,
  onAssetsChanged,
}: {
  shot: ShotRow;
  onAssetsChanged?: (shotId: string, assets: SceneAsset[]) => void;
}) => {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo<SceneAsset[]>(
    () => (isSceneAssetArray(shot.assets) ? shot.assets : []),
    [shot],
  );

  const removeAsset = async (assetId: string) => {
    if (!onAssetsChanged) return;
    setRemovingId(assetId);
    setError(null);
    try {
      const res = await fetch(
        `/api/shots/${shot.id}/assets?assetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        assets?: unknown;
        error?: string;
      };
      if (!res.ok || !isSceneAssetArray(data.assets)) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onAssetsChanged(shot.id, data.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  };
  const byKind = useMemo(() => {
    const m = new Map<SceneAssetKind, SceneAsset[]>();
    for (const a of assets) {
      const arr = m.get(a.kind) ?? [];
      arr.push(a);
      m.set(a.kind, arr);
    }
    return m;
  }, [assets]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ASSET_KINDS.map(({ id, label }) => {
        const items = byKind.get(id) ?? [];
        return (
          <div key={id}>
            <div
              className="mf-mono"
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.12em",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{label}</span>
              {items.length > 0 && (
                <span style={{ color: "var(--ink-4)" }}>
                  {items.length} {items.length === 1 ? "ITEM" : "ITEMS"}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div
                style={{
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: "1px dashed var(--line-2)",
                  background: "rgba(255,255,255,0.015)",
                  color: "var(--ink-4)",
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  textAlign: "center",
                }}
              >
                Drop {label.toLowerCase()} here, or pick from the library on the left.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((a) => {
                  const isRemoving = removingId === a.id;
                  return (
                    <div
                      key={a.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        opacity: isRemoving ? 0.55 : 1,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 12,
                          color: "var(--ink-1)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.name || a.url.split("/").pop() || "asset"}
                      </span>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mf-mono"
                        style={{
                          fontSize: 10,
                          color: "var(--ink-3)",
                          letterSpacing: "0.1em",
                          textDecoration: "none",
                        }}
                      >
                        OPEN
                      </a>
                      <button
                        onClick={() => void removeAsset(a.id)}
                        disabled={isRemoving}
                        aria-label={`Remove ${a.name}`}
                        title="Remove from scene"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          display: "grid",
                          placeItems: "center",
                          background: "transparent",
                          border: "1px solid var(--line)",
                          color: "var(--ink-3)",
                          cursor: isRemoving ? "wait" : "pointer",
                          padding: 0,
                        }}
                      >
                        <IconClose size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>
          Failed to remove: {error}
        </div>
      )}
    </div>
  );
};

const ScenesPanel = ({
  shot,
  onShotPatched,
  onAssetDrop,
  onAssetsChanged,
}: {
  shot: ShotRow | null;
  onShotPatched: (patch: { id: string; comments: SceneComment[] }) => void;
  onAssetDrop?: (
    shotId: string,
    trackKind: "video" | "motion" | "text" | "audio",
    asset: JobAsset,
  ) => void;
  onAssetsChanged?: (shotId: string, assets: SceneAsset[]) => void;
}) => {
  const [tab, setTab] = useState<ScenesPanelTab>("comments");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const comments = useMemo<SceneComment[]>(() => {
    if (!shot) return [];
    return isSceneCommentArray(shot.comments) ? shot.comments : [];
  }, [shot]);

  const submit = async () => {
    if (!shot) return;
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/shots/${shot.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        comments?: SceneComment[];
        error?: string;
      };
      if (!res.ok || !data.comments) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onShotPatched({ id: shot.id, comments: data.comments });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!shot) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/shots/${shot.id}/comments?commentId=${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        comments?: SceneComment[];
        error?: string;
      };
      if (!res.ok || !data.comments) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onShotPatched({ id: shot.id, comments: data.comments });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <aside
      onDragOver={(e) => {
        if (!shot || !onAssetDrop) return;
        if (
          Array.from(e.dataTransfer.types).includes("application/x-mg-asset")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Fire only when leaving the aside itself, not crossing into a child.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!shot || !onAssetDrop) return;
        const asset = readDraggedAsset(e);
        if (!asset) return;
        onAssetDrop(shot.id, "video", asset);
        setTab("assets");
      }}
      style={{
        borderLeft: "1px solid var(--line)",
        padding: "20px 18px",
        overflow: "auto",
        background: dragOver
          ? "rgba(122,162,255,0.06)"
          : "rgba(8,9,13,0.4)",
        outline: dragOver ? "1px dashed rgba(122,162,255,0.55)" : "none",
        outlineOffset: -1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        transition: "background 120ms",
      }}
    >
      <div
        className="mf-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          color: "var(--ink-3)",
        }}
      >
        {shot
          ? `SCENE ${String(shot.shot_index + 1).padStart(2, "0")}`
          : "SCENE"}
      </div>

      {/* Tab switcher */}
      <div
        role="tablist"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
          border: "1px solid var(--line)",
        }}
      >
        {(["assets", "comments"] as const).map((id) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              style={{
                padding: "7px 10px",
                borderRadius: 7,
                background: active ? "rgba(122,162,255,0.16)" : "transparent",
                border: `1px solid ${active ? "rgba(122,162,255,0.45)" : "transparent"}`,
                color: active ? "var(--ink-1)" : "var(--ink-3)",
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.04em",
                textTransform: "capitalize",
              }}
            >
              {id}
            </button>
          );
        })}
      </div>

      {!shot ? (
        <div
          style={{
            padding: "20px 16px",
            borderRadius: 12,
            border: "1px dashed var(--line-2)",
            background: "rgba(255,255,255,0.015)",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Click a scene in the timeline to see its assets and leave notes.
        </div>
      ) : tab === "assets" ? (
        <ScenesAssetsTab shot={shot} onAssetsChanged={onAssetsChanged} />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
            {comments.length === 0 ? (
              <div
                style={{
                  padding: "16px 14px",
                  borderRadius: 10,
                  border: "1px dashed var(--line-2)",
                  background: "rgba(255,255,255,0.015)",
                  color: "var(--ink-3)",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                No comments yet. Add the first one below.
              </div>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      className="mf-mono"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: "0.12em",
                        color: "var(--ink-3)",
                        textTransform: "uppercase",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.author ?? "ANON"} · {relativeTimeShort(c.created_at)}
                    </span>
                    <button
                      onClick={() => removeComment(c.id)}
                      aria-label="Delete comment"
                      title="Delete"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ink-4)",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 10,
                      }}
                    >
                      <IconClose size={10} />
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--ink-1)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {c.text}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Leave a comment on this scene…"
              rows={3}
              disabled={submitting}
              style={{
                resize: "vertical",
                minHeight: 64,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--line)",
                color: "var(--ink-1)",
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.5,
                outline: "none",
              }}
            />
            {error && (
              <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>{error}</div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                className="mf-mono"
                style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.1em" }}
              >
                ⌘+ENTER
              </span>
              <button
                onClick={() => void submit()}
                disabled={submitting || !draft.trim()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "rgba(122,162,255,0.16)",
                  border: "1px solid rgba(122,162,255,0.45)",
                  color: "var(--ink-1)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting || !draft.trim() ? 0.6 : 1,
                }}
              >
                {submitting ? "Posting…" : "Add comment"}
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
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
