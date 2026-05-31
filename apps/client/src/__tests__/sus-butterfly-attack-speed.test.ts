import { ITEM_TYPE_EFFECTS } from '../data/wearables';

describe('sus-butterfly attack speed effects', () => {
  it('applies attack-speed multipliers above baseline at all rarities', () => {
    const petEffects = ITEM_TYPE_EFFECTS.pet;
    if (!petEffects) {
      throw new Error('Missing pet effects fixture');
    }

    const effectsByRarity = petEffects['sus-butterfly'];
    if (!effectsByRarity) {
      throw new Error('Missing sus-butterfly effects fixture');
    }

    const rarities = [
      'common',
      'uncommon',
      'rare',
      'legendary',
      'mythical',
      'godlike',
    ] as const;

    for (const rarity of rarities) {
      const effects = effectsByRarity[rarity];
      if (!effects) {
        throw new Error(`Missing sus-butterfly effects for ${rarity}`);
      }

      const attackSpeedModifier = effects
        .filter((effect) => effect.type === 'stat')
        .flatMap((effect) => effect.modifiers)
        .find((modifier) => modifier.stat === 'attackSpeed');

      if (!attackSpeedModifier) {
        throw new Error(`Missing attackSpeed modifier for ${rarity}`);
      }

      expect(attackSpeedModifier.operation).toBe('mul');
      expect(attackSpeedModifier.value).toBeGreaterThan(1);
    }
  });
});
