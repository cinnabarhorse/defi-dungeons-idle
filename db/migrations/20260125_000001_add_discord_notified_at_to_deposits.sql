alter table public.deposits
  add column if not exists discord_notified_at timestamptz;

create index if not exists idx_deposits_discord_notified_at
  on public.deposits (discord_notified_at);
