import request from 'supertest';
import express, { type Application } from 'express';
import { registerStatsRoutes } from '../stats';

jest.mock('../../lib/db', () => ({
  statsRepo: {
    getTradeRunTokensPerDay: jest.fn(),
    getTradeRunDirectionsPerDay: jest.fn(),
    getTradeRunLeveragePerDay: jest.fn(),
  },
}));

import { statsRepo } from '../../lib/db';

describe('GET /api/stats/trade-run-*', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerStatsRoutes(app);
    jest.clearAllMocks();
  });

  it('returns daily token usage for trade runs', async () => {
    (statsRepo.getTradeRunTokensPerDay as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-20',
        btc: 4,
        eth: 2,
        ghst: 1,
      },
    ]);

    const response = await request(app)
      .get('/api/stats/trade-run-tokens-per-day')
      .query({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T23:59:59.999Z',
      });

    expect(response.status).toBe(200);
    expect(statsRepo.getTradeRunTokensPerDay).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-20T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-20',
        btc: 4,
        eth: 2,
        ghst: 1,
      },
    ]);
  });

  it('returns daily long-vs-short usage for trade runs', async () => {
    (statsRepo.getTradeRunDirectionsPerDay as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-20',
        long: 5,
        short: 3,
      },
    ]);

    const response = await request(app)
      .get('/api/stats/trade-run-directions-per-day')
      .query({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T23:59:59.999Z',
      });

    expect(response.status).toBe(200);
    expect(statsRepo.getTradeRunDirectionsPerDay).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-20T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-20',
        long: 5,
        short: 3,
      },
    ]);
  });

  it('returns daily leverage usage for trade runs', async () => {
    (statsRepo.getTradeRunLeveragePerDay as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-20',
        leverageCounts: [
          { leverage: 1, count: 1 },
          { leverage: 5, count: 3 },
          { leverage: 10, count: 2 },
        ],
      },
    ]);

    const response = await request(app)
      .get('/api/stats/trade-run-leverage-per-day')
      .query({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-20T23:59:59.999Z',
      });

    expect(response.status).toBe(200);
    expect(statsRepo.getTradeRunLeveragePerDay).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-20T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-20',
        leverageCounts: [
          { leverage: 1, count: 1 },
          { leverage: 5, count: 3 },
          { leverage: 10, count: 2 },
        ],
      },
    ]);
  });
});
