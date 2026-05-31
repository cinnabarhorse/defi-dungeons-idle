/**
 * Unit tests for Daily Quest Competition utilities
 *
 * Run with: npx tsx --test apps/server/src/lib/__tests__/daily-quest-competition.test.ts
 */

import {
  calculateTimeMultiplier,
  getHoursSinceReset,
  getCompetitionDate,
  getCompetitionTier,
  getDailyBudget,
  getTierPrizePool,
  getPositionPrize,
  getAllPositionPrizes,
  hasTierUnlocked,
  getUnlockedTiers,
  getNextTierToUnlock,
  getMultiplierStatus,
  COMPETITION_TIERS,
} from '../daily-quest-competition';

// ──────────────────────────────────────────────────────────────────────────────
// Helper to get a timestamp at specific hours after UTC midnight
// ──────────────────────────────────────────────────────────────────────────────
function getMsAtHoursAfterReset(hours: number): number {
  const now = new Date();
  const resetToday = new Date(now);
  resetToday.setUTCHours(0, 0, 0, 0);

  // If we're before today's reset, the reset was yesterday
  if (now.getTime() < resetToday.getTime()) {
    resetToday.setUTCDate(resetToday.getUTCDate() - 1);
  }

  return resetToday.getTime() + hours * 60 * 60 * 1000;
}

// ──────────────────────────────────────────────────────────────────────────────
// Competition Tier Tests
// ──────────────────────────────────────────────────────────────────────────────

test('getCompetitionTier maps normal difficulties to normal tier', () => {
  // New simplified tier IDs
  expect(getCompetitionTier('normal')).toBe('normal');
  // Legacy tier IDs (backward compatible)
  expect(getCompetitionTier('normal_1')).toBe('normal');
  expect(getCompetitionTier('normal_2')).toBe('normal');
  expect(getCompetitionTier('normal_3')).toBe('normal');
});

test('getCompetitionTier maps nightmare difficulties to nightmare tier', () => {
  // New simplified tier IDs
  expect(getCompetitionTier('nightmare')).toBe('nightmare');
  // Legacy tier IDs (backward compatible)
  expect(getCompetitionTier('nightmare_1')).toBe('nightmare');
  expect(getCompetitionTier('nightmare_2')).toBe('nightmare');
  expect(getCompetitionTier('nightmare_3')).toBe('nightmare');
});

test('getCompetitionTier maps hell difficulties to hell tier', () => {
  // New simplified tier IDs
  expect(getCompetitionTier('hell')).toBe('hell');
  // Legacy tier IDs (backward compatible)
  expect(getCompetitionTier('hell_1')).toBe('hell');
  expect(getCompetitionTier('hell_2')).toBe('hell');
  expect(getCompetitionTier('hell_3')).toBe('hell');
});

test('getCompetitionTier returns null for non-competition difficulties', () => {
  expect(getCompetitionTier('beyond_hell_1')).toBeNull();
  expect(getCompetitionTier('unknown')).toBeNull();
  expect(getCompetitionTier('')).toBeNull();
});

test('getCompetitionTier handles case insensitivity', () => {
  expect(getCompetitionTier('NORMAL_1')).toBe('normal');
  expect(getCompetitionTier('NiGhTmArE_2')).toBe('nightmare');
});

// ──────────────────────────────────────────────────────────────────────────────
// Time Multiplier Tests
// ──────────────────────────────────────────────────────────────────────────────

test('getHoursSinceReset returns approximately 0 at reset time', () => {
  const ms = getMsAtHoursAfterReset(0);
  const hours = getHoursSinceReset({ nowMs: ms });
  expect(hours).toBeLessThan(0.1);
});

test('getHoursSinceReset returns correct hours elapsed', () => {
  const ms = getMsAtHoursAfterReset(4);
  const hours = getHoursSinceReset({ nowMs: ms });
  expect(Math.abs(hours - 4)).toBeLessThan(0.1);
});

test('calculateTimeMultiplier returns 1.5x at reset time', () => {
  const ms = getMsAtHoursAfterReset(0);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.5);
});

test('calculateTimeMultiplier returns 1.5x during first 4 hours', () => {
  const ms = getMsAtHoursAfterReset(3);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.5);
});

test('calculateTimeMultiplier returns 1.35x after 4 hours', () => {
  const ms = getMsAtHoursAfterReset(4);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.35);
});

test('calculateTimeMultiplier returns 1.2x after 8 hours', () => {
  const ms = getMsAtHoursAfterReset(8);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.2);
});

test('calculateTimeMultiplier returns 1.1x after 12 hours', () => {
  const ms = getMsAtHoursAfterReset(12);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.1);
});

test('calculateTimeMultiplier returns 1.0x after 16 hours', () => {
  const ms = getMsAtHoursAfterReset(16);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.0);
});

test('calculateTimeMultiplier returns 1.0x at 23 hours', () => {
  const ms = getMsAtHoursAfterReset(23);
  expect(calculateTimeMultiplier({ nowMs: ms })).toBe(1.0);
});

test('getMultiplierStatus returns next tier info when there is a next tier', () => {
  const ms = getMsAtHoursAfterReset(2);
  const status = getMultiplierStatus({ nowMs: ms });

  expect(status.currentMultiplier).toBe(1.5);
  expect(status.nextTierHours).toBe(4);
  expect(status.nextTierMultiplier).toBe(1.35);
  expect(
    status.minutesUntilNextTier !== null && status.minutesUntilNextTier > 0
  ).toBe(true);
});

test('getMultiplierStatus returns null for next tier when in final tier', () => {
  const ms = getMsAtHoursAfterReset(20);
  const status = getMultiplierStatus({ nowMs: ms });

  expect(status.currentMultiplier).toBe(1.0);
  expect(status.nextTierHours).toBeNull();
  expect(status.nextTierMultiplier).toBeNull();
  expect(status.minutesUntilNextTier).toBeNull();
});

// ──────────────────────────────────────────────────────────────────────────────
// Competition Date Tests
// ──────────────────────────────────────────────────────────────────────────────

test('getCompetitionDate returns YYYY-MM-DD format', () => {
  const date = getCompetitionDate();
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('getCompetitionDate supports offset days', () => {
  const today = getCompetitionDate();
  const yesterday = getCompetitionDate({ offsetDays: -1 });

  const todayDate = new Date(today + 'T00:00:00Z');
  const yesterdayDate = new Date(yesterday + 'T00:00:00Z');

  expect(todayDate.getTime() - yesterdayDate.getTime()).toBe(
    24 * 60 * 60 * 1000
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Prize Calculation Tests
// ──────────────────────────────────────────────────────────────────────────────

test('getDailyBudget returns zero token budget for idle competition rewards', () => {
  const daily = getDailyBudget();
  expect(daily.usdc).toBe(0);
  expect(daily.ghst).toBe(0);
});

test('getTierPrizePool returns zero token prizes for normal', () => {
  const pool = getTierPrizePool('normal');
  expect(pool.usdc).toBe(0);
  expect(pool.ghst).toBe(0);
});

test('getTierPrizePool returns zero token prizes for nightmare', () => {
  const pool = getTierPrizePool('nightmare');
  expect(pool.usdc).toBe(0);
  expect(pool.ghst).toBe(0);
});

test('getTierPrizePool returns zero token prizes for hell', () => {
  const pool = getTierPrizePool('hell');
  expect(pool.usdc).toBe(0);
  expect(pool.ghst).toBe(0);
});

test('getPositionPrize returns zero token prizes for top placements', () => {
  const prize = getPositionPrize('normal', 1);
  expect(prize.usdc).toBe(0);
  expect(prize.ghst).toBe(0);
  expect(getPositionPrize('nightmare', 2)).toEqual({ usdc: 0, ghst: 0 });
  expect(getPositionPrize('hell', 3)).toEqual({ usdc: 0, ghst: 0 });
});

test('getPositionPrize returns 0 for positions beyond top 10', () => {
  const prize = getPositionPrize('hell', 11);
  expect(prize.usdc).toBe(0);
  expect(prize.ghst).toBe(0);
});

test('getPositionPrize returns 0 for position 0', () => {
  const prize = getPositionPrize('normal', 0);
  expect(prize.usdc).toBe(0);
  expect(prize.ghst).toBe(0);
});

test('getAllPositionPrizes returns 10 positions', () => {
  const prizes = getAllPositionPrizes('normal');
  expect(prizes).toHaveLength(10);
});

test('getAllPositionPrizes positions are 1-indexed', () => {
  const prizes = getAllPositionPrizes('normal');
  expect(prizes[0].position).toBe(1);
  expect(prizes[9].position).toBe(10);
});

test('getAllPositionPrizes shares sum to 1.0', () => {
  const prizes = getAllPositionPrizes('hell');
  const totalShare = prizes.reduce((sum, p) => sum + p.share, 0);
  expect(Math.abs(totalShare - 1.0)).toBeLessThan(0.0001);
});

test('getAllPositionPrizes are in descending order by amount', () => {
  const prizes = getAllPositionPrizes('nightmare');
  for (let i = 1; i < prizes.length; i++) {
    expect(prizes[i].usdc).toBeLessThanOrEqual(prizes[i - 1].usdc);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Tier Unlock Tests
// NOTE: All tier thresholds are now 0 - no Lick Tongue requirements
// ──────────────────────────────────────────────────────────────────────────────

test('hasTierUnlocked returns true for all tiers at any LT count (thresholds are 0)', () => {
  // All tiers unlocked at 0 LT
  expect(hasTierUnlocked(0, 'normal')).toBe(true);
  expect(hasTierUnlocked(0, 'nightmare')).toBe(true);
  expect(hasTierUnlocked(0, 'hell')).toBe(true);

  // Still true at higher counts
  expect(hasTierUnlocked(100, 'normal')).toBe(true);
  expect(hasTierUnlocked(100, 'nightmare')).toBe(true);
  expect(hasTierUnlocked(100, 'hell')).toBe(true);
});

test('getUnlockedTiers returns all tiers at any LT count (thresholds are 0)', () => {
  expect(getUnlockedTiers(0)).toEqual(['normal', 'nightmare', 'hell']);
  expect(getUnlockedTiers(41)).toEqual(['normal', 'nightmare', 'hell']);
  expect(getUnlockedTiers(100)).toEqual(['normal', 'nightmare', 'hell']);
  expect(getUnlockedTiers(1000)).toEqual(['normal', 'nightmare', 'hell']);
});

test('getNextTierToUnlock returns null for all players (all tiers unlocked)', () => {
  // All tiers unlocked at 0 LT
  expect(getNextTierToUnlock(0)).toBeNull();
  expect(getNextTierToUnlock(42)).toBeNull();
  expect(getNextTierToUnlock(100)).toBeNull();
  expect(getNextTierToUnlock(500)).toBeNull();
});

// ──────────────────────────────────────────────────────────────────────────────
// Constants Tests
// ──────────────────────────────────────────────────────────────────────────────

test('COMPETITION_TIERS contains all three tiers', () => {
  expect(COMPETITION_TIERS).toEqual(['normal', 'nightmare', 'hell']);
});
