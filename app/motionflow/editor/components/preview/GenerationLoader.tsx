import { useEffect, useState } from "react";
import { IconLogo } from "../../../primitives";
import type { JobStatus } from "../../types";

// Full-pipeline loading screen shown in the preview area from job creation
// until the final video is ready. Replaces the bare "DIRECTING SHOTS…" card
// — same surface, but persists across every pipeline stage (directing,
// asset planning, audio direction, scene generation, vision critique,
// refining, rendering, stitching) so the user sees one continuous loading
// experience from script to video.
//
// The Videly logo sits in a gradient-glow tile with a rotating conic halo
// behind it. Below: current stage label, friendlier title/sub copy, and a
// live "~N min remaining" estimate that decrements every second.

type StageMeta = { title: string; sub: string; phase: number };

const STAGE_META: Record<JobStatus, StageMeta> = {
  pending: {
    title: "Warming up the Director",
    sub: "Reserving credits and queueing the pipeline.",
    phase: 1,
  },
  directing: {
    title: "Directing your shots",
    sub: "Splitting the script into cinematic beats and writing image prompts.",
    phase: 2,
  },
  asset_planning: {
    title: "Planning visual assets",
    sub: "Deciding what imagery each scene needs.",
    phase: 3,
  },
  audio_direction: {
    title: "Scoring the film",
    sub: "Choosing music, voiceover, and sound effects.",
    phase: 4,
  },
  generating_scenes: {
    title: "Building each scene",
    sub: "Filling in motion, layout, and visual details for every shot.",
    phase: 5,
  },
  vision_critique: {
    title: "Critiquing every frame",
    sub: "Reviewing visuals and flagging weak scenes.",
    phase: 6,
  },
  refining_scenes: {
    title: "Polishing scenes",
    sub: "Applying critique feedback to weak shots.",
    phase: 6,
  },
  rendering: {
    title: "Rendering the film",
    sub: "Generating final visuals for every scene.",
    phase: 7,
  },
  rendering_scenes: {
    title: "Rendering scenes",
    sub: "Generating final visuals for every scene.",
    phase: 7,
  },
  stitching: {
    title: "Stitching the final cut",
    sub: "Combining every scene into one video.",
    phase: 8,
  },
  scenes_ready: { title: "", sub: "", phase: 0 },
  completed: { title: "", sub: "", phase: 0 },
  failed: { title: "", sub: "", phase: 0 },
  canceled: { title: "", sub: "", phase: 0 },
};

const TOTAL_PHASES = 8;

// Rough end-to-end expected duration in seconds. Roughly 90s overhead +
// ~75s per scene covering both the Opus director/blueprint/scene-fill
// chain and the Replicate render once the user clicks Export. Used only
// for the live "~N min remaining" countdown — when the wall-clock passes
// the estimate we fall back to "Almost there…" rather than showing
// negative numbers.
const expectedTotalSeconds = (sceneCount: number) =>
  90 + Math.max(1, sceneCount) * 75;

function formatRemaining(seconds: number): string {
  if (seconds <= 5) return "ALMOST THERE…";
  if (seconds < 60) return `~${Math.ceil(seconds)}S REMAINING`;
  const m = Math.ceil(seconds / 60);
  return `~${m} MIN${m === 1 ? "" : "S"} REMAINING`;
}

export const GenerationLoader = ({
  status,
  jobCreatedAt,
  expectedSceneCount,
}: {
  status: JobStatus;
  jobCreatedAt: string | null;
  expectedSceneCount: number;
}) => {
  const meta = STAGE_META[status] ?? STAGE_META.pending;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!jobCreatedAt) return;
    const start = new Date(jobCreatedAt).getTime();
    if (!Number.isFinite(start)) return;
    const tick = () =>
      setElapsed(Math.max(0, (Date.now() - start) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [jobCreatedAt]);

  const total = expectedTotalSeconds(expectedSceneCount);
  const remaining = Math.max(0, total - elapsed);
  const remainingLabel = formatRemaining(remaining);
  const phaseLabel = `STEP ${Math.max(1, meta.phase)} / ${TOTAL_PHASES}`;

  return (
    <div
      style={{
        // Absolute-fill the preview pane (which is position: relative).
        // Using absolute + inset:0 instead of flex:1 so the loader is
        // always perfectly centered regardless of whatever else the
        // section flex-column is rendering (bloom backdrop, future siblings).
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: "40px 28px",
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes mfLoaderHalo {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes mfLoaderPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50%      { transform: translate(-50%, -50%) scale(1.06); }
        }
        @keyframes mfLoaderGlow {
          0%, 100% { box-shadow: 0 0 60px 10px rgba(122,162,255,0.40), inset 0 1px 0 rgba(255,255,255,0.10); }
          50%      { box-shadow: 0 0 96px 20px rgba(167,139,250,0.55), inset 0 1px 0 rgba(255,255,255,0.10); }
        }
        @keyframes mfLoaderDot {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          textAlign: "center",
          maxWidth: 480,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo tile with rotating conic halo */}
        <div
          style={{
            position: "relative",
            width: 180,
            height: 180,
            margin: "0 auto 26px",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background:
                "conic-gradient(from 0deg, rgba(122,162,255,0.55), rgba(167,139,250,0.20), rgba(103,232,249,0.55), rgba(122,162,255,0.55))",
              filter: "blur(34px)",
              animation: "mfLoaderHalo 5s linear infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 112,
              height: 112,
              borderRadius: 26,
              background:
                "linear-gradient(180deg, rgba(122,162,255,0.20), rgba(167,139,250,0.10))",
              border: "1px solid rgba(122,162,255,0.40)",
              display: "grid",
              placeItems: "center",
              animation:
                "mfLoaderPulse 2.4s ease-in-out infinite, mfLoaderGlow 2.4s ease-in-out infinite",
            }}
          >
            <IconLogo size={64} />
          </div>
        </div>

        <div
          className="mf-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "#7AA2FF",
            marginBottom: 12,
          }}
        >
          {phaseLabel}
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            lineHeight: 1.2,
            background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {meta.title}
          <span
            style={{ display: "inline-block", marginLeft: 4, color: "#A78BFA" }}
          >
            <span style={{ animation: "mfLoaderDot 1.4s ease-in-out 0s infinite" }}>
              .
            </span>
            <span style={{ animation: "mfLoaderDot 1.4s ease-in-out 0.2s infinite" }}>
              .
            </span>
            <span style={{ animation: "mfLoaderDot 1.4s ease-in-out 0.4s infinite" }}>
              .
            </span>
          </span>
        </h2>

        <p
          style={{
            margin: "12px 0 0",
            fontSize: 13.5,
            color: "var(--ink-3)",
            lineHeight: 1.55,
            maxWidth: 380,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {meta.sub}
        </p>

        {/* Phase progress dots */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            gap: 6,
            justifyContent: "center",
          }}
        >
          {Array.from({ length: TOTAL_PHASES }, (_, i) => {
            const stepIndex = i + 1;
            const active = stepIndex === meta.phase;
            const done = stepIndex < meta.phase;
            return (
              <span
                key={i}
                style={{
                  width: active ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: done
                    ? "rgba(122,162,255,0.55)"
                    : active
                      ? "linear-gradient(90deg, #7AA2FF, #A78BFA)"
                      : "rgba(255,255,255,0.08)",
                  transition: "width 240ms ease",
                }}
              />
            );
          })}
        </div>

        <div
          className="mf-mono"
          style={{
            marginTop: 22,
            fontSize: 11,
            letterSpacing: "0.14em",
            color: "var(--ink-2)",
          }}
        >
          {remainingLabel}
        </div>
      </div>
    </div>
  );
};
