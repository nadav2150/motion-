-- Track when the "Direct storyboard" stage finishes — i.e. when status
-- first flips to `scenes_ready`. Used by the editor + projects list to
-- show the user how long their script took to come back as scenes.
--
-- Apply via Supabase SQL editor.

alter table jobs
  add column if not exists scenes_ready_at timestamptz;
