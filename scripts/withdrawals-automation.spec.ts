import type { TokenWithdrawalRecord } from '../apps/server/src/lib/db/types';

function buildWithdrawal(overrides: Partial<TokenWithdrawalRecord> = {}): TokenWithdrawalRecord {
  return {
    id: overrides.id ?? 'withdrawal-1',
    playerId: overrides.playerId ?? 'player-1',
    currency: overrides.currency ?? 'USDC',
    amount: overrides.amount ?? '1',
    amountBaseUnits: overrides.amountBaseUnits ?? 1_000_000n,
    source: overrides.source ?? 'test_source',
    gameId: overrides.gameId ?? null,
    lootDistributionId: overrides.lootDistributionId ?? null,
    economyTransactionId: overrides.economyTransactionId ?? null,
    status: overrides.status ?? 'withdrawal_approved',
    txHash: overrides.txHash ?? null,
    chainId: overrides.chainId ?? null,
    tokenContractAddress: overrides.tokenContractAddress ?? null,
    receivedAt: overrides.receivedAt ?? new Date().toISOString(),
    withdrawalRequestedAt:
      overrides.withdrawalRequestedAt ?? new Date().toISOString(),
    withdrawalApprovedAt:
      overrides.withdrawalApprovedAt ?? new Date().toISOString(),
    withdrawalSendingAt: overrides.withdrawalSendingAt ?? null,
    withdrawalPendingAt: overrides.withdrawalPendingAt ?? null,
    withdrawalConfirmedAt: overrides.withdrawalConfirmedAt ?? null,
    failureReason: overrides.failureReason ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

function mockLogging() {
  jest.doMock('../apps/server/src/lib/logging', () => {
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      child() {
        return this;
      },
    };
    return {
      __esModule: true,
      getBaseLogger: () => logger,
      emitServerLog: jest.fn(),
    };
  });
}

describe('withdrawal batch processor', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('returns disabled when auto-processing setting is off', async () => {
    mockLogging();

    jest.doMock('../apps/server/src/lib/db', () => ({
      __esModule: true,
      withdrawalSettingsRepo: {
        getSettings: jest.fn().mockResolvedValue({
          isAutoProcessingEnabled: false,
          isBatchProcessingPaused: false,
          isConfirmationPaused: false,
        }),
      },
      tokenWithdrawalsRepo: {
        claimNextApprovedWithdrawal: jest.fn(),
        getTokenWithdrawalsByStatus: jest.fn().mockResolvedValue([]),
        getStuckSendingWithdrawals: jest.fn(),
        updateTokenWithdrawalStatus: jest.fn(),
      },
      playersRepo: {
        getPlayerById: jest.fn(),
      },
      runTransaction: async (handler: any) => handler({}),
    }));
    jest.doMock('../apps/server/src/lib/withdrawals/tx-creator', () => ({
      __esModule: true,
      createWithdrawalTransaction: jest.fn(),
    }));

    const { processApprovedWithdrawals } = await import(
      '../apps/server/src/lib/withdrawals/batch-processor'
    );
    const result = await processApprovedWithdrawals(5);
    expect(result.reason).toBe('disabled');
  });

  test('respects batch pause toggle', async () => {
    mockLogging();
    const mockSettings = jest.fn().mockResolvedValue({
      isAutoProcessingEnabled: true,
      isBatchProcessingPaused: true,
      isConfirmationPaused: false,
    });
    const mockLock = jest.fn();

    jest.doMock('../apps/server/src/lib/db', () => ({
      __esModule: true,
      withdrawalSettingsRepo: {
        getSettings: mockSettings,
      },
      tokenWithdrawalsRepo: {
        claimNextApprovedWithdrawal: mockLock,
        getTokenWithdrawalsByStatus: jest.fn().mockResolvedValue([]),
        getStuckSendingWithdrawals: jest.fn(),
        updateTokenWithdrawalStatus: jest.fn(),
      },
      playersRepo: {
        getPlayerById: jest.fn(),
      },
      runTransaction: async (handler: any) => handler({}),
    }));
    jest.doMock('../apps/server/src/lib/withdrawals/tx-creator', () => ({
      __esModule: true,
      createWithdrawalTransaction: jest.fn(),
    }));

    const { processApprovedWithdrawals } = await import(
      '../apps/server/src/lib/withdrawals/batch-processor'
    );
    const result = await processApprovedWithdrawals(3);
    expect(result.reason).toBe('paused');
    expect(mockSettings).toHaveBeenCalled();
    expect(mockLock).not.toHaveBeenCalled();
  });

  test('processes approved withdrawal and moves it to pending', async () => {
    mockLogging();
    const queue = [buildWithdrawal(), null];
    const mockClaim = jest.fn().mockImplementation(async () => queue.shift());
    const mockUpdate = jest.fn().mockResolvedValue(null);
    const mockPlayer = jest.fn().mockResolvedValue({
      walletAddress: '0x1234567890123456789012345678901234567890',
    });
    const mockTx = jest
      .fn()
      .mockResolvedValue({
        txHash: '0xtesthash',
        chainId: 8453,
        tokenAddress: '0xabc',
      });

    jest.doMock('../apps/server/src/lib/db', () => ({
      __esModule: true,
      withdrawalSettingsRepo: {
        getSettings: jest.fn().mockResolvedValue({
          isAutoProcessingEnabled: true,
          isBatchProcessingPaused: false,
          isConfirmationPaused: false,
        }),
      },
      tokenWithdrawalsRepo: {
        claimNextApprovedWithdrawal: async () => mockClaim(),
        getTokenWithdrawalsByStatus: jest.fn().mockResolvedValue([]),
        getStuckSendingWithdrawals: jest.fn().mockResolvedValue([]),
        updateTokenWithdrawalStatus: mockUpdate,
      },
      playersRepo: {
        getPlayerById: mockPlayer,
      },
      runTransaction: async (handler: any) => handler({}),
    }));
    jest.doMock('../apps/server/src/lib/withdrawals/tx-creator', () => ({
      __esModule: true,
      createWithdrawalTransaction: mockTx,
    }));

    const { processApprovedWithdrawals } = await import(
      '../apps/server/src/lib/withdrawals/batch-processor'
    );
    const result = await processApprovedWithdrawals(2);
    expect(result.processed).toBe(1);
    expect(result.failures).toBe(0);
    expect(mockClaim).toHaveBeenCalledTimes(2);
    expect(mockPlayer).toHaveBeenCalledWith('player-1');
    expect(mockTx).toHaveBeenCalledWith({
      to: '0x1234567890123456789012345678901234567890',
      amount: 1_000_000n,
      tokenAddress: expect.any(String),
      chainId: 8453,
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'withdrawal_pending' })
    );
  });

  test('recovers stuck sending withdrawals before processing', async () => {
    mockLogging();
    const stuck = buildWithdrawal({
      id: 'stuck-1',
      status: 'withdrawal_sending',
      withdrawalSendingAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    jest.doMock('../apps/server/src/lib/db', () => ({
      __esModule: true,
      withdrawalSettingsRepo: {
        getSettings: jest.fn().mockResolvedValue({
          isAutoProcessingEnabled: true,
          isBatchProcessingPaused: false,
          isConfirmationPaused: false,
        }),
      },
      tokenWithdrawalsRepo: {
        claimNextApprovedWithdrawal: jest.fn().mockResolvedValue(null),
        getTokenWithdrawalsByStatus: jest.fn().mockResolvedValue([]),
        getStuckSendingWithdrawals: jest.fn().mockResolvedValue([stuck]),
        updateTokenWithdrawalStatus: jest.fn(),
      },
      playersRepo: {
        getPlayerById: jest.fn(),
      },
      runTransaction: async (handler: any) => handler({}),
    }));
    jest.doMock('../apps/server/src/lib/withdrawals/tx-creator', () => ({
      __esModule: true,
      createWithdrawalTransaction: jest.fn(),
    }));

    const { processApprovedWithdrawals } = await import(
      '../apps/server/src/lib/withdrawals/batch-processor'
    );
    const result = await processApprovedWithdrawals(1);
    expect(result.processed).toBe(0);
    expect(result.failures).toBe(0);
  });
});

describe('withdrawal tx monitor', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('skips work when confirmation is paused', async () => {
    mockLogging();
    const mockSettings = jest.fn().mockResolvedValue({
      isAutoProcessingEnabled: true,
      isBatchProcessingPaused: false,
      isConfirmationPaused: true,
    });
    const mockGetByStatus = jest.fn();

    jest.doMock('../apps/server/src/lib/db', () => ({
      __esModule: true,
      withdrawalSettingsRepo: {
        getSettings: mockSettings,
      },
      tokenWithdrawalsRepo: {
        getTokenWithdrawalsByStatus: mockGetByStatus,
        updateTokenWithdrawalStatus: jest.fn(),
      },
      playersRepo: {
        getPlayerById: jest.fn(),
      },
    }));

    const { checkPendingWithdrawals } = await import(
      '../apps/server/src/lib/withdrawals/tx-monitor'
    );
    await checkPendingWithdrawals();
    expect(mockGetByStatus).not.toHaveBeenCalled();
  });

  test('marks missing tx hash as pending timeout after 24h', async () => {
    mockLogging();
    const pendingRow = buildWithdrawal({
      id: 'w-timeout',
      status: 'withdrawal_pending',
      txHash: null,
      withdrawalPendingAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    });
    const mockUpdate = jest.fn().mockResolvedValue(null);

    jest.doMock('../apps/server/src/lib/db', () => ({
      __esModule: true,
      withdrawalSettingsRepo: {
        getSettings: jest.fn().mockResolvedValue({
          isAutoProcessingEnabled: true,
          isBatchProcessingPaused: false,
          isConfirmationPaused: false,
        }),
      },
      tokenWithdrawalsRepo: {
        getTokenWithdrawalsByStatus: jest.fn().mockResolvedValue([pendingRow]),
        updateTokenWithdrawalStatus: mockUpdate,
      },
      playersRepo: {
        getPlayerById: jest.fn(),
      },
    }));

    const { checkPendingWithdrawals } = await import(
      '../apps/server/src/lib/withdrawals/tx-monitor'
    );
    await checkPendingWithdrawals();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'w-timeout',
        status: 'withdrawal_failed',
        failureReason: 'pending_timeout_24h',
      })
    );
  });
});
