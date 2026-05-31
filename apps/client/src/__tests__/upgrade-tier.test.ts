import {
  buildUpgradeTierViewModel,
  getChestUnlockStakeAmount,
  resolveUpgradeTierStakeTotal,
} from '../lib/upgrade-tier';

describe('upgrade tier chest unlock stake option', () => {
  it('returns 1 when total staked is below the chest unlock threshold', () => {
    expect(getChestUnlockStakeAmount(0)).toBe(1);
    expect(getChestUnlockStakeAmount(0.9)).toBe(1);
  });

  it('returns null when total staked meets the chest unlock threshold', () => {
    expect(getChestUnlockStakeAmount(1)).toBeNull();
    expect(getChestUnlockStakeAmount(5)).toBeNull();
  });

  it('exposes the chest unlock stake amount on the view model', () => {
    const viewModel = buildUpgradeTierViewModel(0);
    expect(viewModel.totalStaked).toBe(0);
    expect(viewModel.chestUnlockStakeAmount).toBe(1);
    expect(viewModel.chestsEnabled).toBe(false);
    expect(viewModel.nextStakeThreshold).toBe(1);
    expect(viewModel.nextDifficultyName).toBe('Normal');
  });

  it('prefers progression stake totals for upgrades when daily-runs totals lag', () => {
    const total = resolveUpgradeTierStakeTotal({
      progressionTotalStaked: 12,
      dailyRuns: {
        totalStaked: 8,
        usdcStaked: 8,
        ghoStaked: 0,
      },
      exhausted: null,
    });

    expect(total).toBe(12);
  });
});
