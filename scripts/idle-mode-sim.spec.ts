jest.mock('../apps/server/src/lib/combat-utils', () => ({
  computeBaseDamageForCharacter: jest.fn(() => 12),
}));

jest.mock('../apps/server/src/lib/ability-handlers', () => ({
  computePlayerDamageWithCrit: jest.fn((_player, baseDamage) => ({
    damage: baseDamage,
    isCrit: false,
  })),
  applyPlayerLifeSteal: jest.fn(() => 0),
}));

jest.mock('../apps/server/src/lib/ability-utils', () => ({
  aggregatePotionFarm: jest.fn(() => ({
    enabled: false,
    enableReweight: false,
    enableExtraRoll: false,
    potionWeightMultiplier: 1,
    extraRollChance: 0,
    maxExtraChanceCap: 0,
    hpToManaBias: 0.5,
  })),
  aggregateGoldFarm: jest.fn(() => ({
    enabled: false,
    enableReweight: false,
    enableExtraRoll: false,
    coinWeightMultiplier: 1,
    extraRollChance: 0,
    maxExtraChanceCap: 0,
    amountMultiplier: 1,
  })),
  aggregateTongueFarm: jest.fn(() => ({ bonusChance: 0 })),
  getPlayerCleave: jest.fn(() => ({ enabled: false })),
  getPlayerStun: jest.fn(() => [{ chance: 0.45, durationMs: 2000 }]),
  getPlayerThorns: jest.fn(() => ({ percent: 0 })),
  getEnemyPoison: jest.fn(() => []),
  getPlayerThorns: jest.fn(() => ({ percent: 0 })),
}));

jest.mock('../apps/server/src/data/weapons', () => ({
  WEAPON_DEFINITIONS: {},
}));

jest.mock('../apps/server/src/data/wearables', () => ({
  getWearableBySlug: jest.fn(() => null),
}));

jest.mock('../apps/server/src/data/loot-table', () => ({
  rollEnemyDrop: jest.fn(() => null),
  rollBossDrops: jest.fn(() => []),
  maybeRollLickTongueDrop: jest.fn(() => false),
}));

jest.mock('../apps/server/src/data/items', () => ({
  generateItemData: jest.fn(() => ({
    type: 'potion',
    name: 'Health Potion',
    quantity: 1,
  })),
}));

jest.mock('../apps/server/src/rooms/XpScoreSystem', () => ({
  queueScoreDelta: jest.fn(),
  ensurePlayerScoreState: jest.fn(() => ({ score: 0, eligible: true })),
}));

jest.mock('../apps/server/src/lib/constants', () => ({
  GAME_CONFIG: { leverage: { xpMultiplierEnabled: true } },
}));

jest.mock('../apps/server/src/lib/daily-quest-competition', () => ({
  calculateTimeMultiplier: jest.fn(() => 1),
}));

jest.mock('../apps/server/src/rooms/DailyQuestSystem', () => ({
  submitToCompetitionLeaderboard: jest.fn(() =>
    Promise.resolve({ submitted: false })
  ),
}));

jest.mock('../apps/server/src/rooms/SharedGame', () => ({
  persistInventory: jest.fn(() => Promise.resolve()),
}));

jest.mock('../apps/server/src/lib/db/mappers', () => ({
  getHealthPotionCount: jest.fn(() => 0),
  getManaPotionCount: jest.fn(() => 0),
  getLickTongueCount: jest.fn(() => 0),
}));

jest.mock('../apps/server/src/lib/equipment-service', () => ({
  deserializeStoredWearable: jest.fn(() => null),
}));

jest.mock('../apps/server/src/lib/idle-systems/EncounterManager', () => ({
  EncounterManager: { generateEncounter: jest.fn(() => ({})) },
}));

jest.mock('../apps/server/src/schemas', () => ({
  PlayerSchema: class {},
  IdleLootSchema: class {},
  IdleRoomSchema: class {},
}));

jest.mock('../apps/server/src/schemas/IdleSchemas', () => ({
  IdleEnemySchema: class {},
  IdleLootSchema: class {},
  IdleEncounterSchema: class {},
  IdleRoomSchema: class {},
}));

jest.mock('../apps/server/src/data/spells', () => ({
  SPELLS_BY_ID: {},
}));

jest.mock('../apps/server/src/lib/potion-utils', () => ({
  computeHealthPotionHeal: jest.fn(() => 0),
  selectOptimalPotion: jest.fn(() => null),
}));

import { runIdleModeSimulation } from '../apps/server/src/lib/idle-sim';

function expectValidSnapshot(snapshot: ReturnType<
  typeof runIdleModeSimulation
>['snapshot']) {
  expect(snapshot.playerHp).toBeGreaterThan(0);
  expect(snapshot.playerHp).toBeLessThanOrEqual(snapshot.playerMaxHp);
  expect(snapshot.playerMana).toBeGreaterThanOrEqual(0);
  expect(snapshot.playerMana).toBeLessThanOrEqual(snapshot.playerMaxMana);
  expect(snapshot.enemyHp).toBeGreaterThan(0);
  expect(snapshot.enemyHp).toBeLessThanOrEqual(snapshot.enemyMaxHp);
  expect(snapshot.runStatus).toBe('active');
  expect(snapshot.encounterCompleted).toBe(false);
}

describe('idle mode deterministic simulation', () => {
  test('same seed yields identical state hash', () => {
    const first = runIdleModeSimulation({ seed: 1337, ticks: 4 });
    const second = runIdleModeSimulation({ seed: 1337, ticks: 4 });

    expect(first.stateHash).toBe(second.stateHash);
    expect(first.snapshot.rngSample).toBe(second.snapshot.rngSample);
    expectValidSnapshot(first.snapshot);
  });

  test('different seed yields different state hash', () => {
    const first = runIdleModeSimulation({ seed: 1337, ticks: 4 });
    const second = runIdleModeSimulation({ seed: 1338, ticks: 4 });

    expect(first.stateHash).not.toBe(second.stateHash);
  });
});
