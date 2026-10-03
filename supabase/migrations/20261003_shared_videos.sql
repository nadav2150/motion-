-- Public share links (/v/:slug). An admin attaches a finished video (a Studio
-- revision or an uploaded MP4) to a slug and sends the link to someone, e.g.
-- as a Reddit reply. Visitors need no account: the page is rendered by a
-- server loader with the service-role client, so the table is service-role
-- only.
--
-- Apply via the Supabase SQL editor or the session pooler; `supabase db push`
-- collides on the duplicate 20260601_* prefixes.

create table if not exists shared_videos (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  title        text not null,
  recipient    text,
  message      text,
  job_id       uuid references jobs(id) on delete set null,
  video_path   text not null,
  thumb_path   text,
  views        integer not null default 0,
  downloads    integer not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  disabled_at  timestamptz
);

create index if not exists shared_videos_created_at_idx on shared_videos (created_at desc);

alter table shared_videos enable row level security;

drop policy if exists "service_role full access on shared_videos" on shared_videos;
create policy "service_role full access on shared_videos"
  on shared_videos for all to service_role using (true) with check (true);

-- Atomic view / download counters.
create or replace function shared_video_bump(p_slug text, p_field text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_field = 'views' then
    update shared_videos set views = views + 1 where slug = p_slug and disabled_at is null;
  elsif p_field = 'downloads' then
    update shared_videos set downloads = downloads + 1 where slug = p_slug and disabled_at is null;
  end if;
end;
$$;

revoke all on function shared_video_bump(text, text) from public, anon, authenticated;
grant execute on function shared_video_bump(text, text) to service_role;
