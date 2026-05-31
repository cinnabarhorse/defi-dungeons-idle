begin;

truncate table player_equipment;
truncate table player_inventory_events;
truncate table player_inventories;

alter table if exists player_inventories
  drop constraint if exists player_inventories_player_id_item_type_item_name_key;

alter table if exists player_inventories
  add column if not exists instance_id uuid not null default gen_random_uuid(),
  add column if not exists wearable_slug text,
  add column if not exists quality text not null default 'average',
  add column if not exists quality_score int,
  add column if not exists durability_score int not null default 1000;

alter table if exists player_inventories
  add constraint player_inventories_quality_check
    check (
      quality in ('broken', 'budget', 'average', 'excellent', 'flawless')
    );

create unique index if not exists idx_player_inventories_instance_id
  on player_inventories (instance_id);

alter table if exists player_equipment
  add column if not exists inventory_item_id uuid references player_inventories(id);

alter table if exists player_inventory_events
  add column if not exists inventory_item_id uuid;

commit;
