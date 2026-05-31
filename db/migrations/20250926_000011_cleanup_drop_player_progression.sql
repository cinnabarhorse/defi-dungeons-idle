-- Cleanup Phase B: remove compatibility layer and old table
do $$
begin
  if exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'player_progression'
  ) then
    begin
      drop rule if exists player_progression_update on public.player_progression;
      drop rule if exists player_progression_insert on public.player_progression;
    exception when undefined_object then
      null;
    end;
    drop view if exists public.player_progression;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'player_progression'
  ) then
    drop table if exists public.player_progression;
  end if;
end $$;


