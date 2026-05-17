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
