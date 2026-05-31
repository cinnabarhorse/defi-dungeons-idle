import {
  classifyAttackSpeedDelta,
  enhanceHandsWithEquipmentModifiers,
  handAttackSpeedAps,
  type HandDetails,
} from './combat-stat-helpers';

function createHand(overrides?: Partial<HandDetails>): HandDetails {
  return {
    slug: 'basic-haanzo-katana',
    damageRange: { min: 48, max: 64 },
    grenadeRange: null,
    attackSpeedMs: 650,
    weaponType: 'melee',
    baseTotalDamageScalar: 1,
    ...overrides,
  };
}

describe('combat stat helpers', () => {
  it('applies attack-speed modifiers when enhancing hand stats', () => {
    const baselineHands = {
      handLeft: createHand({
        slug: null,
        damageRange: null,
        attackSpeedMs: null,
        weaponType: null,
        baseTotalDamageScalar: null,
      }),
      handRight: createHand(),
    };

    const enhanced = enhanceHandsWithEquipmentModifiers(baselineHands, {
      attackSpeed: { multiply: 1.05 },
    });

    expect(enhanced.handRight.attackSpeedMs).toBeCloseTo(619.0476, 4);
    const aps = handAttackSpeedAps(enhanced.handRight);
    expect(aps).toBeCloseTo(1.6154, 4);
  });

  it('treats higher attacks-per-second as improved attack-speed stat', () => {
    expect(classifyAttackSpeedDelta(0.07, 0)).toEqual({
      improved: true,
      worse: false,
    });
    expect(classifyAttackSpeedDelta(-0.07, 0)).toEqual({
      improved: false,
      worse: true,
    });
  });
});
