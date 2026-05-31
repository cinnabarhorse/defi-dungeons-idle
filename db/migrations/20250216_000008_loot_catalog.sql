create table if not exists loot_catalog (
  id uuid primary key default gen_random_uuid(),
  loot_type text not null check (loot_type in ('erc20','erc721','erc1155','virtual')),
  chain_id int not null default 8453,
  token_address text,
  token_id numeric,
  decimals smallint,
  name text,
  remaining numeric,
  last_claimed timestamptz,
  reloaded_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_loot_catalog_active
  on loot_catalog (is_active);
