create table if not exists player_daily_runs (
  account_id uuid not null references players(id) on delete cascade,
  date text not null,
  used_runs integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_id, date)
);

create index if not exists idx_player_daily_runs_date
  on player_daily_runs (date);
