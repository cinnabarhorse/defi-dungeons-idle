import {
  computeHealthPotionHeal,
  computeManaPotionRestore,
  getHealthPotionTier,
  isHealthPotionItem,
  selectOptimalPotion,
} from '../apps/server/src/lib/potion-utils';

describe('Potion utils – tiered health potions', () => {
  describe('Health Potion (Tier 1) – 10% or 50, whichever is higher', () => {
    test('returns 50 when 10% < 50', () => {
      expect(computeHealthPotionHeal(100)).toBe(50); // 10% = 10 < 50
      expect(computeHealthPotionHeal(200)).toBe(50); // 10% = 20 < 50
      expect(computeHealthPotionHeal(400)).toBe(50); // 10% = 40 < 50
      expect(computeHealthPotionHeal(500)).toBe(50); // 10% = 50 = 50 (exact threshold)
    });

    test('returns 10% when higher than 50', () => {
      expect(computeHealthPotionHeal(600)).toBe(60); // 10% = 60 > 50
      expect(computeHealthPotionHeal(1000)).toBe(100); // 10% = 100
    });
  });

  describe('Greater Healing Potion (Tier 2) – 25% with no minimum', () => {
    test('returns 25% of maxHp', () => {
      expect(computeHealthPotionHeal(100, 2)).toBe(25); // 25% = 25
      expect(computeHealthPotionHeal(400, 2)).toBe(100); // 25% = 100
      expect(computeHealthPotionHeal(500, 2)).toBe(125); // 25% = 125
    });
  });

  describe('Ultra Healing Potion (Tier 3) – 50% with no minimum', () => {
    test('returns 50% of maxHp', () => {
      expect(computeHealthPotionHeal(100, 3)).toBe(50); // 50% = 50
      expect(computeHealthPotionHeal(400, 3)).toBe(200); // 50% = 200
      expect(computeHealthPotionHeal(500, 3)).toBe(250); // 50% = 250
    });
  });
});

describe('Mana potion – 20% or 50, whichever is higher', () => {
  test('returns 50 when 20% < 50', () => {
    expect(computeManaPotionRestore(100)).toBe(50); // 20% = 20 < 50
    expect(computeManaPotionRestore(200)).toBe(50); // 20% = 40 < 50
  });

  test('returns 20% when higher than 50', () => {
    expect(computeManaPotionRestore(400)).toBe(80); // 20% = 80 > 50
    expect(computeManaPotionRestore(501)).toBe(100); // 20% = 100.2 -> floor 100
  });
});

describe('Potion item identification + auto-selection', () => {
  test('isHealthPotionItem detects by tier, type, or name', () => {
    expect(isHealthPotionItem({ potionTier: 1 })).toBe(true);
    expect(isHealthPotionItem({ type: 'legendary_health_potion' })).toBe(true);
    expect(isHealthPotionItem({ name: 'Greater Healing Potion' })).toBe(true);

    // negative case: no tier, no relevant type, no relevant name
    expect(isHealthPotionItem({ type: 'mana_potion', name: 'Mana Potion' })).toBe(false);
  });

  test('getHealthPotionTier parses numeric tier (floors) and falls back to type/name', () => {
    // numeric tier should win, and non-integer should floor
    expect(getHealthPotionTier({ potionTier: 2.9, type: 'ultra_health_potion' })).toBe(2);

    // no tier -> infer from type/name
    expect(getHealthPotionTier({ type: 'ultra_health_potion' })).toBe(3);
    expect(getHealthPotionTier({ name: 'Greater Healing Potion' })).toBe(2);
    expect(getHealthPotionTier({ type: 'health_potion' })).toBe(1);

    // nothing to infer
    expect(getHealthPotionTier({ type: 'mana_potion', name: 'Mana Potion' })).toBe(null);
  });

  test('selectOptimalPotion returns lowest tier that saves, else highest available, else null', () => {
    // HP = -40, maxHp 500 -> T1 heals 50, saves (hpAfter = 10)
    expect(selectOptimalPotion(-40, 500, { 1: 1, 2: 1 })).toBe(1);

    // HP = -100, maxHp 500 -> T1 heals 50 (still -50), T2 heals 125 (saves at 25)
    expect(selectOptimalPotion(-100, 500, { 1: 99, 2: 1 })).toBe(2);

    // none can save -> return highest available tier
    expect(selectOptimalPotion(-1000, 500, { 1: 1, 3: 1 })).toBe(3);

    // no potions -> null
    expect(selectOptimalPotion(-10, 500, { 1: 0, 2: 0, 3: 0 })).toBe(null);
  });
});
