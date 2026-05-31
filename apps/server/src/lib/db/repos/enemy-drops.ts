import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { EnemyDropRow, EnemyDropRecord } from '../types';

function mapRow(row: EnemyDropRow): EnemyDropRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    enemyKillId: row.enemy_kill_id,
    lootDistributionId: row.loot_distribution_id,
    enemyType: row.enemy_type,
    dropTable: row.drop_table,
    rolledWeight: row.rolled_weight === null ? null : Number(row.rolled_weight),
    createdAt: row.created_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface LogDropInput {
  gameId: string;
  enemyType: string;
  enemyKillId?: string | null;
  lootDistributionId?: string | null;
  dropTable?: string | null;
  rolledWeight?: number | null;
  client?: PoolClient;
}

export async function logDrop(input: LogDropInput) {
  const pool = getPool(input.client);
  const query = `
    insert into enemy_drops (
      game_id,
      enemy_kill_id,
      loot_distribution_id,
      enemy_type,
      drop_table,
      rolled_weight
    ) values ($1,$2,$3,$4,$5,$6)
    returning *
  `;

  const params = [
    input.gameId,
    input.enemyKillId ?? null,
    input.lootDistributionId ?? null,
    input.enemyType,
    input.dropTable ?? null,
    input.rolledWeight ?? null,
  ];

  const result: QueryResult<EnemyDropRow> = await pool.query(query, params);
  return mapRow(result.rows[0]);
}
