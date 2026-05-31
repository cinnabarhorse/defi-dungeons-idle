create table if not exists public.player_allowlist (
    wallet_address text primary key,
    note text,
    added_by_address text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_player_allowlist_wallet
    on public.player_allowlist (wallet_address);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists player_allowlist_set_updated_at on public.player_allowlist;
create trigger player_allowlist_set_updated_at
before update on public.player_allowlist
for each row execute function public.set_updated_at();
