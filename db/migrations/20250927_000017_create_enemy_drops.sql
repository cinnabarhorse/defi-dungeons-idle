-- Create enemy_drops table used to log enemy loot outcomes

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


