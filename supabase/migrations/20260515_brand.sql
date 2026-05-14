-- Brand identity per project (logo + color palette).
-- Stored on the job row directly: each project gets its own brand.
-- Logos live in Storage under brand/<userId>/... and survive project deletion
-- so the same upload can be referenced by multiple projects.

alter table jobs
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_storage_path text,
  add column if not exists brand_colors jsonb;
