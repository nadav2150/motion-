-- Durable queue for Studio (v2) operations.
--
-- The API routes used to run generate / regenerate / edit / render
-- fire-and-forget inside the web server process, so any restart killed the
-- video mid-stage. They now insert a studio_tasks row (after reserving
-- credits) and a separate worker process (app/lib/studio/worker.ts) claims
-- and runs it. A worker heartbeats every 15 s while a task runs; a task whose
-- heartbeat goes stale (worker crashed, container restarted) is claimed again
-- and resumes from the checkpoints the pipeline persisted.
--
--   queued ──claim──▶ running ──▶ done
--      ▲                 │
--      └──retry (error)──┤  attempts < max_attempts: back to queued after run_after
--                        └──▶ failed  (attempts exhausted)
--
-- Only the service role touches this table (RLS on, no other policies).

create table if not exists studio_tasks (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  kind         text not null check (kind in ('generate', 'regenerate', 'edit', 'render')),
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'queued'
               check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  attempts     int  not null default 0,
  max_attempts int  not null default 3,
  run_after    timestamptz not null default now(),  -- retry backoff: not claimable before this
  worker_id    text,
  locked_at    timestamptz,
  heartbeat_at timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists studio_tasks_status_created_idx on studio_tasks (status, created_at);
create index if not exists studio_tasks_job_idx on studio_tasks (job_id);

-- At most one live task per job. The routes already claim the job (409 when
-- busy) before enqueueing; this makes a double-run impossible even if two
-- requests race past that check.
create unique index if not exists studio_tasks_one_active_per_job
  on studio_tasks (job_id) where status in ('queued', 'running');

alter table studio_tasks enable row level security;
drop policy if exists "service_role full access on studio_tasks" on studio_tasks;
create policy "service_role full access on studio_tasks"
  on studio_tasks for all to service_role using (true) with check (true);

-- Claim the oldest claimable task of the given kinds: queued (and past its
-- run_after), or running with a heartbeat older than p_stale_seconds (its
-- worker died). `for update skip locked` lets several workers claim at once
-- without blocking on or double-claiming the same row. Returns 0 or 1 rows.
create or replace function claim_studio_task(p_worker text, p_kinds text[], p_stale_seconds int default 90)
returns setof studio_tasks
language plpgsql
as $$
declare
  v_id uuid;
begin
  select t.id
    into v_id
    from studio_tasks t
   where t.kind = any (p_kinds)
     and t.attempts < t.max_attempts
     and (
           (t.status = 'queued' and t.run_after <= now())
        or (t.status = 'running'
            and coalesce(t.heartbeat_at, t.locked_at, t.created_at) < now() - make_interval(secs => p_stale_seconds))
         )
   order by t.created_at
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
    update studio_tasks
       set status       = 'running',
           attempts     = attempts + 1,
           worker_id    = p_worker,
           locked_at    = now(),
           heartbeat_at = now(),
           updated_at   = now()
     where id = v_id
    returning *;
end;
$$;

-- Heartbeat: bump the task (only while this worker still owns it) and the
-- job's updated_at. Returns false when the task was lost (re-claimed by
-- another worker after a stall, or finished/failed elsewhere).
create or replace function heartbeat_studio_task(p_task uuid, p_worker text)
returns boolean
language plpgsql
as $$
declare
  v_job uuid;
begin
  update studio_tasks
     set heartbeat_at = now(),
         updated_at   = now()
   where id = p_task
     and worker_id = p_worker
     and status = 'running'
  returning job_id into v_job;

  if v_job is null then
    return false;
  end if;

  update jobs set updated_at = now() where id = v_job;
  return true;
end;
$$;

-- Tasks that can never be claimed again: every attempt used and the last
-- worker gone quiet (or re-queued with no attempts left). Marks them failed
-- and returns them so the caller can fail the job and settle its credits.
create or replace function fail_exhausted_studio_tasks(p_stale_seconds int default 90)
returns setof studio_tasks
language plpgsql
as $$
begin
  return query
    update studio_tasks
       set status     = 'failed',
           last_error = coalesce(last_error || ' · ', '') || 'no attempts left',
           updated_at = now()
     where attempts >= max_attempts
       and (
             status = 'queued'
          or (status = 'running'
              and coalesce(heartbeat_at, locked_at, created_at) < now() - make_interval(secs => p_stale_seconds))
           )
    returning *;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated as well; revoke those explicitly, not just PUBLIC.
revoke all on function claim_studio_task(text, text[], int) from public, anon, authenticated;
revoke all on function heartbeat_studio_task(uuid, text) from public, anon, authenticated;
revoke all on function fail_exhausted_studio_tasks(int) from public, anon, authenticated;
grant execute on function claim_studio_task(text, text[], int) to service_role;
grant execute on function heartbeat_studio_task(uuid, text) to service_role;
grant execute on function fail_exhausted_studio_tasks(int) to service_role;
