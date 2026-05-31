create table if not exists aavegotchi_characters (
  id uuid primary key default gen_random_uuid(),
  gotchi_id text not null unique,
  owner_address text not null,
  wearable_slugs text[] not null default '{}',
  last_synced_at timestamptz not null default now()
);

create index if not exists idx_aavegotchi_characters_owner
  on aavegotchi_characters (owner_address);
