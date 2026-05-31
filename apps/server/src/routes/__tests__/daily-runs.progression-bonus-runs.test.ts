import request from 'supertest';
import express, { type Application } from 'express';
import { registerDailyRunRoutes } from '../daily-runs';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  depositsRepo: {
    getStakedUnlockBalances: jest.fn(),
    getStakedTokenBalances: jest.fn(),
  },
  playerDailyRunsRepo: {
    getDailyRunUsage: jest.fn(),
  },
  playerDailyRunBonusRepo: {
    getBonusRuns: jest.fn(),
  },
  dailyQuestLeaderboardRepo: {},
}));

jest.mock('../../lib/daily-runs', () => ({
  getDailyRunsConfig: jest.fn(() => ({
    enabled: true,
    resetTimeUtcHour: 0,
    tiers: [{ usdcStakedGte: 0, dailyRuns: 10 }],
  })),
  getDailyRunsDate: jest.fn(() => '2026-02-15'),
  getDailyRunsResetAt: jest.fn(() => '2026-02-16T00:00:00.000Z'),
  getDailyRunAllowance: jest.fn(() => 10),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { depositsRepo, playerDailyRunsRepo, playerDailyRunBonusRepo } from '../../lib/db';

describe('GET /api/player/daily-runs (progression bonus runs)', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    registerDailyRunRoutes(app);
    jest.clearAllMocks();

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: 'player-1',
      address: '0xabc',
    });

    (depositsRepo.getStakedUnlockBalances as jest.Mock).mockResolvedValue({
      usdc: 0,
      gho: 0,
      total: 0,
    });
    (depositsRepo.getStakedTokenBalances as jest.Mock).mockResolvedValue({
      GHST: 0,
    });
    (playerDailyRunsRepo.getDailyRunUsage as jest.Mock).mockResolvedValue(10);
    (playerDailyRunBonusRepo.getBonusRuns as jest.Mock).mockResolvedValue(1);
  });

  it('adds progression bonus runs to today’s allowedRuns/remainingRuns', async () => {
    const response = await request(app).get('/api/player/daily-runs');

    expect(response.status).toBe(200);
    expect(playerDailyRunBonusRepo.getBonusRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'player-1',
        date: '2026-02-15',
        mode: 'progression',
      })
    );
    expect(response.body.allowedRuns).toBe(11);
    expect(response.body.usedRuns).toBe(10);
    expect(response.body.remainingRuns).toBe(1);
  });
});
