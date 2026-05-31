import type { TradeToken } from '../trading-game';

export interface OracleQuote {
  token: TradeToken;
  priceUsd: number;
  sampledAtMs: number;
  source: string;
  stale: boolean;
  oracleMeta: Record<string, unknown>;
}

export interface OracleSampleOptions {
  atMs?: number;
  windowMs?: number;
}

export interface OracleAdapterQuote {
  priceUsd: number;
  sampledAtMs: number;
  ticks: number;
  meta?: Record<string, unknown>;
}

export interface OracleAdapter {
  id: string;
  getSpotUsd(token: TradeToken): Promise<OracleAdapterQuote>;
  sampleTwapUsd(
    token: TradeToken,
    options: OracleSampleOptions
  ): Promise<OracleAdapterQuote>;
}

