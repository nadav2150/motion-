-- Per-scene static thumbnail (PNG public URL) so the editor card can show
-- a settled frame instead of an iframe of the LLM-emitted HTML. Captured
-- by app/lib/hyperframes/thumbnail.ts immediately after generateSceneHTML.

alter table shots
  add column if not exists scene_thumbnail_path text;
