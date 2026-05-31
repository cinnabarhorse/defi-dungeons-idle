import express, { type Application } from 'express';
import request from 'supertest';
import { registerApiKeySiweTokenRoute } from '../api-key-siwe-token';

jest.mock('../../lib/auth/api-keys', () => ({
  isStakedApiKeysEnabled: jest.fn(() => true),
}));

jest.mock('../../lib/db', () => ({
  playersRepo: {
    upsertPlayerByWallet: jest.fn(),
    touchLastSeen: jest.fn(),
  },
}));

jest.mock('../../lib/auth/api-key-management-token', () => ({
  createApiKeyManagementToken: jest.fn(),
}));

jest.mock('../../lib/auth/siwe-verify', () => {
  const actual = jest.requireActual('../../lib/auth/siwe-verify');
  return {
    ...actual,
    verifySiwePayload: jest.fn(),
  };
});

import { isStakedApiKeysEnabled } from '../../lib/auth/api-keys';
import { playersRepo } from '../../lib/db';
import { createApiKeyManagementToken } from '../../lib/auth/api-key-management-token';
import { verifySiwePayload, SiweVerificationError } from '../../lib/auth/siwe-verify';

describe('POST /api/auth/api-keys/siwe-token', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    registerApiKeySiweTokenRoute(app, {
      siweDomain: 'aavegotchi.com',
      baseChainId: 8453,
      validateNonce: jest.fn(() => true),
      getAllowedDomains: () => ['custom.aavegotchi.com'],
    });

    (isStakedApiKeysEnabled as jest.Mock).mockReturnValue(true);
    (verifySiwePayload as jest.Mock).mockResolvedValue({
      address: '0xabc',
      nonce: 'nonce-1',
      chainId: 8453,
      domain: 'aavegotchi.com',
    });
    (playersRepo.upsertPlayerByWallet as jest.Mock).mockResolvedValue({
      id: 'player-1',
    });
    (playersRepo.touchLastSeen as jest.Mock).mockResolvedValue(undefined);
    (createApiKeyManagementToken as jest.Mock).mockReturnValue({
      token: 'mgmt-token',
      expiresAt: '2026-02-22T10:00:00.000Z',
    });
  });

  it('returns 404 when feature is disabled', async () => {
    (isStakedApiKeysEnabled as jest.Mock).mockReturnValue(false);

    const response = await request(app)
      .post('/api/auth/api-keys/siwe-token')
      .send({ message: 'm', signature: 's' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Feature disabled');
  });

  it('returns 400 for invalid payload', async () => {
    const response = await request(app)
      .post('/api/auth/api-keys/siwe-token')
      .send({ message: 1, signature: null });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });

  it('issues management token for valid SIWE payload', async () => {
    const response = await request(app)
      .post('/api/auth/api-keys/siwe-token')
      .send({ message: 'msg', signature: 'sig', isSmartWallet: true, region: 'NA' });

    expect(response.status).toBe(200);
    expect(verifySiwePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'msg',
        signature: 'sig',
        isSmartWallet: true,
        expectedDomain: 'aavegotchi.com',
        baseChainId: 8453,
        allowedDomains: ['custom.aavegotchi.com'],
      })
    );
    expect(playersRepo.upsertPlayerByWallet).toHaveBeenCalledWith({
      walletAddress: '0xabc',
      region: 'NA',
    });
    expect(createApiKeyManagementToken).toHaveBeenCalledWith({
      playerId: 'player-1',
      address: '0xabc',
    });
    expect(response.body).toEqual({
      token: 'mgmt-token',
      expiresAt: '2026-02-22T10:00:00.000Z',
      playerId: 'player-1',
      address: '0xabc',
    });
  });

  it('propagates SIWE verification status codes', async () => {
    (verifySiwePayload as jest.Mock).mockRejectedValue(
      new SiweVerificationError('Invalid or expired nonce', 400, 'invalid_nonce')
    );

    const response = await request(app)
      .post('/api/auth/api-keys/siwe-token')
      .send({ message: 'msg', signature: 'sig' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid or expired nonce');
  });
});
