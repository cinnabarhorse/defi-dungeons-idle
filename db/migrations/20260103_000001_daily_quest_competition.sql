-- Daily Quest Competition Leaderboard
-- Stores player entries for the competitive daily quest system
-- Each player can have one entry per day per difficulty tier (their best score)

create table if not exists daily_quest_leaderboard (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  difficulty_id text not null,
  account_id uuid not null references players(id) on delete cascade,
  
  -- Score data
  raw_score bigint not null,
  time_multiplier numeric(4,2) not null default 1.00,
  final_score bigint not null,  -- raw_score * time_multiplier, stored for fast sorting
  
  -- Run metadata
  run_id uuid not null,
  completed_at timestamptz not null,
  
  -- Denormalized for leaderboard display
  player_name text,
  gotchi_id text,
  
  -- Tracking
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Each player can only have one entry per day per difficulty
  unique (date, difficulty_id, account_id)
);

-- Indexes for leaderboard queries
create index if not exists idx_daily_quest_leaderboard_date_difficulty_score
  on daily_quest_leaderboard (date, difficulty_id, final_score desc);

create index if not exists idx_daily_quest_leaderboard_account_date
  on daily_quest_leaderboard (account_id, date desc);

-- Prize distribution audit log
-- Records all prize distributions for audit and debugging
create table if not exists daily_quest_prize_distributions (
  id uuid primary key default gen_random_uuid(),
  
  -- What day and tier was this for
  competition_date date not null,
  difficulty_id text not null,
  
  -- Winner info
  account_id uuid not null references players(id) on delete cascade,
  leaderboard_entry_id uuid references daily_quest_leaderboard(id) on delete set null,
  position integer not null check (position >= 1 and position <= 10),
  final_score bigint not null,
  
  -- Prize amounts
  usdc_amount numeric(12,6) not null default 0,
  ghst_amount numeric(12,6) not null default 0,
  
  -- Token withdrawal references (for tracking)
  usdc_withdrawal_id uuid references token_withdrawals(id) on delete set null,
  ghst_withdrawal_id uuid references token_withdrawals(id) on delete set null,
  
  -- Distribution status
  status text not null default 'pending' check (status in ('pending', 'distributed', 'failed')),
  distributed_at timestamptz,
  error_message text,
  
  -- Tracking
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- One prize per position per day per difficulty
  unique (competition_date, difficulty_id, position)
);

-- Indexes for prize distribution queries
create index if not exists idx_daily_quest_prizes_date_difficulty
  on daily_quest_prize_distributions (competition_date, difficulty_id);

create index if not exists idx_daily_quest_prizes_account
  on daily_quest_prize_distributions (account_id, created_at desc);

create index if not exists idx_daily_quest_prizes_status
  on daily_quest_prize_distributions (status) where status = 'pending';

-- Track player's daily quest tier unlock status
-- Uses existing lick_tongue_count column on players table
-- Thresholds: Normal=42, Nightmare=100, Hell=500

alter table players 
  add column if not exists daily_quest_unlocked_normal boolean not null default false,
  add column if not exists daily_quest_unlocked_nightmare boolean not null default false,
  add column if not exists daily_quest_unlocked_hell boolean not null default false;

-- Update unlock flags based on existing Lick Tongue counts
-- This will be called by the application when LT is earned
-- For now, we create a function to recalculate

create or replace function update_daily_quest_unlocks()
returns trigger as $$
begin
  -- Update unlock flags based on lick_tongue_count
  -- Using the thresholds: Normal=42, Nightmare=100, Hell=500
  new.daily_quest_unlocked_normal := coalesce(new.lick_tongue_count, 0) >= 42;
  new.daily_quest_unlocked_nightmare := coalesce(new.lick_tongue_count, 0) >= 100;
  new.daily_quest_unlocked_hell := coalesce(new.lick_tongue_count, 0) >= 500;
  return new;
end;
$$ language plpgsql;

-- Create trigger to update unlock flags when lick_tongue_count changes
drop trigger if exists trg_update_daily_quest_unlocks on players;
create trigger trg_update_daily_quest_unlocks
  before insert or update of lick_tongue_count on players
  for each row
  execute function update_daily_quest_unlocks();

-- Backfill existing players
update players set
  daily_quest_unlocked_normal = coalesce(lick_tongue_count, 0) >= 42,
  daily_quest_unlocked_nightmare = coalesce(lick_tongue_count, 0) >= 100,
  daily_quest_unlocked_hell = coalesce(lick_tongue_count, 0) >= 500;

