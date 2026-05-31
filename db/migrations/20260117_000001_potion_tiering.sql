-- Migration: Add potion_tier column to support tiered health potions
-- Potion tiering system: T1 (Health Potion), T2 (Greater Healing Potion), T3 (Ultra Healing Potion)

begin;

-- Add potion_tier column to player_inventories
-- NULL for non-potion items, 1-3 for health potions
alter table player_inventories 
  add column if not exists potion_tier integer;

-- Add constraint to validate tier values (1-3 only, or NULL)
alter table player_inventories
  add constraint chk_potion_tier_valid
  check (potion_tier is null or potion_tier between 1 and 3);

-- Update existing health_potion items to tier 1
-- Match both item_type and item_name patterns that might exist
update player_inventories
   set potion_tier = 1
 where potion_tier is null
   and (
     lower(item_type) = 'health_potion'
     or lower(item_name) = 'health_potion'
     or lower(item_name) = 'health potion'
   );

-- Update item_name from snake_case to Title Case for consistency
-- This normalizes 'health_potion' to 'Health Potion'
update player_inventories
   set item_name = 'Health Potion'
 where lower(item_name) = 'health_potion';

-- Create index for efficient potion queries by tier
create index if not exists idx_player_inventories_potion_tier
  on player_inventories (player_id, potion_tier)
  where potion_tier is not null;

commit;

-- ROLLBACK MIGRATION (run manually if needed):
-- begin;
-- drop index if exists idx_player_inventories_potion_tier;
-- alter table player_inventories drop constraint if exists chk_potion_tier_valid;
-- alter table player_inventories drop column if exists potion_tier;
-- -- Note: item_name changes are not reverted (would need backup of original values)
-- commit;
