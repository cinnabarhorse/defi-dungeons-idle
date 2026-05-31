begin;

create table if not exists global_economy_counters (
  counter_name text not null,
  bucket_date date not null,
  amount bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (counter_name, bucket_date)
);

create trigger global_economy_counters_set_updated_at
before update on global_economy_counters
for each row execute function set_updated_at();

commit;
