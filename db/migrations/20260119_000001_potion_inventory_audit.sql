-- Audit potion inventory changes at the DB layer
-- This captures any direct writes that bypass application logging.

create table if not exists player_inventory_potion_audit (
  id uuid default gen_random_uuid() primary key,
  player_id uuid not null,
  item_type text not null,
  item_name text not null,
  previous_quantity numeric,
  new_quantity numeric,
  action text not null,
  source text null,
  created_at timestamptz default now()
);

create index if not exists player_inventory_potion_audit_player_id_created_at_idx
  on player_inventory_potion_audit (player_id, created_at desc);

create or replace function log_potion_inventory_change()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    if lower(new.item_type) = 'potion' or lower(new.item_name) like '%potion%' then
      insert into player_inventory_potion_audit (
        player_id,
        item_type,
        item_name,
        previous_quantity,
        new_quantity,
        action,
        source
      ) values (
        new.player_id,
        new.item_type,
        new.item_name,
        null,
        new.quantity,
        'insert',
        current_setting('app.potion_audit_source', true)
      );
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if lower(new.item_type) = 'potion' or lower(new.item_name) like '%potion%' then
      insert into player_inventory_potion_audit (
        player_id,
        item_type,
        item_name,
        previous_quantity,
        new_quantity,
        action,
        source
      ) values (
        new.player_id,
        new.item_type,
        new.item_name,
        old.quantity,
        new.quantity,
        'update',
        current_setting('app.potion_audit_source', true)
      );
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if lower(old.item_type) = 'potion' or lower(old.item_name) like '%potion%' then
      insert into player_inventory_potion_audit (
        player_id,
        item_type,
        item_name,
        previous_quantity,
        new_quantity,
        action,
        source
      ) values (
        old.player_id,
        old.item_type,
        old.item_name,
        old.quantity,
        null,
        'delete',
        current_setting('app.potion_audit_source', true)
      );
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists player_inventory_potion_audit_trg on player_inventories;
create trigger player_inventory_potion_audit_trg
after insert or update or delete on player_inventories
for each row execute function log_potion_inventory_change();
