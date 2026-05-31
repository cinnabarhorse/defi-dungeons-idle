import type { TokenWithdrawal } from '../../../types/withdrawals';
import {
  getInitialTxSubmittedAt,
  getLastAttemptAt,
} from './withdrawal-attempt-times';

function buildWithdrawal(
  overrides: Partial<TokenWithdrawal> = {}
): TokenWithdrawal {
  return {
    id: 'withdrawal-1',
    playerId: 'player-1',
    currency: 'USDC',
    amount: '1',
    amountBaseUnits: '1000000',
    source: 'daily_quest_prize_normal_1',
    gameId: null,
    lootDistributionId: null,
    economyTransactionId: null,
    status: 'withdrawal_waiting',
    txHash: null,
    chainId: 8453,
    tokenContractAddress: null,
    receivedAt: null,
    withdrawalRequestedAt: null,
    withdrawalApprovedAt: null,
    withdrawalSendingAt: null,
    withdrawalPendingAt: null,
    withdrawalConfirmedAt: null,
    failureReason: null,
    metadata: {},
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('withdrawal-attempt-times', () => {
  it('returns the earliest known submission timestamp for the initial tx', () => {
    const withdrawal = buildWithdrawal({
      status: 'withdrawal_confirmed',
      withdrawalSendingAt: '2026-03-10T08:19:10.000Z',
      withdrawalPendingAt: '2026-03-10T08:19:24.000Z',
      updatedAt: '2026-03-10T08:20:00.000Z',
    });

    expect(getInitialTxSubmittedAt(withdrawal)).toBe(
      '2026-03-10T08:19:10.000Z'
    );
  });

  it('uses queued metadata when sending timestamps are missing', () => {
    const withdrawal = buildWithdrawal({
      status: 'withdrawal_sending',
      metadata: {
        thirdwebTransactionUpdatedAt: '2026-03-10T08:19:12.000Z',
      },
      updatedAt: '2026-03-10T08:19:30.000Z',
    });

    expect(getInitialTxSubmittedAt(withdrawal)).toBe(
      '2026-03-10T08:19:12.000Z'
    );
  });

  it('uses the latest send-side timestamp for the last attempt', () => {
    const withdrawal = buildWithdrawal({
      status: 'withdrawal_pending',
      withdrawalSendingAt: '2026-03-10T08:19:10.000Z',
      withdrawalPendingAt: '2026-03-10T08:19:24.000Z',
      updatedAt: '2026-03-10T08:21:00.000Z',
    });

    expect(getLastAttemptAt(withdrawal)).toBe(
      '2026-03-10T08:19:24.000Z'
    );
  });

  it('falls back to updatedAt for failed rows with no explicit send timestamp', () => {
    const withdrawal = buildWithdrawal({
      status: 'withdrawal_failed',
      updatedAt: '2026-03-10T08:20:30.000Z',
      failureReason: 'manual_review_multiple_onchain_matches',
    });

    expect(getInitialTxSubmittedAt(withdrawal)).toBeNull();
    expect(getLastAttemptAt(withdrawal)).toBe('2026-03-10T08:20:30.000Z');
  });
});
