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
