-- Backoffice admin panel read path. Two read-only RPCs that power the
-- /backoffice user roster and detail pages (see docs/superpowers/specs/
-- 2026-06-01-backoffice-admin-design.md).
--
-- Both functions run as the *caller's* role (no SECURITY DEFINER). The server
-- calls them with SUPABASE_SERVICE_ROLE_KEY, and service_role can read the
-- auth schema directly — so we never expose auth.users through PostgREST.
-- EXECUTE is locked to service_role only, mirroring reserve_credits /
-- adjust_credits in 20260602_billing.sql. Admin gating itself lives in the
-- app (ADMIN_EMAILS allowlist), not the database.
--
-- `set search_path = public, auth` pins resolution so an unqualified table
-- reference can't be hijacked by a caller-controlled search_path.

-- admin_list_users: searchable, paginated user roster. total_count is the
-- count of all rows matching the search (ignoring limit/offset) so the UI
-- can render pagination without a second query.
create or replace function admin_list_users(
  p_search text default null,
  p_limit  int  default 25,
  p_offset int  default 0
)
returns table (
  user_id          uuid,
  email            text,
  name             text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  plan_tier        text,
  credits_balance  bigint,
  credits_reserved bigint,
  job_count        bigint,
  last_job_at      timestamptz,
  total_count      bigint
)
language sql
stable
set search_path = public, auth
as $$
  with filtered as (
    select u.id,
           u.email::text                             as email,
           nullif(u.raw_user_meta_data->>'name', '') as name,
           u.created_at,
           u.last_sign_in_at
    from auth.users u
    where p_search is null
       or p_search = ''
       or u.email::text ilike '%' || p_search || '%'
       or coalesce(u.raw_user_meta_data->>'name','') ilike '%' || p_search || '%'
  ),
  counted as (select count(*) as total from filtered)
  select f.id,
         f.email,
         f.name,
         f.created_at,
         f.last_sign_in_at,
         coalesce(b.plan_tier, 'free')   as plan_tier,
         coalesce(b.credits_balance, 0)  as credits_balance,
         coalesce(b.credits_reserved, 0) as credits_reserved,
         coalesce(j.cnt, 0)              as job_count,
         j.last_job_at,
         (select total from counted)     as total_count
  from filtered f
  left join user_billing b on b.user_id = f.id
  left join lateral (
    select count(*) as cnt, max(created_at) as last_job_at
    from jobs where user_id = f.id
  ) j on true
  order by f.created_at desc
  limit  greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- admin_get_user: full detail bundle for one user.
create or replace function admin_get_user(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = public, auth
as $$
  select jsonb_build_object(
    'identity', (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email::text,
        'name', u.raw_user_meta_data->>'name',
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at
      ) from auth.users u where u.id = p_user_id
    ),
    'billing', (select to_jsonb(b) from user_billing b where b.user_id = p_user_id),
    'subscriptions', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from subscriptions s where s.user_id = p_user_id
    ),
    'usage', (
      select jsonb_build_object('job_count', count(*), 'last_job_at', max(created_at))
      from jobs where user_id = p_user_id
    ),
    'recent_jobs', (
      select coalesce(jsonb_agg(to_jsonb(jj) order by jj.created_at desc), '[]'::jsonb)
      from (
        select id, title, status::text as status, created_at
        from jobs where user_id = p_user_id order by created_at desc limit 10
      ) jj
    ),
    'ledger', (
      select coalesce(jsonb_agg(to_jsonb(ll) order by ll.created_at desc), '[]'::jsonb)
      from (
        select id, delta, kind, reason, created_at
        from credit_ledger where user_id = p_user_id order by created_at desc limit 25
      ) ll
    )
  );
$$;

revoke all on function admin_list_users(text, int, int) from public;
revoke all on function admin_get_user(uuid)             from public;
grant execute on function admin_list_users(text, int, int) to service_role;
grant execute on function admin_get_user(uuid)             to service_role;

-- These functions run as service_role (SECURITY INVOKER) via PostgREST and
-- read auth.users, but service_role has no SELECT on auth.users by default
-- (you'd get "permission denied for table users", code 42501). Grant it.
-- service_role is a server-only privileged role (used with the secret key),
-- so reading auth.users is consistent with its purpose.
grant usage  on schema auth      to service_role;
grant select on table auth.users to service_role;
