import { describe, it, expect, jest } from '@jest/globals';

jest.mock('graphql-request', () => ({
  gql: jest.fn(),
  request: jest.fn(),
}));

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
    enabled: true,
    enableReweight: true,
    enableExtraRoll: true,
    potionWeightMultiplier: 2,
    extraRollChance: 0.2,
    maxExtraChanceCap: 0.2,
    hpToManaBias: 0.6,
  })),
  aggregateGoldFarm: jest.fn(() => ({
    enabled: true,
    enableReweight: true,
    enableExtraRoll: true,
    coinWeightMultiplier: 1.5,
    extraRollChance: 0.1,
    maxExtraChanceCap: 0.1,
    amountMultiplier: 1.1,
  })),
  aggregateTongueFarm: jest.fn(() => ({ bonusChance: 0.1 })),
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
  rollEnemyDrop: jest.fn(() => null),
  rollBossDrops: jest.fn(() => []),
  maybeRollLickTongueDrop: jest.fn(() => true),
}));

jest.mock('../../data/items', () => ({
  generateItemData: jest.fn(() => ({
    type: 'material',
    name: 'Lick Tongue',
    quantity: 1,
    color: '',
    description: '',
  })),
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

jest.mock('../../lib/constants', () => ({
  GAME_CONFIG: {
    modeRewards: {
      progression: {
        earnXp: true,
        earnGold: true,
        earnLickTongue: true,
        earnWearables: true,
        earnPotions: true,
      },
      competition: {
        earnXp: true,
        earnGold: true,
        earnLickTongue: true,
        earnWearables: true,
        earnPotions: true,
      },
    },
  },
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

jest.mock('../../lib/db/mappers', () => ({
  getHealthPotionCount: jest.fn(),
  getManaPotionCount: jest.fn(),
  getLickTongueCount: jest.fn(),
}));

import { rollLootForEnemy } from '../IdleMode';
import {
  rollEnemyDrop,
  maybeRollLickTongueDrop,
} from '../../data/loot-table';

describe('IdleMode rollLootForEnemy farms', () => {
  it('passes farm context and rolls lick tongue', () => {
    const room = { state: { difficultyTier: 'normal' } } as any;
    const player = {
      id: 'player-1',
      dailyQuestActive: false,
      derivedStats: JSON.stringify({
        abilities: [{ id: 'gold-farm', params: {} }],
      }),
      idleRoom: {
        encounter: { loots: [], lastActionLog: '' },
        lootsCollected: [],
        runHealthPotionsCollected: 0,
        runHealthPotionsCollectedTier1: 0,
        runHealthPotionsCollectedTier2: 0,
        runHealthPotionsCollectedTier3: 0,
        runManaPotionsCollected: 0,
      },
    } as any;
    const enemy = {
      imageId: 'slime',
      classification: 'normal',
      tags: ['lickquidator'],
    } as any;

    rollLootForEnemy(room, player, enemy);

    expect(rollEnemyDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        potionFarm: expect.objectContaining({ enabled: true }),
        goldFarm: expect.objectContaining({ enabled: true }),
        killStreakPotionCoinFindBonus: 0,
      })
    );
    expect(maybeRollLickTongueDrop).toHaveBeenCalledWith(
      ['lickquidator'],
      expect.any(Function)
    );
    expect(
      player.idleRoom.encounter.loots.some((loot: any) =>
        String(loot?.name || '').includes('Lick Tongue')
      )
    ).toBe(true);
  });
});
