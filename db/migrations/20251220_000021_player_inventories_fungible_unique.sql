begin;

-- Restore unique constraint semantics for fungible items (non-wearables)
-- to support "ON CONFLICT (player_id, item_type, item_name)" upserts.
-- Wearables are non-fungible and must allow multiple rows; they are excluded.

create unique index if not exists idx_player_inventories_fungible_unique
  on player_inventories (player_id, item_type, item_name)
  where lower(item_type) <> 'wearable';

commit;


