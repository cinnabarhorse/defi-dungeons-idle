import { getPgPool } from '../../client';
import {
  createApiKey,
  getActiveApiKeyByHash,
  getActiveApiKeyCount,
  incrementRoomJoinCount,
  listApiKeysByPlayer,
  recordAuthSuccess,
  revokeApiKey,
} from '../api-keys';

jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
}));

const baseRow = {
  id: 'key-1',
  player_id: 'player-1',
  name: 'bot',
  key_hash: 'hash-1',
  key_prefix: 'ddk_live_1234567890',
  created_at: '2026-02-21T00:00:00.000Z',
  revoked_at: null,
  revoked_reason: null,
  auth_success_count: '2',
  room_join_count: '3',
  last_used_at: '2026-02-21T00:05:00.000Z',
  last_used_ip: '127.0.0.1',
  last_used_user_agent: 'jest',
};

describe('api-keys repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and maps records', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [baseRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const created = await createApiKey({
      playerId: 'player-1',
      name: 'bot',
      keyHash: 'hash-1',
      keyPrefix: 'ddk_live_1234567890',
    });

    expect(created.playerId).toBe('player-1');
    expect(created.authSuccessCount).toBe(2);
    expect(created.roomJoinCount).toBe(3);
  });

  it('lists by player with counters', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [baseRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const rows = await listApiKeysByPlayer('player-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].keyPrefix).toBe('ddk_live_1234567890');
  });

  it('returns active count', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ count: '5' }] });
    (getPgPool as jest.Mock).mockReturnValue({ query });
    await expect(getActiveApiKeyCount('player-1')).resolves.toBe(5);
  });

  it('updates auth success and join counters', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [baseRow] })
      .mockResolvedValueOnce({ rows: [baseRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    await recordAuthSuccess('key-1', { ip: '127.0.0.1', userAgent: 'ua' });
    await incrementRoomJoinCount('key-1');

    expect(query).toHaveBeenCalledTimes(2);
  });

  it('resolves active key by hash and revokes', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [baseRow] })
      .mockResolvedValueOnce({ rows: [baseRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const key = await getActiveApiKeyByHash('hash-1');
    const revoked = await revokeApiKey('key-1', 'player-1', 'owner');

    expect(key?.id).toBe('key-1');
    expect(revoked?.id).toBe('key-1');
  });
});
