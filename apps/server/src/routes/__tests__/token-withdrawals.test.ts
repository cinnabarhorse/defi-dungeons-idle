import request from 'supertest';
import express, { type Application } from 'express';
import { registerTokenWithdrawalRoutes } from '../token-withdrawals';
import { parseAmountToBaseUnits } from '../../lib/withdrawals/token-config';
import type { TokenWithdrawalRecord } from '../../lib/db';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  tokenWithdrawalsRepo: {
    getTokenWithdrawalById: jest.fn(),
    updateTokenWithdrawalStatus: jest.fn(),
    getTokenWithdrawalsByPlayer: jest.fn(),
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
  runTransaction: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { tokenWithdrawalsRepo } from '../../lib/db';

describe('POST /api/tokens/withdraw/:tokenId auto-approval', () => {
  let app: Application;
  const mockPlayerId = 'player-1';

  function buildWithdrawal(
    overrides: Partial<TokenWithdrawalRecord>
  ): TokenWithdrawalRecord {
    return {
      id: 'withdrawal-1',
      playerId: mockPlayerId,
      currency: 'USDC',
      amount: '1.000000',
      amountBaseUnits: parseAmountToBaseUnits(1, 6),
      source: 'daily_quest_prize_normal_1',
      gameId: null,
      lootDistributionId: null,
      economyTransactionId: null,
      status: 'received',
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

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: mockPlayerId,
    });
  });

  it('auto-approves USDC daily quest prizes under 10', async () => {
    const withdrawal = buildWithdrawal({
      currency: 'USDC',
      amountBaseUnits: parseAmountToBaseUnits(9.9999, 6),
      amount: '9.999900',
      source: 'daily_quest_prize_normal_1',
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ status }: { status: string }) => ({
        ...withdrawal,
        status,
      })
    );

    const response = await request(app).post(
      `/api/tokens/withdraw/${withdrawal.id}`
    );

    expect(response.status).toBe(200);
    expect(
      tokenWithdrawalsRepo.updateTokenWithdrawalStatus
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_approved',
      })
    );
    expect(response.body.withdrawal.status).toBe('withdrawal_approved');
  });

  it('auto-approves GHST withdrawals under 100', async () => {
    const withdrawal = buildWithdrawal({
      currency: 'GHST',
      amountBaseUnits: parseAmountToBaseUnits(5, 18),
      amount: '5.000000',
      source: 'manual_topup',
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ status }: { status: string }) => ({
        ...withdrawal,
        status,
      })
    );

    const response = await request(app).post(
      `/api/tokens/withdraw/${withdrawal.id}`
    );

    expect(response.status).toBe(200);
    expect(
      tokenWithdrawalsRepo.updateTokenWithdrawalStatus
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_approved',
      })
    );
    expect(response.body.withdrawal.status).toBe('withdrawal_approved');
  });

  it('does not auto-approve USDC daily quest prizes at or above 10', async () => {
    const withdrawal = buildWithdrawal({
      currency: 'USDC',
      amountBaseUnits: parseAmountToBaseUnits(10, 6),
      amount: '10.000000',
      source: 'daily_quest_prize_hell_3',
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ status }: { status: string }) => ({
        ...withdrawal,
        status,
      })
    );

    const response = await request(app).post(
      `/api/tokens/withdraw/${withdrawal.id}`
    );

    expect(response.status).toBe(200);
    expect(
      tokenWithdrawalsRepo.updateTokenWithdrawalStatus
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_waiting',
      })
    );
    expect(response.body.withdrawal.status).toBe('withdrawal_waiting');
  });

  it('does not auto-approve GHST withdrawals at or above 100', async () => {
    const withdrawal = buildWithdrawal({
      currency: 'GHST',
      amountBaseUnits: parseAmountToBaseUnits(100, 18),
      amount: '100.000000',
      source: 'daily_quest_prize_hell_3',
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ status }: { status: string }) => ({
        ...withdrawal,
        status,
      })
    );

    const response = await request(app).post(
      `/api/tokens/withdraw/${withdrawal.id}`
    );

    expect(response.status).toBe(200);
    expect(
      tokenWithdrawalsRepo.updateTokenWithdrawalStatus
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_waiting',
      })
    );
    expect(response.body.withdrawal.status).toBe('withdrawal_waiting');
  });

  it('does not auto-approve non-daily quest sources', async () => {
    const withdrawal = buildWithdrawal({
      currency: 'USDC',
      amountBaseUnits: parseAmountToBaseUnits(3, 6),
      amount: '3.000000',
      source: 'manual_topup',
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ status }: { status: string }) => ({
        ...withdrawal,
        status,
      })
    );

    const response = await request(app).post(
      `/api/tokens/withdraw/${withdrawal.id}`
    );

    expect(response.status).toBe(200);
    expect(
      tokenWithdrawalsRepo.updateTokenWithdrawalStatus
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_waiting',
      })
    );
    expect(response.body.withdrawal.status).toBe('withdrawal_waiting');
  });

  it('does not auto-approve unknown daily quest tiers', async () => {
    const withdrawal = buildWithdrawal({
      currency: 'USDC',
      amountBaseUnits: parseAmountToBaseUnits(3, 6),
      amount: '3.000000',
      source: 'daily_quest_prize_hard_2',
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ status }: { status: string }) => ({
        ...withdrawal,
        status,
      })
    );

    const response = await request(app).post(
      `/api/tokens/withdraw/${withdrawal.id}`
    );

    expect(response.status).toBe(200);
    expect(
      tokenWithdrawalsRepo.updateTokenWithdrawalStatus
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: withdrawal.id,
        status: 'withdrawal_waiting',
      })
    );
    expect(response.body.withdrawal.status).toBe('withdrawal_waiting');
  });
});

describe('POST /api/tokens/withdraw-batch', () => {
  let app: Application;
  const mockPlayerId = 'player-1';

  function buildWithdrawal(
    overrides: Partial<TokenWithdrawalRecord>
  ): TokenWithdrawalRecord {
    return {
      id: 'withdrawal-1',
      playerId: mockPlayerId,
      currency: 'USDC',
      amount: '0.030000',
      amountBaseUnits: parseAmountToBaseUnits(0.03, 6),
      source: 'daily_quest_prize_normal_1',
      gameId: null,
      lootDistributionId: null,
      economyTransactionId: null,
      status: 'received',
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

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: mockPlayerId,
    });
  });

  it('processes batch when aggregate meets threshold', async () => {
    const withdrawals = [
      buildWithdrawal({ id: 'w-1', amount: '0.030000', amountBaseUnits: parseAmountToBaseUnits(0.03, 6) }),
      buildWithdrawal({ id: 'w-2', amount: '0.030000', amountBaseUnits: parseAmountToBaseUnits(0.03, 6) }),
      buildWithdrawal({ id: 'w-3', amount: '0.030000', amountBaseUnits: parseAmountToBaseUnits(0.03, 6) }),
      buildWithdrawal({ id: 'w-4', amount: '0.040000', amountBaseUnits: parseAmountToBaseUnits(0.04, 6) }),
    ];
    // Total: 0.13 USDC >= 0.1 threshold

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockImplementation(
      async (id: string) => withdrawals.find((w) => w.id === id) ?? null
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ id, status }: { id: string; status: string }) => {
        const w = withdrawals.find((w) => w.id === id);
        return w ? { ...w, status } : null;
      }
    );

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1', 'w-2', 'w-3', 'w-4'] });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.successCount).toBe(4);
    expect(response.body.failCount).toBe(0);
    expect(response.body.withdrawals).toHaveLength(4);
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).toHaveBeenCalledTimes(4);
  });

  it('rejects batch when aggregate is below threshold', async () => {
    const withdrawals = [
      buildWithdrawal({ id: 'w-1', amount: '0.030000', amountBaseUnits: parseAmountToBaseUnits(0.03, 6) }),
      buildWithdrawal({ id: 'w-2', amount: '0.030000', amountBaseUnits: parseAmountToBaseUnits(0.03, 6) }),
    ];
    // Total: 0.06 USDC < 0.1 threshold

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockImplementation(
      async (id: string) => withdrawals.find((w) => w.id === id) ?? null
    );

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1', 'w-2'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/below the minimum/i);
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).not.toHaveBeenCalled();
  });

  it('does not allow duplicate ids to bypass the aggregate threshold', async () => {
    const withdrawal = buildWithdrawal({
      id: 'w-1',
      amount: '0.050000',
      amountBaseUnits: parseAmountToBaseUnits(0.05, 6),
    });
    // Unique total: 0.05 USDC < 0.1 threshold

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(
      withdrawal
    );

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1', 'w-1'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/below the minimum/i);
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).not.toHaveBeenCalled();
  });

  it('validates threshold per currency independently', async () => {
    const withdrawals = [
      buildWithdrawal({ id: 'w-1', currency: 'USDC', amount: '0.150000', amountBaseUnits: parseAmountToBaseUnits(0.15, 6) }),
      buildWithdrawal({ id: 'w-2', currency: 'GHST', amount: '0.050000', amountBaseUnits: parseAmountToBaseUnits(0.05, 18) }),
    ];
    // USDC total: 0.15 >= 0.1 OK, GHST total: 0.05 < 0.1 FAIL

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockImplementation(
      async (id: string) => withdrawals.find((w) => w.id === id) ?? null
    );

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1', 'w-2'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/GHST/);
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).not.toHaveBeenCalled();
  });

  it('applies auto-approval per individual withdrawal', async () => {
    const withdrawals = [
      buildWithdrawal({
        id: 'w-1',
        currency: 'USDC',
        amount: '0.050000',
        amountBaseUnits: parseAmountToBaseUnits(0.05, 6),
        source: 'daily_quest_prize_normal_1',
      }),
      buildWithdrawal({
        id: 'w-2',
        currency: 'USDC',
        amount: '0.060000',
        amountBaseUnits: parseAmountToBaseUnits(0.06, 6),
        source: 'boss_kill',
      }),
    ];
    // Total: 0.11 USDC >= 0.1 threshold
    // w-1: daily quest prize USDC < 10 → auto-approved
    // w-2: boss_kill source → waiting

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockImplementation(
      async (id: string) => withdrawals.find((w) => w.id === id) ?? null
    );
    (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mockImplementation(
      async ({ id, status }: { id: string; status: string }) => {
        const w = withdrawals.find((w) => w.id === id);
        return w ? { ...w, status } : null;
      }
    );

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1', 'w-2'] });

    expect(response.status).toBe(200);
    expect(response.body.successCount).toBe(2);

    const calls = (tokenWithdrawalsRepo.updateTokenWithdrawalStatus as jest.Mock).mock.calls;
    const w1Call = calls.find((c: Array<{ id: string }>) => c[0].id === 'w-1');
    const w2Call = calls.find((c: Array<{ id: string }>) => c[0].id === 'w-2');
    expect(w1Call[0].status).toBe('withdrawal_approved');
    expect(w2Call[0].status).toBe('withdrawal_waiting');
  });

  it('rejects batch with non-received withdrawal', async () => {
    const withdrawals = [
      buildWithdrawal({ id: 'w-1', amount: '0.100000', amountBaseUnits: parseAmountToBaseUnits(0.1, 6) }),
      buildWithdrawal({ id: 'w-2', amount: '0.100000', amountBaseUnits: parseAmountToBaseUnits(0.1, 6), status: 'withdrawal_waiting' }),
    ];

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockImplementation(
      async (id: string) => withdrawals.find((w) => w.id === id) ?? null
    );

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1', 'w-2'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not available for withdrawal/i);
    expect(response.body.id).toBe('w-2');
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).not.toHaveBeenCalled();
  });

  it('rejects batch with withdrawal from different player', async () => {
    const withdrawal = buildWithdrawal({
      id: 'w-1',
      playerId: 'another-player',
      amount: '0.100000',
      amountBaseUnits: parseAmountToBaseUnits(0.1, 6),
    });

    (tokenWithdrawalsRepo.getTokenWithdrawalById as jest.Mock).mockResolvedValue(withdrawal);

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1'] });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
    expect(tokenWithdrawalsRepo.updateTokenWithdrawalStatus).not.toHaveBeenCalled();
  });

  it('rejects empty ids array', async () => {
    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no withdrawal ids/i);
  });

  it('returns 401 for unauthenticated request', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids: ['w-1'] });

    expect(response.status).toBe(401);
  });

  it('rejects batch exceeding 100 items', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `w-${i}`);

    const response = await request(app)
      .post('/api/tokens/withdraw-batch')
      .send({ ids });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/more than 100/i);
  });
});
