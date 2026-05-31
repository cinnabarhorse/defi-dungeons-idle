import request from 'supertest';
import express, { type Application } from 'express';
import { registerPlayerStakedBalanceRoutes } from '../player-staked-balance';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  depositsRepo: {
    listDepositsByUser: jest.fn(),
  },
}));

jest.mock('../../lib/topup/deposits-subgraph', () => ({
  fetchStakedBalancesFromSubgraph: jest.fn(),
  syncWithdrawnDepositsFromSubgraph: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { depositsRepo } from '../../lib/db';
import {
  fetchStakedBalancesFromSubgraph,
  syncWithdrawnDepositsFromSubgraph,
} from '../../lib/topup/deposits-subgraph';

describe('GET /api/player/staked-balance', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    registerPlayerStakedBalanceRoutes(app);
    jest.clearAllMocks();

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: 'player-1',
      address: '0xabc',
    });

    (depositsRepo.listDepositsByUser as jest.Mock).mockResolvedValue([
      {
        id: 'deposit-1',
        txHash: `0x${'a'.repeat(64)}`,
        tokenSymbol: 'USDC',
        amount: '1',
        txStatus: 'credited',
        withdrawn: false,
      },
    ]);

    (fetchStakedBalancesFromSubgraph as jest.Mock).mockResolvedValue({
      usdc: 0,
      gho: 0,
      ghst: 0,
      total: 0,
    });
    (syncWithdrawnDepositsFromSubgraph as jest.Mock).mockResolvedValue([]);
  });

  it('syncs withdrawals before responding', async () => {
    const response = await request(app).get('/api/player/staked-balance');

    expect(response.status).toBe(200);
    expect(depositsRepo.listDepositsByUser).toHaveBeenCalledWith(
      'player-1',
      200
    );
    expect(syncWithdrawnDepositsFromSubgraph).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'deposit-1' })])
    );
    expect(fetchStakedBalancesFromSubgraph).toHaveBeenCalledWith('0xabc');
    expect(response.body.usdc).toBe(0);
  });

  it('uses subgraph staked balances as source of truth', async () => {
    (fetchStakedBalancesFromSubgraph as jest.Mock).mockResolvedValue({
      usdc: 0,
      gho: 0,
      ghst: 3,
      total: 0,
    });

    const response = await request(app).get('/api/player/staked-balance');

    expect(response.status).toBe(200);
    expect(response.body.ghst).toBe(3);
  });

  it('falls back to db balances when subgraph fails', async () => {
    (fetchStakedBalancesFromSubgraph as jest.Mock).mockRejectedValue(
      new Error('subgraph unavailable')
    );

    const response = await request(app).get('/api/player/staked-balance');

    expect(response.status).toBe(200);
    expect(response.body.usdc).toBe(1);
  });
});
