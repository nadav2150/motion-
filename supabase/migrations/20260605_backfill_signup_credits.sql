-- Backfill the Free-plan signup grant (1,500 credits) for users created
-- BEFORE the grant code in app/routes/register.tsx shipped. Without this
-- migration those accounts sit at credits_balance = 0 forever even though
-- the pricing page promises 1,500 credits / month on Free.
--
-- Safe to re-run: every step is guarded so repeated execution is a no-op.
-- A new signup after this migration uses idempotency_key `signup:<uuid>`
-- (different prefix), so this backfill does not block future grants.

-- 1. Ensure every existing auth user has a user_billing row. Defaults from
--    20260602_billing.sql give plan_tier='free' and monthly_grant=1500 — we
--    deliberately do NOT touch existing rows, so users who were already on
--    a paid tier keep their plan.
insert into user_billing (user_id)
select u.id
  from auth.users u
 where not exists (
   select 1 from user_billing b where b.user_id = u.id
 );

-- 2. Append the backfill grant row for any user who has never received the
--    signup grant. Distinct idempotency_key prefix ('backfill_signup:') so
--    the unique constraint on credit_ledger.idempotency_key makes this step
--    a no-op on re-run.
with newly_granted as (
  insert into credit_ledger (user_id, delta, kind, reason, idempotency_key)
  select u.id,
         1500,
         'grant',
         'signup_grant_free_plan',
         'backfill_signup:' || u.id::text
    from auth.users u
   where not exists (
     select 1
       from credit_ledger l
      where l.user_id = u.id
        and l.kind = 'grant'
        and l.reason = 'signup_grant_free_plan'
   )
  returning user_id, delta
)
-- 3. Bump credits_balance to reflect the grants just appended. The ledger
--    is the source of truth — this keeps the denormalised running total in
--    sync, matching the pattern used by adjust_credits() at runtime.
update user_billing b
   set credits_balance = b.credits_balance + n.delta
  from newly_granted n
 where b.user_id = n.user_id;
