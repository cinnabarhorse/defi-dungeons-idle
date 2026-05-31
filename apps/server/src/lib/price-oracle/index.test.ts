const mockGetSpotUsd = jest.fn();
const mockSampleTwapUsd = jest.fn();
const mockCoingeckoAdapter = {
  id: 'coingecko',
  getSpotUsd: mockGetSpotUsd,
  sampleTwapUsd: mockSampleTwapUsd,
};

const mockAerodromeGetSpotUsd = jest.fn();
const mockAerodromeSampleTwapUsd = jest.fn();
const mockAerodromeAdapter = {
  id: 'aerodrome_base',
  getSpotUsd: mockAerodromeGetSpotUsd,
  sampleTwapUsd: mockAerodromeSampleTwapUsd,
};

jest.mock('./adapters/coingecko', () => ({
  coingeckoOracleAdapter: mockCoingeckoAdapter,
}));

jest.mock('./adapters/aerodrome-base', () => ({
  aerodromeBaseOracleAdapter: mockAerodromeAdapter,
}));

import { clearPriceOracleCache, getSpotUsd } from './index';

describe('price oracle cache fallback', () => {
  const originalAdapterId = mockCoingeckoAdapter.id;
  let nowMs = 1_700_000_000_000;
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    mockCoingeckoAdapter.id = originalAdapterId;
    mockGetSpotUsd.mockReset();
    mockSampleTwapUsd.mockReset();
    mockAerodromeGetSpotUsd.mockReset();
    mockAerodromeSampleTwapUsd.mockReset();
    mockAerodromeGetSpotUsd.mockRejectedValue(new Error('Aerodrome unavailable'));
    mockAerodromeSampleTwapUsd.mockRejectedValue(
      new Error('Aerodrome unavailable')
    );
    clearPriceOracleCache();
    nowMs = 1_700_000_000_000;
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
    clearPriceOracleCache();
    mockCoingeckoAdapter.id = originalAdapterId;
  });

  it('falls back to Aerodrome when CoinGecko fails', async () => {
    mockGetSpotUsd.mockRejectedValueOnce(new Error('HTTP 429'));
    mockAerodromeGetSpotUsd.mockResolvedValueOnce({
      priceUsd: 99.12,
      sampledAtMs: nowMs,
      ticks: 1,
      meta: {},
    });

    const quote = await getSpotUsd('ETH');
    expect(quote.priceUsd).toBe(99.12);
    expect(quote.source).toBe('aerodrome_base');
    expect((quote.oracleMeta as any).sourcesSucceeded).toEqual([
      'aerodrome_base',
    ]);
  });

  it('uses cache fallback when source temporarily fails within max cache age', async () => {
    mockGetSpotUsd.mockResolvedValueOnce({
      priceUsd: 101,
      sampledAtMs: nowMs,
      ticks: 1,
      meta: {},
    });

    const initial = await getSpotUsd('BTC');
    expect(initial.priceUsd).toBe(101);

    mockGetSpotUsd.mockRejectedValueOnce(new Error('HTTP 429'));
    nowMs += 60_000;

    const fallback = await getSpotUsd('BTC');
    expect(fallback.source).toBe('cache');
    expect(fallback.priceUsd).toBe(101);
    expect((fallback.oracleMeta as any).fallbackReason).toBe('all_sources_failed');
  });

  it('does not reuse cache fallback once cache is too old', async () => {
    mockGetSpotUsd.mockResolvedValueOnce({
      priceUsd: 102,
      sampledAtMs: nowMs,
      ticks: 1,
      meta: {},
    });

    await getSpotUsd('BTC');

    mockGetSpotUsd.mockRejectedValueOnce(new Error('HTTP 429'));
    nowMs += 11 * 60_000;

    await expect(getSpotUsd('BTC')).rejects.toThrow(
      'No oracle sources available for BTC'
    );
  });

  it('does not reuse cache that references inactive sources', async () => {
    mockCoingeckoAdapter.id = 'binance';
    mockGetSpotUsd.mockResolvedValueOnce({
      priceUsd: 103,
      sampledAtMs: nowMs,
      ticks: 1,
      meta: {},
    });

    await getSpotUsd('BTC');

    mockCoingeckoAdapter.id = 'coingecko';
    mockGetSpotUsd.mockRejectedValueOnce(new Error('HTTP 429'));
    nowMs += 60_000;

    await expect(getSpotUsd('BTC')).rejects.toThrow(
      'No oracle sources available for BTC'
    );
  });
});
