-- v2 quality pipeline: per-scene motion-trail composite image.
-- A 1920x1080 PNG that blends 4 frames from across the scene's local timeline
-- with descending alpha. Stills hide motion-feel; trails do not. Captured
-- alongside the existing scene_thumbnail_path during runHyperframesDirect.
--
-- See app/lib/hyperframes/thumbnail.ts `captureMotionTrailComposite`.

alter table shots
  add column if not exists motion_trail_path text;
