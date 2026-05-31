create table if not exists player_daily_run_bonus (
  date date not null,
  account_id uuid not null references players(id) on delete cascade,
  mode text not null check (mode in ('progression', 'competition')),
  bonus_runs integer not null default 0 check (bonus_runs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date, account_id, mode)
);

create index if not exists idx_player_daily_run_bonus_account_date
  on player_daily_run_bonus (account_id, date desc);

