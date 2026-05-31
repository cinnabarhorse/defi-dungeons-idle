import {
  competitionTradeRunsRepo,
  dailyQuestLeaderboardRepo,
  runTransaction,
} from '../lib/db';
import { getCompetitionDate } from '../lib/daily-quest-competition';
import { sampleTwapUsd } from '../lib/price-oracle';
import type { CompetitionTradeRunRecord } from '../lib/db/repos/competition-trade-runs';
import {
  computeTradeSettlement,
  getCompetitionSettlementDeadlineMs,
  type TradeToken,
} from '../lib/trading-game';

const SETTLEMENT_TWAP_WINDOW_MS = 60_000;
const SETTLEMENT_TWAP_BUCKET_MS = 60_000;
const ACCOUNT_FALLBACK_MAX_DUE_RUNS = 5;
const ACCOUNT_FALLBACK_OPEN_RUN_SCAN_LIMIT = 50;
const ACCOUNT_FALLBACK_MIN_INTERVAL_MS = 30_000;
const lastFallbackAttemptAtByAccount = new Map<string, number>();

export interface SettleCompetitionTradesOptions {
  date?: string;
  nowMs?: number;
}

export interface SettleCompetitionTradesResult {
  success: boolean;
  targetDate: string;
  totalUnsettled: number;
  settled: number;
  skippedAlreadySettled: number;
  failed: number;
  staleSettlements: number;
  remainingUnsettled: number;
  finishedAt: string;
  durationMs: number;
  errors: string[];
}

export interface SettleCompetitionTradesForAccountOptions {
  accountId: string;
  nowMs?: number;
  maxDueRuns?: number;
  openRunScanLimit?: number;
  minIntervalMs?: number;
}

export interface SettleCompetitionTradesForAccountResult {
  attempted: boolean;
  throttled: boolean;
  accountId: string;
  totalOpen: number;
  totalDue: number;
  selectedDue: number;
  settled: number;
  skippedAlreadySettled: number;
  failed: number;
  staleSettlements: number;
  errors: string[];
}

interface SettleTradeRunsBatchResult {
  settled: number;
  skippedAlreadySettled: number;
  failed: number;
  staleSettlements: number;
  errors: string[];
}

function getSettlementQuoteAtMs(closeAtIso: string, nowMs: number): number {
  const closeAtMs = Date.parse(closeAtIso);
  const referenceMs = Number.isFinite(closeAtMs) ? closeAtMs : nowMs;
  // Bucket quote timestamps to the nearest minute to avoid hammering upstream oracles.
  return Math.round(referenceMs / SETTLEMENT_TWAP_BUCKET_MS) * SETTLEMENT_TWAP_BUCKET_MS;
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

async function settleSingleRun(
  run: CompetitionTradeRunRecord,
  settlePriceUsd: number,
  settledAtIso: string,
  stalePrice: boolean,
  oracleMeta: Record<string, unknown>
): Promise<{ settled: boolean; alreadySettled: boolean }> {
  const settlement = computeTradeSettlement({
    baseScore: run.baseScore,
    timeMultiplier: run.timeMultiplier,
    direction: run.direction,
    riskLeverage: run.riskLeverage,
    entryPriceUsd: run.entryPriceUsd,
    exitPriceUsd: settlePriceUsd,
  });
  const { gotchiBonusMultiplier, isRealGotchi } = resolveTradeRunGotchiBonus(
    run.oracleMeta
  );

  const result = await runTransaction(async (client) => {
    const settledRun = await competitionTradeRunsRepo.settleTradeRunIfUnsettled({
      id: run.id,
      state: 'settled_close',
      settleReason: 'close',
      settlePriceUsd,
      settledAt: settledAtIso,
      tradeMultiplier: settlement.tradeMultiplier,
      finalScore: settlement.finalScore,
      oracleMeta: {
        ...oracleMeta,
        stale: stalePrice,
        settleReason: 'close',
        settleAt: settledAtIso,
      },
      client,
    });

    if (!settledRun) {
      return { settled: false, alreadySettled: true };
    }

    await dailyQuestLeaderboardRepo.upsertLeaderboardEntry({
      date: run.competitionDate,
      difficultyId: run.difficultyId,
      accountId: run.accountId,
      rawScore: settlement.rawScore,
      timeMultiplier: run.timeMultiplier,
      gotchiBonusMultiplier,
      isRealGotchi,
      runId: run.runId,
      completedAt: settledAtIso,
      client,
    });

    return { settled: true, alreadySettled: false };
  });

  return result;
}

function isDueRun(run: CompetitionTradeRunRecord, nowMs: number): boolean {
  const closeAtMs = Date.parse(run.closeAt);
  if (!Number.isFinite(closeAtMs)) {
    return true;
  }
  return closeAtMs <= nowMs;
}

function compareRunsByCloseAtAsc(
  a: CompetitionTradeRunRecord,
  b: CompetitionTradeRunRecord
): number {
  const aCloseMs = Date.parse(a.closeAt);
  const bCloseMs = Date.parse(b.closeAt);
  const safeACloseMs = Number.isFinite(aCloseMs) ? aCloseMs : 0;
  const safeBCloseMs = Number.isFinite(bCloseMs) ? bCloseMs : 0;
  if (safeACloseMs !== safeBCloseMs) {
    return safeACloseMs - safeBCloseMs;
  }

  const aCreatedMs = Date.parse(a.createdAt);
  const bCreatedMs = Date.parse(b.createdAt);
  const safeACreatedMs = Number.isFinite(aCreatedMs) ? aCreatedMs : 0;
  const safeBCreatedMs = Number.isFinite(bCreatedMs) ? bCreatedMs : 0;
  return safeACreatedMs - safeBCreatedMs;
}

async function settleTradeRunsBatch(
  unsettledRuns: CompetitionTradeRunRecord[],
  nowMs: number
): Promise<SettleTradeRunsBatchResult> {
  const priceByToken = new Map<
    string,
    {
      priceUsd: number;
      stale: boolean;
      source: string;
      oracleMeta: Record<string, unknown>;
    }
  >();
  const quoteErrorsByKey = new Map<
    string,
    {
      stale: boolean;
      message: string;
    }
  >();

  let settled = 0;
  let skippedAlreadySettled = 0;
  let failed = 0;
  let staleSettlements = 0;
  const errors: string[] = [];

  for (const run of unsettledRuns) {
    try {
      const token = run.token as TradeToken;
      const quoteAtMs = getSettlementQuoteAtMs(run.closeAt, nowMs);
      const quoteCacheKey = `${token}:${quoteAtMs}`;
      let tokenPrice = priceByToken.get(quoteCacheKey);
      let quoteError = quoteErrorsByKey.get(quoteCacheKey);
      if (!tokenPrice && !quoteError) {
        try {
          const quote = await sampleTwapUsd(
            token,
            SETTLEMENT_TWAP_WINDOW_MS,
            quoteAtMs,
            {
              strategy: 'first_success',
              allowCacheFallback: false,
            }
          );

          const quoteSource = String(quote.source || '').toLowerCase();
          if (quote.stale || quoteSource === 'cache') {
            quoteError = {
              stale: true,
              message: `Rejected settlement quote for ${token} at ${new Date(
                quoteAtMs
              ).toISOString()} (source=${quote.source}, stale=${quote.stale})`,
            };
            quoteErrorsByKey.set(quoteCacheKey, quoteError);
            staleSettlements += 1;
          } else {
            tokenPrice = {
              priceUsd: quote.priceUsd,
              stale: quote.stale,
              source: quote.source,
              oracleMeta: quote.oracleMeta,
            };
            priceByToken.set(quoteCacheKey, tokenPrice);
          }
        } catch (error) {
          quoteError = {
            stale: false,
            message: `Settlement quote unavailable for ${token} at ${new Date(
              quoteAtMs
            ).toISOString()}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
          quoteErrorsByKey.set(quoteCacheKey, quoteError);
        }
      }

      if (!tokenPrice) {
        quoteError = quoteError ?? quoteErrorsByKey.get(quoteCacheKey);
      }
      if (!tokenPrice || quoteError) {
        failed += 1;
        errors.push(
          `[${run.id}] ${
            quoteError?.message ??
            `Settlement quote unavailable for ${token} at ${new Date(
              quoteAtMs
            ).toISOString()}`
          }`
        );
        continue;
      }

      const settleResult = await settleSingleRun(
        run,
        tokenPrice.priceUsd,
        run.closeAt,
        tokenPrice.stale,
        tokenPrice.oracleMeta
      );

      if (settleResult.alreadySettled) {
        skippedAlreadySettled += 1;
        continue;
      }

      if (settleResult.settled) {
        settled += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push(
        `[${run.id}] ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return {
    settled,
    skippedAlreadySettled,
    failed,
    staleSettlements,
    errors,
  };
}

export async function runSettleCompetitionTradesForAccountFallback(
  options: SettleCompetitionTradesForAccountOptions
): Promise<SettleCompetitionTradesForAccountResult> {
  const accountId = String(options.accountId || '').trim();
  if (!accountId) {
    throw new Error('accountId is required');
  }

  const nowMs = options.nowMs ?? Date.now();
  const minIntervalMs = Math.max(
    0,
    Math.floor(options.minIntervalMs ?? ACCOUNT_FALLBACK_MIN_INTERVAL_MS)
  );

  if (minIntervalMs > 0) {
    const previousAttemptMs = lastFallbackAttemptAtByAccount.get(accountId);
    if (
      Number.isFinite(previousAttemptMs) &&
      nowMs - Number(previousAttemptMs) < minIntervalMs
    ) {
      return {
        attempted: false,
        throttled: true,
        accountId,
        totalOpen: 0,
        totalDue: 0,
        selectedDue: 0,
        settled: 0,
        skippedAlreadySettled: 0,
        failed: 0,
        staleSettlements: 0,
        errors: [],
      };
    }
    lastFallbackAttemptAtByAccount.set(accountId, nowMs);
  }

  const maxDueRuns = Math.max(
    1,
    Math.min(50, Math.floor(options.maxDueRuns ?? ACCOUNT_FALLBACK_MAX_DUE_RUNS))
  );
  const defaultOpenRunScanLimit = Math.max(
    ACCOUNT_FALLBACK_OPEN_RUN_SCAN_LIMIT,
    maxDueRuns * 3
  );
  const openRunScanLimit = Math.max(
    maxDueRuns,
    Math.min(
      500,
      Math.floor(options.openRunScanLimit ?? defaultOpenRunScanLimit)
    )
  );

  const openRuns = await competitionTradeRunsRepo.listOpenTradeRunsForAccount(
    accountId,
    openRunScanLimit
  );
  const dueRuns = openRuns.filter((run) => isDueRun(run, nowMs));
  dueRuns.sort(compareRunsByCloseAtAsc);
  const selectedRuns = dueRuns.slice(0, maxDueRuns);
  const settlement = await settleTradeRunsBatch(selectedRuns, nowMs);

  return {
    attempted: true,
    throttled: false,
    accountId,
    totalOpen: openRuns.length,
    totalDue: dueRuns.length,
    selectedDue: selectedRuns.length,
    ...settlement,
  };
}

export async function runSettleCompetitionTradesJob(
  options: SettleCompetitionTradesOptions = {}
): Promise<SettleCompetitionTradesResult> {
  const startedAtMs = Date.now();
  const nowMs = options.nowMs ?? startedAtMs;
  const targetDate =
    options.date ?? getCompetitionDate({ nowMs, offsetDays: -1 });
  const nowIso = new Date(nowMs).toISOString();

  const unsettledRuns =
    await competitionTradeRunsRepo.listDueUnsettledTradeRunsForDate(
      targetDate,
      nowIso,
      5000
    );
  const dueRunCount = await competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate(
    targetDate,
    nowIso
  );

  const {
    settled,
    skippedAlreadySettled,
    failed,
    staleSettlements,
    errors,
  } = await settleTradeRunsBatch(unsettledRuns, nowMs);

  const remainingDueUnsettled =
    await competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate(
      targetDate,
      nowIso
    );

  const finishMs = Date.now();
  const finishedAt = new Date(finishMs).toISOString();
  const durationMs = finishMs - startedAtMs;
  const deadlineAlertMs = getCompetitionSettlementDeadlineMs(targetDate) - 60_000;

  if (remainingDueUnsettled > 0 && finishMs >= deadlineAlertMs) {
    errors.push(
      `Settlement still incomplete after deadline threshold: ${remainingDueUnsettled} due unsettled runs remain`
    );
  }

  return {
    success: errors.length === 0,
    targetDate,
    totalUnsettled: dueRunCount,
    settled,
    skippedAlreadySettled,
    failed,
    staleSettlements,
    remainingUnsettled: remainingDueUnsettled,
    finishedAt,
    durationMs,
    errors,
  };
}
