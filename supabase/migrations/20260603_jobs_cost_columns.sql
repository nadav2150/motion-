-- Per-job cost tracking. cost_estimate_credits is set at job creation from
-- estimateJobCost() in app/lib/billing/estimate.ts — it's the reserved amount
-- that gates whether the job is allowed to run (see plan). cost_actual_credits
-- is backfilled from credit_ledger on terminal status by reconcileJob() in
-- app/lib/billing/credits.ts. Both are bigint to match credit_ledger.delta.

alter table jobs
  add column if not exists cost_estimate_credits bigint,
  add column if not exists cost_actual_credits   bigint;
