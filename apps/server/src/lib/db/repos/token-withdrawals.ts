import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type {
  TokenWithdrawalRow,
  TokenWithdrawalRecord,
  TokenWithdrawalStatus,
} from '../types';

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch {
      return BigInt(0);
    }
  }
  return BigInt(0);
}

function mapRow(row: TokenWithdrawalRow): TokenWithdrawalRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    currency: row.currency,
    amount: row.amount,
    amountBaseUnits: toBigInt(row.amount_base_units),
    source: row.source,
    gameId: row.game_id,
    lootDistributionId: row.loot_distribution_id,
    economyTransactionId: row.economy_transaction_id,
    status: row.status,
    txHash: row.tx_hash,
    chainId:
      row.chain_id == null
        ? null
        : typeof row.chain_id === 'number'
          ? row.chain_id
          : Number.parseInt(String(row.chain_id), 10) || null,
    tokenContractAddress: row.token_contract_address,
    receivedAt: row.received_at,
    withdrawalRequestedAt: row.withdrawal_requested_at,
    withdrawalApprovedAt: row.withdrawal_approved_at,
    withdrawalSendingAt: row.withdrawal_sending_at,
    withdrawalPendingAt: row.withdrawal_pending_at,
    withdrawalConfirmedAt: row.withdrawal_confirmed_at,
    failureReason: row.failure_reason,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface CreateTokenWithdrawalInput {
  playerId: string;
  currency?: string;
  amount: string;
  amountBaseUnits: bigint;
  source: string;
  gameId?: string | null;
  lootDistributionId?: string | null;
  economyTransactionId?: string | null;
  metadata?: Record<string, unknown>;
  receivedAtIso?: string | null;
  status?: TokenWithdrawalStatus;
  chainId?: number | null;
  tokenContractAddress?: string | null;
  client?: PoolClient;
}

export async function createTokenWithdrawal(
  input: CreateTokenWithdrawalInput
): Promise<TokenWithdrawalRecord> {
  const pool = getPool(input.client);
  const query = `
    insert into token_withdrawals (
      player_id,
      currency,
      amount,
      amount_base_units,
      source,
      game_id,
      loot_distribution_id,
      economy_transaction_id,
      status,
      received_at,
      metadata,
      chain_id,
      token_contract_address
    ) values (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      coalesce($10::timestamptz, now()),
      $11,
      $12,
      $13
    )
    returning *
  `;

  const resolvedChainId =
    typeof input.chainId === 'number' && Number.isFinite(input.chainId)
      ? Math.trunc(input.chainId)
      : null;
  const resolvedTokenAddress =
    typeof input.tokenContractAddress === 'string' &&
    input.tokenContractAddress.trim().length > 0
      ? input.tokenContractAddress.trim()
      : null;

  const params = [
    input.playerId,
    input.currency ?? 'USDC',
    input.amount,
    input.amountBaseUnits.toString(),
    input.source,
    input.gameId ?? null,
    input.lootDistributionId ?? null,
    input.economyTransactionId ?? null,
    input.status ?? 'received',
    input.receivedAtIso ?? null,
    JSON.stringify(input.metadata ?? {}),
    resolvedChainId,
    resolvedTokenAddress,
  ];

  const result: QueryResult<TokenWithdrawalRow> = await pool.query(
    query,
    params
  );
  return mapRow(result.rows[0]);
}

export async function getTokenWithdrawalById(
  id: string,
  client?: PoolClient
): Promise<TokenWithdrawalRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<TokenWithdrawalRow> = await pool.query(
    `select * from token_withdrawals where id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getTokenWithdrawalsByPlayer(
  playerId: string,
  status?: TokenWithdrawalStatus,
  client?: PoolClient
): Promise<TokenWithdrawalRecord[]> {
  const pool = getPool(client);
  const params: unknown[] = [playerId];
  const conditions = ['player_id = $1'];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const query = `
    select *
      from token_withdrawals
     where ${conditions.join(' and ')}
     order by created_at desc
  `;

  const result: QueryResult<TokenWithdrawalRow> = await pool.query(
    query,
    params
  );
  return result.rows.map(mapRow);
}

export async function getTokenWithdrawalsByStatus(
  status: TokenWithdrawalStatus,
  client?: PoolClient
): Promise<TokenWithdrawalRecord[]> {
  const pool = getPool(client);
  const query = `
    select *
      from token_withdrawals
     where status = $1
     order by created_at asc
  `;
  const result: QueryResult<TokenWithdrawalRow> = await pool.query(query, [
    status,
  ]);
  return result.rows.map(mapRow);
}

export async function claimNextApprovedWithdrawal(
  client: PoolClient
): Promise<TokenWithdrawalRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<TokenWithdrawalRow> = await pool.query(
    `
      with next_row as (
        select id
          from token_withdrawals
         where status = 'withdrawal_approved'
         order by created_at asc
         limit 1
         for update skip locked
      )
      update token_withdrawals tw
         set status = 'withdrawal_sending',
             withdrawal_sending_at = coalesce(withdrawal_sending_at, now()),
             updated_at = now(),
             failure_reason = null
        from next_row
       where tw.id = next_row.id
      returning tw.*
    `
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getStuckSendingWithdrawals(
  cutoffIso: string,
  limit: number,
  client?: PoolClient
): Promise<TokenWithdrawalRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit) || 50));
  const result: QueryResult<TokenWithdrawalRow> = await pool.query(
    `
      select *
        from token_withdrawals
       where status = 'withdrawal_sending'
         and withdrawal_sending_at is not null
         and withdrawal_sending_at < $1::timestamptz
       order by withdrawal_sending_at asc
       limit $2
    `,
    [cutoffIso, safeLimit]
  );
  return result.rows.map(mapRow);
}

export interface UpdateTokenWithdrawalStatusInput {
  id: string;
  status: TokenWithdrawalStatus;
  onlyIfCurrentStatus?: TokenWithdrawalStatus | TokenWithdrawalStatus[];
  txHash?: string | null;
  failureReason?: string | null;
  chainId?: number | null;
  tokenContractAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  client?: PoolClient;
}

export async function updateTokenWithdrawalStatus(
  input: UpdateTokenWithdrawalStatusInput
): Promise<TokenWithdrawalRecord | null> {
  const params: unknown[] = [input.id, input.status];
  const updates: string[] = ['status = $2', 'updated_at = now()'];
  let whereClause = 'where id = $1';

  switch (input.status) {
    case 'withdrawal_waiting':
      updates.push(
        'withdrawal_requested_at = coalesce(withdrawal_requested_at, now())'
      );
      break;
    case 'withdrawal_approved':
      updates.push(
        'withdrawal_approved_at = coalesce(withdrawal_approved_at, now())'
      );
      break;
    case 'withdrawal_sending':
      updates.push('withdrawal_sending_at = coalesce(withdrawal_sending_at, now())');
      break;
    case 'withdrawal_pending':
      updates.push('withdrawal_pending_at = now()');
      break;
    case 'withdrawal_confirmed':
      updates.push('withdrawal_confirmed_at = now()');
      break;
    default:
      break;
  }

  if (input.txHash !== undefined) {
    params.push(input.txHash);
    updates.push(`tx_hash = $${params.length}`);
  }

  if (input.failureReason !== undefined) {
    const reason = input.failureReason ?? null;
    params.push(reason);
    updates.push(`failure_reason = $${params.length}`);
  } else if (
    input.status === 'withdrawal_failed' ||
    input.status === 'withdrawal_rejected'
  ) {
    const fallbackReason =
      input.status === 'withdrawal_rejected'
        ? 'Rejected by admin'
        : 'Unknown failure';
    params.push(fallbackReason);
    updates.push(
      `failure_reason = coalesce(failure_reason, $${params.length})`
    );
  } else {
    updates.push('failure_reason = null');
  }

  if (input.chainId !== undefined) {
    const value =
      input.chainId == null
        ? null
        : Number.isFinite(input.chainId)
          ? input.chainId
          : null;
    params.push(value);
    updates.push(`chain_id = $${params.length}`);
  }

  if (input.tokenContractAddress !== undefined) {
    params.push(input.tokenContractAddress ?? null);
    updates.push(`token_contract_address = $${params.length}`);
  }

  if (input.metadata !== undefined) {
    params.push(JSON.stringify(input.metadata ?? {}));
    updates.push(`metadata = $${params.length}::jsonb`);
  }

  if (input.onlyIfCurrentStatus !== undefined) {
    const currentStatuses = Array.isArray(input.onlyIfCurrentStatus)
      ? input.onlyIfCurrentStatus
      : [input.onlyIfCurrentStatus];
    const uniqueStatuses = [...new Set(currentStatuses)];
    if (uniqueStatuses.length === 0) {
      return null;
    }
    params.push(uniqueStatuses);
    whereClause = `${whereClause} and status::text = any($${params.length}::text[])`;
  }

  const query = `
    update token_withdrawals
       set ${updates.join(', ')}
     ${whereClause}
     returning *
  `;

  const pool = getPool(input.client);
  const result: QueryResult<TokenWithdrawalRow> = await pool.query(
    query,
    params
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}
