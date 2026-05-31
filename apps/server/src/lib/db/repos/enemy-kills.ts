import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { EnemyKillRow, EnemyKillRecord } from '../types';

function mapRow(row: EnemyKillRow): EnemyKillRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    playerId: row.player_id ?? null,
    enemyType: row.enemy_type,
    enemyId: row.enemy_id ?? null,
    attackType: row.attack_type ?? null,
    weaponType: row.weapon_type ?? null,
    location: (row.location as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface LogKillInput {
  gameId: string;
  enemyType: string;
  playerId?: string | null;
  enemyId?: string | null;
  attackType?: string | null;
  weaponType?: string | null;
  location?: { x?: number; y?: number; [key: string]: unknown } | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function logKill(input: LogKillInput) {
  const pool = getPool(input.client);
  const query = `
    insert into enemy_kills (
      game_id,
      player_id,
      enemy_type,
      enemy_id,
      attack_type,
      weapon_type,
      location,
      metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    returning *
  `;

  const params = [
    input.gameId,
    input.playerId ?? null,
    input.enemyType,
    input.enemyId ?? null,
    input.attackType ?? null,
    input.weaponType ?? null,
    JSON.stringify(input.location ?? {}),
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<EnemyKillRow> = await pool.query(query, params);
  return mapRow(result.rows[0]);
}

export async function hasPreviousKillForEnemyTypes(input: {
  playerId: string;
  enemyTypes: string[];
  excludeKillId?: string | null;
  client?: PoolClient;
}): Promise<boolean> {
  const pool = getPool(input.client);
  const query = `
    select exists(
      select 1
        from enemy_kills
       where player_id = $1
         and enemy_type = any($2::text[])
         and ($3::uuid is null or id <> $3::uuid)
    ) as has_any
  `;
  const params = [
    input.playerId,
    input.enemyTypes,
    input.excludeKillId ?? null,
  ];
  const result = await pool.query<{ has_any: boolean }>(query, params);
  return Boolean(result.rows[0]?.has_any);
}

export async function hasPreviousBossKill(input: {
  playerId: string;
  excludeKillId?: string | null;
  bossEnemyTypes?: string[]; // fallback list for legacy rows without metadata
  client?: PoolClient;
}): Promise<boolean> {
  const pool = getPool(input.client);
  const bossTypes =
    Array.isArray(input.bossEnemyTypes) && input.bossEnemyTypes.length > 0
      ? input.bossEnemyTypes
      : ['portal_guardian'];
  const query = `
    select exists(
      select 1
        from enemy_kills
       where player_id = $1
         and ($2::uuid is null or id <> $2::uuid)
         and (
               coalesce((metadata->>'isBossEncounter')::boolean, false) = true
            or enemy_type = any($3::text[])
         )
    ) as has_any
  `;
  const params = [input.playerId, input.excludeKillId ?? null, bossTypes];
  const result = await pool.query<{ has_any: boolean }>(query, params);
  return Boolean(result.rows[0]?.has_any);
}
