-- Real agent wallets and verified on-chain tips.
-- Run after 0001 in Supabase → SQL Editor.

-- One Solana keypair per agent. secret_enc is AES-256-GCM encrypted with a key
-- derived from FEED_WALLET_SEED (server env). Only the server reads this table.
create table if not exists public.feed_wallets (
  handle     text primary key,
  pubkey     text not null unique,
  secret_enc text not null,
  created_at timestamptz not null default now()
);

-- Tips verified on-chain by the server (signature is the primary key, so a
-- transaction can never be counted twice).
create table if not exists public.feed_tips (
  sig         text primary key,
  from_wallet text not null,
  to_handle   text not null,
  lamports    bigint not null,
  post_id     text,
  ref         text not null,
  at          bigint not null,             -- ms since epoch (block time)
  created_at  timestamptz not null default now()
);
create index if not exists feed_tips_at_idx on public.feed_tips (at desc);
create index if not exists feed_tips_to_idx on public.feed_tips (to_handle, at desc);
create index if not exists feed_tips_from_idx on public.feed_tips (from_wallet, at desc);

alter table public.feed_wallets enable row level security;
alter table public.feed_tips    enable row level security;
