import { waitForDepositCredit } from '../credit-watch';
import type { DepositApiRecord } from '../../../types/topup';

function makeDeposit(
  overrides: Partial<DepositApiRecord>
): DepositApiRecord {
  return {
    id: 'deposit-1',
    userId: 'player-1',
    chainId: 8453,
    contractAddress: '0xcontract',
    depositorAddress: '0xabc',
    tokenAddress: '0xtoken',
    tokenSymbol: 'GHST',
    amount: '1',
    amountWei: '1000000000000000000',
    txHash: '0x' + 'a'.repeat(64),
    txStatus: 'pending',
    depositId: null,
    pointsMinted: null,
    yieldAmount: null,
    unlockAt: null,
    autoRenew: false,
    expiresAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('waitForDepositCredit', () => {
  it('returns true when a matching deposit is credited', async () => {
    const txHash = '0x' + 'b'.repeat(64);
    const fetchDeposits = jest.fn(async () => [
      makeDeposit({ txHash, txStatus: 'credited' }),
    ]);

    const credited = await waitForDepositCredit({
      txHash,
      fetchDeposits,
      pollIntervalMs: 500,
      timeoutMs: 1000,
    });

    expect(credited).toBe(true);
  });

  it('returns true when any duplicate row for the tx hash is credited', async () => {
    const txHash = '0x' + 'c'.repeat(64);
    const fetchDeposits = jest.fn(async () => [
      makeDeposit({ id: 'duplicate-pending', txHash, txStatus: 'pending' }),
      makeDeposit({ id: 'duplicate-credited', txHash, txStatus: 'credited' }),
    ]);

    const credited = await waitForDepositCredit({
      txHash,
      fetchDeposits,
      pollIntervalMs: 500,
      timeoutMs: 1000,
    });

    expect(credited).toBe(true);
  });
});

