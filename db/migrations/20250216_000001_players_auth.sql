create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  username text,
  region text,
  credits_cents bigint not null default 0,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_banned boolean default false
);

create trigger players_set_updated_at
before update on players
for each row execute function set_updated_at();

create index if not exists idx_players_wallet on players (wallet_address);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  wallet_address text not null,
  nonce text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  user_agent text,
  ip inet,
  valid boolean not null default true
);

create index if not exists idx_auth_wallet_valid on auth_sessions (wallet_address, valid);
create index if not exists idx_auth_player_valid on auth_sessions (player_id, valid);
