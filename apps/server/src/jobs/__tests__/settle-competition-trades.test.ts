import {
  runSettleCompetitionTradesForAccountFallback,
  runSettleCompetitionTradesJob,
} from '../settle-competition-trades';

jest.mock('../../lib/db', () => ({
  competitionTradeRunsRepo: {
    listDueUnsettledTradeRunsForDate: jest.fn(),
    countDueUnsettledTradeRunsForDate: jest.fn(),
    listOpenTradeRunsForAccount: jest.fn(),
    settleTradeRunIfUnsettled: jest.fn(),
  },
  dailyQuestLeaderboardRepo: {
    upsertLeaderboardEntry: jest.fn(),
  },
  runTransaction: jest.fn(async (handler: any) => handler({})),
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  getCompetitionDate: jest.fn(() => '2026-02-20'),
}));

jest.mock('../../lib/price-oracle', () => ({
  sampleTwapUsd: jest.fn(),
}));

import {
  competitionTradeRunsRepo,
  dailyQuestLeaderboardRepo,
  runTransaction,
} from '../../lib/db';
import { sampleTwapUsd } from '../../lib/price-oracle';

function makeUnsettledRun(overrides: Partial<any> = {}) {
  return {
    id: 'trade-1',
    competitionDate: '2026-02-19',
    difficultyId: 'normal',
    accountId: 'player-1',
    runId: 'run-1',
    baseScore: 1000,
    timeMultiplier: 1.5,
    token: 'BTC',
    direction: 'long',
    riskLeverage: 2,
    entryPriceUsd: 100,
    entrySampledAt: '2026-02-19T12:00:00.000Z',
    closeAt: '2026-02-19T23:45:00.000Z',
    updateCount: 0,
    state: 'unsettled',
    settleReason: null,
    settlePriceUsd: null,
    settledAt: null,
    tradeMultiplier: null,
    finalScore: null,
    oracleMeta: {},
    createdAt: '2026-02-19T12:00:00.000Z',
    updatedAt: '2026-02-19T12:00:00.000Z',
    ...overrides,
  };
}

describe('runSettleCompetitionTradesJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runTransaction as jest.Mock).mockImplementation(async (handler: any) =>
      handler({})
    );
  });

  it('settles only due runs (close_at <= now)', async () => {
    const dueRun = makeUnsettledRun({
      id: 'trade-due',
      runId: 'run-due',
      closeAt: '2026-02-19T23:50:00.000Z',
    });

    (competitionTradeRunsRepo.listDueUnsettledTradeRunsForDate as jest.Mock).mockResolvedValue([
      dueRun,
    ]);
    (competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(dueRun.closeAt),
      stale: false,
      oracleMeta: { source: 'binance' },
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockResolvedValue({
      ...dueRun,
      state: 'settled_close',
      settleReason: 'close',
      settlePriceUsd: 110,
      settledAt: dueRun.closeAt,
      tradeMultiplier: 1.2,
      finalScore: 1800,
    });

    const result = await runSettleCompetitionTradesJob({
      date: '2026-02-19',
      nowMs: Date.parse('2026-02-20T00:10:00.000Z'),
    });

    expect(sampleTwapUsd).toHaveBeenCalledWith(
      'BTC',
      60_000,
      Date.parse(dueRun.closeAt),
      {
        strategy: 'first_success',
        allowCacheFallback: false,
      }
    );
    expect(competitionTradeRunsRepo.settleTradeRunIfUnsettled).toHaveBeenCalledTimes(1);
    expect(dailyQuestLeaderboardRepo.upsertLeaderboardEntry).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        targetDate: '2026-02-19',
        totalUnsettled: 1,
        settled: 1,
        failed: 0,
        remainingUnsettled: 0,
      })
    );
  });

  it('settles cross-midnight runs using the run close_at timestamp', async () => {
    const crossMidnightRun = makeUnsettledRun({
      id: 'trade-cross-midnight',
      runId: 'run-cross-midnight',
      closeAt: '2026-02-20T00:14:00.000Z',
      oracleMeta: {
        gotchiBonusMultiplier: 1.25,
        isRealGotchi: true,
      },
    });

    (competitionTradeRunsRepo.listDueUnsettledTradeRunsForDate as jest.Mock).mockResolvedValue([
      crossMidnightRun,
    ]);
    (competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(crossMidnightRun.closeAt),
      stale: false,
      oracleMeta: { source: 'binance' },
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockResolvedValue({
      ...crossMidnightRun,
      state: 'settled_close',
      settleReason: 'close',
      settlePriceUsd: 110,
      settledAt: crossMidnightRun.closeAt,
      tradeMultiplier: 1.2,
      finalScore: 1800,
    });

    const result = await runSettleCompetitionTradesJob({
      date: '2026-02-19',
      nowMs: Date.parse('2026-02-20T00:20:00.000Z'),
    });

    expect(sampleTwapUsd).toHaveBeenCalledWith(
      'BTC',
      60_000,
      Date.parse('2026-02-20T00:14:00.000Z'),
      {
        strategy: 'first_success',
        allowCacheFallback: false,
      }
    );
    expect(competitionTradeRunsRepo.settleTradeRunIfUnsettled).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trade-cross-midnight',
        settleReason: 'close',
        settledAt: '2026-02-20T00:14:00.000Z',
      })
    );
    expect(result.success).toBe(true);
  });

  it('preserves gotchi multiplier fields on leaderboard writes', async () => {
    const gotchiRun = makeUnsettledRun({
      id: 'trade-gotchi',
      runId: 'run-gotchi',
      oracleMeta: {
        gotchiBonusMultiplier: 1.25,
        isRealGotchi: true,
      },
    });

    (competitionTradeRunsRepo.listDueUnsettledTradeRunsForDate as jest.Mock).mockResolvedValue([
      gotchiRun,
    ]);
    (competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(gotchiRun.closeAt),
      stale: false,
      oracleMeta: { source: 'binance' },
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockResolvedValue({
      ...gotchiRun,
      state: 'settled_close',
      settleReason: 'close',
      settlePriceUsd: 110,
      settledAt: gotchiRun.closeAt,
      tradeMultiplier: 1.2,
      finalScore: 1800,
    });

    await runSettleCompetitionTradesJob({
      date: '2026-02-19',
      nowMs: Date.parse('2026-02-20T00:20:00.000Z'),
    });

    expect(dailyQuestLeaderboardRepo.upsertLeaderboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        gotchiBonusMultiplier: 1.25,
        isRealGotchi: true,
      })
    );
  });

  it('fails closed when settlement quote is stale', async () => {
    const staleRun = makeUnsettledRun({
      id: 'trade-stale',
      runId: 'run-stale',
      closeAt: '2026-02-19T23:50:00.000Z',
    });

    (competitionTradeRunsRepo.listDueUnsettledTradeRunsForDate as jest.Mock).mockResolvedValue([
      staleRun,
    ]);
    (competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(staleRun.closeAt) - 300_000,
      stale: true,
      source: 'coingecko',
      oracleMeta: { source: 'coingecko' },
    });

    const result = await runSettleCompetitionTradesJob({
      date: '2026-02-19',
      nowMs: Date.parse('2026-02-20T00:10:00.000Z'),
    });

    expect(result.success).toBe(false);
    expect(result.settled).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.staleSettlements).toBe(1);
    expect(result.remainingUnsettled).toBe(1);
    expect(competitionTradeRunsRepo.settleTradeRunIfUnsettled).not.toHaveBeenCalled();
    expect(dailyQuestLeaderboardRepo.upsertLeaderboardEntry).not.toHaveBeenCalled();
  });

  it('reuses minute-bucket settlement quotes for close timestamps in the same minute', async () => {
    const runA = makeUnsettledRun({
      id: 'trade-bucket-a',
      runId: 'run-bucket-a',
      closeAt: '2026-02-19T23:50:05.000Z',
    });
    const runB = makeUnsettledRun({
      id: 'trade-bucket-b',
      runId: 'run-bucket-b',
      closeAt: '2026-02-19T23:50:20.000Z',
    });

    (competitionTradeRunsRepo.listDueUnsettledTradeRunsForDate as jest.Mock).mockResolvedValue([
      runA,
      runB,
    ]);
    (competitionTradeRunsRepo.countDueUnsettledTradeRunsForDate as jest.Mock)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse('2026-02-19T23:50:00.000Z'),
      stale: false,
      source: 'aerodrome_base',
      oracleMeta: { source: 'aerodrome_base' },
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockImplementation(
      async (input: any) => ({
        ...runA,
        id: input.id,
        runId: input.id === runA.id ? runA.runId : runB.runId,
        state: 'settled_close',
        settleReason: 'close',
        settlePriceUsd: 110,
        settledAt: input.settledAt,
        tradeMultiplier: 1.2,
        finalScore: 1800,
      })
    );

    const result = await runSettleCompetitionTradesJob({
      date: '2026-02-19',
      nowMs: Date.parse('2026-02-20T00:10:00.000Z'),
    });

    expect(result.success).toBe(true);
    expect(result.settled).toBe(2);
    expect(sampleTwapUsd).toHaveBeenCalledTimes(1);
    expect(sampleTwapUsd).toHaveBeenCalledWith(
      'BTC',
      60_000,
      Date.parse('2026-02-19T23:50:00.000Z'),
      {
        strategy: 'first_success',
        allowCacheFallback: false,
      }
    );
  });
});

describe('runSettleCompetitionTradesForAccountFallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runTransaction as jest.Mock).mockImplementation(async (handler: any) =>
      handler({})
    );
  });

  it('settles due runs for one account and reuses minute-bucket quotes', async () => {
    const dueRunA = makeUnsettledRun({
      id: 'trade-fallback-a',
      runId: 'run-fallback-a',
      accountId: 'player-fallback-1',
      closeAt: '2026-02-19T23:50:05.000Z',
    });
    const dueRunB = makeUnsettledRun({
      id: 'trade-fallback-b',
      runId: 'run-fallback-b',
      accountId: 'player-fallback-1',
      closeAt: '2026-02-19T23:50:20.000Z',
    });
    const openFutureRun = makeUnsettledRun({
      id: 'trade-fallback-future',
      runId: 'run-fallback-future',
      accountId: 'player-fallback-1',
      closeAt: '2026-02-20T00:40:00.000Z',
    });

    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([
      openFutureRun,
      dueRunB,
      dueRunA,
    ]);
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse('2026-02-19T23:50:00.000Z'),
      stale: false,
      source: 'aerodrome_base',
      oracleMeta: { source: 'aerodrome_base' },
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockImplementation(
      async (input: any) => ({
        ...dueRunA,
        id: input.id,
        runId: input.id === dueRunA.id ? dueRunA.runId : dueRunB.runId,
        state: 'settled_close',
        settleReason: 'close',
        settlePriceUsd: 110,
        settledAt: input.settledAt,
        tradeMultiplier: 1.2,
        finalScore: 1800,
      })
    );

    const result = await runSettleCompetitionTradesForAccountFallback({
      accountId: 'player-fallback-1',
      nowMs: Date.parse('2026-02-20T00:10:00.000Z'),
      maxDueRuns: 5,
      minIntervalMs: 0,
    });

    expect(result).toEqual(
      expect.objectContaining({
        attempted: true,
        throttled: false,
        totalOpen: 3,
        totalDue: 2,
        selectedDue: 2,
        settled: 2,
        failed: 0,
      })
    );
    expect(sampleTwapUsd).toHaveBeenCalledTimes(1);
    expect(sampleTwapUsd).toHaveBeenCalledWith(
      'BTC',
      60_000,
      Date.parse('2026-02-19T23:50:00.000Z'),
      {
        strategy: 'first_success',
        allowCacheFallback: false,
      }
    );
  });

  it('throttles repeated fallback settlement attempts to protect oracle rate limits', async () => {
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([]);

    const first = await runSettleCompetitionTradesForAccountFallback({
      accountId: 'player-fallback-throttle',
      nowMs: Date.parse('2026-02-20T00:10:00.000Z'),
      minIntervalMs: 30_000,
    });
    const second = await runSettleCompetitionTradesForAccountFallback({
      accountId: 'player-fallback-throttle',
      nowMs: Date.parse('2026-02-20T00:10:05.000Z'),
      minIntervalMs: 30_000,
    });

    expect(first.attempted).toBe(true);
    expect(second).toEqual(
      expect.objectContaining({
        attempted: false,
        throttled: true,
      })
    );
    expect(competitionTradeRunsRepo.listOpenTradeRunsForAccount).toHaveBeenCalledTimes(1);
  });
});
