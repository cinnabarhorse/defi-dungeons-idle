-- Track on-chain withdrawal status for deposits

alter table public.deposits
  add column if not exists withdrawn boolean not null default false,
  add column if not exists withdrawal_tx text;


