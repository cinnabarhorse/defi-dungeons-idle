-- Ensure new players receive the intended 100 credit signup bonus (10000 cents)
-- while preserving the existing Lick Tongue grant + inventory bookkeeping.

create or replace function grant_signup_bonus()
returns trigger as $$
begin
  -- Add 100 credits (10000 cents) and 5 Lick Tongues to new players
  update public.players
     set credits_cents = credits_cents + 10000,
         lick_tongue_count = lick_tongue_count + 5,
         updated_at = now()
   where id = new.id;

  -- Ledger entry for auditing the credit grant
  insert into public.economy_transactions (
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
    100,
    'signup_bonus',
    null,
    null,
    jsonb_build_object('amountCents', 10000, 'note', 'auto-grant on signup trigger')
  );

  -- Upsert Lick Tongues inventory (conflict target matches partial unique index)
  insert into public.player_inventories (
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
  on conflict (player_id, item_type, item_name)
    where lower(item_type) <> 'wearable'
  do update set
    quantity = public.player_inventories.quantity + excluded.quantity,
    updated_at = now();

  -- Log inventory event for signup grant
  insert into public.player_inventory_events (
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
