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
