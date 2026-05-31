-- Add created_at / updated_at to loot_catalog and a trigger to maintain updated_at

alter table if exists loot_catalog
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Backfill nulls and set defaults
update loot_catalog
   set created_at = coalesce(created_at, now()),
       updated_at = coalesce(updated_at, now());

alter table if exists loot_catalog
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists loot_catalog
  alter column created_at set not null,
  alter column updated_at set not null;

-- Maintain updated_at on updates via the common trigger function
-- Assumes set_updated_at() exists (defined in earlier migrations)
do $$
begin
  begin
    create trigger loot_catalog_set_updated_at
      before update on loot_catalog
      for each row execute function set_updated_at();
  exception when duplicate_object then
    -- trigger already exists, do nothing
    null;
  end;
end $$;


