export const TRADE_TOKENS = ['BTC', 'ETH', 'GHST'] as const;
export type TradeToken = (typeof TRADE_TOKENS)[number];

export const TRADE_DIRECTIONS = ['long', 'short'] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

export const TRADE_LEVERAGE_MIN = 1;
export const TRADE_LEVERAGE_MAX = 20;
export const TRADE_LEVERAGE_QUICK_OPTIONS = [1, 2, 5, 10, 20] as const;
export const TRADE_CLOSE_FEE_GOLD = 25;
export const TRADE_UPDATE_FEE_GOLD = 50;
export const TRADE_EXTEND_FEE_GOLD = 50;
export const TRADE_EXTEND_WINDOW_MINUTES = 15;
export const TRADE_MAX_UPDATES = 1;

export function normalizeTradeToken(
  value: unknown,
  fallback: TradeToken = 'BTC'
): TradeToken {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'BTC' || normalized === 'ETH' || normalized === 'GHST') {
    return normalized;
  }
  return fallback;
}

export function normalizeTradeDirection(
  value: unknown,
  fallback: TradeDirection = 'long'
): TradeDirection {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'long' || normalized === 'short') {
    return normalized;
  }
  return fallback;
}

export function formatTradeDirectionLabel(direction: TradeDirection): string {
  return direction === 'short' ? '📉 Down' : '📈 Up';
}

export function normalizeTradeLeverage(
  value: unknown,
  fallback: number = TRADE_LEVERAGE_MIN
): number {
  const fallbackLeverage = Number.isFinite(fallback)
    ? Number(fallback)
    : TRADE_LEVERAGE_MIN;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(
      TRADE_LEVERAGE_MIN,
      Math.min(TRADE_LEVERAGE_MAX, fallbackLeverage)
    );
  }
  return Math.max(TRADE_LEVERAGE_MIN, Math.min(TRADE_LEVERAGE_MAX, parsed));
}
