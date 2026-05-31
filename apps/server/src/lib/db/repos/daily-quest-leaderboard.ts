import type { PoolClient, QueryResult } from 'pg';
import { getPgPool, runTransaction } from '../client';
import * as playerDailyRunBonusRepo from './player-daily-run-bonus';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface DailyQuestLeaderboardRow {
  id: string;
  date: string;
  difficulty_id: string;
  account_id: string;
  raw_score: string | number;
  time_multiplier: string | number;
  gotchi_bonus_multiplier: string | number;
  is_real_gotchi: boolean;
  final_score: string | number;
  run_id: string;
  completed_at: string;
  player_name: string | null;
  gotchi_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyQuestLeaderboardRecord {
  id: string;
  date: string;
  difficultyId: string;
  accountId: string;
  rawScore: number;
  timeMultiplier: number;
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
  finalScore: number;
  runId: string;
  completedAt: string;
  playerName: string | null;
  gotchiId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyQuestPrizeDistributionRow {
  id: string;
  competition_date: string;
  difficulty_id: string;
  account_id: string;
  leaderboard_entry_id: string | null;
  position: number;
  final_score: string | number;
  usdc_amount: string | number;
  ghst_amount: string | number;
  usdc_withdrawal_id: string | null;
  ghst_withdrawal_id: string | null;
  status: string;
  distributed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyQuestPrizeDistributionRecord {
  id: string;
  competitionDate: string;
  difficultyId: string;
  accountId: string;
  leaderboardEntryId: string | null;
  position: number;
  finalScore: number;
  usdcAmount: number;
  ghstAmount: number;
  usdcWithdrawalId: string | null;
  ghstWithdrawalId: string | null;
  status: 'pending' | 'distributed' | 'failed';
  distributedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mappers
// ──────────────────────────────────────────────────────────────────────────────

function mapLeaderboardRow(
  row: DailyQuestLeaderboardRow
): DailyQuestLeaderboardRecord {
  return {
    id: row.id,
    date: row.date,
    difficultyId: row.difficulty_id,
    accountId: row.account_id,
    rawScore: Number(row.raw_score),
    timeMultiplier: Number(row.time_multiplier),
    gotchiBonusMultiplier: Number(row.gotchi_bonus_multiplier),
    isRealGotchi: row.is_real_gotchi === true,
    finalScore: Number(row.final_score),
    runId: row.run_id,
    completedAt: row.completed_at,
    playerName: row.player_name,
    gotchiId: row.gotchi_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPrizeRow(
  row: DailyQuestPrizeDistributionRow
): DailyQuestPrizeDistributionRecord {
  return {
    id: row.id,
    competitionDate: row.competition_date,
    difficultyId: row.difficulty_id,
    accountId: row.account_id,
    leaderboardEntryId: row.leaderboard_entry_id,
    position: row.position,
    finalScore: Number(row.final_score),
    usdcAmount: Number(row.usdc_amount),
    ghstAmount: Number(row.ghst_amount),
    usdcWithdrawalId: row.usdc_withdrawal_id,
    ghstWithdrawalId: row.ghst_withdrawal_id,
    status: row.status as 'pending' | 'distributed' | 'failed',
    distributedAt: row.distributed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

// ──────────────────────────────────────────────────────────────────────────────
// Leaderboard CRUD
// ──────────────────────────────────────────────────────────────────────────────

export interface UpsertLeaderboardEntryInput {
  date: string; // YYYY-MM-DD
  difficultyId: string;
  accountId: string;
  rawScore: number;
  timeMultiplier: number;
  gotchiBonusMultiplier?: number;
  isRealGotchi?: boolean;
  runId: string;
  completedAt: string; // ISO timestamp
  playerName?: string | null;
  gotchiId?: string | null;
  client?: PoolClient;
}

/**
 * Insert or update a player's leaderboard entry.
 * Only updates if the new final score is higher than existing.
 */
export async function upsertLeaderboardEntry(
  input: UpsertLeaderboardEntryInput
): Promise<DailyQuestLeaderboardRecord> {
  const pool = getPool(input.client);
  const gotchiBonusMultiplier = Math.max(
    1,
    Number(input.gotchiBonusMultiplier) || 1
  );
  const isRealGotchi =
    (input.isRealGotchi === true || gotchiBonusMultiplier > 1) &&
    gotchiBonusMultiplier > 1;
  const finalScore = Math.round(
    input.rawScore * input.timeMultiplier * gotchiBonusMultiplier
  );

  const query = `
    insert into daily_quest_leaderboard (
      date,
      difficulty_id,
      account_id,
      raw_score,
      time_multiplier,
      gotchi_bonus_multiplier,
      is_real_gotchi,
      final_score,
      run_id,
      completed_at,
      player_name,
      gotchi_id
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
      $10,
      coalesce($11, (select username from players where id = $3)),
      $12
    )
    on conflict (date, difficulty_id, account_id) do update set
      raw_score = case when $8 > daily_quest_leaderboard.final_score then $4 else daily_quest_leaderboard.raw_score end,
      time_multiplier = case when $8 > daily_quest_leaderboard.final_score then $5 else daily_quest_leaderboard.time_multiplier end,
      gotchi_bonus_multiplier = case when $8 > daily_quest_leaderboard.final_score then $6 else daily_quest_leaderboard.gotchi_bonus_multiplier end,
      is_real_gotchi = case when $8 > daily_quest_leaderboard.final_score then $7 else daily_quest_leaderboard.is_real_gotchi end,
      final_score = case when $8 > daily_quest_leaderboard.final_score then $8 else daily_quest_leaderboard.final_score end,
      run_id = case when $8 > daily_quest_leaderboard.final_score then $9 else daily_quest_leaderboard.run_id end,
      completed_at = case when $8 > daily_quest_leaderboard.final_score then $10 else daily_quest_leaderboard.completed_at end,
      player_name = coalesce(
        $11,
        (select username from players where id = $3),
        daily_quest_leaderboard.player_name
      ),
      gotchi_id = coalesce($12, daily_quest_leaderboard.gotchi_id),
      updated_at = now()
    returning *
  `;

  const params = [
    input.date,
    input.difficultyId,
    input.accountId,
    input.rawScore,
    input.timeMultiplier,
    gotchiBonusMultiplier,
    isRealGotchi,
    finalScore,
    input.runId,
    input.completedAt,
    input.playerName ?? null,
    input.gotchiId ?? null,
  ];

  const result: QueryResult<DailyQuestLeaderboardRow> = await pool.query(
    query,
    params
  );
  return mapLeaderboardRow(result.rows[0]);
}

/**
 * Get a player's leaderboard entry for a specific date and difficulty.
 */
export async function getPlayerEntry(
  date: string,
  difficultyId: string,
  accountId: string,
  client?: PoolClient
): Promise<DailyQuestLeaderboardRecord | null> {
  const pool = getPool(client);
  const result: QueryResult<DailyQuestLeaderboardRow> = await pool.query(
    `select * from daily_quest_leaderboard where date = $1 and difficulty_id = $2 and account_id = $3`,
    [date, difficultyId, accountId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapLeaderboardRow(result.rows[0]);
}

/**
 * Get all entries for a player on a specific date (across all difficulties).
 */
export async function getPlayerEntriesForDate(
  date: string,
  accountId: string,
  client?: PoolClient
): Promise<DailyQuestLeaderboardRecord[]> {
  const pool = getPool(client);
  const result: QueryResult<DailyQuestLeaderboardRow> = await pool.query(
    `select * from daily_quest_leaderboard 
     where date = $1 and account_id = $2 
     order by difficulty_id`,
    [date, accountId]
  );
  return result.rows.map(mapLeaderboardRow);
}

/**
 * Get the top N entries for a specific date and difficulty, ordered by final score descending.
 */
export async function getTopEntries(
  date: string,
  difficultyId: string,
  limit: number = 10,
  client?: PoolClient
): Promise<DailyQuestLeaderboardRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

  const result: QueryResult<
    DailyQuestLeaderboardRow & { fallback_player_name: string | null }
  > = await pool.query(
    `select dql.*, p.username as fallback_player_name
     from daily_quest_leaderboard dql
     left join players p on p.id = dql.account_id
     where dql.date = $1 and dql.difficulty_id = $2 
     order by final_score desc, completed_at asc 
     limit $3`,
    [date, difficultyId, safeLimit]
  );
  return result.rows.map((row) => {
    const mapped = mapLeaderboardRow(row);
    return mapped.playerName
      ? mapped
      : { ...mapped, playerName: row.fallback_player_name ?? null };
  });
}

/**
 * Get the leaderboard with ranks for a specific date and difficulty.
 * Returns all entries with their rank position and wallet address.
 */
export async function getLeaderboardWithRanks(
  date: string,
  difficultyId: string,
  limit: number = 100,
  client?: PoolClient
): Promise<
  Array<
    DailyQuestLeaderboardRecord & { rank: number; walletAddress: string | null }
  >
> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));

  const result = await pool.query(
    `select dql.*, 
            p.wallet_address,
            p.username as fallback_player_name,
            row_number() over (order by dql.final_score desc, dql.completed_at asc) as rank
     from daily_quest_leaderboard dql
     left join players p on p.id = dql.account_id
     where dql.date = $1 and dql.difficulty_id = $2 
     order by dql.final_score desc, dql.completed_at asc 
     limit $3`,
    [date, difficultyId, safeLimit]
  );

  return result.rows.map(
    (
      row: DailyQuestLeaderboardRow & {
        rank: string | number;
        wallet_address: string | null;
        fallback_player_name: string | null;
      }
    ) => {
      const mapped = mapLeaderboardRow(row);
      return {
        ...mapped,
        playerName: mapped.playerName ?? row.fallback_player_name ?? null,
        rank: Number(row.rank),
        walletAddress: row.wallet_address ?? null,
      };
    }
  );
}

/**
 * Get a player's rank for a specific date and difficulty.
 */
export async function getPlayerRank(
  date: string,
  difficultyId: string,
  accountId: string,
  client?: PoolClient
): Promise<number | null> {
  const pool = getPool(client);

  const result = await pool.query(
    `with ranked as (
      select account_id, 
             row_number() over (order by final_score desc, completed_at asc) as rank
      from daily_quest_leaderboard 
      where date = $1 and difficulty_id = $2
    )
    select rank from ranked where account_id = $3`,
    [date, difficultyId, accountId]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return Number(result.rows[0].rank);
}

/**
 * Count total entries for a specific date and difficulty.
 */
export async function countEntries(
  date: string,
  difficultyId: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);
  const result = await pool.query(
    `select count(*) as count from daily_quest_leaderboard where date = $1 and difficulty_id = $2`,
    [date, difficultyId]
  );
  return Number(result.rows[0].count);
}

// ──────────────────────────────────────────────────────────────────────────────
// Prize Distribution
// ──────────────────────────────────────────────────────────────────────────────

export interface CreatePrizeDistributionInput {
  competitionDate: string;
  difficultyId: string;
  accountId: string;
  leaderboardEntryId?: string | null;
  position: number;
  finalScore: number;
  usdcAmount: number;
  ghstAmount: number;
  client?: PoolClient;
}

/**
 * Create a prize distribution record.
 */
export async function createPrizeDistribution(
  input: CreatePrizeDistributionInput
): Promise<DailyQuestPrizeDistributionRecord> {
  const pool = getPool(input.client);

  const query = `
    insert into daily_quest_prize_distributions (
      competition_date,
      difficulty_id,
      account_id,
      leaderboard_entry_id,
      position,
      final_score,
      usdc_amount,
      ghst_amount
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (competition_date, difficulty_id, position) do update set
      account_id = excluded.account_id,
      leaderboard_entry_id = excluded.leaderboard_entry_id,
      final_score = excluded.final_score,
      usdc_amount = excluded.usdc_amount,
      ghst_amount = excluded.ghst_amount,
      updated_at = now()
    returning *
  `;

  const params = [
    input.competitionDate,
    input.difficultyId,
    input.accountId,
    input.leaderboardEntryId ?? null,
    input.position,
    input.finalScore,
    input.usdcAmount,
    input.ghstAmount,
  ];

  const result: QueryResult<DailyQuestPrizeDistributionRow> = await pool.query(
    query,
    params
  );
  return mapPrizeRow(result.rows[0]);
}

export interface GetPrizeDistributionForUpdateInput {
  competitionDate: string;
  difficultyId: string;
  position: number;
  client: PoolClient;
}

/**
 * Lock and return a prize distribution row for update.
 * Must be called inside a transaction.
 */
export async function getPrizeDistributionForUpdate(
  input: GetPrizeDistributionForUpdateInput
): Promise<DailyQuestPrizeDistributionRecord | null> {
  const result: QueryResult<DailyQuestPrizeDistributionRow> = await input.client.query(
    `select * from daily_quest_prize_distributions
     where competition_date = $1 and difficulty_id = $2 and position = $3
     for update`,
    [input.competitionDate, input.difficultyId, input.position]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapPrizeRow(result.rows[0]);
}

/**
 * Mark a prize distribution as distributed and link withdrawal records.
 */
export async function markPrizeDistributed(
  prizeId: string,
  usdcWithdrawalId: string | null,
  ghstWithdrawalId: string | null,
  client?: PoolClient
): Promise<DailyQuestPrizeDistributionRecord | null> {
  const pool = getPool(client);

  const result: QueryResult<DailyQuestPrizeDistributionRow> = await pool.query(
    `update daily_quest_prize_distributions set
      status = 'distributed',
      usdc_withdrawal_id = $2,
      ghst_withdrawal_id = $3,
      distributed_at = now(),
      updated_at = now()
     where id = $1
     returning *`,
    [prizeId, usdcWithdrawalId, ghstWithdrawalId]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapPrizeRow(result.rows[0]);
}

/**
 * Mark a prize distribution as failed.
 */
export async function markPrizeFailed(
  prizeId: string,
  errorMessage: string,
  client?: PoolClient
): Promise<DailyQuestPrizeDistributionRecord | null> {
  const pool = getPool(client);

  const result: QueryResult<DailyQuestPrizeDistributionRow> = await pool.query(
    `update daily_quest_prize_distributions set
      status = 'failed',
      error_message = $2,
      updated_at = now()
     where id = $1
     returning *`,
    [prizeId, errorMessage]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapPrizeRow(result.rows[0]);
}

/**
 * Get all prize distributions for a specific date.
 */
export async function getPrizeDistributionsForDate(
  competitionDate: string,
  client?: PoolClient
): Promise<DailyQuestPrizeDistributionRecord[]> {
  const pool = getPool(client);

  const result: QueryResult<DailyQuestPrizeDistributionRow> = await pool.query(
    `select * from daily_quest_prize_distributions 
     where competition_date = $1 
     order by difficulty_id, position`,
    [competitionDate]
  );
  return result.rows.map(mapPrizeRow);
}

/**
 * Get pending prize distributions (not yet distributed).
 */
export async function getPendingPrizeDistributions(
  competitionDate: string,
  client?: PoolClient
): Promise<DailyQuestPrizeDistributionRecord[]> {
  const pool = getPool(client);

  const result: QueryResult<DailyQuestPrizeDistributionRow> = await pool.query(
    `select * from daily_quest_prize_distributions 
     where competition_date = $1 and status = 'pending'
     order by difficulty_id, position`,
    [competitionDate]
  );
  return result.rows.map(mapPrizeRow);
}

/**
 * Get a player's prize history.
 */
export async function getPlayerPrizeHistory(
  accountId: string,
  limit: number = 30,
  client?: PoolClient
): Promise<DailyQuestPrizeDistributionRecord[]> {
  const pool = getPool(client);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

  const result: QueryResult<DailyQuestPrizeDistributionRow> = await pool.query(
    `select * from daily_quest_prize_distributions 
     where account_id = $1 
     order by competition_date desc, difficulty_id, position
     limit $2`,
    [accountId, safeLimit]
  );
  return result.rows.map(mapPrizeRow);
}

/**
 * Check if prizes have already been distributed for a date.
 */
export async function hasDistributedPrizesForDate(
  competitionDate: string,
  client?: PoolClient
): Promise<boolean> {
  const pool = getPool(client);

  const result = await pool.query(
    `select 1 from daily_quest_prize_distributions 
     where competition_date = $1 
     limit 1`,
    [competitionDate]
  );
  return result.rows.length > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Player Attunement Tracking (for v1.1: 1 per tier per day)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Record that a player has used one of their daily runs.
 * This is called when a player joins a game with dailyQuestActive=true.
 * Players get a fixed number of runs per day (default 3) that can be used on any tier.
 * Returns the result including how many runs are remaining.
 * 
 * @param maxRunsPerDay - Maximum runs allowed per day (default 3)
 */
export async function recordAttunementUsage(
  date: string,
  difficultyId: string,
  accountId: string,
  gameId: string,
  maxRunsPerDay: number = 3,
  client?: PoolClient
): Promise<{ recorded: boolean; alreadyUsed: boolean; runsUsed: number; runsRemaining: number }> {
  const bonusRuns = await playerDailyRunBonusRepo.getBonusRuns({
    accountId,
    date,
    mode: 'competition',
    client,
  });
  const effectiveMaxRuns = Math.max(0, maxRunsPerDay + bonusRuns);

  const executeWithClient = async (txClient: PoolClient) => {
    const lockKey = `${date}:${accountId}`;
    await txClient.query(`select pg_advisory_xact_lock(hashtext($1))`, [lockKey]);

    const countResult = await txClient.query(
      `select count(*) as count from daily_quest_attunements 
       where date = $1 and account_id = $2`,
      [date, accountId]
    );
    const runsUsedBefore = Number(countResult.rows[0]?.count ?? 0);

    if (runsUsedBefore >= effectiveMaxRuns) {
      return {
        recorded: false,
        alreadyUsed: true,
        runsUsed: runsUsedBefore,
        runsRemaining: 0,
      };
    }

    await txClient.query(
      `insert into daily_quest_attunements (date, difficulty_id, account_id, game_id)
       values ($1, $2, $3, $4)`,
      [date, difficultyId, accountId, gameId]
    );

    const runsUsed = runsUsedBefore + 1;
    return {
      recorded: true,
      alreadyUsed: false,
      runsUsed,
      runsRemaining: Math.max(0, effectiveMaxRuns - runsUsed),
    };
  };

  try {
    if (client) {
      return await executeWithClient(client);
    }
    return await runTransaction(executeWithClient);
  } catch (error) {
    console.error('[recordAttunementUsage] Failed to record attunement usage', {
      date,
      difficultyId,
      accountId,
      gameId,
      error,
    });
    return { recorded: false, alreadyUsed: false, runsUsed: 0, runsRemaining: 0 };
  }
}

/**
 * Check if a player has already used their attunement for a specific tier today.
 * @deprecated Use getAttunementCountForDay() instead - runs are now global, not per-tier
 */
export async function hasUsedAttunementForTier(
  date: string,
  difficultyId: string,
  accountId: string,
  client?: PoolClient
): Promise<boolean> {
  const pool = getPool(client);

  // Check if there's an attunement record for this date/tier/player
  const result = await pool.query(
    `select 1 from daily_quest_attunements 
     where date = $1 and difficulty_id = $2 and account_id = $3 
     limit 1`,
    [date, difficultyId, accountId]
  );
  return result.rows.length > 0;
}

/**
 * Get the total number of daily quest runs a player has used today (across all tiers).
 * Players get a fixed number of runs per day that can be used on any difficulty.
 */
export async function getAttunementCountForDay(
  date: string,
  accountId: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);

  const result = await pool.query(
    `select count(*) as count from daily_quest_attunements 
     where date = $1 and account_id = $2`,
    [date, accountId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Check if a player has remaining daily quest runs for today.
 * @param maxRunsPerDay - Maximum runs allowed per day (default 3)
 */
export async function hasRemainingDailyRuns(
  date: string,
  accountId: string,
  maxRunsPerDay: number = 3,
  client?: PoolClient
): Promise<{ hasRemaining: boolean; used: number; remaining: number }> {
  const [used, bonusRuns] = await Promise.all([
    getAttunementCountForDay(date, accountId, client),
    playerDailyRunBonusRepo.getBonusRuns({
      accountId,
      date,
      mode: 'competition',
      client,
    }),
  ]);
  const effectiveMaxRuns = Math.max(0, maxRunsPerDay + bonusRuns);
  const remaining = Math.max(0, effectiveMaxRuns - used);
  return {
    hasRemaining: remaining > 0,
    used,
    remaining,
  };
}

/**
 * Get player's daily quest unlock status from players table.
 */
export async function getPlayerDailyQuestUnlocks(
  accountId: string,
  client?: PoolClient
): Promise<{
  normal: boolean;
  nightmare: boolean;
  hell: boolean;
  lickTongueCount: number;
} | null> {
  const pool = getPool(client);

  const result = await pool.query(
    `select 
      daily_quest_unlocked_normal,
      daily_quest_unlocked_nightmare,
      daily_quest_unlocked_hell,
      coalesce(lick_tongue_count, 0) as lick_tongue_count
     from players 
     where id = $1`,
    [accountId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    normal: row.daily_quest_unlocked_normal ?? false,
    nightmare: row.daily_quest_unlocked_nightmare ?? false,
    hell: row.daily_quest_unlocked_hell ?? false,
    lickTongueCount: Number(row.lick_tongue_count),
  };
}
