import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppChrome,
  Button,
  Glass,
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconLink,
  IconWand,
  Pill,
  useFrame,
  type NavKey,
} from "../primitives";

type JobStatus =
  | "pending"
  | "directing"
  | "rendering"
  | "completed"
  | "failed"
  | "canceled";

type ShotStatus = "pending" | "generating" | "ready" | "failed";
type ClipStatus = "pending" | "generating" | "ready" | "failed" | "skipped";
type FinalStatus = "idle" | "building" | "ready" | "failed";

type JobRow = {
  id: string;
  title: string | null;
  status: JobStatus;
  shot_count: number | null;
  film_mode: string | null;
  final_video_status: FinalStatus | string | null;
  final_video_url: string | null;
  final_video_duration: number | null;
  final_video_built_at: string | null;
  final_video_error: string | null;
};

type ShotRow = {
  id: string;
  shot_index: number;
  duration: number;
  status: ShotStatus;
  clip_status: ClipStatus;
  clip_url: string | null;
  image_url: string | null;
  text_overlay: string | null;
};

type JobResponse = { job: JobRow; shots: ShotRow[] };

const FINAL_TERMINAL: FinalStatus[] = ["ready", "failed", "idle"];

function fmtSeconds(s: number | null | undefined): string {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const m = Math.floor(n / 60);
  const sec = Math.floor(n % 60);
  const cs = Math.floor((n - Math.floor(n)) * 100);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const FinalStatusPill = ({ status }: { status: FinalStatus | string | null | undefined }) => {
  const map: Record<string, { tone: "default" | "glow" | "success"; dot: string; label: string }> = {
    idle: { tone: "default", dot: "#7AA2FF", label: "READY TO RENDER" },
    building: { tone: "glow", dot: "#67E8F9", label: "BUILDING" },
    ready: { tone: "success", dot: "#A6F0BD", label: "FINAL READY" },
    failed: { tone: "default", dot: "#FCA5A5", label: "RENDER FAILED" },
  };
  const m = map[status ?? "idle"] ?? map.idle;
  return (
    <Pill tone={m.tone} icon={<span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot }} />}>
      <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>{m.label}</span>
    </Pill>
  );
};

export const ExportScreen = ({
  jobId,
  onNav,
  onNewProject,
  onBackToEditor,
  credits,
}: {
  jobId?: string | null;
  onNav?: (k: NavKey) => void;
  onNewProject?: () => void;
  onBackToEditor?: () => void;
  credits?: number | null;
}) => {
  const f = useFrame();
  const [job, setJob] = useState<JobRow | null>(null);
  const [shots, setShots] = useState<ShotRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        setLoadError(`Could not load job (${res.status})`);
        return;
      }
      const data = (await res.json()) as JobResponse;
      setJob(data.job);
      setShots(data.shots);
      setLoadError(null);
      if (FINAL_TERMINAL.includes((data.job.final_video_status as FinalStatus) ?? "idle")) {
        stopPolling();
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Network error");
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    void fetchJob();
    pollRef.current = setInterval(fetchJob, 2000);
    return () => stopPolling();
  }, [jobId, fetchJob]);

  const allClipsReady = useMemo(
    () => shots.length > 0 && shots.every((s) => s.clip_status === "ready" && !!s.clip_url),
    [shots],
  );
  const totalPlanned = useMemo(
    () => shots.reduce((acc, s) => acc + Number(s.duration || 0), 0),
    [shots],
  );

  const finalStatus = (job?.final_video_status as FinalStatus) ?? "idle";
  const finalUrl = job?.final_video_url ?? null;

  const handleRender = async () => {
    if (!jobId || rendering) return;
    setRendering(true);
    setRenderError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/stitch`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRenderError(data.error ?? `Render failed (${res.status})`);
        return;
      }
      // Resume polling — server will flip status to building, then ready.
      stopPolling();
      void fetchJob();
      pollRef.current = setInterval(fetchJob, 2000);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRendering(false);
    }
  };

  // No job yet → empty state.
  if (!jobId) {
    return (
      <AppChrome
        active="export"
        onNav={onNav}
        project="No job selected"
        credits={credits}
        right={<Button variant="ghost" size="sm" onClick={onNewProject}>New project</Button>}
      >
        <div className="mf-bg-bloom" />
        <div style={{ position: "relative", padding: "60px 56px", maxWidth: 720, margin: "0 auto" }}>
          <Glass style={{ padding: 32, textAlign: "center" }}>
            <div className="mf-eyebrow" style={{ marginBottom: 14 }}>NO JOB</div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>
              Start a storyboard first.
            </h2>
            <div className="mf-body" style={{ marginTop: 12, fontSize: 14, color: "var(--ink-2)" }}>
              Direct a film in the editor, then come back here to render the final cut.
            </div>
            <div style={{ marginTop: 22 }}>
              <Button variant="primary" size="md" onClick={onNewProject} iconRight={<IconArrowRight size={13} />}>
                Open editor
              </Button>
            </div>
          </Glass>
        </div>
      </AppChrome>
    );
  }

  const readyCount = shots.filter((s) => s.clip_status === "ready" && !!s.clip_url).length;

  return (
    <AppChrome
      active="export"
      onNav={onNav}
      project={job?.title ?? "Untitled launch"}
      credits={credits}
      right={
        <>
          <FinalStatusPill status={finalStatus} />
          <Button variant="ghost" size="sm" onClick={onBackToEditor}>Back to editor</Button>
          <Button variant="ghost" size="sm" onClick={onNewProject}>New project</Button>
        </>
      }
    >
      <div className="mf-bg-bloom" />
      <div style={{ position: "relative", padding: "40px 56px 80px", maxWidth: 1320, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="mf-eyebrow" style={{ marginBottom: 12 }}>STEP 04 · DELIVER</div>
            <h1 className="mf-h1" style={{ margin: 0, fontSize: 44 }}>
              {finalStatus === "ready"
                ? <>Your launch film is <span className="mf-grad-text">ready.</span></>
                : <>Render the <span className="mf-grad-text">final cut.</span></>}
            </h1>
            <div className="mf-body" style={{ marginTop: 10, fontSize: 14.5, color: "var(--ink-2)" }}>
              {readyCount}/{shots.length} clips ready · planned duration {fmtSeconds(totalPlanned)}
              {job?.final_video_duration ? ` · final ${fmtSeconds(job.final_video_duration)}` : ""}
              {job?.film_mode ? ` · ${(job.film_mode).replace(/_/g, " ")}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {finalStatus === "ready" && finalUrl ? (
              <>
                <Button variant="ghost" size="md" icon={<IconWand size={14} />} onClick={handleRender}>
                  Re-render
                </Button>
                <a
                  href={finalUrl}
                  download={`${(job?.title ?? "motionflow").replace(/[^a-zA-Z0-9_-]+/g, "-")}.mp4`}
                  style={{ textDecoration: "none" }}
                >
                  <Button variant="primary" size="md" icon={<IconDownload size={14} />}>Download MP4</Button>
                </a>
              </>
            ) : (
              <Button
                variant="primary"
                size="md"
                icon={finalStatus === "building" ? undefined : <IconWand size={14} />}
                onClick={handleRender}
              >
                {finalStatus === "building"
                  ? "Building…"
                  : finalStatus === "failed"
                    ? "Re-render"
                    : "Render final video"}
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 28 }}>
          {/* Left: preview / status */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {loadError && (
              <Glass style={{ padding: 16, borderColor: "rgba(255,107,107,0.35)" }}>
                <div className="mf-mono" style={{ fontSize: 10, color: "#FCA5A5", letterSpacing: "0.12em", marginBottom: 4 }}>
                  LOAD ERROR
                </div>
                <div style={{ fontSize: 12, color: "rgba(252,165,165,0.85)" }}>{loadError}</div>
              </Glass>
            )}

            {finalStatus === "ready" && finalUrl ? (
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", background: "rgba(0,0,0,0.5)" }}>
                <video
                  key={finalUrl}
                  src={finalUrl}
                  controls
                  playsInline
                  style={{ width: "100%", display: "block", aspectRatio: "16/9", background: "black" }}
                />
              </div>
            ) : (
              <BuildingPanel
                status={finalStatus}
                f={f}
                readyCount={readyCount}
                totalCount={shots.length}
                allClipsReady={allClipsReady}
                jobError={job?.final_video_error ?? null}
              />
            )}

            {/* Frame strip — show shot thumbnails / clip statuses */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(shots.length || 6, 8)}, 1fr)`, gap: 6 }}>
              {shots.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  style={{
                    aspectRatio: "16/9",
                    borderRadius: 6,
                    background: s.image_url ? `url(${s.image_url}) center/cover` : "linear-gradient(135deg, #1F2937, #0B0E18)",
                    border: "1px solid var(--line)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <span
                    className="mf-mono"
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 5,
                      fontSize: 8,
                      color: "rgba(255,255,255,0.85)",
                      letterSpacing: "0.06em",
                      background: "rgba(11,12,16,0.55)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    {String(s.shot_index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="mf-mono"
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 5,
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      color:
                        s.clip_status === "ready"
                          ? "#A6F0BD"
                          : s.clip_status === "generating"
                            ? "#A7E5F0"
                            : s.clip_status === "failed"
                              ? "#FCA5A5"
                              : "rgba(255,255,255,0.6)",
                      background: "rgba(11,12,16,0.55)",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    {s.clip_status === "ready" ? "CLIP" : s.clip_status === "generating" ? "RENDER" : s.clip_status === "failed" ? "FAIL" : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: details */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Glass style={{ padding: 22 }}>
              <div className="mf-eyebrow" style={{ marginBottom: 14 }}>READINESS</div>
              <RowKV k="Shots" v={`${shots.length}`} />
              <RowKV k="Clips ready" v={`${readyCount} / ${shots.length}`} />
              <RowKV k="Planned duration" v={fmtSeconds(totalPlanned)} mono />
              {job?.final_video_duration ? <RowKV k="Final duration" v={fmtSeconds(job.final_video_duration)} mono /> : null}
              {job?.film_mode ? <RowKV k="Mode" v={job.film_mode.replace(/_/g, " ")} mono /> : null}
              {job?.final_video_built_at ? (
                <RowKV k="Built" v={new Date(job.final_video_built_at).toLocaleString()} mono />
              ) : null}
            </Glass>

            {finalStatus === "failed" && job?.final_video_error && (
              <Glass style={{ padding: 22, borderColor: "rgba(255,107,107,0.35)" }}>
                <div className="mf-eyebrow" style={{ marginBottom: 10, color: "#FCA5A5" }}>RENDER FAILED</div>
                <div style={{ fontSize: 12, color: "rgba(252,165,165,0.88)", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {job.final_video_error}
                </div>
              </Glass>
            )}

            {renderError && (
              <Glass style={{ padding: 16, borderColor: "rgba(255,107,107,0.35)" }}>
                <div className="mf-mono" style={{ fontSize: 10, color: "#FCA5A5", letterSpacing: "0.12em", marginBottom: 4 }}>
                  REQUEST ERROR
                </div>
                <div style={{ fontSize: 12, color: "rgba(252,165,165,0.85)" }}>{renderError}</div>
              </Glass>
            )}

            {finalStatus === "ready" && finalUrl && (
              <Glass style={{ padding: 22 }}>
                <div className="mf-eyebrow" style={{ marginBottom: 12 }}>SHAREABLE LINK</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)" }}>
                  <IconLink size={13} style={{ color: "var(--ink-3)" }} />
                  <span className="mf-mono" style={{ flex: 1, fontSize: 11, color: "var(--ink-1)", letterSpacing: "0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {finalUrl}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(finalUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {
                        // ignore
                      }
                    }}
                    style={{
                      padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                      background: copied ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${copied ? "rgba(74,222,128,0.3)" : "var(--line-2)"}`,
                      color: copied ? "#A6F0BD" : "var(--ink-0)",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </Glass>
            )}

            {!allClipsReady && finalStatus !== "ready" && (
              <Glass style={{ padding: 22 }}>
                <div className="mf-eyebrow" style={{ marginBottom: 10 }}>STILL TO DO</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
                  {shots.length === 0
                    ? "No shots yet — direct a storyboard first."
                    : `${shots.length - readyCount} shot${shots.length - readyCount === 1 ? "" : "s"} still need a clip rendered. Go back to the editor and click "Generate clip" on each pending shot.`}
                </div>
                <div style={{ marginTop: 14 }}>
                  <Button variant="ghost" size="sm" onClick={onBackToEditor}>
                    Back to editor
                  </Button>
                </div>
              </Glass>
            )}
          </div>
        </div>
      </div>
    </AppChrome>
  );
};

const RowKV = ({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
    <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.10em" }}>{k.toUpperCase()}</span>
    <span className={mono ? "mf-mono" : undefined} style={{ fontSize: 12, color: "var(--ink-1)" }}>{v}</span>
  </div>
);

const BuildingPanel = ({
  status,
  f,
  readyCount,
  totalCount,
  allClipsReady,
  jobError,
}: {
  status: FinalStatus | string;
  f: number;
  readyCount: number;
  totalCount: number;
  allClipsReady: boolean;
  jobError: string | null;
}) => {
  const headline =
    status === "building" ? "Building your final film…"
      : status === "failed" ? "Render failed."
        : status === "ready" ? "Ready."
          : allClipsReady ? "Ready to render the final cut." : "Waiting for clips.";

  const sub =
    status === "building"
      ? "Stitching clips with transitions and uploading the master MP4. This usually takes 1–3 minutes per minute of film."
      : status === "failed"
        ? jobError ?? "Something went wrong. You can try again."
        : status === "ready"
          ? ""
          : allClipsReady
            ? "Click Render final video to stitch all clips into a single 1080p MP4."
            : `${totalCount - readyCount} of ${totalCount} clips are still pending or failed.`;

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "16/9",
        borderRadius: 14,
        border: "1px solid var(--line)",
        background:
          "linear-gradient(135deg, #1F2937 0%, #0B0E18 60%), radial-gradient(circle at 30% 25%, rgba(167,139,250,0.25), transparent 60%)",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0, opacity: 0.55,
          background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
          backgroundSize: "300% 100%",
          backgroundPosition: `${(f * 1.2) % 300}% 0`,
          transition: "background-position 60ms linear",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", textAlign: "center", padding: 40, maxWidth: 560 }}>
        {status === "building" && (
          <div
            style={{
              width: 44, height: 44, borderRadius: "50%",
              border: "3px solid rgba(122,162,255,0.25)",
              borderTopColor: "#7AA2FF",
              animation: "mf-spin-slow 1.2s linear infinite",
              margin: "0 auto 18px",
            }}
          />
        )}
        {status === "ready" && (
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.45)",
            display: "grid", placeItems: "center", color: "#A6F0BD", margin: "0 auto 18px",
          }}>
            <IconCheck size={22} stroke={2.5} />
          </div>
        )}
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.015em" }}>{headline}</h2>
        {sub && (
          <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{sub}</p>
        )}
      </div>
    </div>
  );
};
