import { runPrizeDistributionJob } from '../distribute-daily-quest-prizes';

jest.mock('../../lib/db', () => ({
  dailyQuestLeaderboardRepo: {
    hasDistributedPrizesForDate: jest.fn().mockResolvedValue(false),
    getTopEntries: jest.fn(),
    createPrizeDistribution: jest.fn().mockResolvedValue({ id: 'pd-1' }),
    getPrizeDistributionForUpdate: jest
      .fn()
      .mockResolvedValue({ id: 'pd-1', status: 'pending', usdcWithdrawalId: null, ghstWithdrawalId: null }),
    markPrizeDistributed: jest.fn().mockResolvedValue({ id: 'pd-1' }),
    getPrizeDistributionsForDate: jest.fn().mockResolvedValue([]),
  },
  tokenWithdrawalsRepo: {
    createTokenWithdrawal: jest.fn(async (input: any) => ({ id: `${input.currency}-w1` })),
  },
  playersRepo: {
    getPlayerById: jest.fn().mockResolvedValue({ username: 'alice' }),
  },
  depositsRepo: {
    getStakedTokenBalances: jest.fn(),
  },
  runTransaction: jest.fn(async (fn: any) => fn(undefined)),
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  getDailyQuestCompetitionConfig: jest.fn(() => ({ enabled: true, topPositions: 10 })),
  getCompetitionDate: jest.fn(() => '2026-02-02'),
  getPositionPrize: jest.fn((_tier: string, _pos: number) => ({ usdc: 10, ghst: 5 })),
  COMPETITION_TIERS: ['normal'],
}));

describe('runPrizeDistributionJob - split by staked currency (issue #219)', () => {
  const db = require('../../lib/db');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pays only USDC when user only stakes USDC (normal tier)', async () => {
    db.dailyQuestLeaderboardRepo.getTopEntries.mockResolvedValue([
      { id: 'le-1', accountId: '0xabc', finalScore: 123 },
    ]);

    // Eligible for USDC only (>= 1 USDC/GHO in normal)
    db.depositsRepo.getStakedTokenBalances.mockResolvedValue({ USDC: 1, GHST: 0 });

    const res = await runPrizeDistributionJob({ date: '2026-02-02' });

    expect(res.success).toBe(true);

    // Create prize distribution row with split amounts
    expect(db.dailyQuestLeaderboardRepo.createPrizeDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionDate: '2026-02-02',
        usdcAmount: 10,
        ghstAmount: 0,
      })
    );

    // Only USDC withdrawal
    expect(db.tokenWithdrawalsRepo.createTokenWithdrawal).toHaveBeenCalledTimes(1);
    expect(db.tokenWithdrawalsRepo.createTokenWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USDC' })
    );
  });

  it('skips USDC payout when USDC/GHO stake is below 1 (normal tier)', async () => {
    db.dailyQuestLeaderboardRepo.getTopEntries.mockResolvedValue([
      { id: 'le-1', accountId: '0xabc', finalScore: 123 },
    ]);

    db.depositsRepo.getStakedTokenBalances.mockResolvedValue({
      USDC: 0.5,
      GHO: 0,
      GHST: 0,
    });

    const res = await runPrizeDistributionJob({ date: '2026-02-02' });

    expect(res.success).toBe(true);
    expect(res.prizesDistributed).toBe(0);
    expect(res.prizesSkipped).toBe(1);
    expect(db.tokenWithdrawalsRepo.createTokenWithdrawal).toHaveBeenCalledTimes(0);
  });

  it('skips payout when user has no stake in either currency', async () => {
    db.dailyQuestLeaderboardRepo.getTopEntries.mockResolvedValue([
      { id: 'le-1', accountId: '0xabc', finalScore: 123 },
    ]);

    db.depositsRepo.getStakedTokenBalances.mockResolvedValue({ USDC: 0, GHST: 0 });

    const res = await runPrizeDistributionJob({ date: '2026-02-02' });

    expect(res.success).toBe(true);
    expect(res.prizesDistributed).toBe(0);
    expect(res.prizesSkipped).toBe(1);
    expect(db.tokenWithdrawalsRepo.createTokenWithdrawal).toHaveBeenCalledTimes(0);
  });

  it('dry run respects staking eligibility and skips ineligible payouts', async () => {
    db.dailyQuestLeaderboardRepo.getTopEntries.mockResolvedValue([
      { id: 'le-1', accountId: '0xabc', finalScore: 123 },
    ]);

    db.depositsRepo.getStakedTokenBalances.mockResolvedValue({ USDC: 0, GHST: 0 });

    const res = await runPrizeDistributionJob({
      date: '2026-02-02',
      dryRun: true,
      allowAlreadyDistributed: true,
    });

    expect(res.success).toBe(true);
    expect(res.prizesDistributed).toBe(0);
    expect(res.prizesSkipped).toBe(1);
    expect(res.results[0]?.usdcAmount).toBe(0);
    expect(res.results[0]?.ghstAmount).toBe(0);
  });

  it('does not re-send withdrawals that already exist', async () => {
    db.dailyQuestLeaderboardRepo.getTopEntries.mockResolvedValue([
      { id: 'le-1', accountId: '0xabc', finalScore: 123 },
    ]);

    db.depositsRepo.getStakedTokenBalances.mockResolvedValue({ USDC: 1, GHST: 1 });

    db.dailyQuestLeaderboardRepo.getPrizeDistributionForUpdate.mockResolvedValue({
      id: 'pd-1',
      status: 'distributed',
      usdcWithdrawalId: 'usdc-existing',
      ghstWithdrawalId: null,
    });

    const res = await runPrizeDistributionJob({ date: '2026-02-02' });

    expect(res.success).toBe(true);
    expect(db.tokenWithdrawalsRepo.createTokenWithdrawal).toHaveBeenCalledTimes(1);
    expect(db.tokenWithdrawalsRepo.createTokenWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'GHST' })
    );
    expect(db.dailyQuestLeaderboardRepo.markPrizeDistributed).toHaveBeenCalledWith(
      'pd-1',
      'usdc-existing',
      'GHST-w1',
      undefined
    );
  });
});
