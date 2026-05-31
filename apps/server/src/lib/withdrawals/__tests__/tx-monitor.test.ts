import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetTransactionReceipt = jest.fn();

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getTransactionReceipt: (...args: any[]) =>
        mockGetTransactionReceipt(...args),
    })),
  },
}));

const mockGetSettings = jest.fn();
const mockGetByStatus = jest.fn();
const mockUpdateStatus = jest.fn();
const mockGetPlayerById = jest.fn();

jest.mock('../../db', () => ({
  withdrawalSettingsRepo: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
  },
  tokenWithdrawalsRepo: {
    getTokenWithdrawalsByStatus: (...args: any[]) => mockGetByStatus(...args),
    updateTokenWithdrawalStatus: (...args: any[]) => mockUpdateStatus(...args),
  },
  playersRepo: {
    getPlayerById: (...args: any[]) => mockGetPlayerById(...args),
  },
}));

const mockEmitServerLog = jest.fn();
jest.mock('../../logging', () => ({
  getBaseLogger: () => ({
    child: () => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    }),
  }),
  emitServerLog: (...args: any[]) => mockEmitServerLog(...args),
}));

const mockNotifyWithdrawalSuccess = jest.fn();
const mockNotifyWithdrawalFailure = jest.fn();
jest.mock('../discord', () => ({
  notifyWithdrawalSuccess: (...args: any[]) =>
    mockNotifyWithdrawalSuccess(...args),
  notifyWithdrawalFailure: (...args: any[]) =>
    mockNotifyWithdrawalFailure(...args),
}));

import { checkPendingWithdrawals } from '../tx-monitor';

const basePendingRow = {
  id: 'w-1',
  playerId: 'player-1',
  currency: 'USDC',
  amount: '1.0',
  amountBaseUnits: 1_000_000n,
  source: 'daily_competition',
  status: 'withdrawal_pending',
  txHash: null as string | null,
  chainId: 8453,
  tokenContractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  receivedAt: null,
  withdrawalRequestedAt: null,
  withdrawalApprovedAt: null,
  withdrawalSendingAt: null,
  withdrawalPendingAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  withdrawalConfirmedAt: null,
  failureReason: null,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('withdrawals/tx-monitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      isAutoProcessingEnabled: true,
      isBatchProcessingPaused: false,
      isConfirmationPaused: false,
    });
    mockGetPlayerById.mockResolvedValue({
      walletAddress: '0x000000000000000000000000000000000000dead',
    });
  });

  it('marks timed-out rows without tx hash as failed and sends failure Discord', async () => {
    const pending = { ...basePendingRow, id: 'w-timeout', txHash: null };
    mockGetByStatus.mockResolvedValue([pending]);
    mockUpdateStatus.mockResolvedValue({
      ...pending,
      status: 'withdrawal_failed',
      failureReason: 'pending_timeout_24h',
    });

    await checkPendingWithdrawals();

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-timeout',
        status: 'withdrawal_failed',
        failureReason: 'pending_timeout_24h',
      })
    );
    expect(mockNotifyWithdrawalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal: expect.objectContaining({ id: 'w-timeout' }),
        failureReason: 'pending_timeout_24h',
      })
    );
  });

  it('marks reverted receipts as failed and sends failure Discord', async () => {
    const pending = {
      ...basePendingRow,
      id: 'w-reverted',
      txHash: '0xabc123',
      withdrawalPendingAt: new Date().toISOString(),
    };
    mockGetByStatus.mockResolvedValue([pending]);
    mockGetTransactionReceipt.mockResolvedValue({ status: 0 });
    mockUpdateStatus.mockResolvedValue({
      ...pending,
      status: 'withdrawal_failed',
      failureReason: 'Transaction reverted',
    });

    await checkPendingWithdrawals();

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-reverted',
        status: 'withdrawal_failed',
        txHash: '0xabc123',
        failureReason: 'Transaction reverted',
      })
    );
    expect(mockNotifyWithdrawalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal: expect.objectContaining({ id: 'w-reverted' }),
        txHash: '0xabc123',
        failureReason: 'Transaction reverted',
      })
    );
    expect(mockEmitServerLog).toHaveBeenCalledWith(
      'withdrawal.tx_failed',
      expect.any(Object)
    );
  });

  it('sends success Discord when receipt is confirmed', async () => {
    const pending = {
      ...basePendingRow,
      id: 'w-success',
      txHash: '0xdef456',
      withdrawalPendingAt: new Date().toISOString(),
    };
    mockGetByStatus.mockResolvedValue([pending]);
    mockGetTransactionReceipt.mockResolvedValue({ status: 1 });
    mockUpdateStatus.mockResolvedValue({
      ...pending,
      status: 'withdrawal_confirmed',
    });

    await checkPendingWithdrawals();

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-success',
        status: 'withdrawal_confirmed',
        txHash: '0xdef456',
      })
    );
    expect(mockNotifyWithdrawalSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal: expect.objectContaining({ id: 'w-success' }),
        txHash: '0xdef456',
      })
    );
  });

  it('does not send duplicate success Discord if another worker already confirmed the row', async () => {
    const pending = {
      ...basePendingRow,
      id: 'w-success-race',
      txHash: '0xabc999',
      withdrawalPendingAt: new Date().toISOString(),
    };
    mockGetByStatus.mockResolvedValue([pending]);
    mockGetTransactionReceipt.mockResolvedValue({ status: 1 });
    // Simulate compare-and-set miss: row is no longer pending when we update.
    mockUpdateStatus.mockResolvedValue(null);

    await checkPendingWithdrawals();

    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-success-race',
        status: 'withdrawal_confirmed',
        onlyIfCurrentStatus: 'withdrawal_pending',
        txHash: '0xabc999',
      })
    );
    expect(mockNotifyWithdrawalSuccess).not.toHaveBeenCalled();
  });
});
