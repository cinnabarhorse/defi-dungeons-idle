-- Add unlocked characters support and retroactive Lick Tongue grant

alter table if exists players
  add column if not exists unlocked_characters text[] not null default '{}'::text[];

-- Backfill unlocked characters based on existing selection
update players
   set unlocked_characters = array_remove(array[selected_character_id], null)
 where selected_character_id is not null;

-- Retroactively grant 5 Lick Tongues to all existing players
update players
   set lick_tongue_count = lick_tongue_count + 5,
       updated_at = now();

-- Upsert inventory quantities for the retroactive grant
insert into player_inventories (
  player_id,
  item_type,
  item_name,
  quantity,
  item_data,
  created_at,
  updated_at
)
select
  p.id,
  'material',
  'Lick Tongue',
  5,
  '{}'::jsonb,
  now(),
  now()
from players p
on conflict (player_id, item_type, item_name) do update
  set quantity = player_inventories.quantity + excluded.quantity,
      updated_at = now();

-- Log inventory events for auditing the retroactive grant
insert into player_inventory_events (
  player_id,
  item_type,
  item_name,
  delta,
  reason,
  game_id,
  metadata
)
select
  p.id,
  'material',
  'Lick Tongue',
  5,
  'retro_signup_bonus',
  null,
  jsonb_build_object('amount', 5, 'note', 'retroactive signup grant')
from players p;

-- Update signup bonus trigger to grant Lick Tongues going forward
create or replace function grant_signup_bonus()
returns trigger as $$
begin
  -- Add 10 credits (1000 cents) and 5 Lick Tongues to new players
  update players
     set credits_cents = credits_cents + 1000,
         lick_tongue_count = lick_tongue_count + 5,
         updated_at = now()
   where id = new.id;

  -- Ledger entry for auditing the credit grant
  insert into economy_transactions (
    player_id,
    currency,
    amount,
    source,
    game_id,
    loot_distribution_id,
    metadata
  ) values (
    new.id,
    'CREDITS',
    10,
    'signup_bonus',
    null,
    null,
    jsonb_build_object('amountCents', 1000, 'note', 'auto-grant on signup trigger')
  );

  -- Upsert Lick Tongues inventory
  insert into player_inventories (
    player_id,
    item_type,
    item_name,
    quantity,
    item_data,
    created_at,
    updated_at
  ) values (
    new.id,
    'material',
    'Lick Tongue',
    5,
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (player_id, item_type, item_name) do update
    set quantity = player_inventories.quantity + excluded.quantity,
        updated_at = now();

  -- Log inventory event for signup grant
  insert into player_inventory_events (
    player_id,
    item_type,
    item_name,
    delta,
    reason,
    game_id,
    metadata
  ) values (
    new.id,
    'material',
    'Lick Tongue',
    5,
    'signup_bonus',
    null,
    jsonb_build_object('amount', 5)
  );

  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'players_grant_signup_bonus'
  ) then
    create trigger players_grant_signup_bonus
    after insert on players
    for each row execute function grant_signup_bonus();
  end if;
end
$$;
