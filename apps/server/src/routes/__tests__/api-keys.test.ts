import express, { type Application } from 'express';
import request from 'supertest';
import { registerApiKeyRoutes } from '../api-keys';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/auth/api-keys', () => ({
  generateApiKey: jest.fn(() => 'ddk_live_test_secret'),
  getApiKeyMaxActivePerPlayer: jest.fn(() => 5),
  getApiKeyPrefix: jest.fn(() => 'ddk_live_test'),
  hashApiKey: jest.fn(() => 'hash-1'),
  isStakedApiKeysEnabled: jest.fn(() => true),
}));

jest.mock('../../lib/db', () => ({
  apiKeysRepo: {
    getActiveApiKeyCount: jest.fn(),
    createApiKey: jest.fn(),
    listApiKeysByPlayer: jest.fn(),
    revokeApiKey: jest.fn(),
  },
}));

jest.mock('../../lib/auth/stake-entitlement', () => ({
  isStakeExemptAddress: jest.fn(() => false),
}));

jest.mock('../../lib/auth/gotchi-ownership', () => ({
  verifyWalletOwnsAnyAavegotchi: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import {
  getApiKeyMaxActivePerPlayer,
  isStakedApiKeysEnabled,
} from '../../lib/auth/api-keys';
import { apiKeysRepo } from '../../lib/db';
import { isStakeExemptAddress } from '../../lib/auth/stake-entitlement';
import { verifyWalletOwnsAnyAavegotchi } from '../../lib/auth/gotchi-ownership';

describe('api key routes', () => {
  let app: Application;
  const csrfHeader = { 'X-Requested-With': 'XMLHttpRequest' };

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    registerApiKeyRoutes(app);
    (isStakedApiKeysEnabled as jest.Mock).mockReturnValue(true);
    (getApiKeyMaxActivePerPlayer as jest.Mock).mockReturnValue(5);

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'session_cookie',
      playerId: 'player-1',
      address: '0xabc',
    });
    (apiKeysRepo.getActiveApiKeyCount as jest.Mock).mockResolvedValue(0);
    (apiKeysRepo.createApiKey as jest.Mock).mockResolvedValue({
      id: 'key-1',
      name: 'bot',
      keyPrefix: 'ddk_live_test',
      createdAt: '2026-02-21T00:00:00.000Z',
      revokedAt: null,
      lastUsedAt: null,
      authSuccessCount: 0,
      roomJoinCount: 0,
    });
    (apiKeysRepo.listApiKeysByPlayer as jest.Mock).mockResolvedValue([
      {
        id: 'key-1',
        name: 'bot',
        keyPrefix: 'ddk_live_test',
        createdAt: '2026-02-21T00:00:00.000Z',
        revokedAt: null,
        lastUsedAt: null,
        authSuccessCount: 7,
        roomJoinCount: 3,
      },
    ]);
    (apiKeysRepo.revokeApiKey as jest.Mock).mockResolvedValue({
      id: 'key-1',
      name: 'bot',
      keyPrefix: 'ddk_live_test',
      createdAt: '2026-02-21T00:00:00.000Z',
      revokedAt: '2026-02-21T00:02:00.000Z',
      lastUsedAt: null,
      authSuccessCount: 7,
      roomJoinCount: 3,
    });
    (verifyWalletOwnsAnyAavegotchi as jest.Mock).mockResolvedValue({
      owned: true,
      source: 'subgraph',
      unavailable: false,
      reason: 'subgraph_owned',
    });
  });

  it('creates API key when ownership requirement is met', async () => {
    const response = await request(app)
      .post('/api/auth/api-keys')
      .set(csrfHeader)
      .send({ name: 'bot' });

    expect(response.status).toBe(201);
    expect(response.body.apiKey).toBe('ddk_live_test_secret');
    expect(response.body.key.keyPrefix).toBe('ddk_live_test');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('fails create when gotchi ownership is missing', async () => {
    (verifyWalletOwnsAnyAavegotchi as jest.Mock).mockResolvedValue({
      owned: false,
      source: 'subgraph',
      unavailable: false,
      reason: 'subgraph_not_owned',
    });

    const response = await request(app)
      .post('/api/auth/api-keys')
      .set(csrfHeader);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('gotchi_ownership_required');
  });

  it('fails create when ownership verification is unavailable', async () => {
    (verifyWalletOwnsAnyAavegotchi as jest.Mock).mockResolvedValue({
      owned: false,
      source: 'none',
      unavailable: true,
      reason: 'subgraph_and_rpc_unavailable',
    });

    const response = await request(app)
      .post('/api/auth/api-keys')
      .set(csrfHeader);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe(
      'gotchi_ownership_verification_unavailable'
    );
  });

  it('lists metadata and counters only (no plaintext key)', async () => {
    const response = await request(app).get('/api/auth/api-keys');

    expect(response.status).toBe(200);
    expect(response.body.keys[0]).toMatchObject({
      id: 'key-1',
      authSuccessCount: 7,
      roomJoinCount: 3,
    });
    expect(response.body.keys[0].apiKey).toBeUndefined();
  });

  it('revokes key by id', async () => {
    const response = await request(app)
      .delete('/api/auth/api-keys/key-1')
      .set(csrfHeader);

    expect(response.status).toBe(200);
    expect(apiKeysRepo.revokeApiKey).toHaveBeenCalledWith(
      'key-1',
      'player-1',
      'revoked_by_owner'
    );
  });

  it('rejects create requests missing CSRF header', async () => {
    const response = await request(app).post('/api/auth/api-keys');
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('csrf_validation_failed');
  });

  it('returns 404 when feature is disabled', async () => {
    (isStakedApiKeysEnabled as jest.Mock).mockReturnValue(false);

    const response = await request(app).get('/api/auth/api-keys');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Feature disabled');
  });

  it('returns 409 when active key cap is reached', async () => {
    (getApiKeyMaxActivePerPlayer as jest.Mock).mockReturnValue(2);
    (apiKeysRepo.getActiveApiKeyCount as jest.Mock).mockResolvedValue(2);

    const response = await request(app)
      .post('/api/auth/api-keys')
      .set(csrfHeader);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('active_key_limit_reached');
  });

  it('does not require CSRF header for non-cookie auth methods', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key_management',
      playerId: 'player-1',
      address: '0xabc',
    });

    const response = await request(app)
      .post('/api/auth/api-keys')
      .send({ name: 'bot' });

    expect(response.status).toBe(201);
  });

  it('allows API key principal to use lifecycle routes', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: 'player-1',
      address: '0xabc',
      apiKeyId: 'key-1',
    });

    const createResponse = await request(app)
      .post('/api/auth/api-keys')
      .send({ name: 'api-key-created-key' });
    expect(createResponse.status).toBe(201);

    const listResponse = await request(app).get('/api/auth/api-keys');
    expect(listResponse.status).toBe(200);
  });

  it('allows admin wallet to create key without stake balances', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'session_cookie',
      playerId: 'player-1',
      address: '0xc3c2e1cf099bc6e1fa94ce358562bcbd5cc59fe5',
    });
    (isStakeExemptAddress as jest.Mock).mockReturnValue(true);

    const response = await request(app)
      .post('/api/auth/api-keys')
      .set(csrfHeader)
      .send({ name: 'admin-bot' });

    expect(response.status).toBe(201);
    expect(verifyWalletOwnsAnyAavegotchi).not.toHaveBeenCalled();
  });
});
