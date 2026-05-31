import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import { TRADE_EXTEND_WINDOW_MINUTES } from '../../trading-game';

export type CompetitionTradeToken = 'BTC' | 'ETH' | 'GHST';
export type CompetitionTradeDirection = 'long' | 'short';
export type CompetitionTradeState =
  | 'unsettled'
  | 'settled_manual'
  | 'settled_close';
export type CompetitionTradeSettleReason = 'manual' | 'close';

export interface CompetitionTradeRunRow {
  id: string;
  competition_date: string | Date;
  difficulty_id: string;
  account_id: string;
  run_id: string;
  base_score: number;
  time_multiplier: string | number;
  token: CompetitionTradeToken;
  direction: CompetitionTradeDirection;
  risk_leverage: string | number;
  entry_price_usd: string | number;
  entry_sampled_at: string;
  close_at: string;
  update_count: number;
  state: CompetitionTradeState;
  settle_reason: CompetitionTradeSettleReason | null;
  settle_price_usd: string | number | null;
  settled_at: string | null;
  trade_multiplier: string | number | null;
  final_score: string | number | null;
  oracle_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitionTradeRunRecord {
  id: string;
  competitionDate: string;
  difficultyId: string;
  accountId: string;
  runId: string;
  baseScore: number;
  timeMultiplier: number;
  token: CompetitionTradeToken;
  direction: CompetitionTradeDirection;
  riskLeverage: number;
  entryPriceUsd: number;
  entrySampledAt: string;
  closeAt: string;
  updateCount: number;
  state: CompetitionTradeState;
  settleReason: CompetitionTradeSettleReason | null;
  settlePriceUsd: number | null;
  settledAt: string | null;
  tradeMultiplier: number | null;
  finalScore: number | null;
  oracleMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionTradeRunWithPlayerRow extends CompetitionTradeRunRow {
  player_name: string | null;
  wallet_address: string | null;
}

export interface CompetitionTradeRunWithPlayerRecord
  extends CompetitionTradeRunRecord {
  playerName: string | null;
  walletAddress: string | null;
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  return code === '42703' && message.includes(columnName.toLowerCase());
}

function deriveCloseAtIso(row: CompetitionTradeRunRow): string {
  const rawCloseAt = (row as unknown as { close_at?: unknown }).close_at;
  const parsedCloseAtMs = Date.parse(String(rawCloseAt ?? ''));
  if (Number.isFinite(parsedCloseAtMs)) {
    return new Date(parsedCloseAtMs).toISOString();
  }
  const parsedEntrySampledAtMs = Date.parse(String(row.entry_sampled_at ?? ''));
  const fallbackBaseMs = Number.isFinite(parsedEntrySampledAtMs)
    ? parsedEntrySampledAtMs
    : Date.now();
  return new Date(
    fallbackBaseMs + TRADE_EXTEND_WINDOW_MINUTES * 60_000
  ).toISOString();
}

function formatLocalDateAsIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function deriveCompetitionDate(row: Pick<CompetitionTradeRunRow, 'competition_date'>): string {
  const rawCompetitionDate = row.competition_date;
  if (rawCompetitionDate instanceof Date) {
    const dateMs = rawCompetitionDate.getTime();
    if (Number.isFinite(dateMs)) {
      return formatLocalDateAsIsoDate(rawCompetitionDate);
    }
  }

  const rawValue = String(rawCompetitionDate ?? '').trim();
  const datePrefixMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePrefixMatch?.[1]) {
    return datePrefixMatch[1];
  }

  const parsedMs = Date.parse(rawValue);
  if (Number.isFinite(parsedMs)) {
    return new Date(parsedMs).toISOString().slice(0, 10);
  }

  return rawValue;
}

function mapRow(row: CompetitionTradeRunRow): CompetitionTradeRunRecord {
  const rawUpdateCount = (row as unknown as { update_count?: unknown }).update_count;
  const parsedUpdateCount = Number(rawUpdateCount);
  return {
    id: row.id,
    competitionDate: deriveCompetitionDate(row),
    difficultyId: row.difficulty_id,
    accountId: row.account_id,
    runId: row.run_id,
    baseScore: Number(row.base_score),
    timeMultiplier: Number(row.time_multiplier),
    token: row.token,
    direction: row.direction,
    riskLeverage: Number(row.risk_leverage),
    entryPriceUsd: Number(row.entry_price_usd),
    entrySampledAt: row.entry_sampled_at,
    closeAt: deriveCloseAtIso(row),
    updateCount: Number.isFinite(parsedUpdateCount) ? parsedUpdateCount : 0,
    state: row.state,
    settleReason: row.settle_reason,
    settlePriceUsd:
      row.settle_price_usd === null ? null : Number(row.settle_price_usd),
    settledAt: row.settled_at,
    tradeMultiplier:
      row.trade_multiplier === null ? null : Number(row.trade_multiplier),
    finalScore: row.final_score === null ? null : Number(row.final_score),
    oracleMeta: row.oracle_meta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowWithPlayer(
  row: CompetitionTradeRunWithPlayerRow
): CompetitionTradeRunWithPlayerRecord {
  const base = mapRow(row);
  return {
    ...base,
    playerName: row.player_name,
    walletAddress: row.wallet_address,
  };
}

export interface CreateUnsettledTradeRunInput {
  competitionDate: string;
  difficultyId: string;
  accountId: string;
  runId: string;
  baseScore: number;
  timeMultiplier: number;
  token: CompetitionTradeToken;
  direction: CompetitionTradeDirection;
  riskLeverage: number;
  entryPriceUsd: number;
  entrySampledAt: string;
  closeAt: string;
  oracleMeta?: Record<string, unknown>;
  client?: PoolClient;
}

export async function createUnsettledTradeRun(
  input: CreateUnsettledTradeRunInput
): Promise<CompetitionTradeRunRecord> {
  const pool = getPool(input.client);
  try {
    const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
      `
        insert into competition_trade_runs (
          competition_date,
          difficulty_id,
          account_id,
          run_id,
          base_score,
          time_multiplier,
          token,
          direction,
          risk_leverage,
          entry_price_usd,
          entry_sampled_at,
          close_at,
          update_count,
          state,
          oracle_meta
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 'unsettled', $13::jsonb
        )
        on conflict (competition_date, difficulty_id, account_id, run_id) do update
        set updated_at = now()
        returning *
      `,
      [
        input.competitionDate,
        input.difficultyId,
        input.accountId,
        input.runId,
        Math.max(0, Math.floor(input.baseScore)),
        input.timeMultiplier,
        input.token,
        input.direction,
        input.riskLeverage,
        input.entryPriceUsd,
        input.entrySampledAt,
        input.closeAt,
        JSON.stringify(input.oracleMeta ?? {}),
      ]
    );
    return mapRow(result.rows[0]);
  } catch (error) {
    const missingCloseAt = isMissingColumnError(error, 'close_at');
    const missingUpdateCount = isMissingColumnError(error, 'update_count');
    if (!missingCloseAt && !missingUpdateCount) {
      throw error;
    }

    const legacyResult: QueryResult<CompetitionTradeRunRow> = await pool.query(
      `
        insert into competition_trade_runs (
          competition_date,
          difficulty_id,
          account_id,
          run_id,
          base_score,
          time_multiplier,
          token,
          direction,
          risk_leverage,
          entry_price_usd,
          entry_sampled_at,
          state,
          oracle_meta
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unsettled', $12::jsonb
        )
        on conflict (competition_date, difficulty_id, account_id, run_id) do update
        set updated_at = now()
        returning *,
          (entry_sampled_at + interval '${TRADE_EXTEND_WINDOW_MINUTES} minutes') as close_at,
          0::int as update_count
      `,
      [
        input.competitionDate,
        input.difficultyId,
        input.accountId,
        input.runId,
        Math.max(0, Math.floor(input.baseScore)),
        input.timeMultiplier,
        input.token,
        input.direction,
        input.riskLeverage,
        input.entryPriceUsd,
        input.entrySampledAt,
        JSON.stringify(input.oracleMeta ?? {}),
      ]
    );
    return mapRow(legacyResult.rows[0]);
  }
}

export async function getTradeRunById(
  id: string,
  client?: PoolClient
): Promise<CompetitionTradeRunRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
    `select * from competition_trade_runs where id = $1 limit 1`,
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getTradeRunByRunIdAndAccount(
  runId: string,
  accountId: string,
  client?: PoolClient
): Promise<CompetitionTradeRunRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
    `
      select *
      from competition_trade_runs
      where run_id = $1 and account_id = $2
      order by created_at desc
      limit 1
    `,
    [runId, accountId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface SettleTradeRunInput {
  id: string;
  state: 'settled_manual' | 'settled_close';
  settleReason: CompetitionTradeSettleReason;
  settlePriceUsd: number;
  settledAt: string;
  tradeMultiplier: number;
  finalScore: number;
  oracleMeta?: Record<string, unknown>;
  client?: PoolClient;
}

export async function settleTradeRunIfUnsettled(
  input: SettleTradeRunInput
): Promise<CompetitionTradeRunRecord | null> {
  const pool = getPool(input.client);
  const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
    `
      update competition_trade_runs
      set
        state = $2,
        settle_reason = $3,
        settle_price_usd = $4,
        settled_at = $5,
        trade_multiplier = $6,
        final_score = $7,
        oracle_meta = coalesce(oracle_meta, '{}'::jsonb) || $8::jsonb,
        updated_at = now()
      where id = $1 and state = 'unsettled'
      returning *
    `,
    [
      input.id,
      input.state,
      input.settleReason,
      input.settlePriceUsd,
      input.settledAt,
      input.tradeMultiplier,
      Math.max(0, Math.floor(input.finalScore)),
      JSON.stringify(input.oracleMeta ?? {}),
    ]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function listUnsettledTradeRunsForDateAndDifficulty(
  competitionDate: string,
  difficultyId: string,
  limit: number = 500,
  client?: PoolClient
): Promise<CompetitionTradeRunWithPlayerRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const result: QueryResult<CompetitionTradeRunWithPlayerRow> = await pool.query(
    `
      select
        ctr.*,
        p.username as player_name,
        p.wallet_address
      from competition_trade_runs ctr
      left join players p
        on p.id = ctr.account_id
      where ctr.competition_date = $1
        and ctr.difficulty_id = $2
        and ctr.state = 'unsettled'
      order by ctr.created_at asc
      limit $3
    `,
    [competitionDate, difficultyId, safeLimit]
  );
  return result.rows.map(mapRowWithPlayer);
}

export async function listUnsettledTradeRunsForDate(
  competitionDate: string,
  limit: number = 5000,
  client?: PoolClient
): Promise<CompetitionTradeRunRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(10000, Math.trunc(limit)));
  const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
    `
      select *
      from competition_trade_runs
      where competition_date = $1
        and state = 'unsettled'
      order by created_at asc
      limit $2
    `,
    [competitionDate, safeLimit]
  );
  return result.rows.map(mapRow);
}

export async function listDueUnsettledTradeRunsForDate(
  competitionDate: string,
  closeAtIso: string,
  limit: number = 5000,
  client?: PoolClient
): Promise<CompetitionTradeRunRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(10000, Math.trunc(limit)));
  try {
    const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
      `
        select *
        from competition_trade_runs
        where competition_date = $1
          and state = 'unsettled'
          and close_at <= $2::timestamptz
        order by close_at asc, created_at asc
        limit $3
      `,
      [competitionDate, closeAtIso, safeLimit]
    );
    return result.rows.map(mapRow);
  } catch (error) {
    if (!isMissingColumnError(error, 'close_at')) {
      throw error;
    }
    const legacyResult: QueryResult<CompetitionTradeRunRow> = await pool.query(
      `
        select *,
          (entry_sampled_at + interval '${TRADE_EXTEND_WINDOW_MINUTES} minutes') as close_at,
          0::int as update_count
        from competition_trade_runs
        where competition_date = $1
          and state = 'unsettled'
          and (entry_sampled_at + interval '${TRADE_EXTEND_WINDOW_MINUTES} minutes') <= $2::timestamptz
        order by entry_sampled_at asc, created_at asc
        limit $3
      `,
      [competitionDate, closeAtIso, safeLimit]
    );
    return legacyResult.rows.map(mapRow);
  }
}

export async function countDueUnsettledTradeRunsForDate(
  competitionDate: string,
  closeAtIso: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);
  try {
    const result = await pool.query(
      `
        select count(*)::int as count
        from competition_trade_runs
        where competition_date = $1
          and state = 'unsettled'
          and close_at <= $2::timestamptz
      `,
      [competitionDate, closeAtIso]
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    if (!isMissingColumnError(error, 'close_at')) {
      throw error;
    }
    const legacyResult = await pool.query(
      `
        select count(*)::int as count
        from competition_trade_runs
        where competition_date = $1
          and state = 'unsettled'
          and (entry_sampled_at + interval '${TRADE_EXTEND_WINDOW_MINUTES} minutes') <= $2::timestamptz
      `,
      [competitionDate, closeAtIso]
    );
    return Number(legacyResult.rows[0]?.count ?? 0);
  }
}

export async function listDueUnsettledTradeRunDates(
  closeAtIso: string,
  limit: number = 10,
  client?: PoolClient
): Promise<string[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  try {
    const result: QueryResult<Pick<CompetitionTradeRunRow, 'competition_date'>> =
      await pool.query(
        `
          select competition_date
          from competition_trade_runs
          where state = 'unsettled'
            and close_at <= $1::timestamptz
          group by competition_date
          order by competition_date asc
          limit $2
        `,
        [closeAtIso, safeLimit]
      );
    return result.rows.map((row) => deriveCompetitionDate(row));
  } catch (error) {
    if (!isMissingColumnError(error, 'close_at')) {
      throw error;
    }
    const legacyResult: QueryResult<Pick<CompetitionTradeRunRow, 'competition_date'>> =
      await pool.query(
        `
          select competition_date
          from competition_trade_runs
          where state = 'unsettled'
            and (entry_sampled_at + interval '${TRADE_EXTEND_WINDOW_MINUTES} minutes') <= $1::timestamptz
          group by competition_date
          order by competition_date asc
          limit $2
        `,
        [closeAtIso, safeLimit]
      );
    return legacyResult.rows.map((row) => deriveCompetitionDate(row));
  }
}

export async function listOpenTradeRunsForAccount(
  accountId: string,
  limit: number = 100,
  client?: PoolClient
): Promise<CompetitionTradeRunRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  try {
    const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
      `
        select *
        from competition_trade_runs
        where account_id = $1
          and state = 'unsettled'
        order by close_at asc, created_at asc
        limit $2
      `,
      [accountId, safeLimit]
    );
    return result.rows.map(mapRow);
  } catch (error) {
    if (!isMissingColumnError(error, 'close_at')) {
      throw error;
    }
    const legacyResult: QueryResult<CompetitionTradeRunRow> = await pool.query(
      `
        select *,
          (entry_sampled_at + interval '${TRADE_EXTEND_WINDOW_MINUTES} minutes') as close_at,
          0::int as update_count
        from competition_trade_runs
        where account_id = $1
          and state = 'unsettled'
        order by entry_sampled_at asc, created_at asc
        limit $2
      `,
      [accountId, safeLimit]
    );
    return legacyResult.rows.map(mapRow);
  }
}

export interface UpdateTradeRunIfOpenInput {
  id: string;
  direction: CompetitionTradeDirection;
  riskLeverage: number;
  entryPriceUsd: number;
  entrySampledAt: string;
  nowIso: string;
  maxUpdates: number;
  oracleMeta?: Record<string, unknown>;
  client?: PoolClient;
}

export async function updateTradeRunIfOpen(
  input: UpdateTradeRunIfOpenInput
): Promise<CompetitionTradeRunRecord | null> {
  const pool = getPool(input.client);
  const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
    `
      update competition_trade_runs
      set
        direction = $2,
        risk_leverage = $3,
        entry_price_usd = $4,
        entry_sampled_at = $5,
        update_count = update_count + 1,
        oracle_meta = coalesce(oracle_meta, '{}'::jsonb) || $6::jsonb,
        updated_at = now()
      where id = $1
        and state = 'unsettled'
        and close_at > $7::timestamptz
        and update_count < $8
      returning *
    `,
    [
      input.id,
      input.direction,
      input.riskLeverage,
      input.entryPriceUsd,
      input.entrySampledAt,
      JSON.stringify(input.oracleMeta ?? {}),
      input.nowIso,
      Math.max(1, Math.floor(Number(input.maxUpdates) || 1)),
    ]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface ExtendTradeRunIfOpenInput {
  id: string;
  currentCloseAtIso: string;
  nextCloseAtIso: string;
  nowIso: string;
  oracleMeta?: Record<string, unknown>;
  client?: PoolClient;
}

export async function extendTradeRunIfOpen(
  input: ExtendTradeRunIfOpenInput
): Promise<CompetitionTradeRunRecord | null> {
  const pool = getPool(input.client);
  const result: QueryResult<CompetitionTradeRunRow> = await pool.query(
    `
      update competition_trade_runs
      set
        close_at = $2::timestamptz,
        oracle_meta = coalesce(oracle_meta, '{}'::jsonb) || $3::jsonb,
        updated_at = now()
      where id = $1
        and state = 'unsettled'
        and close_at <= ($4::timestamptz + interval '1 second')
        and close_at > $5::timestamptz
      returning *
    `,
    [
      input.id,
      input.nextCloseAtIso,
      JSON.stringify(input.oracleMeta ?? {}),
      input.currentCloseAtIso,
      input.nowIso,
    ]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function countUnsettledTradeRunsForDateAndDifficulty(
  competitionDate: string,
  difficultyId: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);
  const result = await pool.query(
    `
      select count(*)::int as count
      from competition_trade_runs
      where competition_date = $1
        and difficulty_id = $2
        and state = 'unsettled'
    `,
    [competitionDate, difficultyId]
  );
  return Number(result.rows[0]?.count ?? 0);
}
