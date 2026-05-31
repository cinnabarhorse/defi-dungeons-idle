import type { Request } from 'express';

// NOTE: This module derives SESSION_CACHE_TTL_MS at import time.
// Tests that need a specific TTL must set env vars before importing.

describe('lib/auth/session', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DEBUG_SESSION_AUTH;
    delete process.env.SESSION_COOKIE_DOMAIN;
    delete process.env.SIWE_DOMAIN;
    delete process.env.SESSION_COOKIE_SAMESITE;
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.SESSION_CACHE_TTL_MS;

    // keep JWT signing deterministic for tests
    process.env.SESSION_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function makeReq(cookieHeader?: string): Request {
    return {
      method: 'GET',
      url: '/test',
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    } as any;
  }

  it('createSessionCookie normalizes address and sets a cookie value', async () => {
    const mod = await import('../session');

    const { cookie, token } = mod.createSessionCookie({
      address: '0xABCDEF',
      sessionId: 'sess-1',
      expirationSeconds: 60,
    });

    expect(token).toEqual(expect.any(String));
    expect(cookie).toContain('dd-session=');

    const session = mod.readSessionFromRequest(makeReq(cookie));
    expect(session).toEqual({
      address: '0xabcdef',
      sessionId: 'sess-1',
      token: expect.any(String),
    });
  });

  it('readSessionFromRequest returns null for missing cookie header and for invalid tokens', async () => {
    const mod = await import('../session');

    expect(mod.readSessionFromRequest(makeReq())).toBeNull();

    // malformed token should be rejected
    const req = makeReq('dd-session=not-a-jwt');
    expect(mod.readSessionFromRequest(req)).toBeNull();
  });

  it('resolveSessionFromRequest caches resolved sessions within the TTL', async () => {
    process.env.SESSION_CACHE_TTL_MS = '10000';

    const mod = await import('../session');
    const db = await import('../../db');

    const getValid = jest
      .spyOn(db.authSessionsRepo, 'getValidAuthSessionById')
      .mockResolvedValue({
        id: 'sess-1',
        walletAddress: '0xabc',
        playerId: 'player-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } as any);

    const { cookie } = mod.createSessionCookie({
      address: '0xAbC',
      sessionId: 'sess-1',
      expirationSeconds: 60,
    });

    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    const req = makeReq(cookie);

    const first = await mod.resolveSessionFromRequest(req);
    const second = await mod.resolveSessionFromRequest(req);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).toEqual(second);

    // should only hit the DB once due to in-memory cache
    expect(getValid).toHaveBeenCalledTimes(1);
  });
});
