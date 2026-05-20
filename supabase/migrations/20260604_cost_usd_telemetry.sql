-- USD-denominated cost telemetry alongside the existing credits ledger.
--
-- Why: credits are a tunable internal unit (~ $0.001), but we want to know
-- what each project actually costs in dollars so we can set monthly pricing
-- and recalibrate the worst-case estimator from real production data.
--
-- New columns:
--   • jobs.cost_actual_usd_micros — sum of every consume row for this job,
--     in micros ($ × 1,000,000). Backfilled by reconcileJob() at terminal status.
--   • jobs.cost_by_provider — jsonb breakdown like
--     { "anthropic": 1234567, "elevenlabs": 89000, "replicate_image": 320000 }
--     so per-provider dollar amounts are queryable without joining the ledger.
--   • credit_ledger.{cost_usd_micros, provider, model, units, unit_kind} —
--     typed per-call cost details. Previously buried in meta jsonb; promoted
--     to columns so we can index and aggregate.
--
-- No backfill — old rows simply have NULL USD; PostHog history starts at
-- deploy time. The new columns are additive, never required by writers.

alter table jobs
  add column if not exists cost_actual_usd_micros bigint,
  add column if not exists cost_by_provider       jsonb;

alter table credit_ledger
  add column if not exists cost_usd_micros bigint,
  add column if not exists provider        text,
  add column if not exists model           text,
  add column if not exists units           integer,
  add column if not exists unit_kind       text;

create index if not exists credit_ledger_provider_idx
  on credit_ledger (provider)
  where provider is not null;

create index if not exists credit_ledger_job_provider_idx
  on credit_ledger (job_id, provider)
  where job_id is not null;
