-- Remove unused columns from games table
-- These columns are no longer used in the codebase:
-- - in_treasure_room: Treasure room feature removed
-- - pg_threshold_kills, pg_kills_until_chance, pg_spawn_chance_percent: Portal Guardian spawn logic removed

alter table games
  drop column if exists in_treasure_room,
  drop column if exists pg_threshold_kills,
  drop column if exists pg_kills_until_chance,
  drop column if exists pg_spawn_chance_percent;
