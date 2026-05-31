alter table games add column if not exists phase text not null default 'staging';
alter table games add column if not exists phase_changed_at timestamptz;
alter table games add column if not exists run_started_at timestamptz;
alter table games add column if not exists late_join_cutoff_at timestamptz;
alter table games add column if not exists auto_close_at timestamptz;
alter table games add column if not exists started_by_player_id uuid references players(id);

create index if not exists idx_games_phase on games (phase);
create index if not exists idx_games_auto_close_at on games (auto_close_at);
