import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Lock, Pencil } from "lucide-react";
import type { ExportQuality, ExportResolution, StudioJobView } from "../../lib/studio/types";
import { api, ApiError, isMockMode, isStudioJob } from "./api";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Select, Toggle } from "./controls";
import { Badge, ProgressBar } from "./Card";
import { Thumb } from "./VideoCard";
import { toast } from "./Toast";
import { cn } from "./format";

type Phase = "options" | "rendering" | "ready" | "failed";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-paper">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-silver">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function ExportModal({
  open,
  onClose,
  onEditAgain,
  job,
  revision,
  planTier,
  onJobUpdate,
}: {
  open: boolean;
  onClose: () => void;
  onEditAgain: () => void;
  job: StudioJobView;
  revision: number;
  planTier: string | null;
  onJobUpdate?: (j: StudioJobView) => void;
}) {
  const isFree = !planTier || planTier === "free";
  const hasVoice = !!job.audio.voiceover || !!job.voiceId;
  const [resolution, setResolution] = useState<ExportResolution>("1080p");
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [subtitles, setSubtitles] = useState(false);
  const [voice, setVoice] = useState(hasVoice);
  const [watermark, setWatermark] = useState(isFree);
  const [phase, setPhase] = useState<Phase>("options");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rev = job.revisions.find((r) => r.revision === revision);

  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    setError(null);
    setPhase(rev?.renderStatus === "rendering" || rev?.renderStatus === "queued" ? "rendering" : "options");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (phase === "rendering" && !pollRef.current) startPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const triggerDownload = () => {
    if (isMockMode()) {
      toast("Mock mode: the MP4 download would start now.", "info");
      return;
    }
    const a = document.createElement("a");
    a.href = api.downloadUrl(job.id, revision);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const j = await api.getJob(job.id);
        if (!isStudioJob(j)) return;
        onJobUpdate?.(j);
        const r = j.revisions.find((x) => x.revision === revision);
        if (j.stage === "rendering" || j.stage === "mixing_audio") setProgress(j.progress);
        if (r?.renderStatus === "ready") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setProgress(1);
          setPhase("ready");
          triggerDownload();
        } else if (r?.renderStatus === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setError(r.renderError ?? "The export failed. Try again.");
          setPhase("failed");
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
  }

  const start = async () => {
    setError(null);
    if (rev?.renderStatus === "ready") {
      setPhase("ready");
      triggerDownload();
      return;
    }
    try {
      setProgress(0);
      setPhase("rendering");
      const r = await api.render(job.id, {
        revision,
        resolution,
        quality,
        includeSubtitles: subtitles,
        includeVoiceover: hasVoice && voice,
        watermark: isFree ? true : watermark,
      });
      if (r.renderStatus === "ready") {
        setPhase("ready");
        triggerDownload();
        return;
      }
      startPolling();
    } catch (e) {
      setPhase("failed");
      setError(
        e instanceof ApiError && e.isPaymentRequired
          ? "You don't have enough credits to export this video."
          : e instanceof Error
            ? e.message
            : "Export failed",
      );
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Video" hideTitle size="lg">
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div>
          <Thumb src={rev?.thumbUrl ?? job.thumbUrl} alt="" duration={job.duration} showPlay={false} eager />
          <p className="mt-3 truncate text-sm font-semibold text-paper">{job.title ?? "Untitled video"}</p>
          <p className="mt-0.5 text-xs text-silver">
            Version {revision} · {job.format === "match" ? "Custom" : job.format} · {job.width}×{job.height}
          </p>
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-paper">Export Video</h2>
          <p className="mt-1 text-sm text-silver">Choose your settings and download your video.</p>

          {phase === "options" || phase === "failed" ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-[1.3fr_1.2fr_1fr]">
                <Select
                  label="Format"
                  hideLabel={false}
                  value="mp4"
                  onChange={() => {}}
                  options={[{ value: "mp4", label: "MP4 (Recommended)" }]}
                />
                <Select
                  label="Resolution"
                  hideLabel={false}
                  value={resolution}
                  onChange={(v) => setResolution(v as ExportResolution)}
                  options={[
                    { value: "720p", label: "720p" },
                    { value: "1080p", label: "1080p (Full HD)" },
                    { value: "4k", label: isFree ? "4K — Pro" : "4K", disabled: isFree },
                  ]}
                />
                <Select
                  label="Quality"
                  hideLabel={false}
                  value={quality}
                  onChange={(v) => setQuality(v as ExportQuality)}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "high", label: "High" },
                  ]}
                />
              </div>
              {isFree && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-silver">
                  <Badge tone="coral">Pro</Badge> 4K export is available on paid plans.
                </p>
              )}
              <div className="mt-4 divide-y divide-slate/35 rounded-xl border border-slate/40 bg-ink-800 px-4">
                <Row label="Include subtitles" hint="Captions burned in from the voiceover timing">
                  <Toggle checked={subtitles} onChange={setSubtitles} label="Include subtitles" disabled={!hasVoice} />
                </Row>
                <Row label="Include voice over" hint={hasVoice ? undefined : "This video has no voiceover"}>
                  <Toggle checked={hasVoice && voice} onChange={setVoice} label="Include voice over" disabled={!hasVoice} />
                </Row>
                <Row label="Watermark" hint={isFree ? "Always on for the Free plan — upgrade to remove it" : undefined}>
                  <span className="flex items-center gap-2">
                    {isFree && <Lock className="size-3.5 text-silver" aria-label="Locked" />}
                    <Toggle checked={isFree ? true : watermark} onChange={setWatermark} label="Watermark" disabled={isFree} />
                  </span>
                </Row>
              </div>
              {error && (
                <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-paper">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-slate/40 bg-ink-800 p-5" aria-live="polite">
              {phase === "rendering" ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-paper">
                      {job.stage === "mixing_audio" ? "Mixing audio…" : "Rendering your video…"}
                    </span>
                    <span className="font-semibold tabular-nums text-coral">{Math.round(progress * 100)}%</span>
                  </div>
                  <ProgressBar value={progress} className="mt-3 h-2" label="Export progress" />
                  <p className="mt-3 text-xs text-silver">
                    Rendering takes a few minutes. You can close this window — the export keeps going.
                  </p>
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ready" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-paper">Your video is ready</p>
                    <p className="mt-1 text-xs text-silver">
                      The download should start automatically.{" "}
                      <button type="button" onClick={triggerDownload} className="font-semibold text-coral hover:underline">
                        Download again
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={cn("mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end")}>
            <Button variant="secondary" icon={<Pencil className="size-4" aria-hidden />} onClick={onEditAgain}>
              Edit again
            </Button>
            {phase === "ready" ? (
              <Button onClick={onClose}>Done</Button>
            ) : (
              <Button
                icon={<Download className="size-4" aria-hidden />}
                onClick={() => void start()}
                loading={phase === "rendering"}
                data-autofocus
              >
                {phase === "rendering" ? "Exporting…" : "Download"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
