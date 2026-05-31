/**
 * Daily Quest Competition API Routes
 *
 * Endpoints for the competitive daily quest leaderboard system.
 */

import type { Application, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import {
  competitionTradeRunsRepo,
  dailyQuestLeaderboardRepo,
  inventoryEventsRepo,
  inventoryRepo,
  runTransaction,
} from '../lib/db';
import {
  getDailyQuestCompetitionConfig,
  getCompetitionDate,
  getMultiplierStatus,
  getAllPositionPrizes,
  getDailyBudget,
  getTierPrizePool,
  COMPETITION_TIERS,
  type CompetitionTier,
} from '../lib/daily-quest-competition';
import { getPlayerCompetitionStatus } from '../rooms/DailyQuestSystem';
import { runPrizeDistributionJob } from '../jobs/distribute-daily-quest-prizes';
import { runSettleCompetitionTradesForAccountFallback } from '../jobs/settle-competition-trades';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { requireAdminSession } from './admin-auth';
import { getSpotUsd, sampleTwapUsd } from '../lib/price-oracle';
import {
  computeTradeSettlement,
  getTradeExtendedCloseAtIso,
  isTradeRunExtendable,
  isTradeRunCloseable,
  isTradingGameEnabled,
  TRADE_TOKENS,
  type TradeToken,
  TRADE_CLOSE_FEE_GOLD,
  TRADE_EXTEND_FEE_GOLD,
  TRADE_EXTEND_WINDOW_MINUTES,
  TRADE_MAX_UPDATES,
} from '../lib/trading-game';
import type {
  CompetitionTradeRunRecord,
} from '../lib/db/repos/competition-trade-runs';

const TRADE_FEE_ITEM_TYPE = 'coin';
const TRADE_FEE_ITEM_NAME = 'Gold';

type TradeFeeReason =
  | 'trade_close_fee'
  | 'trade_extend_fee';

async function getPlayerId(req: Request): Promise<string | null> {
  const resolved = await resolveAuthPrincipal(req);
  return resolved?.playerId ?? null;
}

function getPgErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : '';
}

function isMissingTradeRunsTableError(error: unknown): boolean {
  const code = getPgErrorCode(error);
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  return code === '42P01' && message.includes('competition_trade_runs');
}

function getOpenTradeRunsErrorResponse(error: unknown): {
  status: number;
  message: string;
} {
  if (isMissingTradeRunsTableError(error)) {
    return {
      status: 503,
      message:
        'Open runs unavailable: trade tables are missing. Run pnpm db:migrate and restart the server.',
    };
  }
  return {
    status: 500,
    message: 'Failed to fetch open trade runs',
  };
}

function parseTradeTokenQuery(value: unknown): TradeToken | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if ((TRADE_TOKENS as readonly string[]).includes(normalized)) {
    return normalized as TradeToken;
  }
  return null;
}

function resolveTradeRunGotchiBonus(oracleMeta: Record<string, unknown>): {
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
} {
  const parsedMultiplier = Number(oracleMeta.gotchiBonusMultiplier);
  const gotchiBonusMultiplier =
    Number.isFinite(parsedMultiplier) && parsedMultiplier > 1
      ? parsedMultiplier
      : 1;
  const isRealGotchi =
    oracleMeta.isRealGotchi === true && gotchiBonusMultiplier > 1;

  return {
    gotchiBonusMultiplier,
    isRealGotchi,
  };
}

function parseIsoMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSecondsRemaining(closeAtIso: string, nowMs: number): number {
  const closeAtMs = parseIsoMs(closeAtIso);
  if (!closeAtMs) {
    return 0;
  }
  return Math.max(0, Math.floor((closeAtMs - nowMs) / 1000));
}

function computeTradeRunEstimate(
  run: Pick<
    CompetitionTradeRunRecord,
    | 'baseScore'
    | 'timeMultiplier'
    | 'direction'
    | 'riskLeverage'
    | 'entryPriceUsd'
    | 'oracleMeta'
  >,
  livePriceUsd: number
): {
  estimatedTradeMultiplier: number;
  estimatedFinalScore: number;
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
} {
  const settlement = computeTradeSettlement({
    baseScore: run.baseScore,
    timeMultiplier: run.timeMultiplier,
    direction: run.direction,
    riskLeverage: run.riskLeverage,
    entryPriceUsd: run.entryPriceUsd,
    exitPriceUsd: livePriceUsd,
  });
  const { gotchiBonusMultiplier, isRealGotchi } = resolveTradeRunGotchiBonus(
    run.oracleMeta
  );
  return {
    estimatedTradeMultiplier: settlement.tradeMultiplier,
    estimatedFinalScore: Math.max(
      0,
      Math.round(settlement.finalScore * gotchiBonusMultiplier)
    ),
    gotchiBonusMultiplier,
    isRealGotchi,
  };
}

function resolveLivePriceUsd(
  livePriceCandidate: unknown,
  entryPriceUsd: number
): number {
  const live = Number(livePriceCandidate);
  if (Number.isFinite(live) && live > 0) {
    return live;
  }
  return entryPriceUsd;
}

function computeFallbackTradeRunEstimate(
  run: Pick<
    CompetitionTradeRunRecord,
    | 'baseScore'
    | 'timeMultiplier'
    | 'oracleMeta'
  >
): {
  estimatedTradeMultiplier: number;
  estimatedFinalScore: number;
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
} {
  const { gotchiBonusMultiplier, isRealGotchi } = resolveTradeRunGotchiBonus(
    run.oracleMeta
  );
  const baseScore = Math.max(0, Math.floor(Number(run.baseScore) || 0));
  const timeMultiplier = Number.isFinite(Number(run.timeMultiplier))
    ? Number(run.timeMultiplier)
    : 1;
  return {
    estimatedTradeMultiplier: 1,
    estimatedFinalScore: Math.max(
      0,
      Math.round(baseScore * timeMultiplier * gotchiBonusMultiplier)
    ),
    gotchiBonusMultiplier,
    isRealGotchi,
  };
}

function hasInsufficientGold(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /insufficient quantity/i.test(message);
}

async function chargeTradeFee(options: {
  playerId: string;
  amount: number;
  reason: TradeFeeReason;
  runId: string;
  client: PoolClient;
}): Promise<{ newBalance: number }> {
  const decremented = await inventoryRepo.decrementInventoryItem(
    options.playerId,
    TRADE_FEE_ITEM_TYPE,
    TRADE_FEE_ITEM_NAME,
    options.amount,
    options.client
  );
  if (!decremented) {
    throw new Error('Insufficient quantity to decrement inventory item');
  }

  await inventoryEventsRepo.logInventoryEvent(
    {
      playerId: options.playerId,
      itemType: TRADE_FEE_ITEM_TYPE,
      itemName: TRADE_FEE_ITEM_NAME,
      delta: -options.amount,
      reason: options.reason,
      metadata: {
        source: 'daily_quest_trade',
        fee: {
          currency: TRADE_FEE_ITEM_NAME,
          amount: options.amount,
        },
        trade: {
          runId: options.runId,
        },
        itemization: [
          {
            itemType: TRADE_FEE_ITEM_TYPE,
            itemName: TRADE_FEE_ITEM_NAME,
            delta: -options.amount,
          },
        ],
      },
      inventoryItemId: decremented.record?.id ?? null,
    },
    options.client
  );

  return {
    newBalance: decremented.quantityAfter,
  };
}

async function getUnsettledLiveEstimates(
  date: string,
  tier: CompetitionTier,
  limit: number = 200
) {
  if (!isTradingGameEnabled()) {
    return [];
  }

  const runs =
    await competitionTradeRunsRepo.listUnsettledTradeRunsForDateAndDifficulty(
      date,
      tier,
      limit
    );
  if (runs.length === 0) {
    return [];
  }

  const quotesByToken = new Map<
    string,
    {
      priceUsd: number;
      stale: boolean;
    }
  >();

  const uniqueTokens = Array.from(new Set(runs.map((run) => run.token)));
  await Promise.all(
    uniqueTokens.map(async (token) => {
      try {
        const quote = await getSpotUsd(token);
        quotesByToken.set(token, {
          priceUsd: quote.priceUsd,
          stale: quote.stale,
        });
      } catch (error) {
        console.warn('[DailyQuestLeaderboard] Spot quote failed for live estimate', {
          date,
          tier,
          token,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  const nowMs = Date.now();
  return runs
    .map((run) => {
      const quote = quotesByToken.get(run.token);
      const livePriceUsd = resolveLivePriceUsd(quote?.priceUsd, run.entryPriceUsd);
      let estimate;
      try {
        estimate = computeTradeRunEstimate(run, livePriceUsd);
      } catch (error) {
        console.warn('[DailyQuestLeaderboard] Falling back to safe trade estimate', {
          date,
          tier,
          runId: run.runId,
          token: run.token,
          error: error instanceof Error ? error.message : String(error),
        });
        estimate = computeFallbackTradeRunEstimate(run);
      }
      return {
        status: 'unsettled' as const,
        runId: run.runId,
        accountId: run.accountId,
        playerName: run.playerName,
        token: run.token,
        direction: run.direction,
        riskLeverage: run.riskLeverage,
        baseScore: run.baseScore,
        timeMultiplier: run.timeMultiplier,
        gotchiBonusMultiplier: estimate.gotchiBonusMultiplier,
        isRealGotchi: estimate.isRealGotchi,
        entryPriceUsd: run.entryPriceUsd,
        livePriceUsd,
        estimatedTradeMultiplier: estimate.estimatedTradeMultiplier,
        estimatedFinalScore: estimate.estimatedFinalScore,
        closesAtUtc: run.closeAt,
        secondsRemaining: getSecondsRemaining(run.closeAt, nowMs),
        priceStale: quote?.stale ?? true,
      };
    })
    .sort((a, b) => b.estimatedFinalScore - a.estimatedFinalScore);
}

export function registerDailyQuestCompetitionRoutes(app: Application) {
  // ────────────────────────────────────────────────────────────────────────────
  // Public Routes
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/daily-quest/config
   * Get public configuration for the daily quest competition.
   */
  app.get('/api/daily-quest/config', (_req: Request, res: Response) => {
    const config = getDailyQuestCompetitionConfig();
    const multiplierStatus = getMultiplierStatus();
    const dailyBudget = getDailyBudget();

    res.json({
      enabled: config.enabled,
      resetTimeUtcHour: config.resetTimeUtcHour,
      tierUnlockThresholds: config.tierUnlockThresholds,
      timeMultipliers: config.timeMultipliers,
      dailyBudget,
      tierDistribution: config.tierDistribution,
      topPositions: config.topPositions,
      currentMultiplier: multiplierStatus.currentMultiplier,
      hoursSinceReset: multiplierStatus.hoursSinceReset,
      minutesUntilNextTier: multiplierStatus.minutesUntilNextTier,
      date: getCompetitionDate(),
    });
  });

  /**
   * GET /api/daily-quest/leaderboards
   * Get summary of all tier leaderboards.
   * 
   * NOTE: This route must be defined BEFORE /api/daily-quest/leaderboard/:tier
   * to prevent Express from matching "leaderboards" as a tier parameter.
   */
  app.get('/api/daily-quest/leaderboards', async (req: Request, res: Response) => {
    const date = typeof req.query.date === 'string'
      ? req.query.date
      : getCompetitionDate();

    try {
      const summaries: Record<string, unknown> = {};

      for (const tier of COMPETITION_TIERS) {
        const entries = await dailyQuestLeaderboardRepo.getTopEntries(date, tier, 5);
        const totalEntries = await dailyQuestLeaderboardRepo.countEntries(date, tier);
        const unsettledLiveEstimates = await getUnsettledLiveEstimates(
          date,
          tier,
          50
        );
        const prizePool = getTierPrizePool(tier);
        const settledRanked = entries.map((e, i) => ({
          status: 'settled' as const,
          rank: i + 1,
          playerName: e.playerName,
          gotchiId: e.gotchiId,
          finalScore: e.finalScore,
          rawScore: e.rawScore,
          timeMultiplier: e.timeMultiplier,
          gotchiBonusMultiplier: e.gotchiBonusMultiplier,
          isRealGotchi: e.isRealGotchi,
          accountId: e.accountId,
          runId: e.runId,
          completedAt: e.completedAt,
        }));

        (summaries as any)[tier] = {
          totalEntries,
          unsettledCount: unsettledLiveEstimates.length,
          topEntries: settledRanked,
          settled_ranked: settledRanked,
          unsettled_live_estimates: unsettledLiveEstimates,
          prizePool,
        };
      }

      const multiplierStatus = getMultiplierStatus();

      res.json({
        date,
        multiplierStatus: {
          currentMultiplier: multiplierStatus.currentMultiplier,
          hoursSinceReset: multiplierStatus.hoursSinceReset,
          minutesUntilNextTier: multiplierStatus.minutesUntilNextTier,
          nextTierMultiplier: multiplierStatus.nextTierMultiplier,
        },
        tiers: summaries,
      });
    } catch (error) {
      console.error('Failed to fetch leaderboard summaries', { date, error });
      res.status(500).json({ error: 'Failed to fetch leaderboards' });
    }
  });

  /**
   * GET /api/daily-quest/leaderboard/:tier
   * Get the leaderboard for a specific tier.
   */
  app.get(
    '/api/daily-quest/leaderboard/:tier',
    async (req: Request, res: Response) => {
      const tier = req.params.tier?.toLowerCase() as CompetitionTier;

      if (!COMPETITION_TIERS.includes(tier)) {
        res.status(400).json({ error: 'Invalid tier' });
        return;
      }

      const date = typeof req.query.date === 'string'
        ? req.query.date
        : getCompetitionDate();

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

      try {
        const entries = await dailyQuestLeaderboardRepo.getLeaderboardWithRanks(
          date,
          tier,
          limit
        );
        const unsettledLiveEstimates = await getUnsettledLiveEstimates(
          date,
          tier,
          Math.max(limit, 100)
        );

        const totalEntries = await dailyQuestLeaderboardRepo.countEntries(date, tier);
        const prizePool = getTierPrizePool(tier);
        const prizes = getAllPositionPrizes(tier);
        const settledRanked = entries.map((e) => ({
          status: 'settled' as const,
          rank: e.rank,
          playerName: e.playerName,
          gotchiId: e.gotchiId,
          rawScore: e.rawScore,
          timeMultiplier: e.timeMultiplier,
          gotchiBonusMultiplier: e.gotchiBonusMultiplier,
          isRealGotchi: e.isRealGotchi,
          finalScore: e.finalScore,
          completedAt: e.completedAt,
          accountId: e.accountId, // For highlighting current user
          walletAddress: e.walletAddress, // Player's wallet address
        }));

        res.json({
          tier,
          date,
          entries: settledRanked,
          settled_ranked: settledRanked,
          unsettled_live_estimates: unsettledLiveEstimates,
          totalEntries,
          unsettledCount: unsettledLiveEstimates.length,
          prizePool,
          prizes: prizes.slice(0, 10), // Top 10 prize info
        });
      } catch (error) {
        console.error('Failed to fetch leaderboard', { tier, date, error });
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    }
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Authenticated Routes
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/daily-quest/status
   * Get the current player's daily quest competition status.
   */
  app.get('/api/daily-quest/status', async (req: Request, res: Response) => {
    const playerId = await getPlayerId(req);

    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const status = await getPlayerCompetitionStatus(playerId);
      res.json(status);
    } catch (error) {
      console.error('Failed to get player competition status', { playerId, error });
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  /**
   * GET /api/daily-quest/trade/market
   * Returns market stats for the selected trade token.
   */
  app.get('/api/daily-quest/trade/market', async (req: Request, res: Response) => {
    if (!isTradingGameEnabled()) {
      res.status(404).json({ error: 'Prediction settlement disabled' });
      return;
    }

    const playerId = await getPlayerId(req);
    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = parseTradeTokenQuery(req.query.token);
    if (!token) {
      res
        .status(400)
        .json({ error: `token must be one of ${TRADE_TOKENS.join(', ')}` });
      return;
    }

    const nowMs = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    const oneDayMs = 24 * oneHourMs;

    try {
      const spotQuote = await getSpotUsd(token);

      const [quote1h, quote24h] = await Promise.all([
        sampleTwapUsd(token, 60_000, nowMs - oneHourMs).catch((error) => {
          console.warn('[DailyQuestTrade] Failed to fetch 1h baseline quote', {
            playerId,
            token,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }),
        sampleTwapUsd(token, 60_000, nowMs - oneDayMs).catch((error) => {
          console.warn('[DailyQuestTrade] Failed to fetch 24h baseline quote', {
            playerId,
            token,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }),
      ]);

      const livePriceUsd = resolveLivePriceUsd(spotQuote.priceUsd, 0);
      const baseline1h = Number(quote1h?.priceUsd);
      const baseline24h = Number(quote24h?.priceUsd);

      const change1hPct =
        Number.isFinite(baseline1h) && baseline1h > 0
          ? livePriceUsd / baseline1h - 1
          : null;
      const change24hPct =
        Number.isFinite(baseline24h) && baseline24h > 0
          ? livePriceUsd / baseline24h - 1
          : null;

      res.json({
        token,
        priceUsd: livePriceUsd,
        change1hPct,
        change24hPct,
        stale: spotQuote.stale,
        sampledAtMs: spotQuote.sampledAtMs,
      });
    } catch (error) {
      console.error('Failed to fetch trade market stats', {
        playerId,
        token,
        error: error instanceof Error ? error.message : String(error),
        errorCode: getPgErrorCode(error) || null,
        rawError: error,
      });
      res.status(500).json({ error: 'Failed to fetch trade market stats' });
    }
  });

  /**
   * GET /api/daily-quest/trade/open
   * Returns the current player's open/unsettled trade runs with live estimates.
   */
  app.get('/api/daily-quest/trade/open', async (req: Request, res: Response) => {
    if (!isTradingGameEnabled()) {
      res.status(404).json({ error: 'Prediction settlement disabled' });
      return;
    }

    const playerId = await getPlayerId(req);
    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));

    try {
      try {
        await runSettleCompetitionTradesForAccountFallback({
          accountId: playerId,
          nowMs: Date.now(),
          maxDueRuns: 5,
          minIntervalMs: 30_000,
        });
      } catch (fallbackError) {
        console.warn('[DailyQuestTrade] Open-runs fallback settlement failed', {
          playerId,
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
        });
      }

      const runs = await competitionTradeRunsRepo.listOpenTradeRunsForAccount(
        playerId,
        limit
      );
      if (runs.length === 0) {
        res.json({ runs: [], count: 0 });
        return;
      }

      const quotesByToken = new Map<
        string,
        {
          priceUsd: number;
          stale: boolean;
        }
      >();
      const uniqueTokens = Array.from(new Set(runs.map((run) => run.token)));
      await Promise.all(
        uniqueTokens.map(async (token) => {
          try {
            const quote = await getSpotUsd(token);
            quotesByToken.set(token, {
              priceUsd: quote.priceUsd,
              stale: quote.stale,
            });
          } catch (error) {
            console.warn('[DailyQuestTrade] Spot quote failed for open runs', {
              playerId,
              token,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );

      const nowMs = Date.now();
      const openRuns = runs.map((run) => {
        const quote = quotesByToken.get(run.token);
        const livePriceUsd = resolveLivePriceUsd(quote?.priceUsd, run.entryPriceUsd);
        let estimate;
        try {
          estimate = computeTradeRunEstimate(run, livePriceUsd);
        } catch (error) {
          console.warn('[DailyQuestTrade] Falling back to safe open run estimate', {
            playerId,
            runId: run.runId,
            token: run.token,
            error: error instanceof Error ? error.message : String(error),
          });
          estimate = computeFallbackTradeRunEstimate(run);
        }

        return {
          runId: run.runId,
          competitionDate: run.competitionDate,
          difficultyId: run.difficultyId,
          token: run.token,
          direction: run.direction,
          riskLeverage: run.riskLeverage,
          baseScore: run.baseScore,
          timeMultiplier: run.timeMultiplier,
          gotchiBonusMultiplier: estimate.gotchiBonusMultiplier,
          isRealGotchi: estimate.isRealGotchi,
          entryPriceUsd: run.entryPriceUsd,
          livePriceUsd,
          estimatedTradeMultiplier: estimate.estimatedTradeMultiplier,
          estimatedFinalScore: estimate.estimatedFinalScore,
          closesAtUtc: run.closeAt,
          secondsRemaining: getSecondsRemaining(run.closeAt, nowMs),
          updateCount: run.updateCount,
          maxUpdates: TRADE_MAX_UPDATES,
          canUpdate: false,
          canExtend: isTradeRunExtendable({
            state: run.state,
            closeAtIso: run.closeAt,
            competitionDate: run.competitionDate,
            nowMs,
          }),
          canClose: isTradeRunCloseable({ state: run.state }),
        };
      });

      res.json({
        runs: openRuns,
        count: openRuns.length,
      });
    } catch (error) {
      const errorCode = getPgErrorCode(error);
      const responsePayload = getOpenTradeRunsErrorResponse(error);
      console.error('Failed to fetch open trade runs', {
        playerId,
        errorCode: errorCode || null,
        errorMessage: error instanceof Error ? error.message : String(error),
        error,
      });
      res.status(responsePayload.status).json({
        error: responsePayload.message,
        ...(errorCode ? { code: errorCode } : {}),
      });
    }
  });

  /**
   * POST /api/daily-quest/trade/update
   * Trade updates are disabled after run completion.
   */
  app.post('/api/daily-quest/trade/update', async (req: Request, res: Response) => {
    if (!isTradingGameEnabled()) {
      res.status(404).json({ error: 'Prediction settlement disabled' });
      return;
    }

    const playerId = await getPlayerId(req);
    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const runId = typeof req.body?.runId === 'string' ? req.body.runId.trim() : '';
    if (!runId) {
      res.status(400).json({ error: 'runId is required' });
      return;
    }

    try {
      const existing = await competitionTradeRunsRepo.getTradeRunByRunIdAndAccount(
        runId,
        playerId
      );
      if (!existing) {
        res.status(404).json({ error: 'Trade run not found' });
        return;
      }
      res.status(409).json({
        error: 'Trade run updates are disabled after run completion',
        closesAtUtc: existing.closeAt,
        canUpdate: false,
      });
    } catch (error) {
      console.error('Failed to update trade run', {
        playerId,
        runId,
        error,
      });
      res.status(500).json({ error: 'Failed to update trade run' });
    }
  });

  /**
   * POST /api/daily-quest/trade/extend
   * Paid extension of the trade close window (+15 minutes per purchase).
   */
  app.post('/api/daily-quest/trade/extend', async (req: Request, res: Response) => {
    if (!isTradingGameEnabled()) {
      res.status(404).json({ error: 'Prediction settlement disabled' });
      return;
    }

    const playerId = await getPlayerId(req);
    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const runId = typeof req.body?.runId === 'string' ? req.body.runId.trim() : '';
    if (!runId) {
      res.status(400).json({ error: 'runId is required' });
      return;
    }

    try {
      const existing = await competitionTradeRunsRepo.getTradeRunByRunIdAndAccount(
        runId,
        playerId
      );
      if (!existing) {
        res.status(404).json({ error: 'Trade run not found' });
        return;
      }

      const nowMs = Date.now();
      if (
        !isTradeRunExtendable({
          state: existing.state,
          closeAtIso: existing.closeAt,
          competitionDate: existing.competitionDate,
          nowMs,
        })
      ) {
        res.status(409).json({
          error: 'Trade run can no longer be extended',
          closesAtUtc: existing.closeAt,
          extendMinutes: TRADE_EXTEND_WINDOW_MINUTES,
        });
        return;
      }

      const nowIso = new Date(nowMs).toISOString();
      const nextCloseAtIso = getTradeExtendedCloseAtIso({
        closeAtIso: existing.closeAt,
      });

      const extendResult = await runTransaction(async (client) => {
        const extended = await competitionTradeRunsRepo.extendTradeRunIfOpen({
          id: existing.id,
          currentCloseAtIso: existing.closeAt,
          nextCloseAtIso,
          nowIso,
          oracleMeta: {
            kind: 'extend_close_window',
            extendedAt: nowIso,
            extendMinutes: TRADE_EXTEND_WINDOW_MINUTES,
          },
          client,
        });

        if (!extended) {
          const latest = await competitionTradeRunsRepo.getTradeRunById(
            existing.id,
            client
          );
          return {
            extended: false,
            tradeRun: latest,
            fee: null as null | { newBalance: number },
          };
        }

        const fee = await chargeTradeFee({
          playerId,
          amount: TRADE_EXTEND_FEE_GOLD,
          reason: 'trade_extend_fee',
          runId,
          client,
        });

        return {
          extended: true,
          tradeRun: extended,
          fee,
        };
      });

      if (
        !extendResult.extended ||
        !extendResult.tradeRun ||
        extendResult.tradeRun.state !== 'unsettled'
      ) {
        res.status(409).json({
          error: 'Trade run can no longer be extended',
          tradeRun: extendResult.tradeRun,
          closesAtUtc: extendResult.tradeRun?.closeAt ?? existing.closeAt,
          extendMinutes: TRADE_EXTEND_WINDOW_MINUTES,
        });
        return;
      }

      let livePriceUsd = extendResult.tradeRun.entryPriceUsd;
      let priceStale = true;
      try {
        const quote = await getSpotUsd(extendResult.tradeRun.token);
        livePriceUsd = quote.priceUsd;
        priceStale = quote.stale;
      } catch (error) {
        console.warn('[DailyQuestTrade] Spot quote failed after extend', {
          playerId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const estimate = computeTradeRunEstimate(extendResult.tradeRun, livePriceUsd);
      const nowMsAfter = Date.now();

      res.json({
        ok: true,
        tradeRun: extendResult.tradeRun,
        estimate: {
          livePriceUsd,
          priceStale,
          estimatedTradeMultiplier: estimate.estimatedTradeMultiplier,
          estimatedFinalScore: estimate.estimatedFinalScore,
          closesAtUtc: extendResult.tradeRun.closeAt,
          secondsRemaining: getSecondsRemaining(
            extendResult.tradeRun.closeAt,
            nowMsAfter
          ),
          canUpdate: false,
          canExtend: isTradeRunExtendable({
            state: extendResult.tradeRun.state,
            closeAtIso: extendResult.tradeRun.closeAt,
            competitionDate: extendResult.tradeRun.competitionDate,
            nowMs: nowMsAfter,
          }),
          canClose: isTradeRunCloseable({ state: extendResult.tradeRun.state }),
        },
        fee: {
          currency: TRADE_FEE_ITEM_NAME,
          amount: TRADE_EXTEND_FEE_GOLD,
          newBalance: extendResult.fee?.newBalance ?? null,
        },
      });
    } catch (error) {
      if (hasInsufficientGold(error)) {
        res.status(409).json({
          error: 'Insufficient Gold',
          fee: {
            currency: TRADE_FEE_ITEM_NAME,
            amount: TRADE_EXTEND_FEE_GOLD,
          },
        });
        return;
      }
      console.error('Failed to extend trade run', {
        playerId,
        runId,
        error,
      });
      res.status(500).json({ error: 'Failed to extend trade run' });
    }
  });

  const closeTradeRunHandler = async (req: Request, res: Response) => {
    if (!isTradingGameEnabled()) {
      res.status(404).json({ error: 'Prediction settlement disabled' });
      return;
    }

    const playerId = await getPlayerId(req);
    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const runId = typeof req.body?.runId === 'string' ? req.body.runId.trim() : '';
    if (!runId) {
      res.status(400).json({ error: 'runId is required' });
      return;
    }

    try {
      const tradeRun = await competitionTradeRunsRepo.getTradeRunByRunIdAndAccount(
        runId,
        playerId
      );
      if (!tradeRun) {
        res.status(404).json({ error: 'Trade run not found' });
        return;
      }

      if (!isTradeRunCloseable({ state: tradeRun.state })) {
        res.json({
          ok: true,
          alreadySettled: true,
          tradeRun,
          leaderboardEntry: null,
          fee: null,
        });
        return;
      }

      const nowMs = Date.now();
      const closeAtMs = parseIsoMs(tradeRun.closeAt);
      const settleAtMs = closeAtMs > 0 ? Math.min(nowMs, closeAtMs) : nowMs;
      const settleAtIso = new Date(settleAtMs).toISOString();
      const settleQuote = await sampleTwapUsd(tradeRun.token, 60_000, settleAtMs);
      const settlement = computeTradeSettlement({
        baseScore: tradeRun.baseScore,
        timeMultiplier: tradeRun.timeMultiplier,
        direction: tradeRun.direction,
        riskLeverage: tradeRun.riskLeverage,
        entryPriceUsd: tradeRun.entryPriceUsd,
        exitPriceUsd: settleQuote.priceUsd,
      });
      const { gotchiBonusMultiplier, isRealGotchi } = resolveTradeRunGotchiBonus(
        tradeRun.oracleMeta
      );

      const result = await runTransaction(async (client) => {
        const settledRun = await competitionTradeRunsRepo.settleTradeRunIfUnsettled(
          {
            id: tradeRun.id,
            state: 'settled_manual',
            settleReason: 'manual',
            settlePriceUsd: settleQuote.priceUsd,
            settledAt: settleAtIso,
            tradeMultiplier: settlement.tradeMultiplier,
            finalScore: settlement.finalScore,
            oracleMeta: {
              ...settleQuote.oracleMeta,
              stale: settleQuote.stale,
              settleAt: settleAtIso,
              kind:
                settleAtMs < nowMs
                  ? 'expired_close_twap_60s'
                  : 'manual_close_twap_60s',
            },
            client,
          }
        );

        if (!settledRun) {
          const existing = await competitionTradeRunsRepo.getTradeRunById(
            tradeRun.id,
            client
          );
          return {
            alreadySettled: true,
            tradeRun: existing,
            leaderboardEntry: null,
            fee: null as null | { newBalance: number },
          };
        }

        const fee = await chargeTradeFee({
          playerId,
          amount: TRADE_CLOSE_FEE_GOLD,
          reason: 'trade_close_fee',
          runId,
          client,
        });

        const leaderboardEntry = await dailyQuestLeaderboardRepo.upsertLeaderboardEntry(
          {
            date: tradeRun.competitionDate,
            difficultyId: tradeRun.difficultyId,
            accountId: tradeRun.accountId,
            rawScore: settlement.rawScore,
            timeMultiplier: tradeRun.timeMultiplier,
            gotchiBonusMultiplier,
            isRealGotchi,
            runId: tradeRun.runId,
            completedAt: settleAtIso,
            client,
          }
        );

        return {
          alreadySettled: false,
          tradeRun: settledRun,
          leaderboardEntry,
          fee,
        };
      });

      res.json({
        ok: true,
        alreadySettled: result.alreadySettled,
        tradeRun: result.tradeRun,
        leaderboardEntry: result.leaderboardEntry,
        fee: result.fee
          ? {
              currency: TRADE_FEE_ITEM_NAME,
              amount: TRADE_CLOSE_FEE_GOLD,
              newBalance: result.fee.newBalance,
            }
          : null,
      });
    } catch (error) {
      if (hasInsufficientGold(error)) {
        res.status(409).json({
          error: 'Insufficient Gold',
          fee: {
            currency: TRADE_FEE_ITEM_NAME,
            amount: TRADE_CLOSE_FEE_GOLD,
          },
        });
        return;
      }
      console.error('Failed to close trade run', {
        playerId,
        runId,
        error,
      });
      res.status(500).json({ error: 'Failed to close trade run' });
    }
  };

  /**
   * POST /api/daily-quest/trade/close
   * Paid close for an unsettled trade run.
   */
  app.post('/api/daily-quest/trade/close', closeTradeRunHandler);

  /**
   * POST /api/daily-quest/trade/stop
   * Backward-compatible alias for /trade/close.
   */
  app.post('/api/daily-quest/trade/stop', closeTradeRunHandler);

  /**
   * GET /api/daily-quest/history
   * Get the current player's prize history.
   */
  app.get('/api/daily-quest/history', async (req: Request, res: Response) => {
    const playerId = await getPlayerId(req);

    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

    try {
      const prizes = await dailyQuestLeaderboardRepo.getPlayerPrizeHistory(
        playerId,
        limit
      );

      res.json({
        prizes: prizes.map((p) => ({
          date: p.competitionDate,
          tier: p.difficultyId,
          position: p.position,
          finalScore: p.finalScore,
          usdcAmount: p.usdcAmount,
          ghstAmount: p.ghstAmount,
          status: p.status,
          distributedAt: p.distributedAt,
        })),
      });
    } catch (error) {
      console.error('Failed to get prize history', { playerId, error });
      res.status(500).json({ error: 'Failed to get history' });
    }
  });

  /**
   * GET /api/daily-quest/rank/:tier
   * Get the current player's rank in a specific tier.
   */
  app.get('/api/daily-quest/rank/:tier', async (req: Request, res: Response) => {
    const playerId = await getPlayerId(req);

    if (!playerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const tier = req.params.tier?.toLowerCase() as CompetitionTier;

    if (!COMPETITION_TIERS.includes(tier)) {
      res.status(400).json({ error: 'Invalid tier' });
      return;
    }

    const date = typeof req.query.date === 'string'
      ? req.query.date
      : getCompetitionDate();

    try {
      const entry = await dailyQuestLeaderboardRepo.getPlayerEntry(
        date,
        tier,
        playerId
      );

      if (!entry) {
        res.json({
          tier,
          date,
          hasEntry: false,
          entry: null,
          rank: null,
        });
        return;
      }

      const rank = await dailyQuestLeaderboardRepo.getPlayerRank(date, tier, playerId);

      res.json({
        tier,
        date,
        hasEntry: true,
        entry: {
          rawScore: entry.rawScore,
          timeMultiplier: entry.timeMultiplier,
          gotchiBonusMultiplier: entry.gotchiBonusMultiplier,
          isRealGotchi: entry.isRealGotchi,
          finalScore: entry.finalScore,
          completedAt: entry.completedAt,
        },
        rank,
      });
    } catch (error) {
      console.error('Failed to get player rank', { playerId, tier, date, error });
      res.status(500).json({ error: 'Failed to get rank' });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Admin Routes
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/daily-quest/distribute-prizes
   * Manually trigger prize distribution for a specific date.
   */
  app.post(
    '/api/admin/daily-quest/distribute-prizes',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      const date = typeof req.body.date === 'string' ? req.body.date : undefined;
      const dryRun = req.body.dryRun === true;

      try {
        const result = await runPrizeDistributionJob({ date, dryRun });
        res.json(result);
      } catch (error) {
        console.error('Failed to run prize distribution', { date, dryRun, error });
        res.status(500).json({ error: 'Failed to run prize distribution' });
      }
    }
  );

  /**
   * GET /api/admin/daily-quest/prizes/:date
   * Get prize distribution records for a specific date.
   */
  app.get(
    '/api/admin/daily-quest/prizes/:date',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      const date = req.params.date;

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        return;
      }

      try {
        const prizes = await dailyQuestLeaderboardRepo.getPrizeDistributionsForDate(date);
        res.json({ date, prizes });
      } catch (error) {
        console.error('Failed to get prize distributions', { date, error });
        res.status(500).json({ error: 'Failed to get prizes' });
      }
    }
  );
}
