import express, { type Application } from 'express';
import request from 'supertest';

jest.mock('../../lib/db', () => ({
  cronExecutionsRepo: {
    createExecution: jest.fn(),
    completeExecution: jest.fn(),
  },
}));

jest.mock('../../jobs/distribute-daily-quest-prizes', () => ({
  runPrizeDistributionJob: jest.fn(),
  sendPrizeDistributionDiscordNotification: jest.fn(),
}));

jest.mock('../../jobs/send-daily-discord-summary', () => ({
  runDailySummaryJob: jest.fn(),
}));

jest.mock('../../jobs/capture-daily-gotchi-snapshot', () => ({
  captureDailyGotchiSnapshot: jest.fn(),
}));

import { registerInternalCronRoutes } from '../internal-cron';
import { cronExecutionsRepo } from '../../lib/db';
import { captureDailyGotchiSnapshot } from '../../jobs/capture-daily-gotchi-snapshot';

describe('internal cron routes', () => {
  const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';

    app = express();
    app.use(express.json());
    registerInternalCronRoutes(app);
  });

  afterAll(() => {
    if (ORIGINAL_CRON_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
  });

  it('rejects requests without cron auth header', async () => {
    const response = await request(app).post('/api/internal/daily-gotchi-snapshot');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing authorization header' });
    expect(cronExecutionsRepo.createExecution).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid cron secret', async () => {
    const response = await request(app)
      .post('/api/internal/daily-gotchi-snapshot')
      .set('Authorization', 'Bearer wrong-secret');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Invalid cron secret' });
    expect(cronExecutionsRepo.createExecution).not.toHaveBeenCalled();
  });

  it('records success execution for daily gotchi snapshot job', async () => {
    (cronExecutionsRepo.createExecution as jest.Mock).mockResolvedValue({
      id: 'exec-1',
    });
    (captureDailyGotchiSnapshot as jest.Mock).mockResolvedValue({
      date: '2026-02-18',
      blockNumber: 301,
      baseHeadBlock: 305,
      subgraphHeadBlock: 301,
    });

    const response = await request(app)
      .post('/api/internal/daily-gotchi-snapshot')
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ date: '2026-02-18' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      executionId: 'exec-1',
      result: {
        date: '2026-02-18',
        blockNumber: 301,
        baseHeadBlock: 305,
        subgraphHeadBlock: 301,
      },
    });

    expect(cronExecutionsRepo.createExecution).toHaveBeenCalledWith({
      jobName: 'daily_gotchi_snapshot',
      targetDate: '2026-02-18',
    });
    expect(cronExecutionsRepo.completeExecution).toHaveBeenCalledWith({
      id: 'exec-1',
      success: true,
      resultJson: {
        date: '2026-02-18',
        blockNumber: 301,
        baseHeadBlock: 305,
        subgraphHeadBlock: 301,
      },
    });
  });

  it('records failed execution when snapshot capture throws', async () => {
    (cronExecutionsRepo.createExecution as jest.Mock).mockResolvedValue({
      id: 'exec-2',
    });
    (captureDailyGotchiSnapshot as jest.Mock).mockRejectedValue(
      new Error('snapshot failure')
    );

    const response = await request(app)
      .post('/api/internal/daily-gotchi-snapshot')
      .set('Authorization', 'Bearer test-cron-secret')
      .send({ date: '2026-02-18' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      ok: false,
      executionId: 'exec-2',
      error: 'snapshot failure',
    });

    expect(cronExecutionsRepo.completeExecution).toHaveBeenCalledWith({
      id: 'exec-2',
      success: false,
      errorMessage: 'snapshot failure',
      errors: ['snapshot failure'],
    });
  });
});
