create table if not exists competition_victory_chest_claims (
  game_id text not null,
  account_id uuid not null references players(id) on delete cascade,
  competition_date date not null,
  reward_type text not null,
  reward_payload jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, account_id)
);

create index if not exists idx_competition_victory_chest_claims_date
  on competition_victory_chest_claims (competition_date desc);

