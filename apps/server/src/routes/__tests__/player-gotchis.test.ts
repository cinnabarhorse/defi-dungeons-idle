import express, { type Application } from 'express';
import request from 'supertest';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/aavegotchi', () => ({
  fetchAavegotchisOfOwnerAtBlock: jest.fn(),
}));

jest.mock('../../lib/gotchi-normalize', () => ({
  normalizeMany: jest.fn((value) => value),
}));

jest.mock('../../lib/gotchi-sprites', () => ({
  generateMany: jest.fn(),
  getExistingSpriteInfo: jest.fn(),
}));

jest.mock('../../lib/gotchi-snapshot', () => ({
  getTodayUtcDateString: jest.fn(() => '2026-02-18'),
  getTodaySnapshotOrCapture: jest.fn(),
}));

jest.mock('../../lib/gotchi-auth-eligibility', () => ({
  buildSnapshotMissingError: jest.fn((date: string) => ({
    code: 'SNAPSHOT_MISSING',
    error: 'Daily gotchi ownership snapshot missing',
    date,
  })),
}));

jest.mock('../../lib/http-logging', () => ({
  logError: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { fetchAavegotchisOfOwnerAtBlock } from '../../lib/aavegotchi';
import { normalizeMany } from '../../lib/gotchi-normalize';
import { generateMany, getExistingSpriteInfo } from '../../lib/gotchi-sprites';
import { getTodaySnapshotOrCapture } from '../../lib/gotchi-snapshot';
import { registerPlayerGotchiRoutes } from '../player-gotchis';

describe('player gotchi snapshot routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    registerPlayerGotchiRoutes(app);

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      address: '0xabc',
      playerId: 'player-1',
      authMethod: 'session_cookie',
    });
  });

  it('returns snapshot-missing error from /api/aavegotchis', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue(null);

    const response = await request(app).get('/api/aavegotchis');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: 'SNAPSHOT_MISSING',
      error: 'Daily gotchi ownership snapshot missing',
      date: '2026-02-18',
    });
    expect(fetchAavegotchisOfOwnerAtBlock).not.toHaveBeenCalled();
  });

  it('queries /api/aavegotchis at the stored snapshot block', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (fetchAavegotchisOfOwnerAtBlock as jest.Mock).mockResolvedValue([
      { id: '6741', name: 'Achi', equippedWearables: [] },
    ]);

    const response = await request(app).get('/api/aavegotchis');

    expect(response.status).toBe(200);
    expect(fetchAavegotchisOfOwnerAtBlock).toHaveBeenCalledWith(
      '0xabc',
      123456
    );
    expect(response.body).toEqual({
      owner: '0xabc',
      aavegotchis: [{ id: '6741', name: 'Achi', equippedWearables: [] }],
    });
  });

  it('generates sprites from the snapshot-scoped gotchi list', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (fetchAavegotchisOfOwnerAtBlock as jest.Mock).mockResolvedValue([
      { id: '6741', name: 'Achi', equippedWearables: [] },
    ]);
    (normalizeMany as jest.Mock).mockReturnValue([{ id: 6741 }]);
    (generateMany as jest.Mock).mockResolvedValue([
      { id: 6741, url: 'https://sprite.invalid/6741.png', hash: 'hash-1' },
    ]);

    const response = await request(app).post('/api/gotchis/generate');

    expect(response.status).toBe(200);
    expect(fetchAavegotchisOfOwnerAtBlock).toHaveBeenCalledWith(
      '0xabc',
      123456
    );
    expect(generateMany).toHaveBeenCalledWith([{ id: 6741 }]);
    expect(response.body).toEqual({
      wallet: '0xabc',
      sprites: [
        {
          id: 6741,
          url: 'https://sprite.invalid/6741.png',
          hash: 'hash-1',
        },
      ],
    });
  });

  it('lists only existing sprites from the snapshot-scoped gotchi list', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (fetchAavegotchisOfOwnerAtBlock as jest.Mock).mockResolvedValue([
      { id: 6741, name: 'Achi', equippedWearables: [] },
      { id: 6742, name: 'Bchi', equippedWearables: [] },
    ]);
    (normalizeMany as jest.Mock).mockReturnValue([{ id: 6741 }, { id: 6742 }]);
    (getExistingSpriteInfo as jest.Mock)
      .mockResolvedValueOnce({
        id: 6741,
        url: 'https://sprite.invalid/6741.png',
        hash: 'hash-1',
      })
      .mockResolvedValueOnce(null);

    const response = await request(app).get('/api/gotchis');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      wallet: '0xabc',
      sprites: [
        {
          id: 6741,
          url: 'https://sprite.invalid/6741.png',
          hash: 'hash-1',
        },
      ],
    });
  });
});
