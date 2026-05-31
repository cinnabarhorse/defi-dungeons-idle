import {
  getEquipmentCardSummaryLayout,
  splitEquipmentSummary,
} from '../app/me/inventory/equipment-card-summary';

describe('equipment card summary', () => {
  it('splits summary text into discrete detail pills', () => {
    expect(
      splitEquipmentSummary('DMG 39-156 • Cooldown 2 turns • +75 Range')
    ).toEqual(['DMG 39-156', 'Cooldown 2 turns', '+75 Range']);
  });

  it('returns an empty array when summary text is missing', () => {
    expect(splitEquipmentSummary(null)).toEqual([]);
    expect(splitEquipmentSummary(undefined)).toEqual([]);
    expect(splitEquipmentSummary('')).toEqual([]);
  });

  it('returns the first trait and a +x more label when more traits exist', () => {
    expect(
      getEquipmentCardSummaryLayout(
        'DMG 39-156 • Cooldown 2 turns • +75 Range • +60% Total DMG'
      )
    ).toEqual({
      primaryTrait: 'DMG 39-156',
      secondaryLabel: '+3 more',
    });
  });

  it('keeps an empty secondary slot when only one trait exists', () => {
    expect(getEquipmentCardSummaryLayout('+6% Total DMG')).toEqual({
      primaryTrait: '+6% Total DMG',
      secondaryLabel: null,
    });
  });
});
