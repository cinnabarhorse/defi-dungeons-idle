create table if not exists server_log_index (
    game_id text not null,
    ts_start timestamptz not null,
    ts_end timestamptz not null,
    level_counts jsonb not null default '{}'::jsonb,
    size_bytes integer not null,
    storage_path text not null,
    host text not null,
    pm_id integer not null default 0,
    checksum text not null,
    server_id text not null,
    created_at timestamptz not null default now(),
    primary key (game_id, ts_start, storage_path)
);

create index if not exists idx_server_log_index_game_ts
    on server_log_index (game_id, ts_start desc);

create index if not exists idx_server_log_index_ts
    on server_log_index (ts_start desc);
