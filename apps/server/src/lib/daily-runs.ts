import { GAME_CONFIG } from './constants';

export interface DailyRunsTier {
  usdcStakedGte: number;
  dailyRuns: number;
}

export interface DailyRunsConfig {
  enabled: boolean;
  resetTimeUtcHour: number;
  tiers: DailyRunsTier[];
}

const DEFAULT_CONFIG: DailyRunsConfig = {
  enabled: true,
  resetTimeUtcHour: 0,
  tiers: [
    { usdcStakedGte: 0, dailyRuns: 10 },
    { usdcStakedGte: 100, dailyRuns: 20 },
    { usdcStakedGte: 1000, dailyRuns: 30 },
  ],
};

function clampResetHour(hour: unknown): number {
  const parsed = Number(hour);
  if (!Number.isFinite(parsed)) return DEFAULT_CONFIG.resetTimeUtcHour;
  const normalized = Math.floor(parsed);
  return Math.min(23, Math.max(0, normalized));
}

function normalizeTier(value: unknown): DailyRunsTier | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { usdcStakedGte?: unknown; dailyRuns?: unknown };
  const usdcStakedGte = Number(candidate.usdcStakedGte);
  const dailyRuns = Number(candidate.dailyRuns);
  if (!Number.isFinite(usdcStakedGte) || usdcStakedGte < 0) return null;
  if (!Number.isFinite(dailyRuns) || dailyRuns < 0) return null;
  return {
    usdcStakedGte,
    dailyRuns: Math.floor(dailyRuns),
  };
}

function normalizeTiers(raw: unknown): DailyRunsTier[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_CONFIG.tiers];
  }
  const tiers = raw
    .map(normalizeTier)
    .filter((tier): tier is DailyRunsTier => Boolean(tier));
  return tiers.length > 0 ? tiers : [...DEFAULT_CONFIG.tiers];
}

export function getDailyRunsConfig(): DailyRunsConfig {
  const raw = (GAME_CONFIG as Record<string, unknown>)
    ?.dailyRuns as Partial<DailyRunsConfig> | undefined;

  if (!raw) {
    return DEFAULT_CONFIG;
  }

  return {
    enabled: raw.enabled !== false,
    resetTimeUtcHour: clampResetHour(raw.resetTimeUtcHour),
    tiers: normalizeTiers(raw.tiers),
  };
}

export function getDailyRunAllowance(input: {
  usdcStaked: number;
  tiers: DailyRunsTier[];
}): number {
  const normalizedStake = Number.isFinite(input.usdcStaked)
    ? Math.max(0, input.usdcStaked)
    : 0;
  const sortedTiers = [...input.tiers].sort(
    (a, b) => a.usdcStakedGte - b.usdcStakedGte
  );

  let allowance = 0;
  for (const tier of sortedTiers) {
    if (normalizedStake >= tier.usdcStakedGte) {
      allowance = Math.max(allowance, tier.dailyRuns);
    }
  }

  return Math.max(0, Math.floor(allowance));
}

export function getDailyRunsDate(options?: {
  nowMs?: number;
  offsetDays?: number;
}): string {
  const config = getDailyRunsConfig();
  const resetHour = config.resetTimeUtcHour;
  const now = new Date(options?.nowMs ?? Date.now());
  const anchor = new Date(now);

  if (anchor.getUTCHours() < resetHour) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  anchor.setUTCHours(resetHour, 0, 0, 0);

  if (options?.offsetDays) {
    anchor.setUTCDate(anchor.getUTCDate() + Math.trunc(options.offsetDays));
  }

  return anchor.toISOString().slice(0, 10);
}

export function getDailyRunsResetAt(options?: { nowMs?: number }): string {
  const config = getDailyRunsConfig();
  const resetHour = config.resetTimeUtcHour;
  const now = new Date(options?.nowMs ?? Date.now());
  const nextReset = new Date(now);

  nextReset.setUTCHours(resetHour, 0, 0, 0);
  if (nextReset.getTime() <= now.getTime()) {
    nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  }

  return nextReset.toISOString();
}
