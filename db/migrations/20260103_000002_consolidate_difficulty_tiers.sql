-- Consolidate Difficulty Tiers Migration
-- 
-- This migration consolidates the 9 sub-tiers (normal_1, normal_2, normal_3, etc.)
-- into 3 main tiers (normal, nightmare, hell).
--
-- Mapping:
--   normal_1, normal_2, normal_3 → normal
--   nightmare_1, nightmare_2, nightmare_3 → nightmare
--   hell_1, hell_2, hell_3, beyond_hell → hell

-- Step 1: Create a function to normalize tier IDs
create or replace function normalize_tier_id(tier_id text) returns text as $$
begin
  if tier_id like 'normal%' then return 'normal';
  elsif tier_id like 'nightmare%' then return 'nightmare';
  elsif tier_id like 'hell%' or tier_id = 'beyond_hell' then return 'hell';
  else return tier_id;
  end if;
end;
$$ language plpgsql immutable;

-- Step 2: Create a function to normalize an array of tier IDs
create or replace function normalize_tier_array(tiers text[]) returns text[] as $$
declare
  result text[] := '{}';
  tier text;
  normalized text;
begin
  foreach tier in array coalesce(tiers, '{normal}')
  loop
    normalized := normalize_tier_id(tier);
    -- Only add if not already in result (dedup)
    if not normalized = any(result) then
      result := result || normalized;
    end if;
  end loop;
  
  -- Ensure at least 'normal' is present
  if array_length(result, 1) is null or array_length(result, 1) = 0 then
    result := '{normal}';
  end if;
  
  return result;
end;
$$ language plpgsql immutable;

-- Step 3: Update all players' unlocked_tiers to use new simplified tier IDs
update players
set unlocked_tiers = normalize_tier_array(unlocked_tiers)
where unlocked_tiers is not null
  and unlocked_tiers != normalize_tier_array(unlocked_tiers);

-- Step 4: Update players where unlocked_tiers is null to default
update players
set unlocked_tiers = '{normal}'
where unlocked_tiers is null;

-- Step 5: Update the default for new players
alter table players 
  alter column unlocked_tiers set default '{normal}';

-- Step 6: Update run_scores table if it has difficulty_tier column
-- (This normalizes historical data for consistency)
update run_scores
set difficulty_tier = normalize_tier_id(difficulty_tier)
where difficulty_tier is not null
  and difficulty_tier != normalize_tier_id(difficulty_tier);

-- Step 7: Update games table if it has difficulty_tier column
update games
set difficulty_tier = normalize_tier_id(difficulty_tier)
where difficulty_tier is not null
  and difficulty_tier != normalize_tier_id(difficulty_tier);

-- Step 8: Update daily_quest_leaderboard entries (if any)
-- The competition already uses normalized tiers, but just in case
update daily_quest_leaderboard
set difficulty_id = normalize_tier_id(difficulty_id)
where difficulty_id is not null
  and difficulty_id != normalize_tier_id(difficulty_id);

-- Step 9: Update daily_quest_prize_distributions (if any)
update daily_quest_prize_distributions
set difficulty_id = normalize_tier_id(difficulty_id)
where difficulty_id is not null
  and difficulty_id != normalize_tier_id(difficulty_id);

-- Step 10: Update the daily quest unlock trigger to use new thresholds
-- Normal: 42 LT (for competition access)
-- Nightmare: 100 LT (for competition access)
-- Hell: 500 LT (for competition access)
-- Note: These are separate from the gameplay tier unlocks (0/50/275)
create or replace function update_daily_quest_unlocks()
returns trigger as $$
begin
  -- Update unlock flags based on lick_tongue_count
  -- Using the competition thresholds: Normal=42, Nightmare=100, Hell=500
  new.daily_quest_unlocked_normal := coalesce(new.lick_tongue_count, 0) >= 42;
  new.daily_quest_unlocked_nightmare := coalesce(new.lick_tongue_count, 0) >= 100;
  new.daily_quest_unlocked_hell := coalesce(new.lick_tongue_count, 0) >= 500;
  return new;
end;
$$ language plpgsql;

-- Ensure trigger exists
drop trigger if exists trg_update_daily_quest_unlocks on players;
create trigger trg_update_daily_quest_unlocks
  before insert or update of lick_tongue_count on players
  for each row
  execute function update_daily_quest_unlocks();

-- Step 11: Backfill daily quest unlock flags
update players set
  daily_quest_unlocked_normal = coalesce(lick_tongue_count, 0) >= 42,
  daily_quest_unlocked_nightmare = coalesce(lick_tongue_count, 0) >= 100,
  daily_quest_unlocked_hell = coalesce(lick_tongue_count, 0) >= 500;

-- Note: The normalize_tier_id and normalize_tier_array functions are kept
-- for backward compatibility with any queries that might use old tier IDs.



