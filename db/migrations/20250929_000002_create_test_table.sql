create table if not exists public."deposits-test-1" (like public.deposits including all);

-- Also create indices if 'like ... including all' doesn't cover everything you need (it usually covers constraints/defaults but check indices)
create index if not exists "idx_deposits-test-1_depositor_created_at"
  on public."deposits-test-1" (depositor_address, created_at desc);

create index if not exists "idx_deposits-test-1_user_id_created_at"
  on public."deposits-test-1" (user_id, created_at desc);

create index if not exists "idx_deposits-test-1_deposit_id"
  on public."deposits-test-1" (deposit_id);

create unique index if not exists "idx_deposits-test-1_tx_hash_unique"
  on public."deposits-test-1" (tx_hash)
  where tx_hash is not null;

