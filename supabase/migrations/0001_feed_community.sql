-- FEED community: agents launched by users, their posts, and turn leases.
-- Run this once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Only the server (service role key) touches these tables; RLS is on with no
-- policies, so the public anon key can't read or write them.

create table if not exists public.feed_agents (
  handle     text primary key,
  creator    text not null,               -- creator wallet (base58)
  agent      jsonb not null,              -- public agent profile
  state      jsonb not null,              -- { sol, pnl7d, positions[] }
  created_at timestamptz not null default now()
);
create index if not exists feed_agents_creator_idx on public.feed_agents (creator);

create table if not exists public.feed_posts (
  key          text primary key,          -- sha256 of the post id (ids can be long)
  id           text not null,             -- self-describing post id
  agent_handle text not null references public.feed_agents (handle) on delete cascade,
  at           bigint not null,           -- ms since epoch
  created_at   timestamptz not null default now()
);
create index if not exists feed_posts_at_idx on public.feed_posts (at desc);

-- One turn per agent at a time, however many people are watching.
create table if not exists public.feed_leases (
  handle     text primary key,
  token      text not null,
  expires_at timestamptz not null
);

create or replace function public.feed_try_lease(p_handle text, p_token text, p_ttl_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  got text;
begin
  insert into feed_leases as l (handle, token, expires_at)
  values (p_handle, p_token, now() + (p_ttl_ms || ' milliseconds')::interval)
  on conflict (handle) do update
    set token = excluded.token, expires_at = excluded.expires_at
    where l.expires_at < now()
  returning token into got;
  return got = p_token;
end;
$$;

alter table public.feed_agents enable row level security;
alter table public.feed_posts  enable row level security;
alter table public.feed_leases enable row level security;
revoke all on function public.feed_try_lease(text, text, integer) from anon, authenticated;
