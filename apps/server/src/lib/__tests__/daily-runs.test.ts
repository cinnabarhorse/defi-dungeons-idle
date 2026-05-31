import { describe, expect, it } from '@jest/globals';
import { getDailyRunAllowance } from '../daily-runs';
import { consumeDailyRun } from '../db/repos/player-daily-runs';

function createFakePool(initialUsed = 0) {
  const state = new Map<string, number>();

  return {
    state,
    async query(sql: string, params: unknown[]) {
      const normalized = sql.toLowerCase();
      const [accountId, date, allowedRuns] = params as [
        string,
        string,
        number
      ];
      const key = `${accountId}:${date}`;

      if (normalized.includes('insert into player_daily_runs')) {
        if (!state.has(key)) {
          state.set(key, initialUsed);
        }
        return { rows: [] };
      }

      if (normalized.includes('update player_daily_runs')) {
        const used = state.get(key) ?? initialUsed;
        if (used < Number(allowedRuns)) {
          const next = used + 1;
          state.set(key, next);
          return { rows: [{ used_runs: next }] };
        }
        return { rows: [] };
      }

      if (normalized.includes('select used_runs')) {
        return { rows: [{ used_runs: state.get(key) ?? initialUsed }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

describe('getDailyRunAllowance', () => {
  const tiers = [
    { usdcStakedGte: 0, dailyRuns: 10 },
    { usdcStakedGte: 100, dailyRuns: 20 },
    { usdcStakedGte: 1000, dailyRuns: 30 },
  ];

  it('handles exact thresholds', () => {
    expect(getDailyRunAllowance({ usdcStaked: 0, tiers })).toBe(10);
    expect(getDailyRunAllowance({ usdcStaked: 100, tiers })).toBe(20);
    expect(getDailyRunAllowance({ usdcStaked: 1000, tiers })).toBe(30);
  });

  it('handles decimal balances near thresholds', () => {
    expect(getDailyRunAllowance({ usdcStaked: 99.99, tiers })).toBe(10);
    expect(getDailyRunAllowance({ usdcStaked: 100.01, tiers })).toBe(20);
    expect(getDailyRunAllowance({ usdcStaked: 999.99, tiers })).toBe(20);
    expect(getDailyRunAllowance({ usdcStaked: 1000.5, tiers })).toBe(30);
  });

  it('selects the highest eligible tier', () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]];
    expect(getDailyRunAllowance({ usdcStaked: 250, tiers: shuffled })).toBe(20);
  });
});

describe('consumeDailyRun', () => {
  it('only allows one success when allowance is one', async () => {
    const pool = createFakePool(0);
    const results = await Promise.all(
      Array.from({ length: 4 }).map(() =>
        consumeDailyRun({
          accountId: 'player-1',
          date: '2026-01-24',
          allowedRuns: 1,
          client: pool as any,
        })
      )
    );

    const successes = results.filter((result) => result.success);
    const failures = results.filter((result) => !result.success);

    expect(successes).toHaveLength(1);
    expect(successes[0].usedRuns).toBe(1);
    expect(failures.every((result) => result.remainingRuns === 0)).toBe(true);
  });
});
