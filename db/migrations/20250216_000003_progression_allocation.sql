alter table player_progression
  add column if not exists allocation_history jsonb not null default '[]'::jsonb,
  add column if not exists last_synced_at timestamptz;
