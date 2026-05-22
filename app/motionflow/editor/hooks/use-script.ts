import { useEffect, useRef, useState } from "react";
import type { JobRow } from "../types";

const DEFAULT_SCRIPT = `Introduce your product in one line.
Show the feature that matters most.
Give viewers the reason to care.
End with a clear call to action.`;

export type AudioTracksState = {
  voiceover: boolean;
  music: boolean;
  sfx: boolean;
};

export type AudioTrackKey = keyof AudioTracksState;

const DEFAULT_AUDIO_TRACKS: AudioTracksState = {
  voiceover: false,
  music: false,
  sfx: false,
};

export function useScript({
  empty,
  initialJobId,
  job,
  onGenerate,
}: {
  empty: boolean;
  initialJobId: string | null | undefined;
  job: JobRow | null;
  onGenerate: () => void;
}) {
  // When opening an existing project we start blank and let the hydrate
  // effect below fill in `job.script` once the job row loads. Only the
  // empty/new-project flow uses the placeholder copy.
  const [script, setScript] = useState<string>(
    empty || initialJobId ? "" : DEFAULT_SCRIPT,
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

  // Per-track audio toggles read once at Generate time. Default all OFF
  // so a fresh session opts into audio explicitly (matches the DB default
  // on jobs.audio_*_enabled). Hydrated from the job row on load so re-
  // opening a project shows the toggles in the state they were generated
  // with — informational only after the job leaves "pending".
  const [audioTracks, setAudioTracks] =
    useState<AudioTracksState>(DEFAULT_AUDIO_TRACKS);
  const setAudioTrack = (key: AudioTrackKey, value: boolean) =>
    setAudioTracks((prev) => ({ ...prev, [key]: value }));

  // Hydrate the script field + audio toggles from the saved job row once
  // per job. Gated so polling doesn't clobber the user's in-progress edits.
  useEffect(() => {
    if (!job) return;
    if (scriptHydratedJobIdRef.current === job.id) return;
    if (typeof job.script === "string") setScript(job.script);
    setAudioTracks({
      voiceover: job.audio_voiceover_enabled ?? false,
      music: job.audio_music_enabled ?? false,
      sfx: job.audio_sfx_enabled ?? false,
    });
    scriptHydratedJobIdRef.current = job.id;
  }, [job]);

  // Cmd/Ctrl+Enter triggers generate. We keep `onGenerate` in a ref so the
  // listener captures the freshest closure without re-binding the listener
  // on every render (which would also re-trigger the eslint dep warning
  // suppressed by the inline disable).
  const onGenerateRef = useRef(onGenerate);
  useEffect(() => {
    onGenerateRef.current = onGenerate;
  }, [onGenerate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onGenerateRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return {
    script,
    setScript,
    openSections,
    toggleSection,
    audioTracks,
    setAudioTrack,
  };
}
