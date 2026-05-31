import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockGetDailyQuestCompetitionConfig = jest.fn();
const mockGetCompetitionTier = jest.fn();
const mockGetCompetitionDate = jest.fn();
const mockCalculateTimeMultiplier = jest.fn();

jest.mock('../../lib/daily-quest-competition', () => ({
  getDailyQuestCompetitionConfig: () => mockGetDailyQuestCompetitionConfig(),
  getCompetitionTier: (difficultyId: string) => mockGetCompetitionTier(difficultyId),
  getCompetitionDate: (opts?: any) => mockGetCompetitionDate(opts),
  calculateTimeMultiplier: (opts: any) => mockCalculateTimeMultiplier(opts),
}));

const mockGetPlayerEntry = jest.fn();
const mockUpsertLeaderboardEntry = jest.fn();
const mockGetPlayerRank = jest.fn();

jest.mock('../../lib/db', () => ({
  dailyQuestLeaderboardRepo: {
    getPlayerEntry: (...args: any[]) => mockGetPlayerEntry(...args),
    upsertLeaderboardEntry: (...args: any[]) => mockUpsertLeaderboardEntry(...args),
    getPlayerRank: (...args: any[]) => mockGetPlayerRank(...args),
  },
}));

import { submitToCompetitionLeaderboard } from '../DailyQuestSystem';

function makeRoom(overrides?: Partial<any>) {
  return {
    currentGameId: 'game_123',
    state: {
      difficultyTier: 'normal',
      players: new Map<string, any>(),
    },
    ...overrides,
  } as any;
}

describe('submitToCompetitionLeaderboard', () => {
  const fixedNowMs = Date.UTC(2026, 0, 28, 18, 24, 0);
  let dateNowSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();

    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNowMs);

    mockGetCompetitionDate.mockReturnValue('2026-01-28');
    mockCalculateTimeMultiplier.mockReturnValue(1.5);

    mockGetPlayerEntry.mockResolvedValue(null);
    mockUpsertLeaderboardEntry.mockResolvedValue(undefined);
    mockGetPlayerRank.mockResolvedValue(7);
  });

  afterEach(() => {
    dateNowSpy?.mockRestore?.();
  });

  it('returns a disabled error when competition is disabled', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: false,
      soloOnly: true,
      dailyRunsPerDay: 3,
    });

    const room = makeRoom({
      state: { difficultyTier: 'normal', players: new Map() },
    });

    const result = await submitToCompetitionLeaderboard(
      room,
      'player_1',
      'session_1',
      1000
    );

    expect(result).toEqual({
      submitted: false,
      tier: null,
      finalScore: 0,
      timeMultiplier: 1,
      rank: null,
      error: 'Competition disabled',
    });
  });

  it('returns a solo-only error when config.soloOnly and room has multiple players', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: true,
      soloOnly: true,
      dailyRunsPerDay: 3,
    });

    mockGetCompetitionTier.mockReturnValue('normal');

    const players = new Map<string, any>([
      ['s1', { name: 'Alice', characterId: 'gotchi:123' }],
      ['s2', { name: 'Bob', characterId: 'coderdan' }],
    ]);

    const room = makeRoom({
      state: { difficultyTier: 'normal', players },
    });

    const result = await submitToCompetitionLeaderboard(
      room,
      'player_1',
      's1',
      1000
    );

    expect(result).toEqual({
      submitted: false,
      tier: 'normal',
      finalScore: 0,
      timeMultiplier: 1,
      rank: null,
      error: 'Competition only available for solo runs',
    });

    expect(mockUpsertLeaderboardEntry).not.toHaveBeenCalled();
    expect(mockGetPlayerRank).not.toHaveBeenCalled();
  });

  it('returns a database error when repo upsert throws', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: true,
      soloOnly: false,
      dailyRunsPerDay: 3,
    });

    mockGetCompetitionTier.mockReturnValue('normal');
    mockUpsertLeaderboardEntry.mockRejectedValue(new Error('boom'));

    const players = new Map<string, any>([
      ['s1', { name: 'Alice', characterId: 'gotchi:123' }],
    ]);

    const room = makeRoom({
      state: { difficultyTier: 'normal', players },
    });

    const result = await submitToCompetitionLeaderboard(
      room,
      'player_1',
      's1',
      1000
    );

    expect(result).toMatchObject({
      submitted: false,
      tier: 'normal',
      finalScore: 1500,
      timeMultiplier: 1.5,
      gotchiBonusMultiplier: 1,
      isRealGotchi: false,
      rank: null,
      error: 'Database error',
    });

    expect(mockUpsertLeaderboardEntry).toHaveBeenCalledTimes(1);
    expect(mockGetPlayerRank).not.toHaveBeenCalled();

    const upsertArg = mockUpsertLeaderboardEntry.mock.calls[0][0];
    expect(upsertArg).toMatchObject({
      date: '2026-01-28',
      difficultyId: 'normal',
      accountId: 'player_1',
      rawScore: 1000,
      timeMultiplier: 1.5,
      gotchiBonusMultiplier: 1,
      isRealGotchi: false,
      runId: 'game_123',
      playerName: 'Alice',
      gotchiId: '123',
    });
    expect(typeof upsertArg.completedAt).toBe('string');
  });

  it('applies +25% final score bonus for real gotchis', async () => {
    mockGetDailyQuestCompetitionConfig.mockReturnValue({
      enabled: true,
      soloOnly: false,
      dailyRunsPerDay: 3,
    });

    mockGetCompetitionTier.mockReturnValue('normal');
    mockGetPlayerRank.mockResolvedValue(2);

    const players = new Map<string, any>([
      [
        's1',
        {
          name: 'Alice',
          characterId: 'gotchi:123',
          usesRealGotchi: true,
        },
      ],
    ]);

    const room = makeRoom({
      state: { difficultyTier: 'normal', players },
    });

    const result = await submitToCompetitionLeaderboard(
      room,
      'player_1',
      's1',
      1000
    );

    expect(result).toMatchObject({
      submitted: true,
      tier: 'normal',
      finalScore: 1875,
      timeMultiplier: 1.5,
      gotchiBonusMultiplier: 1.25,
      isRealGotchi: true,
      rank: 2,
    });

    expect(mockUpsertLeaderboardEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        rawScore: 1000,
        timeMultiplier: 1.5,
        gotchiBonusMultiplier: 1.25,
        isRealGotchi: true,
        gotchiId: '123',
      })
    );
  });
});
