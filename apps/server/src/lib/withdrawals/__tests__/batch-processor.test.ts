import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockProviderGetBlockNumber = jest.fn();
const mockProviderGetLogs = jest.fn();
const mockProviderGetBlock = jest.fn();

class MockJsonRpcProvider {
  constructor(_url?: string) {}

  getBlockNumber(...args: any[]): Promise<number> {
    return mockProviderGetBlockNumber(...args);
  }

  getLogs(...args: any[]): Promise<any[]> {
    return mockProviderGetLogs(...args);
  }

  getBlock(...args: any[]): Promise<{ timestamp: number } | null> {
    return mockProviderGetBlock(...args);
  }
}

jest.mock('ethers', () => ({
  ethers: {
    isAddress: jest.fn(),
    id: jest.fn((value: string) => `topic:${value}`),
    zeroPadValue: jest.fn((value: string) => value.toLowerCase()),
    getAddress: jest.fn((value: string) => value),
    JsonRpcProvider: MockJsonRpcProvider,
  },
}));

jest.mock('../../logging', () => ({
  getBaseLogger: () => ({
    child: () => ({
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    }),
  }),
  emitServerLog: jest.fn(),
}));

jest.mock('../tx-creator', () => ({
  createWithdrawalTransaction: jest.fn(),
  resolveThirdwebTransactionById: jest.fn(() =>
    Promise.resolve({ state: 'pending', txHash: null, status: 'queued', errorMessage: null })
  ),
}));

const mockNotifyWithdrawalFailure = jest.fn();
jest.mock('../discord', () => ({
  notifyWithdrawalFailure: (...args: any[]) =>
    mockNotifyWithdrawalFailure(...args),
}));

jest.mock('../token-config', () => ({
  getWithdrawalTokenConfig: jest.fn(() => ({
    defaultChainId: 1,
    tokenAddress: '0xTokenDefault',
  })),
}));

const mockClaimNextApprovedWithdrawal = jest.fn();
const mockUpdateTokenWithdrawalStatus = jest.fn();
const mockGetTokenWithdrawalsByStatus = jest.fn(() => Promise.resolve([]));
const mockGetStuckSendingWithdrawals = jest.fn(() => Promise.resolve([]));
const mockGetPlayerById = jest.fn();

jest.mock('../../db', () => ({
  playersRepo: {
    getPlayerById: (...args: any[]) => mockGetPlayerById(...args),
  },
  tokenWithdrawalsRepo: {
    claimNextApprovedWithdrawal: (...args: any[]) =>
      mockClaimNextApprovedWithdrawal(...args),
    updateTokenWithdrawalStatus: (...args: any[]) =>
      mockUpdateTokenWithdrawalStatus(...args),
    getTokenWithdrawalsByStatus: (...args: any[]) =>
      mockGetTokenWithdrawalsByStatus(...args),
    getStuckSendingWithdrawals: (...args: any[]) =>
      mockGetStuckSendingWithdrawals(...args),
  },
  withdrawalSettingsRepo: {
    getSettings: jest.fn(() =>
      Promise.resolve({ isAutoProcessingEnabled: true, isBatchProcessingPaused: false })
    ),
  },
  runTransaction: async (fn: any) => fn({}),
}));

jest.mock('../config', () => ({
  MAX_WITHDRAWALS_PER_RUN: 10,
  WITHDRAWAL_SENDING_TIMEOUT_MS: 60_000,
  WITHDRAWAL_PROCESS_INTERVAL_MS: 10_000,
}));

import { ethers } from 'ethers';
import { processApprovedWithdrawals } from '../batch-processor';

describe('withdrawals/batch-processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaimNextApprovedWithdrawal.mockReset();
    mockUpdateTokenWithdrawalStatus.mockReset();
    mockGetTokenWithdrawalsByStatus.mockReset().mockResolvedValue([]);
    mockGetStuckSendingWithdrawals.mockReset().mockResolvedValue([]);
    mockGetPlayerById.mockReset();
    mockProviderGetBlockNumber.mockReset().mockResolvedValue(0);
    mockProviderGetLogs.mockReset().mockResolvedValue([]);
    mockProviderGetBlock.mockReset().mockResolvedValue({ timestamp: 0 });
    const txCreatorMock = jest.requireMock('../tx-creator') as {
      createWithdrawalTransaction: jest.Mock;
      resolveThirdwebTransactionById: jest.Mock;
    };
    txCreatorMock.createWithdrawalTransaction.mockReset();
    txCreatorMock.resolveThirdwebTransactionById
      .mockReset()
      .mockResolvedValue({
        state: 'pending',
        txHash: null,
        status: 'queued',
        errorMessage: null,
      });
    (ethers.isAddress as any).mockReset?.();
    delete process.env.THIRDWEB_SERVER_WALLET;
  });

  it('marks a withdrawal as failed when amountBaseUnits <= 0', async () => {
    mockClaimNextApprovedWithdrawal
      .mockResolvedValueOnce({
        id: 'w1',
        playerId: 'p1',
        currency: 'GHST',
        amountBaseUnits: 0n,
        chainId: null,
        tokenContractAddress: null,
      })
      .mockResolvedValueOnce(null);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 1, processed: 0, failures: 1 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith({
      id: 'w1',
      status: 'withdrawal_failed',
      failureReason: 'invalid_amount',
    });
    expect(mockNotifyWithdrawalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal: expect.objectContaining({ id: 'w1' }),
        failureReason: 'invalid_amount',
      })
    );

    // Should fail early before trying to fetch player wallet
    expect(mockGetPlayerById).not.toHaveBeenCalled();
  });

  it('marks a withdrawal as failed when player wallet is missing/invalid', async () => {
    mockClaimNextApprovedWithdrawal
      .mockResolvedValueOnce({
        id: 'w2',
        playerId: 'p2',
        currency: 'GHST',
        amountBaseUnits: 1n,
        chainId: null,
        tokenContractAddress: null,
      })
      .mockResolvedValueOnce(null);

    mockGetPlayerById.mockResolvedValueOnce(null);
    (ethers.isAddress as any).mockReturnValue(false);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 1, processed: 0, failures: 1 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith({
      id: 'w2',
      status: 'withdrawal_failed',
      failureReason: 'missing_player_wallet',
    });
    expect(mockNotifyWithdrawalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal: expect.objectContaining({ id: 'w2' }),
        failureReason: 'missing_player_wallet',
      })
    );
  });

  it('respects maxPerRun even when every attempt fails', async () => {
    mockClaimNextApprovedWithdrawal
      .mockResolvedValueOnce({
        id: 'w3',
        playerId: 'p3',
        currency: 'USDC',
        amountBaseUnits: 0n,
        chainId: null,
        tokenContractAddress: null,
      })
      .mockResolvedValueOnce({
        id: 'w4',
        playerId: 'p4',
        currency: 'USDC',
        amountBaseUnits: 0n,
        chainId: null,
        tokenContractAddress: null,
      });

    const stats = await processApprovedWithdrawals(1);

    expect(stats).toEqual({ attempted: 1, processed: 0, failures: 1 });
    expect(mockClaimNextApprovedWithdrawal).toHaveBeenCalledTimes(1);
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith({
      id: 'w3',
      status: 'withdrawal_failed',
      failureReason: 'invalid_amount',
    });
  });

  it('keeps withdrawal in sending when thirdweb returns queued transactionId', async () => {
    mockClaimNextApprovedWithdrawal
      .mockResolvedValueOnce({
        id: 'w-queued',
        playerId: 'p-queued',
        currency: 'USDC',
        amountBaseUnits: 1n,
        chainId: null,
        tokenContractAddress: null,
        metadata: {},
      })
      .mockResolvedValueOnce(null);

    mockGetPlayerById.mockResolvedValueOnce({
      walletAddress: '0x000000000000000000000000000000000000dEaD',
    });
    (ethers.isAddress as any).mockReturnValue(true);

    const { createWithdrawalTransaction } = jest.requireMock('../tx-creator') as {
      createWithdrawalTransaction: jest.Mock;
    };
    createWithdrawalTransaction.mockResolvedValueOnce({
      txHash: null,
      transactionId: 'tw-queued-123',
      senderField: 'fromAddress',
      chainId: 8453,
      tokenAddress: '0xTokenDefault',
    });

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 1, processed: 1, failures: 0 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-queued',
        status: 'withdrawal_sending',
        metadata: expect.objectContaining({
          thirdwebTransactionId: 'tw-queued-123',
        }),
      })
    );
  });

  it('recovers queued thirdweb tx hash from onchain transfer logs', async () => {
    process.env.THIRDWEB_SERVER_WALLET =
      '0x9257b9Ed3F0911bD3B80f81d1c46381b3Eb7bd63';
    (ethers.isAddress as any).mockReturnValue(true);

    mockGetTokenWithdrawalsByStatus.mockResolvedValueOnce([
      {
        id: 'w-recover',
        playerId: 'p-recover',
        currency: 'USDC',
        amountBaseUnits: 857143n,
        chainId: 8453,
        tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
        updatedAt: '2026-02-23T10:13:30.000Z',
        withdrawalSendingAt: '2026-02-23T10:13:29.000Z',
        metadata: {
          thirdwebTransactionId: 'tw-recover-123',
          thirdwebTransactionStatus: 'queued',
          thirdwebTransactionUpdatedAt: '2026-02-23T10:13:25.598Z',
        },
      },
    ]);
    mockGetPlayerById.mockResolvedValueOnce({
      walletAddress: '0x6Fd155B9D52f80E8A73A8a2537268602978486E2',
    });
    mockProviderGetBlockNumber.mockResolvedValueOnce(5_000_000);
    mockProviderGetLogs.mockResolvedValueOnce([
      {
        data: '857143',
        blockNumber: 4_999_998,
        transactionHash:
          '0x58a570ffae6bcf19a4fff393d04c98e70fca00a05270141243e092952c661651',
      },
    ]);
    mockProviderGetBlock.mockResolvedValueOnce({
      timestamp: Date.parse('2026-02-23T10:13:33.000Z') / 1000,
    });
    mockClaimNextApprovedWithdrawal.mockResolvedValueOnce(null);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 0, processed: 0, failures: 0 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-recover',
        status: 'withdrawal_pending',
        txHash:
          '0x58a570ffae6bcf19a4fff393d04c98e70fca00a05270141243e092952c661651',
        chainId: 8453,
        tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
      })
    );
    expect(mockUpdateTokenWithdrawalStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-recover',
        status: 'withdrawal_sending',
      })
    );
  });

  it('recovers queued tx hash when withdrawal timestamps are Date objects', async () => {
    process.env.THIRDWEB_SERVER_WALLET =
      '0x9257b9Ed3F0911bD3B80f81d1c46381b3Eb7bd63';
    (ethers.isAddress as any).mockReturnValue(true);

    mockGetTokenWithdrawalsByStatus.mockResolvedValueOnce([
      {
        id: 'w-recover-date',
        playerId: 'p-recover-date',
        currency: 'USDC',
        amountBaseUnits: 857143n,
        chainId: 8453,
        tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
        createdAt: new Date('2026-02-23T10:12:00.000Z'),
        updatedAt: new Date('2026-02-23T10:13:30.000Z'),
        withdrawalSendingAt: new Date('2026-02-23T10:13:29.000Z'),
        metadata: {
          thirdwebTransactionId: 'tw-recover-date-123',
          thirdwebTransactionStatus: 'queued',
          thirdwebTransactionUpdatedAt: new Date('2026-02-23T10:13:25.598Z'),
        },
      },
    ]);
    mockGetPlayerById.mockResolvedValueOnce({
      walletAddress: '0x6Fd155B9D52f80E8A73A8a2537268602978486E2',
    });
    mockProviderGetBlockNumber.mockResolvedValueOnce(5_000_000);
    mockProviderGetLogs.mockResolvedValueOnce([
      {
        data: '857143',
        blockNumber: 4_999_998,
        transactionHash:
          '0x58a570ffae6bcf19a4fff393d04c98e70fca00a05270141243e092952c661651',
      },
    ]);
    mockProviderGetBlock.mockResolvedValueOnce({
      timestamp: Date.parse('2026-02-23T10:13:33.000Z') / 1000,
    });
    mockClaimNextApprovedWithdrawal.mockResolvedValueOnce(null);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 0, processed: 0, failures: 0 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-recover-date',
        status: 'withdrawal_pending',
        txHash:
          '0x58a570ffae6bcf19a4fff393d04c98e70fca00a05270141243e092952c661651',
      })
    );
    expect(mockUpdateTokenWithdrawalStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-recover-date',
        status: 'withdrawal_sending',
      })
    );
  });

  it('uses stable sending timestamp for onchain lookup after repeated SUBMITTED polls', async () => {
    process.env.THIRDWEB_SERVER_WALLET =
      '0x9257b9Ed3F0911bD3B80f81d1c46381b3Eb7bd63';
    (ethers.isAddress as any).mockReturnValue(true);

    mockGetTokenWithdrawalsByStatus.mockResolvedValueOnce([
      {
        id: 'w-window',
        playerId: 'p-window',
        currency: 'USDC',
        amountBaseUnits: 857143n,
        chainId: 8453,
        tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
        createdAt: '2025-12-01T00:00:00.000Z',
        updatedAt: '2026-02-23T13:00:00.000Z',
        withdrawalSendingAt: '2025-12-02T00:00:00.000Z',
        metadata: {
          thirdwebTransactionId: 'tw-window-123',
          thirdwebTransactionStatus: 'SUBMITTED',
          thirdwebTransactionUpdatedAt: '2026-02-23T13:00:00.000Z',
        },
      },
    ]);
    mockGetPlayerById.mockResolvedValueOnce({
      walletAddress: '0x6Fd155B9D52f80E8A73A8a2537268602978486E2',
    });
    mockProviderGetBlockNumber.mockResolvedValueOnce(1_000_000);
    mockProviderGetLogs.mockResolvedValueOnce([]);
    mockClaimNextApprovedWithdrawal.mockResolvedValueOnce(null);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 0, processed: 0, failures: 0 });
    expect(mockProviderGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 880_000,
        toBlock: 1_000_000,
      })
    );
  });

  it('does not overwrite queued thirdweb updatedAt while status remains pending', async () => {
    const originalQueuedUpdatedAt = '2026-02-20T07:35:00.000Z';

    mockGetTokenWithdrawalsByStatus.mockResolvedValueOnce([
      {
        id: 'w-pending',
        playerId: 'p-pending',
        currency: 'USDC',
        amountBaseUnits: 857143n,
        chainId: 8453,
        tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
        createdAt: '2026-02-20T00:00:00.000Z',
        updatedAt: '2026-02-23T13:00:00.000Z',
        withdrawalSendingAt: '2026-02-20T07:34:00.000Z',
        metadata: {
          thirdwebTransactionId: 'tw-pending-123',
          thirdwebTransactionStatus: 'SUBMITTED',
          thirdwebTransactionUpdatedAt: originalQueuedUpdatedAt,
        },
      },
    ]);
    mockGetPlayerById.mockResolvedValueOnce(null);
    mockClaimNextApprovedWithdrawal.mockResolvedValueOnce(null);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 0, processed: 0, failures: 0 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-pending',
        status: 'withdrawal_sending',
        metadata: expect.objectContaining({
          thirdwebTransactionId: 'tw-pending-123',
          thirdwebTransactionStatus: 'queued',
          thirdwebTransactionUpdatedAt: originalQueuedUpdatedAt,
        }),
      })
    );
  });

  it('recovers direct-broadcast tx hash from onchain logs before retrying a stuck send', async () => {
    process.env.THIRDWEB_SERVER_WALLET =
      '0x9257b9Ed3F0911bD3B80f81d1c46381b3Eb7bd63';
    (ethers.isAddress as any).mockReturnValue(true);

    mockGetStuckSendingWithdrawals.mockResolvedValueOnce([
      {
        id: 'w-direct-recover',
        playerId: 'p-direct-recover',
        currency: 'USDC',
        amountBaseUnits: 857143n,
        chainId: 8453,
        tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
        updatedAt: '2026-02-23T10:13:30.000Z',
        withdrawalSendingAt: '2026-02-23T10:13:29.000Z',
        metadata: {},
      },
    ]);
    mockGetPlayerById.mockResolvedValueOnce({
      walletAddress: '0x6Fd155B9D52f80E8A73A8a2537268602978486E2',
    });
    mockProviderGetBlockNumber.mockResolvedValueOnce(5_000_000);
    mockProviderGetLogs.mockResolvedValueOnce([
      {
        data: '857143',
        blockNumber: 4_999_998,
        transactionHash:
          '0x58a570ffae6bcf19a4fff393d04c98e70fca00a05270141243e092952c661651',
      },
    ]);
    mockProviderGetBlock.mockResolvedValueOnce({
      timestamp: Date.parse('2026-02-23T10:13:33.000Z') / 1000,
    });
    mockClaimNextApprovedWithdrawal.mockResolvedValueOnce(null);

    const stats = await processApprovedWithdrawals(10);

    expect(stats).toEqual({ attempted: 0, processed: 0, failures: 0 });
    expect(mockUpdateTokenWithdrawalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-direct-recover',
        status: 'withdrawal_pending',
        onlyIfCurrentStatus: 'withdrawal_sending',
        txHash:
          '0x58a570ffae6bcf19a4fff393d04c98e70fca00a05270141243e092952c661651',
      })
    );
    expect(mockUpdateTokenWithdrawalStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-direct-recover',
        status: 'withdrawal_approved',
      })
    );
  });
});
