jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
}));

import { getPgPool } from '../../client';
import { getPlayerByWallet, upsertPlayerByWallet } from '../players';

const basePlayerRow = {
  id: 'player-1',
  wallet_address: '0xabc123',
  email_address: null,
  username: 'alice',
  region: 'us-east',
  last_seen: '2026-02-18T00:00:00.000Z',
  created_at: '2026-02-18T00:00:00.000Z',
  updated_at: '2026-02-18T00:00:00.000Z',
  is_banned: false,
  is_authorized: true,
  access_granted_at: '2026-02-18T00:00:00.000Z',
};

describe('players repo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes wallet lookups to lowercase', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [basePlayerRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await getPlayerByWallet(' 0xAbC123 ');

    expect(query).toHaveBeenCalledWith(
      'select * from players where wallet_address = $1 limit 1',
      ['0xabc123']
    );
    expect(result?.walletAddress).toBe('0xabc123');
  });

  it('creates authorized players on insert path', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [basePlayerRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await upsertPlayerByWallet({
      walletAddress: ' 0xAbC123 ',
      username: 'alice',
      region: 'us-east',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.players'),
      ['0xabc123', 'alice', 'us-east']
    );
    expect(result.isAuthorized).toBe(true);
    expect(result.accessGrantedAt).toBe('2026-02-18T00:00:00.000Z');
  });

  it('re-authorizes existing players on update path and preserves prior grant time', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...basePlayerRow,
            access_granted_at: '2026-02-01T00:00:00.000Z',
          },
        ],
      });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await upsertPlayerByWallet({
      walletAddress: '0xAbC123',
      username: null,
      region: null,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain('is_authorized = true');
    expect(query.mock.calls[1]?.[0]).toContain(
      'access_granted_at = coalesce(public.players.access_granted_at, now())'
    );
    expect(result.isAuthorized).toBe(true);
    expect(result.accessGrantedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('throws when neither insert nor update returns a row', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    await expect(
      upsertPlayerByWallet({
        walletAddress: '0xabc123',
      })
    ).rejects.toThrow('Failed to upsert player record');
  });
});
