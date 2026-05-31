-- On-chain deposit tracking for GamePoints lockups

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'deposit_status'
  ) then
    create type public.deposit_status as enum ('pending', 'confirmed', 'failed');
  end if;
end $$;

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.players(id) on delete set null,
  chain_id int8 not null default 8453,
  contract_address text not null,
  depositor_address text not null,
  token_address text not null,
  token_symbol text not null,
  amount text not null,
  amount_wei text not null,
  tx_hash text,
  tx_status public.deposit_status not null default 'pending',
  deposit_id text,
  yield_amount text,
  points_minted text,
  unlock_at timestamptz,
  auto_renew boolean not null default false,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deposits_depositor_created_at
  on public.deposits (depositor_address, created_at desc);

create index if not exists idx_deposits_user_id_created_at
  on public.deposits (user_id, created_at desc);

create index if not exists idx_deposits_deposit_id
  on public.deposits (deposit_id);

create unique index if not exists idx_deposits_tx_hash_unique
  on public.deposits (tx_hash)
  where tx_hash is not null;

-- Ensure updated_at tracks modifications
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_deposits_set_updated_at on public.deposits;

create trigger trg_deposits_set_updated_at
before update on public.deposits
for each row
execute procedure public.set_updated_at();
