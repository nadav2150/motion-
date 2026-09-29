-- Videly v2 ("Studio"): Opus writes the whole video as one HTML document,
-- rendered frame by frame by our own renderer (app/lib/studio/).
--
-- v2 jobs use jobs.generation_mode = 'v2' (text column, no enum change) and
-- reuse the existing job_status values:
--   directing -> generating_scenes -> vision_critique -> scenes_ready
--   -> rendering_scenes -> stitching -> completed | failed
-- jobs.stage_label carries the human text shown in the UI.

alter table jobs
  add column if not exists prompt            text,
  add column if not exists format            text,          -- '16:9' | '9:16' | '1:1' | 'match'
  add column if not exists width             int,
  add column if not exists height            int,
  add column if not exists fps               int default 30,
  add column if not exists target_duration   numeric,       -- seconds the user asked for
  add column if not exists language          text,          -- BCP-47, e.g. 'en', 'he'
  add column if not exists voice_id          text,          -- ElevenLabs voice id, null = no voiceover
  add column if not exists voiceover_enabled boolean default false,
  add column if not exists music_enabled     boolean default true,
  add column if not exists favorite          boolean default false,
  add column if not exists deleted_at        timestamptz,
  add column if not exists template_id       text,
  add column if not exists seed              int,
  add column if not exists studio_plan       jsonb,
  add column if not exists audio             jsonb,         -- { voiceover: {url, path, duration, lines[]}, music: {url, path, title} }
  add column if not exists current_revision  int default 0,
  add column if not exists stage_label       text,
  add column if not exists progress          numeric;       -- 0..1 within the whole job, for "Generating · 68%"

create index if not exists jobs_user_created_idx on jobs (user_id, created_at desc) where deleted_at is null;

-- One row per version of a v2 video (V1, V2, ...). The initial generation is
-- revision 1; the self-review pass and every chat edit add a revision.
create table if not exists job_revisions (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references jobs(id) on delete cascade,
  revision       int  not null,
  kind           text not null check (kind in ('initial', 'review', 'edit', 'regenerate')),
  instruction    text,
  html_path      text not null,                 -- storyboards/jobs/<id>/v2/rev-<n>/index.html
  thumb_path     text,
  video_path     text,
  video_url      text,
  render_status  text not null default 'none' check (render_status in ('none', 'queued', 'rendering', 'ready', 'failed')),
  render_error   text,
  render_options jsonb,                         -- ExportOptions used for video_path
  credits        int,
  created_at     timestamptz not null default now(),
  unique (job_id, revision)
);

alter table job_revisions enable row level security;
drop policy if exists "service_role full access on job_revisions" on job_revisions;
create policy "service_role full access on job_revisions"
  on job_revisions for all to service_role using (true) with check (true);
drop policy if exists "owner reads job_revisions" on job_revisions;
create policy "owner reads job_revisions"
  on job_revisions for select to authenticated
  using (exists (select 1 from jobs j where j.id = job_revisions.job_id and j.user_id = auth.uid()));

-- Brand kit: one per user, applied to every generation by default.
create table if not exists brand_kits (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  name         text,
  logo_url     text,
  logo_path    text,
  colors       text[] not null default '{}',   -- '#rrggbb'
  heading_font text,
  body_font    text,
  voice_id     text,
  style_notes  text,
  website_url  text,
  updated_at   timestamptz not null default now()
);

alter table brand_kits enable row level security;
drop policy if exists "service_role full access on brand_kits" on brand_kits;
create policy "service_role full access on brand_kits"
  on brand_kits for all to service_role using (true) with check (true);
drop policy if exists "owner reads brand_kits" on brand_kits;
create policy "owner reads brand_kits"
  on brand_kits for select to authenticated using (user_id = auth.uid());

-- The user's asset library (uploads, generated voiceovers, reference videos).
create table if not exists user_assets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('video', 'image', 'audio', 'logo')),
  name         text not null,
  url          text not null,
  path         text not null,
  mime         text,
  bytes        bigint,
  duration     numeric,
  width        int,
  height       int,
  source       text not null default 'upload' check (source in ('upload', 'voiceover', 'reference', 'generated')),
  job_id       uuid references jobs(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists user_assets_user_created_idx on user_assets (user_id, created_at desc);

alter table user_assets enable row level security;
drop policy if exists "service_role full access on user_assets" on user_assets;
create policy "service_role full access on user_assets"
  on user_assets for all to service_role using (true) with check (true);
drop policy if exists "owner reads user_assets" on user_assets;
create policy "owner reads user_assets"
  on user_assets for select to authenticated using (user_id = auth.uid());
