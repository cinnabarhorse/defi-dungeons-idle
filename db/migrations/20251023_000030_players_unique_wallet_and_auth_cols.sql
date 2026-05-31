-- Ensure players has auth-related columns and unique wallet for upsert

alter table if exists public.players
  add column if not exists is_authorized boolean not null default false,
  add column if not exists access_granted_at timestamptz;

-- Add a unique constraint on wallet_address if missing. Prefer named constraint for clarity.
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'players'
       and c.conname = 'players_wallet_address_key'
  ) then
    -- First check if any other unique index/constraint exists on wallet_address
    if not exists (
      select 1
        from pg_index i
        join pg_class t on i.indrelid = t.oid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
       where n.nspname = 'public'
         and t.relname = 'players'
         and i.indisunique
         and a.attname = 'wallet_address'
    ) then
      alter table public.players add constraint players_wallet_address_key unique (wallet_address);
    end if;
  end if;
end $$;

-- Keep a supporting index (no-op if constraint already creates one with same key)
create index if not exists idx_players_wallet on public.players (wallet_address);


