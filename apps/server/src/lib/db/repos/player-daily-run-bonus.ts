import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';

export interface PlayerDailyRunBonusRow {
  date: string;
  account_id: string;
  mode: 'progression' | 'competition';
  bonus_runs: number | string;
  created_at: string;
  updated_at: string;
}

export interface PlayerDailyRunBonusRecord {
  date: string;
  accountId: string;
  mode: 'progression' | 'competition';
  bonusRuns: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetBonusRunsInput {
  accountId: string;
  date: string;
  mode: 'progression' | 'competition';
  client?: PoolClient;
}

export interface IncrementBonusRunsInput extends GetBonusRunsInput {
  delta: number;
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

function mapRow(row: PlayerDailyRunBonusRow): PlayerDailyRunBonusRecord {
  return {
    date: row.date,
    accountId: row.account_id,
    mode: row.mode,
    bonusRuns: Number(row.bonus_runs) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getBonusRuns(input: GetBonusRunsInput): Promise<number> {
  const pool = getPool(input.client);
  const result: QueryResult<Pick<PlayerDailyRunBonusRow, 'bonus_runs'>> =
    await pool.query(
      `select bonus_runs
         from player_daily_run_bonus
        where account_id = $1
          and date = $2
          and mode = $3`,
      [input.accountId, input.date, input.mode]
    );
  return Number(result.rows[0]?.bonus_runs ?? 0);
}

export async function incrementBonusRuns(
  input: IncrementBonusRunsInput
): Promise<PlayerDailyRunBonusRecord> {
  const pool = getPool(input.client);
  const delta = Number.isFinite(input.delta) ? Math.floor(input.delta) : 0;
  if (delta === 0) {
    const existing = await getBonusRuns(input);
    return {
      date: input.date,
      accountId: input.accountId,
      mode: input.mode,
      bonusRuns: existing,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
  }

  await pool.query(
    `insert into player_daily_run_bonus (date, account_id, mode, bonus_runs)
     values ($1, $2, $3, 0)
     on conflict (date, account_id, mode) do nothing`,
    [input.date, input.accountId, input.mode]
  );

  const updated: QueryResult<PlayerDailyRunBonusRow> = await pool.query(
    `update player_daily_run_bonus
        set bonus_runs = greatest(0, bonus_runs + $4),
            updated_at = now()
      where date = $1
        and account_id = $2
        and mode = $3
      returning *`,
    [input.date, input.accountId, input.mode, delta]
  );

  return mapRow(updated.rows[0]);
}

