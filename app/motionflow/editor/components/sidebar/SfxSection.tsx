import { IconWave } from "../../../primitives";
import { SfxPicker, type CurrentSfx } from "../../../SfxPicker";
import { AccordionSection, ComingSoonPanel } from "../shared";
import type { JobRow } from "../../types";

export const SfxSection = ({
  open,
  onToggle,
  jobId,
  job,
  setJob,
}: {
  open: boolean;
  onToggle: () => void;
  jobId: string | null;
  job: JobRow | null;
  setJob: React.Dispatch<React.SetStateAction<JobRow | null>>;
}) => (
  <AccordionSection
    label="SFX"
    badge={
      job?.sfx_name
        ? job.sfx_name.length > 18
          ? `${job.sfx_name.slice(0, 18)}…`
          : job.sfx_name
        : "—"
    }
    open={open}
    onToggle={onToggle}
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
);
