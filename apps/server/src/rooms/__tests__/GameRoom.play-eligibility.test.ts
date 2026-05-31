jest.mock('../../lib/gotchi-auth-eligibility', () => ({
  assertWalletCanPlayTodaySnapshot: jest.fn(),
}));

import { GameRoom } from '../GameRoom';
import { assertWalletCanPlayTodaySnapshot } from '../../lib/gotchi-auth-eligibility';

describe('GameRoom play eligibility gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects run join when wallet cannot play today', async () => {
    (assertWalletCanPlayTodaySnapshot as jest.Mock).mockRejectedValue(
      new Error('Wallet is not eligible for today')
    );

    const room = {
      state: { id: 'room-1' },
      isAdminOnly: false,
      getCurrentClientCount: jest.fn(() => 1),
      maxClients: 4,
      stagingEnabled: false,
      phase: 'lobby',
    };

    const client = {
      sessionId: 'session-1',
      auth: {
        playerId: 'player-1',
        address: '0xabc',
        isAuthorized: true,
      },
    };

    await expect(
      GameRoom.prototype.onJoin.call(room as any, client as any, {})
    ).rejects.toThrow('Wallet is not eligible for today');

    expect(assertWalletCanPlayTodaySnapshot).toHaveBeenCalledWith('0xabc');
  });
});
