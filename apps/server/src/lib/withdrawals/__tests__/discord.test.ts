import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockBalanceOf = jest.fn();
const mockContract = jest.fn().mockImplementation(() => ({
  balanceOf: (...args: any[]) => mockBalanceOf(...args),
}));
const mockJsonRpcProvider = jest.fn().mockImplementation(() => ({}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: mockJsonRpcProvider,
    Contract: mockContract,
    parseUnits: (value: string, decimals: number) => {
      const negative = value.startsWith('-');
      const normalized = negative ? value.slice(1) : value;
      const [wholePart, fractionPart = ''] = normalized.split('.');
      const padded = fractionPart.padEnd(decimals, '0').slice(0, decimals);
      const base = BigInt(`${wholePart || '0'}${padded}`);
      return negative ? -base : base;
    },
    formatUnits: (value: bigint, decimals: number) => {
      const negative = value < 0n;
      const abs = negative ? -value : value;
      const divisor = 10n ** BigInt(decimals);
      const whole = abs / divisor;
      const fraction = abs % divisor;
      const fractionText = fraction
        .toString()
        .padStart(decimals, '0')
        .replace(/0+$/, '');
      const composed = fractionText.length
        ? `${whole.toString()}.${fractionText}`
        : whole.toString();
      return negative ? `-${composed}` : composed;
    },
  },
}));

import { notifyWithdrawalSuccess } from '../discord';

describe('withdrawals/discord', () => {
  const originalFetch = global.fetch;
  const originalWallet = process.env.THIRDWEB_SERVER_WALLET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.THIRDWEB_SERVER_WALLET =
      '0x1111111111111111111111111111111111111111';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    } as Response);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalWallet === undefined) {
      delete process.env.THIRDWEB_SERVER_WALLET;
    } else {
      process.env.THIRDWEB_SERVER_WALLET = originalWallet;
    }
  });

  it('includes token balance remaining in success notification content', async () => {
    mockBalanceOf.mockResolvedValue(12_345_678n);

    await notifyWithdrawalSuccess({
      withdrawal: {
        id: 'withdrawal-1',
        playerId: 'player-1',
        currency: 'USDC',
        amount: '0.028571',
        amountBaseUnits: 28_571n,
        source: 'daily_quest',
        chainId: 8453,
        txHash: '0xabc',
      },
      toWallet: '0xa322f14c4e9628f5934420a6098a01e7c999e657',
      txHash: '0xabc',
    });

    expect(mockContract).toHaveBeenCalled();
    expect(mockBalanceOf).toHaveBeenCalledWith(
      '0x1111111111111111111111111111111111111111'
    );

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    const bodyRaw = calls[0]?.[1]?.body;
    const body =
      typeof bodyRaw === 'string' ? JSON.parse(bodyRaw) : { content: '' };
    const content = String(body.content || '');

    expect(content).toContain('🎉 New withdrawal processed!');
    expect(content).toContain(
      '0.028571 USDC was sent to 0xa322f14c4e9628f5934420a6098a01e7c999e657.'
    );
    expect(content).toContain('USDC Balance Remaining: 12.345678');
  });
});
