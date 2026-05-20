import { useState, type ReactNode } from "react";
import {
  IconChevron,
  IconSparkle,
  IconWand,
  Pill,
} from "../../primitives";
import { STATUS_TONE } from "../constants";
import type {
  ActionButtonTone,
  DisplayStatus,
  GroundingShape,
  JobStatus,
  MotionPair,
  MotionRecipeShape,
} from "../types";

export const GenerateButton = ({
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

export const AccordionSection = ({
  label,
  badge,
  open,
  onToggle,
  disabled = false,
  headerControl,
  children,
}: {
  label: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  // Optional inline control rendered at the right edge of the header
  // (after the badge). Pointer events on this node do NOT bubble to the
  // expand/collapse button — the audio sidebars rely on this so toggling
  // the per-track switch doesn't also flip the accordion open/closed.
  headerControl?: ReactNode;
  children: ReactNode;
}) => (
  <div
    style={{
      borderBottom: "1px solid var(--line)",
      opacity: disabled ? 0.55 : 1,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 2px",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
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
      {headerControl !== undefined && headerControl !== null && (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
        >
          {headerControl}
        </span>
      )}
    </div>
    {open && <div style={{ padding: "4px 2px 16px" }}>{children}</div>}
  </div>
);

export const ComingSoonPanel = ({
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

export const StatusPill = ({ status }: { status: JobStatus }) => {
  const meta = STATUS_TONE[status];
  return (
    <Pill tone={meta.tone} icon={<span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />}>
      <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>
        {meta.label}
      </span>
    </Pill>
  );
};

export const ShotStatusChip = ({ display }: { display: { status: DisplayStatus; label: string } }) => {
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

export const ActionButton = ({
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

export const TransportBtn = ({
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

export const EmptyState = ({ f }: { f: number }) => (
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

export const InspectorSection = ({ label }: { label: string }) => (
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

export const InspectorRow = ({
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

export const GroundingRows = ({ grounding }: { grounding: unknown }) => {
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

export const AnchorList = ({ label, anchors }: { label: string; anchors: unknown }) => {
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

export const MotionPairRow = ({ tier, pair }: { tier: string; pair: MotionPair | undefined }) => {
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

export const MotionAnchorList = ({ anchors }: { anchors: unknown }) => {
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
