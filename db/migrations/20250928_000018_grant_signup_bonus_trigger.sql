-- Grant 10 credits (1000 cents) to every newly created player account
-- Also log an economy transaction with source 'signup_bonus'

create or replace function grant_signup_bonus()
returns trigger as $$
begin
  -- Add 10 credits in cents
  update players
     set credits_cents = credits_cents + 1000,
         updated_at = now()
   where id = new.id;

  -- Ledger entry for auditing
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


