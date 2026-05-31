-- Fix credit_deposit function to use correct column credits_cents
-- Replaces the function defined in 20250929_000001_credit_deposit_func.sql

create or replace function public.credit_deposit(
  p_deposit_id uuid,
  p_points_minted text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_deposit public.deposits;
  v_player_id uuid;
  v_credits_cents int8;
  v_points_num numeric;
begin
  -- Lock and fetch deposit
  select * into v_deposit
  from public.deposits
  where id = p_deposit_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Deposit not found');
  end if;

  -- Check if already credited
  if v_deposit.tx_status = 'credited' then
    return jsonb_build_object('ok', true, 'skipped', 'Already credited');
  end if;

  -- Parse points
  begin
    v_points_num := p_points_minted::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Invalid points value');
  end;

  if v_points_num <= 0 then
     -- Update status to confirmed but don't credit (zero points)
     update public.deposits
     set tx_status = 'confirmed',
         points_minted = p_points_minted,
         updated_at = now()
     where id = p_deposit_id;
     return jsonb_build_object('ok', true, 'result', 'Zero points, marked confirmed');
  end if;

  -- Find player
  v_player_id := v_deposit.user_id;
  
  if v_player_id is null then
    -- Try to look up by wallet
    select id into v_player_id
    from public.players
    where lower(wallet_address) = lower(v_deposit.depositor_address)
    limit 1;
  end if;

  if v_player_id is null then
    -- No player found, just mark as confirmed with points
    update public.deposits
    set tx_status = 'confirmed',
        points_minted = p_points_minted,
        updated_at = now()
    where id = p_deposit_id;
    
    return jsonb_build_object('ok', true, 'result', 'Player not found, marked confirmed');
  end if;

  -- Calculate credits (1 point = 100 cents)
  v_credits_cents := round(v_points_num * 100);

  -- Update player credits
  update public.players
  set credits_cents = credits_cents + v_credits_cents,
      updated_at = now()
  where id = v_player_id;

  -- Update deposit status
  update public.deposits
  set tx_status = 'credited',
      points_minted = p_points_minted,
      user_id = v_player_id, -- Link user if found by wallet
      updated_at = now()
  where id = p_deposit_id;

  -- Log transaction (economy_transactions)
  insert into public.economy_transactions (
    player_id,
    currency,
    amount,
    source,
    metadata,
    created_at
  ) values (
    v_player_id,
    'CREDITS',
    v_points_num, -- storing as float amount in original units
    'deposit',
    jsonb_build_object(
      'depositId', v_deposit.deposit_id,
      'txHash', v_deposit.tx_hash,
      'pointsMinted', p_points_minted
    ),
    now()
  );

  return jsonb_build_object('ok', true, 'player_id', v_player_id, 'credits_added', v_credits_cents);
end;
$$;

