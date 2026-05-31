process.env.DISCORD_USDC_TOPUP_WEBHOOK_URL = 'https://example.com/webhook';

import { playersRepo } from '../../db';
import { notifyUsdcTopupFromDeposit } from '../discord';

jest.mock('../../db', () => ({
  playersRepo: {
    getPlayerById: jest.fn(),
    getPlayerByWallet: jest.fn(),
  },
}));

describe('notifyUsdcTopupFromDeposit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      username: 'ViVi',
    });
    (playersRepo.getPlayerByWallet as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    }) as unknown as typeof fetch;
  });

  it('uses GHO token symbol in deposit message', async () => {
    await notifyUsdcTopupFromDeposit({
      userId: 'player-1',
      depositorAddress: '0xabc',
      amount: '100',
      tokenSymbol: 'GHO',
      stakedBalances: {
        usdc: 4118,
        gho: 397,
        ghst: 1234,
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body ?? '{}'));
    expect(body.content).toContain('deposited **100 GHO**');
  });

  it('includes GHST in total staked message', async () => {
    await notifyUsdcTopupFromDeposit({
      userId: 'player-1',
      depositorAddress: '0xabc',
      amount: '100',
      tokenSymbol: 'GHST',
      stakedBalances: {
        usdc: 4118,
        gho: 397,
        ghst: 1234,
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(String(requestInit?.body ?? '{}'));
    expect(body.content).toContain(
      'Total Staked: 4,118 USDC, 397 GHO, 1,234 GHST'
    );
  });
});
