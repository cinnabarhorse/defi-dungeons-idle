import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { DepositRecord, DepositRow, DepositStatus } from '../types';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeAddress(value: string): string {
  return value ? value.toLowerCase() : value;
}

function mapDepositRow(row: DepositRow): DepositRecord {
  return {
    id: row.id,
    userId: row.user_id,
    chainId: toNumber(row.chain_id),
    contractAddress: row.contract_address,
    depositorAddress: row.depositor_address,
    tokenAddress: row.token_address,
    tokenSymbol: row.token_symbol,
    amount: row.amount,
    amountWei: row.amount_wei,
    txHash: row.tx_hash,
    txStatus: (row.tx_status as DepositStatus) ?? 'pending',
    depositId: row.deposit_id,
    yieldAmount: row.yield_amount,
    pointsMinted: row.points_minted,
    unlockAt: row.unlock_at,
    autoRenew: Boolean(row.auto_renew),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    discordNotifiedAt: row.discord_notified_at,
    withdrawn: Boolean(row.withdrawn),
    withdrawalTx: row.withdrawal_tx,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface CreatePendingDepositInput {
  userId?: string | null;
  chainId: number;
  contractAddress: string;
  depositorAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  amountWei: string;
  txHash?: string | null;
  autoRenew: boolean;
  expiresAt?: string | null;
  client?: PoolClient;
}

export async function createPendingDeposit(
  input: CreatePendingDepositInput
): Promise<DepositRecord> {
  const pool = getPool(input.client);
  const columns: string[] = [
    'user_id',
    'chain_id',
    'contract_address',
    'depositor_address',
    'token_address',
    'token_symbol',
    'amount',
    'amount_wei',
    'tx_hash',
    'tx_status',
    'auto_renew',
  ];
  const params: unknown[] = [
    input.userId ?? null,
    input.chainId,
    normalizeAddress(input.contractAddress),
    normalizeAddress(input.depositorAddress),
    normalizeAddress(input.tokenAddress),
    input.tokenSymbol.toUpperCase(),
    input.amount,
    input.amountWei,
    input.txHash ? input.txHash.toLowerCase() : null,
    'pending',
    input.autoRenew,
  ];

  if (input.expiresAt) {
    columns.push('expires_at');
    params.push(input.expiresAt);
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const query = `
    insert into public.deposits (${columns.join(', ')})
    values (${placeholders.join(', ')})
    returning *
  `;

  const result: QueryResult<DepositRow> = await pool.query(query, params);
  return mapDepositRow(result.rows[0]);
}

export interface UpdateDepositInput {
  id: string;
  txStatus?: DepositStatus;
  txHash?: string | null;
  depositId?: string | null;
  yieldAmount?: string | null;
  pointsMinted?: string | null;
  unlockAt?: string | null;
  amountWei?: string | null;
  autoRenew?: boolean;
  expiresAt?: string | null;
  withdrawn?: boolean;
  withdrawalTx?: string | null;
  client?: PoolClient;
}

export async function updateDeposit(
  input: UpdateDepositInput
): Promise<DepositRecord | null> {
  const updates: string[] = [];
  const params: unknown[] = [input.id];
  const pool = getPool(input.client);

  if (input.txStatus) {
    params.push(input.txStatus);
    updates.push(`tx_status = $${params.length}`);
  }

  if (input.txHash !== undefined) {
    params.push(input.txHash ? input.txHash.toLowerCase() : null);
    updates.push(`tx_hash = $${params.length}`);
  }

  if (input.depositId !== undefined) {
    params.push(input.depositId);
    updates.push(`deposit_id = $${params.length}`);
  }

  if (input.yieldAmount !== undefined) {
    params.push(input.yieldAmount);
    updates.push(`yield_amount = $${params.length}`);
  }

  if (input.pointsMinted !== undefined) {
    params.push(input.pointsMinted);
    updates.push(`points_minted = $${params.length}`);
  }

  if (input.unlockAt !== undefined) {
    params.push(input.unlockAt);
    updates.push(`unlock_at = $${params.length}`);
  }

  if (input.amountWei !== undefined) {
    params.push(input.amountWei);
    updates.push(`amount_wei = $${params.length}`);
  }

  if (input.autoRenew !== undefined) {
    params.push(input.autoRenew);
    updates.push(`auto_renew = $${params.length}`);
  }

  if (input.expiresAt !== undefined) {
    params.push(input.expiresAt);
    updates.push(`expires_at = $${params.length}`);
  }

  if (input.withdrawn !== undefined) {
    params.push(input.withdrawn);
    updates.push(`withdrawn = $${params.length}`);
  }

  if (input.withdrawalTx !== undefined) {
    params.push(input.withdrawalTx ?? null);
    updates.push(`withdrawal_tx = $${params.length}`);
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push('updated_at = now()');

  const query = `
    update public.deposits
       set ${updates.join(', ')}
     where id = $1
     returning *
  `;

  const result: QueryResult<DepositRow> = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  const record = mapDepositRow(result.rows[0]);
  return record;
}

export async function listDepositsByUser(
  userId: string,
  limit = 50
): Promise<DepositRecord[]> {
  const pool = getPgPool();
  const query = `
    select *
      from public.deposits
     where user_id = $1
     order by created_at desc
     limit $2
  `;
  const result: QueryResult<DepositRow> = await pool.query(query, [
    userId,
    Math.max(1, Math.min(200, limit)),
  ]);
  return result.rows.map(mapDepositRow);
}

export async function listDepositsByAddress(
  depositorAddress: string,
  limit = 50
): Promise<DepositRecord[]> {
  const pool = getPgPool();
  const query = `
    select *
      from public.deposits
     where depositor_address = $1
     order by created_at desc
     limit $2
  `;
  const result: QueryResult<DepositRow> = await pool.query(query, [
    normalizeAddress(depositorAddress),
    Math.max(1, Math.min(200, limit)),
  ]);
  return result.rows.map(mapDepositRow);
}

export async function getDepositByTxHash(
  txHash: string
): Promise<DepositRecord | null> {
  const pool = getPgPool();
  const query = `
    select *
      from public.deposits
     where tx_hash = $1
     limit 1
  `;
  const result: QueryResult<DepositRow> = await pool.query(query, [
    txHash.toLowerCase(),
  ]);
  if (result.rows.length === 0) return null;
  return mapDepositRow(result.rows[0]);
}

export async function listDepositsByStatus(
  status: DepositStatus,
  limit = 50,
  tokenSymbol?: string | null
): Promise<DepositRecord[]> {
  const pool = getPgPool();
  const params: unknown[] = [status];
  let filters = 'where tx_status = $1';

  if (tokenSymbol) {
    const normalized = tokenSymbol.trim().toUpperCase();
    if (normalized) {
      params.push(normalized);
      filters += ` and token_symbol = $${params.length}`;
    }
  }

  params.push(Math.max(1, Math.min(500, limit)));
  const limitParam = `$${params.length}`;
  const query = `
    select *
      from public.deposits
     ${filters}
     order by created_at desc
     limit ${limitParam}
  `;
  const result: QueryResult<DepositRow> = await pool.query(query, params);
  return result.rows.map(mapDepositRow);
}

export async function getStakedUsdcBalance(userId: string): Promise<number> {
  const pool = getPgPool();
  const query = `
    select coalesce(sum(cast(amount as numeric)), 0) as total_staked
      from public.deposits
     where user_id = $1
       and token_symbol = 'USDC'
       and tx_status = 'credited'
       and (withdrawn is null or withdrawn = false)
  `;
  const result = await pool.query<{ total_staked: string }>(query, [userId]);
  const total = result.rows[0]?.total_staked ?? '0';
  const parsed = Number.parseFloat(total);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface StakedUnlockBalances {
  usdc: number;
  gho: number;
  ghst: number;
  total: number;
}

/**
 * Generic helper: get staked balances for a set of token symbols.
 *
 * Notes:
 * - Uses the `deposits` table and the same definition of "staked" as the existing
 *   USDC/GHO unlock system: credited deposits that are not withdrawn.
 * - Returns a map keyed by UPPERCASE token symbol.
 */
export async function getStakedTokenBalances(
  userId: string,
  tokenSymbols: string[]
): Promise<Record<string, number>> {
  const pool = getPgPool();
  const symbols = (tokenSymbols ?? []).map((s) => (s ?? '').toUpperCase());
  const unique = Array.from(new Set(symbols)).filter(Boolean);
  if (unique.length === 0) return {};

  const query = `
    select token_symbol, coalesce(sum(cast(amount as numeric)), 0) as total_staked
      from public.deposits
     where user_id = $1
       and token_symbol = any($2)
       and tx_status = 'credited'
       and (withdrawn is null or withdrawn = false)
     group by token_symbol
  `;

  const result = await pool.query<{
    token_symbol: string;
    total_staked: string;
  }>(query, [userId, unique]);

  const out: Record<string, number> = {};
  for (const row of result.rows) {
    const normalized = row.token_symbol?.toUpperCase() ?? '';
    const parsed = Number.parseFloat(row.total_staked ?? '0');
    out[normalized] = Number.isFinite(parsed) ? parsed : 0;
  }

  // Ensure all requested symbols exist (default 0)
  for (const s of unique) out[s] = out[s] ?? 0;
  return out;
}

export async function getStakedUnlockBalances(
  userId: string
): Promise<StakedUnlockBalances> {
  const pool = getPgPool();
  const query = `
    select token_symbol, coalesce(sum(cast(amount as numeric)), 0) as total_staked
      from public.deposits
     where user_id = $1
       and token_symbol = any($2)
       and tx_status = 'credited'
       and (withdrawn is null or withdrawn = false)
     group by token_symbol
  `;
  const result = await pool.query<{
    token_symbol: string;
    total_staked: string;
  }>(query, [userId, ['USDC', 'GHO', 'GHST']]);
  const balances = { usdc: 0, gho: 0, ghst: 0 };
  for (const row of result.rows) {
    const parsed = Number.parseFloat(row.total_staked ?? '0');
    const normalized = row.token_symbol?.toUpperCase() ?? '';
    const value = Number.isFinite(parsed) ? parsed : 0;
    if (normalized === 'USDC') balances.usdc = value;
    if (normalized === 'GHO') balances.gho = value;
    if (normalized === 'GHST') balances.ghst = value;
  }
  // Unlock-tier eligibility remains based on USDC + GHO staked amounts.
  const total = balances.usdc + balances.gho;
  return { ...balances, total };
}

export async function getGlobalStakedUnlockBalances(): Promise<StakedUnlockBalances> {
  const pool = getPgPool();
  const query = `
    select token_symbol, coalesce(sum(cast(amount as numeric)), 0) as total_staked
      from public.deposits
     where token_symbol = any($1)
       and tx_status = 'credited'
       and (withdrawn is null or withdrawn = false)
     group by token_symbol
  `;
  const result = await pool.query<{
    token_symbol: string;
    total_staked: string;
  }>(query, [['USDC', 'GHO', 'GHST']]);
  const balances = { usdc: 0, gho: 0, ghst: 0 };
  for (const row of result.rows) {
    const parsed = Number.parseFloat(row.total_staked ?? '0');
    const normalized = row.token_symbol?.toUpperCase() ?? '';
    const value = Number.isFinite(parsed) ? parsed : 0;
    if (normalized === 'USDC') balances.usdc = value;
    if (normalized === 'GHO') balances.gho = value;
    if (normalized === 'GHST') balances.ghst = value;
  }
  // Unlock-tier eligibility remains based on USDC + GHO staked amounts.
  const total = balances.usdc + balances.gho;
  return { ...balances, total };
}

/**
 * Atomically credit a deposit - only updates if points_minted is NULL
 * Returns the updated deposit if successful, null if already credited
 */
export async function creditDepositIfNotCredited(
  depositId: string,
  pointsMinted: string,
  client?: PoolClient
): Promise<DepositRecord | null> {
  const pool = getPool(client);
  const query = `
    update public.deposits
       set points_minted = $2,
           tx_status = 'credited',
           updated_at = now()
     where id = $1
       and (points_minted is null or points_minted = '')
     returning *
  `;
  const result: QueryResult<DepositRow> = await pool.query(query, [
    depositId,
    pointsMinted,
  ]);
  if (result.rows.length === 0) return null;
  const record = mapDepositRow(result.rows[0]);
  return record;
}

export async function listRecentCreditedUsdcDeposits(
  sinceIso: string,
  limit = 200
): Promise<DepositRecord[]> {
  const pool = getPgPool();
  const safeLimit = Math.max(1, Math.min(500, limit));
  const query = `
    select *
      from public.deposits
     where token_symbol = any($3)
       and tx_status = 'credited'
       and discord_notified_at is null
       and coalesce(updated_at, created_at) > $1
     order by coalesce(updated_at, created_at) asc
     limit $2
  `;
  const result: QueryResult<DepositRow> = await pool.query(query, [
    sinceIso,
    safeLimit,
    ['USDC', 'GHO', 'GHST'],
  ]);
  return result.rows.map(mapDepositRow);
}

export interface DiscordNotificationClaimResult {
  claimedIds: string[];
  shouldNotify: boolean;
}

function normalizeTxHash(txHash?: string | null): string | null {
  const normalized = txHash?.trim().toLowerCase() ?? '';
  return /^0x[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

export async function claimDepositDiscordNotification(input: {
  depositId: string;
  txHash?: string | null;
}): Promise<DiscordNotificationClaimResult> {
  const pool = getPgPool();
  const normalizedHash = normalizeTxHash(input.txHash);
  if (normalizedHash) {
    const result = await pool.query<{
      claimed_ids: string[];
      had_previous_notified: boolean;
    }>(
      `
      with previously_notified as (
        select 1
          from public.deposits
         where tx_hash = $1
           and token_symbol = any($2)
           and tx_status = 'credited'
           and discord_notified_at is not null
         limit 1
      ),
      claimed as (
        update public.deposits
           set discord_notified_at = now()
         where tx_hash = $1
           and token_symbol = any($2)
           and tx_status = 'credited'
           and discord_notified_at is null
         returning id::text
      )
      select coalesce(array(select id from claimed), array[]::text[]) as claimed_ids,
             exists(select 1 from previously_notified) as had_previous_notified
      `,
      [normalizedHash, ['USDC', 'GHO', 'GHST']]
    );

    const row = result.rows[0];
    const claimedIds = (row?.claimed_ids ?? []).filter(Boolean);
    return {
      claimedIds,
      shouldNotify: claimedIds.length > 0 && !Boolean(row?.had_previous_notified),
    };
  }

  const fallback = await pool.query<{ id: string }>(
    `
    update public.deposits
       set discord_notified_at = now()
     where id = $1
       and token_symbol = any($2)
       and tx_status = 'credited'
       and discord_notified_at is null
     returning id::text as id
    `,
    [input.depositId, ['USDC', 'GHO', 'GHST']]
  );
  const claimedIds = fallback.rows.map((row) => row.id).filter(Boolean);
  return {
    claimedIds,
    shouldNotify: claimedIds.length > 0,
  };
}

export async function releaseDepositDiscordNotificationClaim(
  depositIds: string[]
): Promise<void> {
  const pool = getPgPool();
  const uniqueIds = Array.from(
    new Set(
      (depositIds ?? [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => id.length > 0)
    )
  );
  if (uniqueIds.length === 0) return;
  await pool.query(
    `
    update public.deposits
       set discord_notified_at = null
     where id::text = any($1::text[])
    `,
    [uniqueIds]
  );
}

export async function markDepositDiscordNotified(
  depositId: string
): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `update public.deposits
        set discord_notified_at = now()
      where id = $1
        and discord_notified_at is null`,
    [depositId]
  );
}
