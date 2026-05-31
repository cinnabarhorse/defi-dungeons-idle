import {
  RUN_LEVEL_CAP,
  applyRunXp,
  createRunProfile,
  getRunLevelProgress,
  getRunLevelTotalXp,
  withRunProfileLevel,
} from './runLevels';

describe('runLevels', () => {
  describe('createRunProfile', () => {
    it('normalizes unknown/invalid archetypeIds to "unknown" and uses default modifiers', () => {
      const profile = createRunProfile('NOT_A_REAL_ARCHETYPE', 123);

      expect(profile.archetypeId).toBe('unknown');
      expect(profile.level).toBe(1);
      expect(profile.totalXp).toBe(0);
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
      expect(profile.createdAt).toBe(123);
      expect(profile.updatedAt).toBe(123);
    });
  });

  describe('getRunLevelProgress', () => {
    it('treats negative or fractional xp as 0 and stays at level 1', () => {
      expect(getRunLevelProgress(-100).level).toBe(1);
      expect(getRunLevelProgress(-100).xpIntoLevel).toBe(0);

      const fractional = getRunLevelProgress(1.9);
      expect(fractional.level).toBe(1);
      expect(fractional.xpIntoLevel).toBe(1);
    });

    it('returns the next level when totalXp is exactly on a level boundary', () => {
      const level2Boundary = getRunLevelTotalXp(2);
      const progress = getRunLevelProgress(level2Boundary);

      expect(progress.level).toBe(2);
      expect(progress.xpIntoLevel).toBe(0);
    });
  });

  describe('applyRunXp', () => {
    it('clamps XP to [0, max] and can reach the run level cap', () => {
      const profile = createRunProfile('paladin', 0);

      // negative XP is sanitized to 0
      const negative = applyRunXp(profile, -50, 1);
      expect(negative.totalXpAdded).toBe(0);
      expect(negative.profile.totalXp).toBe(0);
      expect(negative.profile.level).toBe(1);

      const huge = applyRunXp(profile, Number.MAX_SAFE_INTEGER, 2);
      expect(huge.profile.level).toBe(RUN_LEVEL_CAP);
      expect(huge.profile.totalXp).toBe(getRunLevelTotalXp(RUN_LEVEL_CAP));
      // paladin uses percent_damage_reduction with cap 0.5 => 50 armor at max
      expect(huge.profile.modifiers.armorBonus).toBe(50);
    });

    it('respects attack speed scalar floors derived from archetype caps', () => {
      const profile = createRunProfile('berserker', 0);
      const level1 = withRunProfileLevel(profile, 1, 0);
      const levelCap = withRunProfileLevel(profile, RUN_LEVEL_CAP, 0);

      expect(level1.modifiers.attackSpeedScalar).toBeLessThanOrEqual(1);
      expect(levelCap.modifiers.attackSpeedScalar).toBeGreaterThanOrEqual(0.4);
      expect(levelCap.modifiers.attackSpeedScalar).toBeLessThan(level1.modifiers.attackSpeedScalar);
    });
  });
});
