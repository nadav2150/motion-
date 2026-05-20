-- Billing foundation. Five tables that together implement a credits ledger
-- backed by Paddle (see PLAN at C:\Users\User\.claude\plans\i-pay-alot-of-elegant-sutherland.md).
--
-- - user_billing: one row per user — current credit balance, plan tier,
--   Paddle customer reference.
-- - credit_ledger: append-only audit log of every credit movement (grants,
--   purchases, reservations, consumption, refunds). The ledger is the source
--   of truth; user_billing.credits_balance is a denormalised running total.
-- - subscriptions: one row per Paddle subscription. Cancellations flip
--   cancel_at_period_end so we keep granting credits until period_end.
-- - credit_purchases: one row per one-time credit pack purchase.
-- - paddle_events: webhook idempotency — Paddle resends events, so we record
--   every event.id and skip on conflict.
--
-- RLS is enabled with service_role-only policies, mirroring the pattern in
-- 20260523_jobs_shots_service_role_policy.sql. All access flows through the
-- server using SUPABASE_SERVICE_ROLE_KEY.

create table if not exists user_billing (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  paddle_customer_id text unique,
  plan_tier          text not null default 'free',
  credits_balance    bigint not null default 0,
  credits_reserved   bigint not null default 0,
  monthly_grant      bigint not null default 1500,
  period_end         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint credits_balance_nonneg  check (credits_balance >= 0),
  constraint credits_reserved_nonneg check (credits_reserved >= 0)
);

create table if not exists credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  job_id          uuid references jobs(id) on delete set null,
  delta           bigint not null,
  kind            text not null,
  reason          text not null,
  meta            jsonb,
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);
create index if not exists credit_ledger_user_created_idx on credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_job_idx          on credit_ledger (job_id);

create table if not exists subscriptions (
  paddle_subscription_id text primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  paddle_price_id        text not null,
  plan_tier              text not null,
  status                 text not null,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id);

create table if not exists credit_purchases (
  paddle_transaction_id text primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  paddle_price_id       text not null,
  credits_granted       bigint not null,
  amount_usd_cents      integer not null,
  status                text not null,
  created_at            timestamptz not null default now()
);

create table if not exists paddle_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz not null default now()
);

-- Atomic balance mutations. supabase-js can't express
-- "set credits_balance = credits_balance - $1 where credits_balance >= $1"
-- directly, so we expose two SECURITY DEFINER functions called via .rpc().
-- These functions are private — created without grants to anon/authenticated,
-- so only the service_role server can call them.

create or replace function reserve_credits(p_user_id uuid, p_amount bigint)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_balance bigint;
begin
  update user_billing
     set credits_balance  = credits_balance  - p_amount,
         credits_reserved = credits_reserved + p_amount
   where user_id = p_user_id
     and credits_balance >= p_amount
  returning credits_balance into v_balance;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'balance', null);
  end if;
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

create or replace function adjust_credits(
  p_user_id uuid,
  p_delta_balance bigint,
  p_delta_reserved bigint
) returns void
language plpgsql
security definer
as $$
begin
  update user_billing
     set credits_balance  = credits_balance  + p_delta_balance,
         credits_reserved = greatest(0, credits_reserved + p_delta_reserved)
   where user_id = p_user_id;
  if not found then
    raise exception 'adjust_credits: no user_billing row for %', p_user_id;
  end if;
end;
$$;

-- Lock the RPCs down to service_role. revoke from public/anon/authenticated
-- so a leaked anon key can't drain a balance even if RLS had a hole.
revoke all on function reserve_credits(uuid, bigint) from public;
revoke all on function adjust_credits(uuid, bigint, bigint) from public;
grant execute on function reserve_credits(uuid, bigint) to service_role;
grant execute on function adjust_credits(uuid, bigint, bigint) to service_role;

-- updated_at triggers, reusing the set_updated_at() function from schema.sql.
drop trigger if exists user_billing_set_updated_at on user_billing;
create trigger user_billing_set_updated_at
  before update on user_billing
  for each row execute function set_updated_at();

drop trigger if exists subscriptions_set_updated_at on subscriptions;
create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- RLS — service_role only, matching 20260523_jobs_shots_service_role_policy.sql.
alter table user_billing     enable row level security;
alter table credit_ledger    enable row level security;
alter table subscriptions    enable row level security;
alter table credit_purchases enable row level security;
alter table paddle_events    enable row level security;

drop policy if exists "service_role full access on user_billing"     on user_billing;
drop policy if exists "service_role full access on credit_ledger"    on credit_ledger;
drop policy if exists "service_role full access on subscriptions"    on subscriptions;
drop policy if exists "service_role full access on credit_purchases" on credit_purchases;
drop policy if exists "service_role full access on paddle_events"    on paddle_events;

create policy "service_role full access on user_billing"
  on user_billing for all to service_role
  using (true) with check (true);

create policy "service_role full access on credit_ledger"
  on credit_ledger for all to service_role
  using (true) with check (true);

create policy "service_role full access on subscriptions"
  on subscriptions for all to service_role
  using (true) with check (true);

create policy "service_role full access on credit_purchases"
  on credit_purchases for all to service_role
  using (true) with check (true);

create policy "service_role full access on paddle_events"
  on paddle_events for all to service_role
  using (true) with check (true);
