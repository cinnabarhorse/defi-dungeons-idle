-- Merge player_preferences into players (Phase A)
-- 1) Add preferences columns to players
alter table if exists public.players
  add column if not exists selected_character_id text,
  add column if not exists selected_difficulty_tier text,
  add column if not exists gotchi_sprite_url text,
  add column if not exists avatar_id text,
  add column if not exists audio_settings jsonb not null default jsonb_build_object(
    'masterVolume', 70,
    'sfxVolume', 80,
    'musicVolume', 60,
    'muted', false
  );

-- 2) Backfill from player_preferences if it exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_preferences'
  ) then
    update public.players p
       set selected_character_id = pp.selected_character_id,
           selected_difficulty_tier = pp.selected_difficulty_tier,
           gotchi_sprite_url = pp.gotchi_sprite_url,
           avatar_id = pp.avatar_id,
           audio_settings = coalesce(pp.audio_settings, p.audio_settings),
           updated_at = now()
      from public.player_preferences pp
     where pp.player_id = p.id;
  elsif exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_preferences_old'
  ) then
    update public.players p
       set selected_character_id = pp.selected_character_id,
           selected_difficulty_tier = pp.selected_difficulty_tier,
           gotchi_sprite_url = pp.gotchi_sprite_url,
           avatar_id = pp.avatar_id,
           audio_settings = coalesce(pp.audio_settings, p.audio_settings),
           updated_at = now()
      from public.player_preferences_old pp
     where pp.player_id = p.id;
  end if;
end $$;

-- 3) If a real table still exists with the name player_preferences, rename it to avoid conflict
alter table if exists public.player_preferences rename to player_preferences_old;

-- 4) Compatibility view + rules so existing code can continue using player_preferences
create or replace view public.player_preferences as
select
  p.id as player_id,
  p.selected_character_id,
  p.selected_difficulty_tier,
  p.gotchi_sprite_url,
  p.avatar_id,
  p.audio_settings,
  p.created_at as created_at,
  p.updated_at as updated_at
from public.players p;

create or replace rule player_preferences_update as
on update to public.player_preferences do instead
update public.players set
  selected_character_id = new.selected_character_id,
  selected_difficulty_tier = new.selected_difficulty_tier,
  gotchi_sprite_url = new.gotchi_sprite_url,
  avatar_id = new.avatar_id,
  audio_settings = coalesce(new.audio_settings, public.players.audio_settings),
  updated_at = now()
where public.players.id = old.player_id;

create or replace rule player_preferences_insert as
on insert to public.player_preferences do instead
update public.players set
  selected_character_id = new.selected_character_id,
  selected_difficulty_tier = new.selected_difficulty_tier,
  gotchi_sprite_url = new.gotchi_sprite_url,
  avatar_id = new.avatar_id,
  audio_settings = coalesce(new.audio_settings, public.players.audio_settings),
  updated_at = now()
where public.players.id = new.player_id;


