-- Add 'credited' status to deposit_status enum
-- This tracks when credits have been applied to the user's account
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block
-- The migration runner handles this by running enum migrations outside transactions

-- Check if value already exists before adding
do $$
begin
  if exists (
    select 1 from pg_enum 
    where enumlabel = 'credited' 
    and enumtypid = (select oid from pg_type where typname = 'deposit_status')
  ) then
    raise notice 'Enum value ''credited'' already exists, skipping';
    return;
  end if;
end $$;

-- Add the enum value (will be skipped if above check found it)
alter type public.deposit_status add value 'credited';

