-- Per-scene asset attachments. Each entry on the JSONB array:
--   { id: text, kind: 'video'|'image'|'screenshot'|'voiceover'|'sfx'|'music',
--     url: text, name: text, created_at: timestamptz }
-- The editor's right-side panel reads/writes this; the left-side library will
-- drag onto shots, which appends entries here.

alter table shots
  add column if not exists assets jsonb not null default '[]'::jsonb;
