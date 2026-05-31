# Database Tables

## players

```sql
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  email_address text,
  username text,
  region text,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_banned boolean default false,
  is_authorized boolean not null default false,
  access_granted_at timestamptz
);
create index if not exists idx_players_wallet on players (wallet_address);
```

## player_access_requests

```sql
create table if not exists player_access_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete set null,
  wallet_address text not null,
  email text not null,
  status text not null default 'pending',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (wallet_address)
);
create index if not exists idx_access_requests_status on player_access_requests (status);
```

## players progression (merged)

```sql
alter table if exists players
  add column if not exists level int not null default 1,
  add column if not exists total_xp bigint not null default 0,
  add column if not exists unspent_points int not null default 0,
  add column if not exists unlocked_tiers text[] not null default '{normal_1}',
  add column if not exists lick_tongue_count int not null default 0,
  add column if not exists stat_allocations jsonb not null default '{}'::jsonb,
  add column if not exists derived_stats jsonb not null default '{}'::jsonb,
  add column if not exists equipped_wearables jsonb not null default '[]'::jsonb,
  add column if not exists allocation_history jsonb not null default '[]'::jsonb,
  add column if not exists last_synced_at timestamptz;
```

## players preferences (merged)

```sql
alter table if exists players
  add column if not exists selected_character_id text,
  add column if not exists selected_difficulty_tier text,
  add column if not exists gotchi_sprite_url text,
  add column if not exists avatar_id text,
  add column if not exists audio_settings jsonb not null default jsonb_build_object(
    'masterVolume', 70,
    'sfxVolume', 80,
    'musicVolume', 60,
    'muted', false
  );
```

## player_inventories

```sql
create table if not exists player_inventories (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  item_type text not null,
  item_name text not null,
  quantity int not null default 1,
  item_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (player_id, item_type, item_name)
);
create index if not exists idx_inv_player on player_inventories (player_id);
```

## player_inventory_events

```sql
create table if not exists player_inventory_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  item_type text not null,
  item_name text not null,
  delta int not null,
  reason text not null,
  game_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_inv_events_player on player_inventory_events (player_id, created_at desc);
```

## games

```sql
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id text unique not null,
  host_player_id uuid references players(id),
  seed int not null,
  region text not null,
  difficulty_tier text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_enemy_kills int not null default 0,
  in_treasure_room boolean not null default false,
  next_timed_spawn_at timestamptz,
  pg_threshold_kills int not null default 0,
  pg_kills_until_chance int not null default 0,
  pg_spawn_chance_percent int not null default 10
);
create index if not exists idx_games_status_started on games (status, started_at desc);
```

## game_players

```sql
create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  character_id text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  kills int not null default 0,
  deaths int not null default 0,
  damage_dealt bigint not null default 0,
  damage_taken bigint not null default 0,
  coins_collected int not null default 0,
  usdc_earned_base_units bigint not null default 0,
  xp_gained int not null default 0,
  level_before int,
  level_after int,
  unique (game_id, player_id)
);
create index if not exists idx_game_players_game on game_players (game_id);
```

## enemy_kills

```sql
create table if not exists enemy_kills (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  enemy_type text not null,
  at timestamptz not null default now(),
  location jsonb not null default '{}'::jsonb
);
create index if not exists idx_enemy_kills_game on enemy_kills (game_id, at desc);
```

## enemy_drops

```sql
create table if not exists enemy_drops (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  enemy_kill_id uuid references enemy_kills(id) on delete set null,
  loot_distribution_id uuid references loot_distributions(id) on delete set null,
  enemy_type text not null,
  drop_table text,
  rolled_weight numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_enemy_drops_game on enemy_drops (game_id, created_at desc);
create index if not exists idx_enemy_drops_enemy on enemy_drops (enemy_type);
```

## chest_opens

```sql
create table if not exists chest_opens (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  chest_entity_id text,
  difficulty_tier text not null,
  reward_summary jsonb not null default '[]'::jsonb,
  at timestamptz not null default now()
);
create index if not exists idx_chest_opens_game on chest_opens (game_id, at desc);
```

## loot_catalog

```sql
create table if not exists loot_catalog (
  id uuid primary key default gen_random_uuid(),
  loot_type text not null check (loot_type in ('erc20','erc721','erc1155','virtual')),
  chain_id int not null default 8453,
  token_address text,
  token_id numeric,
  decimals smallint,
  name text,
  remaining numeric,
  last_claimed timestamptz,
  reloaded_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_loot_active on loot_catalog (is_active);
```

## loot_distributions

```sql
create table if not exists loot_distributions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  loot_id uuid references loot_catalog(id) on delete set null,
  source text not null,
  amount numeric not null,
  probability numeric,
  expected_value numeric,
  entity_id text,
  created_at timestamptz not null default now(),
  claimed boolean not null default false,
  claim_tx_hash text,
  claim_at timestamptz
);
create index if not exists idx_loot_dist_player_claimed on loot_distributions (player_id, claimed, created_at desc);
```

## top_ups

```sql
create table if not exists top_ups (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete set null,
  amount_base_units bigint not null,
  currency text not null default 'USDC',
  status text not null default 'pending',
  provider text,
  provider_ref text,
  chain_id int default 8453,
  tx_hash text,
  block_number bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  paid_at timestamptz,
  failure_reason text
);
create index if not exists idx_topups_status on top_ups (status, created_at desc);
```

## payouts

```sql
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  amount_base_units bigint not null,
  currency text not null default 'USDC',
  status text not null default 'queued',
  tx_hash text,
  created_at timestamptz default now(),
  sent_at timestamptz,
  failure_reason text
);
create index if not exists idx_payouts_player on payouts (player_id, created_at desc);
```

## economy_transactions

```sql
create table if not exists economy_transactions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  currency text not null,
  amount bigint not null,
  source text not null,
  game_id uuid,
  loot_distribution_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_econ_player_time on economy_transactions (player_id, created_at desc);
```

## auth_sessions

```sql
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  wallet_address text not null,
  nonce text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  user_agent text,
  ip inet,
  valid boolean not null default true
);
create index if not exists idx_auth_wallet_valid on auth_sessions (wallet_address, valid);
```

## aavegotchi_characters

```sql
create table if not exists aavegotchi_characters (
  id uuid primary key default gen_random_uuid(),
  gotchi_id text not null,
  owner_address text not null,
  wearable_slugs text[] not null default '{}',
  last_synced_at timestamptz default now(),
  unique (gotchi_id)
);
```

## player_equipment

```sql
create table if not exists player_equipment (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  slot text not null,
  wearable_slug text not null,
  source text not null default 'inventory',
  updated_at timestamptz default now(),
  unique (player_id, slot)
);
```
