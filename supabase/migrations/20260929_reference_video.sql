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
