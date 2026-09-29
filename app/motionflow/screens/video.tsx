// /videos/:id — the studio screen: player (or generation progress), versions,
// timeline strip, edit prompt bar and the Export modal.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Check,
  Download,
  Loader2,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  SendHorizontal,
  Type,
  X,
} from "lucide-react";
import type { StudioJobView, StudioRevision, StudioStage } from "../../lib/studio/types";
import { STAGE_LABELS } from "../../lib/studio/types";
import { api, ApiError, GENERATING_STAGES, isStudioJob } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button, IconButton, focusRing } from "../ui/Button";
import { Card, ProgressBar, Skeleton } from "../ui/Card";
import { ExportModal } from "../ui/ExportModal";
import { PreviewPlayer, usePreviewController } from "../ui/Player";
import { toast } from "../ui/Toast";
import { cn, timeAgo } from "../ui/format";

const TERMINAL: StudioStage[] = ["preview_ready", "done", "failed"];

function isBusy(j: StudioJobView) {
  return GENERATING_STAGES.has(j.stage);
}
function needsPoll(j: StudioJobView) {
  return !TERMINAL.includes(j.stage) || j.revisions.some((r) => r.renderStatus === "queued" || r.renderStatus === "rendering");
}

function stagePlan(j: StudioJobView): StudioStage[] {
  const s: StudioStage[] = [];
  if (j.referenceVideoUrl) s.push("analyzing_reference");
  s.push("planning");
  if (j.voiceId) s.push("voiceover");
  s.push("assets", "writing", "validating", "reviewing", "preview_ready");
  return s;
}

function ProgressPanel({ job }: { job: StudioJobView }) {
  const stages = stagePlan(job);
  const cur = job.stage === "queued" ? -1 : stages.indexOf(job.stage);
  const pct = Math.round(job.progress * 100);
  return (
    <div className="flex aspect-video w-full flex-col justify-center rounded-2xl border border-slate/40 bg-[radial-gradient(90%_120%_at_85%_0%,rgb(239_131_84/0.14),transparent_60%),linear-gradient(180deg,#2d3142,#262a38)] p-5 sm:p-10">
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">Creating your video</p>
        <h2 className="mt-2 text-xl font-semibold text-paper sm:text-2xl" aria-live="polite">
          {job.stageLabel || STAGE_LABELS[job.stage]}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar value={job.progress} className="h-2 flex-1" label="Generation progress" />
          <span className="w-11 text-right text-sm font-semibold tabular-nums text-coral">{pct}%</span>
        </div>
        <ol className="mt-5 hidden space-y-2.5 sm:block">
          {stages.map((st, i) => {
            const done = i < cur;
            const active = i === cur;
            return (
              <li key={st} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    done && "bg-coral text-white",
                    active && "border-2 border-coral",
                    !done && !active && "border border-slate",
                  )}
                  aria-hidden
                >
                  {done && <Check className="size-3" strokeWidth={3} />}
                  {active && <span className="size-1.5 rounded-full bg-coral vd-pulse" />}
                </span>
                <span className={cn(done ? "text-silver" : active ? "font-semibold text-paper" : "text-silver/60")}>
                  {STAGE_LABELS[st]}
                </span>
                <span className="sr-only">{done ? "done" : active ? "in progress" : "pending"}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-xs text-silver">Most videos take 3–6 minutes. You can leave this page — we'll keep working.</p>
      </div>
    </div>
  );
}

function VersionItem({
  rev,
  selected,
  onSelect,
  current,
}: {
  rev: StudioRevision;
  selected: boolean;
  onSelect: () => void;
  current: boolean;
}) {
  const label =
    rev.kind === "initial" ? "First version" : rev.kind === "regenerate" ? "Regenerated" : rev.kind === "review" ? "Polished" : rev.instruction ?? "Edit";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors",
        selected ? "border-coral bg-coral/10" : "border-slate/40 bg-ink-800 hover:border-slate",
        focusRing,
      )}
    >
      <div className="relative aspect-video w-[88px] shrink-0 overflow-hidden rounded-lg bg-ink-900">
        {rev.thumbUrl && <img src={rev.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-paper">
          V{rev.revision}
          {current && <span className="rounded bg-slate/60 px-1 text-[10px] font-semibold uppercase text-silver">Current</span>}
        </p>
        <p className="truncate text-xs text-silver" title={label}>
          {label}
        </p>
        <p className="text-xs text-silver/70">{timeAgo(rev.createdAt)}</p>
      </div>
    </button>
  );
}

function TimelineStrip({
  jobId,
  rev,
  time,
  duration,
  onSeek,
  hasVoice,
  hasMusic,
}: {
  jobId: string;
  rev: number;
  time: number;
  duration: number;
  onSeek: (t: number) => void;
  hasVoice: boolean;
  hasMusic: boolean;
}) {
  const [frames, setFrames] = useState<{ time: number; url: string }[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setFrames(null);
    api
      .getTimeline(jobId, rev, 12)
      .then((r) => alive && setFrames(r.frames))
      .catch(() => alive && setFrames([]));
    return () => {
      alive = false;
    };
  }, [jobId, rev]);

  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    onSeek(((clientX - r.left) / r.width) * duration);
  };

  const tracks = [
    { icon: Type, label: "Text & motion", on: true },
    { icon: Music, label: "Music", on: hasMusic },
    { icon: Captions, label: "Captions", on: hasVoice },
  ];

  return (
    <div className="mt-4 flex gap-3">
      <div className="hidden flex-col justify-between gap-1 sm:flex" aria-label="Tracks">
        {tracks.map(({ icon: Icon, label, on }) => (
          <span
            key={label}
            title={label}
            className={cn("flex size-7 items-center justify-center rounded-lg", on ? "bg-slate/45 text-paper" : "bg-ink-800 text-silver/50")}
          >
            <Icon className="size-3.5" aria-label={label} />
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        onClick={(e) => seekFromEvent(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(time + 1);
          if (e.key === "ArrowLeft") onSeek(time - 1);
        }}
        className={cn("relative h-[76px] flex-1 cursor-pointer overflow-hidden rounded-xl border border-slate/40 bg-ink-800", focusRing)}
      >
        <div className="flex h-full">
          {frames === null
            ? Array.from({ length: 12 }, (_, i) => <div key={i} className="vd-skeleton h-full flex-1 rounded-none border-r border-ink-900" />)
            : frames.map((f, i) => (
                <img
                  key={i}
                  src={f.url}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className={cn("h-full min-w-0 flex-1 border-r border-ink-900 object-cover", i >= 6 && "hidden sm:block")}
                />
              ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-coral" style={{ left: `${pct}%` }} aria-hidden>
          <span className="absolute -left-[5px] -top-1 size-3 rounded-full border-2 border-white bg-coral" />
        </div>
      </div>
    </div>
  );
}

export function VideoScreen({
  user,
  planTier,
  credits,
  jobId,
}: {
  user: ShellUser;
  planTier: string | null;
  credits: number | null;
  jobId: string;
}) {
  const navigate = useNavigate();
  const [job, setJob] = useState<StudioJobView | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [selectedRev, setSelectedRev] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  const lastRevCount = useRef(0);
  const jobRef = useRef<StudioJobView | null>(null);
  jobRef.current = job;

  const ctl = usePreviewController(job?.duration ?? 30);

  const applyJob = useCallback((j: StudioJobView) => {
    setJob(j);
    // Jump to a newly finished version automatically.
    if (j.revisions.length > lastRevCount.current) {
      if (lastRevCount.current > 0) toast(`Version ${j.revisions[j.revisions.length - 1]!.revision} is ready`);
      setSelectedRev(j.currentRevision || j.revisions[j.revisions.length - 1]!.revision);
      lastRevCount.current = j.revisions.length;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const j = await api.getJob(jobId);
      if (!isStudioJob(j)) {
        navigate(`/editor?job=${encodeURIComponent(jobId)}`, { replace: true });
        return;
      }
      applyJob(j);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 403)) setNotFound("We couldn't find this video.");
      else if (!jobRef.current) setNotFound(e instanceof Error ? e.message : "Couldn't load this video.");
    }
  }, [jobId, navigate, applyJob]);

  useEffect(() => {
    lastRevCount.current = 0;
    setJob(null);
    setSelectedRev(null);
    void load();
    const t = setInterval(() => {
      if (jobRef.current && needsPoll(jobRef.current)) void load();
    }, 2000);
    return () => clearInterval(t);
  }, [load]);

  if (notFound) {
    return (
      <AppShell user={user} planTier={planTier} credits={credits}>
        <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
          <AlertTriangle className="mx-auto size-8 text-coral" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">{notFound}</h1>
          <Link to="/videos" className="mt-4 inline-block font-semibold text-coral hover:underline">
            Back to videos
          </Link>
        </Card>
      </AppShell>
    );
  }

  const busy = job ? isBusy(job) : false;
  const failed = job?.stage === "failed";
  const revs = job?.revisions ?? [];
  const rev = revs.find((r) => r.revision === selectedRev) ?? revs[revs.length - 1] ?? null;
  const showPlayer = !!rev;

  const saveTitle = async () => {
    if (!job) return;
    const title = titleDraft.trim() || "Untitled video";
    setEditingTitle(false);
    if (title === job.title) return;
    setJob({ ...job, title });
    try {
      await api.updateVideo(job.id, { title });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't rename", "error");
    }
  };

  const regenerate = async () => {
    if (!job) return;
    try {
      await api.regenerateJob(job.id);
      toast("Generating a new version…", "info");
      void load();
    } catch (e) {
      toast(
        e instanceof ApiError && e.status === 409
          ? "This video is still working — try again when it finishes."
          : e instanceof ApiError && e.isPaymentRequired
            ? "Not enough credits for a new version."
            : e instanceof Error
              ? e.message
              : "Couldn't regenerate",
        "error",
      );
    }
  };

  const sendEdit = async () => {
    if (!job || !instruction.trim() || sending) return;
    setSending(true);
    try {
      const r = await api.editJob(job.id, instruction.trim(), rev?.revision);
      setInstruction("");
      toast(`Working on version ${r.revision}…`, "info");
      void load();
    } catch (e) {
      toast(
        e instanceof ApiError && e.status === 409
          ? "This video is still working — send your edit when it finishes."
          : e instanceof ApiError && e.isPaymentRequired
            ? "Not enough credits for this edit."
            : e instanceof Error
              ? e.message
              : "Couldn't send the edit",
        "error",
      );
    } finally {
      setSending(false);
    }
  };

  const makeCurrent = async (n: number) => {
    if (!job) return;
    try {
      const r = await api.revertJob(job.id, n);
      setJob({ ...job, currentRevision: r.currentRevision });
      toast(`Version ${n} is now current`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't switch version", "error");
    }
  };

  return (
    <AppShell user={user} planTier={planTier} credits={credits} wide>
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Link to="/videos" className={cn("inline-flex items-center gap-1.5 rounded-md text-sm text-silver hover:text-paper", focusRing)}>
            <ArrowLeft className="size-4" aria-hidden /> Back to videos
          </Link>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            {!job ? (
              <Skeleton className="h-8 w-64" />
            ) : editingTitle ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTitle();
                }}
              >
                <label htmlFor="title-input" className="sr-only">
                  Video title
                </label>
                <input
                  id="title-input"
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setEditingTitle(false)}
                  maxLength={120}
                  className={cn("h-10 min-w-0 flex-1 rounded-lg border border-slate/60 bg-ink px-3 text-xl font-bold text-paper", focusRing)}
                />
                <IconButton label="Save title" type="submit">
                  <Check className="size-5" aria-hidden />
                </IconButton>
                <IconButton label="Cancel" onClick={() => setEditingTitle(false)}>
                  <X className="size-5" aria-hidden />
                </IconButton>
              </form>
            ) : (
              <>
                <h1 className="truncate text-2xl font-bold tracking-[-0.02em] text-paper">{job.title || "Untitled video"}</h1>
                <IconButton
                  label="Rename video"
                  onClick={() => {
                    setTitleDraft(job.title ?? "");
                    setEditingTitle(true);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                </IconButton>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <Button
            variant="secondary"
            icon={<RefreshCw className="size-4" aria-hidden />}
            onClick={() => void regenerate()}
            disabled={!job || busy}
          >
            Re-generate
          </Button>
          <Button icon={<Download className="size-4" aria-hidden />} onClick={() => setExportOpen(true)} disabled={!rev}>
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {!job ? (
            <Skeleton className="aspect-video w-full rounded-2xl" />
          ) : failed && !rev ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-danger/40 bg-ink p-6 text-center">
              <AlertTriangle className="size-8 text-coral" aria-hidden />
              <h2 className="mt-3 text-lg font-semibold">This video didn't come out right</h2>
              <p className="mt-1.5 max-w-md text-sm text-silver">{job.error ?? "Something went wrong while generating."}</p>
              <Button className="mt-5" icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void regenerate()}>
                Try again
              </Button>
            </div>
          ) : !showPlayer ? (
            <ProgressPanel job={job} />
          ) : (
            <>
              {busy && (
                <div
                  role="status"
                  className="mb-3 flex items-center gap-3 rounded-xl border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm"
                >
                  <Loader2 className="size-4 shrink-0 vd-spin text-coral" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-paper">
                    Generating version {revs.length + 1} · {job.stageLabel}
                  </span>
                  <span className="font-semibold tabular-nums text-coral">{Math.round(job.progress * 100)}%</span>
                </div>
              )}
              {failed && (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm">
                  <AlertTriangle className="size-4 text-coral" aria-hidden />
                  <span className="flex-1">{job.error ?? "The last change failed."}</span>
                  <button type="button" onClick={() => void regenerate()} className="font-semibold text-coral hover:underline">
                    Try again
                  </button>
                </div>
              )}
              <PreviewPlayer
                ctl={ctl}
                jobId={job.id}
                revision={rev!.revision}
                width={job.width}
                height={job.height}
                audio={job.audio}
                poster={rev!.thumbUrl}
              />
              <TimelineStrip
                jobId={job.id}
                rev={rev!.revision}
                time={ctl.time}
                duration={ctl.duration}
                onSeek={ctl.seek}
                hasVoice={!!job.audio.voiceover || !!job.voiceId}
                hasMusic={!!job.audio.music || job.musicEnabled}
              />
            </>
          )}

          {/* Edit prompt bar */}
          <form
            className="mt-4 flex items-center gap-2 rounded-2xl border border-slate/50 bg-ink p-2 pl-4 shadow-[var(--shadow-soft)]"
            onSubmit={(e) => {
              e.preventDefault();
              void sendEdit();
            }}
          >
            <label htmlFor="edit-input" className="sr-only">
              Describe a change
            </label>
            <input
              id="edit-input"
              ref={editRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={!rev}
              maxLength={2000}
              placeholder={rev ? "Make the opening faster and add a stronger call to action" : "You can edit once the first version is ready"}
              className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-paper placeholder:text-silver/60 focus-visible:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Send edit"
              disabled={!instruction.trim() || sending || busy || !rev}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl bg-coral text-white transition-colors hover:bg-coral-400 disabled:opacity-40",
                focusRing,
              )}
            >
              {sending ? <Loader2 className="size-4 vd-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
            </button>
          </form>
          {busy && rev && <p className="mt-2 text-xs text-silver">You can send another edit when this version is ready.</p>}
        </div>

        {/* Versions */}
        <aside aria-labelledby="versions-title" className="min-w-0">
          <Card className="p-4">
            <h2 id="versions-title" className="mb-3 text-base font-semibold">
              Versions
            </h2>
            <div className="flex gap-2.5 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
              {job && busy && revs.length > 0 && (
                <div className="flex min-w-[220px] items-center gap-3 rounded-xl border border-dashed border-coral/60 bg-coral/5 p-2 xl:min-w-0">
                  <div className="flex aspect-video w-[88px] shrink-0 items-center justify-center rounded-lg bg-ink-900">
                    <Loader2 className="size-5 vd-spin text-coral" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">V{revs.length + 1}</p>
                    <p className="text-xs font-medium text-coral">Generating · {Math.round(job.progress * 100)}%</p>
                  </div>
                </div>
              )}
              {!job
                ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[66px] min-w-[220px] xl:min-w-0" />)
                : [...revs].reverse().map((r) => (
                    <div key={r.revision} className="min-w-[220px] xl:min-w-0">
                      <VersionItem
                        rev={r}
                        selected={rev?.revision === r.revision}
                        current={job.currentRevision === r.revision}
                        onSelect={() => setSelectedRev(r.revision)}
                      />
                      {rev?.revision === r.revision && job.currentRevision !== r.revision && !busy && (
                        <button
                          type="button"
                          onClick={() => void makeCurrent(r.revision)}
                          className="mt-1 px-1 text-xs font-semibold text-coral hover:underline"
                        >
                          Make this the current version
                        </button>
                      )}
                    </div>
                  ))}
              {job && revs.length === 0 && !busy && <p className="text-sm text-silver">No versions yet.</p>}
            </div>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => void regenerate()}
              disabled={!job || busy}
            >
              Generate new version
            </Button>
          </Card>
          {job?.prompt && (
            <Card className="mt-4 p-4">
              <h2 className="text-sm font-semibold">Prompt</h2>
              <p className="mt-1.5 line-clamp-5 text-sm text-silver">{job.prompt}</p>
            </Card>
          )}
        </aside>
      </div>

      {job && rev && (
        <ExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          onEditAgain={() => {
            setExportOpen(false);
            setTimeout(() => editRef.current?.focus(), 50);
          }}
          job={job}
          revision={rev.revision}
          planTier={planTier}
          onJobUpdate={setJob}
        />
      )}
    </AppShell>
  );
}
