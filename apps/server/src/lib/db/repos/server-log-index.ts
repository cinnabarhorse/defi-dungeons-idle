import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type {
  ServerLogIndexRecord,
  ServerLogIndexRow,
  LevelCountsRow,
} from '../types';

function mapRow(row: ServerLogIndexRow): ServerLogIndexRecord {
  const rawCounts = row.level_counts as unknown as LevelCountsRow | null;
  const levelCounts = rawCounts ?? {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
  };

  return {
    gameId: row.game_id,
    tsStart: row.ts_start,
    tsEnd: row.ts_end,
    levelCounts,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    host: row.host,
    pmId: row.pm_id,
    checksum: row.checksum,
    serverId: row.server_id,
    createdAt: row.created_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface InsertServerLogRecordInput {
  gameId: string;
  tsStart: string;
  tsEnd: string;
  levelCounts: LevelCountsRow;
  sizeBytes: number;
  storagePath: string;
  host: string;
  pmId: number;
  checksum: string;
  serverId: string;
  client?: PoolClient;
}

export async function insertShardRecord(
  input: InsertServerLogRecordInput
): Promise<ServerLogIndexRecord> {
  const pool = getPool(input.client);
  const query = `
    insert into server_log_index (
      game_id,
      ts_start,
      ts_end,
      level_counts,
      size_bytes,
      storage_path,
      host,
      pm_id,
      checksum,
      server_id
    )
    values (
      $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10
    )
    returning *
  `;
  const result: QueryResult<ServerLogIndexRow> = await pool.query(query, [
    input.gameId,
    input.tsStart,
    input.tsEnd,
    JSON.stringify(input.levelCounts),
    input.sizeBytes,
    input.storagePath,
    input.host,
    input.pmId,
    input.checksum,
    input.serverId,
  ]);
  return mapRow(result.rows[0]);
}

export interface ListShardFilters {
  gameId: string;
  limit?: number;
  from?: string;
  to?: string;
}

export async function listShardsForGame(
  filters: ListShardFilters
): Promise<ServerLogIndexRecord[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const conditions = ['game_id = $1'];
  const params: unknown[] = [filters.gameId];

  if (filters.from) {
    conditions.push(`ts_start >= $${params.length + 1}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`ts_end <= $${params.length + 1}`);
    params.push(filters.to);
  }

  const query = `
    select *
      from server_log_index
     where ${conditions.join(' and ')}
     order by ts_start desc
     limit ${limit}
  `;

  const result: QueryResult<ServerLogIndexRow> = await pool.query(
    query,
    params
  );
  return result.rows.map(mapRow);
}

export async function getShardByPath(
  storagePath: string
): Promise<ServerLogIndexRecord | null> {
  const pool = getPool();
  const result: QueryResult<ServerLogIndexRow> = await pool.query(
    `select * from server_log_index where storage_path = $1 limit 1`,
    [storagePath]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface ListGamesWithLogsFilters {
  limit?: number;
  from?: string;
  to?: string;
}

export interface GameLogsSummary {
  gameId: string;
  lastTsStart: string;
  lastTsEnd: string;
  shardCount: number;
  totalSizeBytes: number;
}

export async function listGamesWithLogs(
  filters: ListGamesWithLogsFilters = {}
): Promise<GameLogsSummary[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.from) {
    conditions.push(`ts_start >= $${params.length + 1}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`ts_end <= $${params.length + 1}`);
    params.push(filters.to);
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const query = `
    select
      game_id as "gameId",
      max(ts_start) as "lastTsStart",
      max(ts_end) as "lastTsEnd",
      count(*)::int as "shardCount",
      coalesce(sum(size_bytes), 0)::int as "totalSizeBytes"
    from server_log_index
    ${where}
    group by game_id
    order by "lastTsStart" desc
    limit ${limit}
  `;
  const result = await pool.query<{
    gameId: string;
    lastTsStart: string;
    lastTsEnd: string;
    shardCount: number;
    totalSizeBytes: number;
  }>(query, params);
  return result.rows;
}
