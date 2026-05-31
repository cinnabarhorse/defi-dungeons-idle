import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { GameRow, GameRecord } from '../types';

function mapGameRow(row: GameRow): GameRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    seed: row.seed,
    region: row.region,
    difficultyTier: row.difficulty_tier,
    status: row.status,
    isPrivate: row.is_private,
    maxPlayers: row.max_players,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalEnemyKills: Number(row.total_enemy_kills) || 0,
    nextTimedSpawnAt: row.next_timed_spawn_at,
    phase: row.phase || 'in_game',
    phaseChangedAt: row.phase_changed_at,
    runStartedAt: row.run_started_at,
    lateJoinCutoffAt: row.late_join_cutoff_at,
    autoCloseAt: row.auto_close_at,
    startedByPlayerId: row.started_by_player_id,
    floorReached: Number(row.floor_reached) || 0,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface CreateGameInput {
  roomId: string;
  seed?: number;
  region?: string;
  difficultyTier?: string;
  status?: string;
  isPrivate?: boolean;
  maxPlayers?: number | null;
  startedAtIso?: string;
  phase?: string;
  phaseChangedAtIso?: string | null;
  runStartedAtIso?: string | null;
  lateJoinCutoffAtIso?: string | null;
  autoCloseAtIso?: string | null;
  startedByPlayerId?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function create(input: CreateGameInput) {
  const pool = getPool(input.client);
  const query = `
    insert into games (
      room_id,
      seed,
      region,
      difficulty_tier,
      status,
      is_private,
      max_players,
      started_at,
      phase,
      phase_changed_at,
      run_started_at,
      late_join_cutoff_at,
      auto_close_at,
      started_by_player_id,
      metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    on conflict (room_id) do update set
      seed = coalesce(excluded.seed, games.seed),
      region = coalesce(excluded.region, games.region),
      difficulty_tier = coalesce(excluded.difficulty_tier, games.difficulty_tier),
      status = excluded.status,
      is_private = excluded.is_private,
      max_players = excluded.max_players,
      started_at = excluded.started_at,
      phase = excluded.phase,
      phase_changed_at = coalesce(excluded.phase_changed_at, games.phase_changed_at),
      run_started_at = coalesce(excluded.run_started_at, games.run_started_at),
      late_join_cutoff_at = coalesce(excluded.late_join_cutoff_at, games.late_join_cutoff_at),
      auto_close_at = coalesce(excluded.auto_close_at, games.auto_close_at),
      started_by_player_id = coalesce(excluded.started_by_player_id, games.started_by_player_id),
      metadata = coalesce(games.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = now()
    returning *
  `;

  const params = [
    input.roomId,
    input.seed ?? null,
    input.region ?? null,
    input.difficultyTier ?? null,
    input.status ?? 'active',
    Boolean(input.isPrivate),
    input.maxPlayers ?? null,
    input.startedAtIso ?? new Date().toISOString(),
    input.phase ?? 'in_game',
    input.phaseChangedAtIso ?? new Date().toISOString(),
    input.runStartedAtIso ?? null,
    input.lateJoinCutoffAtIso ?? null,
    input.autoCloseAtIso ?? null,
    input.startedByPlayerId ?? null,
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<GameRow> = await pool.query(query, params);
  return mapGameRow(result.rows[0]);
}

export interface UpdateMetricsInput {
  gameId: string;
  totalEnemyKillsDelta?: number;
  nextTimedSpawnAt?: string | null;
  difficultyTier?: string;
  phase?: string;
  phaseChangedAtIso?: string | null;
  runStartedAtIso?: string | null;
  lateJoinCutoffAtIso?: string | null;
  autoCloseAtIso?: string | null;
  startedByPlayerId?: string | null;
  floorReached?: number;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function updateMetrics(input: UpdateMetricsInput) {
  const updates: string[] = [];
  const params: unknown[] = [input.gameId];

  if (
    typeof input.totalEnemyKillsDelta === 'number' &&
    input.totalEnemyKillsDelta !== 0
  ) {
    params.push(input.totalEnemyKillsDelta);
    updates.push(`total_enemy_kills = total_enemy_kills + $${params.length}`);
  }

  if (input.nextTimedSpawnAt !== undefined) {
    params.push(input.nextTimedSpawnAt);
    updates.push(`next_timed_spawn_at = $${params.length}::timestamptz`);
  }

  if (typeof input.difficultyTier === 'string') {
    params.push(input.difficultyTier);
    updates.push(`difficulty_tier = $${params.length}`);
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  if (typeof input.phase === 'string') {
    params.push(input.phase);
    updates.push(`phase = $${params.length}`);
  }

  if (input.phaseChangedAtIso !== undefined) {
    params.push(input.phaseChangedAtIso);
    updates.push(`phase_changed_at = $${params.length}::timestamptz`);
  }

  if (input.runStartedAtIso !== undefined) {
    params.push(input.runStartedAtIso);
    updates.push(`run_started_at = $${params.length}::timestamptz`);
  }

  if (input.lateJoinCutoffAtIso !== undefined) {
    params.push(input.lateJoinCutoffAtIso);
    updates.push(`late_join_cutoff_at = $${params.length}::timestamptz`);
  }

  if (input.autoCloseAtIso !== undefined) {
    params.push(input.autoCloseAtIso);
    updates.push(`auto_close_at = $${params.length}::timestamptz`);
  }

  if (input.startedByPlayerId !== undefined) {
    params.push(input.startedByPlayerId);
    updates.push(`started_by_player_id = $${params.length}`);
  }

  if (input.floorReached !== undefined) {
    const safeFloor = Math.max(
      0,
      Math.floor(Number(input.floorReached) || 0)
    );
    params.push(safeFloor);
    updates.push(`floor_reached = $${params.length}`);
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push('updated_at = now()');

  const query = `
    update games
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<GameRow> = await pool.query(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  return mapGameRow(result.rows[0]);
}

export interface MarkStatusInput {
  gameId: string;
  status: string;
  endedAtIso?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function markStatus(input: MarkStatusInput) {
  const updates: string[] = ['status = $2', 'updated_at = now()'];
  const params: unknown[] = [input.gameId, input.status];

  if (input.endedAtIso !== undefined) {
    params.push(input.endedAtIso);
    updates.push(`ended_at = $${params.length}::timestamptz`);
  } else {
    updates.push('ended_at = coalesce(ended_at, now())');
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  const query = `
    update games
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<GameRow> = await pool.query(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  return mapGameRow(result.rows[0]);
}

export async function getById(
  gameId: string,
  client?: PoolClient
): Promise<GameRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<GameRow> = await pool.query(
    'select * from games where id = $1 limit 1',
    [gameId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapGameRow(result.rows[0]);
}
