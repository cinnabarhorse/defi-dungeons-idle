create index if not exists idx_api_keys_player_created_desc
  on api_keys (player_id, created_at desc);
