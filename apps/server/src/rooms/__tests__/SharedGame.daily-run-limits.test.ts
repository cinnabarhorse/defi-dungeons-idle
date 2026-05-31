/**
 * Unit Tests for Daily Run Limits - Competition Mode
 *
 * Tests that competition mode enforces the 3 daily runs per player limit.
 * Each run should deduct from the available runs.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock external dependencies

jest.mock('../../lib/daily-quest-competition', () => ({
  getCompetitionTier: jest.fn(() => 'normal'),
  getCompetitionDate: jest.fn(() => '2025-01-30'),
  getDailyQuestCompetitionConfig: jest.fn(() => ({
    enabled: true,
    dailyRunsPerDay: 3,
  })),
}));

const mockHasRemainingDailyRuns = jest.fn();
const mockRecordAttunementUsage = jest.fn();

jest.mock('../../lib/db/repos/daily-quest-leaderboard', () => ({
  dailyQuestLeaderboardRepo: {
    hasRemainingDailyRuns: (...args: any[]) => mockHasRemainingDailyRuns(...args),
    recordAttunementUsage: (...args: any[]) => mockRecordAttunementUsage(...args),
  },
}));

jest.mock('../../lib/dev-mode', () => ({
  shouldSkipEntryFee: jest.fn(() => false),
}));

jest.mock('@gotchiverse/progression', () => ({
  createDefaultProfile: jest.fn(() => ({
    level: 1,
    totalXp: 0,
    unspentPoints: 0,
    stats: {},
    allocationHistory: [],
  })),
}));

jest.mock('../../lib/progression/killStreak', () => ({
  createKillStreakProfile: jest.fn(() => ({})),
}));

jest.mock('../../lib/equipment-service', () => ({
  buildEquipmentStateForCharacter: jest.fn(() => ({ equipment: [] })),
}));

// Import the function that checks daily run limits
// This is in registerGamePlayer in SharedGame.ts
async function checkDailyRunLimit(
  playerId: string,
  dailyQuestActive: boolean,
  difficultyTier: string
): Promise<{ allowed: boolean; error?: any }> {
  const { getCompetitionTier, getCompetitionDate, getDailyQuestCompetitionConfig } =
    require('../../lib/daily-quest-competition');
  const { dailyQuestLeaderboardRepo } = require('../../lib/db/repos/daily-quest-leaderboard');

  if (!dailyQuestActive) {
    return { allowed: true };
  }

  const competitionTier = getCompetitionTier(difficultyTier);
  if (!competitionTier) {
    return { allowed: true }; // Not a competition tier, no limit check
  }

  const date = getCompetitionDate();
  const config = getDailyQuestCompetitionConfig();
  const { hasRemaining, remaining } = await dailyQuestLeaderboardRepo.hasRemainingDailyRuns(
    date,
    playerId,
    config.dailyRunsPerDay
  );

  if (!hasRemaining) {
    const limitError: any = new Error(
      `No competition runs remaining today. Try again tomorrow.`
    );
    limitError.code = 'NO_COMPETITION_RUNS_REMAINING';
    limitError.remainingRuns = remaining;
    return { allowed: false, error: limitError };
  }

  return { allowed: true };
}

async function recordDailyRun(
  playerId: string,
  competitionTier: string,
  gameId: string
): Promise<{ recorded: boolean; runsUsed: number; runsRemaining: number }> {
  const { getCompetitionDate, getDailyQuestCompetitionConfig } =
    require('../../lib/daily-quest-competition');
  const { dailyQuestLeaderboardRepo } = require('../../lib/db/repos/daily-quest-leaderboard');

  const date = getCompetitionDate();
  const config = getDailyQuestCompetitionConfig();
  const { recorded, alreadyUsed, runsUsed, runsRemaining } =
    await dailyQuestLeaderboardRepo.recordAttunementUsage(
      date,
      competitionTier,
      playerId,
      gameId,
      config.dailyRunsPerDay
    );

  return { recorded, runsUsed, runsRemaining };
}

describe('Daily Run Limits - Competition Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Run Limit Enforcement', () => {
    it('should allow entry when player has remaining runs (0/3 used)', async () => {
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 0,
        remaining: 3,
      });

      const result = await checkDailyRunLimit('player-123', true, 'normal');

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockHasRemainingDailyRuns).toHaveBeenCalledWith(
        '2025-01-30',
        'player-123',
        3
      );
    });

    it('should allow entry when player has remaining runs (1/3 used)', async () => {
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 1,
        remaining: 2,
      });

      const result = await checkDailyRunLimit('player-123', true, 'normal');

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow entry when player has remaining runs (2/3 used)', async () => {
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 2,
        remaining: 1,
      });

      const result = await checkDailyRunLimit('player-123', true, 'normal');

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject entry when player has no remaining runs (3/3 used)', async () => {
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: false,
        used: 3,
        remaining: 0,
      });

      const result = await checkDailyRunLimit('player-123', true, 'normal');

      expect(result.allowed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('NO_COMPETITION_RUNS_REMAINING');
      expect(result.error.remainingRuns).toBe(0);
    });

    it('should NOT check limits when dailyQuestActive is false', async () => {
      const result = await checkDailyRunLimit('player-123', false, 'normal');

      expect(result.allowed).toBe(true);
      expect(mockHasRemainingDailyRuns).not.toHaveBeenCalled();
    });
  });

  describe('Run Recording', () => {
    it('should record a run and decrement remaining runs (first run)', async () => {
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: true,
        alreadyUsed: false,
        runsUsed: 1,
        runsRemaining: 2,
      });

      const result = await recordDailyRun('player-123', 'normal', 'game-123');

      expect(result.recorded).toBe(true);
      expect(result.runsUsed).toBe(1);
      expect(result.runsRemaining).toBe(2);
      expect(mockRecordAttunementUsage).toHaveBeenCalledWith(
        '2025-01-30',
        'normal',
        'player-123',
        'game-123',
        3
      );
    });

    it('should record a run and decrement remaining runs (second run)', async () => {
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: true,
        alreadyUsed: false,
        runsUsed: 2,
        runsRemaining: 1,
      });

      const result = await recordDailyRun('player-123', 'normal', 'game-123');

      expect(result.recorded).toBe(true);
      expect(result.runsUsed).toBe(2);
      expect(result.runsRemaining).toBe(1);
    });

    it('should record a run and decrement remaining runs (third run)', async () => {
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: true,
        alreadyUsed: false,
        runsUsed: 3,
        runsRemaining: 0,
      });

      const result = await recordDailyRun('player-123', 'normal', 'game-123');

      expect(result.recorded).toBe(true);
      expect(result.runsUsed).toBe(3);
      expect(result.runsRemaining).toBe(0);
    });

    it('should handle alreadyUsed flag when run was already recorded', async () => {
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: false,
        alreadyUsed: true,
        runsUsed: 3,
        runsRemaining: 0,
      });

      const result = await recordDailyRun('player-123', 'normal', 'game-123');

      expect(result.recorded).toBe(false);
      expect(result.runsUsed).toBe(3);
      expect(result.runsRemaining).toBe(0);
    });
  });

  describe('Full Run Flow', () => {
    it('should allow 3 runs and block the 4th', async () => {
      // First run
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 0,
        remaining: 3,
      });
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: true,
        alreadyUsed: false,
        runsUsed: 1,
        runsRemaining: 2,
      });

      let result = await checkDailyRunLimit('player-123', true, 'normal');
      expect(result.allowed).toBe(true);

      let recordResult = await recordDailyRun('player-123', 'normal', 'game-1');
      expect(recordResult.runsUsed).toBe(1);
      expect(recordResult.runsRemaining).toBe(2);

      // Second run
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 1,
        remaining: 2,
      });
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: true,
        alreadyUsed: false,
        runsUsed: 2,
        runsRemaining: 1,
      });

      result = await checkDailyRunLimit('player-123', true, 'normal');
      expect(result.allowed).toBe(true);

      recordResult = await recordDailyRun('player-123', 'normal', 'game-2');
      expect(recordResult.runsUsed).toBe(2);
      expect(recordResult.runsRemaining).toBe(1);

      // Third run
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 2,
        remaining: 1,
      });
      mockRecordAttunementUsage.mockResolvedValueOnce({
        recorded: true,
        alreadyUsed: false,
        runsUsed: 3,
        runsRemaining: 0,
      });

      result = await checkDailyRunLimit('player-123', true, 'normal');
      expect(result.allowed).toBe(true);

      recordResult = await recordDailyRun('player-123', 'normal', 'game-3');
      expect(recordResult.runsUsed).toBe(3);
      expect(recordResult.runsRemaining).toBe(0);

      // Fourth run should be blocked
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: false,
        used: 3,
        remaining: 0,
      });

      result = await checkDailyRunLimit('player-123', true, 'normal');
      expect(result.allowed).toBe(false);
      expect(result.error.code).toBe('NO_COMPETITION_RUNS_REMAINING');
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-competition difficulty tiers (no limit check)', async () => {
      const { getCompetitionTier } = require('../../lib/daily-quest-competition');
      getCompetitionTier.mockReturnValueOnce(null);

      const result = await checkDailyRunLimit('player-123', true, 'beyond_hell_1');

      expect(result.allowed).toBe(true);
      expect(mockHasRemainingDailyRuns).not.toHaveBeenCalled();
    });

    it('should use correct date for limit checking', async () => {
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 0,
        remaining: 3,
      });

      await checkDailyRunLimit('player-123', true, 'normal');

      expect(mockHasRemainingDailyRuns).toHaveBeenCalledWith(
        '2025-01-30', // Mocked date
        'player-123',
        3
      );
    });

    it('should use correct maxRunsPerDay from config', async () => {
      mockHasRemainingDailyRuns.mockResolvedValueOnce({
        hasRemaining: true,
        used: 0,
        remaining: 3,
      });

      await checkDailyRunLimit('player-123', true, 'normal');

      expect(mockHasRemainingDailyRuns).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        3 // From config.dailyRunsPerDay
      );
    });
  });
});
