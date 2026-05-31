import { fetchDedupe } from './fetch-dedupe';
import type { TradeDirection, TradeToken } from './trade-config';

export const OPEN_RUNS_REFRESH_EVENT = 'daily-quest:open-runs-refresh';

export interface OpenTradeRunEstimate {
  runId: string;
  competitionDate: string;
  difficultyId: string;
  token: TradeToken;
  direction: TradeDirection;
  riskLeverage: number;
  baseScore: number;
  timeMultiplier: number;
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
  entryPriceUsd: number;
  livePriceUsd: number;
  estimatedTradeMultiplier: number;
  estimatedFinalScore: number;
  closesAtUtc: string;
  secondsRemaining: number;
  updateCount: number;
  maxUpdates: number;
  canUpdate: boolean;
  canExtend: boolean;
  canClose: boolean;
}

export interface OpenTradeRunsResponse {
  runs: OpenTradeRunEstimate[];
  count: number;
}

export interface TradeMarketStatsResponse {
  token: TradeToken;
  priceUsd: number;
  change1hPct: number | null;
  change24hPct: number | null;
  stale: boolean;
  sampledAtMs: number;
}

export interface TradeFeePayload {
  currency: string;
  amount: number;
  newBalance: number | null;
}

export interface TradeEstimateSnapshot {
  livePriceUsd: number;
  priceStale: boolean;
  estimatedTradeMultiplier: number;
  estimatedFinalScore: number;
  closesAtUtc: string;
  secondsRemaining: number;
  canUpdate: boolean;
  canExtend: boolean;
  canClose: boolean;
}

export interface UpdateTradeRunRequest {
  runId: string;
  direction: TradeDirection;
  riskLeverage: number;
}

export interface UpdateTradeRunResponse {
  ok: boolean;
  tradeRun: Record<string, unknown>;
  estimate: TradeEstimateSnapshot;
  fee: TradeFeePayload;
}

export interface CloseTradeRunRequest {
  runId: string;
}

export interface CloseTradeRunResponse {
  ok: boolean;
  alreadySettled: boolean;
  tradeRun: Record<string, unknown> | null;
  leaderboardEntry: Record<string, unknown> | null;
  fee: TradeFeePayload | null;
}

export interface ExtendTradeRunRequest {
  runId: string;
}

export interface ExtendTradeRunResponse {
  ok: boolean;
  tradeRun: Record<string, unknown>;
  estimate: TradeEstimateSnapshot;
  fee: TradeFeePayload;
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as {
      error?: string;
    };
    const errorText = typeof payload?.error === 'string' ? payload.error : fallback;
    return new Error(errorText);
  } catch {
    return new Error(fallback);
  }
}

export async function fetchOpenRuns(
  serverBaseUrl: string,
  signal?: AbortSignal
): Promise<OpenTradeRunsResponse> {
  const response = await fetchDedupe(`${serverBaseUrl}/api/daily-quest/trade/open`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch open runs');
  }

  return (await response.json()) as OpenTradeRunsResponse;
}

export async function fetchTradeMarketStats(
  serverBaseUrl: string,
  token: TradeToken,
  signal?: AbortSignal
): Promise<TradeMarketStatsResponse> {
  const params = new URLSearchParams({ token });
  const response = await fetchDedupe(
    `${serverBaseUrl}/api/daily-quest/trade/market?${params.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal,
    }
  );

  if (!response.ok) {
    throw await parseError(response, 'Failed to fetch trade market stats');
  }

  return (await response.json()) as TradeMarketStatsResponse;
}

export async function updateRun(
  serverBaseUrl: string,
  payload: UpdateTradeRunRequest
): Promise<UpdateTradeRunResponse> {
  const response = await fetch(`${serverBaseUrl}/api/daily-quest/trade/update`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to update trade run');
  }

  return (await response.json()) as UpdateTradeRunResponse;
}

export async function closeRun(
  serverBaseUrl: string,
  payload: CloseTradeRunRequest
): Promise<CloseTradeRunResponse> {
  const response = await fetch(`${serverBaseUrl}/api/daily-quest/trade/close`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to close trade run');
  }

  return (await response.json()) as CloseTradeRunResponse;
}

export async function extendRun(
  serverBaseUrl: string,
  payload: ExtendTradeRunRequest
): Promise<ExtendTradeRunResponse> {
  const response = await fetch(`${serverBaseUrl}/api/daily-quest/trade/extend`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Failed to extend trade run');
  }

  return (await response.json()) as ExtendTradeRunResponse;
}

export function dispatchOpenRunsRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_RUNS_REFRESH_EVENT));
}
