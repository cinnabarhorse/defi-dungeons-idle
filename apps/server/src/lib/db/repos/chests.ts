import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { ChestOpenRow, ChestOpenRecord } from '../types';

function mapRow(row: ChestOpenRow): ChestOpenRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    playerId: row.player_id,
    chestEntityId: row.chest_entity_id,
    difficultyTier: row.difficulty_tier,
    rewardSummary: (row.reward_summary as Record<string, unknown>[]) ?? [],
    at: row.at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface LogChestOpenInput {
  gameId: string;
  playerId: string;
  chestEntityId?: string | null;
  difficultyTier: string;
  rewardSummary: Record<string, unknown>[];
  atIso?: string | null;
  client?: PoolClient;
}

export async function logOpen(input: LogChestOpenInput) {
  const pool = getPool(input.client);
  const query = `
    insert into chest_opens (
      game_id,
      player_id,
      chest_entity_id,
      difficulty_tier,
      reward_summary,
      at
    ) values ($1,$2,$3,$4,$5,$6)
    returning *
  `;

  const params = [
    input.gameId,
    input.playerId,
    input.chestEntityId ?? null,
    input.difficultyTier,
    JSON.stringify(input.rewardSummary ?? []),
    input.atIso ?? new Date().toISOString(),
  ];

  const result: QueryResult<ChestOpenRow> = await pool.query(query, params);
  return mapRow(result.rows[0]);
}
