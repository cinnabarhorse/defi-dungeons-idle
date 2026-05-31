import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetDailyQuestCompetitionConfig = jest.fn();
const mockGetCompetitionTier = jest.fn();
const mockGetCompetitionDate = jest.fn();

jest.mock('../../lib/daily-quest-competition', () => ({
  getDailyQuestCompetitionConfig: () => mockGetDailyQuestCompetitionConfig(),
  getCompetitionTier: (difficultyId: string) => mockGetCompetitionTier(difficultyId),
  getCompetitionDate: (opts?: any) => mockGetCompetitionDate(opts),
}));

const mockHasRemainingDailyRuns = jest.fn();

jest.mock('../../lib/db', () => ({
  dailyQuestLeaderboardRepo: {
    hasRemainingDailyRuns: (...args: any[]) => mockHasRemainingDailyRuns(...args),
  },
}));

import { checkCompetitionEligibility } from '../DailyQuestSystem';

describe('checkCompetitionEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetCompetitionDate.mockReturnValue('2026-01-31');
    mockGetCompetitionTier.mockReturnValue('normal');
    mockHasRemainingDailyRuns.mockResolvedValue({
      hasRemaining: true,
      used: 0,
      remaining: 3,
    });
  });

  it('returns a disabled error when competition is disabled', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: false,
      soloOnly: true,
      dailyRunsPerDay: 3,
    });

    const result = await checkCompetitionEligibility('player_1', 'normal');

    expect(result).toEqual({
      eligible: false,
      tier: null,
      hasUnlockedTier: false,
      hasRemainingRuns: false,
      runsUsed: 0,
      runsRemaining: 0,
      error: 'Competition disabled',
    });

    expect(mockHasRemainingDailyRuns).not.toHaveBeenCalled();
  });

  it('returns a difficulty error when the difficulty is not eligible for competition', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: true,
      soloOnly: true,
      dailyRunsPerDay: 3,
    });

    mockGetCompetitionTier.mockReturnValue(null);

    const result = await checkCompetitionEligibility('player_1', 'beyond_hell_1');

    expect(result).toEqual({
      eligible: false,
      tier: null,
      hasUnlockedTier: false,
      hasRemainingRuns: false,
      runsUsed: 0,
      runsRemaining: 0,
      error: 'Difficulty not eligible for competition',
    });

    expect(mockHasRemainingDailyRuns).not.toHaveBeenCalled();
  });

  it('returns eligible=false with a helpful message when daily runs are exhausted', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: true,
      soloOnly: true,
      dailyRunsPerDay: 3,
    });

    mockGetCompetitionTier.mockReturnValue('hell');
    mockHasRemainingDailyRuns.mockResolvedValue({
      hasRemaining: false,
      used: 3,
      remaining: 0,
    });

    const result = await checkCompetitionEligibility('player_1', 'hell');

    expect(result).toEqual({
      eligible: false,
      tier: 'hell',
      hasUnlockedTier: true,
      hasRemainingRuns: false,
      runsUsed: 3,
      runsRemaining: 0,
      error: 'No daily competition runs remaining (3/3 used)',
    });

    expect(mockHasRemainingDailyRuns).toHaveBeenCalledWith('2026-01-31', 'player_1', 3);
  });
});
