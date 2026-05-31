do $$
begin
  create type payment_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled');
exception when duplicate_object then null;
end$$;

do $$
begin
  create type payout_status as enum ('queued', 'processing', 'sent', 'failed', 'cancelled');
exception when duplicate_object then null;
end$$;

create table if not exists top_ups (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  amount_base_units bigint not null,
  currency text not null,
  status payment_status not null default 'pending',
  provider text,
  provider_ref text,
  chain_id text,
  tx_hash text,
  block_number bigint,
  paid_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_top_ups_provider_ref
  on top_ups (provider, provider_ref)
  where provider is not null and provider_ref is not null;

create index if not exists idx_top_ups_player_status
  on top_ups (player_id, status, created_at desc);

create trigger top_ups_set_updated_at
before update on top_ups
for each row execute function set_updated_at();

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  amount_base_units bigint not null,
  currency text not null,
  status payout_status not null default 'queued',
  tx_hash text,
  chain_id text,
  sent_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payouts_player_status
  on payouts (player_id, status, created_at desc);

create trigger payouts_set_updated_at
before update on payouts
for each row execute function set_updated_at();

create table if not exists economy_transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  currency text not null,
  amount numeric(30,10) not null,
  source text not null,
  game_id uuid references games(id) on delete set null,
  loot_distribution_id uuid references loot_distributions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_economy_transactions_player_created
  on economy_transactions (player_id, created_at desc);

create index if not exists idx_economy_transactions_game
  on economy_transactions (game_id);
