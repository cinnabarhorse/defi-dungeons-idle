import { getCharacterStats } from '../data/characters';
import {
  ITEM_TYPES_BY_SLOT,
  getWearableById,
  itemTypes,
  resolveWearableEffectsByItemType,
} from '../data/wearables';

type AttackSpeedModifierSummary = {
  wearableName: string;
  slug: string;
  operation: 'add' | 'mul' | 'add_percent';
  value: number;
};

const HP_TRADEOFF_ATTACK_SPEED_ITEM_TYPES = [
  'shield',
  'helmet',
  'light-armor',
  'heavy-armor',
  'robe',
  'vest',
] as const;

function findRepresentativeWearableByItemType(itemType: string): {
  slug: string;
} {
  for (const id of Object.keys(itemTypes)) {
    const wearable = getWearableById(Number(id));
    if (!wearable || wearable.category !== 0) continue;
    if ((wearable as { itemType?: string }).itemType !== itemType) continue;
    return { slug: wearable.slug };
  }
  throw new Error(`No wearable found for itemType ${itemType}`);
}

function findSlotForItemType(itemType: string): keyof typeof ITEM_TYPES_BY_SLOT {
  for (const [slot, itemTypesForSlot] of Object.entries(ITEM_TYPES_BY_SLOT)) {
    if (itemTypesForSlot.includes(itemType)) {
      return slot as keyof typeof ITEM_TYPES_BY_SLOT;
    }
  }
  throw new Error(`No wearable slot found for itemType ${itemType}`);
}

function collectAttackSpeedModifiersByItemType(
  itemType: string
): AttackSpeedModifierSummary[] {
  const modifiers: AttackSpeedModifierSummary[] = [];

  for (const id of Object.keys(itemTypes)) {
    const wearable = getWearableById(Number(id));
    if (!wearable || wearable.category !== 0) continue;
    if ((wearable as { itemType?: string }).itemType !== itemType) continue;

    const effects = resolveWearableEffectsByItemType(wearable);
    for (const effect of effects) {
      if (!effect || effect.type !== 'stat') continue;

      for (const modifier of effect.modifiers) {
        if (modifier.stat !== 'attackSpeed') continue;

        const operation = modifier.operation ?? 'add';
        if (typeof modifier.value !== 'number') continue;

        modifiers.push({
          wearableName: wearable.name,
          slug: wearable.slug,
          operation,
          value: modifier.value,
        });
      }
    }
  }

  return modifiers;
}

describe('attack speed item-type intent', () => {
  it('hp-tradeoff wearables nerf attack speed in item-type modifiers', () => {
    for (const itemType of HP_TRADEOFF_ATTACK_SPEED_ITEM_TYPES) {
      const modifiers = collectAttackSpeedModifiersByItemType(itemType);
      expect(modifiers.length).toBeGreaterThan(0);

      for (const modifier of modifiers) {
        if (modifier.operation === 'mul') {
          expect(modifier.value).toBeLessThan(1);
          continue;
        }
        if (modifier.operation === 'add') {
          expect(modifier.value).toBeGreaterThan(0);
          continue;
        }
        throw new Error(
          `Unexpected ${itemType} attackSpeed operation ${modifier.operation} on ${modifier.slug}`
        );
      }
    }
  });

  it('sus-butterfly buffs attack speed (lower cooldown)', () => {
    const modifiers = collectAttackSpeedModifiersByItemType('sus-butterfly');
    expect(modifiers.length).toBeGreaterThan(0);

    for (const modifier of modifiers) {
      if (modifier.operation === 'mul') {
        expect(modifier.value).toBeGreaterThan(1);
        continue;
      }
      if (modifier.operation === 'add') {
        expect(modifier.value).toBeLessThan(0);
        continue;
      }
      throw new Error(
        `Unexpected sus-butterfly attackSpeed operation ${modifier.operation} on ${modifier.slug}`
      );
    }
  });

  it('derived cooldown direction matches hp-tradeoff nerfs and sus buff intent', () => {
    const base = getCharacterStats('aagent', { equippedWearables: null });

    for (const itemType of HP_TRADEOFF_ATTACK_SPEED_ITEM_TYPES) {
      const wearable = findRepresentativeWearableByItemType(itemType);
      const slot = findSlotForItemType(itemType);
      const equippedWearables: Partial<
        Record<keyof typeof ITEM_TYPES_BY_SLOT, string>
      > = {
        [slot]: wearable.slug,
      };
      const withItemType = getCharacterStats('aagent', {
        equippedWearables,
      });

      expect(withItemType.attackSpeed).toBeGreaterThan(base.attackSpeed);
    }

    const withSusButterfly = getCharacterStats('aagent', {
      equippedWearables: { pet: 'sus-butterfly' },
    });

    expect(withSusButterfly.attackSpeed).toBeLessThan(base.attackSpeed);
  });
});
