import { describe, expect, it, jest } from '@jest/globals';

function loadDailyRunsWithConfig(gameConfig: unknown) {
  jest.resetModules();
  jest.doMock('../constants', () => ({
    GAME_CONFIG: gameConfig,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../daily-runs') as typeof import('../daily-runs');
}

describe('daily-runs date helpers', () => {
  it('getDailyRunsDate anchors to previous day when now is before reset hour', () => {
    const { getDailyRunsDate } = loadDailyRunsWithConfig({
      dailyRuns: {
        enabled: true,
        resetTimeUtcHour: 6,
        tiers: [],
      },
    });

    // 2026-01-10 05:59:59Z is before the 06:00 UTC reset → date should be 2026-01-09
    expect(getDailyRunsDate({ nowMs: Date.parse('2026-01-10T05:59:59.000Z') })).toBe(
      '2026-01-09'
    );

    // At/after reset hour uses current day
    expect(getDailyRunsDate({ nowMs: Date.parse('2026-01-10T06:00:00.000Z') })).toBe(
      '2026-01-10'
    );
  });

  it('getDailyRunsResetAt returns the next reset (today if before reset, tomorrow if at/after)', () => {
    const { getDailyRunsResetAt } = loadDailyRunsWithConfig({
      dailyRuns: {
        enabled: true,
        resetTimeUtcHour: 6,
        tiers: [],
      },
    });

    expect(getDailyRunsResetAt({ nowMs: Date.parse('2026-01-10T05:00:00.000Z') })).toBe(
      '2026-01-10T06:00:00.000Z'
    );

    // Exactly at reset counts as already reached, so the next reset is tomorrow.
    expect(getDailyRunsResetAt({ nowMs: Date.parse('2026-01-10T06:00:00.000Z') })).toBe(
      '2026-01-11T06:00:00.000Z'
    );
  });

  it('getDailyRunsConfig clamps reset hour and falls back to default tiers for invalid input', () => {
    const { getDailyRunsConfig } = loadDailyRunsWithConfig({
      dailyRuns: {
        enabled: true,
        resetTimeUtcHour: 25.9,
        tiers: [{ usdcStakedGte: -1, dailyRuns: 10 }],
      },
    });

    const config = getDailyRunsConfig();
    expect(config.resetTimeUtcHour).toBe(23);

    // Invalid tiers should fall back to defaults.
    expect(config.tiers.length).toBeGreaterThan(0);
    expect(config.tiers[0]).toEqual({ usdcStakedGte: 0, dailyRuns: 10 });
  });
});
