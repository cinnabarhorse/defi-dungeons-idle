/**
 * Unit tests for getModeRewardConfig() - reward config selection by mode.
 *
 * These tests intentionally mock all heavy IdleMode dependencies so we can
 * import IdleMode safely (schemas use decorators and can break under Jest).
 */

import { describe, it, expect, jest } from '@jest/globals';

// Minimal mocks to allow importing IdleMode without pulling in decorator-heavy modules.
jest.mock('../../schemas', () => ({
  PlayerSchema: class {},
  IdleLootSchema: class {},
  IdleRoomSchema: class {},
}));

jest.mock('../../lib/idle-systems/EncounterManager', () => ({
  EncounterManager: {},
}));

jest.mock('../../lib/combat-utils', () => ({
  computeBaseDamageForCharacter: jest.fn(),
}));

jest.mock('../../lib/ability-handlers', () => ({
  computePlayerDamageWithCrit: jest.fn(),
  applyPlayerLifeSteal: jest.fn(),
}));

jest.mock('../../lib/ability-utils', () => ({
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
  getPlayerCleave: jest.fn(),
  getPlayerStun: jest.fn(),
  getEnemyPoison: jest.fn(),
}));

jest.mock('../../data/weapons', () => ({
  WEAPON_DEFINITIONS: {},
}));

jest.mock('../../data/wearables', () => ({
  getWearableBySlug: jest.fn(),
}));

jest.mock('../../data/loot-table', () => ({
  rollEnemyDrop: jest.fn(),
  rollBossDrops: jest.fn(),
  maybeRollLickTongueDrop: jest.fn(() => false),
}));

jest.mock('../../data/items', () => ({
  generateItemData: jest.fn(),
  getItemStats: jest.fn(),
  ITEM_TYPES: {},
}));

jest.mock('colyseus', () => ({
  Client: class {},
}));

jest.mock('../../lib/db', () => ({
  depositsRepo: {},
  inventoryRepo: {},
  playerDailyRunsRepo: {},
}));

jest.mock('../XpScoreSystem', () => ({
  queueScoreDelta: jest.fn(),
  ensurePlayerScoreState: jest.fn(),
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  calculateTimeMultiplier: jest.fn(),
}));

jest.mock('../DailyQuestSystem', () => ({
  submitToCompetitionLeaderboard: jest.fn(),
}));

jest.mock('../SharedGame', () => ({
  buildFungibleDeltaInput: jest.fn(),
  persistInventory: jest.fn(),
  recordKill: jest.fn(),
}));

jest.mock('../../lib/daily-runs', () => ({
  getDailyRunAllowance: jest.fn(),
  getDailyRunsConfig: jest.fn(),
  getDailyRunsDate: jest.fn(),
  getDailyRunsResetAt: jest.fn(),
}));

jest.mock('../../lib/db/mappers', () => ({
  getHealthPotionCount: jest.fn(),
  getManaPotionCount: jest.fn(),
  getLickTongueCount: jest.fn(),
}));

jest.mock('../../lib/equipment-service', () => ({
  deserializeStoredWearable: jest.fn(),
}));

jest.mock('../../data/spells', () => ({
  SPELLS_BY_ID: {},
}));

jest.mock('../../lib/potion-utils', () => ({
  computeHealthPotionHeal: jest.fn(),
  getHealthPotionTier: jest.fn(),
  isHealthPotionItem: jest.fn(),
}));

jest.mock('../../lib/dev-mode', () => ({
  shouldSkipEntryFee: jest.fn(),
}));

async function loadWithGameConfig(gameConfig: any) {
  jest.resetModules();
  jest.doMock('../../lib/constants', () => ({
    GAME_CONFIG: gameConfig,
  }));
  return await import('../IdleMode');
}

describe('IdleMode.getModeRewardConfig', () => {
  it('returns progression reward config when dailyQuestActive is false/undefined', async () => {
    const { getModeRewardConfig } = await loadWithGameConfig({
      modeRewards: {
        progression: {
          earnXp: true,
          earnGold: true,
          earnLickTongue: true,
          earnWearables: false,
          earnPotions: false,
        },
        competition: {
          earnXp: true,
          earnGold: true,
          earnLickTongue: true,
          earnWearables: true,
          earnPotions: true,
        },
      },
    });

    const player: any = { dailyQuestActive: undefined };
    expect(getModeRewardConfig(player)).toEqual({
      earnXp: true,
      earnGold: true,
      earnLickTongue: true,
      earnWearables: false,
      earnPotions: false,
    });
  });

  it('returns competition reward config when dailyQuestActive is true', async () => {
    const { getModeRewardConfig } = await loadWithGameConfig({
      modeRewards: {
        progression: {
          earnXp: false,
          earnGold: false,
          earnLickTongue: false,
          earnWearables: false,
          earnPotions: false,
        },
        competition: {
          earnXp: true,
          earnGold: true,
          earnLickTongue: true,
          earnWearables: true,
          earnPotions: true,
        },
      },
    });

    const player: any = { dailyQuestActive: true };
    expect(getModeRewardConfig(player)).toEqual({
      earnXp: true,
      earnGold: true,
      earnLickTongue: true,
      earnWearables: true,
      earnPotions: true,
    });
  });

  it('falls back to defaults when modeRewards is missing', async () => {
    const { getModeRewardConfig } = await loadWithGameConfig({});

    const player: any = { dailyQuestActive: false };
    expect(getModeRewardConfig(player)).toEqual({
      earnXp: true,
      earnGold: true,
      earnLickTongue: true,
      earnWearables: true,
      earnPotions: false,
    });
  });
});
