import express, { type Application } from 'express';
import request from 'supertest';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/auth/session', () => ({
  clearSessionCookie: jest.fn(() => 'sid=; Max-Age=0; Path=/; HttpOnly'),
}));

jest.mock('../../lib/gotchi-auth-eligibility', () => ({
  getWalletPlayEligibilityAtTodaySnapshot: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { getWalletPlayEligibilityAtTodaySnapshot } from '../../lib/gotchi-auth-eligibility';
import { registerAuthSessionRoute } from '../auth-session';

describe('GET /api/auth/session', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    registerAuthSessionRoute(app);
  });

  it('returns play-disabled session metadata for an ineligible wallet', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      address: '0xabc',
      playerId: 'player-1',
      token: 'session-token',
    });
    (getWalletPlayEligibilityAtTodaySnapshot as jest.Mock).mockResolvedValue({
      canPlayToday: false,
      code: 'WALLET_NOT_ELIGIBLE',
      error: 'Wallet is not eligible for today',
      acquiredAfterSnapshot: false,
      resetAtUtc: null,
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
    });

    const response = await request(app).get('/api/auth/session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      address: '0xabc',
      playerId: 'player-1',
      token: 'session-token',
      canPlayToday: false,
      playErrorCode: 'WALLET_NOT_ELIGIBLE',
      playError: 'Wallet is not eligible for today',
      acquiredAfterSnapshot: false,
      playResetAt: null,
    });
  });
});
