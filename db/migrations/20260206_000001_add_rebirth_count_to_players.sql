alter table if exists public.players
  add column if not exists rebirth_count int not null default 0;

