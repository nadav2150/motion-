-- Project-level asset library. Each entry on the JSONB array:
--   { id: text, kind: 'video'|'image'|'audio'|'other',
--     url: text, storage_path: text, name: text, mime: text,
--     size_bytes: int, created_at: timestamptz }
-- The editor's left-sidebar ASSETS panel writes here via
-- POST/DELETE /api/jobs/:id/assets. Per-scene attachments live separately on
-- shots.assets (see 20260519_shot_assets.sql).

alter table jobs
  add column if not exists assets jsonb not null default '[]'::jsonb;
