// Mock graphql-request before any imports that use it
jest.mock('graphql-request', () => ({
  gql: jest.fn(),
  request: jest.fn(),
  GraphQLClient: jest.fn(),
}));

import { syncPlayerCharacterStats } from '../apps/server/src/lib/player-stats';
import { getCharacterStats as getClientStats } from '../apps/client/src/lib/character-registry';

function pickFromDerivedJSON(jsonStr: string) {
  const d = JSON.parse(jsonStr || '{}');
  return {
    weaponType: d.weaponType,
    damage: d.damage,
    damageRange: d.damageRange,
    totalDamage: d.totalDamage,
    attackSpeed: d.attackSpeed,
    meleeAttackRange: d.meleeAttackRange,
    rangedAttackRange: d.rangedAttackRange,
    projectileSpeed: d.projectileSpeed,
    armor: d.armor,
    movementSpeed: d.movementSpeed,
    activeWeaponSlug: d.activeWeaponSlug || null,
    equipmentSlugs: Array.isArray(d.equipment?.slugs)
      ? [...d.equipment.slugs].sort()
      : [],
  };
}

function sanitizeBase(s: any) {
  return {
    weaponType: s.weaponType,
    damage: s.damage,
    damageRange: s.damageRange,
    totalDamage: (s as any).totalDamage,
    attackSpeed: s.attackSpeed,
    meleeAttackRange: s.meleeAttackRange,
    rangedAttackRange: s.rangedAttackRange,
    projectileSpeed: s.projectileSpeed,
    armor: s.armor,
    movementSpeed: s.movementSpeed,
    activeWeaponSlug: s.activeWeapon?.slug ?? null,
    equipmentSlugs: Array.isArray(s.equipment?.slugs)
      ? [...s.equipment.slugs].sort()
      : [],
  };
}

describe('Server sync derivedStats equals client base stats (no modifiers)', () => {
  it('matches for default character coderdan', () => {
    const characterId = 'coderdan';
    const player = { id: 'p1', characterId, hp: 100, maxHp: 100 } as any;

    const serverStats = syncPlayerCharacterStats(player, {});
    const derived = pickFromDerivedJSON((player as any).derivedStats);

    const clientBase = getClientStats(characterId);
    expect(derived).toEqual(sanitizeBase(serverStats));
    expect(derived).toEqual(sanitizeBase(clientBase));
  });

  it('matches for wizard with explicit loadout (no run/progression)', () => {
    const characterId = 'wizard';
    const player = { id: 'p1', characterId, hp: 100, maxHp: 100 } as any;

    const serverStats = syncPlayerCharacterStats(player, {});
    const derived = pickFromDerivedJSON((player as any).derivedStats);

    const clientBase = getClientStats(characterId);
    expect(derived).toEqual(sanitizeBase(serverStats));
    expect(derived).toEqual(sanitizeBase(clientBase));
  });
});
