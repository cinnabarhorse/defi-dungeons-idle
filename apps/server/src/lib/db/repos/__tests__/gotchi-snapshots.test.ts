jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
}));

import { getPgPool } from '../../client';
import {
  getByDate,
  getLatestOnOrBeforeDate,
  upsertForDate,
} from '../gotchi-snapshots';

describe('gotchi-snapshots repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getByDate returns null when no snapshot exists', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const snapshot = await getByDate('2026-02-18');

    expect(snapshot).toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('from public.daily_gotchi_ownership_snapshots'),
      ['2026-02-18']
    );
  });

  it('getByDate maps row fields to camelCase record', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          snapshot_date: '2026-02-18',
          block_number: '123456',
          captured_at: '2026-02-18T00:00:00.000Z',
        },
      ],
    });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const snapshot = await getByDate('2026-02-18');

    expect(snapshot).toEqual({
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
  });

  it('getLatestOnOrBeforeDate returns the latest snapshot on or before the target date', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          snapshot_date: '2026-02-17',
          block_number: '123000',
          captured_at: '2026-02-17T00:00:00.000Z',
        },
      ],
    });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const snapshot = await getLatestOnOrBeforeDate('2026-02-18');

    expect(snapshot).toEqual({
      snapshotDate: '2026-02-17',
      blockNumber: 123000,
      capturedAt: '2026-02-17T00:00:00.000Z',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('where snapshot_date <= $1::date'),
      ['2026-02-18']
    );
  });

  it('upsertForDate writes and returns normalized snapshot row', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          snapshot_date: '2026-02-18',
          block_number: 654321,
          captured_at: '2026-02-18T00:00:30.000Z',
        },
      ],
    });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await upsertForDate('2026-02-18', 654321.8);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.daily_gotchi_ownership_snapshots'),
      ['2026-02-18', 654321]
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      'on conflict (snapshot_date) do nothing'
    );
    expect(result).toEqual({
      snapshotDate: '2026-02-18',
      blockNumber: 654321,
      capturedAt: '2026-02-18T00:00:30.000Z',
    });
  });

  it('upsertForDate keeps the original block when row already exists', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          snapshot_date: '2026-02-18',
          block_number: 111111,
          captured_at: '2026-02-18T00:00:00.000Z',
        },
      ],
    });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await upsertForDate('2026-02-18', 222222);

    expect(result).toEqual({
      snapshotDate: '2026-02-18',
      blockNumber: 111111,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
  });
});
