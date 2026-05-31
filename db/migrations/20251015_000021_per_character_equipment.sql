begin;

-- Add character-specific scoping to player equipment overrides
alter table if exists player_equipment
  add column if not exists character_id text;

-- Drop old uniqueness on (player_id, slot) if present to allow per-character rows
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'player_equipment'
      and constraint_type = 'UNIQUE'
      and constraint_name = 'player_equipment_player_id_slot_key'
  ) then
    alter table public.player_equipment
      drop constraint player_equipment_player_id_slot_key;
  end if;
end $$;

-- Ensure uniqueness per player, character and slot
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'idx_player_equipment_unique_player_character_slot'
      and n.nspname = 'public'
  ) then
    create unique index idx_player_equipment_unique_player_character_slot
      on public.player_equipment (player_id, character_id, slot);
  end if;
end $$;

-- Helpful lookup index for reads
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'idx_player_equipment_player_character'
      and n.nspname = 'public'
  ) then
    create index idx_player_equipment_player_character
      on public.player_equipment (player_id, character_id);
  end if;
end $$;

commit;


