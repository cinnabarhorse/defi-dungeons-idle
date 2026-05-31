create extension if not exists pgcrypto;

create table if not exists competition_trade_runs (
  id uuid primary key default gen_random_uuid(),
  competition_date date not null,
  difficulty_id text not null,
  account_id uuid not null,
  run_id uuid not null,
  base_score integer not null,
  time_multiplier numeric not null,
  token text not null check (token in ('BTC', 'ETH', 'GHST')),
  direction text not null check (direction in ('long', 'short')),
  risk_leverage numeric not null check (risk_leverage >= 1 and risk_leverage <= 20),
  entry_price_usd numeric not null,
  entry_sampled_at timestamptz not null,
  state text not null default 'unsettled' check (state in ('unsettled', 'settled_manual', 'settled_close')),
  settle_reason text null check (settle_reason in ('manual', 'close')),
  settle_price_usd numeric null,
  settled_at timestamptz null,
  trade_multiplier numeric null,
  final_score bigint null,
  oracle_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_date, difficulty_id, account_id, run_id)
);

create index if not exists idx_competition_trade_runs_date_difficulty_state
  on competition_trade_runs (competition_date, difficulty_id, state);

create index if not exists idx_competition_trade_runs_account_date
  on competition_trade_runs (account_id, competition_date);

create index if not exists idx_competition_trade_runs_run_account
  on competition_trade_runs (run_id, account_id);
