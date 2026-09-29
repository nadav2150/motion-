-- Videly — full Supabase bootstrap for a fresh project
-- Target: https://pxynebeabrwfpucmlsce.supabase.co
-- Generated from supabase/schema.sql + supabase/migrations/* (filename order)
-- Run top-to-bottom in the Supabase SQL Editor.

-- ============ 1/2 BASE SCHEMA (supabase/schema.sql) ============
-- MotionGlass — AI Film Direction schema (v1)
-- Run in the Supabase SQL editor. Idempotent where possible.

create extension if not exists pgcrypto;

do $$ begin
  create type job_status as enum (
    'pending', 'directing', 'asset_planning', 'audio_direction',
    'rendering', 'generating_scenes', 'vision_critique', 'refining_scenes',
    'scenes_ready', 'rendering_scenes', 'stitching',
    'completed', 'failed', 'canceled'
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
  add column if not exists scenes_ready_at timestamptz,
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_storage_path text,
  add column if not exists brand_colors jsonb,
  -- Auto-audio direction (see supabase/migrations/20260530_audio_direction.sql
  -- and 20260601_audio_track_toggles.sql). Three independent per-track flags
  -- replace the original audio_auto_enabled bundle gate. All default false:
  -- a job only generates audio for tracks the user opted into at Generate time.
  add column if not exists audio_direction jsonb,
  add column if not exists audio_voiceover_enabled boolean not null default false,
  add column if not exists audio_music_enabled boolean not null default false,
  add column if not exists audio_sfx_enabled boolean not null default false;

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
  add column if not exists validation_attempts int default 0,
  -- Auto-audio direction (see supabase/migrations/20260530_audio_direction.sql).
  add column if not exists voiceover_url text,
  add column if not exists voiceover_text text,
  add column if not exists sfx_cues jsonb;

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

-- ============ 2/2 MIGRATIONS ============

-- ---------- 20260514_hyperframes.sql ----------
-- MotionGlass — HyperFrames Motion Intelligence System schema additions.
-- Idempotent ALTERs. Apply via Supabase SQL editor.

alter type job_status add value if not exists 'generating_scenes';
alter type job_status add value if not exists 'rendering_scenes';
alter type job_status add value if not exists 'stitching';

alter table jobs
  add column if not exists generation_mode text not null default 'hyperframes',
  add column if not exists film_rhythm jsonb,
  add column if not exists motif_state jsonb,
  add column if not exists philosophy_version text;

alter table shots
  add column if not exists scene_html_path text,
  add column if not exists scene_css_path text,
  add column if not exists scene_js_path text,
  add column if not exists rendered_video_url text,
  add column if not exists render_status text default 'pending',
  add column if not exists render_duration_ms int,
  add column if not exists hyperframes_validation_warnings text,
  add column if not exists motion_dna jsonb,
  add column if not exists composition_dna jsonb,
  add column if not exists typography_dna jsonb,
  add column if not exists continuity_dna jsonb,
  add column if not exists scene_intent text,
  add column if not exists scene_tension numeric(4,3),
  add column if not exists scene_cadence text,
  add column if not exists scene_kinetic text,
  add column if not exists rhythm_slot jsonb,
  add column if not exists scene_exit_state jsonb,
  add column if not exists similarity_score numeric(4,3),
  add column if not exists motif_callback jsonb,
  add column if not exists taste_scorecard jsonb,
  add column if not exists frame_taste_scorecard jsonb,
  add column if not exists frame_taste_warnings text,
  add column if not exists taste_subtractions int default 0,
  add column if not exists budgets jsonb,
  add column if not exists primitives_used jsonb,
  add column if not exists regeneration_count int default 0,
  add column if not exists philosophy_alignment_score numeric(4,3),
  add column if not exists rule_break_used boolean default false,
  add column if not exists rule_break_kind text,
  add column if not exists is_hold_scene boolean default false,
  add column if not exists frame_density_mean numeric(6,3);

-- image_prompt is required for legacy AI-media mode but not for hyperframes
-- scenes. Drop NOT NULL so hyperframes rows can omit it.
alter table shots alter column image_prompt drop not null;


-- ---------- 20260515_brand.sql ----------
-- Brand identity per project (logo + color palette).
-- Stored on the job row directly: each project gets its own brand.
-- Logos live in Storage under brand/<userId>/... and survive project deletion
-- so the same upload can be referenced by multiple projects.

alter table jobs
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_storage_path text,
  add column if not exists brand_colors jsonb;


-- ---------- 20260515_music.sql ----------
-- Music bed per project (Jamendo track selection).
-- Stored on the job row directly: each project gets a single selected track.

alter table jobs
  add column if not exists music_track_id text,
  add column if not exists music_url text,
  add column if not exists music_title text,
  add column if not exists music_artist text;


-- ---------- 20260515_scenes_ready_status.sql ----------
-- Add 'scenes_ready' to job_status enum.
-- Apply via Supabase SQL editor.
--
-- Used by the split pipeline: the "Direct Storyboard" step runs
-- directing + generating_scenes, then pauses at scenes_ready so the user
-- can review. Export → resumes via rendering_scenes + stitching.

alter type job_status add value if not exists 'scenes_ready';


-- ---------- 20260515_sfx.sql ----------
-- SFX per project (Freesound selection).
-- Stored on the job row directly: each project gets a single selected sound effect.
-- License is stored so attribution can be surfaced when CC-BY is involved.

alter table jobs
  add column if not exists sfx_id text,
  add column if not exists sfx_url text,
  add column if not exists sfx_name text,
  add column if not exists sfx_author text,
  add column if not exists sfx_license text;


-- ---------- 20260516_scene_thumbnail.sql ----------
-- Per-scene static thumbnail (PNG public URL) so the editor card can show
-- a settled frame instead of an iframe of the LLM-emitted HTML. Captured
-- by app/lib/hyperframes/thumbnail.ts immediately after generateSceneHTML.

alter table shots
  add column if not exists scene_thumbnail_path text;


-- ---------- 20260517_storage_service_role_policy.sql ----------
-- Service-role RLS policy on storage.objects for the `storyboards` bucket.
-- Without this, uploadBuffer() in app/lib/storage.ts is blocked by RLS when
-- writing jobs/<id>/scenes/.../composition.html and other generated assets,
-- even though the server uses the service-role key.

drop policy if exists "service_role full access on storyboards" on storage.objects;

create policy "service_role full access on storyboards"
  on storage.objects for all to service_role
  using (bucket_id = 'storyboards')
  with check (bucket_id = 'storyboards');


-- ---------- 20260518_shot_comments.sql ----------
-- Per-scene user comments. Each entry on the JSONB array is shaped
--   { id: text, text: text, created_at: timestamptz, author: text | null }
-- The editor's right-side panel reads/writes this via PATCH /api/shots/:id/comments.

alter table shots
  add column if not exists comments jsonb not null default '[]'::jsonb;


-- ---------- 20260519_shot_assets.sql ----------
-- Per-scene asset attachments. Each entry on the JSONB array:
--   { id: text, kind: 'video'|'image'|'screenshot'|'voiceover'|'sfx'|'music',
--     url: text, name: text, created_at: timestamptz }
-- The editor's right-side panel reads/writes this; the left-side library will
-- drag onto shots, which appends entries here.

alter table shots
  add column if not exists assets jsonb not null default '[]'::jsonb;


-- ---------- 20260520_job_assets.sql ----------
-- Project-level asset library. Each entry on the JSONB array:
--   { id: text, kind: 'video'|'image'|'audio'|'other',
--     url: text, storage_path: text, name: text, mime: text,
--     size_bytes: int, created_at: timestamptz }
-- The editor's left-sidebar ASSETS panel writes here via
-- POST/DELETE /api/jobs/:id/assets. Per-scene attachments live separately on
-- shots.assets (see 20260519_shot_assets.sql).

alter table jobs
  add column if not exists assets jsonb not null default '[]'::jsonb;


-- ---------- 20260521_scenes_ready_at.sql ----------
-- Track when the "Direct storyboard" stage finishes — i.e. when status
-- first flips to `scenes_ready`. Used by the editor + projects list to
-- show the user how long their script took to come back as scenes.
--
-- Apply via Supabase SQL editor.

alter table jobs
  add column if not exists scenes_ready_at timestamptz;


-- ---------- 20260522_motion_trail.sql ----------
-- v2 quality pipeline: per-scene motion-trail composite image.
-- A 1920x1080 PNG that blends 4 frames from across the scene's local timeline
-- with descending alpha. Stills hide motion-feel; trails do not. Captured
-- alongside the existing scene_thumbnail_path during runHyperframesDirect.
--
-- See app/lib/hyperframes/thumbnail.ts `captureMotionTrailComposite`.

alter table shots
  add column if not exists motion_trail_path text;


-- ---------- 20260523_jobs_shots_service_role_policy.sql ----------
-- Service-role RLS policies on the application tables the backend writes to.
--
-- Symptom this fixes:
--   createJob failed: new row violates row-level security policy for table "jobs"
--
-- The new-format Supabase secret keys (`sb_secret_…`) authenticate as the
-- service_role, but Supabase projects with RLS enabled on these tables and
-- no service_role policy still reject inserts/updates. This adds permissive
-- service_role policies on `jobs` and `shots`, mirroring the existing
-- storage.objects policy in 20260517_storage_service_role_policy.sql.
--
-- Drops first so the migration is idempotent.

drop policy if exists "service_role full access on jobs"  on jobs;
drop policy if exists "service_role full access on shots" on shots;

-- Make sure RLS is enabled (no-op if already enabled). Explicit so reviewers
-- can see that these policies are load-bearing, not decorative.
alter table jobs  enable row level security;
alter table shots enable row level security;

create policy "service_role full access on jobs"
  on jobs for all to service_role
  using (true)
  with check (true);

create policy "service_role full access on shots"
  on shots for all to service_role
  using (true)
  with check (true);


-- ---------- 20260524_critique.sql ----------
-- v2 quality pipeline: vision-critique columns.
--
-- shots.scene_critique JSONB — per-scene SceneCritique emitted by Sonnet 4.6
-- with the motion-trail composite as input. Shape:
--   { sceneId, scores: { composition, typographyHierarchy, colorTension,
--     focalClarity, motionClarity, brandFidelity, restraintQuality, overall },
--     verdict: 'ship'|'refine'|'reject',
--     issues: [{ severity, dimension, description, suggestedFix }] }
--
-- jobs.film_critique JSONB — single FilmCritique emitted by Sonnet 4.6 with
-- ALL motion-trail composites + the planned filmRhythm as input. Shape:
--   { scores: { pacingDiversity, rhythmEvolution, ..., overall },
--     verdict: 'ship'|'refine_selected_scenes'|'redesign_rhythm',
--     filmLevelIssues: [{ severity, dimension, description,
--                          affectedSceneIds, suggestedFix }] }
--
-- See app/lib/hyperframes/llm-director.ts `generateVisionCritique` and
-- `generateFilmCritique`.

alter table shots
  add column if not exists scene_critique jsonb;

alter table jobs
  add column if not exists film_critique jsonb;


-- ---------- 20260525_v2_job_status_values.sql ----------
-- v2 quality pipeline: extend the job_status enum with the new stages.
--
-- runHyperframesDirect now passes through three stages between "directing"
-- and "scenes_ready":
--   • asset_planning   — generateAssetPlan + sourceAssets (Sub-PR A)
--   • vision_critique  — per-scene + film-level vision critique (Sub-PR C)
--   • refining_scenes  — re-fire scenes flagged by the critique (Sub-PR C)
--
-- Apply via Supabase SQL editor or `supabase db push`.
-- Mirrors the pattern in 20260515_scenes_ready_status.sql.

alter type job_status add value if not exists 'asset_planning';
alter type job_status add value if not exists 'vision_critique';
alter type job_status add value if not exists 'refining_scenes';


-- ---------- 20260526_polish_endpoint.sql ----------
-- "Critique & polish" promote endpoint.
--
-- Persists the in-memory state that runHyperframesDirect produces and
-- currently throws away after the function returns, so a job can be
-- promoted into the vision-critique + refinement pass on demand via
-- POST /api/jobs/:id/critique without re-running the full directing
-- pipeline.
--
-- See app/lib/jobs.ts `critiqueAndPolishJob`.

alter table jobs
  add column if not exists blueprint jsonb,
  add column if not exists scene_contexts jsonb,
  add column if not exists film_fills jsonb,
  add column if not exists polished_at timestamptz;


-- ---------- 20260530_audio_direction.sql ----------
-- Auto-audio direction (Sprint 2): LLM-driven background music + per-scene SFX + voiceover.

-- New JobStatus value emitted by runHyperframesDirect when the
-- audio_direction stage runs. Mirrors the pattern in
-- 20260525_v2_job_status_values.sql. NOTE: alter type ... add value
-- cannot run inside an explicit transaction block in some Postgres
-- versions; the Supabase SQL editor runs each statement in its own
-- implicit transaction so this works there, and `supabase db push`
-- also handles it. If you hit a "ALTER TYPE ... ADD cannot run inside
-- a transaction block" error, run JUST this statement first, then the
-- alter table block below.
alter type job_status add value if not exists 'audio_direction';

--
-- jobs.audio_direction JSONB — raw AudioPlan emitted by generateAudioDirection
--   in app/lib/hyperframes/llm-director.ts. Persisted so the "Reset to auto"
--   button can re-resolve the picked tracks without re-calling the LLM. Shape:
--     { bgMusic: { jamendoQuery, moodTags[], energyHint } | null,
--       voiceovers: [{ sceneId, text, deliveryHint, voiceId? }],
--       sfxCues:    [{ sceneId, momentSeconds, kind, freesoundQuery }] }
--
-- jobs.audio_auto_enabled BOOLEAN — feature switch per job. When false the
--   audio_direction pipeline stage is skipped even if MOTIONGLASS_AUTO_AUDIO=true.
--
-- shots.voiceover_url / shots.voiceover_text — per-scene voiceover MP3
--   (ElevenLabs TTS, mirrored to Supabase Storage) and the text that was
--   synthesised. NULL when no voiceover was generated for the scene.
--
-- shots.sfx_cues JSONB — resolved per-scene SFX cues from Freesound. Shape:
--   [{ id, url, name, license, licenseUrl, momentSec, volume }]
--
-- See PLAN.md "Sprint 2 — Auto-Audio Direction".

alter table jobs
  add column if not exists audio_direction jsonb,
  add column if not exists audio_auto_enabled boolean not null default true;

alter table shots
  add column if not exists voiceover_url text,
  add column if not exists voiceover_text text,
  add column if not exists sfx_cues jsonb;


-- ---------- 20260601_audio_track_toggles.sql ----------
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


-- ---------- 20260602_billing.sql ----------
-- Billing foundation. Five tables that together implement a credits ledger
-- backed by Paddle (see PLAN at C:\Users\User\.claude\plans\i-pay-alot-of-elegant-sutherland.md).
--
-- - user_billing: one row per user — current credit balance, plan tier,
--   Paddle customer reference.
-- - credit_ledger: append-only audit log of every credit movement (grants,
--   purchases, reservations, consumption, refunds). The ledger is the source
--   of truth; user_billing.credits_balance is a denormalised running total.
-- - subscriptions: one row per Paddle subscription. Cancellations flip
--   cancel_at_period_end so we keep granting credits until period_end.
-- - credit_purchases: one row per one-time credit pack purchase.
-- - paddle_events: webhook idempotency — Paddle resends events, so we record
--   every event.id and skip on conflict.
--
-- RLS is enabled with service_role-only policies, mirroring the pattern in
-- 20260523_jobs_shots_service_role_policy.sql. All access flows through the
-- server using SUPABASE_SERVICE_ROLE_KEY.

create table if not exists user_billing (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  paddle_customer_id text unique,
  plan_tier          text not null default 'free',
  credits_balance    bigint not null default 0,
  credits_reserved   bigint not null default 0,
  monthly_grant      bigint not null default 1500,
  period_end         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint credits_balance_nonneg  check (credits_balance >= 0),
  constraint credits_reserved_nonneg check (credits_reserved >= 0)
);

create table if not exists credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  job_id          uuid references jobs(id) on delete set null,
  delta           bigint not null,
  kind            text not null,
  reason          text not null,
  meta            jsonb,
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);
create index if not exists credit_ledger_user_created_idx on credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_job_idx          on credit_ledger (job_id);

create table if not exists subscriptions (
  paddle_subscription_id text primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  paddle_price_id        text not null,
  plan_tier              text not null,
  status                 text not null,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id);

create table if not exists credit_purchases (
  paddle_transaction_id text primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  paddle_price_id       text not null,
  credits_granted       bigint not null,
  amount_usd_cents      integer not null,
  status                text not null,
  created_at            timestamptz not null default now()
);

create table if not exists paddle_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz not null default now()
);

-- Atomic balance mutations. supabase-js can't express
-- "set credits_balance = credits_balance - $1 where credits_balance >= $1"
-- directly, so we expose two SECURITY DEFINER functions called via .rpc().
-- These functions are private — created without grants to anon/authenticated,
-- so only the service_role server can call them.

create or replace function reserve_credits(p_user_id uuid, p_amount bigint)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_balance bigint;
begin
  update user_billing
     set credits_balance  = credits_balance  - p_amount,
         credits_reserved = credits_reserved + p_amount
   where user_id = p_user_id
     and credits_balance >= p_amount
  returning credits_balance into v_balance;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'balance', null);
  end if;
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

create or replace function adjust_credits(
  p_user_id uuid,
  p_delta_balance bigint,
  p_delta_reserved bigint
) returns void
language plpgsql
security definer
as $$
begin
  update user_billing
     set credits_balance  = credits_balance  + p_delta_balance,
         credits_reserved = greatest(0, credits_reserved + p_delta_reserved)
   where user_id = p_user_id;
  if not found then
    raise exception 'adjust_credits: no user_billing row for %', p_user_id;
  end if;
end;
$$;

-- Lock the RPCs down to service_role. revoke from public/anon/authenticated
-- so a leaked anon key can't drain a balance even if RLS had a hole.
revoke all on function reserve_credits(uuid, bigint) from public;
revoke all on function adjust_credits(uuid, bigint, bigint) from public;
grant execute on function reserve_credits(uuid, bigint) to service_role;
grant execute on function adjust_credits(uuid, bigint, bigint) to service_role;

-- updated_at triggers, reusing the set_updated_at() function from schema.sql.
drop trigger if exists user_billing_set_updated_at on user_billing;
create trigger user_billing_set_updated_at
  before update on user_billing
  for each row execute function set_updated_at();

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- RLS — service_role only, matching 20260523_jobs_shots_service_role_policy.sql.
alter table user_billing     enable row level security;
alter table credit_ledger    enable row level security;
alter table subscriptions    enable row level security;
alter table credit_purchases enable row level security;
alter table paddle_events    enable row level security;

drop policy if exists "service_role full access on user_billing"     on user_billing;
drop policy if exists "service_role full access on credit_ledger"    on credit_ledger;
drop policy if exists "service_role full access on subscriptions"    on subscriptions;
drop policy if exists "service_role full access on credit_purchases" on credit_purchases;
drop policy if exists "service_role full access on paddle_events"    on paddle_events;

create policy "service_role full access on user_billing"
  on user_billing for all to service_role
  using (true) with check (true);

create policy "service_role full access on credit_ledger"
  on credit_ledger for all to service_role
  using (true) with check (true);

create policy "service_role full access on subscriptions"
  on subscriptions for all to service_role
  using (true) with check (true);

create policy "service_role full access on credit_purchases"
  on credit_purchases for all to service_role
  using (true) with check (true);

create policy "service_role full access on paddle_events"
  on paddle_events for all to service_role
  using (true) with check (true);


-- ---------- 20260601_polar_billing_rename.sql (moved after 20260602: it renames tables 20260602 creates) ----------
-- Rename Paddle-specific billing identifiers to provider-neutral names as part
-- of the Paddle -> Polar migration. No data to preserve (Paddle never went
-- live), but renames keep PKs/indexes intact.

alter table user_billing    rename column paddle_customer_id     to provider_customer_id;

alter table subscriptions   rename column paddle_subscription_id to provider_subscription_id;
alter table subscriptions   rename column paddle_price_id        to provider_product_id;

alter table credit_purchases rename column paddle_transaction_id to provider_order_id;
alter table credit_purchases rename column paddle_price_id       to provider_product_id;

-- Rename the webhook idempotency table.
alter table paddle_events rename to billing_events;

-- Recreate the RLS policy under the new table name.
drop policy if exists "service_role full access on paddle_events" on billing_events;
create policy "service_role full access on billing_events"
  on billing_events for all to service_role
  using (true) with check (true);


-- ---------- 20260603_jobs_cost_columns.sql ----------
-- Per-job cost tracking. cost_estimate_credits is set at job creation from
-- estimateJobCost() in app/lib/billing/estimate.ts — it's the reserved amount
-- that gates whether the job is allowed to run (see plan). cost_actual_credits
-- is backfilled from credit_ledger on terminal status by reconcileJob() in
-- app/lib/billing/credits.ts. Both are bigint to match credit_ledger.delta.

alter table jobs
  add column if not exists cost_estimate_credits bigint,
  add column if not exists cost_actual_credits   bigint;


-- ---------- 20260604_cost_usd_telemetry.sql ----------
-- USD-denominated cost telemetry alongside the existing credits ledger.
--
-- Why: credits are a tunable internal unit (~ $0.001), but we want to know
-- what each project actually costs in dollars so we can set monthly pricing
-- and recalibrate the worst-case estimator from real production data.
--
-- New columns:
--   • jobs.cost_actual_usd_micros — sum of every consume row for this job,
--     in micros ($ × 1,000,000). Backfilled by reconcileJob() at terminal status.
--   • jobs.cost_by_provider — jsonb breakdown like
--     { "anthropic": 1234567, "elevenlabs": 89000, "replicate_image": 320000 }
--     so per-provider dollar amounts are queryable without joining the ledger.
--   • credit_ledger.{cost_usd_micros, provider, model, units, unit_kind} —
--     typed per-call cost details. Previously buried in meta jsonb; promoted
--     to columns so we can index and aggregate.
--
-- No backfill — old rows simply have NULL USD; PostHog history starts at
-- deploy time. The new columns are additive, never required by writers.

alter table jobs
  add column if not exists cost_actual_usd_micros bigint,
  add column if not exists cost_by_provider       jsonb;

alter table credit_ledger
  add column if not exists cost_usd_micros bigint,
  add column if not exists provider        text,
  add column if not exists model           text,
  add column if not exists units           integer,
  add column if not exists unit_kind       text;

create index if not exists credit_ledger_provider_idx
  on credit_ledger (provider)
  where provider is not null;

create index if not exists credit_ledger_job_provider_idx
  on credit_ledger (job_id, provider)
  where job_id is not null;


-- ---------- 20260605_backfill_signup_credits.sql ----------
-- Backfill the Free-plan signup grant (1,500 credits) for users created
-- BEFORE the grant code in app/routes/register.tsx shipped. Without this
-- migration those accounts sit at credits_balance = 0 forever even though
-- the pricing page promises 1,500 credits / month on Free.
--
-- Safe to re-run: every step is guarded so repeated execution is a no-op.
-- A new signup after this migration uses idempotency_key `signup:<uuid>`
-- (different prefix), so this backfill does not block future grants.

-- 1. Ensure every existing auth user has a user_billing row. Defaults from
--    20260602_billing.sql give plan_tier='free' and monthly_grant=1500 — we
--    deliberately do NOT touch existing rows, so users who were already on
--    a paid tier keep their plan.
insert into user_billing (user_id)
select u.id
  from auth.users u
 where not exists (
   select 1 from user_billing b where b.user_id = u.id
 );

-- 2. Append the backfill grant row for any user who has never received the
--    signup grant. Distinct idempotency_key prefix ('backfill_signup:') so
--    the unique constraint on credit_ledger.idempotency_key makes this step
--    a no-op on re-run.
with newly_granted as (
  insert into credit_ledger (user_id, delta, kind, reason, idempotency_key)
  select u.id,
         1500,
         'grant',
         'signup_grant_free_plan',
         'backfill_signup:' || u.id::text
    from auth.users u
   where not exists (
     select 1
       from credit_ledger l
      where l.user_id = u.id
        and l.kind = 'grant'
        and l.reason = 'signup_grant_free_plan'
   )
  returning user_id, delta
)
-- 3. Bump credits_balance to reflect the grants just appended. The ledger
--    is the source of truth — this keeps the denormalised running total in
--    sync, matching the pattern used by adjust_credits() at runtime.
update user_billing b
   set credits_balance = b.credits_balance + n.delta
  from newly_granted n
 where b.user_id = n.user_id;


-- ---------- 20260606_free_grant_topup.sql ----------
-- Raises the Free-plan signup grant from 1,500 to 3,500 to actually cover
-- one worst-case 2-scene generation (1,100 base + 2 × 1,000 per-scene =
-- 3,100, plus a small buffer). Applied AFTER the plan-features.ts change
-- that caps Free to 2 scenes — without that cap the server would still
-- reserve against 14 scenes and even 3,500 wouldn't be enough.
--
-- Safe to re-run. Step 2 is restricted to rows that still carry the old
-- default; step 3 uses a distinct idempotency_key prefix so prior
-- backfills don't conflict and re-running this migration is a no-op.

-- 1. Bump the column default so new user_billing rows created via
--    getOrCreateBilling() pick up the new monthly grant automatically.
alter table user_billing alter column monthly_grant set default 3500;

-- 2. Update existing Free users still on the old 1,500 monthly grant.
update user_billing
   set monthly_grant = 3500
 where plan_tier = 'free'
   and monthly_grant = 1500;

-- 3. Top up Free users whose balance is currently below 3,500. The
--    idempotency_key prefix is distinct from the prior backfill (which
--    used 'backfill_signup:<uuid>') so this is safe to re-run. Only users
--    who never got this top-up grant get a ledger row + the matching
--    balance bump.
with newly_topped as (
  insert into credit_ledger (user_id, delta, kind, reason, idempotency_key)
  select b.user_id,
         3500 - b.credits_balance,
         'grant',
         'topup_free_to_3500',
         'topup_free_3500:' || b.user_id::text
    from user_billing b
   where b.plan_tier = 'free'
     and b.credits_balance < 3500
     and not exists (
       select 1 from credit_ledger l
        where l.user_id = b.user_id
          and l.idempotency_key = 'topup_free_3500:' || b.user_id::text
     )
  returning user_id, delta
)
update user_billing b
   set credits_balance = b.credits_balance + n.delta
  from newly_topped n
 where b.user_id = n.user_id;


-- ---------- 20260607_free_grant_3100.sql ----------
-- Drops the Free signup grant from 3,500 to 3,100 — exactly the
-- worst-case 2-scene reservation (1,100 base + 2 × 1,000 per-scene). At
-- this size the trial gives the user exactly one render: after generation
-- the reservation refund returns ~1,200 credits on average, which is
-- below the 3,100 reservation needed to start a second job. No clawback
-- from existing balances; only the column default and Free-tier
-- monthly_grant rows are touched.

-- 1. New default for future user_billing inserts.
alter table user_billing alter column monthly_grant set default 3100;

-- 2. Existing Free-tier rows still on the 3,500 monthly_grant get updated.
update user_billing
   set monthly_grant = 3100
 where plan_tier = 'free'
   and monthly_grant = 3500;


-- ---------- 20260608_admin_backoffice.sql ----------
-- Backoffice admin panel read path. Two read-only RPCs that power the
-- /backoffice user roster and detail pages (see docs/superpowers/specs/
-- 2026-06-01-backoffice-admin-design.md).
--
-- Both functions run as the *caller's* role (no SECURITY DEFINER). The server
-- calls them with SUPABASE_SERVICE_ROLE_KEY, and service_role can read the
-- auth schema directly — so we never expose auth.users through PostgREST.
-- EXECUTE is locked to service_role only, mirroring reserve_credits /
-- adjust_credits in 20260602_billing.sql. Admin gating itself lives in the
-- app (ADMIN_EMAILS allowlist), not the database.
--
-- `set search_path = public, auth` pins resolution so an unqualified table
-- reference can't be hijacked by a caller-controlled search_path.

-- admin_list_users: searchable, paginated user roster. total_count is the
-- count of all rows matching the search (ignoring limit/offset) so the UI
-- can render pagination without a second query.
create or replace function admin_list_users(
  p_search text default null,
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (
  user_id          uuid,
  email            text,
  name             text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  plan_tier        text,
  credits_balance  bigint,
  credits_reserved bigint,
  job_count        bigint,
  last_job_at      timestamptz,
  total_count      bigint
)
language sql
stable
set search_path = public, auth
as $$
  with filtered as (
    select u.id,
           u.email::text                             as email,
           nullif(u.raw_user_meta_data->>'name', '') as name,
           u.created_at,
           u.last_sign_in_at
    from auth.users u
    where p_search is null
       or p_search = ''
       or u.email::text ilike '%' || p_search || '%'
       or coalesce(u.raw_user_meta_data->>'name','') ilike '%' || p_search || '%'
  ),
  counted as (select count(*) as total from filtered)
  select f.id,
         f.email,
         f.name,
         f.created_at,
         f.last_sign_in_at,
         coalesce(b.plan_tier, 'free')   as plan_tier,
         coalesce(b.credits_balance, 0)  as credits_balance,
         coalesce(b.credits_reserved, 0) as credits_reserved,
         coalesce(j.cnt, 0)              as job_count,
         j.last_job_at,
         (select total from counted)     as total_count
  from filtered f
  left join user_billing b on b.user_id = f.id
  left join lateral (
    select count(*) as cnt, max(created_at) as last_job_at
    from jobs where user_id = f.id
  ) j on true
  order by f.created_at desc
  limit  greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- admin_get_user: full detail bundle for one user.
create or replace function admin_get_user(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = public, auth
as $$
  select jsonb_build_object(
    'identity', (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email::text,
        'name', u.raw_user_meta_data->>'name',
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at
      ) from auth.users u where u.id = p_user_id
    ),
    'billing', (select to_jsonb(b) from user_billing b where b.user_id = p_user_id),
    'subscriptions', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from subscriptions s where s.user_id = p_user_id
    ),
    'usage', (
      select jsonb_build_object('job_count', count(*), 'last_job_at', max(created_at))
      from jobs where user_id = p_user_id
    ),
    'recent_jobs', (
      select coalesce(jsonb_agg(to_jsonb(jj) order by jj.created_at desc), '[]'::jsonb)
      from (
        select id, title, status::text as status, created_at
        from jobs where user_id = p_user_id order by created_at desc limit 10
      ) jj
    ),
    'ledger', (
      select coalesce(jsonb_agg(to_jsonb(ll) order by ll.created_at desc), '[]'::jsonb)
      from (
        select id, delta, kind, reason, created_at
        from credit_ledger where user_id = p_user_id order by created_at desc limit 25
      ) ll
    )
  );
$$;

revoke all on function admin_list_users(text, int, int) from public;
revoke all on function admin_get_user(uuid)             from public;
grant execute on function admin_list_users(text, int, int) to service_role;
grant execute on function admin_get_user(uuid)             to service_role;

-- These functions run as service_role (SECURITY INVOKER) via PostgREST and
-- read auth.users, but service_role has no SELECT on auth.users by default
-- (you'd get "permission denied for table users", code 42501). Grant it.
-- service_role is a server-only privileged role (used with the secret key),
-- so reading auth.users is consistent with its purpose.
grant usage  on schema auth      to service_role;
grant select on table auth.users to service_role;


-- ---------- 20260611_motion_telemetry.sql ----------
-- Motion telemetry: deterministic per-scene motion measurements (MotionMetrics
-- JSON) computed from rendered element rects/opacities sampled at ~4 Hz.
-- Captured alongside the motion-trail composite in jobs.ts:captureScenes;
-- consumed by the vision critique (telemetry text block) and refinement
-- gating (telemetryGates). Null when sampling failed or hasn't run.
--
-- See app/lib/hyperframes/motion-telemetry.ts and
-- docs/superpowers/specs/2026-06-11-motion-telemetry-design.md.

alter table shots
  add column if not exists motion_telemetry jsonb;


-- ============ 3/3 STORAGE BUCKET ============
-- app/lib/storage.ts writes to the 'storyboards' bucket (STORYBOARDS_BUCKET).
insert into storage.buckets (id, name, public)
values ('storyboards', 'storyboards', true)
on conflict (id) do nothing;


-- ---------- 20260929_reference_video.sql ----------
-- Reference video: the user pastes a link or uploads a clip; Gemini analyzes
-- it before directing and the brief feeds the Opus storyboard + blueprint.
--
-- jobs.reference_video_url — YouTube link, direct video URL, or public URL of
--   an upload under storyboards/reference/<userId>/...
-- jobs.reference_analysis — ReferenceAnalysis JSON from app/lib/reference-video.ts,
--   or { "error": "..." } when analysis failed and the film was directed without it.

alter table jobs
  add column if not exists reference_video_url text,
  add column if not exists reference_analysis  jsonb;
