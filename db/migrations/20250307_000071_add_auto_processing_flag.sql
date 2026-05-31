alter table public.withdrawal_settings
  add column if not exists is_auto_processing_enabled boolean not null default false;
