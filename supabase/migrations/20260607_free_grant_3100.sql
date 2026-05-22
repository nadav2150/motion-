-- Drops the Free signup grant from 3,500 to 3,100 — exactly the
-- worst-case 2-scene reservation (1,100 base + 2 × 1,000 per-scene). At
-- this size the trial gives the user exactly one render: after generation
-- the reservation refund returns ~1,200 credits on average, which is
-- below the 3,100 reservation needed to start a second job. No clawback
-- from existing balances; only the column default and Free-tier
-- monthly_grant rows are touched.

-- 1. New default for future user_billing inserts.
alter table user_billing alter column monthly_grant set default 3100;

-- 2. Existing Free-tier rows still on the 3,500 monthly_grant get updated.
update user_billing
   set monthly_grant = 3100
 where plan_tier = 'free'
   and monthly_grant = 3500;
