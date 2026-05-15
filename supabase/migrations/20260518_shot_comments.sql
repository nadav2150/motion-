-- Per-scene user comments. Each entry on the JSONB array is shaped
--   { id: text, text: text, created_at: timestamptz, author: text | null }
-- The editor's right-side panel reads/writes this via PATCH /api/shots/:id/comments.

alter table shots
  add column if not exists comments jsonb not null default '[]'::jsonb;
