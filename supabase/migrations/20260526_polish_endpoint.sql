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
