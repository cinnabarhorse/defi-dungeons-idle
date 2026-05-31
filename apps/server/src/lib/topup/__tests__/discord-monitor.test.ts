import { depositsRepo } from '../../db';
import {
  claimDepositDiscordNotification,
  getGlobalStakedUnlockBalances,
  releaseDepositDiscordNotificationClaim,
} from '../../db/repos/deposits';
import { notifyUsdcTopupFromDeposit } from '../discord';
import {
  pollUsdcTopupDiscordMonitorOnce,
  resetUsdcTopupDiscordMonitorForTests,
} from '../discord-monitor';

jest.mock('../../db', () => ({
  depositsRepo: {
    listRecentCreditedUsdcDeposits: jest.fn(),
  },
}));

jest.mock('../../db/repos/deposits', () => ({
  claimDepositDiscordNotification: jest.fn(),
  getGlobalStakedUnlockBalances: jest.fn(),
  releaseDepositDiscordNotificationClaim: jest.fn(),
}));

jest.mock('../discord', () => ({
  notifyUsdcTopupFromDeposit: jest.fn(),
}));

jest.mock('../../logging', () => ({
  getBaseLogger: () => ({
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}));

describe('usdc topup discord monitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetUsdcTopupDiscordMonitorForTests();
    (getGlobalStakedUnlockBalances as jest.Mock).mockResolvedValue({
      usdc: 4116,
      gho: 397,
      total: 4513,
    });
    (notifyUsdcTopupFromDeposit as jest.Mock).mockResolvedValue(undefined);
    (claimDepositDiscordNotification as jest.Mock).mockResolvedValue({
      claimedIds: ['deposit-1'],
      shouldNotify: true,
    });
    (releaseDepositDiscordNotificationClaim as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  afterEach(() => {
    resetUsdcTopupDiscordMonitorForTests();
  });

  it('sends one Discord message per transaction hash', async () => {
    (depositsRepo.listRecentCreditedUsdcDeposits as jest.Mock).mockResolvedValue(
      [
        {
          id: 'deposit-1',
          userId: 'player-1',
          depositorAddress: '0xabc',
          amount: '1',
          tokenSymbol: 'USDC',
          txHash: '0x' + 'a'.repeat(64),
          createdAt: '2026-02-06T13:46:00.000Z',
          updatedAt: '2026-02-06T13:46:00.000Z',
        },
        {
          id: 'deposit-2',
          userId: 'player-1',
          depositorAddress: '0xabc',
          amount: '1',
          tokenSymbol: 'USDC',
          txHash: '0x' + 'a'.repeat(64),
          createdAt: '2026-02-06T13:46:01.000Z',
          updatedAt: '2026-02-06T13:46:01.000Z',
        },
      ]
    );

    await pollUsdcTopupDiscordMonitorOnce();

    expect(notifyUsdcTopupFromDeposit).toHaveBeenCalledTimes(1);
    expect(claimDepositDiscordNotification).toHaveBeenCalledTimes(1);
  });

  it('does not send when tx hash was already notified by another worker', async () => {
    (depositsRepo.listRecentCreditedUsdcDeposits as jest.Mock).mockResolvedValue(
      [
        {
          id: 'deposit-3',
          userId: 'player-2',
          depositorAddress: '0xdef',
          amount: '1000',
          tokenSymbol: 'GHST',
          txHash: '0x' + 'b'.repeat(64),
          createdAt: '2026-02-06T21:57:00.000Z',
          updatedAt: '2026-02-06T21:57:00.000Z',
        },
      ]
    );
    (claimDepositDiscordNotification as jest.Mock).mockResolvedValueOnce({
      claimedIds: ['deposit-3'],
      shouldNotify: false,
    });

    await pollUsdcTopupDiscordMonitorOnce();

    expect(notifyUsdcTopupFromDeposit).not.toHaveBeenCalled();
    expect(claimDepositDiscordNotification).toHaveBeenCalledWith({
      depositId: 'deposit-3',
      txHash: '0x' + 'b'.repeat(64),
    });
    expect(releaseDepositDiscordNotificationClaim).not.toHaveBeenCalled();
  });

  it('releases the claim when Discord send fails', async () => {
    (depositsRepo.listRecentCreditedUsdcDeposits as jest.Mock).mockResolvedValue(
      [
        {
          id: 'deposit-4',
          userId: 'player-3',
          depositorAddress: '0x123',
          amount: '25',
          tokenSymbol: 'GHST',
          txHash: '0x' + 'c'.repeat(64),
          createdAt: '2026-02-06T22:01:00.000Z',
          updatedAt: '2026-02-06T22:01:00.000Z',
        },
      ]
    );
    (claimDepositDiscordNotification as jest.Mock).mockResolvedValueOnce({
      claimedIds: ['deposit-4'],
      shouldNotify: true,
    });
    (notifyUsdcTopupFromDeposit as jest.Mock).mockRejectedValueOnce(
      new Error('discord unavailable')
    );

    await pollUsdcTopupDiscordMonitorOnce();

    expect(releaseDepositDiscordNotificationClaim).toHaveBeenCalledWith([
      'deposit-4',
    ]);
  });
});
