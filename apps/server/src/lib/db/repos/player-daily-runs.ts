import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';

export interface PlayerDailyRunsRow {
  account_id: string;
  date: string;
  used_runs: number | string;
  updated_at: string;
}

export interface PlayerDailyRunsRecord {
  accountId: string;
  date: string;
  usedRuns: number;
  updatedAt: string;
}

export interface ConsumeDailyRunInput {
  accountId: string;
  date: string;
  allowedRuns: number;
  client?: PoolClient;
}

export type ConsumeDailyRunResult =
  | { success: true; usedRuns: number; remainingRuns: number }
  | { success: false; usedRuns: number; remainingRuns: number };

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

function mapRow(row: PlayerDailyRunsRow): PlayerDailyRunsRecord {
  return {
    accountId: row.account_id,
    date: row.date,
    usedRuns: Number(row.used_runs) || 0,
    updatedAt: row.updated_at,
  };
}

export async function getDailyRunUsage(
  accountId: string,
  date: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);
  const result: QueryResult<Pick<PlayerDailyRunsRow, 'used_runs'>> =
    await pool.query(
      `select used_runs from player_daily_runs where account_id = $1 and date = $2`,
      [accountId, date]
    );
  return Number(result.rows[0]?.used_runs ?? 0);
}

export async function getDailyRunRecord(
  accountId: string,
  date: string,
  client?: PoolClient
): Promise<PlayerDailyRunsRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<PlayerDailyRunsRow> = await pool.query(
    `select * from player_daily_runs where account_id = $1 and date = $2`,
    [accountId, date]
  );
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}

export async function consumeDailyRun(
  input: ConsumeDailyRunInput
): Promise<ConsumeDailyRunResult> {
  const pool = getPool(input.client);
  const allowedRuns = Number.isFinite(input.allowedRuns)
    ? Math.max(0, Math.floor(input.allowedRuns))
    : 0;

  if (allowedRuns <= 0) {
    const usedRuns = await getDailyRunUsage(
      input.accountId,
      input.date,
      input.client
    );
    return { success: false, usedRuns, remainingRuns: 0 };
  }

  await pool.query(
    `insert into player_daily_runs (account_id, date, used_runs)
     values ($1, $2, 0)
     on conflict (account_id, date) do nothing`,
    [input.accountId, input.date]
  );

  const updateResult: QueryResult<Pick<PlayerDailyRunsRow, 'used_runs'>> =
    await pool.query(
      `update player_daily_runs
          set used_runs = used_runs + 1,
              updated_at = now()
        where account_id = $1
          and date = $2
          and used_runs < $3
        returning used_runs`,
      [input.accountId, input.date, allowedRuns]
    );

  if (updateResult.rows.length > 0) {
    const usedRuns = Number(updateResult.rows[0]?.used_runs ?? 0);
    return {
      success: true,
      usedRuns,
      remainingRuns: Math.max(0, allowedRuns - usedRuns),
    };
  }

  const usedRuns = await getDailyRunUsage(
    input.accountId,
    input.date,
    input.client
  );
  return {
    success: false,
    usedRuns,
    remainingRuns: Math.max(0, allowedRuns - usedRuns),
  };
}
