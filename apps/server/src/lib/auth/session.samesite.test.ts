import { getSameSiteParam } from './session';

describe('auth/session getSameSiteParam', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.SESSION_COOKIE_SAMESITE;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('defaults to none for localhost-style (no domain) cookies in non-production', () => {
    process.env.NODE_ENV = 'test';
    expect(getSameSiteParam('')).toBe('none');
  });

  it('honors explicit SESSION_COOKIE_SAMESITE override', () => {
    process.env.SESSION_COOKIE_SAMESITE = 'lax';
    expect(getSameSiteParam('')).toBe('lax');
    process.env.SESSION_COOKIE_SAMESITE = 'STRICT';
    expect(getSameSiteParam('')).toBe('strict');
  });
});
