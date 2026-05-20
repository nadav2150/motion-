import { useEffect, useRef, useState } from "react";
import { TERMINAL } from "../constants";
import type { JobResponse, JobRow, JobStatus, ShotRow } from "../types";

export type GeneratePayload = {
  script: string;
  brandLogoUrl: string | null;
  brandLogoStoragePath: string | null;
  brandColors: string[] | null;
  // Per-track audio opt-in flags. Read once at Generate time and persisted
  // on the job row; drive the audio_direction stage gate server-side.
  audioTracks: {
    voiceover: boolean;
    music: boolean;
    sfx: boolean;
  };
};

export function useJob({
  initialJobId,
}: {
  initialJobId: string | null | undefined;
}) {
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

  const handleGenerate = async (payload: GeneratePayload) => {
    const trimmed = payload.script.trim();
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
          brandLogoUrl: payload.brandLogoUrl,
          brandLogoStoragePath: payload.brandLogoStoragePath,
          brandColors: payload.brandColors,
          audioTracks: payload.audioTracks,
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

  // Poll the job + shots while there's work in flight. Stops as soon as
  // the job status is in TERMINAL AND no shot has work pending. Bumping
  // `pollNonce` resumes polling after a terminal pause (e.g. scenes_ready
  // → click Export → resume polling for the render+stitch phase).
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
        if (TERMINAL.includes(data.job.status as JobStatus) && !anyShotInFlight) {
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

  // Auto-clear retrying / generatingClips sets once the underlying shot is
  // no longer in-flight, so spinners turn off even when the API didn't
  // explicitly resolve our handler (e.g. polling caught a finished state).
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

  return {
    jobId,
    setJobId,
    job,
    setJob,
    shots,
    setShots,
    generating,
    error,
    setError,
    selected,
    setSelected,
    previewShotId,
    setPreviewShotId,
    retrying,
    generatingClips,
    pollNonce,
    setPollNonce,
    handleGenerate,
    handleRetry,
    handleGenerateClip,
  };
}
