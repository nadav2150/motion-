-- Per-track audio toggles. Replaces the single jobs.audio_auto_enabled flag
-- (added in 20260530_audio_direction.sql) with three independent booleans so
-- the editor can opt into voiceover / music / SFX separately. All default
-- false — a job only generates audio for tracks the user explicitly enabled
-- at Generate time. The audio_direction stage in app/lib/jobs.ts is skipped
-- entirely when all three are false.

alter table jobs drop column if exists audio_auto_enabled;

alter table jobs
  add column if not exists audio_voiceover_enabled boolean not null default false,
  add column if not exists audio_music_enabled boolean not null default false,
  add column if not exists audio_sfx_enabled boolean not null default false;
