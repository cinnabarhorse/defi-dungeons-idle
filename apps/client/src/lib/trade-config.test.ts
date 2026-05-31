import {
  formatTradeDirectionLabel,
  TRADE_LEVERAGE_MAX,
  TRADE_LEVERAGE_MIN,
  TRADE_LEVERAGE_QUICK_OPTIONS,
  normalizeTradeDirection,
  normalizeTradeLeverage,
  normalizeTradeToken,
} from './trade-config';

describe('trade config', () => {
  it('normalizes supported tokens and falls back for unknown values', () => {
    expect(normalizeTradeToken('btc')).toBe('BTC');
    expect(normalizeTradeToken(' ETH ')).toBe('ETH');
    expect(normalizeTradeToken('GHST')).toBe('GHST');
    expect(normalizeTradeToken('SOL')).toBe('BTC');
    expect(normalizeTradeToken(undefined, 'ETH')).toBe('ETH');
  });

  it('normalizes supported directions and falls back for unknown values', () => {
    expect(normalizeTradeDirection('LONG')).toBe('long');
    expect(normalizeTradeDirection(' short ')).toBe('short');
    expect(normalizeTradeDirection('sideways')).toBe('long');
    expect(normalizeTradeDirection(undefined, 'short')).toBe('short');
  });

  it('formats direction labels for UI', () => {
    expect(formatTradeDirectionLabel('long')).toBe('📈 Up');
    expect(formatTradeDirectionLabel('short')).toBe('📉 Down');
  });

  it('clamps leverage to configured bounds', () => {
    expect(normalizeTradeLeverage(0)).toBe(TRADE_LEVERAGE_MIN);
    expect(normalizeTradeLeverage(5.5)).toBe(5.5);
    expect(normalizeTradeLeverage(100)).toBe(TRADE_LEVERAGE_MAX);
    expect(normalizeTradeLeverage('18')).toBe(18);
    expect(normalizeTradeLeverage(undefined)).toBe(TRADE_LEVERAGE_MIN);
    expect(normalizeTradeLeverage(undefined, 17)).toBe(17);
    expect(normalizeTradeLeverage(undefined, 40)).toBe(TRADE_LEVERAGE_MAX);
  });

  it('keeps quick leverage choices aligned with leverage cap', () => {
    expect(TRADE_LEVERAGE_QUICK_OPTIONS).toEqual([1, 2, 5, 10, 20]);
    expect(TRADE_LEVERAGE_QUICK_OPTIONS[0]).toBe(TRADE_LEVERAGE_MIN);
    expect(TRADE_LEVERAGE_QUICK_OPTIONS.at(-1)).toBe(TRADE_LEVERAGE_MAX);
    expect(
      TRADE_LEVERAGE_QUICK_OPTIONS.every(
        (value) => value >= TRADE_LEVERAGE_MIN && value <= TRADE_LEVERAGE_MAX
      )
    ).toBe(true);
  });
});
