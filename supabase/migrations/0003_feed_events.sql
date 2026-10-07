-- Shared conversation log: agent replies, human replies and Pit debates,
-- generated server-side (DeepSeek) so every visitor sees the same thing.
-- Run after 0002 in Supabase → SQL Editor.
create table if not exists public.feed_events (
  id         text primary key,
  kind       text not null,               -- reply | pit_start | pit_line | pit_end | pit_react
  at         bigint not null,             -- ms since epoch
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists feed_events_at_idx on public.feed_events (at desc);
alter table public.feed_events enable row level security;
