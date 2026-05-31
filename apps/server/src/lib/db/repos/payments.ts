import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { TopUpRow, TopUpRecord, PayoutRow, PayoutRecord } from '../types';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapTopUpRow(row: TopUpRow): TopUpRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    amountBaseUnits: toNumber(row.amount_base_units),
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    chainId: row.chain_id,
    txHash: row.tx_hash,
    blockNumber: row.block_number == null ? null : toNumber(row.block_number),
    paidAt: row.paid_at,
    failureReason: row.failure_reason,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayoutRow(row: PayoutRow): PayoutRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    amountBaseUnits: toNumber(row.amount_base_units),
    currency: row.currency,
    status: row.status,
    txHash: row.tx_hash,
    chainId: row.chain_id,
    sentAt: row.sent_at,
    failureReason: row.failure_reason,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface CreateTopUpInput {
  playerId: string;
  amountBaseUnits: number;
  currency: string;
  provider?: string | null;
  providerRef?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function createTopUp(input: CreateTopUpInput) {
  const pool = getPool(input.client);
  const query = `
    insert into top_ups (
      player_id,
      amount_base_units,
      currency,
      provider,
      provider_ref,
      metadata
    ) values ($1,$2,$3,$4,$5,$6)
    returning *
  `;

  const params = [
    input.playerId,
    Math.round(input.amountBaseUnits),
    input.currency,
    input.provider ?? null,
    input.providerRef ?? null,
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<TopUpRow> = await pool.query(query, params);
  return mapTopUpRow(result.rows[0]);
}

export interface MarkTopUpPaidInput {
  id: string;
  txHash?: string | null;
  blockNumber?: number | null;
  chainId?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function markTopUpPaid(input: MarkTopUpPaidInput) {
  const updates: string[] = [
    "status = 'paid'::payment_status",
    'paid_at = now()',
    'updated_at = now()',
  ];
  const params: unknown[] = [input.id];

  if (input.txHash !== undefined) {
    params.push(input.txHash);
    updates.push(`tx_hash = $${params.length}`);
  }

  if (input.blockNumber !== undefined) {
    params.push(input.blockNumber);
    updates.push(`block_number = $${params.length}`);
  }

  if (input.chainId !== undefined) {
    params.push(input.chainId);
    updates.push(`chain_id = $${params.length}`);
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  const query = `
    update top_ups
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<TopUpRow> = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  return mapTopUpRow(result.rows[0]);
}

export interface MarkTopUpFailedInput {
  id: string;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function markTopUpFailed(input: MarkTopUpFailedInput) {
  const updates: string[] = [
    "status = 'failed'::payment_status",
    'updated_at = now()',
  ];
  const params: unknown[] = [input.id];

  if (input.failureReason !== undefined) {
    params.push(input.failureReason);
    updates.push(`failure_reason = $${params.length}`);
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  const query = `
    update top_ups
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<TopUpRow> = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  return mapTopUpRow(result.rows[0]);
}

export async function listTopUpsByStatus(
  status: string,
  limit = 50
) {
  const pool = getPgPool();
  const query = `
    select *
      from top_ups
     where status = $1::payment_status
     order by created_at desc
     limit $2
  `;
  const result = await pool.query<TopUpRow>(query, [status, limit]);
  return result.rows.map(mapTopUpRow);
}

export interface QueuePayoutInput {
  playerId: string;
  amountBaseUnits: number;
  currency: string;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function queuePayout(input: QueuePayoutInput) {
  const pool = getPool(input.client);
  const query = `
    insert into payouts (
      player_id,
      amount_base_units,
      currency,
      metadata
    ) values ($1,$2,$3,$4)
    returning *
  `;

  const params = [
    input.playerId,
    Math.round(input.amountBaseUnits),
    input.currency,
    JSON.stringify(input.metadata ?? {}),
  ];

  const result: QueryResult<PayoutRow> = await pool.query(query, params);
  return mapPayoutRow(result.rows[0]);
}

export interface MarkPayoutSentInput {
  id: string;
  txHash?: string | null;
  chainId?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function markPayoutSent(input: MarkPayoutSentInput) {
  const updates: string[] = [
    "status = 'sent'::payout_status",
    'sent_at = now()',
    'updated_at = now()',
  ];
  const params: unknown[] = [input.id];

  if (input.txHash !== undefined) {
    params.push(input.txHash);
    updates.push(`tx_hash = $${params.length}`);
  }

  if (input.chainId !== undefined) {
    params.push(input.chainId);
    updates.push(`chain_id = $${params.length}`);
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  const query = `
    update payouts
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<PayoutRow> = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  return mapPayoutRow(result.rows[0]);
}

export interface MarkPayoutFailedInput {
  id: string;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function markPayoutFailed(input: MarkPayoutFailedInput) {
  const updates: string[] = [
    "status = 'failed'::payout_status",
    'updated_at = now()',
  ];
  const params: unknown[] = [input.id];

  if (input.failureReason !== undefined) {
    params.push(input.failureReason);
    updates.push(`failure_reason = $${params.length}`);
  }

  if (input.metadata) {
    params.push(JSON.stringify(input.metadata));
    updates.push(
      `metadata = coalesce(metadata, '{}'::jsonb) || $${params.length}::jsonb`
    );
  }

  const query = `
    update payouts
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<PayoutRow> = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  return mapPayoutRow(result.rows[0]);
}

export async function listPayoutsByStatus(status: string, limit = 50) {
  const pool = getPgPool();
  const query = `
    select *
      from payouts
     where status = $1::payout_status
     order by created_at desc
     limit $2
  `;
  const result = await pool.query<PayoutRow>(query, [status, limit]);
  return result.rows.map(mapPayoutRow);
}

export async function listTopUpsByPlayer(playerId: string, limit = 50) {
  const pool = getPgPool();
  const result = await pool.query<TopUpRow>(
    `select *
       from top_ups
      where player_id = $1
      order by created_at desc
      limit $2`,
    [playerId, limit]
  );
  return result.rows.map(mapTopUpRow);
}

export async function listPayoutsByPlayer(playerId: string, limit = 50) {
  const pool = getPgPool();
  const result = await pool.query<PayoutRow>(
    `select *
       from payouts
      where player_id = $1
      order by created_at desc
      limit $2`,
    [playerId, limit]
  );
  return result.rows.map(mapPayoutRow);
}

export async function getTopUpByProviderRef(
  providerRef: string,
  provider?: string | null
) {
  const pool = getPgPool();
  const params: unknown[] = [providerRef];
  let query =
    'select * from top_ups where provider_ref = $1 order by created_at desc limit 1';
  if (provider) {
    params.push(provider);
    query =
      'select * from top_ups where provider_ref = $1 and provider = $2 order by created_at desc limit 1';
  }
  const result = await pool.query<TopUpRow>(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  return mapTopUpRow(result.rows[0]);
}

export async function getPayoutById(id: string) {
  const pool = getPgPool();
  const result = await pool.query<PayoutRow>(
    'select * from payouts where id = $1 limit 1',
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapPayoutRow(result.rows[0]);
}
