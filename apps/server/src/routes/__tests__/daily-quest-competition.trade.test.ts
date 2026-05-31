import express, { type Application } from 'express';
import request from 'supertest';
import { registerDailyQuestCompetitionRoutes } from '../daily-quest-competition';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  competitionTradeRunsRepo: {
    getTradeRunByRunIdAndAccount: jest.fn(),
    settleTradeRunIfUnsettled: jest.fn(),
    getTradeRunById: jest.fn(),
    listUnsettledTradeRunsForDateAndDifficulty: jest.fn(),
    countUnsettledTradeRunsForDateAndDifficulty: jest.fn(),
    listOpenTradeRunsForAccount: jest.fn(),
    updateTradeRunIfOpen: jest.fn(),
    extendTradeRunIfOpen: jest.fn(),
  },
  dailyQuestLeaderboardRepo: {
    getTopEntries: jest.fn(),
    countEntries: jest.fn(),
    getLeaderboardWithRanks: jest.fn(),
    upsertLeaderboardEntry: jest.fn(),
    getPlayerPrizeHistory: jest.fn(),
    getPlayerEntry: jest.fn(),
    getPlayerRank: jest.fn(),
  },
  inventoryRepo: {
    decrementInventoryItem: jest.fn(),
  },
  inventoryEventsRepo: {
    logInventoryEvent: jest.fn(),
  },
  runTransaction: jest.fn(),
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  getDailyQuestCompetitionConfig: jest.fn(() => ({
    enabled: true,
    resetTimeUtcHour: 0,
    tierUnlockThresholds: { normal: 0, nightmare: 0, hell: 0 },
    timeMultipliers: [],
    dailyRunsPerDay: 3,
  })),
  getCompetitionDate: jest.fn(() => '2026-02-19'),
  getMultiplierStatus: jest.fn(() => ({
    currentMultiplier: 1.2,
    hoursSinceReset: 10,
    minutesUntilNextTier: 15,
    nextTierMultiplier: 1.1,
  })),
  getAllPositionPrizes: jest.fn(() =>
    Array.from({ length: 10 }, (_, idx) => ({
      position: idx + 1,
      usdc: 1,
      ghst: 10,
      share: 0.1,
    }))
  ),
  getDailyBudget: jest.fn(() => ({ usdc: 10, ghst: 100 })),
  getTierPrizePool: jest.fn(() => ({ usdc: 5, ghst: 50 })),
  COMPETITION_TIERS: ['normal', 'nightmare', 'hell'],
}));

jest.mock('../../rooms/DailyQuestSystem', () => ({
  getPlayerCompetitionStatus: jest.fn(),
}));

jest.mock('../../jobs/distribute-daily-quest-prizes', () => ({
  runPrizeDistributionJob: jest.fn(),
}));

jest.mock('../../jobs/settle-competition-trades', () => ({
  runSettleCompetitionTradesForAccountFallback: jest.fn(),
}));

jest.mock('../admin-auth', () => ({
  requireAdminSession: (_req: any, _res: any, next: () => void) => next(),
}));

jest.mock('../../lib/price-oracle', () => ({
  sampleTwapUsd: jest.fn(),
  getSpotUsd: jest.fn(),
}));

jest.mock('../../lib/trading-game', () => {
  const actual = jest.requireActual('../../lib/trading-game');
  return {
    ...actual,
    computeTradeSettlement: jest.fn(() => ({
      rawScore: 1200,
      finalScore: 1800,
      delta: 0.1,
      tradeMultiplier: 1.2,
      unclampedMultiplier: 1.2,
    })),
    isTradingGameEnabled: jest.fn(() => true),
  };
});

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import {
  competitionTradeRunsRepo,
  dailyQuestLeaderboardRepo,
  inventoryEventsRepo,
  inventoryRepo,
  runTransaction,
} from '../../lib/db';
import { runSettleCompetitionTradesForAccountFallback } from '../../jobs/settle-competition-trades';
import { getSpotUsd, sampleTwapUsd } from '../../lib/price-oracle';
import { computeTradeSettlement, isTradingGameEnabled } from '../../lib/trading-game';

const NOW_ISO = '2026-02-19T20:00:00.000Z';
const FUTURE_CLOSE_ISO = '2099-01-01T00:15:00.000Z';

function makeTradeRun(overrides: Partial<Record<string, unknown>> = {}) {
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
    entrySampledAt: NOW_ISO,
    closeAt: FUTURE_CLOSE_ISO,
    updateCount: 0,
    state: 'unsettled',
    settleReason: null,
    settlePriceUsd: null,
    settledAt: null,
    tradeMultiplier: null,
    finalScore: null,
    oracleMeta: {
      gotchiBonusMultiplier: 1.25,
      isRealGotchi: true,
    },
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

describe('daily quest trading routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    registerDailyQuestCompetitionRoutes(app);

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });
    (isTradingGameEnabled as jest.Mock).mockReturnValue(true);

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) =>
      handler({})
    );
    (runSettleCompetitionTradesForAccountFallback as jest.Mock).mockResolvedValue({
      attempted: true,
      throttled: false,
      accountId: 'player-1',
      totalOpen: 0,
      totalDue: 0,
      selectedDue: 0,
      settled: 0,
      skippedAlreadySettled: 0,
      failed: 0,
      staleSettlements: 0,
      errors: [],
    });
    (inventoryEventsRepo.logInventoryEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
    });
  });

  it('GET /trade/market returns spot price with 1h and 24h change percentages', async () => {
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 105,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });
    (sampleTwapUsd as jest.Mock)
      .mockResolvedValueOnce({
        priceUsd: 100,
        sampledAtMs: Date.parse(NOW_ISO) - 60 * 60 * 1000,
        stale: false,
        oracleMeta: {},
      })
      .mockResolvedValueOnce({
        priceUsd: 84,
        sampledAtMs: Date.parse(NOW_ISO) - 24 * 60 * 60 * 1000,
        stale: false,
        oracleMeta: {},
      });

    const response = await request(app)
      .get('/api/daily-quest/trade/market')
      .query({ token: 'BTC' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        token: 'BTC',
        priceUsd: 105,
        stale: false,
        sampledAtMs: Date.parse(NOW_ISO),
      })
    );
    expect(response.body.change1hPct).toBeCloseTo(0.05, 6);
    expect(response.body.change24hPct).toBeCloseTo(0.25, 6);
    expect(sampleTwapUsd).toHaveBeenCalledTimes(2);
    expect(sampleTwapUsd).toHaveBeenNthCalledWith(
      1,
      'BTC',
      60_000,
      expect.any(Number)
    );
    expect(sampleTwapUsd).toHaveBeenNthCalledWith(
      2,
      'BTC',
      60_000,
      expect.any(Number)
    );
  });

  it('GET /trade/market returns null change when historical baseline fetch fails', async () => {
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 105,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });
    (sampleTwapUsd as jest.Mock)
      .mockRejectedValueOnce(new Error('1h baseline unavailable'))
      .mockResolvedValueOnce({
        priceUsd: 100,
        sampledAtMs: Date.parse(NOW_ISO) - 24 * 60 * 60 * 1000,
        stale: false,
        oracleMeta: {},
      });

    const response = await request(app)
      .get('/api/daily-quest/trade/market')
      .query({ token: 'ETH' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        token: 'ETH',
        priceUsd: 105,
        change1hPct: null,
      })
    );
    expect(response.body.change24hPct).toBeCloseTo(0.05, 6);
  });

  it('GET /trade/market rejects unsupported tokens', async () => {
    const response = await request(app)
      .get('/api/daily-quest/trade/market')
      .query({ token: 'DOGE' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('token must be one of');
    expect(getSpotUsd).not.toHaveBeenCalled();
  });

  it('GET /trade/open returns unsettled snapshots', async () => {
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([
      makeTradeRun(),
    ]);
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });

    const response = await request(app).get('/api/daily-quest/trade/open');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.runs[0]).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        closesAtUtc: FUTURE_CLOSE_ISO,
        estimatedTradeMultiplier: 1.2,
        estimatedFinalScore: 2250,
        updateCount: 0,
        maxUpdates: 1,
        canUpdate: false,
        canClose: true,
      })
    );
  });

  it('GET /trade/open triggers account fallback settlement before listing open runs', async () => {
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([
      makeTradeRun(),
    ]);
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });

    const response = await request(app).get('/api/daily-quest/trade/open');

    expect(response.status).toBe(200);
    expect(runSettleCompetitionTradesForAccountFallback).toHaveBeenCalledWith({
      accountId: 'player-1',
      nowMs: expect.any(Number),
      maxDueRuns: 5,
      minIntervalMs: 30_000,
    });
  });

  it('GET /trade/open falls back to a safe estimate instead of dropping runs', async () => {
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([
      makeTradeRun(),
    ]);
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });
    (computeTradeSettlement as jest.Mock).mockImplementationOnce(() => {
      throw new Error('estimate failed');
    });

    const response = await request(app).get('/api/daily-quest/trade/open');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.runs[0]).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        estimatedTradeMultiplier: 1,
        estimatedFinalScore: 1875,
      })
    );
  });

  it('GET /trade/open treats non-positive spot prices as invalid and falls back to entry price', async () => {
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([
      makeTradeRun(),
    ]);
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 0,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: true,
      oracleMeta: {},
    });
    (computeTradeSettlement as jest.Mock).mockImplementationOnce((input: any) => {
      if (input.exitPriceUsd <= 0) {
        throw new Error('invalid exit price');
      }
      return {
        rawScore: 1200,
        finalScore: 1800,
        delta: 0.1,
        tradeMultiplier: 1.2,
        unclampedMultiplier: 1.2,
      };
    });

    const response = await request(app).get('/api/daily-quest/trade/open');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.runs[0]).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        entryPriceUsd: 100,
        livePriceUsd: 100,
      })
    );
    expect(computeTradeSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPriceUsd: 100,
        exitPriceUsd: 100,
      })
    );
  });

  it('GET /trade/open returns actionable migration guidance when trade table is missing', async () => {
    const missingTableError = Object.assign(
      new Error('relation "competition_trade_runs" does not exist'),
      {
        code: '42P01',
      }
    );
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockRejectedValue(
      missingTableError
    );

    const response = await request(app).get('/api/daily-quest/trade/open');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error:
        'Open runs unavailable: trade tables are missing. Run pnpm db:migrate and restart the server.',
      code: '42P01',
    });
  });

  it('GET /trade/open tolerates non-string competitionDate values from legacy row parsing', async () => {
    (competitionTradeRunsRepo.listOpenTradeRunsForAccount as jest.Mock).mockResolvedValue([
      makeTradeRun({
        competitionDate: new Date('2026-02-19T00:00:00.000Z'),
      }),
    ]);
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });

    const response = await request(app).get('/api/daily-quest/trade/open');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.runs[0]).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        canExtend: expect.any(Boolean),
      })
    );
  });

  it('POST /trade/update is disabled after run completion', async () => {
    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      makeTradeRun({ closeAt: FUTURE_CLOSE_ISO })
    );

    const response = await request(app).post('/api/daily-quest/trade/update').send({
      runId: 'run-1',
      direction: 'short',
      riskLeverage: 3,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('disabled after run completion');
    expect(response.body.canUpdate).toBe(false);
    expect(response.body.closesAtUtc).toBe(FUTURE_CLOSE_ISO);
    expect(competitionTradeRunsRepo.updateTradeRunIfOpen).not.toHaveBeenCalled();
    expect(inventoryRepo.decrementInventoryItem).not.toHaveBeenCalled();
  });

  it('POST /trade/extend succeeds, charges fee, and extends close_at by one window', async () => {
    const existing = makeTradeRun({
      competitionDate: '2099-01-01',
      closeAt: '2099-01-01T00:15:00.000Z',
    });
    const extended = makeTradeRun({
      competitionDate: '2099-01-01',
      closeAt: '2099-01-01T00:30:00.000Z',
    });

    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      existing
    );
    (competitionTradeRunsRepo.extendTradeRunIfOpen as jest.Mock).mockResolvedValue(
      extended
    );
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityBefore: 120,
      quantityAfter: 70,
      deleted: false,
      record: { id: 'gold-row' },
    });
    (getSpotUsd as jest.Mock).mockResolvedValue({
      priceUsd: 112,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });

    const response = await request(app)
      .post('/api/daily-quest/trade/extend')
      .send({ runId: 'run-1' });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.tradeRun.closeAt).toBe('2099-01-01T00:30:00.000Z');
    expect(response.body.fee).toEqual({
      currency: 'Gold',
      amount: 50,
      newBalance: 70,
    });
    expect(competitionTradeRunsRepo.extendTradeRunIfOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trade-1',
        currentCloseAtIso: '2099-01-01T00:15:00.000Z',
        nextCloseAtIso: '2099-01-01T00:30:00.000Z',
      })
    );
    expect(inventoryRepo.decrementInventoryItem).toHaveBeenCalledWith(
      'player-1',
      'coin',
      'Gold',
      50,
      expect.any(Object)
    );
  });

  it('POST /trade/extend fails on insufficient Gold', async () => {
    const existing = makeTradeRun({
      competitionDate: '2099-01-01',
      closeAt: '2099-01-01T00:15:00.000Z',
    });
    const extended = makeTradeRun({
      competitionDate: '2099-01-01',
      closeAt: '2099-01-01T00:30:00.000Z',
    });

    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      existing
    );
    (competitionTradeRunsRepo.extendTradeRunIfOpen as jest.Mock).mockResolvedValue(
      extended
    );
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockImplementation(() => {
      throw new Error('Insufficient quantity to decrement inventory item');
    });

    const response = await request(app)
      .post('/api/daily-quest/trade/extend')
      .send({ runId: 'run-1' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Insufficient Gold');
  });

  it('POST /trade/extend fails near settlement deadline', async () => {
    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      makeTradeRun({
        competitionDate: '2099-01-01',
        closeAt: '2099-01-02T00:10:00.000Z',
      })
    );

    const response = await request(app)
      .post('/api/daily-quest/trade/extend')
      .send({ runId: 'run-1' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('can no longer be extended');
    expect(competitionTradeRunsRepo.extendTradeRunIfOpen).not.toHaveBeenCalled();
  });

  it('POST /trade/extend returns 409 when extension update no-ops and does not charge fee', async () => {
    const existing = makeTradeRun({
      competitionDate: '2099-01-01',
      closeAt: '2099-01-01T00:15:00.000Z',
    });

    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      existing
    );
    (competitionTradeRunsRepo.extendTradeRunIfOpen as jest.Mock).mockResolvedValue(null);
    (competitionTradeRunsRepo.getTradeRunById as jest.Mock).mockResolvedValue(existing);

    const response = await request(app)
      .post('/api/daily-quest/trade/extend')
      .send({ runId: 'run-1' });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('can no longer be extended');
    expect(response.body.closesAtUtc).toBe('2099-01-01T00:15:00.000Z');
    expect(inventoryRepo.decrementInventoryItem).not.toHaveBeenCalled();
    expect(getSpotUsd).not.toHaveBeenCalled();
  });

  it('POST /trade/close settles once, charges fee, and writes leaderboard', async () => {
    const unsettled = makeTradeRun();

    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      unsettled
    );
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockResolvedValue({
      ...unsettled,
      state: 'settled_manual',
      settleReason: 'manual',
      settlePriceUsd: 110,
      tradeMultiplier: 1.2,
      finalScore: 1800,
      settledAt: NOW_ISO,
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityBefore: 100,
      quantityAfter: 75,
      deleted: false,
      record: { id: 'gold-row' },
    });
    (dailyQuestLeaderboardRepo.upsertLeaderboardEntry as jest.Mock).mockResolvedValue({
      id: 'leaderboard-1',
    });

    const response = await request(app)
      .post('/api/daily-quest/trade/close')
      .send({ runId: 'run-1' });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alreadySettled).toBe(false);
    expect(response.body.fee).toEqual({
      currency: 'Gold',
      amount: 25,
      newBalance: 75,
    });
    expect(dailyQuestLeaderboardRepo.upsertLeaderboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-02-19',
        difficultyId: 'normal',
        accountId: 'player-1',
        rawScore: 1200,
        gotchiBonusMultiplier: 1.25,
        isRealGotchi: true,
      })
    );
  });

  it('POST /trade/stop remains a close alias', async () => {
    const unsettled = makeTradeRun();

    (competitionTradeRunsRepo.getTradeRunByRunIdAndAccount as jest.Mock).mockResolvedValue(
      unsettled
    );
    (sampleTwapUsd as jest.Mock).mockResolvedValue({
      priceUsd: 110,
      sampledAtMs: Date.parse(NOW_ISO),
      stale: false,
      oracleMeta: {},
    });
    (competitionTradeRunsRepo.settleTradeRunIfUnsettled as jest.Mock).mockResolvedValue({
      ...unsettled,
      state: 'settled_manual',
      settleReason: 'manual',
      settlePriceUsd: 110,
      tradeMultiplier: 1.2,
      finalScore: 1800,
      settledAt: NOW_ISO,
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityBefore: 100,
      quantityAfter: 75,
      deleted: false,
      record: { id: 'gold-row' },
    });
    (dailyQuestLeaderboardRepo.upsertLeaderboardEntry as jest.Mock).mockResolvedValue({
      id: 'leaderboard-1',
    });

    const response = await request(app)
      .post('/api/daily-quest/trade/stop')
      .send({ runId: 'run-1' });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alreadySettled).toBe(false);
    expect(competitionTradeRunsRepo.settleTradeRunIfUnsettled).toHaveBeenCalledTimes(1);
  });
});
