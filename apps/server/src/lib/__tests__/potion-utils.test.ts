/**
 * Unit tests for Potion Utilities
 *
 * Run with: npx tsx --test apps/server/src/lib/__tests__/potion-utils.test.ts
 */

import {
  computeHealthPotionHeal,
  computeManaPotionRestore,
  getHealthPotionTier,
  isHealthPotionItem,
  selectOptimalPotion,
} from '../potion-utils';

describe('computeHealthPotionHeal', () => {
  describe('Tier 1 (Health Potion)', () => {
    it('returns minimum 50 for low maxHp', () => {
      // 100 * 0.1 = 10, but min is 50
      expect(computeHealthPotionHeal(100, 1)).toBe(50);
    });

    it('returns 10% when above minimum', () => {
      // 500 * 0.1 = 50, which equals min
      expect(computeHealthPotionHeal(500, 1)).toBe(50);
    });

    it('returns percentage when higher than minimum', () => {
      // 1000 * 0.1 = 100, which is above min 50
      expect(computeHealthPotionHeal(1000, 1)).toBe(100);
    });
  });

  describe('Tier 2 (Greater Healing Potion)', () => {
    it('returns 25% of maxHp', () => {
      // 500 * 0.25 = 125
      expect(computeHealthPotionHeal(500, 2)).toBe(125);
    });

    it('returns percentage for any HP (minHeal is 0)', () => {
      // 100 * 0.25 = 25 (no minimum)
      expect(computeHealthPotionHeal(100, 2)).toBe(25);
    });

    it('handles large HP values', () => {
      // 2000 * 0.25 = 500
      expect(computeHealthPotionHeal(2000, 2)).toBe(500);
    });
  });

  describe('Tier 3 (Ultra Healing Potion)', () => {
    it('returns 50% of maxHp', () => {
      // 500 * 0.50 = 250
      expect(computeHealthPotionHeal(500, 3)).toBe(250);
    });

    it('returns percentage for any HP (minHeal is 0)', () => {
      // 100 * 0.50 = 50 (no minimum)
      expect(computeHealthPotionHeal(100, 3)).toBe(50);
    });

    it('handles large HP values', () => {
      // 2000 * 0.50 = 1000
      expect(computeHealthPotionHeal(2000, 3)).toBe(1000);
    });
  });

  describe('Invalid tier handling', () => {
    it('defaults to tier 1 behavior for tier 0', () => {
      expect(computeHealthPotionHeal(500, 0)).toBe(50);
    });

    it('defaults to tier 1 behavior for tier 4', () => {
      expect(computeHealthPotionHeal(500, 4)).toBe(50);
    });

    it('defaults to tier 1 behavior for negative tier', () => {
      expect(computeHealthPotionHeal(500, -1)).toBe(50);
    });

    it('defaults to tier 1 behavior when tier not provided', () => {
      expect(computeHealthPotionHeal(500)).toBe(50);
    });
  });

  describe('Edge cases', () => {
    it('handles 0 maxHp', () => {
      // 0 * 0.1 = 0, min is 50
      expect(computeHealthPotionHeal(0, 1)).toBe(50);
      // 0 * 0.25 = 0, min is 0
      expect(computeHealthPotionHeal(0, 2)).toBe(0);
      // 0 * 0.50 = 0, min is 0
      expect(computeHealthPotionHeal(0, 3)).toBe(0);
    });

    it('handles negative maxHp by treating as 0', () => {
      expect(computeHealthPotionHeal(-100, 1)).toBe(50);
      expect(computeHealthPotionHeal(-100, 2)).toBe(0);
    });

    it('floors decimal values', () => {
      // 333 * 0.1 = 33.3, floors to 33, but min is 50
      expect(computeHealthPotionHeal(333, 1)).toBe(50);
      // 333 * 0.25 = 83.25, floors to 83
      expect(computeHealthPotionHeal(333, 2)).toBe(83);
      // 333 * 0.50 = 166.5, floors to 166
      expect(computeHealthPotionHeal(333, 3)).toBe(166);
    });
  });
});

describe('selectOptimalPotion', () => {
  describe('Selecting lowest tier that saves', () => {
    it('Example: HP at -40, maxHp 500, has T1 and T2 → select T1 (heals 50, survives at 10)', () => {
      // T1 heals 50: -40 + 50 = 10 (survives)
      // T2 heals 125: -40 + 125 = 85 (also survives, but T1 is enough)
      const result = selectOptimalPotion(-40, 500, { 1: 3, 2: 2 });
      expect(result).toBe(1);
    });

    it('Example: HP at -100, maxHp 500, has T1 and T2 → select T2 (T1 heals 50 = -50, T2 heals 125 = 25)', () => {
      // T1 heals 50: -100 + 50 = -50 (dies)
      // T2 heals 125: -100 + 125 = 25 (survives)
      const result = selectOptimalPotion(-100, 500, { 1: 5, 2: 2 });
      expect(result).toBe(2);
    });

    it('selects T2 when T1 not enough but T2 saves', () => {
      // HP at -60, maxHp 500
      // T1 heals 50: -60 + 50 = -10 (dies)
      // T2 heals 125: -60 + 125 = 65 (survives)
      const result = selectOptimalPotion(-60, 500, { 1: 10, 2: 5, 3: 1 });
      expect(result).toBe(2);
    });

    it('selects T3 when T1 and T2 not enough', () => {
      // HP at -200, maxHp 500
      // T1 heals 50: -200 + 50 = -150 (dies)
      // T2 heals 125: -200 + 125 = -75 (dies)
      // T3 heals 250: -200 + 250 = 50 (survives)
      const result = selectOptimalPotion(-200, 500, { 1: 10, 2: 5, 3: 1 });
      expect(result).toBe(3);
    });
  });

  describe('Selecting highest when cannot save', () => {
    it('Example: HP at -300, maxHp 500, has T1 only → select T1 (best available, still dies)', () => {
      // T1 heals 50: -300 + 50 = -250 (dies anyway)
      const result = selectOptimalPotion(-300, 500, { 1: 5 });
      expect(result).toBe(1);
    });

    it('selects highest available tier when no tier can save', () => {
      // HP at -500, maxHp 500
      // T1 heals 50: -500 + 50 = -450 (dies)
      // T2 heals 125: -500 + 125 = -375 (dies)
      // All die, but T2 is highest available
      const result = selectOptimalPotion(-500, 500, { 1: 3, 2: 2 });
      expect(result).toBe(2);
    });

    it('selects T3 as highest when all available and none saves', () => {
      // HP at -1000, maxHp 500
      // Even T3 (250) can't save: -1000 + 250 = -750
      const result = selectOptimalPotion(-1000, 500, { 1: 5, 2: 3, 3: 1 });
      expect(result).toBe(3);
    });
  });

  describe('No potions available', () => {
    it('returns null when no potions', () => {
      const result = selectOptimalPotion(-50, 500, {});
      expect(result).toBeNull();
    });

    it('returns null when all quantities are 0', () => {
      const result = selectOptimalPotion(-50, 500, { 1: 0, 2: 0, 3: 0 });
      expect(result).toBeNull();
    });

    it('returns null with empty object', () => {
      const result = selectOptimalPotion(-50, 500, {});
      expect(result).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('handles only T3 available', () => {
      // HP at -40, maxHp 500, only T3
      // T3 heals 250: -40 + 250 = 210 (survives)
      const result = selectOptimalPotion(-40, 500, { 3: 1 });
      expect(result).toBe(3);
    });

    it('handles only T2 available when T1 would have been enough', () => {
      // HP at -40, maxHp 500, only T2
      // T2 heals 125: -40 + 125 = 85 (survives)
      const result = selectOptimalPotion(-40, 500, { 2: 1 });
      expect(result).toBe(2);
    });

    it('ignores invalid tiers (0, 4, negative)', () => {
      // Only valid tier is 2
      const result = selectOptimalPotion(-50, 500, { 0: 5, 2: 1, 4: 10, [-1]: 3 });
      expect(result).toBe(2);
    });

    it('handles HP exactly at 0', () => {
      // HP at 0, T1 heals 50: 0 + 50 = 50 (survives)
      const result = selectOptimalPotion(0, 500, { 1: 1 });
      expect(result).toBe(1);
    });

    it('handles very negative HP with high maxHp', () => {
      // HP at -2000, maxHp 10000
      // T1 heals max(50, 1000) = 1000: -2000 + 1000 = -1000 (dies)
      // T2 heals 2500: -2000 + 2500 = 500 (survives)
      const result = selectOptimalPotion(-2000, 10000, { 1: 5, 2: 2 });
      expect(result).toBe(2);
    });
  });
});

describe('computeManaPotionRestore', () => {
  it('returns minimum 50 for low maxMana', () => {
    // 100 * 0.2 = 20, but min is 50
    expect(computeManaPotionRestore(100)).toBe(50);
  });

  it('returns 20% when above minimum', () => {
    // 500 * 0.2 = 100, above min
    expect(computeManaPotionRestore(500)).toBe(100);
  });

  it('treats negative maxMana as 0', () => {
    // max(50, floor(max(0, -10) * 0.2)) => 50
    expect(computeManaPotionRestore(-10)).toBe(50);
  });
});

describe('isHealthPotionItem', () => {
  it('returns true when potionTier is present and > 0 (even if type/name are missing)', () => {
    expect(isHealthPotionItem({ potionTier: 1 })).toBe(true);
  });

  it('returns true for explicit health potion types (including suffix matching)', () => {
    expect(isHealthPotionItem({ type: 'health_potion' })).toBe(true);
    expect(isHealthPotionItem({ itemType: 'greater_health_potion' })).toBe(true);
    expect(isHealthPotionItem({ type: 'ultra_health_potion' })).toBe(true);
    expect(isHealthPotionItem({ type: 'mystic_health_potion' })).toBe(true);
  });

  it('returns true when name suggests health/healing (case-insensitive)', () => {
    expect(isHealthPotionItem({ name: 'Minor Healing Potion' })).toBe(true);
    expect(isHealthPotionItem({ name: 'HEALTH POTION' })).toBe(true);
  });

  it('returns false for unrelated items', () => {
    expect(isHealthPotionItem({ type: 'mana_potion', name: 'Mana Potion', potionTier: 0 })).toBe(false);
    expect(isHealthPotionItem({ type: 'weapon', name: 'Sword' })).toBe(false);
  });
});

describe('getHealthPotionTier', () => {
  it('uses numeric potionTier when in [1..3] and floors decimals', () => {
    expect(getHealthPotionTier({ potionTier: 2.9 })).toBe(2);
    expect(getHealthPotionTier({ potionTier: 1 })).toBe(1);
    expect(getHealthPotionTier({ potionTier: 3 })).toBe(3);
  });

  it('falls back to type/name parsing when potionTier is invalid', () => {
    expect(getHealthPotionTier({ potionTier: 0, type: 'ultra_health_potion' })).toBe(3);
    expect(getHealthPotionTier({ potionTier: 99, name: 'Greater Healing Potion' })).toBe(2);
    expect(getHealthPotionTier({ potionTier: -1, name: 'Health Potion' })).toBe(1);
  });

  it('returns null when it cannot infer a tier', () => {
    expect(getHealthPotionTier({ type: 'mana_potion', name: 'Mana Potion' })).toBeNull();
    expect(getHealthPotionTier({})).toBeNull();
  });
});
