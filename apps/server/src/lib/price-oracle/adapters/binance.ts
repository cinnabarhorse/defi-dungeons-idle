import type { TradeToken } from '../../trading-game';
import type {
  OracleAdapter,
  OracleAdapterQuote,
  OracleSampleOptions,
} from '../types';

const BINANCE_API_BASE = 'https://api.binance.com';
const REQUEST_TIMEOUT_MS = 6000;

const TOKEN_SYMBOL_MAP: Record<TradeToken, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  GHST: 'GHSTUSDT',
};

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parsePositiveNumber(raw: unknown, field: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid Binance ${field}: ${raw}`);
  }
  return value;
}

function getSymbol(token: TradeToken): string {
  return TOKEN_SYMBOL_MAP[token];
}

async function getSpotQuote(token: TradeToken): Promise<OracleAdapterQuote> {
  const symbol = getSymbol(token);
  const payload = await fetchJson(
    `${BINANCE_API_BASE}/api/v3/ticker/price?symbol=${symbol}`
  );
  const priceUsd = parsePositiveNumber(payload?.price, 'price');
  return {
    priceUsd,
    sampledAtMs: Date.now(),
    ticks: 1,
    meta: {
      endpoint: 'ticker/price',
      symbol,
    },
  };
}

async function getTwapQuote(
  token: TradeToken,
  options: OracleSampleOptions
): Promise<OracleAdapterQuote> {
  const symbol = getSymbol(token);
  const windowMs = Math.max(60_000, Math.floor(options.windowMs ?? 60_000));
  const atMs = Math.floor(options.atMs ?? Date.now());
  const limit = Math.max(1, Math.min(5, Math.ceil(windowMs / 60_000) + 1));
  const payload = await fetchJson(
    `${BINANCE_API_BASE}/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}&endTime=${atMs}`
  );
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('Binance kline response empty');
  }
  let sum = 0;
  let count = 0;
  let sampledAtMs = 0;
  for (const candle of payload) {
    if (!Array.isArray(candle) || candle.length < 7) continue;
    const open = Number(candle[1]);
    const high = Number(candle[2]);
    const low = Number(candle[3]);
    const close = Number(candle[4]);
    const closeTime = Number(candle[6]);
    if (![open, high, low, close, closeTime].every(Number.isFinite)) continue;
    const candleAvg = (open + high + low + close) / 4;
    if (!Number.isFinite(candleAvg) || candleAvg <= 0) continue;
    sum += candleAvg;
    count += 1;
    sampledAtMs = Math.max(sampledAtMs, closeTime);
  }
  if (count === 0) {
    throw new Error('Binance kline response contained no valid candles');
  }
  return {
    priceUsd: sum / count,
    sampledAtMs: sampledAtMs || atMs,
    ticks: count,
    meta: {
      endpoint: 'klines',
      symbol,
      interval: '1m',
      limit,
      atMs,
      windowMs,
    },
  };
}

export const binanceOracleAdapter: OracleAdapter = {
  id: 'binance',
  async getSpotUsd(token: TradeToken): Promise<OracleAdapterQuote> {
    return getSpotQuote(token);
  },
  async sampleTwapUsd(
    token: TradeToken,
    options: OracleSampleOptions
  ): Promise<OracleAdapterQuote> {
    return getTwapQuote(token, options);
  },
};

