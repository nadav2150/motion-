import { useEffect, useRef, useState } from "react";
import type { JobRow } from "../types";

const DEFAULT_SCRIPT = `Meet Lattice — the OS for high-performing teams.
Built for teams that ship.
From goals to growth, every conversation lives here.
Start free. Ship faster.`;

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

  // Hydrate the script field from the saved job row once per job. Gated so
  // polling doesn't clobber the user's in-progress edits.
  useEffect(() => {
    if (!job) return;
    if (scriptHydratedJobIdRef.current === job.id) return;
    if (typeof job.script === "string") setScript(job.script);
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

  return { script, setScript, openSections, toggleSection };
}
