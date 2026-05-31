import request from 'supertest';
import express, { type Application } from 'express';
import { registerTokenWithdrawalRoutes } from '../token-withdrawals';
import type { TokenWithdrawalRecord } from '../../lib/db';

jest.mock('../../lib/db', () => ({
  tokenWithdrawalsRepo: {
    getTokenWithdrawalById: jest.fn(),
    updateTokenWithdrawalStatus: jest.fn(),
    getTokenWithdrawalsByPlayer: jest.fn(),
    getTokenWithdrawalsByStatus: jest.fn(),
  },
  playersRepo: {
    getPlayerById: jest.fn(),
  },
  gamesRepo: {
    getById: jest.fn(),
  },
  gamePlayersRepo: {
    getByGameId: jest.fn(),
  },
  withdrawalSettingsRepo: {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  },
  runTransaction: jest.fn(async (fn: (client: unknown) => unknown) =>
    fn({ tx: true })
  ),
}));

jest.mock('../admin-auth', () => ({
  requireAdminSession: jest.fn(),
}));

jest.mock('../../lib/withdrawals/tx-creator', () => ({
  createWithdrawalTransaction: jest.fn(),
  USDC_CONTRACT_ADDRESS: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
}));

import {
  tokenWithdrawalsRepo,
  playersRepo,
  withdrawalSettingsRepo,
} from '../../lib/db';
import { requireAdminSession } from '../admin-auth';
import { createWithdrawalTransaction } from '../../lib/withdrawals/tx-creator';

describe('POST /api/admin/withdrawals/batch-approve', () => {
  let app: Application;

  function buildWithdrawal(
    overrides: Partial<TokenWithdrawalRecord> = {}
  ): TokenWithdrawalRecord {
    return {
      id: 'withdrawal-1',
      playerId: 'player-1',
      currency: 'USDC',
      amount: '1.000000',
      amountBaseUnits: 1_000_000n,
      source: 'daily_quest_prize_normal_1',
      gameId: null,
      lootDistributionId: null,
      economyTransactionId: null,
      status: 'withdrawal_waiting',
      txHash: null,
      chainId: null,
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

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerTokenWithdrawalRoutes(app);

    jest.clearAllMocks();

    (requireAdminSession as jest.Mock).mockResolvedValue({
      address: '0x000000000000000000000000000000000000dEaD',
      playerId: null,
    });
    (withdrawalSettingsRepo.getSettings as jest.Mock).mockResolvedValue({
      isAutoProcessingEnabled: false,
      isBatchProcessingPaused: false,
      isConfirmationPaused: false,
    });
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      walletAddress: '0x000000000000000000000000000000000000dEaD',
    });
  });

  it('claims the withdrawal before broadcasting a manual transfer', async () => {
    const withdrawal = buildWithdrawal();
    const claimed = {
      ...withdrawal,
      status: 'withdrawal_sending' as const,
      chainId: 8453,
      tokenContractAddress: '0x833589fCd6eDb6E08f4c7C32D4f71b54bdA02913',
    };
    const finalized = {
      ...claimed,
      status: 'withdrawal_pending' as const,
      txHash: `0x${'a'.repeat(64)}`,
    };

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({
        status,
        onlyIfCurrentStatus,
      }: {
        status: string;
        onlyIfCurrentStatus?: string;
      }) => {
        if (
          status === 'withdrawal_sending' &&
          onlyIfCurrentStatus === 'withdrawal_waiting'
        ) {
          return claimed;
        }
        if (
          status === 'withdrawal_pending' &&
          onlyIfCurrentStatus === 'withdrawal_sending'
        ) {
          return finalized;
        }
        return null;
      }
    );
    (createWithdrawalTransaction as jest.Mock).mockResolvedValue({
      txHash: finalized.txHash,
      transactionId: null,
      senderField: 'fromAddress',
      chainId: 8453,
      tokenAddress: finalized.tokenContractAddress,
    });

    const response = await request(app)
      .post('/api/admin/withdrawals/batch-approve')
      .send({ ids: [withdrawal.id] });

    expect(response.status).toBe(200);
    expect(response.body.successCount).toBe(1);
    expect(createWithdrawalTransaction).toHaveBeenCalledTimes(1);
    expect(
      (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mock.calls
    ).toEqual([
      [
        expect.objectContaining({
          id: withdrawal.id,
          status: 'withdrawal_sending',
          onlyIfCurrentStatus: 'withdrawal_waiting',
        }),
      ],
      [
        expect.objectContaining({
          id: withdrawal.id,
          status: 'withdrawal_pending',
          onlyIfCurrentStatus: 'withdrawal_sending',
          txHash: finalized.txHash,
        }),
      ],
    ]);
  });

  it('does not broadcast when another request already claimed the withdrawal', async () => {
    const withdrawal = buildWithdrawal();

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockResolvedValue(
      null
    );

    const response = await request(app)
      .post('/api/admin/withdrawals/batch-approve')
      .send({ ids: [withdrawal.id] });

    expect(response.status).toBe(200);
    expect(response.body.successCount).toBe(0);
    expect(response.body.failureCount).toBe(1);
    expect(response.body.results).toEqual([
      expect.objectContaining({
        id: withdrawal.id,
        success: false,
        error: 'Withdrawal is already being processed',
      }),
    ]);
    expect(createWithdrawalTransaction).not.toHaveBeenCalled();
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_sending',
        onlyIfCurrentStatus: 'withdrawal_waiting',
      })
    );
  });
});
