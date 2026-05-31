jest.mock('graphql-request', () => ({
  gql: (strings: TemplateStringsArray) => strings[0],
  request: jest.fn(),
}));

import { buildEquipmentStateForCharacter } from '../apps/server/src/lib/equipment-service';
import type {
  EquipmentOverride,
  EquipmentSlotName,
} from '../apps/server/src/lib/equipment-service';
import type { QualityTier } from '../apps/server/src/data/wearable-quality';

describe('equipment state slot assignments', () => {
  it('returns explicit slots for base character equipment', () => {
    const state = buildEquipmentStateForCharacter('coderdan', []);
    expect(state.equippedWearablesWithQuality.length).toBeGreaterThan(0);
    state.equippedWearablesWithQuality.forEach((entry) => {
      expect(entry.slot).toBeDefined();
      expect(typeof entry.slot).toBe('string');
      expect(entry.slot).not.toBe('hands');
      expect(entry.slug).toBeTruthy();
    });
  });

  it('preserves override slot assignments', () => {
    const overrides: EquipmentOverride[] = [
      {
        slot: 'handLeft' as EquipmentSlotName,
        slug: 'portal-mage-black-axe',
        inventoryItemId: null,
        quality: 'average' as QualityTier,
      },
    ];
    const state = buildEquipmentStateForCharacter('coderdan', overrides);
    expect(
      state.equippedWearablesWithQuality.some(
        (entry) =>
          entry.slot === 'handLeft' && entry.slug === 'portal-mage-black-axe'
      )
    ).toBe(true);
  });
});
