import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { LootDistributionRow, LootDistributionRecord } from '../types';

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: LootDistributionRow): LootDistributionRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    playerId: row.player_id,
    lootId: row.loot_id,
    source: row.source,
    amount: toNumber(row.amount),
    probability: toNumber(row.probability),
    expectedValue: toNumber(row.expected_value),
    entityId: row.entity_id,
    claimed: row.claimed,
    claimTxHash: row.claim_tx_hash,
    claimAt: row.claim_at,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface CreatePendingInput {
  source: string;
  gameId?: string | null;
  playerId?: string | null;
  lootId?: string | null;
  amount?: number | null;
  probability?: number | null;
  expectedValue?: number | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  claimed?: boolean;
  claimTxHash?: string | null;
  claimAtIso?: string | null;
  client?: PoolClient;
}

export async function createPending(input: CreatePendingInput) {
  const pool = getPool(input.client);
  const query = `
    insert into loot_distributions (
      game_id,
      player_id,
      loot_id,
      source,
      amount,
      probability,
      expected_value,
      entity_id,
      claimed,
      claim_tx_hash,
      claim_at,
      metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    returning *
  `;

  const params = [
    input.gameId ?? null,
    input.playerId ?? null,
    input.lootId ?? null,
    input.source,
    input.amount ?? null,
    input.probability ?? null,
    input.expectedValue ?? null,
    input.entityId ?? null,
    Boolean(input.claimed),
    input.claimTxHash ?? null,
    input.claimAtIso ?? null,
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<LootDistributionRow> = await pool.query(
    query,
    params
  );
  return mapRow(result.rows[0]);
}

export interface MarkClaimedInput {
  id: string;
  claimTxHash?: string | null;
  claimAtIso?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function markClaimed(input: MarkClaimedInput) {
  const updates: string[] = ['claimed = true', 'updated_at = now()'];
  const params: unknown[] = [input.id];

  if (input.claimTxHash !== undefined) {
    params.push(input.claimTxHash);
    updates.push(`claim_tx_hash = $${params.length}`);
  }

  if (input.claimAtIso !== undefined) {
    params.push(input.claimAtIso);
    updates.push(`claim_at = $${params.length}::timestamptz`);
  } else {
    updates.push('claim_at = coalesce(claim_at, now())');
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  const query = `
    update loot_distributions
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<LootDistributionRow> = await pool.query(
    query,
    params
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function listUnclaimedByPlayer(playerId: string) {
  const pool = getPgPool();
  const query = `
    select *
      from loot_distributions
     where player_id = $1
       and claimed = false
     order by created_at desc
  `;
  const result = await pool.query<LootDistributionRow>(query, [playerId]);
  return result.rows.map(mapRow);
}
