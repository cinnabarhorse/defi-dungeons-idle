create table if not exists player_progression (
  player_id uuid primary key references players(id) on delete cascade,
  level int not null default 1,
  total_xp bigint not null default 0,
  unspent_points int not null default 0,
  unlocked_tiers text[] not null default '{normal_1}',
  lick_tongue_count int not null default 0,
  stat_allocations jsonb not null default '{}'::jsonb,
  derived_stats jsonb not null default '{}'::jsonb,
  equipped_wearables jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

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

create trigger player_inventories_set_updated_at
before update on player_inventories
for each row execute function set_updated_at();

create index if not exists idx_inv_player on player_inventories (player_id);

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

create table if not exists player_equipment (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  slot text not null,
  wearable_slug text not null,
  source text not null default 'inventory',
  updated_at timestamptz default now(),
  unique (player_id, slot)
);

create trigger player_equipment_set_updated_at
before update on player_equipment
for each row execute function set_updated_at();
