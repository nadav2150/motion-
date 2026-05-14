-- Add 'scenes_ready' to job_status enum.
-- Apply via Supabase SQL editor.
--
-- Used by the split pipeline: the "Direct Storyboard" step runs
-- directing + generating_scenes, then pauses at scenes_ready so the user
-- can review. Export → resumes via rendering_scenes + stitching.

alter type job_status add value if not exists 'scenes_ready';
