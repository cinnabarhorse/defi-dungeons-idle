import express, { type Application } from 'express';
import request from 'supertest';

jest.mock('../../lib/db', () => ({
  playersRepo: {
    upsertPlayerByWallet: jest.fn(),
    touchLastSeen: jest.fn(),
  },
  authSessionsRepo: {
    hasAnySessionForPlayer: jest.fn(),
    createAuthSession: jest.fn(),
  },
}));

jest.mock('../../lib/auth/siwe-verify', () => {
  class MockSiweVerificationError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    verifySiwePayload: jest.fn(),
    SiweVerificationError: MockSiweVerificationError,
  };
});

jest.mock('../../lib/gotchi-auth-eligibility', () => ({
  getWalletPlayEligibilityAtTodaySnapshot: jest.fn(),
}));

jest.mock('../../lib/auth/session', () => ({
  createSessionCookie: jest.fn(),
}));

jest.mock('../../lib/http-logging', () => ({
  logError: jest.fn(),
}));

import { playersRepo, authSessionsRepo } from '../../lib/db';
import {
  verifySiwePayload,
  SiweVerificationError,
} from '../../lib/auth/siwe-verify';
import { getWalletPlayEligibilityAtTodaySnapshot } from '../../lib/gotchi-auth-eligibility';
import { createSessionCookie } from '../../lib/auth/session';
import { registerAuthVerifyRoute } from '../auth-verify';

describe('POST /api/auth/verify', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    registerAuthVerifyRoute(app, {
      siweDomain: 'aavegotchi.com',
      baseChainId: 8453,
      sessionDurationSeconds: 60 * 60,
      validateNonce: jest.fn(() => true),
      getAllowedDomains: () => ['custom.aavegotchi.com'],
    });
  });

  it('creates a session but marks play as disabled when wallet is not eligible today', async () => {
    (verifySiwePayload as jest.Mock).mockResolvedValue({
      address: '0xabc',
      nonce: 'nonce-1',
    });
    (getWalletPlayEligibilityAtTodaySnapshot as jest.Mock).mockResolvedValue({
      canPlayToday: false,
      code: 'WALLET_NOT_ELIGIBLE',
      error: 'Wallet is not eligible for today',
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
      acquiredAfterSnapshot: false,
      resetAtUtc: null,
    });
    (playersRepo.upsertPlayerByWallet as jest.Mock).mockResolvedValue({
      id: 'player-1',
    });
    (playersRepo.touchLastSeen as jest.Mock).mockResolvedValue(undefined);
    (authSessionsRepo.hasAnySessionForPlayer as jest.Mock).mockResolvedValue(false);
    (authSessionsRepo.createAuthSession as jest.Mock).mockResolvedValue({
      id: 'session-1',
      issuedAt: '2026-02-18T00:00:00.000Z',
    });
    (createSessionCookie as jest.Mock).mockReturnValue({
      cookie: 'sid=test; Path=/; HttpOnly',
      token: 'session-token',
    });

    const response = await request(app).post('/api/auth/verify').send({
      message: 'msg',
      signature: 'sig',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      address: '0xabc',
      playerId: 'player-1',
      sessionId: 'session-1',
      token: 'session-token',
      issuedAt: '2026-02-18T00:00:00.000Z',
      expirationTime: expect.any(String),
      isFirstLogin: true,
      canPlayToday: false,
      playErrorCode: 'WALLET_NOT_ELIGIBLE',
      playError: 'Wallet is not eligible for today',
      acquiredAfterSnapshot: false,
      playResetAt: null,
    });
    expect(playersRepo.upsertPlayerByWallet).toHaveBeenCalled();
    expect(authSessionsRepo.createAuthSession).toHaveBeenCalled();
  });

  it('creates a session for an eligible wallet', async () => {
    (verifySiwePayload as jest.Mock).mockResolvedValue({
      address: '0xabc',
      nonce: 'nonce-1',
    });
    (getWalletPlayEligibilityAtTodaySnapshot as jest.Mock).mockResolvedValue({
      canPlayToday: true,
      code: null,
      error: null,
      snapshotDate: '2026-02-18',
      blockNumber: 123456,
      acquiredAfterSnapshot: false,
      resetAtUtc: null,
    });
    (playersRepo.upsertPlayerByWallet as jest.Mock).mockResolvedValue({
      id: 'player-1',
    });
    (playersRepo.touchLastSeen as jest.Mock).mockResolvedValue(undefined);
    (authSessionsRepo.hasAnySessionForPlayer as jest.Mock).mockResolvedValue(false);
    (authSessionsRepo.createAuthSession as jest.Mock).mockResolvedValue({
      id: 'session-1',
      issuedAt: '2026-02-18T00:00:00.000Z',
    });
    (createSessionCookie as jest.Mock).mockReturnValue({
      cookie: 'sid=test; Path=/; HttpOnly',
      token: 'session-token',
    });

    const response = await request(app)
      .post('/api/auth/verify')
      .set('x-forwarded-for', '203.0.113.10')
      .set('user-agent', 'jest-test')
      .send({
        message: 'msg',
        signature: 'sig',
        region: 'NA',
      });

    expect(response.status).toBe(200);
    expect(playersRepo.upsertPlayerByWallet).toHaveBeenCalledWith({
      walletAddress: '0xabc',
      region: 'NA',
    });
    expect(authSessionsRepo.createAuthSession).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        walletAddress: '0xabc',
        nonce: 'nonce-1',
        userAgent: 'jest-test',
        ip: '203.0.113.10',
      })
    );
    expect(response.headers['set-cookie']).toEqual(['sid=test; Path=/; HttpOnly']);
    expect(response.body).toEqual({
      address: '0xabc',
      playerId: 'player-1',
      sessionId: 'session-1',
      token: 'session-token',
      issuedAt: '2026-02-18T00:00:00.000Z',
      expirationTime: expect.any(String),
      isFirstLogin: true,
      canPlayToday: true,
      playErrorCode: null,
      playError: null,
      acquiredAfterSnapshot: false,
      playResetAt: null,
    });
  });

  it('propagates SIWE validation failures', async () => {
    (verifySiwePayload as jest.Mock).mockRejectedValue(
      new SiweVerificationError('Invalid or expired nonce', 400)
    );

    const response = await request(app).post('/api/auth/verify').send({
      message: 'msg',
      signature: 'sig',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid or expired nonce' });
  });
});
