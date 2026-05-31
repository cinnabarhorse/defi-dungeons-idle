alter table if exists competition_trade_runs
  add column if not exists close_at timestamptz;

update competition_trade_runs
set close_at = entry_sampled_at + interval '15 minutes'
where close_at is null;

alter table competition_trade_runs
  alter column close_at set not null;

alter table if exists competition_trade_runs
  add column if not exists update_count integer not null default 0;

create index if not exists idx_competition_trade_runs_state_close_at
  on competition_trade_runs (state, close_at);

create index if not exists idx_competition_trade_runs_account_state_close_at
  on competition_trade_runs (account_id, state, close_at);
