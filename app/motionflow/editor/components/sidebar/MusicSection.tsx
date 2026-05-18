import { IconMusic } from "../../../primitives";
import { MusicPicker, type CurrentMusic } from "../../../MusicPicker";
import { AccordionSection, ComingSoonPanel } from "../shared";
import type { JobRow, ShotRow } from "../../types";

// audio_direction column holds { plan, resolved } when the auto-audio
// pipeline ran on this job. We use resolved.bgMusic.trackId to detect
// whether the current music_track_id is still the LLM's pick (✨ AUTO).
function getAutoBgTrackId(job: JobRow | null): string | null {
  const ad = job?.audio_direction as { resolved?: { bgMusic?: { trackId?: unknown } } } | null;
  const id = ad?.resolved?.bgMusic?.trackId;
  return typeof id === "string" ? id : null;
}

export const MusicSection = ({
  open,
  onToggle,
  jobId,
  job,
  shots,
  setJob,
  setShots,
}: {
  open: boolean;
  onToggle: () => void;
  jobId: string | null;
  job: JobRow | null;
  shots: ShotRow[];
  setJob: React.Dispatch<React.SetStateAction<JobRow | null>>;
  setShots: React.Dispatch<React.SetStateAction<ShotRow[]>>;
}) => {
  const autoTrackId = getAutoBgTrackId(job);
  const isAuto = !!autoTrackId && job?.music_track_id === autoTrackId;
  const titleText = job?.music_title
    ? job.music_title.length > 18
      ? `${job.music_title.slice(0, 18)}…`
      : job.music_title
    : "—";
  return (
  <AccordionSection
    label="MUSIC"
    badge={isAuto ? `✨ ${titleText}` : titleText}
    open={open}
    onToggle={onToggle}
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
  );
};
