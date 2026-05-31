-- Remove Lick Tongue requirements for daily quest competition
-- All tiers are now open to everyone regardless of Lick Tongue count

-- Step 1: Update all existing players to have all tiers unlocked
UPDATE players
SET 
  daily_quest_unlocked_normal = true,
  daily_quest_unlocked_nightmare = true,
  daily_quest_unlocked_hell = true;

-- Step 2: Update the trigger to always unlock all tiers for new players
CREATE OR REPLACE FUNCTION update_daily_quest_unlocks()
RETURNS TRIGGER AS $$
BEGIN
  -- All tiers are now unlocked by default (no Lick Tongue requirement)
  new.daily_quest_unlocked_normal := true;
  new.daily_quest_unlocked_nightmare := true;
  new.daily_quest_unlocked_hell := true;
  return new;
END;
$$ LANGUAGE plpgsql;
