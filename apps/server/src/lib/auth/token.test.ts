import { signSessionToken, verifySessionToken, SESSION_DURATION_SECONDS } from './token';

/**
 * These tests are intentionally small + deterministic.
 * The auth token helpers are used by GameRoom/SharedGame and are often mocked,
 * so we validate the real signing/verifying behavior here.
 */

describe('auth/token', () => {
  const SECRET = 'unit-test-secret';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-30T21:25:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('signSessionToken + verifySessionToken round-trip preserves address + sessionId', () => {
    const token = signSessionToken(
      { address: '0xabc', sessionId: 'sess-123' },
      SECRET
    );

    const payload = verifySessionToken(token, SECRET);

    expect(payload.address).toBe('0xabc');
    expect(payload.sessionId).toBe('sess-123');
    // jwt iat/exp are seconds since epoch
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(SESSION_DURATION_SECONDS);
  });

  it('signSessionToken honors expirationSeconds override', () => {
    const token = signSessionToken(
      { address: '0xdef', sessionId: 'sess-override' },
      SECRET,
      { expirationSeconds: 60 }
    );

    const payload = verifySessionToken(token, SECRET);
    expect(payload.exp - payload.iat).toBe(60);
  });

  it('verifySessionToken throws for invalid tokens or wrong secret', () => {
    const token = signSessionToken(
      { address: '0xabc', sessionId: 'sess-123' },
      SECRET
    );

    expect(() => verifySessionToken('not-a-jwt', SECRET)).toThrow();
    expect(() => verifySessionToken(token, 'wrong-secret')).toThrow();
  });

  it('throws when verifying with the wrong secret', () => {
    const token = signSessionToken(
      { address: '0xabc', sessionId: 'session-wrong-secret' },
      'secret-a'
    );

    expect(() => verifySessionToken(token, 'secret-b')).toThrow(
      /invalid signature/i
    );
  });

  it('throws when verifying a malformed token', () => {
    expect(() => verifySessionToken('not-a-jwt', 'secret')).toThrow();
  });
});
