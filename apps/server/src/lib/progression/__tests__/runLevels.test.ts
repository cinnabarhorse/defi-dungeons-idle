describe('runLevels', () => {
  const {
    RUN_LEVEL_CAP,
    createRunProfile,
    applyRunXp,
    getRunLevelProgress,
    getRunLevelTotalXp,
    getRunXpRequiredForLevel,
    withRunProfileLevel,
  } = require('../runLevels');

  test('createRunProfile normalizes unknown archetypes and uses sane defaults', () => {
    const now = 1234;
    const profile = createRunProfile('NOT-A-REAL-ARCHETYPE', now);

    expect(profile.archetypeId).toBe('unknown');
    expect(profile.level).toBe(1);
    expect(profile.totalXp).toBe(0);
    expect(profile.createdAt).toBe(now);
    expect(profile.updatedAt).toBe(now);

    // Default modifiers when trait is missing/none.
    expect(profile.modifiers).toEqual({
      attackSpeedScalar: 1,
      damageMultiplier: 1,
      maxHealthMultiplier: 1,
      maxHealthFlatBonus: 0,
      movementSpeedMultiplier: 1,
      armorBonus: 0,
      lifeStealPercent: 0,
      criticalChanceBonus: 0,
      evadeChanceBonus: 0,
      hpRegenPerSecondBonus: 0,
      manaRegenMultiplier: 1,
      attackRangeMultiplier: 1,
      magicFindBonus: 0,
      potionCoinFindBonus: 0,
    });
  });

  test('applyRunXp clamps negative xp to 0, caps at RUN_LEVEL_CAP, and returns consistent progress', () => {
    const start = 1000;
    const now = 2000;
    const base = createRunProfile('unknown', start);

    const negative = applyRunXp(base, -500, now);
    expect(negative.totalXpAdded).toBe(0);
    expect(negative.levelUps).toBe(0);
    expect(negative.profile.totalXp).toBe(0);
    expect(negative.profile.level).toBe(1);
    expect(negative.profile.updatedAt).toBe(now);

    const maxXp = getRunLevelTotalXp(RUN_LEVEL_CAP);
    const huge = applyRunXp(base, maxXp * 10, now);
    expect(huge.profile.level).toBe(RUN_LEVEL_CAP);
    expect(huge.profile.totalXp).toBe(maxXp);
    expect(huge.progress.xpForNextLevel).toBe(0);
    expect(huge.progress.progress).toBe(0);
  });

  test('withRunProfileLevel clamps levels into [1, RUN_LEVEL_CAP]', () => {
    const start = 1000;
    const base = createRunProfile('unknown', start);

    expect(withRunProfileLevel(base, -10, 2000).level).toBe(1);
    expect(withRunProfileLevel(base, RUN_LEVEL_CAP + 100, 2000).level).toBe(
      RUN_LEVEL_CAP
    );
  });

  test('getRunLevelProgress never returns progress > 1 and handles cap correctly', () => {
    const maxXp = getRunLevelTotalXp(RUN_LEVEL_CAP);

    const atCap = getRunLevelProgress(maxXp);
    expect(atCap.level).toBe(RUN_LEVEL_CAP);
    expect(atCap.xpForNextLevel).toBe(0);
    expect(atCap.progress).toBe(0);

    const over = getRunLevelProgress(maxXp + 999999);
    expect(over.level).toBe(RUN_LEVEL_CAP);
    expect(over.progress).toBe(0);

    const req = getRunXpRequiredForLevel(1);
    expect(req).toBeGreaterThan(0);
  });
});
