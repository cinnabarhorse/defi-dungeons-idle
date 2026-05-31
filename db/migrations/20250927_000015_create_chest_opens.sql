-- Create chest_opens table used to log treasure chest outcomes

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


