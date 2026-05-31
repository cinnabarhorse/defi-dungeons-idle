import type { TradeToken } from '../../trading-game';
import type {
  OracleAdapter,
  OracleAdapterQuote,
  OracleSampleOptions,
} from '../types';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const REQUEST_TIMEOUT_MS = 6000;
const COINGECKO_USER_AGENT =
  process.env.COINGECKO_USER_AGENT ||
  'gotchiverse-server/1.0 (+https://aavegotchi.com)';

const TOKEN_ID_MAP: Record<TradeToken, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  GHST: 'aavegotchi',
};

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': COINGECKO_USER_AGENT,
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
    throw new Error(`Invalid CoinGecko ${field}: ${raw}`);
  }
  return value;
}

function getTokenId(token: TradeToken): string {
  return TOKEN_ID_MAP[token];
}

async function getSpotQuote(token: TradeToken): Promise<OracleAdapterQuote> {
  const tokenId = getTokenId(token);
  const payload = await fetchJson(
    `${COINGECKO_API_BASE}/simple/price?ids=${tokenId}&vs_currencies=usd&include_last_updated_at=true`
  );
  const tokenPayload = payload?.[tokenId];
  const priceUsd = parsePositiveNumber(tokenPayload?.usd, 'usd');
  const updatedAtSec = Number(tokenPayload?.last_updated_at);
  const sampledAtMs =
    Number.isFinite(updatedAtSec) && updatedAtSec > 0
      ? updatedAtSec * 1000
      : Date.now();
  return {
    priceUsd,
    sampledAtMs,
    ticks: 1,
    meta: {
      endpoint: 'simple/price',
      tokenId,
    },
  };
}

async function getTwapQuote(
  token: TradeToken,
  options: OracleSampleOptions
): Promise<OracleAdapterQuote> {
  const tokenId = getTokenId(token);
  const atMs = Math.floor(options.atMs ?? Date.now());
  const windowMs = Math.max(60_000, Math.floor(options.windowMs ?? 60_000));
  const fromSec = Math.max(0, Math.floor((atMs - windowMs) / 1000));
  const toSec = Math.floor(atMs / 1000);

  const payload = await fetchJson(
    `${COINGECKO_API_BASE}/coins/${tokenId}/market_chart/range?vs_currency=usd&from=${fromSec}&to=${toSec}`
  );
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  let sum = 0;
  let count = 0;
  let sampledAtMs = 0;
  for (const point of prices) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const ts = Number(point[0]);
    const price = Number(point[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;
    sum += price;
    count += 1;
    sampledAtMs = Math.max(sampledAtMs, ts);
  }
  if (count === 0) {
    throw new Error('CoinGecko range response empty');
  }
  return {
    priceUsd: sum / count,
    sampledAtMs: sampledAtMs || atMs,
    ticks: count,
    meta: {
      endpoint: 'market_chart/range',
      tokenId,
      fromSec,
      toSec,
      windowMs,
    },
  };
}

export const coingeckoOracleAdapter: OracleAdapter = {
  id: 'coingecko',
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
