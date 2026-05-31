import { getGlobalStakedUnlockBalances, getStakedUnlockBalances } from '../repos/deposits';
import { getPgPool } from '../client';

jest.mock('../client', () => ({
  getPgPool: jest.fn(),
}));

describe('deposits repo staked unlock balances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getGlobalStakedUnlockBalances includes GHST while keeping total as USDC + GHO', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { token_symbol: 'usdc', total_staked: '12.5' },
        { token_symbol: 'GHO', total_staked: '7.25' },
        { token_symbol: 'ghst', total_staked: '1234' },
      ],
    });

    (getPgPool as jest.Mock).mockReturnValue({ query });

    await expect(getGlobalStakedUnlockBalances()).resolves.toEqual({
      usdc: 12.5,
      gho: 7.25,
      ghst: 1234,
      total: 19.75,
    });

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('getStakedUnlockBalances treats non-numeric totals as 0 and still returns a numeric total', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { token_symbol: 'USDC', total_staked: 'not-a-number' },
        { token_symbol: 'GHO', total_staked: '3' },
      ],
    });

    (getPgPool as jest.Mock).mockReturnValue({ query });

    await expect(getStakedUnlockBalances('player-1')).resolves.toEqual({
      usdc: 0,
      gho: 3,
      ghst: 0,
      total: 3,
    });

    // sanity check: query is parameterized with userId + token list
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'player-1',
      ['USDC', 'GHO', 'GHST'],
    ]);
  });
});
