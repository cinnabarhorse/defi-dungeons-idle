-- Add real-gotchi score metadata to daily quest leaderboard entries.
-- Real (owned/verified) gotchis receive a +25% final score bonus.

alter table daily_quest_leaderboard
  add column if not exists gotchi_bonus_multiplier numeric(4,2) not null default 1.00,
  add column if not exists is_real_gotchi boolean not null default false;

-- Ensure existing rows remain consistent with default no-bonus behavior.
update daily_quest_leaderboard
set gotchi_bonus_multiplier = 1.00,
    is_real_gotchi = false
where gotchi_bonus_multiplier is null
   or is_real_gotchi is null;
