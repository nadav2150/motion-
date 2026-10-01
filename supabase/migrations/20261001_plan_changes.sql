-- In-place plan changes (POST /api/billing/change-plan).
--
-- The route records the change it asked the provider for, with the credits it
-- expects to grant (proration-matched, see app/lib/billing/plan-change.ts).
-- The provider webhook (Dodo subscription.plan_changed / Polar order.paid with
-- billing_reason=subscription_update) applies the grant and marks the row
-- applied. Service-role only, like the other billing tables.
--
-- Apply via the Supabase SQL editor or the session pooler; `supabase db push`
-- collides on the duplicate 20260601_* prefixes.

create table if not exists plan_changes (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  provider                  text not null check (provider in ('polar', 'dodo')),
  provider_subscription_id  text not null,
  from_tier                 text not null,
  to_tier                   text not null,
  direction                 text not null check (direction in ('up', 'down')),
  remaining_fraction        numeric not null,
  expected_grant            bigint not null default 0,
  status                    text not null default 'pending' check (status in ('pending', 'applied', 'failed')),
  error                     text,
  created_at                timestamptz not null default now(),
  applied_at                timestamptz
);

create index if not exists plan_changes_sub_status_idx
  on plan_changes (provider_subscription_id, status, created_at desc);

alter table plan_changes enable row level security;

drop policy if exists "service_role full access on plan_changes" on plan_changes;
create policy "service_role full access on plan_changes"
  on plan_changes for all to service_role
  using (true) with check (true);
