import {
  API_KEY_MANAGEMENT_TOKEN_PURPOSE,
  createApiKeyManagementToken,
  getApiKeyManagementTokenTtlSeconds,
  verifyApiKeyManagementToken,
} from './api-key-management-token';

describe('api-key-management-token', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.API_KEY_MGMT_TOKEN_SECRET;
    delete process.env.API_KEY_MGMT_TOKEN_TTL_SECONDS;
    process.env.SESSION_SECRET = 'session-secret-for-tests';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses default TTL when env is missing or invalid', () => {
    delete process.env.API_KEY_MGMT_TOKEN_TTL_SECONDS;
    expect(getApiKeyManagementTokenTtlSeconds()).toBe(900);

    process.env.API_KEY_MGMT_TOKEN_TTL_SECONDS = 'bad';
    expect(getApiKeyManagementTokenTtlSeconds()).toBe(900);
  });

  it('issues and verifies management tokens with expected claims', () => {
    process.env.API_KEY_MGMT_TOKEN_SECRET = 'mgmt-secret';
    process.env.API_KEY_MGMT_TOKEN_TTL_SECONDS = '1200';

    const issued = createApiKeyManagementToken({
      playerId: 'player-1',
      address: '0xABC',
    });

    expect(typeof issued.token).toBe('string');
    expect(new Date(issued.expiresAt).toISOString()).toBe(issued.expiresAt);

    const claims = verifyApiKeyManagementToken(issued.token);
    expect(claims.playerId).toBe('player-1');
    expect(claims.address).toBe('0xabc');
    expect(claims.purpose).toBe(API_KEY_MANAGEMENT_TOKEN_PURPOSE);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('falls back to SESSION_SECRET when API_KEY_MGMT_TOKEN_SECRET is not set', () => {
    delete process.env.API_KEY_MGMT_TOKEN_SECRET;
    process.env.SESSION_SECRET = 'fallback-secret';

    const issued = createApiKeyManagementToken({
      playerId: 'player-2',
      address: '0xdef',
    });

    const claims = verifyApiKeyManagementToken(issued.token);
    expect(claims.playerId).toBe('player-2');
    expect(claims.address).toBe('0xdef');
  });

  it('rejects tokens with wrong purpose', () => {
    process.env.API_KEY_MGMT_TOKEN_SECRET = 'mgmt-secret';

    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const invalidPurposeToken = jwt.sign(
      {
        playerId: 'player-3',
        address: '0x123',
        purpose: 'wrong',
      },
      'mgmt-secret',
      { expiresIn: 60 }
    );

    expect(() => verifyApiKeyManagementToken(invalidPurposeToken)).toThrow(
      'Invalid API key management token purpose'
    );
  });

  it('rejects expired tokens', () => {
    process.env.API_KEY_MGMT_TOKEN_SECRET = 'mgmt-secret';

    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const expiredToken = jwt.sign(
      {
        playerId: 'player-4',
        address: '0xabc',
        purpose: API_KEY_MANAGEMENT_TOKEN_PURPOSE,
      },
      'mgmt-secret',
      { expiresIn: -1 }
    );

    expect(() => verifyApiKeyManagementToken(expiredToken)).toThrow();
  });
});
