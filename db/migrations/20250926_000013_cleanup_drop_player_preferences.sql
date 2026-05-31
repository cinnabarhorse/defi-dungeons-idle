-- Cleanup Phase B: remove compatibility layer and old table for preferences
do $$
begin
  if exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'player_preferences'
  ) then
    begin
      drop rule if exists player_preferences_update on public.player_preferences;
      drop rule if exists player_preferences_insert on public.player_preferences;
    exception when undefined_object then
      null;
    end;
    drop view if exists public.player_preferences;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_preferences'
  ) then
    drop table if exists public.player_preferences;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_preferences_old'
  ) then
    drop table if exists public.player_preferences_old;
  end if;
end $$;


