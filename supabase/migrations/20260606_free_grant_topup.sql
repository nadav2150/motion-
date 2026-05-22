-- Raises the Free-plan signup grant from 1,500 to 3,500 to actually cover
-- one worst-case 2-scene generation (1,100 base + 2 × 1,000 per-scene =
-- 3,100, plus a small buffer). Applied AFTER the plan-features.ts change
-- that caps Free to 2 scenes — without that cap the server would still
-- reserve against 14 scenes and even 3,500 wouldn't be enough.
--
-- Safe to re-run. Step 2 is restricted to rows that still carry the old
-- default; step 3 uses a distinct idempotency_key prefix so prior
-- backfills don't conflict and re-running this migration is a no-op.

-- 1. Bump the column default so new user_billing rows created via
--    getOrCreateBilling() pick up the new monthly grant automatically.
alter table user_billing alter column monthly_grant set default 3500;

-- 2. Update existing Free users still on the old 1,500 monthly grant.
update user_billing
   set monthly_grant = 3500
 where plan_tier = 'free'
   and monthly_grant = 1500;

-- 3. Top up Free users whose balance is currently below 3,500. The
--    idempotency_key prefix is distinct from the prior backfill (which
--    used 'backfill_signup:<uuid>') so this is safe to re-run. Only users
--    who never got this top-up grant get a ledger row + the matching
--    balance bump.
with newly_topped as (
  insert into credit_ledger (user_id, delta, kind, reason, idempotency_key)
  select b.user_id,
         3500 - b.credits_balance,
         'grant',
         'topup_free_to_3500',
         'topup_free_3500:' || b.user_id::text
    from user_billing b
   where b.plan_tier = 'free'
     and b.credits_balance < 3500
     and not exists (
       select 1 from credit_ledger l
        where l.user_id = b.user_id
          and l.idempotency_key = 'topup_free_3500:' || b.user_id::text
     )
  returning user_id, delta
)
update user_billing b
   set credits_balance = b.credits_balance + n.delta
  from newly_topped n
 where b.user_id = n.user_id;
