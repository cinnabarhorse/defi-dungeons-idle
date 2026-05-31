-- Track when players use their daily quest attunements (start competition runs)
-- This is separate from the leaderboard entries, which are only created on boss kill.
-- Attunement is consumed when the player starts a run with dailyQuestActive=true.

create table if not exists daily_quest_attunements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  difficulty_id text not null, -- 'normal', 'nightmare', 'hell'
  account_id uuid not null references players(id) on delete cascade,
  
  -- Run metadata
  game_id uuid not null,
  used_at timestamptz not null default now(),
  
  -- Tracking
  created_at timestamptz not null default now(),
  
  -- Each player can only use one attunement per day per difficulty tier
  unique (date, difficulty_id, account_id)
);

-- Index for checking if attunement was used
create index if not exists idx_daily_quest_attunements_lookup
  on daily_quest_attunements (date, difficulty_id, account_id);

-- Index for finding attunements by game
create index if not exists idx_daily_quest_attunements_game
  on daily_quest_attunements (game_id);


