import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';

export interface LootCatalogRow {
  id: string;
  loot_type: string;
  chain_id: number;
  token_address: string | null;
  token_id: string | number | null;
  decimals: number | null;
  name: string | null;
  remaining: string | number | null;
  last_claimed: string | null;
  reloaded_at: string | null;
  is_active: boolean;
  metadata: unknown;
}

export interface LootCatalogRecord {
  id: string;
  lootType: 'erc20' | 'erc721' | 'erc1155' | 'virtual';
  chainId: number;
  tokenAddress: string | null;
  tokenId: number | null;
  decimals: number | null;
  name: string | null;
  remaining: number | null;
  lastClaimed: string | null;
  reloadedAt: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: LootCatalogRow): LootCatalogRecord {
  return {
    id: row.id,
    lootType: row.loot_type as LootCatalogRecord['lootType'],
    chainId: Number(row.chain_id) || 0,
    tokenAddress: row.token_address ?? null,
    tokenId: toNumber(row.token_id),
    decimals: row.decimals == null ? null : Number(row.decimals),
    name: row.name ?? null,
    remaining: toNumber(row.remaining),
    lastClaimed: row.last_claimed,
    reloadedAt: row.reloaded_at,
    isActive: row.is_active,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface GetActiveByNameOptions {
  client?: PoolClient;
  forUpdate?: boolean;
}

export async function getActiveByName(
  name: string,
  options: GetActiveByNameOptions = {}
) {
  const pool = getPool(options.client);
  const lockClause = options.forUpdate ? ' for update' : '';
  const result = await pool.query<LootCatalogRow>(
    `select *
       from loot_catalog
      where is_active = true
        and lower(name) = lower($1)
      order by coalesce(reloaded_at, last_claimed) desc nulls last, id
      limit 1${lockClause}`,
    [name]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRow(result.rows[0]);
}

export async function listActive() {
  const pool = getPgPool();
  const result = await pool.query<LootCatalogRow>(
    `select *
       from loot_catalog
      where is_active = true
      order by name nulls last, id`
  );
  return result.rows.map(mapRow);
}

export async function setRemaining(
  lootId: string,
  remaining: number,
  client?: PoolClient
) {
  const pool = getPool(client);
  const result: QueryResult<LootCatalogRow> = await pool.query(
    `update loot_catalog
        set remaining = $2,
            last_claimed = case when $2 < remaining then now() else last_claimed end,
            updated_at = now()
      where id = $1
      returning *`,
    [lootId, remaining]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface AdjustRemainingInput {
  lootId: string;
  amount: number;
  client?: PoolClient;
}

export async function decrementRemaining(input: AdjustRemainingInput) {
  const pool = getPool(input.client);
  const result: QueryResult<LootCatalogRow> = await pool.query(
    `update loot_catalog
        set remaining = greatest(0, remaining - $2),
            last_claimed = now()
      where id = $1
      returning *`,
    [input.lootId, input.amount]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface UpsertLootInput {
  id?: string;
  lootType: LootCatalogRecord['lootType'];
  chainId?: number;
  tokenAddress?: string | null;
  tokenId?: number | null;
  decimals?: number | null;
  name?: string | null;
  remaining?: number | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  client?: PoolClient;
}

export async function upsertLoot(input: UpsertLootInput) {
  const pool = getPool(input.client);
  const params = [
    input.id ?? null,
    input.lootType,
    input.chainId ?? 8453,
    input.tokenAddress ?? null,
    input.tokenId ?? null,
    input.decimals ?? null,
    input.name ?? null,
    input.remaining ?? null,
    input.isActive ?? true,
    JSON.stringify(input.metadata ?? {}),
  ];

  const query = `
    insert into loot_catalog (
      id,
      loot_type,
      chain_id,
      token_address,
      token_id,
      decimals,
      name,
      remaining,
      is_active,
      metadata
    ) values (
      coalesce($1, gen_random_uuid()),
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10
    )
    on conflict (id) do update set
      loot_type = excluded.loot_type,
      chain_id = excluded.chain_id,
      token_address = excluded.token_address,
      token_id = excluded.token_id,
      decimals = excluded.decimals,
      name = excluded.name,
      remaining = excluded.remaining,
      is_active = excluded.is_active,
      metadata = excluded.metadata,
      updated_at = now()
    returning *
  `;

  const result: QueryResult<LootCatalogRow> = await pool.query(query, params);
  return mapRow(result.rows[0]);
}

export async function reloadLoot(
  lootId: string,
  amount: number,
  client?: PoolClient
) {
  const pool = getPool(client);
  const result: QueryResult<LootCatalogRow> = await pool.query(
    `update loot_catalog
        set remaining = $2,
            reloaded_at = now(),
            updated_at = now()
      where id = $1
      returning *`,
    [lootId, amount]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}
