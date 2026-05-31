import { calculateDamageAfterMitigation, syncPlayerCharacterStats } from '../player-stats';

jest.mock('../character-registry', () => ({
  getCharacterStats: jest.fn(),
}));

jest.mock('../hand-weapon-utils', () => ({
  resolvePreferredHandWeaponIndex: jest.fn(() => -1),
}));

jest.mock('../equipment-service', () => ({
  mapStoredWearablesToAssignments: jest.fn(() => []),
  serializeStoredWearable: jest.fn((entry: any) => entry),
  isEquipmentSlotName: jest.fn(() => true),
}));

jest.mock('../ability-utils', () => ({
  aggregateAugmentedVision: jest.fn(() => ({ multiplier: 1 })),
}));

const { getCharacterStats } = jest.requireMock('../character-registry') as {
  getCharacterStats: jest.Mock;
};
const { mapStoredWearablesToAssignments } = jest.requireMock(
  '../equipment-service'
) as {
  mapStoredWearablesToAssignments: jest.Mock;
};

describe('lib/player-stats', () => {
  beforeEach(() => {
    getCharacterStats.mockReset();
    mapStoredWearablesToAssignments.mockReset();
    mapStoredWearablesToAssignments.mockReturnValue([]);
  });

  describe('calculateDamageAfterMitigation', () => {
    it('throws when player is missing a characterId', () => {
      expect(() => calculateDamageAfterMitigation({} as any, 10)).toThrow(
        'Player character ID is required'
      );
    });

    it('applies the max of flat armor and percent mitigation (capped at 80%)', () => {
      getCharacterStats.mockReturnValue({ armor: 50 });
      expect(calculateDamageAfterMitigation({ characterId: 'c1' } as any, 100))
        .toEqual({ stats: { armor: 50 }, finalDamage: 50 });

      // Percent mitigation would be 200%, but is capped at 80%; flat armor still wins.
      getCharacterStats.mockReturnValue({ armor: 200 });
      expect(calculateDamageAfterMitigation({ characterId: 'c2' } as any, 100))
        .toEqual({ stats: { armor: 200 }, finalDamage: 0 });
    });
  });

  describe('syncPlayerCharacterStats', () => {
    it('preserves health/mana ratio when fullHeal=false and preserveHealthRatio=true', () => {
      getCharacterStats.mockReturnValue({
        maxHealth: 200,
        attackSpeed: 100,
        damage: 10,
        // weaponType undefined => should normalize to melee
        equipment: { slugs: [], items: [], modifiers: {} },
        abilities: [],
      });

      const player: any = {
        characterId: 'c1',
        hp: 50,
        maxHp: 100,
        mana: 20,
        maxMana: 40,
      };

      syncPlayerCharacterStats(player, {
        fullHeal: false,
        preserveHealthRatio: true,
      });

      expect(player.attackType).toBe('melee');
      expect(player.maxHp).toBe(200);
      expect(player.hp).toBe(100);

      // base max mana defaults to 50
      expect(player.maxMana).toBe(50);
      expect(player.mana).toBe(25);

      const derived = JSON.parse(player.derivedStats);
      expect(derived.maxHealth).toBe(200);
      expect(derived.maxMana).toBe(50);
      expect(derived.weaponType).toBeUndefined();
    });

    it('applies progression + kill-streak modifiers (attack speed floor, damage scaling, and bonuses)', () => {
      getCharacterStats.mockReturnValue({
        maxHealth: 100,
        attackSpeed: 100,
        damage: 5,
        damageRange: { min: 2, max: 3 },
        armor: 10,
        movementSpeed: 1,
        meleeAttackRange: 10,
        rangedAttackRange: 15,
        weaponType: 'ranged',
        equipment: { slugs: [], items: [], modifiers: {} },
        abilities: [],
      });

      const player: any = {
        characterId: 'c1',
        hp: 1,
        maxHp: 1,
        mana: 0,
        maxMana: 0,
      };

      const stats = syncPlayerCharacterStats(player, {
        fullHeal: false,
        progressionModifiers: {
          attackSpeedScalar: 0.1, // would produce 10, but should floor at 150
          damageMultiplier: 2,
          maxHealthMultiplier: 1.5,
          maxHealthFlatBonus: 10,
          maxManaBonus: 5,
          manaRegenMultiplier: 2,
        } as any,
        killStreakModifiers: {
          attackSpeedScalar: 1,
          armorBonus: 7,
          movementSpeedMultiplier: 0.5,
          attackRangeMultiplier: 2,
        } as any,
      });

      expect(player.attackType).toBe('ranged');
      expect(stats.attackSpeed).toBe(150);
      expect(stats.damage).toBe(10);
      expect(stats.damageRange).toEqual({ min: 4, max: 6 });
      expect(stats.maxHealth).toBe(160); // round(100*1.5 + 10)
      expect(stats.armor).toBe(17);
      expect(stats.movementSpeed).toBe(0.5);
      expect(stats.meleeAttackRange).toBe(20);
      expect(stats.rangedAttackRange).toBe(30);

      // fullHeal=false, previousHp=1, new maxHp=160 => min(previousHp, maxHp)
      expect(player.hp).toBe(1);

      // max mana base defaults to 50, plus 5
      expect(player.maxMana).toBe(55);
      // previous mana is clamped to maxMana
      expect(player.mana).toBe(0);

      expect((player as any).baseManaRegenPerSecond).toBe(0.5); // 0.25 * 2
    });

    it('keeps broken wearables slotted but excludes them from active stat computation', () => {
      mapStoredWearablesToAssignments.mockReturnValue([
        {
          slot: 'head',
          slug: 'broken-hat',
          quality: 'excellent',
          durabilityScore: 0,
        },
        {
          slot: 'handRight',
          slug: 'active-sword',
          quality: 'average',
          durabilityScore: 420,
        },
      ]);

      getCharacterStats
        .mockReturnValueOnce({
          maxHealth: 100,
          attackSpeed: 100,
          damage: 10,
          equipment: {
            slugs: ['active-sword'],
            items: [
              {
                slug: 'active-sword',
                slot: 'handRight',
                quality: 'average',
              },
            ],
            modifiers: {},
          },
          abilities: [],
        })
        .mockReturnValueOnce({
          maxHealth: 100,
          attackSpeed: 100,
          damage: 10,
          equipment: {
            slugs: ['active-sword'],
            items: [
              {
                slug: 'active-sword',
                slot: 'handRight',
                quality: 'average',
              },
            ],
            modifiers: {},
          },
          abilities: [],
        });

      const player: any = {
        characterId: 'c1',
        hp: 100,
        maxHp: 100,
        mana: 50,
        maxMana: 50,
        equippedWearables: JSON.stringify([
          {
            slot: 'head',
            slug: 'broken-hat',
            quality: 'excellent',
            durabilityScore: 0,
          },
          {
            slot: 'handRight',
            slug: 'active-sword',
            quality: 'average',
            durabilityScore: 420,
          },
        ]),
      };

      syncPlayerCharacterStats(player);

      expect(getCharacterStats).toHaveBeenCalledWith('c1', {
        equippedWearablesWithQuality: [
          {
            slug: 'active-sword',
            quality: 'average',
            slot: 'handRight',
          },
        ],
      });

      expect(player.equippedWearables).toBe(
        JSON.stringify([
          {
            slot: 'head',
            slug: 'broken-hat',
            quality: 'excellent',
            durabilityScore: 0,
          },
          {
            slot: 'handRight',
            slug: 'active-sword',
            quality: 'average',
            durabilityScore: 420,
          },
        ])
      );
    });
  });
});
