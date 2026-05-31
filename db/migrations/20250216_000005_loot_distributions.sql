create table if not exists loot_distributions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  loot_id text,
  source text not null,
  amount numeric(30,10),
  probability numeric(10,6),
  expected_value numeric(30,10),
  entity_id text,
  claimed boolean not null default false,
  claim_tx_hash text,
  claim_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger loot_distributions_set_updated_at
before update on loot_distributions
for each row execute function set_updated_at();

create index if not exists idx_loot_distributions_player_claimed
  on loot_distributions (player_id, claimed, created_at desc);

create index if not exists idx_loot_distributions_game
  on loot_distributions (game_id, created_at desc);
