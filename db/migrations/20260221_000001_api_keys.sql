create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  name text,
  key_hash text not null,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  auth_success_count bigint not null default 0,
  room_join_count bigint not null default 0,
  last_used_at timestamptz,
  last_used_ip text,
  last_used_user_agent text
);

create unique index if not exists idx_api_keys_key_hash_unique
  on api_keys (key_hash);

create index if not exists idx_api_keys_player_active_created_desc
  on api_keys (player_id, created_at desc)
  where revoked_at is null;
