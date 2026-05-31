/**
 * Daily Quest Competition System (v1.1)
 *
 * Core utilities for the competitive leaderboard-based daily quest system.
 * See /docs/dailyquestcompetition.md for full design documentation.
 */

import { GAME_CONFIG } from './constants';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type CompetitionTier = 'normal' | 'nightmare' | 'hell';

export interface DailyQuestCompetitionConfig {
  enabled: boolean;
  resetTimeUtcHour: number;
  tierUnlockThresholds: Record<CompetitionTier, number>;
  timeMultipliers: Array<{ hoursAfterReset: number; multiplier: number }>;
  weeklyBudget: { usdc: number; ghst: number };
  tierDistribution: Record<CompetitionTier, number>;
  positionShares: number[];
  requireBossKill: boolean;
  topPositions: number;
  unclaimedReturnsToTreasury: boolean;
  appliesToIdleModeOnly: boolean;
  soloOnly: boolean;
  difficultyTierPrefixes: string[];
  /** Number of daily competition runs per day (across all tiers) */
  dailyRunsPerDay: number;
}

const DEFAULT_CONFIG: DailyQuestCompetitionConfig = {
  enabled: true,
  resetTimeUtcHour: 0,
  // NOTE: Requirements removed - all tiers now open to everyone
  tierUnlockThresholds: {
    normal: 0,
    nightmare: 0,
    hell: 0,
  },
  timeMultipliers: [
    { hoursAfterReset: 0, multiplier: 1.5 },
    { hoursAfterReset: 4, multiplier: 1.35 },
    { hoursAfterReset: 8, multiplier: 1.2 },
    { hoursAfterReset: 12, multiplier: 1.1 },
    { hoursAfterReset: 16, multiplier: 1.0 },
  ],
  weeklyBudget: { usdc: 0, ghst: 0 },
  tierDistribution: { normal: 0.2, nightmare: 0.3, hell: 0.5 },
  positionShares: [0.3, 0.2, 0.15, 0.1, 0.08, 0.06, 0.05, 0.03, 0.02, 0.01],
  requireBossKill: true,
  topPositions: 10,
  unclaimedReturnsToTreasury: true,
  appliesToIdleModeOnly: true,
  soloOnly: true,
  difficultyTierPrefixes: ['normal', 'nightmare', 'hell'],
  dailyRunsPerDay: 3,
};

// ──────────────────────────────────────────────────────────────────────────────
// Config Reader
// ──────────────────────────────────────────────────────────────────────────────

function clampResetHour(hour: unknown): number {
  const parsed = Number(hour);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.floor(parsed);
  return Math.min(23, Math.max(0, normalized));
}

export function getDailyQuestCompetitionConfig(): DailyQuestCompetitionConfig {
  const raw = (GAME_CONFIG as Record<string, unknown>)
    ?.dailyQuestCompetition as Partial<DailyQuestCompetitionConfig> | undefined;

  if (!raw) {
    return DEFAULT_CONFIG;
  }

  return {
    enabled: raw.enabled !== false,
    resetTimeUtcHour: clampResetHour(raw.resetTimeUtcHour),
    tierUnlockThresholds: {
      ...DEFAULT_CONFIG.tierUnlockThresholds,
      ...(raw.tierUnlockThresholds ?? {}),
    },
    timeMultipliers: Array.isArray(raw.timeMultipliers)
      ? raw.timeMultipliers
      : DEFAULT_CONFIG.timeMultipliers,
    weeklyBudget: {
      ...DEFAULT_CONFIG.weeklyBudget,
      ...(raw.weeklyBudget ?? {}),
    },
    tierDistribution: {
      ...DEFAULT_CONFIG.tierDistribution,
      ...(raw.tierDistribution ?? {}),
    },
    positionShares: Array.isArray(raw.positionShares)
      ? raw.positionShares
      : DEFAULT_CONFIG.positionShares,
    requireBossKill: raw.requireBossKill !== false,
    topPositions:
      typeof raw.topPositions === 'number'
        ? raw.topPositions
        : DEFAULT_CONFIG.topPositions,
    unclaimedReturnsToTreasury: raw.unclaimedReturnsToTreasury !== false,
    appliesToIdleModeOnly: raw.appliesToIdleModeOnly !== false,
    soloOnly: raw.soloOnly !== false,
    difficultyTierPrefixes: Array.isArray(raw.difficultyTierPrefixes)
      ? raw.difficultyTierPrefixes
      : DEFAULT_CONFIG.difficultyTierPrefixes,
    dailyRunsPerDay:
      typeof raw.dailyRunsPerDay === 'number' && raw.dailyRunsPerDay > 0
        ? raw.dailyRunsPerDay
        : DEFAULT_CONFIG.dailyRunsPerDay,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Competition Tier Resolution
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert a game difficulty ID (e.g., "normal_1", "nightmare_2") to a competition tier.
 */
export function getCompetitionTier(
  difficultyId: string
): CompetitionTier | null {
  const normalized = (difficultyId || '').toLowerCase();
  const config = getDailyQuestCompetitionConfig();

  for (const prefix of config.difficultyTierPrefixes) {
    if (normalized.startsWith(prefix)) {
      return prefix as CompetitionTier;
    }
  }

  return null;
}

/**
 * Check if a difficulty ID is eligible for the competition.
 */
export function isDifficultyEligible(difficultyId: string): boolean {
  return getCompetitionTier(difficultyId) !== null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Time Multiplier Calculation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get the current date string (YYYY-MM-DD) for the competition day.
 * Similar to getDailyDate but specific to competition config.
 */
export function getCompetitionDate(options?: {
  nowMs?: number;
  offsetDays?: number;
}): string {
  const config = getDailyQuestCompetitionConfig();
  const resetHour = config.resetTimeUtcHour;

  const now = new Date(options?.nowMs ?? Date.now());
  const anchor = new Date(now);
  const utcHour = anchor.getUTCHours();

  if (utcHour < resetHour) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  anchor.setUTCHours(resetHour, 0, 0, 0);

  if (options?.offsetDays) {
    anchor.setUTCDate(anchor.getUTCDate() + Math.trunc(options.offsetDays));
  }

  return anchor.toISOString().slice(0, 10);
}

/**
 * Get the timestamp (ms) of the current day's reset time.
 */
export function getResetTimestamp(options?: { nowMs?: number }): number {
  const config = getDailyQuestCompetitionConfig();
  const resetHour = config.resetTimeUtcHour;
  const now = new Date(options?.nowMs ?? Date.now());

  const resetToday = new Date(now);
  resetToday.setUTCHours(resetHour, 0, 0, 0);

  // If we're before today's reset, the current period started yesterday
  if (now.getTime() < resetToday.getTime()) {
    resetToday.setUTCDate(resetToday.getUTCDate() - 1);
  }

  return resetToday.getTime();
}

/**
 * Calculate the hours elapsed since the daily reset.
 */
export function getHoursSinceReset(options?: { nowMs?: number }): number {
  const nowMs = options?.nowMs ?? Date.now();
  const resetMs = getResetTimestamp({ nowMs });
  const elapsed = nowMs - resetMs;
  return Math.max(0, elapsed / (1000 * 60 * 60));
}

/**
 * Calculate the time multiplier based on hours since reset.
 * The multiplier decays from 1.5x at reset to 1.0x after 16 hours.
 */
export function calculateTimeMultiplier(options?: { nowMs?: number }): number {
  const config = getDailyQuestCompetitionConfig();
  const hoursSinceReset = getHoursSinceReset(options);
  const multipliers = config.timeMultipliers;

  if (!multipliers.length) {
    return 1.0;
  }

  // Sort by hours ascending
  const sorted = [...multipliers].sort(
    (a, b) => a.hoursAfterReset - b.hoursAfterReset
  );

  // Find the applicable tier
  let applicable = sorted[0];
  for (const tier of sorted) {
    if (hoursSinceReset >= tier.hoursAfterReset) {
      applicable = tier;
    } else {
      break;
    }
  }

  return applicable.multiplier;
}

/**
 * Get the current multiplier and time until next tier change.
 * Useful for UI display.
 */
export function getMultiplierStatus(options?: { nowMs?: number }): {
  currentMultiplier: number;
  hoursSinceReset: number;
  nextTierHours: number | null;
  nextTierMultiplier: number | null;
  minutesUntilNextTier: number | null;
} {
  const config = getDailyQuestCompetitionConfig();
  const nowMs = options?.nowMs ?? Date.now();
  const hoursSinceReset = getHoursSinceReset({ nowMs });
  const currentMultiplier = calculateTimeMultiplier({ nowMs });
  const multipliers = config.timeMultipliers;

  const sorted = [...multipliers].sort(
    (a, b) => a.hoursAfterReset - b.hoursAfterReset
  );

  // Find the next tier
  let nextTier: { hoursAfterReset: number; multiplier: number } | null = null;
  for (const tier of sorted) {
    if (tier.hoursAfterReset > hoursSinceReset) {
      nextTier = tier;
      break;
    }
  }

  if (!nextTier) {
    return {
      currentMultiplier,
      hoursSinceReset,
      nextTierHours: null,
      nextTierMultiplier: null,
      minutesUntilNextTier: null,
    };
  }

  const hoursUntilNext = nextTier.hoursAfterReset - hoursSinceReset;

  return {
    currentMultiplier,
    hoursSinceReset,
    nextTierHours: nextTier.hoursAfterReset,
    nextTierMultiplier: nextTier.multiplier,
    minutesUntilNextTier: Math.ceil(hoursUntilNext * 60),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Prize Pool Calculation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the daily budget from weekly budget.
 */
export function getDailyBudget(): { usdc: number; ghst: number } {
  const config = getDailyQuestCompetitionConfig();
  return {
    usdc: config.weeklyBudget.usdc / 7,
    ghst: config.weeklyBudget.ghst / 7,
  };
}

/**
 * Calculate the prize pool for a specific tier.
 */
export function getTierPrizePool(tier: CompetitionTier): {
  usdc: number;
  ghst: number;
} {
  const config = getDailyQuestCompetitionConfig();
  const daily = getDailyBudget();
  const tierShare = config.tierDistribution[tier] ?? 0;

  return {
    usdc: daily.usdc * tierShare,
    ghst: daily.ghst * tierShare,
  };
}

/**
 * Calculate the prize for a specific position (1-indexed).
 */
export function getPositionPrize(
  tier: CompetitionTier,
  position: number
): { usdc: number; ghst: number } {
  const config = getDailyQuestCompetitionConfig();
  const tierPool = getTierPrizePool(tier);

  // Position is 1-indexed, array is 0-indexed
  const index = position - 1;
  if (index < 0 || index >= config.positionShares.length) {
    return { usdc: 0, ghst: 0 };
  }

  const share = config.positionShares[index];
  return {
    usdc: tierPool.usdc * share,
    ghst: tierPool.ghst * share,
  };
}

/**
 * Get all position prizes for a tier.
 */
export function getAllPositionPrizes(tier: CompetitionTier): Array<{
  position: number;
  usdc: number;
  ghst: number;
  share: number;
}> {
  const config = getDailyQuestCompetitionConfig();

  return config.positionShares.map((share, index) => {
    const prize = getPositionPrize(tier, index + 1);
    return {
      position: index + 1,
      ...prize,
      share,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Player Unlock Status
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check if a player has unlocked a specific tier based on Lick Tongue count.
 */
export function hasTierUnlocked(
  lickTongueCount: number,
  tier: CompetitionTier
): boolean {
  const config = getDailyQuestCompetitionConfig();
  const threshold = config.tierUnlockThresholds[tier];
  return lickTongueCount >= threshold;
}

/**
 * Get all unlocked tiers for a player.
 */
export function getUnlockedTiers(lickTongueCount: number): CompetitionTier[] {
  const config = getDailyQuestCompetitionConfig();
  const tiers: CompetitionTier[] = ['normal', 'nightmare', 'hell'];

  return tiers.filter(
    (tier) => lickTongueCount >= config.tierUnlockThresholds[tier]
  );
}

/**
 * Get the next tier to unlock and required Lick Tongues.
 */
export function getNextTierToUnlock(lickTongueCount: number): {
  tier: CompetitionTier;
  required: number;
  remaining: number;
} | null {
  const config = getDailyQuestCompetitionConfig();
  const tiers: CompetitionTier[] = ['normal', 'nightmare', 'hell'];

  for (const tier of tiers) {
    const threshold = config.tierUnlockThresholds[tier];
    if (lickTongueCount < threshold) {
      return {
        tier,
        required: threshold,
        remaining: threshold - lickTongueCount,
      };
    }
  }

  return null; // All tiers unlocked
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility Exports
// ──────────────────────────────────────────────────────────────────────────────

export const COMPETITION_TIERS: CompetitionTier[] = [
  'normal',
  'nightmare',
  'hell',
];
