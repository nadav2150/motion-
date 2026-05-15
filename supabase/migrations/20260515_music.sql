-- Music bed per project (Jamendo track selection).
-- Stored on the job row directly: each project gets a single selected track.

alter table jobs
  add column if not exists music_track_id text,
  add column if not exists music_url text,
  add column if not exists music_title text,
  add column if not exists music_artist text;
