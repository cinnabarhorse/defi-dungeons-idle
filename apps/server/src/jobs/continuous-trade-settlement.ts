import { competitionTradeRunsRepo, cronExecutionsRepo } from '../lib/db';
import { getCompetitionDate } from '../lib/daily-quest-competition';
import { getBaseLogger } from '../lib/logging';
import type { SettleCompetitionTradesResult } from './settle-competition-trades';
import { runSettleCompetitionTradesJob } from './settle-competition-trades';

const DEFAULT_TRADE_SETTLEMENT_INTERVAL_MS = 60_000;
const BACKLOG_TRADE_SETTLEMENT_DATE_LIMIT = 4;
const CONTINUOUS_TRADE_SETTLEMENT_JOB_NAME = 'continuous_trade_settlement';

const logger = getBaseLogger().child({
  module: 'continuous_trade_settlement',
});

let settlementTimer: ReturnType<typeof setInterval> | null = null;
let settlementRunning = false;
let settlementInFlight = false;

interface ContinuousTradeSettlementPollSummary {
  nowMs: number;
  targetDates: string[];
  success: boolean;
  settled: number;
  skippedAlreadySettled: number;
  failed: number;
  staleSettlements: number;
  remainingUnsettled: number;
  errors: string[];
  results: SettleCompetitionTradesResult[];
  finishedAt: string;
  durationMs: number;
}

function getDefaultTargetDates(nowMs: number): string[] {
  const today = getCompetitionDate({ nowMs });
  const yesterday = getCompetitionDate({ nowMs, offsetDays: -1 });
  return [...new Set([yesterday, today])];
}

async function getUniqueTargetDates(nowMs: number): Promise<string[]> {
  const fallbackDates = getDefaultTargetDates(nowMs);

  try {
    const dueDates = await competitionTradeRunsRepo.listDueUnsettledTradeRunDates(
      new Date(nowMs).toISOString(),
      BACKLOG_TRADE_SETTLEMENT_DATE_LIMIT
    );
    return [...new Set([...dueDates, ...fallbackDates])].sort();
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      'continuous_trade_settlement_date_scan_failed'
    );
    return fallbackDates;
  }
}

function buildPollSummary(
  nowMs: number,
  targetDates: string[],
  results: SettleCompetitionTradesResult[],
  pollErrors: string[],
  pollStartedAtMs: number,
  pollFinishedAtMs: number
): ContinuousTradeSettlementPollSummary {
  const settled = results.reduce((sum, result) => sum + result.settled, 0);
  const skippedAlreadySettled = results.reduce(
    (sum, result) => sum + result.skippedAlreadySettled,
    0
  );
  const failed =
    results.reduce((sum, result) => sum + result.failed, 0) + pollErrors.length;
  const staleSettlements = results.reduce(
    (sum, result) => sum + result.staleSettlements,
    0
  );
  const remainingUnsettled = results.reduce(
    (sum, result) => sum + result.remainingUnsettled,
    0
  );
  const errors = [
    ...results.flatMap((result) =>
      result.errors.map((error) => `[${result.targetDate}] ${error}`)
    ),
    ...pollErrors,
  ];

  return {
    nowMs,
    targetDates,
    success:
      errors.length === 0 &&
      results.length === targetDates.length &&
      remainingUnsettled === 0,
    settled,
    skippedAlreadySettled,
    failed,
    staleSettlements,
    remainingUnsettled,
    errors,
    results,
    finishedAt: new Date(pollFinishedAtMs).toISOString(),
    durationMs: pollFinishedAtMs - pollStartedAtMs,
  };
}

export async function pollContinuousTradeSettlementOnce(
  nowMs: number = Date.now()
): Promise<void> {
  if (settlementInFlight) {
    return;
  }

  settlementInFlight = true;

  try {
    const pollStartedAtMs = Date.now();
    const targetDates = await getUniqueTargetDates(nowMs);
    const pollResults: SettleCompetitionTradesResult[] = [];
    const pollErrors: string[] = [];
    let executionId: string | null = null;

    try {
      const execution = await cronExecutionsRepo.createExecution({
        jobName: CONTINUOUS_TRADE_SETTLEMENT_JOB_NAME,
        targetDate: targetDates.length === 1 ? targetDates[0] : undefined,
      });
      executionId = execution.id;
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'continuous_trade_settlement_execution_create_failed'
      );
    }

    for (const date of targetDates) {
      try {
        const result = await runSettleCompetitionTradesJob({ date, nowMs });
        pollResults.push(result);
        if (!result.success || result.remainingUnsettled > 0) {
          logger.warn(
            {
              date,
              settled: result.settled,
              remainingUnsettled: result.remainingUnsettled,
              errors: result.errors,
            },
            'continuous_trade_settlement_incomplete'
          );
        }
      } catch (error) {
        pollErrors.push(
          `[${date}] ${error instanceof Error ? error.message : String(error)}`
        );
        logger.error(
          {
            date,
            err: error instanceof Error ? error.message : String(error),
          },
          'continuous_trade_settlement_failed'
        );
      }
    }

    const summary = buildPollSummary(
      nowMs,
      targetDates,
      pollResults,
      pollErrors,
      pollStartedAtMs,
      Date.now()
    );

    if (executionId) {
      try {
        await cronExecutionsRepo.completeExecution({
          id: executionId,
          success: summary.success,
          prizesDistributed: summary.settled,
          prizesSkipped: summary.skippedAlreadySettled,
          prizesFailed: summary.failed,
          errorMessage: summary.errors[0],
          errors: summary.errors.length > 0 ? summary.errors : undefined,
          resultJson: summary,
        });
      } catch (error) {
        logger.error(
          {
            executionId,
            err: error instanceof Error ? error.message : String(error),
          },
          'continuous_trade_settlement_execution_complete_failed'
        );
      }
    }
  } finally {
    settlementInFlight = false;
  }
}

export function startContinuousTradeSettlementMonitor(options?: {
  intervalMs?: number;
}): void {
  if (settlementTimer) {
    return;
  }

  const intervalMs =
    Number.isFinite(options?.intervalMs) && (options?.intervalMs ?? 0) > 0
      ? Number(options?.intervalMs)
      : DEFAULT_TRADE_SETTLEMENT_INTERVAL_MS;

  settlementTimer = setInterval(() => {
    void pollContinuousTradeSettlementOnce();
  }, intervalMs);

  settlementRunning = true;
  void pollContinuousTradeSettlementOnce();

  logger.info(
    { intervalMs },
    'continuous_trade_settlement_started'
  );
}

export function stopContinuousTradeSettlementMonitor(): void {
  if (settlementTimer) {
    clearInterval(settlementTimer);
    settlementTimer = null;
  }
  settlementRunning = false;
  settlementInFlight = false;
}

export function isContinuousTradeSettlementMonitorRunning(): boolean {
  return settlementRunning;
}

export function resetContinuousTradeSettlementMonitorForTests(): void {
  stopContinuousTradeSettlementMonitor();
}
