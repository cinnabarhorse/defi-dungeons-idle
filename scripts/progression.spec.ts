import {
  applyLevelLoss,
  computeProgressionModifiers,
  createDefaultProfile,
  getTotalXpForLevel,
  sanitizeProfile,
} from '@gotchiverse/progression';

describe('progression', () => {
  it('applyLevelLoss reduces level, rewinds XP, and removes allocated points from newest history first', () => {
    const base = createDefaultProfile();

    // Create a level 5 profile with 4 total earned points (level-1) already allocated.
    // Order matters: applyLevelLoss pops from allocationHistory when unspentPoints is 0.
    const profile = {
      ...base,
      level: 5,
      totalXp: getTotalXpForLevel(5),
      unspentPoints: 0,
      stats: {
        energy: 2,
        aggression: 1,
        spookiness: 1,
        brainSize: 0,
      },
      allocationHistory: ['energy', 'energy', 'aggression', 'spookiness'] as const,
    };

    const result = applyLevelLoss(profile, 2);

    expect(result.levelsLost).toBe(2);
    expect(result.previousLevel).toBe(5);
    expect(result.currentLevel).toBe(3);

    // XP should rewind to the start of the new level.
    expect(result.profile.totalXp).toBe(getTotalXpForLevel(3));

    // Two most recent allocations removed: spookiness then aggression.
    expect(result.profile.stats).toEqual({
      energy: 2,
      aggression: 0,
      spookiness: 0,
      brainSize: 0,
    });
    expect(result.profile.allocationHistory).toEqual(['energy', 'energy']);

    // At level 3, max points is 2; since 2 are allocated, unspent should be 0.
    expect(result.profile.unspentPoints).toBe(0);
  });

  it('sanitizeProfile clamps invalid values and prevents stat+unspent overflow beyond level cap', () => {
    const input = {
      // Total XP at least level 3.
      totalXp: getTotalXpForLevel(3),
      // Try to claim too many points for this level.
      unspentPoints: 10,
      stats: {
        energy: 1,
        aggression: 1,
        spookiness: 1,
        brainSize: 1,
      },
      allocationHistory: ['energy', 'not-a-stat', 'brainSize'],
      lastSyncedAt: Number.NaN,
    };

    const sanitized = sanitizeProfile(input as any);

    // Level is derived from totalXp and should be 3 here.
    expect(sanitized.level).toBe(3);

    // allocationHistory should drop invalid entries.
    expect(sanitized.allocationHistory).toEqual(['energy', 'brainSize']);

    // lastSyncedAt should be undefined if not a finite number.
    expect(sanitized.lastSyncedAt).toBeUndefined();

    // Level 3 allows 2 points total (level-1). We allocated 4 in stats, so
    // sanitizeProfile must reduce unspentPoints to 0 to avoid further overflow.
    // (It does not auto-rebalance stats.)
    expect(sanitized.unspentPoints).toBe(0);
  });

  it('computeProgressionModifiers clamps haste floor and caps spookiness/cooldown scaling', () => {
    const mods = computeProgressionModifiers({
      energy: 999,
      aggression: 10,
      spookiness: 999,
      brainSize: 999,
    });

    // Energy haste is capped so the final scalar is clamped to >= 0.4.
    expect(mods.attackSpeedScalar).toBe(0.4);

    // Spookiness multiplier is capped at +150% (i.e., 2.5x total).
    expect(mods.maxHealthMultiplier).toBe(2.5);

    // Cooldown refund chance is clamped at 0.4.
    expect(mods.cooldownRefundChance).toBe(0.4);
  });
});
