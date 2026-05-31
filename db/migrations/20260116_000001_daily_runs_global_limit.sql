-- Change daily quest attunements from per-tier limit to global limit
-- Players now get 3 runs total per day that can be used on any difficulty tier

-- Drop the old unique constraint that enforced 1 run per tier
alter table daily_quest_attunements 
  drop constraint if exists daily_quest_attunements_date_difficulty_id_account_id_key;

-- Add a new index for efficient counting of runs per day per account
create index if not exists idx_daily_quest_attunements_daily_count
  on daily_quest_attunements (date, account_id);

-- Note: The 3-run-per-day limit is enforced in application code
-- via hasRemainingDailyRuns() check before inserting new records
