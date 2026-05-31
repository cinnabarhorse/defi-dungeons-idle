import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('colyseus', () => ({
  Client: class {},
}));

jest.mock('../../lib/db', () => ({
  authSessionsRepo: {},
  playersRepo: {},
  runTransaction: jest.fn(async (task) => task({})),
  inventoryRepo: {
    upsertInventoryItem: jest.fn(() => Promise.resolve()),
    decrementInventoryItem: jest.fn(() => Promise.resolve(null)),
    createInventoryInstance: jest.fn(() => Promise.resolve({})),
    removeInventoryItemById: jest.fn(() => Promise.resolve(null)),
  },
  inventoryEventsRepo: {
    logInventoryEvent: jest.fn(() => Promise.resolve()),
  },
  lootDistributionsRepo: {
    markClaimed: jest.fn(() => Promise.resolve()),
  },
  economyRepo: {},
  tokenWithdrawalsRepo: {},
  gamePlayersRepo: {},
  inventoryRecordToItem: jest.fn((record) => record),
  progressionRecordToProfile: jest.fn(),
  sanitizeInventoryItems: jest.fn((items) => items),
  getLickTongueCount: jest.fn(() => 0),
  getHealthPotionCount: jest.fn(() => 0),
  getManaPotionCount: jest.fn(() => 0),
  progressionRepo: {},
  equipmentRepo: {},
  dailyQuestLeaderboardRepo: {},
  gamesRepo: {},
}));

jest.mock('../../lib/withdrawals/token-config', () => ({
  formatBaseUnits: jest.fn(),
  getWithdrawalTokenConfig: jest.fn(),
  parseAmountToBaseUnits: jest.fn(),
}));

jest.mock('../../lib/auth/session', () => ({
  readSessionFromRequest: jest.fn(),
  getSessionSecret: jest.fn(),
}));

jest.mock('../../lib/auth/token', () => ({
  verifySessionToken: jest.fn(),
}));

jest.mock('@gotchiverse/progression', () => ({
  createDefaultProfile: jest.fn(),
  cloneProfile: jest.fn(),
  computeProgressionModifiers: jest.fn(),
  getLevelProgress: jest.fn(),
  toSerializableProfile: jest.fn(),
}));

jest.mock('../../lib/progression/killStreak', () => ({
  createKillStreakProfile: jest.fn(),
  applyKillStreakIncrement: jest.fn(),
  applyKillStreakDecay: jest.fn(),
  computeKillStreakModifiers: jest.fn(),
  resolveArchetypeForCharacter: jest.fn(),
}));

jest.mock('../../lib/player-stats', () => ({
  syncPlayerCharacterStats: jest.fn(),
}));

jest.mock('../../lib/equipment-service', () => ({
  extractWearableSlugs: jest.fn(() => []),
  normalizeEquipmentSlotName: jest.fn((slot) => slot),
  buildEquipmentStateForCharacter: jest.fn(() => ({})),
}));

jest.mock('../../lib/hand-weapon-utils', () => ({
  resolvePreferredHandWeaponIndex: jest.fn(() => 0),
}));

jest.mock('../../schemas', () => ({
  PlayerSchema: class {},
  EnemySchema: class {},
}));

jest.mock('../../lib/systems/LeverageSystem', () => ({
  getLeverageTotal: jest.fn(() => 0),
  sendLeverageStateToClient: jest.fn(),
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  calculateTimeMultiplier: jest.fn(),
  getCompetitionTier: jest.fn(),
  getCompetitionDate: jest.fn(),
  getDailyQuestCompetitionConfig: jest.fn(),
}));

jest.mock('../../lib/gotchi-ownership-snapshot', () => ({
  assertGotchiOwnershipForTodaySnapshot: jest.fn(),
  verifyGotchiOwnershipForTodaySnapshot: jest.fn(),
}));

jest.mock('../../data/characters', () => ({
  setGotchiWearables: jest.fn(),
  setGotchiWearableAssignments: jest.fn(),
}));

jest.mock('../../lib/constants', () => ({
  SCORE_CONFIG: {},
  GAME_CONFIG: {},
  LEVERAGE_CONFIG: {},
}));

jest.mock('../../lib/dev-mode', () => ({
  applyDevModeToPlayer: jest.fn(),
  applyDevModeEquipment: jest.fn(),
  generateDevModePotions: jest.fn(),
  isDevModeAllowed: jest.fn(),
  shouldSkipEntryFee: jest.fn(),
}));

jest.mock('../../lib/idle-systems/EncounterManager', () => ({
  EncounterManager: {
    generateEncounter: jest.fn(),
  },
}));

jest.mock('../../data/wearable-quality', () => ({
  normalizeQualityTier: jest.fn((value) => value),
}));

jest.mock('../../data/difficulty-tiers', () => ({
  getDifficultyTier: jest.fn(),
}));

import * as SharedGame from '../SharedGame';
import { buildFungibleDeltaInput } from '../SharedGame';
import { inventoryRepo } from '../../lib/db';

function createRoom() {
  return {
    sessionPlayerIds: new Map([['session-1', 'player-1']]),
    playerInventories: new Map([['session-1', []]]),
    entityLootDistributions: new Map(),
    getPlayerIdForSession(sessionId: string) {
      return this.sessionPlayerIds.get(sessionId);
    },
    state: {
      players: new Map([['session-1', {}]]),
    },
  };
}

describe('persistInventory (delta)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies adds, decreases, and removals for fungibles', async () => {
    const room = createRoom();
    const prev = [
      { type: 'coin', name: 'Gold', quantity: 2 },
      { type: 'material', name: 'Iron', quantity: 3 },
      { type: 'material', name: 'Wood', quantity: 4 },
    ];
    const next = [
      { type: 'coin', name: 'Gold', quantity: 5 },
      { type: 'material', name: 'Iron', quantity: 1 },
      { type: 'potion', name: 'Health Potion', quantity: 1 },
    ];
    const deltaInput = buildFungibleDeltaInput(prev as any, next as any);

    room.playerInventories.set('session-1', next as any);
    await SharedGame.persistInventory(room as any, 'session-1', deltaInput);

    expect(inventoryRepo.upsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        itemType: 'coin',
        itemName: 'Gold',
        quantity: 3,
      })
    );
    expect(inventoryRepo.upsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        itemType: 'potion',
        itemName: 'Health Potion',
        quantity: 1,
      })
    );
    expect(inventoryRepo.decrementInventoryItem).toHaveBeenCalledWith(
      'player-1',
      'material',
      'Iron',
      2,
      expect.any(Object)
    );
    expect(inventoryRepo.decrementInventoryItem).toHaveBeenCalledWith(
      'player-1',
      'material',
      'Wood',
      4,
      expect.any(Object)
    );
  });

  it('does nothing when there are no changes', async () => {
    const room = createRoom();
    const prev = [{ type: 'coin', name: 'Gold', quantity: 2 }];
    const next = [{ type: 'coin', name: 'Gold', quantity: 2 }];
    const deltaInput = buildFungibleDeltaInput(prev as any, next as any);

    room.playerInventories.set('session-1', next as any);

    await SharedGame.persistInventory(room as any, 'session-1', deltaInput);

    expect(inventoryRepo.upsertInventoryItem).not.toHaveBeenCalled();
    expect(inventoryRepo.decrementInventoryItem).not.toHaveBeenCalled();
  });

  it('buildFungibleDeltaInput ignores wearables (non-fungible items)', () => {
    const prev = [] as any[];
    const next = [
      {
        type: 'wearable',
        name: 'Spirit Sword',
        quantity: 1,
        wearableSlug: 'spirit-sword',
        quality: 'rare',
      },
    ] as any[];

    const delta = buildFungibleDeltaInput(prev as any, next as any);
    expect(delta).toEqual({ add: [], delete: [] });
  });

  it('buildFungibleDeltaInput ignores zero/negative quantities', () => {
    const prev = [
      { type: 'coin', name: 'Gold', quantity: 1 },
      { type: 'material', name: 'Iron', quantity: 2 },
    ] as any[];

    // next snapshot includes invalid/ignored quantities
    const next = [
      { type: 'coin', name: 'Gold', quantity: 0 }, // ignored
      { type: 'material', name: 'Iron', quantity: -5 }, // ignored
    ] as any[];

    const delta = buildFungibleDeltaInput(prev as any, next as any);

    // Both items effectively removed from the fungible snapshot
    expect(delta.delete).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'coin', name: 'Gold', quantity: 1 }),
        expect.objectContaining({ type: 'material', name: 'Iron', quantity: 2 }),
      ])
    );
    expect(delta.add).toEqual([]);
  });

  it('skips persistence when delta input is empty', async () => {
    const room = createRoom();
    const next = [
      { type: 'coin', name: 'Gold', quantity: 7 },
      { type: 'material', name: 'Wood', quantity: 2 },
    ];
    room.playerInventories.set('session-1', next as any);

    await SharedGame.persistInventory(room as any, 'session-1', {
      add: [],
      delete: [],
    });

    expect(inventoryRepo.decrementInventoryItem).not.toHaveBeenCalled();
    expect(inventoryRepo.upsertInventoryItem).not.toHaveBeenCalled();
  });

  it('applies delta input additions and deletions', async () => {
    const room = createRoom();
    const next = [
      { type: 'coin', name: 'Gold', quantity: 7 },
      { type: 'material', name: 'Wood', quantity: 2 },
    ];

    room.playerInventories.set('session-1', next as any);
    await SharedGame.persistInventory(
      room as any,
      'session-1',
      {
        add: [{ type: 'coin', name: 'Gold', quantity: 5 }],
        delete: [{ type: 'material', name: 'Wood', quantity: 1 }],
      } as any
    );

    expect(inventoryRepo.upsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        itemType: 'coin',
        itemName: 'Gold',
        quantity: 5,
      })
    );
    expect(inventoryRepo.decrementInventoryItem).toHaveBeenCalledWith(
      'player-1',
      'material',
      'Wood',
      1,
      expect.any(Object)
    );
  });
});
