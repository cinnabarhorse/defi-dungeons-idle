import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { GamePlayerRow, GamePlayerRecord } from '../types';

function mapRow(row: GamePlayerRow): GamePlayerRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    playerId: row.player_id,
    characterId: row.character_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    kills: Number(row.kills) || 0,
    deaths: Number(row.deaths) || 0,
    damageDealt: Number(row.damage_dealt) || 0,
    damageTaken: Number(row.damage_taken) || 0,
    coinsCollected: Number(row.coins_collected) || 0,
    usdcEarnedBaseUnits: Number(row.usdc_earned_base_units) || 0,
    xpGained: Number(row.xp_gained) || 0,
    levelBefore: row.level_before ?? null,
    levelAfter: row.level_after ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface JoinInput {
  gameId: string;
  playerId: string;
  characterId?: string | null;
  levelBefore?: number | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function join(input: JoinInput) {
  const pool = getPool(input.client);
  const query = `
    insert into game_players (
      game_id,
      player_id,
      character_id,
      level_before,
      metadata
    ) values ($1,$2,$3,$4,$5)
    on conflict (game_id, player_id) do update set
      character_id = excluded.character_id,
      metadata = coalesce(game_players.metadata, '{}'::jsonb) || excluded.metadata,
      left_at = null,
      updated_at = now()
    returning *
  `;

  const params = [
    input.gameId,
    input.playerId,
    input.characterId ?? null,
    input.levelBefore ?? null,
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<GamePlayerRow> = await pool.query(query, params);
  return mapRow(result.rows[0]);
}

export async function getByGameAndPlayer(
  gameId: string,
  playerId: string
) {
  const pool = getPgPool();
  const result = await pool.query<GamePlayerRow>(
    'select * from game_players where game_id = $1 and player_id = $2 limit 1',
    [gameId, playerId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getById(
  gamePlayerId: string,
  client?: PoolClient,
  options?: { forUpdate?: boolean }
) {
  const pool = getPool(client);
  const query = options?.forUpdate
    ? 'select * from game_players where id = $1 for update'
    : 'select * from game_players where id = $1 limit 1';
  const result = await pool.query<GamePlayerRow>(
    query,
    [gamePlayerId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getByGameId(gameId: string, client?: PoolClient): Promise<GamePlayerRecord[]> {
  const pool = getPool(client);
  const result = await pool.query<GamePlayerRow>(
    'select * from game_players where game_id = $1 order by joined_at asc',
    [gameId]
  );
  return result.rows.map(mapRow);
}

export interface ApplyStatsInput {
  gamePlayerId: string;
  killsDelta?: number;
  deathsDelta?: number;
  damageDealtDelta?: number;
  damageTakenDelta?: number;
  coinsCollectedDelta?: number;
  usdcEarnedBaseUnitsDelta?: number;
  xpGainedDelta?: number;
  levelAfter?: number | null;
  markLeft?: boolean;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function applyStats(input: ApplyStatsInput) {
  const updates: string[] = [];
  const params: unknown[] = [input.gamePlayerId];

  const handleDelta = (
    field: string,
    delta?: number
  ) => {
    if (typeof delta === 'number' && delta !== 0) {
      params.push(delta);
      updates.push(`${field} = ${field} + $${params.length}`);
    }
  };

  handleDelta('kills', input.killsDelta);
  handleDelta('deaths', input.deathsDelta);
  handleDelta('damage_dealt', input.damageDealtDelta);
  handleDelta('damage_taken', input.damageTakenDelta);
  handleDelta('coins_collected', input.coinsCollectedDelta);
  handleDelta('usdc_earned_base_units', input.usdcEarnedBaseUnitsDelta);
  handleDelta('xp_gained', input.xpGainedDelta);

  if (input.levelAfter !== undefined) {
    params.push(input.levelAfter);
    updates.push(`level_after = $${params.length}`);
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  if (input.markLeft) {
    updates.push('left_at = coalesce(left_at, now())');
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push('updated_at = now()');

  const query = `
    update game_players
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<GamePlayerRow> = await pool.query(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface RecordLeaveInput {
  gamePlayerId: string;
  levelAfter?: number | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function recordLeave(input: RecordLeaveInput) {
  return applyStats({
    gamePlayerId: input.gamePlayerId,
    levelAfter: input.levelAfter,
    metadata: input.metadata,
    markLeft: true,
    client: input.client,
  });
}
