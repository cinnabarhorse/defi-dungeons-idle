do $$
begin
  create type token_withdrawal_status as enum (
    'received',
    'withdrawal_waiting',
    'withdrawal_pending',
    'withdrawal_confirmed',
    'withdrawal_failed'
  );
exception
  when duplicate_object then null;
end$$;

create table if not exists token_withdrawals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,

  currency text not null default 'USDC',
  amount text not null,
  amount_base_units bigint not null,

  source text not null,
  game_id uuid references games(id) on delete set null,
  loot_distribution_id uuid references loot_distributions(id) on delete set null,
  economy_transaction_id uuid references economy_transactions(id) on delete set null,

  status token_withdrawal_status not null default 'received',

  tx_hash text,
  chain_id bigint default 8453,
  token_contract_address text default '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',

  received_at timestamptz not null default now(),
  withdrawal_requested_at timestamptz,
  withdrawal_approved_at timestamptz,
  withdrawal_pending_at timestamptz,
  withdrawal_confirmed_at timestamptz,

  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_token_withdrawals_player_status
  on token_withdrawals (player_id, status, created_at desc);

create index if not exists idx_token_withdrawals_status
  on token_withdrawals (status, created_at desc);

create index if not exists idx_token_withdrawals_tx_hash
  on token_withdrawals (tx_hash)
  where tx_hash is not null;

create unique index if not exists idx_token_withdrawals_tx_hash_unique
  on token_withdrawals (tx_hash)
  where tx_hash is not null;

create trigger token_withdrawals_set_updated_at
before update on token_withdrawals
for each row execute function set_updated_at();
