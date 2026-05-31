import { applyPlayerLifeSteal, computePlayerDamageWithCrit } from '../ability-handlers';

jest.mock('../ability-utils', () => ({
  getPlayerCrit: jest.fn(),
  getPlayerLifeSteal: jest.fn(),
  rollCrit: jest.fn(),
}));

const {
  getPlayerCrit,
  getPlayerLifeSteal,
  rollCrit,
} = jest.requireMock('../ability-utils') as {
  getPlayerCrit: jest.Mock;
  getPlayerLifeSteal: jest.Mock;
  rollCrit: jest.Mock;
};

describe('lib/ability-handlers', () => {
  describe('computePlayerDamageWithCrit', () => {
    it('is resilient to invalid derivedStats and returns base damage', () => {
      getPlayerCrit.mockImplementation(() => {
        throw new Error('should not be called');
      });

      const player: any = { characterId: 'c1' };
      const res = computePlayerDamageWithCrit(
        player,
        42,
        'melee',
        'sword',
        undefined as any
      );

      expect(res).toEqual({ damage: 42, isCrit: false });
    });

    it('applies crit multiplier when rollCrit succeeds and trims weaponSlug', () => {
      getPlayerCrit.mockReturnValue({ chance: 1, multiplier: 1.5 });
      rollCrit.mockReturnValue(true);

      const player: any = { characterId: 'c1' };
      const derivedStats = { activeWeaponSlug: 'fallback-slug' };

      const res = computePlayerDamageWithCrit(
        player,
        41,
        'ranged',
        '  my-weapon  ',
        derivedStats
      );

      // 41 * 1.5 = 61.5 => rounds to 62
      expect(res).toEqual({ damage: 62, isCrit: true });
      expect(getPlayerCrit).toHaveBeenCalledWith(
        'c1',
        'ranged',
        'my-weapon',
        derivedStats
      );
    });
  });

  describe('applyPlayerLifeSteal', () => {
    it('returns 0 for non-melee weapons and does not broadcast', () => {
      const gameRoom: any = { msg: { broadcast: jest.fn() } };
      const player: any = { id: 'p1', hp: 5, maxHp: 10, characterId: 'c1' };

      const healed = applyPlayerLifeSteal(
        gameRoom,
        player,
        100,
        'ranged',
        'bow',
        { activeWeaponSlug: 'bow' }
      );

      expect(healed).toBe(0);
      expect(gameRoom.msg.broadcast).not.toHaveBeenCalled();
    });

    it('heals up to maxHp and broadcasts actual healed amount', () => {
      getPlayerLifeSteal.mockReturnValue({ percent: 0.2 });

      const gameRoom: any = { msg: { broadcast: jest.fn() } };
      const player: any = { id: 'p1', hp: 95, maxHp: 100, characterId: 'c1' };

      const healed = applyPlayerLifeSteal(
        gameRoom,
        player,
        50,
        'melee',
        'sword',
        { activeWeaponSlug: 'sword' }
      );

      // 50 * 0.2 = 10, but capped by maxHp => actual heal 5
      expect(healed).toBe(5);
      expect(player.hp).toBe(100);
      expect(getPlayerLifeSteal).toHaveBeenCalledWith(
        'c1',
        'melee',
        'sword',
        expect.any(Object)
      );
      expect(gameRoom.msg.broadcast).toHaveBeenCalledWith('life_steal_heal', {
        playerId: 'p1',
        healAmount: 5,
        currentHp: 100,
        maxHp: 100,
        source: 'melee',
      });
    });
  });
});
