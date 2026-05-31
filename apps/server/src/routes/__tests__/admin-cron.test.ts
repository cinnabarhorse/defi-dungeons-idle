import request from 'supertest';
import express, { type Application } from 'express';
import { registerAdminCronRoutes } from '../admin-cron';

jest.mock('../admin-auth', () => ({
  requireAdminSession: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  cronExecutionsRepo: {
    listExecutions: jest.fn(),
    getExecutionById: jest.fn(),
    getExecutionStats: jest.fn(),
    getLatestExecution: jest.fn(),
    createExecution: jest.fn(),
    completeExecution: jest.fn(),
  },
  dailyQuestLeaderboardRepo: {
    hasDistributedPrizesForDate: jest.fn(),
  },
}));

jest.mock('../../jobs/distribute-daily-quest-prizes', () => ({
  runPrizeDistributionJob: jest.fn(),
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  getCompetitionDate: jest.fn(),
}));

import { requireAdminSession } from '../admin-auth';
import {
  cronExecutionsRepo,
  dailyQuestLeaderboardRepo,
} from '../../lib/db';
import { runPrizeDistributionJob } from '../../jobs/distribute-daily-quest-prizes';
import { getCompetitionDate } from '../../lib/daily-quest-competition';

describe('admin cron routes', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerAdminCronRoutes(app);

    jest.clearAllMocks();

    (requireAdminSession as jest.Mock).mockResolvedValue({
      address: '0xabc123',
      playerId: null,
    });
  });

  it('GET /api/admin/cron/executions parses and clamps query params', async () => {
    (cronExecutionsRepo.listExecutions as jest.Mock).mockResolvedValue([]);

    const response = await request(app).get(
      '/api/admin/cron/executions?jobName=my_job&status=success&limit=999&offset=-5'
    );

    expect(response.status).toBe(200);
    expect(cronExecutionsRepo.listExecutions).toHaveBeenCalledWith({
      jobName: 'my_job',
      status: 'success',
      limit: 200,
      offset: 0,
    });
  });

  it('GET /api/admin/cron/check-distribution defaults date via getCompetitionDate when missing', async () => {
    (getCompetitionDate as jest.Mock).mockReturnValue('2026-01-27');
    (dailyQuestLeaderboardRepo.hasDistributedPrizesForDate as jest.Mock).mockResolvedValue(
      true
    );

    const response = await request(app).get('/api/admin/cron/check-distribution');

    expect(response.status).toBe(200);
    expect(dailyQuestLeaderboardRepo.hasDistributedPrizesForDate).toHaveBeenCalledWith(
      '2026-01-27'
    );
    expect(response.body).toEqual({
      date: '2026-01-27',
      alreadyDistributed: true,
    });
  });

  it('POST /api/admin/cron/trigger-distribution records failure when job throws', async () => {
    (cronExecutionsRepo.createExecution as jest.Mock).mockResolvedValue({ id: 'exec-1' });
    (runPrizeDistributionJob as jest.Mock).mockRejectedValue(new Error('boom'));

    const response = await request(app)
      .post('/api/admin/cron/trigger-distribution')
      .send({ date: '2026-01-27', dryRun: true });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      ok: false,
      executionId: 'exec-1',
      error: 'boom',
    });

    expect(cronExecutionsRepo.completeExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'exec-1',
        success: false,
        errorMessage: 'boom',
        errors: ['boom'],
      })
    );
  });
});
