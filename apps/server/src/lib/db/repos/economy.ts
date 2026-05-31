import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { EconomyTransactionRow, EconomyTransactionRecord } from '../types';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(row: EconomyTransactionRow): EconomyTransactionRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    currency: row.currency,
    amount: toNumber(row.amount),
    source: row.source,
    gameId: row.game_id,
    lootDistributionId: row.loot_distribution_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface LogTransactionInput {
  playerId: string;
  currency: string;
  amount: number;
  source: string;
  gameId?: string | null;
  lootDistributionId?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function logTransaction(input: LogTransactionInput) {
  const pool = getPool(input.client);
  const query = `
    insert into economy_transactions (
      player_id,
      currency,
      amount,
      source,
      game_id,
      loot_distribution_id,
      metadata
    ) values ($1,$2,$3,$4,$5,$6,$7)
    returning *
  `;

  const params = [
    input.playerId,
    input.currency,
    input.amount,
    input.source,
    input.gameId ?? null,
    input.lootDistributionId ?? null,
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<EconomyTransactionRow> = await pool.query(
    query,
    params
  );
  return mapRow(result.rows[0]);
}

export async function listRecent(playerId: string, limit = 50) {
  const pool = getPgPool();
  const query = `
    select *
      from economy_transactions
     where player_id = $1
     order by created_at desc
     limit $2
  `;
  const result = await pool.query<EconomyTransactionRow>(query, [
    playerId,
    limit,
  ]);
  return result.rows.map(mapRow);
}

export interface ListBySourceAndDateInput {
  source: string;
  bucketDate: string;
  client?: PoolClient;
}

export async function listBySourceAndDate(input: ListBySourceAndDateInput) {
  const pool = getPool(input.client);
  const query = `
    select *
      from economy_transactions
     where source = $1
       and (created_at at time zone 'UTC')::date = $2::date
     order by created_at desc
  `;
  const result = await pool.query<EconomyTransactionRow>(query, [
    input.source,
    input.bucketDate,
  ]);
  return result.rows.map(mapRow);
}
