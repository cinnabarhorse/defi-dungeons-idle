import {
  API_KEY_PREFIX,
  extractBearerToken,
  generateApiKey,
  getApiKeyMaxActivePerPlayer,
  getApiKeyPrefix,
  getRequestIpFromHeaders,
  hashApiKey,
  isApiKeyToken,
  isStakedApiKeysEnabled,
  maskApiKeyForLogs,
  validateStakedApiKeyConfiguration,
} from './api-keys';

describe('auth api key helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('generates keys in ddk_live_* format', () => {
    const key = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key.length).toBeGreaterThan(API_KEY_PREFIX.length + 10);
    expect(isApiKeyToken(key)).toBe(true);
  });

  it('hashes keys with HMAC', () => {
    process.env.API_KEY_HASH_SECRET = 'test-secret';
    const key = 'ddk_live_example_key';
    const first = hashApiKey(key);
    const second = hashApiKey(key);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('masks key values for logs', () => {
    expect(maskApiKeyForLogs('ddk_live_abcdefghijklmnopqrstuvwxyz')).toMatch(
      /^ddk_live.*\.\.\..+$/
    );
  });

  it('parses bearer tokens and prefixes', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
    expect(extractBearerToken('abc123')).toBeNull();
    expect(getApiKeyPrefix('ddk_live_1234567890abcdef')).toBe(
      'ddk_live_1234567890'
    );
  });

  it('reads feature flags and max active keys', () => {
    process.env.ENABLE_STAKED_API_KEYS = '1';
    process.env.API_KEY_MAX_ACTIVE_PER_PLAYER = '7';
    expect(isStakedApiKeysEnabled()).toBe(true);
    expect(getApiKeyMaxActivePerPlayer()).toBe(7);
  });

  it('fails fast when API keys are enabled without hash secret', () => {
    process.env.ENABLE_STAKED_API_KEYS = '1';
    delete process.env.API_KEY_HASH_SECRET;
    expect(() => validateStakedApiKeyConfiguration()).toThrow(
      /API_KEY_HASH_SECRET/
    );
  });

  it('only trusts x-forwarded-for when explicitly enabled', () => {
    delete process.env.TRUST_PROXY;
    delete process.env.API_KEY_TRUST_X_FORWARDED_FOR;
    expect(
      getRequestIpFromHeaders(
        { 'x-forwarded-for': '1.2.3.4' },
        '5.6.7.8'
      )
    ).toBe('5.6.7.8');

    process.env.API_KEY_TRUST_X_FORWARDED_FOR = '1';
    expect(
      getRequestIpFromHeaders(
        { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' },
        '5.6.7.8'
      )
    ).toBe('1.2.3.4');
  });
});
