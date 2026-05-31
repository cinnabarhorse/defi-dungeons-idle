import type { Request } from 'express';

// These tests focus on the branchy behavior in session cookie + session resolution
// logic. They mock token signing/verification and the authSessionsRepo.

describe('session auth utilities', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SESSION_COOKIE_DOMAIN;
    delete process.env.SIWE_DOMAIN;
    delete process.env.SESSION_COOKIE_SAMESITE;
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.SESSION_SECRET;
    delete process.env.SESSION_CACHE_TTL_MS;
    delete process.env.DEBUG_SESSION_AUTH;
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('getSameSiteParam defaults to "none" in non-production when no cookieDomain', async () => {
    const { getSameSiteParam } = await import('./session');

    expect(getSameSiteParam('')).toBe('none');
  });

  test('createSessionCookie collapses SIWE_DOMAIN subdomains to apex .aavegotchi.com', async () => {
    process.env.SIWE_DOMAIN = 'play.aavegotchi.com';

    jest.doMock('./token', () => {
      return {
        SESSION_COOKIE_NAME: 'dd-session',
        SESSION_DURATION_SECONDS: 60,
        signSessionToken: jest.fn(() => 'signed-token'),
        verifySessionToken: jest.fn(),
      };
    });

    const { createSessionCookie } = await import('./session');

    const { cookie, token } = createSessionCookie({
      address: '0xAbC',
      sessionId: 'sess_123',
      expirationSeconds: 123,
    });

    expect(token).toBe('signed-token');
    // Domain should be forced to apex for any aavegotchi.com subdomain
    expect(cookie).toContain('Domain=.aavegotchi.com');
    // Dev default for cross-site flows should use SameSite=None
    expect(cookie).toContain('SameSite=None');
  });

  test('resolveSessionFromRequest caches resolved sessions when TTL > 0', async () => {
    process.env.SESSION_CACHE_TTL_MS = '60000';

    const getValidAuthSessionById = jest.fn(async () => ({
      id: 'sess_123',
      playerId: 'player_1',
      walletAddress: '0xabc',
      nonce: 'nonce',
      issuedAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2030-01-01T00:00:00.000Z',
      userAgent: null,
      ip: null,
      valid: true,
    }));

    jest.doMock('../db', () => ({
      authSessionsRepo: { getValidAuthSessionById },
    }));

    jest.doMock('./token', () => {
      return {
        SESSION_COOKIE_NAME: 'dd-session',
        SESSION_DURATION_SECONDS: 60,
        signSessionToken: jest.fn(() => 'signed-token'),
        verifySessionToken: jest.fn(() => ({
          address: '0xabc',
          sessionId: 'sess_123',
          exp: 0,
          iat: 0,
        })),
      };
    });

    const { resolveSessionFromRequest } = await import('./session');

    const req = {
      method: 'GET',
      url: '/api/me',
      headers: {
        cookie: 'dd-session=anytoken',
      },
    } as unknown as Request;

    const first = await resolveSessionFromRequest(req);
    const second = await resolveSessionFromRequest(req);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.playerId).toBe('player_1');
    // repo only hit once due to cache
    expect(getValidAuthSessionById).toHaveBeenCalledTimes(1);
  });

  test('readSessionFromRequest returns null when token verification throws', async () => {
    jest.doMock('./token', () => {
      return {
        SESSION_COOKIE_NAME: 'dd-session',
        SESSION_DURATION_SECONDS: 60,
        signSessionToken: jest.fn(() => 'signed-token'),
        verifySessionToken: jest.fn(() => {
          throw new Error('bad token');
        }),
      };
    });

    const { readSessionFromRequest } = await import('./session');

    const req = {
      method: 'GET',
      url: '/api/me',
      headers: {
        cookie: 'dd-session=bad',
      },
    } as unknown as Request;

    expect(readSessionFromRequest(req)).toBeNull();
  });
});
