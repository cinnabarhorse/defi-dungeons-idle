-- Add withdrawal_approved status and withdrawal_settings table
alter type public.token_withdrawal_status
add value if not exists 'withdrawal_approved';

create table if not exists public.withdrawal_settings (
  id smallint primary key default 1,
  is_batch_processing_paused boolean not null default false,
  is_confirmation_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists withdrawal_settings_set_updated_at on public.withdrawal_settings;
create trigger withdrawal_settings_set_updated_at
before update
on public.withdrawal_settings
for each row
execute function public.set_updated_at();

insert into public.withdrawal_settings (id)
values (1)
on conflict (id) do nothing;
