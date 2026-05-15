-- MotionGlass — AI Film Direction schema (v1)
-- Run in the Supabase SQL editor. Idempotent where possible.

create extension if not exists pgcrypto;

do $$ begin
  create type job_status as enum (
    'pending', 'directing', 'rendering', 'completed', 'failed', 'canceled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type shot_status as enum (
    'pending', 'generating', 'ready', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type clip_status as enum (
    'pending', 'generating', 'ready', 'failed', 'skipped'
  );
exception when duplicate_object then null; end $$;

create table if not exists jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid,
  script              text not null,
  product_description text,
  brand_style         text,
  title               text,
  status              job_status not null default 'pending',
  shot_count          int,
  director_model      text,
  image_model         text default 'black-forest-labs/flux-1.1-pro-ultra',
  video_model         text default 'kwaivgi/kling-v1.6-pro',
  director_raw        jsonb,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  music_track_id      text,
  music_url           text,
  music_title         text,
  music_artist        text,
  sfx_id              text,
  sfx_url             text,
  sfx_name            text,
  sfx_author          text,
  sfx_license         text
);

create index if not exists jobs_user_created_idx on jobs (user_id, created_at desc);
create index if not exists jobs_status_idx on jobs (status)
  where status in ('pending', 'directing', 'rendering');

create table if not exists shots (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id) on delete cascade,
  shot_index      int not null,
  duration        numeric(5,2) not null,
  narration_part  text,
  shot_goal       text,
  visual_style    text,
  image_prompt    text not null,
  video_prompt    text,
  negative_prompt text,
  composition     text,
  focal_point     text,
  camera_motion   text,
  lighting        text,
  transition_out  text,
  ui_density      text,
  text_overlay    text,
  color_palette   text,
  status            shot_status not null default 'pending',
  image_url         text,
  storage_path      text,
  replicate_id      text,
  error             text,
  clip_status       clip_status not null default 'pending',
  clip_url          text,
  clip_storage_path text,
  clip_replicate_id text,
  clip_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (job_id, shot_index)
);

-- Idempotent column additions for existing installs.
alter table jobs
  add column if not exists video_model text default 'kwaivgi/kling-v1.6-pro',
  add column if not exists continuity  jsonb,
  add column if not exists film_mode   text default 'motion_design',
  add column if not exists final_video_status text default 'idle',
  add column if not exists final_video_url text,
  add column if not exists final_video_storage_path text,
  add column if not exists final_video_duration numeric(6,2),
  add column if not exists final_video_error text,
  add column if not exists final_video_built_at timestamptz,
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_storage_path text,
  add column if not exists brand_colors jsonb;

alter table shots
  add column if not exists clip_status clip_status not null default 'pending',
  add column if not exists clip_url text,
  add column if not exists clip_storage_path text,
  add column if not exists clip_replicate_id text,
  add column if not exists clip_error text,
  -- clip_started_at is set when clip_status flips to 'generating' and cleared
  -- on every other terminal transition. Used by the orphan reaper in
  -- app/lib/jobs.ts to recover from dev-server restarts mid-render.
  add column if not exists clip_started_at timestamptz,
  add column if not exists shot_type text,
  add column if not exists subject text,
  add column if not exists ui_description text,
  add column if not exists ui_motion text,
  add column if not exists lighting_motion text,
  add column if not exists depth_cue text,
  add column if not exists atmosphere text,
  add column if not exists pacing text,
  add column if not exists intent text,
  add column if not exists domain text,
  add column if not exists grounding jsonb,
  add column if not exists visual_anchors jsonb,
  add column if not exists motion_anchors jsonb,
  add column if not exists style_notes text,
  add column if not exists validation_passed boolean,
  add column if not exists validation_warnings text,
  add column if not exists validation_attempts int default 0;

-- Mark already-completed shots as 'skipped' so their UI doesn't show clip:pending forever.
update shots set clip_status = 'skipped'
  where clip_status = 'pending'
    and status = 'ready'
    and clip_url is null;

create index if not exists shots_job_idx on shots (job_id, shot_index);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

drop trigger if exists shots_set_updated_at on shots;
create trigger shots_set_updated_at
  before update on shots
  for each row execute function set_updated_at();

-- RLS disabled — all DB access flows through our server using the
-- service-role key; the anon key is never exposed client-side. Re-enable
-- once we expose any of these tables to anon/authenticated clients.
alter table jobs  disable row level security;
alter table shots disable row level security;
-- When you do enable it later, add per-user policies like:
--   create policy "users read own jobs" on jobs for select
--     to authenticated using (auth.uid() = user_id);
--   create policy "users insert own jobs" on jobs for insert
--     to authenticated with check (auth.uid() = user_id);
