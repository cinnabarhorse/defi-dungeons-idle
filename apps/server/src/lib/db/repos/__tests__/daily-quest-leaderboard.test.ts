import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getPgPool, runTransaction } from '../../client';
import { hasRemainingDailyRuns, recordAttunementUsage } from '../daily-quest-leaderboard';
import { getBonusRuns } from '../player-daily-run-bonus';

jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
  runTransaction: jest.fn(),
}));

jest.mock('../player-daily-run-bonus', () => ({
  getBonusRuns: jest.fn(),
}));

describe('daily-quest-leaderboard repo bonus runs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes bonus runs when checking remaining runs', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ count: '3' }] });
    (getPgPool as jest.Mock).mockReturnValue({ query });
    (getBonusRuns as jest.Mock).mockResolvedValue(1);

    const result = await hasRemainingDailyRuns('2025-01-30', 'player-123', 3);

    expect(result).toEqual({ hasRemaining: true, used: 3, remaining: 1 });
  });

  it('allows recording up to base plus bonus runs', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [] });
    (runTransaction as jest.Mock).mockImplementation(async (handler: any) =>
      handler({ query })
    );
    (getBonusRuns as jest.Mock).mockResolvedValue(1);

    const result = await recordAttunementUsage(
      '2025-01-30',
      'normal',
      'player-123',
      'game-123',
      3
    );

    expect(result).toEqual({
      recorded: true,
      alreadyUsed: false,
      runsUsed: 4,
      runsRemaining: 0,
    });
    expect(runTransaction).toHaveBeenCalled();
  });
});
