alter table games
  add column if not exists floor_reached integer not null default 0;

create index if not exists idx_games_floor_reached on games (floor_reached);
