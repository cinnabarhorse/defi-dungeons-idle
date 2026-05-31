-- Insert GHST token into loot_catalog if not already present
-- We keep token_address null to avoid chain-specific assumptions; can be filled later via admin.

insert into loot_catalog (
  loot_type,
  chain_id,
  token_address,
  token_id,
  decimals,
  name,
  remaining,
  is_active,
  metadata
)
select 'erc20',
       8453,              -- Base
       '0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB',             -- token_address (optional)
       null,
       18,               -- GHST has 18 decimals
       'GHST Airdrop',
       1000,                -- start at 0; reload via admin API or seed script
       true,
       jsonb_build_object(
         'description','Aavegotchi GHST token rewards',
         'icon','ghst'
       )
where not exists (
  select 1 from loot_catalog where lower(name) = lower('GHST Airdrop')
);


