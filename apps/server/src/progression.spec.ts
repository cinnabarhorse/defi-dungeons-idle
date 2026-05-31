/// <reference types="jest" />

import {
  applyLevelLoss,
  applyXp,
  BASE_LEVEL_CAP,
  computeProgressionModifiers,
  createDefaultProfile,
  getLevelProgress,
  refundLatestStatPoint,
  resetAllocations,
  sanitizeProfile,
  spendStatPoint,
  LEVEL_CAP,
  getCumulativeXpTable,
  type StatKey,
} from '@gotchiverse/progression';

describe('progression module', () => {
  test('cap-aware progression helpers respect explicit level caps', () => {
    const table = getCumulativeXpTable();

    const cappedProfile = applyXp(
      createDefaultProfile(),
      Number.MAX_SAFE_INTEGER,
      BASE_LEVEL_CAP
    ).profile;
    expect(cappedProfile.level).toBe(BASE_LEVEL_CAP);
    expect(cappedProfile.totalXp).toBe(table[BASE_LEVEL_CAP]);

    const cappedProgress = getLevelProgress(
      Number.MAX_SAFE_INTEGER,
      BASE_LEVEL_CAP
    );
    expect(cappedProgress.level).toBe(BASE_LEVEL_CAP);

    const uncappedProfile = applyXp(
      createDefaultProfile(),
      Number.MAX_SAFE_INTEGER
    ).profile;
    expect(uncappedProfile.level).toBe(LEVEL_CAP);
    expect(uncappedProfile.totalXp).toBe(table[LEVEL_CAP]);
  });

  test('sanitizeProfile honors explicit level caps', () => {
    const table = getCumulativeXpTable();
    const sanitized = sanitizeProfile(
      {
        level: LEVEL_CAP,
        totalXp: table[LEVEL_CAP],
      },
      BASE_LEVEL_CAP
    );

    expect(sanitized.level).toBe(BASE_LEVEL_CAP);
    expect(sanitized.totalXp).toBe(table[BASE_LEVEL_CAP]);
  });

  test('sanitizeProfile returns a safe default for null/invalid input', () => {
    const p1 = sanitizeProfile(null);
    expect(p1).toEqual(createDefaultProfile());

    const p2 = sanitizeProfile(undefined);
    expect(p2).toEqual(createDefaultProfile());

    // non-object input should also default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p3 = sanitizeProfile(123 as any);
    expect(p3).toEqual(createDefaultProfile());
  });

  test('sanitizeProfile clamps values and filters invalid allocation history', () => {
    const table = getCumulativeXpTable();

    const sanitized = sanitizeProfile({
      level: LEVEL_CAP + 999,
      totalXp: table[LEVEL_CAP] + 999999,
      unspentPoints: -10,
      stats: {
        energy: -5,
        aggression: 2.9,
        spookiness: Number.NaN,
        brainSize: 1,
      },
      allocationHistory: [
        'energy',
        'not-a-stat',
        'aggression',
        123,
        null,
        'brainSize',
      ] as unknown as StatKey[],
      lastSyncedAt: Infinity,
    });

    // totalXp should cap; sanitizeProfile also re-derives level from XP
    expect(sanitized.totalXp).toBe(table[LEVEL_CAP]);
    expect(sanitized.level).toBe(LEVEL_CAP);

    // stats sanitized to non-negative ints
    expect(sanitized.stats).toEqual({
      energy: 0,
      aggression: 2,
      spookiness: 0,
      brainSize: 1,
    });

    // invalid values removed
    expect(sanitized.allocationHistory).toEqual([
      'energy',
      'aggression',
      'brainSize',
    ]);

    // lastSyncedAt should be dropped for non-finite numbers
    expect(sanitized.lastSyncedAt).toBeUndefined();
  });

  test('applyLevelLoss removes unspent points first, then allocated points via allocationHistory', () => {
    let profile = createDefaultProfile();

    // gain some levels/points
    profile = applyXp(profile, 1_000_000).profile;
    expect(profile.level).toBeGreaterThanOrEqual(3);

    // spend two points and keep one unspent (if available)
    profile = spendStatPoint(profile, 'energy').profile;
    profile = spendStatPoint(profile, 'aggression').profile;

    const before = profile;

    // Lose 2 levels: should remove up to 2 points; unspent gets removed first.
    const result = applyLevelLoss(profile, 2);
    const after = result.profile;

    expect(result.levelsLost).toBe(2);
    expect(after.level).toBe(before.level - 2);

    // XP should snap exactly to the new level's cumulative XP start
    const table = getCumulativeXpTable();
    expect(after.totalXp).toBe(table[after.level]);

    // Either unspent reduced, or allocated reduced if unspent was 0.
    // In any case, total points should not exceed maxPoints (= level-1)
    const totalAllocated =
      after.stats.energy +
      after.stats.aggression +
      after.stats.spookiness +
      after.stats.brainSize;
    expect(totalAllocated + after.unspentPoints).toBeLessThanOrEqual(
      Math.max(0, after.level - 1)
    );

    // Allocation history length should never exceed totalAllocated
    expect(after.allocationHistory.length).toBeLessThanOrEqual(totalAllocated);
  });

  test('computeProgressionModifiers clamps negative stats and caps haste/refund chance', () => {
    const modifiers = computeProgressionModifiers({
      energy: 10_000,
      aggression: -50,
      spookiness: 10_000,
      brainSize: 10_000,
    });

    // attack speed scalar has a floor of 0.4 (max haste)
    expect(modifiers.attackSpeedScalar).toBe(0.4);

    // aggression negative should be treated as 0 => base multiplier
    expect(modifiers.damageMultiplier).toBe(1);

    // spookiness HP multiplier capped at +150% (i.e., 2.5x)
    expect(modifiers.maxHealthMultiplier).toBe(2.5);

    // cooldown refund chance is clamped to <= 0.4
    expect(modifiers.cooldownRefundChance).toBe(0.4);
  });

  test('spendStatPoint throws when no unspent points are available', () => {
    const profile = createDefaultProfile();
    expect(() => spendStatPoint(profile, 'energy')).toThrow(
      'No unspent stat points available'
    );
  });

  test('refundLatestStatPoint is a no-op (but returns a clone) when allocationHistory is empty', () => {
    const profile = createDefaultProfile();
    const refunded = refundLatestStatPoint(profile);

    // structural equality
    expect(refunded).toEqual(profile);
    // but should not be the same object reference
    expect(refunded).not.toBe(profile);
  });

  test('resetAllocations zeros stats, clears history, and returns points to unspent', () => {
    let profile = createDefaultProfile();
    profile = applyXp(profile, 1_000_000).profile;

    // spend a couple points so we have allocated stats + history
    profile = spendStatPoint(profile, 'energy').profile;
    profile = spendStatPoint(profile, 'brainSize').profile;

    const before = profile;
    const totalAllocatedBefore =
      before.stats.energy +
      before.stats.aggression +
      before.stats.spookiness +
      before.stats.brainSize;

    const after = resetAllocations(before);

    expect(after.stats).toEqual({
      energy: 0,
      aggression: 0,
      spookiness: 0,
      brainSize: 0,
    });
    expect(after.allocationHistory).toEqual([]);

    // unspent should increase exactly by however many points were allocated
    expect(after.unspentPoints).toBe(before.unspentPoints + totalAllocatedBefore);
  });
});
