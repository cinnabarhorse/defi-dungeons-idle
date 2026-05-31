jest.mock('../db', () => ({
  gotchiSnapshotsRepo: {
    getByDate: jest.fn(),
    getLatestOnOrBeforeDate: jest.fn(),
  },
}));

jest.mock('../../jobs/capture-daily-gotchi-snapshot', () => ({
  captureDailyGotchiSnapshot: jest.fn(),
}));

import { gotchiSnapshotsRepo } from '../db';
import { captureDailyGotchiSnapshot } from '../../jobs/capture-daily-gotchi-snapshot';
import {
  getTodaySnapshotBlockOrNull,
  getTodayUtcDateString,
} from '../gotchi-snapshot';

describe('gotchi snapshot helpers', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (captureDailyGotchiSnapshot as jest.Mock).mockRejectedValue(
      new Error('capture unavailable')
    );
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('getTodayUtcDateString returns YYYY-MM-DD in UTC', () => {
    const date = getTodayUtcDateString(Date.parse('2026-02-18T23:59:59.999Z'));
    expect(date).toBe('2026-02-18');
  });

  it('getTodaySnapshotBlockOrNull returns block when snapshot exists', async () => {
    (gotchiSnapshotsRepo.getByDate as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 12345,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });

    const block = await getTodaySnapshotBlockOrNull(
      Date.parse('2026-02-18T01:00:00.000Z')
    );

    expect(block).toBe(12345);
    expect(gotchiSnapshotsRepo.getByDate).toHaveBeenCalledWith('2026-02-18');
  });

  it('getTodaySnapshotBlockOrNull returns null when snapshot is missing', async () => {
    (gotchiSnapshotsRepo.getByDate as jest.Mock).mockResolvedValue(null);

    const block = await getTodaySnapshotBlockOrNull(
      Date.parse('2026-02-18T01:00:00.000Z')
    );

    expect(block).toBeNull();
  });

  it('getTodaySnapshotBlockOrNull captures today snapshot on demand when cron missed it', async () => {
    (gotchiSnapshotsRepo.getByDate as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        snapshotDate: '2026-02-18',
        blockNumber: 54321,
        capturedAt: '2026-02-18T00:00:10.000Z',
      });
    (captureDailyGotchiSnapshot as jest.Mock).mockResolvedValue({
      date: '2026-02-18',
      blockNumber: 54321,
      baseHeadBlock: 54330,
      subgraphHeadBlock: 54321,
    });

    const block = await getTodaySnapshotBlockOrNull(
      Date.parse('2026-02-18T01:00:00.000Z')
    );

    expect(block).toBe(54321);
    expect(captureDailyGotchiSnapshot).toHaveBeenCalledWith({
      date: '2026-02-18',
    });
  });

  it('getTodaySnapshotBlockOrNull falls back to the previous snapshot when todays capture fails', async () => {
    (gotchiSnapshotsRepo.getByDate as jest.Mock).mockResolvedValue(null);
    (gotchiSnapshotsRepo.getLatestOnOrBeforeDate as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-17',
      blockNumber: 43210,
      capturedAt: '2026-02-17T00:00:00.000Z',
    });

    const block = await getTodaySnapshotBlockOrNull(
      Date.parse('2026-02-18T01:00:00.000Z')
    );

    expect(block).toBe(43210);
    expect(captureDailyGotchiSnapshot).toHaveBeenCalledWith({
      date: '2026-02-18',
    });
    expect(gotchiSnapshotsRepo.getLatestOnOrBeforeDate).toHaveBeenCalledWith(
      '2026-02-18'
    );
  });
});
