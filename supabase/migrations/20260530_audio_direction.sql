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
