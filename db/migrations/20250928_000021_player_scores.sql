alter table players
  add column if not exists highest_score integer not null default 0;

create table if not exists run_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  score integer not null check (score >= 0),
  difficulty_tier text,
  completed_at timestamptz not null default now(),
  duration_ms integer,
  kills integer,
  xp_earned integer,
  valid_for_high_score boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_run_scores_player_score on run_scores (player_id, score desc);
create index if not exists idx_run_scores_game on run_scores (game_id);
