-- Merge player_progression into players (Phase A)
-- 1) Add progression columns to players
alter table if exists public.players
  add column if not exists level int not null default 1,
  add column if not exists total_xp bigint not null default 0,
  add column if not exists unspent_points int not null default 0,
  add column if not exists unlocked_tiers text[] not null default '{normal_1}',
  add column if not exists lick_tongue_count int not null default 0,
  add column if not exists stat_allocations jsonb not null default '{}'::jsonb,
  add column if not exists derived_stats jsonb not null default '{}'::jsonb,
  add column if not exists equipped_wearables jsonb not null default '[]'::jsonb,
  add column if not exists allocation_history jsonb not null default '[]'::jsonb,
  add column if not exists last_synced_at timestamptz;

-- 2) Backfill from player_progression if it exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_progression'
  ) then
    update public.players p
       set level = pp.level,
           total_xp = pp.total_xp,
           unspent_points = pp.unspent_points,
           unlocked_tiers = pp.unlocked_tiers,
           lick_tongue_count = pp.lick_tongue_count,
           stat_allocations = pp.stat_allocations,
           derived_stats = pp.derived_stats,
           equipped_wearables = pp.equipped_wearables,
           allocation_history = coalesce(pp.allocation_history, '[]'::jsonb),
           last_synced_at = pp.last_synced_at,
           updated_at = now()
      from public.player_progression pp
     where pp.player_id = p.id;
  elsif exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_progression_old'
  ) then
    update public.players p
       set level = pp.level,
           total_xp = pp.total_xp,
           unspent_points = pp.unspent_points,
           unlocked_tiers = pp.unlocked_tiers,
           lick_tongue_count = pp.lick_tongue_count,
           stat_allocations = pp.stat_allocations,
           derived_stats = pp.derived_stats,
           equipped_wearables = pp.equipped_wearables,
           allocation_history = coalesce(pp.allocation_history, '[]'::jsonb),
           last_synced_at = pp.last_synced_at,
           updated_at = now()
      from public.player_progression_old pp
     where pp.player_id = p.id;
  end if;
end $$;

-- 3) If a real table still exists with the name player_progression, rename it to avoid conflict
alter table if exists public.player_progression rename to player_progression_old;

-- 4) Compatibility view + rules so existing code can continue using player_progression
create or replace view public.player_progression as
select
  p.id as player_id,
  p.level,
  p.total_xp,
  p.unspent_points,
  p.unlocked_tiers,
  p.lick_tongue_count,
  p.stat_allocations,
  p.derived_stats,
  p.equipped_wearables,
  p.allocation_history,
  p.last_synced_at,
  p.updated_at
from public.players p;

create or replace rule player_progression_update as
on update to public.player_progression do instead
update public.players set
  level = coalesce(new.level, public.players.level),
  total_xp = coalesce(new.total_xp, public.players.total_xp),
  unspent_points = coalesce(new.unspent_points, public.players.unspent_points),
  unlocked_tiers = coalesce(new.unlocked_tiers, public.players.unlocked_tiers),
  lick_tongue_count = coalesce(new.lick_tongue_count, public.players.lick_tongue_count),
  stat_allocations = coalesce(new.stat_allocations, public.players.stat_allocations),
  derived_stats = coalesce(new.derived_stats, public.players.derived_stats),
  equipped_wearables = coalesce(new.equipped_wearables, public.players.equipped_wearables),
  allocation_history = coalesce(new.allocation_history, public.players.allocation_history),
  last_synced_at = new.last_synced_at,
  updated_at = now()
where public.players.id = old.player_id;

create or replace rule player_progression_insert as
on insert to public.player_progression do instead
update public.players set
  level = coalesce(new.level, public.players.level),
  total_xp = coalesce(new.total_xp, public.players.total_xp),
  unspent_points = coalesce(new.unspent_points, public.players.unspent_points),
  unlocked_tiers = coalesce(new.unlocked_tiers, public.players.unlocked_tiers),
  lick_tongue_count = coalesce(new.lick_tongue_count, public.players.lick_tongue_count),
  stat_allocations = coalesce(new.stat_allocations, public.players.stat_allocations),
  derived_stats = coalesce(new.derived_stats, public.players.derived_stats),
  equipped_wearables = coalesce(new.equipped_wearables, public.players.equipped_wearables),
  allocation_history = coalesce(new.allocation_history, public.players.allocation_history),
  last_synced_at = new.last_synced_at,
  updated_at = now()
where public.players.id = new.player_id;

-- 5) Ensure players table is in Supabase realtime publication (no-op if not using supabase)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.players;
    exception when duplicate_object then
      -- already added
      null;
    end;
  end if;
end $$;


