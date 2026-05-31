-- Daily snapshot block for gotchi ownership eligibility
-- Stores one block number per UTC date. Ownership checks query subgraph at this block.

create table if not exists public.daily_gotchi_ownership_snapshots (
  snapshot_date date primary key,
  block_number bigint not null,
  captured_at timestamptz not null default now()
);

create index if not exists idx_daily_gotchi_ownership_snapshots_captured_at
  on public.daily_gotchi_ownership_snapshots (captured_at desc);
