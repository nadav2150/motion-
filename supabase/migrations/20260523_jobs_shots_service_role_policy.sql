-- Service-role RLS policies on the application tables the backend writes to.
--
-- Symptom this fixes:
--   createJob failed: new row violates row-level security policy for table "jobs"
--
-- The new-format Supabase secret keys (`sb_secret_…`) authenticate as the
-- service_role, but Supabase projects with RLS enabled on these tables and
-- no service_role policy still reject inserts/updates. This adds permissive
-- service_role policies on `jobs` and `shots`, mirroring the existing
-- storage.objects policy in 20260517_storage_service_role_policy.sql.
--
-- Drops first so the migration is idempotent.

drop policy if exists "service_role full access on jobs"  on jobs;
drop policy if exists "service_role full access on shots" on shots;

-- Make sure RLS is enabled (no-op if already enabled). Explicit so reviewers
-- can see that these policies are load-bearing, not decorative.
alter table jobs  enable row level security;
alter table shots enable row level security;

create policy "service_role full access on jobs"
  on jobs for all to service_role
  using (true)
  with check (true);

create policy "service_role full access on shots"
  on shots for all to service_role
  using (true)
  with check (true);
