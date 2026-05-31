create table if not exists daily_boss_high_scores (
  date date not null,
  difficulty_id text not null,
  score bigint not null default 0,
  account_id uuid references players(id) on delete set null,
  run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date, difficulty_id)
);

create index if not exists idx_daily_boss_high_scores_difficulty_date
  on daily_boss_high_scores (difficulty_id, date desc);

create index if not exists idx_daily_boss_high_scores_date_score
  on daily_boss_high_scores (date, score desc);

create table if not exists daily_high_stakes_state (
  date date not null,
  account_id uuid not null references players(id) on delete cascade,
  remaining_attunements integer not null default 1 check (remaining_attunements >= 0),
  active_difficulty_id text,
  active_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date, account_id)
);

create index if not exists idx_daily_high_stakes_state_active_run
  on daily_high_stakes_state (active_run_id);

create index if not exists idx_daily_high_stakes_state_date_account
  on daily_high_stakes_state (date, account_id);
