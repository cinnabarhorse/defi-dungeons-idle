jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../capture-daily-gotchi-snapshot', () => ({
  captureDailyGotchiSnapshot: jest.fn(),
}));

import cron from 'node-cron';
import { captureDailyGotchiSnapshot } from '../capture-daily-gotchi-snapshot';
import { startDailyGotchiSnapshotCron } from '../daily-gotchi-snapshot-cron';

describe('startDailyGotchiSnapshotCron', () => {
  const originalSchedule = process.env.DAILY_GOTCHI_SNAPSHOT_CRON;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DAILY_GOTCHI_SNAPSHOT_CRON;
  });

  afterAll(() => {
    if (originalSchedule === undefined) {
      delete process.env.DAILY_GOTCHI_SNAPSHOT_CRON;
    } else {
      process.env.DAILY_GOTCHI_SNAPSHOT_CRON = originalSchedule;
    }
  });

  it('registers a UTC daily schedule that captures the snapshot', async () => {
    let scheduledHandler: (() => Promise<void>) | undefined;
    (cron.schedule as jest.Mock).mockImplementation(
      (_expression: string, handler: () => Promise<void>) => {
        scheduledHandler = handler;
        return { stop: jest.fn() };
      }
    );
    (captureDailyGotchiSnapshot as jest.Mock).mockResolvedValue({
      date: '2026-02-18',
      blockNumber: 123,
      baseHeadBlock: 124,
      subgraphHeadBlock: 123,
    });

    startDailyGotchiSnapshotCron();

    expect(cron.schedule).toHaveBeenCalledWith(
      '0 0 * * *',
      expect.any(Function),
      expect.objectContaining({
        timezone: 'UTC',
        noOverlap: true,
      })
    );

    await scheduledHandler?.();

    expect(captureDailyGotchiSnapshot).toHaveBeenCalledTimes(1);
  });
});
