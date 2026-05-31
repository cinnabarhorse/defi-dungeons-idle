import {
  aggregateCleave,
  aggregateGoldFarm,
  aggregatePotionFarm,
  aggregateTongueFarm,
  getPlayerCleave,
  getPlayerCrit,
  getPlayerGoldFarm,
  getPlayerLifeSteal,
  getPlayerPoison,
  getPlayerPotionFarm,
  getPlayerSlow,
  getPlayerStun,
  getPlayerTongueFarm,
  isWithinCone,
  rollCrit,
  rollEvade,
} from '../ability-utils';
import {
  getCharacterStats,
  setGotchiWearableAssignments,
  setGotchiWearables,
} from '../../data/characters';
import { WEAPON_CATEGORY_DEFAULTS, WEAPON_DEFINITIONS } from '../../data/weapons';

describe('ability-utils', () => {
  describe('aggregatePotionFarm', () => {
    it('aggregates extra-roll chance with cap and chooses the strongest reweight multiplier', () => {
      const abilities: any[] = [
        {
          id: 'potion-farm',
          params: {
            mode: 'both',
            potionWeightMultiplier: 1.25,
            extraPotionRollChance: 0.2,
            maxExtraChanceCap: 0.25,
            hpToManaBias: 2, // should clamp to 1
          },
        },
        {
          id: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.2,
            maxExtraChanceCap: 0.25,
            hpToManaBias: 0, // should NOT override first defined bias
          },
        },
        {
          id: 'potion-farm',
          params: {
            mode: 'reweight',
            potionWeightMultiplier: 3,
          },
        },
      ];

      const result = aggregatePotionFarm(abilities);

      expect(result.enabled).toBe(true);
      expect(result.enableExtraRoll).toBe(true);
      expect(result.enableReweight).toBe(true);

      // extra roll chance should be capped
      expect(result.maxExtraChanceCap).toBe(0.25);
      expect(result.extraRollChance).toBe(0.25);

      // best reweight multiplier should win
      expect(result.potionWeightMultiplier).toBe(3);

      // first defined hpToManaBias should win, clamped to [0,1]
      expect(result.hpToManaBias).toBe(1);
    });
  });

  describe('aggregateGoldFarm', () => {
    it('aggregates extra-roll chance with cap and chooses the strongest multipliers', () => {
      const abilities: any[] = [
        {
          id: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 1.5,
            extraCoinRollChance: 0.1,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.1,
          },
        },
        {
          id: 'gold-farm',
          params: {
            mode: 'extra-roll',
            extraCoinRollChance: 0.2,
            maxExtraChanceCap: 0.15,
            amountMultiplier: 1.2,
          },
        },
        {
          id: 'gold-farm',
          params: {
            mode: 'reweight',
            coinWeightMultiplier: 2,
          },
        },
      ];

      const result = aggregateGoldFarm(abilities);

      expect(result.enabled).toBe(true);
      expect(result.enableExtraRoll).toBe(true);
      expect(result.enableReweight).toBe(true);
      expect(result.coinWeightMultiplier).toBe(2);
      expect(result.maxExtraChanceCap).toBe(0.15);
      expect(result.extraRollChance).toBe(0.15);
      expect(result.amountMultiplier).toBe(1.2);
    });
  });

  describe('aggregateTongueFarm', () => {
    it('requires matching enemy tags and caps total bonus chance', () => {
      const abilities: any[] = [
        // No appliesToEnemyTags -> uses default ['lickquidator']
        { id: 'tongue-farm', params: { bonusChance: 0.2 } },
        // Explicit tag requirement
        {
          id: 'tongue-farm',
          params: { bonusChance: 0.2, appliesToEnemyTags: ['lickquidator'] },
        },
      ];

      const withMatch = aggregateTongueFarm(abilities, ['lickquidator']);
      expect(withMatch.bonusChance).toBe(0.25); // capped

      const withoutMatch = aggregateTongueFarm(abilities, ['some-other-tag']);
      expect(withoutMatch.bonusChance).toBe(0);
    });

    it('does not apply when enemy tags are missing', () => {
      const abilities: any[] = [
        {
          id: 'tongue-farm',
          params: { bonusChance: 0.2, appliesToEnemyTags: ['lickquidator'] },
        },
      ];

      const result = aggregateTongueFarm(abilities, undefined);
      expect(result.bonusChance).toBe(0);
    });
  });

  describe('isWithinCone', () => {
    it('treats negative cone angles as 0 degrees (exact direction only)', () => {
      expect(isWithinCone(0, 0, 'right', 10, 0, -45)).toBe(true);
      expect(isWithinCone(0, 0, 'right', 10, 1, -45)).toBe(false);
    });

    it('treats 0° cone as a single ray (exact direction only)', () => {
      expect(isWithinCone(0, 0, 'right', 10, 0, 0)).toBe(true);
      expect(isWithinCone(0, 0, 'right', 10, 1, 0)).toBe(false);
    });
  });

  describe('aggregateCleave', () => {
    it('stacks by taking the strongest parameters and includes breakables if any source enables it', () => {
      const abilities: any[] = [
        {
          id: 'cleave',
          params: {
            appliesTo: 'melee',
            damageMultiplier: 1.2,
            maxTargets: 2,
            coneAngleDeg: 45,
            includeBreakables: false,
          },
        },
        {
          id: 'cleave',
          params: {
            appliesTo: 'all',
            damageMultiplier: 1.5,
            maxTargets: 4,
            coneAngleDeg: 60,
            includeBreakables: true,
          },
        },
        // should be ignored because invalid multiplier (<= 0)
        {
          id: 'cleave',
          params: {
            appliesTo: 'melee',
            damageMultiplier: 0,
          },
        },
      ];

      const melee = aggregateCleave(abilities, 'melee');
      expect(melee.enabled).toBe(true);
      expect(melee.damageMultiplier).toBe(1.5);
      expect(melee.maxTargets).toBe(4);
      expect(melee.coneAngleDeg).toBe(60);
      expect(melee.includeBreakables).toBe(true);

      const ranged = aggregateCleave(abilities, 'ranged');
      expect(ranged.enabled).toBe(true);
      // only the appliesTo=all entry should count for ranged
      expect(ranged.damageMultiplier).toBe(1.5);
      expect(ranged.maxTargets).toBe(4);
      expect(ranged.coneAngleDeg).toBe(60);
      expect(ranged.includeBreakables).toBe(true);
    });

    it('returns disabled defaults when abilities is not an array', () => {
      // @ts-expect-error intentional bad input
      expect(aggregateCleave(null, 'melee')).toEqual({
        enabled: false,
        damageMultiplier: 1,
        maxTargets: undefined,
        coneAngleDeg: undefined,
        includeBreakables: false,
      });
    });
  });

  describe('rollCrit/rollEvade', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('clamps chance into [0,1] before rolling against Math.random', () => {
      const rand = jest.spyOn(Math, 'random');

      rand.mockReturnValue(0.5);
      expect(rollCrit(-10)).toBe(false);
      expect(rollEvade(-10)).toBe(false);

      rand.mockReturnValue(0.99);
      expect(rollCrit(2)).toBe(true); // clamped to 1
      expect(rollEvade(2)).toBe(true);

      rand.mockReturnValue(0.5);
      expect(rollCrit(0.49)).toBe(false);
      expect(rollCrit(0.51)).toBe(true);
    });
  });

  describe('dynamic gotchi weapon abilities', () => {
    it('resolves ability effects for every weapon that grants abilities', () => {
      const failures: string[] = [];
      const coveredWeapons = new Set<string>();
      const encounteredAbilityIds = new Set<string>();
      let gotchiSeed = 999001;

      for (const [slug, definition] of Object.entries(WEAPON_DEFINITIONS)) {
        const gotchiId = String(gotchiSeed++);
        setGotchiWearables(gotchiId, [slug]);
        setGotchiWearableAssignments(gotchiId, [{ slot: 'handRight', slug }]);

        const characterId = `gotchi:${gotchiId}`;
        const stats = getCharacterStats(characterId);
        const weapon = stats.weapons.find((entry) => entry.slug === slug);

        const explicitAbilityCount = Array.isArray(definition.abilities)
          ? definition.abilities.length
          : 0;
        const categoryAbilities =
          WEAPON_CATEGORY_DEFAULTS[definition.weaponCategory]?.abilities;
        const categoryAbilityCount = Array.isArray(categoryAbilities)
          ? categoryAbilities.length
          : 0;
        const expectedAbilityCount = explicitAbilityCount + categoryAbilityCount;

        if (!weapon) {
          if (expectedAbilityCount > 0) {
            failures.push(
              `${slug}: weapon has abilities but is missing from gotchi derived stats`
            );
          }
          continue;
        }

        const abilities = Array.isArray(weapon.abilities) ? weapon.abilities : [];
        if (expectedAbilityCount > 0 && abilities.length === 0) {
          failures.push(`${slug}: expected derived weapon abilities but found none`);
          continue;
        }
        if (abilities.length === 0) continue;

        coveredWeapons.add(slug);
        const attackType: 'melee' | 'ranged' =
          weapon.weaponType === 'ranged' ? 'ranged' : 'melee';
        const stunHitType: 'melee' | 'ranged' | 'grenades' =
          weapon.weaponType === 'grenades' ? 'grenades' : attackType;

        for (const ability of abilities) {
          const abilityId = String((ability as any)?.id || '');
          encounteredAbilityIds.add(abilityId);

          switch (abilityId) {
            case 'critical-strike': {
              const crit = getPlayerCrit(characterId, attackType, undefined, stats);
              if (!(crit.chance > 0 && crit.multiplier >= 1)) {
                failures.push(
                  `${slug}:${abilityId}: expected crit aggregation to be active`
                );
              }
              break;
            }
            case 'life-steal': {
              const lifeSteal = getPlayerLifeSteal(
                characterId,
                attackType,
                '',
                stats
              );
              if (!(lifeSteal.percent > 0)) {
                failures.push(
                  `${slug}:${abilityId}: expected life steal aggregation to be active`
                );
              }
              break;
            }
            case 'cleave': {
              const cleave = getPlayerCleave(
                characterId,
                attackType,
                undefined,
                stats
              );
              if (!cleave.enabled) {
                failures.push(
                  `${slug}:${abilityId}: expected cleave aggregation to be enabled`
                );
              }
              break;
            }
            case 'stun': {
              const stun = getPlayerStun(
                characterId,
                stunHitType,
                undefined,
                stats
              );
              if (stun.length === 0) {
                failures.push(
                  `${slug}:${abilityId}: expected stun aggregation to include at least one source`
                );
              }
              break;
            }
            case 'potion-farm': {
              const potionFarm = getPlayerPotionFarm(characterId, stats);
              if (!potionFarm.enabled) {
                failures.push(
                  `${slug}:${abilityId}: expected potion-farm aggregation to be enabled`
                );
              }
              break;
            }
            case 'gold-farm': {
              const goldFarm = getPlayerGoldFarm(characterId, stats);
              if (!goldFarm.enabled) {
                failures.push(
                  `${slug}:${abilityId}: expected gold-farm aggregation to be enabled`
                );
              }
              break;
            }
            case 'tongue-farm': {
              const tongueFarm = getPlayerTongueFarm(
                characterId,
                ['lickquidator'],
                stats
              );
              if (!(tongueFarm.bonusChance > 0)) {
                failures.push(
                  `${slug}:${abilityId}: expected tongue-farm aggregation to provide bonus chance`
                );
              }
              break;
            }
            case 'poison': {
              const poison = getPlayerPoison(
                characterId,
                attackType,
                undefined,
                stats
              );
              if (poison.length === 0) {
                failures.push(
                  `${slug}:${abilityId}: expected poison aggregation to include at least one source`
                );
              }
              break;
            }
            case 'slow': {
              const slow = getPlayerSlow(
                characterId,
                attackType,
                undefined,
                stats
              );
              if (slow.length === 0) {
                failures.push(
                  `${slug}:${abilityId}: expected slow aggregation to include at least one source`
                );
              }
              break;
            }
            default:
              failures.push(
                `${slug}:${abilityId}: add regression assertion for this weapon ability id`
              );
              break;
          }
        }
      }

      expect(coveredWeapons.size).toBeGreaterThan(0);
      expect(encounteredAbilityIds.size).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    });
  });

  describe('dynamic gotchi pet farm abilities', () => {
    it('includes pet-derived gold-farm and tongue-farm in derived abilities', () => {
      const goldGotchiId = '999100';
      setGotchiWearables(goldGotchiId, ['aantenna-bot']);
      setGotchiWearableAssignments(goldGotchiId, [
        { slot: 'pet', slug: 'aantenna-bot' },
      ]);

      const goldStats = getCharacterStats(`gotchi:${goldGotchiId}`);
      expect(goldStats.abilities.some((ability) => ability.id === 'gold-farm')).toBe(
        true
      );
      expect(aggregateGoldFarm(goldStats.abilities).enabled).toBe(true);

      const tongueGotchiId = '999101';
      setGotchiWearables(tongueGotchiId, ['baby-licky']);
      setGotchiWearableAssignments(tongueGotchiId, [
        { slot: 'pet', slug: 'baby-licky' },
      ]);

      const tongueStats = getCharacterStats(`gotchi:${tongueGotchiId}`);
      expect(
        tongueStats.abilities.some((ability) => ability.id === 'tongue-farm')
      ).toBe(true);
      expect(
        aggregateTongueFarm(tongueStats.abilities, ['lickquidator']).bonusChance
      ).toBeGreaterThan(0);
    });
  });
});
