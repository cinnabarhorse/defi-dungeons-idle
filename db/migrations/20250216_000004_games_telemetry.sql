create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique,
  seed integer,
  region text,
  difficulty_tier text,
  status text not null default 'active',
  is_private boolean not null default false,
  max_players integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_enemy_kills integer not null default 0,
  in_treasure_room boolean not null default false,
  next_timed_spawn_at timestamptz,
  pg_threshold_kills integer not null default 0,
  pg_kills_until_chance integer not null default 0,
  pg_spawn_chance_percent numeric(6,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create trigger games_set_updated_at
before update on games
for each row execute function set_updated_at();

create index if not exists idx_games_status on games (status);
create index if not exists idx_games_region_status on games (region, status);

create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  character_id text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  kills integer not null default 0,
  deaths integer not null default 0,
  damage_dealt integer not null default 0,
  damage_taken integer not null default 0,
  coins_collected integer not null default 0,
  usdc_earned_base_units bigint not null default 0,
  xp_gained bigint not null default 0,
  level_before integer,
  level_after integer,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create trigger game_players_set_updated_at
before update on game_players
for each row execute function set_updated_at();

create index if not exists idx_game_players_game on game_players (game_id);
create index if not exists idx_game_players_player on game_players (player_id);

create table if not exists enemy_kills (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  enemy_type text not null,
  enemy_id text,
  attack_type text,
  weapon_type text,
  location jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_enemy_kills_game on enemy_kills (game_id);
create index if not exists idx_enemy_kills_player on enemy_kills (player_id);
create index if not exists idx_enemy_kills_enemy_type on enemy_kills (enemy_type);
