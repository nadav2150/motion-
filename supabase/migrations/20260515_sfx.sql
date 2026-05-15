-- SFX per project (Freesound selection).
-- Stored on the job row directly: each project gets a single selected sound effect.
-- License is stored so attribution can be surfaced when CC-BY is involved.

alter table jobs
  add column if not exists sfx_id text,
  add column if not exists sfx_url text,
  add column if not exists sfx_name text,
  add column if not exists sfx_author text,
  add column if not exists sfx_license text;
