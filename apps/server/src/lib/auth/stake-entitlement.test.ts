jest.mock('../db', () => ({
  depositsRepo: {
    getStakedTokenBalances: jest.fn(),
  },
  playersRepo: {
    getPlayerById: jest.fn(),
  },
}));

import { depositsRepo, playersRepo } from '../db';
import { DEFAULT_ADMIN_ADDRESS } from '../constants';
import {
  API_KEY_REQUIRED_GHST_STAKE,
  API_KEY_REQUIRED_USDC_STAKE,
  evaluateStakeEntitlement,
  getStakeEntitlement,
  isStakeExemptAddress,
  isStakeExemptPlayer,
} from './stake-entitlement';

describe('stake entitlement helper', () => {
  const originalAdminAllowlist = process.env.ADMIN_WALLET_ALLOWLIST;

  beforeEach(() => {
    jest.clearAllMocks();
    if (originalAdminAllowlist === undefined) {
      delete process.env.ADMIN_WALLET_ALLOWLIST;
    } else {
      process.env.ADMIN_WALLET_ALLOWLIST = originalAdminAllowlist;
    }
  });

  afterAll(() => {
    if (originalAdminAllowlist === undefined) {
      delete process.env.ADMIN_WALLET_ALLOWLIST;
    } else {
      process.env.ADMIN_WALLET_ALLOWLIST = originalAdminAllowlist;
    }
  });

  it('enforces 1000/1000 thresholds exactly', () => {
    const belowUsdc = evaluateStakeEntitlement(999, API_KEY_REQUIRED_GHST_STAKE);
    expect(belowUsdc.eligible).toBe(false);
    expect(belowUsdc.reason).toBe('insufficient_usdc');

    const belowGhst = evaluateStakeEntitlement(API_KEY_REQUIRED_USDC_STAKE, 999);
    expect(belowGhst.eligible).toBe(false);
    expect(belowGhst.reason).toBe('insufficient_ghst');

    const exact = evaluateStakeEntitlement(1000, 1000);
    expect(exact.eligible).toBe(true);
    expect(exact.reason).toBe('ok');
  });

  it('loads balances from deposits repo', async () => {
    (depositsRepo.getStakedTokenBalances as jest.Mock).mockResolvedValue({
      USDC: 1200,
      GHST: 1500,
    });

    const entitlement = await getStakeEntitlement('player-1');

    expect(depositsRepo.getStakedTokenBalances).toHaveBeenCalledWith(
      'player-1',
      ['USDC', 'GHST']
    );
    expect(entitlement.eligible).toBe(true);
  });

  it('treats admin wallets as stake exempt', () => {
    expect(isStakeExemptAddress(DEFAULT_ADMIN_ADDRESS)).toBe(true);
  });

  it('supports custom admin allowlist env for exemptions', () => {
    process.env.ADMIN_WALLET_ALLOWLIST = '0xabc,0xdef';
    expect(isStakeExemptAddress('0xABC')).toBe(true);
    expect(isStakeExemptAddress('0x000')).toBe(false);
  });

  it('resolves stake exemption from player wallet', async () => {
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-1',
      walletAddress: DEFAULT_ADMIN_ADDRESS,
    });

    await expect(isStakeExemptPlayer('player-1')).resolves.toBe(true);
  });
});
