import request from 'supertest';
import express, { type Application } from 'express';
import { registerStatsRoutes } from '../stats';

jest.mock('../../lib/db', () => ({
  statsRepo: {
    getGoldSpendEvents: jest.fn(),
    getRepairItemsPerDay: jest.fn(),
    getRepairGoldSpentPerDay: jest.fn(),
    getGoldTotalPerDay: jest.fn(),
    getForgeCountsPerDayByRarity: jest.fn(),
    getForgeGoldSpentPerDay: jest.fn(),
  },
}));

import { statsRepo } from '../../lib/db';

describe('GET /api/stats/gold-spent-breakdown', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerStatsRoutes(app);
    jest.clearAllMocks();
  });

  it('returns day-by-day item totals with overall totals', async () => {
    (statsRepo.getGoldSpendEvents as jest.Mock).mockResolvedValue([
      {
        day: '2026-02-01',
        delta: -10,
        metadata: {
          items: [
            {
              itemId: 'health_potion',
              itemName: 'Health Potion',
              quantity: 2,
              total: 10,
            },
          ],
        },
      },
      {
        day: '2026-02-01',
        delta: -5,
        metadata: {},
      },
      {
        day: '2026-02-02',
        delta: -20,
        metadata: {
          items: [
            {
              itemId: 'mana_potion',
              itemName: 'Mana Potion',
              quantity: 4,
              total: 20,
            },
          ],
        },
      },
    ]);

    const response = await request(app).get('/api/stats/gold-spent-breakdown').query({
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-02T23:59:59.999Z',
    });

    expect(response.status).toBe(200);
    expect(statsRepo.getGoldSpendEvents).toHaveBeenCalledWith({
      fromIso: '2026-02-01T00:00:00.000Z',
      toIso: '2026-02-02T23:59:59.999Z',
    });

    expect(response.body.total).toBe(35);
    expect(response.body.unknown).toBe(5);
    expect(response.body.items).toEqual([
      {
        itemId: 'mana_potion',
        itemName: 'Mana Potion',
        total: 20,
        quantity: 4,
      },
      {
        itemId: 'health_potion',
        itemName: 'Health Potion',
        total: 10,
        quantity: 2,
      },
    ]);
    expect(response.body.days).toEqual([
      {
        day: '2026-02-01',
        total: 15,
        unknown: 5,
        items: [
          {
            itemId: 'health_potion',
            itemName: 'Health Potion',
            total: 10,
            quantity: 2,
          },
        ],
      },
      {
        day: '2026-02-02',
        total: 20,
        unknown: 0,
        items: [
          {
            itemId: 'mana_potion',
            itemName: 'Mana Potion',
            total: 20,
            quantity: 4,
          },
        ],
      },
    ]);
  });

  it('returns daily forge counts broken down by rarity', async () => {
    (statsRepo.getForgeCountsPerDayByRarity as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-24',
        common: 1,
        uncommon: 2,
        rare: 3,
        legendary: 4,
        mythical: 5,
        godlike: 6,
      },
    ]);

    const response = await request(app).get('/api/stats/forge-counts-per-day-by-rarity').query({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-24T23:59:59.999Z',
    });

    expect(response.status).toBe(200);
    expect(statsRepo.getForgeCountsPerDayByRarity).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-24T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-24',
        common: 1,
        uncommon: 2,
        rare: 3,
        legendary: 4,
        mythical: 5,
        godlike: 6,
      },
    ]);
  });

  it('returns daily forge gold spent', async () => {
    (statsRepo.getForgeGoldSpentPerDay as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-24',
        count: 1234,
      },
    ]);

    const response = await request(app).get('/api/stats/forge-gold-spent-per-day').query({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-24T23:59:59.999Z',
    });

    expect(response.status).toBe(200);
    expect(statsRepo.getForgeGoldSpentPerDay).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-24T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-24',
        count: 1234,
      },
    ]);
  });

  it('returns gold total per day from the repo', async () => {
    (statsRepo.getGoldTotalPerDay as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-24',
        total: 9876,
      },
    ]);

    const response = await request(app).get('/api/stats/gold-total-per-day').query({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-24T23:59:59.999Z',
    });

    expect(response.status).toBe(200);
    expect(statsRepo.getGoldTotalPerDay).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-24T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-24',
        count: 9876,
      },
    ]);
  });

  it('returns daily forge gold spent from the repo', async () => {
    (statsRepo.getForgeGoldSpentPerDay as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-24',
        count: 800,
      },
    ]);

    const response = await request(app)
      .get('/api/stats/forge-gold-spent-per-day')
      .query({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-24T23:59:59.999Z',
      });

    expect(response.status).toBe(200);
    expect(statsRepo.getForgeGoldSpentPerDay).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-24T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-24',
        count: 800,
      },
    ]);
  });

  it('returns daily forge counts broken down by rarity from the repo', async () => {
    (statsRepo.getForgeCountsPerDayByRarity as jest.Mock).mockResolvedValue([
      {
        day: '2026-03-24',
        common: 1,
        uncommon: 0,
        rare: 2,
        legendary: 3,
        mythical: 0,
        godlike: 1,
      },
    ]);

    const response = await request(app)
      .get('/api/stats/forge-counts-per-day-by-rarity')
      .query({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-24T23:59:59.999Z',
      });

    expect(response.status).toBe(200);
    expect(statsRepo.getForgeCountsPerDayByRarity).toHaveBeenCalledWith({
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-24T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      {
        day: '2026-03-24',
        common: 1,
        uncommon: 0,
        rare: 2,
        legendary: 3,
        mythical: 0,
        godlike: 1,
      },
    ]);
  });
});

describe('GET /api/stats/*repair*', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerStatsRoutes(app);
    jest.clearAllMocks();
  });

  it('returns items repaired per day', async () => {
    (statsRepo.getRepairItemsPerDay as jest.Mock).mockResolvedValue([
      { day: '2026-02-01', count: 3 },
      { day: '2026-02-02', count: 1 },
    ]);

    const response = await request(app).get('/api/stats/items-repaired-per-day').query({
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-02-02T23:59:59.999Z',
    });

    expect(response.status).toBe(200);
    expect(statsRepo.getRepairItemsPerDay).toHaveBeenCalledWith({
      fromIso: '2026-02-01T00:00:00.000Z',
      toIso: '2026-02-02T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      { day: '2026-02-01', count: 3 },
      { day: '2026-02-02', count: 1 },
    ]);
  });

  it('returns repair gold spent per day', async () => {
    (statsRepo.getRepairGoldSpentPerDay as jest.Mock).mockResolvedValue([
      { day: '2026-02-01', count: 120 },
      { day: '2026-02-02', count: 40 },
    ]);

    const response = await request(app)
      .get('/api/stats/gold-spent-on-repairs-per-day')
      .query({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-02-02T23:59:59.999Z',
      });

    expect(response.status).toBe(200);
    expect(statsRepo.getRepairGoldSpentPerDay).toHaveBeenCalledWith({
      fromIso: '2026-02-01T00:00:00.000Z',
      toIso: '2026-02-02T23:59:59.999Z',
    });
    expect(response.body.series).toEqual([
      { day: '2026-02-01', count: 120 },
      { day: '2026-02-02', count: 40 },
    ]);
  });
});
