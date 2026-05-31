import type { TradeToken } from '../trading-game';
import { aerodromeBaseOracleAdapter } from './adapters/aerodrome-base';
import { coingeckoOracleAdapter } from './adapters/coingecko';
import type { OracleAdapter, OracleQuote } from './types';

const ADAPTERS: OracleAdapter[] = [
  aerodromeBaseOracleAdapter,
  coingeckoOracleAdapter,
];
const OUTLIER_THRESHOLD_RATIO = 0.2;
const SPOT_STALENESS_MS = 2 * 60 * 1000;
const CACHE_FALLBACK_MAX_AGE_MS = 10 * 60 * 1000;

export interface OracleSamplingOptions {
  strategy?: 'aggregate' | 'first_success';
  allowCacheFallback?: boolean;
}

interface CachedQuote {
  token: TradeToken;
  priceUsd: number;
  sampledAtMs: number;
  oracleMeta: Record<string, unknown>;
  updatedAtMs: number;
}

const CACHE = new Map<TradeToken, CachedQuote>();

interface QuoteCandidate {
  source: string;
  priceUsd: number;
  sampledAtMs: number;
  ticks: number;
  meta: Record<string, unknown>;
}

function parseFiniteNumber(raw: unknown): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function selectCandidates(candidates: QuoteCandidate[]): QuoteCandidate[] {
  if (candidates.length <= 1) {
    return candidates;
  }
  const priceMedian = median(candidates.map((candidate) => candidate.priceUsd));
  if (!Number.isFinite(priceMedian) || priceMedian <= 0) {
    return candidates;
  }
  const filtered = candidates.filter((candidate) => {
    const deltaRatio = Math.abs(candidate.priceUsd - priceMedian) / priceMedian;
    return deltaRatio <= OUTLIER_THRESHOLD_RATIO;
  });
  return filtered.length > 0 ? filtered : candidates;
}

function buildSuccessfulQuote(options: {
  token: TradeToken;
  mode: 'spot' | 'twap';
  atMs: number;
  windowMs: number;
  attemptedSources: string[];
  candidates: QuoteCandidate[];
}): OracleQuote {
  const selectedCandidates = selectCandidates(options.candidates);
  const priceUsd = average(selectedCandidates.map((candidate) => candidate.priceUsd));
  const sampledAtMs = Math.round(
    average(selectedCandidates.map((candidate) => candidate.sampledAtMs))
  );
  const allowedSkewMs =
    options.mode === 'spot' ? SPOT_STALENESS_MS : Math.max(options.windowMs * 2, 120_000);
  const referenceMs = options.mode === 'spot' ? Date.now() : options.atMs;
  const stale = Math.abs(referenceMs - sampledAtMs) > allowedSkewMs;

  const selectedSources = selectedCandidates.map((candidate) => candidate.source);
  const oracleMeta = {
    mode: options.mode,
    atMs: options.atMs,
    windowMs: options.windowMs,
    stale,
    sourcesAttempted: options.attemptedSources,
    sourcesSucceeded: options.candidates.map((candidate) => candidate.source),
    sourcesSelected: selectedSources,
    sourceChosen:
      selectedSources.length > 1 ? `aggregate:${selectedSources.join('+')}` : selectedSources[0],
    ticks: selectedCandidates.reduce((sum, candidate) => sum + candidate.ticks, 0),
    sampleDetails: selectedCandidates.map((candidate) => ({
      source: candidate.source,
      priceUsd: candidate.priceUsd,
      sampledAtMs: candidate.sampledAtMs,
      ticks: candidate.ticks,
      ...candidate.meta,
    })),
  } satisfies Record<string, unknown>;

  return {
    token: options.token,
    priceUsd,
    sampledAtMs,
    source: String(oracleMeta.sourceChosen),
    stale,
    oracleMeta,
  };
}

function parseSourceIdentifiers(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    return [];
  }
  const normalized = raw.trim();
  if (!normalized) {
    return [];
  }
  if (normalized.startsWith('aggregate:')) {
    return normalized
      .slice('aggregate:'.length)
      .split('+')
      .map((source) => source.trim())
      .filter((source) => source.length > 0);
  }
  return [normalized];
}

function getActiveSourceSet(): Set<string> {
  return new Set(ADAPTERS.map((adapter) => adapter.id));
}

function isCacheSourceCompatible(
  oracleMeta: Record<string, unknown>,
  activeSources: Set<string>
): boolean {
  const sourcesSucceeded = Array.isArray(oracleMeta.sourcesSucceeded)
    ? oracleMeta.sourcesSucceeded.map((source) => String(source).trim()).filter(Boolean)
    : [];
  const sourceChosen = parseSourceIdentifiers(oracleMeta.sourceChosen);
  const referencedSources = [...new Set([...sourcesSucceeded, ...sourceChosen])];

  if (referencedSources.length === 0) {
    return true;
  }
  return referencedSources.every((source) => activeSources.has(source));
}

function isTwapCacheTimingCompatible(
  oracleMeta: Record<string, unknown>,
  atMs: number,
  windowMs: number
): boolean {
  if (String(oracleMeta.mode ?? '') !== 'twap') {
    return false;
  }
  const cachedAtMs = parseFiniteNumber(oracleMeta.atMs);
  const cachedWindowMs = parseFiniteNumber(oracleMeta.windowMs);
  if (cachedAtMs == null || cachedWindowMs == null) {
    return false;
  }

  const expectedWindowMs = Math.max(60_000, Math.floor(windowMs));
  const allowedSkewMs = Math.max(expectedWindowMs, 60_000);
  if (Math.abs(cachedAtMs - atMs) > allowedSkewMs) {
    return false;
  }

  return Math.abs(cachedWindowMs - expectedWindowMs) <= 1_000;
}

function getCachedQuote(
  token: TradeToken,
  fallbackReason: string,
  request: {
    mode: 'spot' | 'twap';
    atMs: number;
    windowMs: number;
  }
): OracleQuote | null {
  const cached = CACHE.get(token);
  if (!cached) {
    return null;
  }

  const nowMs = Date.now();
  const cacheAgeMs = Math.max(0, nowMs - cached.updatedAtMs);
  if (cacheAgeMs > CACHE_FALLBACK_MAX_AGE_MS) {
    CACHE.delete(token);
    return null;
  }

  const activeSources = getActiveSourceSet();
  if (!isCacheSourceCompatible(cached.oracleMeta, activeSources)) {
    CACHE.delete(token);
    return null;
  }
  if (
    request.mode === 'twap' &&
    !isTwapCacheTimingCompatible(cached.oracleMeta, request.atMs, request.windowMs)
  ) {
    return null;
  }

  return {
    token,
    priceUsd: cached.priceUsd,
    sampledAtMs: cached.sampledAtMs,
    source: 'cache',
    stale: true,
    oracleMeta: {
      ...cached.oracleMeta,
      stale: true,
      sourceChosen: 'cache',
      fallbackReason,
      cacheUpdatedAtMs: cached.updatedAtMs,
      cacheAgeMs,
    },
  };
}

async function sampleOracleQuote(options: {
  token: TradeToken;
  mode: 'spot' | 'twap';
  atMs: number;
  windowMs: number;
  strategy?: 'aggregate' | 'first_success';
  allowCacheFallback?: boolean;
}): Promise<OracleQuote> {
  const strategy = options.strategy ?? 'aggregate';
  const attemptedSources: string[] = [];
  const candidates: QuoteCandidate[] = [];
  const sourceErrors: Array<{ source: string; error: string }> = [];

  const collectCandidate = async (adapter: OracleAdapter): Promise<boolean> => {
    attemptedSources.push(adapter.id);
    try {
      const quote =
        options.mode === 'spot'
          ? await adapter.getSpotUsd(options.token)
          : await adapter.sampleTwapUsd(options.token, {
              atMs: options.atMs,
              windowMs: options.windowMs,
            });
      candidates.push({
        source: adapter.id,
        priceUsd: quote.priceUsd,
        sampledAtMs: quote.sampledAtMs,
        ticks: Math.max(1, Math.floor(quote.ticks || 1)),
        meta: quote.meta ?? {},
      });
      return true;
    } catch (error) {
      sourceErrors.push({
        source: adapter.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  if (strategy === 'first_success') {
    for (const adapter of ADAPTERS) {
      const success = await collectCandidate(adapter);
      if (success) {
        break;
      }
    }
  } else {
    await Promise.all(
      ADAPTERS.map(async (adapter) => {
        await collectCandidate(adapter);
      })
    );
  }

  if (candidates.length > 0) {
    const quote = buildSuccessfulQuote({
      token: options.token,
      mode: options.mode,
      atMs: options.atMs,
      windowMs: options.windowMs,
      attemptedSources,
      candidates,
    });
    CACHE.set(options.token, {
      token: quote.token,
      priceUsd: quote.priceUsd,
      sampledAtMs: quote.sampledAtMs,
      oracleMeta: quote.oracleMeta,
      updatedAtMs: Date.now(),
    });
    return quote;
  }

  if (options.allowCacheFallback !== false) {
    const cachedQuote = getCachedQuote(options.token, 'all_sources_failed', {
      mode: options.mode,
      atMs: options.atMs,
      windowMs: options.windowMs,
    });
    if (cachedQuote) {
      return {
        ...cachedQuote,
        oracleMeta: {
          ...cachedQuote.oracleMeta,
          mode: options.mode,
          atMs: options.atMs,
          windowMs: options.windowMs,
          sourcesAttempted: attemptedSources,
          sourcesSucceeded: [],
          sourceErrors,
        },
      };
    }
  }

  throw new Error(
    `No oracle sources available for ${options.token}; errors: ${JSON.stringify(
      sourceErrors
    )}`
  );
}

export async function getSpotUsd(
  token: TradeToken,
  options: OracleSamplingOptions = {}
): Promise<OracleQuote> {
  return sampleOracleQuote({
    token,
    mode: 'spot',
    atMs: Date.now(),
    windowMs: 60_000,
    strategy: options.strategy,
    allowCacheFallback: options.allowCacheFallback,
  });
}

export async function sampleTwapUsd(
  token: TradeToken,
  windowMs: number = 60_000,
  atMs: number = Date.now(),
  options: OracleSamplingOptions = {}
): Promise<OracleQuote> {
  return sampleOracleQuote({
    token,
    mode: 'twap',
    atMs: Math.floor(atMs),
    windowMs: Math.max(60_000, Math.floor(windowMs)),
    strategy: options.strategy,
    allowCacheFallback: options.allowCacheFallback,
  });
}

export function clearPriceOracleCache(): void {
  CACHE.clear();
}
