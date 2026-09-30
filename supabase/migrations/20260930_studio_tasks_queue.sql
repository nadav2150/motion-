-- Separate Studio task queues per environment.
--
-- Local development and production share one Supabase project, so a
-- production worker was claiming jobs created on a developer's machine (and a
-- local worker could claim production jobs). Tasks now carry a `queue`, and a
-- worker claims only its own queue.
--
-- Backward compatible on purpose: code deployed before this migration neither
-- sets `queue` on insert nor passes it to claim_studio_task, so both default
-- to 'prod' — an already-deployed production worker keeps working and stops
-- seeing 'dev' tasks without a redeploy.

alter table studio_tasks add column if not exists queue text not null default 'prod';
create index if not exists studio_tasks_queue_status_idx on studio_tasks (queue, status, created_at);

drop function if exists claim_studio_task(text, text[], int);

create or replace function claim_studio_task(
  p_worker text,
  p_kinds text[],
  p_stale_seconds int default 90,
  p_queue text default 'prod'
)
returns setof studio_tasks
language plpgsql
as $$
declare
  v_id uuid;
begin
  select t.id
    into v_id
    from studio_tasks t
   where t.queue = p_queue
     and t.kind = any (p_kinds)
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

revoke all on function claim_studio_task(text, text[], int, text) from public, anon, authenticated;
grant execute on function claim_studio_task(text, text[], int, text) to service_role;
