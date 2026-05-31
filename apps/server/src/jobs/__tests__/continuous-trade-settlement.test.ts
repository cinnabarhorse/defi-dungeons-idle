jest.mock('../../lib/daily-quest-competition', () => ({
  getCompetitionDate: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  competitionTradeRunsRepo: {
    listDueUnsettledTradeRunDates: jest.fn(),
  },
  cronExecutionsRepo: {
    createExecution: jest.fn(),
    completeExecution: jest.fn(),
  },
}));

jest.mock('../settle-competition-trades', () => ({
  runSettleCompetitionTradesJob: jest.fn(),
}));

jest.mock('../../lib/logging', () => ({
  getBaseLogger: jest.fn(() => ({
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  })),
}));

import { getCompetitionDate } from '../../lib/daily-quest-competition';
import { competitionTradeRunsRepo, cronExecutionsRepo } from '../../lib/db';
import { runSettleCompetitionTradesJob } from '../settle-competition-trades';
import {
  pollContinuousTradeSettlementOnce,
  resetContinuousTradeSettlementMonitorForTests,
  startContinuousTradeSettlementMonitor,
} from '../continuous-trade-settlement';

function makeSettlementResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    success: true,
    targetDate: '2026-02-26',
    totalUnsettled: 0,
    settled: 0,
    skippedAlreadySettled: 0,
    failed: 0,
    staleSettlements: 0,
    remainingUnsettled: 0,
    finishedAt: '2026-02-26T00:00:00.000Z',
    durationMs: 1,
    errors: [],
    ...overrides,
  };
}

async function flushSettlementPoll(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe('continuous trade settlement monitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetContinuousTradeSettlementMonitorForTests();
    (getCompetitionDate as jest.Mock).mockImplementation(
      ({ offsetDays }: { offsetDays?: number } = {}) =>
        offsetDays === -1 ? '2026-02-25' : '2026-02-26'
    );
    (competitionTradeRunsRepo.listDueUnsettledTradeRunDates as jest.Mock).mockResolvedValue([]);
    (cronExecutionsRepo.createExecution as jest.Mock).mockResolvedValue({
      id: 'execution-1',
    });
    (cronExecutionsRepo.completeExecution as jest.Mock).mockResolvedValue({
      id: 'execution-1',
    });
    (runSettleCompetitionTradesJob as jest.Mock).mockResolvedValue(
      makeSettlementResult()
    );
  });

  afterEach(() => {
    resetContinuousTradeSettlementMonitorForTests();
    jest.useRealTimers();
  });

  it('polls both yesterday and today for due settlements', async () => {
    await pollContinuousTradeSettlementOnce(1_700_000_000_000);

    expect(runSettleCompetitionTradesJob).toHaveBeenNthCalledWith(1, {
      date: '2026-02-25',
      nowMs: 1_700_000_000_000,
    });
    expect(runSettleCompetitionTradesJob).toHaveBeenNthCalledWith(2, {
      date: '2026-02-26',
      nowMs: 1_700_000_000_000,
    });
  });

  it('records a successful execution summary for monitor polls', async () => {
    (runSettleCompetitionTradesJob as jest.Mock)
      .mockResolvedValueOnce(
        makeSettlementResult({
          targetDate: '2026-02-25',
          settled: 2,
          skippedAlreadySettled: 1,
        })
      )
      .mockResolvedValueOnce(
        makeSettlementResult({
          targetDate: '2026-02-26',
          settled: 3,
          staleSettlements: 1,
        })
      );

    await pollContinuousTradeSettlementOnce(1_700_000_000_000);

    expect(cronExecutionsRepo.createExecution).toHaveBeenCalledWith({
      jobName: 'continuous_trade_settlement',
      targetDate: undefined,
    });
    expect(cronExecutionsRepo.completeExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'execution-1',
        success: true,
        prizesDistributed: 5,
        prizesSkipped: 1,
        prizesFailed: 0,
        errorMessage: undefined,
        errors: undefined,
        resultJson: expect.objectContaining({
          nowMs: 1_700_000_000_000,
          targetDates: ['2026-02-25', '2026-02-26'],
          success: true,
          settled: 5,
          skippedAlreadySettled: 1,
          failed: 0,
          staleSettlements: 1,
          remainingUnsettled: 0,
          results: expect.arrayContaining([
            expect.objectContaining({ targetDate: '2026-02-25', settled: 2 }),
            expect.objectContaining({ targetDate: '2026-02-26', settled: 3 }),
          ]),
        }),
      })
    );
  });

  it('continues settling even if execution row creation fails', async () => {
    (cronExecutionsRepo.createExecution as jest.Mock).mockRejectedValue(
      new Error('db unavailable')
    );

    await pollContinuousTradeSettlementOnce(1_700_000_000_000);

    expect(runSettleCompetitionTradesJob).toHaveBeenCalledTimes(2);
    expect(cronExecutionsRepo.completeExecution).not.toHaveBeenCalled();
  });

  it('retries stranded overdue dates older than yesterday', async () => {
    (competitionTradeRunsRepo.listDueUnsettledTradeRunDates as jest.Mock).mockResolvedValue([
      '2026-02-20',
    ]);

    await pollContinuousTradeSettlementOnce(1_700_000_000_000);

    expect(runSettleCompetitionTradesJob).toHaveBeenNthCalledWith(1, {
      date: '2026-02-20',
      nowMs: 1_700_000_000_000,
    });
    expect(runSettleCompetitionTradesJob).toHaveBeenNthCalledWith(2, {
      date: '2026-02-25',
      nowMs: 1_700_000_000_000,
    });
    expect(runSettleCompetitionTradesJob).toHaveBeenNthCalledWith(3, {
      date: '2026-02-26',
      nowMs: 1_700_000_000_000,
    });
  });

  it('runs immediately on start and repeats on interval', async () => {
    startContinuousTradeSettlementMonitor({ intervalMs: 1_000 });
    await flushSettlementPoll();

    expect(runSettleCompetitionTradesJob).toHaveBeenCalledTimes(2);

    (runSettleCompetitionTradesJob as jest.Mock).mockClear();

    jest.advanceTimersByTime(1_000);
    await flushSettlementPoll();

    expect(runSettleCompetitionTradesJob).toHaveBeenCalledTimes(2);
  });

  it('prevents overlapping polls', async () => {
    let resolveFirstCall: ((value: unknown) => void) | null = null;
    let invocation = 0;
    (runSettleCompetitionTradesJob as jest.Mock).mockImplementation(() => {
      invocation += 1;
      if (invocation === 1) {
        return new Promise((resolve) => {
          resolveFirstCall = resolve;
        });
      }
      return Promise.resolve(makeSettlementResult());
    });

    const first = pollContinuousTradeSettlementOnce(1_700_000_000_000);
    const second = pollContinuousTradeSettlementOnce(1_700_000_000_000);

    await flushSettlementPoll();
    expect(runSettleCompetitionTradesJob).toHaveBeenCalledTimes(1);

    resolveFirstCall?.(makeSettlementResult());
    await first;
    await second;
    expect(runSettleCompetitionTradesJob).toHaveBeenCalledTimes(2);
  });
});
