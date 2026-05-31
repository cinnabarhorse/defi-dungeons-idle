alter table if exists players
  add column if not exists email_address text;

create index if not exists idx_players_email_address on players (email_address);
