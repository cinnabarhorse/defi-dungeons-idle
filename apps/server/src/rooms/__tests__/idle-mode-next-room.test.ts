/**
 * Unit Tests for processNextRoom() - Idle Mode Room Transitions
 *
 * Tests the room transition logic including:
 * - Victory handling (boss kill)
 * - Loot distribution (potions, wearables, items)
 * - Competition leaderboard submission
 * - Regular room progression
 * - Portal floor jumping
 * - Elite spawning flags
 * - Difficulty scaling
 * - HP/Mana regeneration
 *
 * Note: Uses plain JS objects instead of Colyseus schema classes
 * to avoid decorator issues in Jest environment.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock schema-like classes without decorators
class MockIdleEnemySchema {
  id: string = '';
  name: string = '';
  imageId: string = '';
  hp: number = 0;
  maxHp: number = 0;
  atk: number = 0;
  attackRange: number = 32;
  moveSpeed: number = 32;
  attackSpeed: number = 100;
  actionGauge: number = 0;
  isDead: boolean = false;
  xpReward: number = 0;
  classification: string = 'normal';
  specialState: string = 'idle';
  specialCooldown: number = 0;
  stunTurnsRemaining: number = 0;
}

class MockIdleLootSchema {
  type: string = '';
  name: string = '';
  quantity: number = 1;
  rarity: string = '';
  color: string = '';
  wearableSlug: string = '';
  quality: string = '';
  durabilityScore: number = 0;
  tokenAmount: number = 0;
}

class MockIdleEncounterSchema {
  id: string = '';
  type: string = '';
  name: string = '';
  description: string = '';
  imageId: string = '';
  isPlayerTurn: boolean = true;
  playerActionGauge: number = 0;
  playerAttackSpeed: number = 100;
  lastActionLog: string = '';
  progressCurrent: number = 0;
  progressMax: number = 100;
  isCompleted: boolean = false;
  enemies: MockIdleEnemySchema[] = [];
  targetIndex: number = 0;
  distance: number = 32;
  playerAttackRange: number = 32;
  loots: MockIdleLootSchema[] = [];
  grenadeCooldown: number = 0;
  grenadeMaxCooldown: number = 3;
  playerStunTurnsRemaining: number = 0;
  enemyId: string = '';
  enemyAtk: number = 0;
  xpReward: number = 0;
  lootTableId: string = '';
}

class MockIdleRoomSchema {
  roomId: string = '';
  encounter: MockIdleEncounterSchema = new MockIdleEncounterSchema();
  isTransitioning: boolean = false;
  runStatus: string = 'active';
  depth: number = 1;
  maxDepthReached: number = 1;
  difficultyFloor: number = 1;
  roomsVisited: number = 1;
  eliteSpawnedThisFloor: boolean = false;
  treasureSpawnedThisFloor: boolean = false;
  grenadeCooldownRemaining: number = 0;
  playerPoisonTurnsRemaining: number = 0;
  playerPoisonDamagePerTurn: number = 0;
  spellCooldowns: Map<string, number> = new Map();
  killCount: Map<string, number> = new Map();
  lootsCollected: MockIdleLootSchema[] = [];
  tokenRewards: MockIdleLootSchema[] = [];
  competitionMultiplier: number = 1.0;
  runHealthPotionsCollected: number = 0;
  runManaPotionsCollected: number = 0;
}

// Mock EncounterManager to return controlled encounters
const mockGenerateEncounter = jest.fn(() => {
  const encounter = new MockIdleEncounterSchema();
  encounter.type = 'combat';
  encounter.isCompleted = false;
  encounter.isPlayerTurn = true;
  encounter.playerActionGauge = 0;
  const enemy = new MockIdleEnemySchema();
  enemy.id = 'enemy1';
  enemy.name = 'Test Enemy';
  enemy.imageId = 'test_enemy';
  enemy.hp = 100;
  enemy.maxHp = 100;
  enemy.atk = 10;
  enemy.attackSpeed = 100;
  enemy.actionGauge = 0;
  enemy.attackRange = 32;
  encounter.enemies.push(enemy);
  return encounter;
});

// Mock the external dependencies before importing the module
jest.mock('../../lib/combat-utils', () => ({
  computeBaseDamageForCharacter: jest.fn(() => 50),
}));

jest.mock('../../lib/ability-handlers', () => ({
  computePlayerDamageWithCrit: jest.fn((player, baseDamage) => ({
    damage: baseDamage,
    isCrit: false,
  })),
  applyPlayerLifeSteal: jest.fn(() => 0),
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
  getPlayerCleave: jest.fn(() => ({ enabled: false })),
  getPlayerStun: jest.fn(() => []),
  getEnemyPoison: jest.fn(() => []),
}));

jest.mock('../../data/weapons', () => ({
  WEAPON_DEFINITIONS: {},
  WEAPON_CATEGORY_DEFAULTS: {},
  WEAPON_RARITY_MULTIPLIERS: {},
  GRENADE_MANA_COST_BY_RARITY: {},
  cloneAbilityInstance: (ability: Record<string, unknown>) => ({
    ...ability,
  }),
}));

jest.mock('../../data/wearables', () => {
  const actual = jest.requireActual('../../data/wearables') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    getWearableBySlug: jest.fn(() => null),
  };
});

jest.mock('../../data/loot-table', () => ({
  rollEnemyDrop: jest.fn(() => null),
  rollBossDrops: jest.fn(() => []),
  maybeRollLickTongueDrop: jest.fn(() => false),
}));

jest.mock('../../data/items', () => ({
  generateItemData: jest.fn(() => ({
    type: 'potion',
    name: 'Health Potion',
    quantity: 1,
  })),
}));

jest.mock('../XpScoreSystem', () => ({
  queueScoreDelta: jest.fn(),
  ensurePlayerScoreState: jest.fn(() => ({ score: 0, eligible: true })),
}));

jest.mock('../../lib/constants', () => ({
  GAME_CONFIG: {
    leverage: { xpMultiplierEnabled: true },
    modeRewards: {
      progression: {
        earnXp: true,
        earnGold: true,
        earnLickTongue: true,
        earnWearables: false,
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
  calculateTimeMultiplier: jest.fn(() => 1.5),
}));

jest.mock('../DailyQuestSystem', () => ({
  submitToCompetitionLeaderboard: jest.fn(() =>
    Promise.resolve({
      submitted: true,
      tier: 'gold',
      finalScore: 1000,
      timeMultiplier: 1.5,
      rank: 5,
    })
  ),
}));

jest.mock('../SharedGame', () => ({
  persistInventory: jest.fn(() => Promise.resolve()),
  buildFungibleDeltaInput: jest.fn(() => ({ add: [], delete: [] })),
  recordKill: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  playersRepo: {},
  inventoryRepo: {
    upsertInventoryItem: jest.fn(() => Promise.resolve()),
    createInventoryInstances: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('../../lib/db/mappers', () => ({
  getHealthPotionCount: jest.fn((inv: any) =>
    inv.filter(
      (i: any) =>
        i.type === 'potion' &&
        i.name?.toLowerCase().includes('health')
    ).reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
  ),
  getManaPotionCount: jest.fn((inv: any) =>
    inv.filter(
      (i: any) =>
        i.type === 'potion' &&
        i.name?.toLowerCase().includes('mana')
    ).reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
  ),
  getLickTongueCount: jest.fn(() => 0),
}));

jest.mock('../../lib/equipment-service', () => ({
  deserializeStoredWearable: jest.fn(() => null),
}));

jest.mock('../../lib/idle-systems/EncounterManager', () => ({
  EncounterManager: {
    generateEncounter: mockGenerateEncounter,
  },
}));

jest.mock('../../data/spells', () => ({
  SPELLS_BY_ID: {},
}));

// Mock the schema module to return our mock classes
jest.mock('../../schemas', () => ({
  PlayerSchema: class {},
  IdleLootSchema: MockIdleLootSchema,
  IdleRoomSchema: MockIdleRoomSchema,
}));

jest.mock('../../schemas/IdleSchemas', () => ({
  IdleEnemySchema: MockIdleEnemySchema,
  IdleLootSchema: MockIdleLootSchema,
  IdleEncounterSchema: MockIdleEncounterSchema,
  IdleRoomSchema: MockIdleRoomSchema,
}));

// Import after all mocks
import { processNextRoom } from '../IdleMode';
import { slugifyWearableName } from '../../data/wearables';
import { inventoryRepo } from '../../lib/db';
import { GAME_CONFIG as SHARED_GAME_CONFIG } from '../../data/game-config';

// Helper to create a mock player
function createMockPlayer(overrides: Partial<any> = {}): any {
  const idleRoom = new MockIdleRoomSchema();
  idleRoom.runStatus = 'active';
  idleRoom.depth = 1;
  idleRoom.maxDepthReached = 1;
  idleRoom.difficultyFloor = 1;
  idleRoom.roomsVisited = 1;
  idleRoom.grenadeCooldownRemaining = 0;
  idleRoom.playerPoisonTurnsRemaining = 0;
  idleRoom.playerPoisonDamagePerTurn = 0;
  idleRoom.runHealthPotionsCollected = 0;
  idleRoom.runManaPotionsCollected = 0;
  idleRoom.spellCooldowns = new Map();
  idleRoom.killCount = new Map();
  idleRoom.lootsCollected = [];
  idleRoom.eliteSpawnedThisFloor = false;

  const encounter = new MockIdleEncounterSchema();
  encounter.type = 'combat';
  encounter.isCompleted = true; // Typically completed before next room
  encounter.isPlayerTurn = true;
  encounter.playerActionGauge = 100;
  encounter.playerAttackSpeed = 100;
  encounter.playerAttackRange = 32;
  encounter.distance = 0;
  encounter.targetIndex = 0;
  encounter.lastActionLog = '';
  encounter.playerStunTurnsRemaining = 0;
  encounter.enemies = [];

  idleRoom.encounter = encounter;

  return {
    id: 'test-session-id',
    characterId: 'test-gotchi',
    hp: 100,
    maxHp: 100,
    mana: 50,
    maxMana: 100,
    score: 500,
    isAutoExploring: true,
    derivedStats: JSON.stringify({
      attackSpeed: 1000,
      weaponType: 'melee',
      meleeAttackRange: 32,
    }),
    healthPotionCount: 0,
    manaPotionCount: 0,
    equippedWearables: '[]',
    idleRoom,
    autoAscendFloor: 10,
    dailyQuestActive: false,
    lickTongueCount: 0,
    ...overrides,
  };
}

// Helper to create a mock boss enemy
function createMockBoss(): MockIdleEnemySchema {
  const boss = new MockIdleEnemySchema();
  boss.id = 'boss'; // Important: must be 'boss' for victory check
  boss.name = 'Floor Boss';
  boss.imageId = 'boss_enemy';
  boss.hp = 0;
  boss.maxHp = 500;
  boss.isDead = true;
  boss.classification = 'boss';
  return boss;
}

// Helper to create a mock room
function createMockRoom(players: Map<string, any> = new Map()): any {
  const leaveFn = jest.fn();
  return {
    state: {
      players,
      difficultyTier: 'normal_1',
      leverageTotal: 1,
    },
    lastIdleTick: 0,
    bossKilled: false,
    getPlayerIdForSession: jest.fn(() => 'player-123'),
    getClientBySessionId: jest.fn(() => ({
      leave: leaveFn,
    })),
    _leaveFn: leaveFn,
    awardXpToPlayer: jest.fn(),
    applyInventoryDelta: jest.fn(() => Promise.resolve()),
    logEconomyTransaction: jest.fn(),
    markFloorReached: jest.fn(),
    msg: {
      sendTo: jest.fn(),
    },
    playerInventories: new Map(),
    settleEquippedWearableDurability: jest.fn(() => Promise.resolve()),
    advanceDurabilityRunOrdinal: jest.fn(() => Promise.resolve()),
  };
}

describe('processNextRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateEncounter.mockClear();
    (SHARED_GAME_CONFIG as any).trading = {
      ...(SHARED_GAME_CONFIG as any).trading,
      settlementEnabled: false,
    };
  });

  describe('Early Return Conditions', () => {
    it('should return early if runStatus is not active', async () => {
      const player = createMockPlayer();
      player.idleRoom.runStatus = 'dead';
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Should not have generated a new encounter
      expect(mockGenerateEncounter).not.toHaveBeenCalled();
    });

    it('should return early if runStatus is victory', async () => {
      const player = createMockPlayer();
      player.idleRoom.runStatus = 'victory';
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(mockGenerateEncounter).not.toHaveBeenCalled();
    });
  });

  describe('Boss Victory', () => {
    it('should detect boss kill and set runStatus to victory', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.runStatus).toBe('victory');
      expect(room.bossKilled).toBe(true);
    });

    it('should gate victory chest behind stake (teaser by default)', async () => {
      jest.useFakeTimers();
      const player = createMockPlayer({ dailyQuestActive: true });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();
      room.currentGameId = 'game-123';

      await processNextRoom(room, player);
      jest.runOnlyPendingTimers();
      jest.useRealTimers();

      expect(player.idleRoom.runStatus).toBe('victory');
      expect(player.idleRoom.victoryChestStatus).toBe('teaser');
      expect(player.idleRoom.victoryChestGameId).toBe('game-123');
      expect(player.idleRoom.victoryChestRewardJson).toBe('');
      // Must NOT auto-disconnect; player needs socket alive to open chest.
      expect(room._leaveFn).not.toHaveBeenCalled();
    });

    it('should not expose victory chest for non-competition runs', async () => {
      jest.useFakeTimers();
      const player = createMockPlayer({ dailyQuestActive: false });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();
      room.currentGameId = 'game-123';

      await processNextRoom(room, player);
      jest.runOnlyPendingTimers();
      jest.useRealTimers();

      expect(player.idleRoom.runStatus).toBe('victory');
      expect(player.idleRoom.victoryChestStatus).toBe('none');
      expect(player.idleRoom.victoryChestGameId).toBe('');
      // Non-competition victory still auto-disconnects as before.
      expect(room._leaveFn).toHaveBeenCalled();
    });

    it('should persist competition wearables after victory', async () => {
      const player = createMockPlayer({ dailyQuestActive: true });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      player.idleRoom.lootsCollected.push({
        type: 'wearable',
        name: 'Test Wearable',
        quantity: 1,
        wearableSlug: 'test-wearable',
        quality: 'excellent',
        durabilityScore: 900,
      } as any);
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(inventoryRepo.createInventoryInstances).toHaveBeenCalledWith({
        playerId: 'player-123',
        items: [
          expect.objectContaining({
            wearableSlug: 'test-wearable',
            quality: 'excellent',
            durabilityScore: 900,
            itemData: expect.objectContaining({
              type: 'wearable',
              name: 'Test Wearable',
              quantity: 1,
            }),
          }),
        ],
      });
    });

    it('should preserve durabilityScore for wearable loot granted on victory', async () => {
      const player = createMockPlayer({ dailyQuestActive: true });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      player.idleRoom.lootsCollected.push({
        type: 'wearable',
        name: 'Durable Hat',
        quantity: 1,
        wearableSlug: 'durable-hat',
        quality: 'average',
        durabilityScore: 438,
      } as any);
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(inventoryRepo.createInventoryInstances).toHaveBeenCalledWith({
        playerId: 'player-123',
        items: [
          expect.objectContaining({
            wearableSlug: 'durable-hat',
            quality: 'average',
            durabilityScore: 438,
            itemData: expect.objectContaining({
              durabilityScore: 438,
            }),
          }),
        ],
      });
    });

    it('should not persist wearables in practice runs', async () => {
      const player = createMockPlayer({ dailyQuestActive: false });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      player.idleRoom.lootsCollected.push({
        type: 'wearable',
        name: 'Practice Wearable',
        quantity: 1,
        wearableSlug: 'practice-wearable',
        quality: 'flawless',
      } as any);
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(inventoryRepo.createInventoryInstances).not.toHaveBeenCalled();
    });

    it('should set victory log message', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'defeated the boss'
      );
      expect(player.idleRoom.encounter.lastActionLog).toContain('Victory');
    });

    it('should mark floor reached based on depth', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 35; // Floor 4
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 4;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(room.markFloorReached).toHaveBeenCalledWith(4); // ceil(35/10)
    });

    it('should update competition multiplier on victory', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      // calculateTimeMultiplier mock returns 1.5
      expect(player.idleRoom.competitionMultiplier).toBe(1.5);
    });

    it('should NOT detect victory if encounter not completed', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = false; // Not completed
      player.idleRoom.encounter.enemies.push(createMockBoss());
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Should proceed to next room instead
      expect(player.idleRoom.runStatus).toBe('active');
      expect(mockGenerateEncounter).toHaveBeenCalled();
    });

    it('should NOT detect victory if boss not dead', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      const boss = createMockBoss();
      boss.isDead = false; // Boss alive
      boss.hp = 100;
      player.idleRoom.encounter.enemies.push(boss);
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.runStatus).toBe('active');
      expect(mockGenerateEncounter).toHaveBeenCalled();
    });

    it('should NOT detect victory if no boss enemy', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      // No boss enemy, just a regular one
      const enemy = new MockIdleEnemySchema();
      enemy.id = 'enemy1';
      enemy.isDead = true;
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.runStatus).toBe('active');
      expect(mockGenerateEncounter).toHaveBeenCalled();
    });
  });

  describe('Competition Leaderboard', () => {
    it('should submit to leaderboard if dailyQuestActive', async () => {
      const { submitToCompetitionLeaderboard } =
        require('../DailyQuestSystem');

      const player = createMockPlayer({ dailyQuestActive: true, score: 1000 });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(submitToCompetitionLeaderboard).toHaveBeenCalledWith(
        room,
        'player-123',
        'test-session-id',
        1000
      );
    });

    it('should NOT submit to leaderboard if dailyQuestActive is false', async () => {
      const { submitToCompetitionLeaderboard } =
        require('../DailyQuestSystem');

      const player = createMockPlayer({ dailyQuestActive: false });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(submitToCompetitionLeaderboard).not.toHaveBeenCalled();
    });

    it('should send leaderboard update to client on success', async () => {
      const player = createMockPlayer({ dailyQuestActive: true, score: 1000 });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(room.msg.sendTo).toHaveBeenCalledWith(
        expect.any(Object),
        'daily_quest:leaderboard_update',
        expect.objectContaining({
          tier: 'gold',
          finalScore: 1000,
          timeMultiplier: 1.5,
          rank: 5,
        })
      );
    });
  });

  describe('Loot Distribution on Victory', () => {
    it('should persist inventory on victory', async () => {
      const { persistInventory } = require('../SharedGame');

      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(persistInventory).toHaveBeenCalledWith(
        room,
        'test-session-id',
        expect.objectContaining({
          add: expect.any(Array),
          delete: expect.any(Array),
        })
      );
    });

    it('should add wearables to inventory individually', async () => {
    const player = createMockPlayer({ dailyQuestActive: true });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;

      // Add wearable loot
      const wearableLoot = new MockIdleLootSchema();
      wearableLoot.type = 'wearable';
    wearableLoot.name = 'Spirit Sword';
    wearableLoot.wearableSlug = slugifyWearableName(wearableLoot.name);
    wearableLoot.quality = 'rare';
      wearableLoot.rarity = 'rare';
      player.idleRoom.lootsCollected.push(wearableLoot);

      const room = createMockRoom();

      await processNextRoom(room, player);

      // Check inventory was updated
      const inventory = room.playerInventories.get('test-session-id');
      expect(inventory).toContainEqual(
        expect.objectContaining({
          type: 'wearable',
        name: 'Spirit Sword',
        wearableSlug: slugifyWearableName('Spirit Sword'),
          quantity: 1,
        })
      );
    });

    it('should add run potions to inventory', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      player.idleRoom.runHealthPotionsCollected = 5;
      player.idleRoom.runManaPotionsCollected = 3;
      player.idleRoom.runHealthPotionsCollectedTier1 = 5;
      const room = createMockRoom();

      await processNextRoom(room, player);

      const inventory = room.playerInventories.get('test-session-id');
      const healthPotion = inventory?.find(
        (i: any) => i.name === 'Health Potion'
      );
      const manaPotion = inventory?.find((i: any) => i.name === 'Mana Potion');

      expect(healthPotion?.quantity).toBe(5);
      expect(manaPotion?.quantity).toBe(3);
    });

    it('should update player potion counts after victory', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      player.idleRoom.runHealthPotionsCollected = 5;
      player.idleRoom.runManaPotionsCollected = 3;
      player.idleRoom.runHealthPotionsCollectedTier1 = 5;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.healthPotionCount).toBe(5);
      expect(player.manaPotionCount).toBe(3);
    });

    it('should accumulate quantities for same item type', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;

      // Add multiple of same item
      const loot1 = new MockIdleLootSchema();
      loot1.type = 'material';
      loot1.name = 'Lick Tongue';
      loot1.quantity = 3;
      player.idleRoom.lootsCollected.push(loot1);

      const loot2 = new MockIdleLootSchema();
      loot2.type = 'material';
      loot2.name = 'Lick Tongue';
      loot2.quantity = 2;
      player.idleRoom.lootsCollected.push(loot2);

      const room = createMockRoom();

      await processNextRoom(room, player);

      const inventory = room.playerInventories.get('test-session-id');
      const lickTongue = inventory?.find((i: any) => i.name === 'Lick Tongue');

      expect(lickTongue?.quantity).toBe(5); // 3 + 2
    });

    it('should skip non-reward materials/items on victory (progression mode)', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;

      // Non-configured material (only gold + lick tongue should persist in mocked config)
      player.idleRoom.lootsCollected.push({
        type: 'material',
        name: 'Iron Ore',
        quantity: 7,
      } as any);

      const room = createMockRoom();

      await processNextRoom(room, player);

      const inventory = room.playerInventories.get('test-session-id') || [];
      expect(inventory.find((i: any) => i.name === 'Iron Ore')).toBeUndefined();
    });

    it('should merge gold loot across casing and keep original name casing', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;

      player.idleRoom.lootsCollected.push({
        type: 'coin',
        name: 'Gold',
        quantity: 3,
      } as any);

      // Same item, different casing should merge into the same delta key
      player.idleRoom.lootsCollected.push({
        type: 'coin',
        name: 'gold',
        quantity: 2,
      } as any);

      const room = createMockRoom();

      await processNextRoom(room, player);

      const inventory = room.playerInventories.get('test-session-id') || [];
      const gold = inventory.find((i: any) => i.name === 'Gold');

      expect(gold?.quantity).toBe(5);
      expect(inventory.find((i: any) => i.name === 'gold')).toBeUndefined();
    });

    it('should treat "Gold Coin" as gold and persist it on victory', async () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;

      player.idleRoom.lootsCollected.push({
        type: 'coin',
        name: 'Gold Coin',
        quantity: 4,
      } as any);

      const room = createMockRoom();

      await processNextRoom(room, player);

      const inventory = room.playerInventories.get('test-session-id') || [];
      const goldCoin = inventory.find((i: any) => i.name === 'Gold Coin');
      expect(goldCoin?.quantity).toBe(4);
    });

    it('should disconnect player after victory', async () => {
      jest.useFakeTimers();

      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockBoss());
      player.autoAscendFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      jest.advanceTimersByTime(300);

      const client = room.getClientBySessionId('test-session-id');
      expect(client?.leave).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Regular Room Progression', () => {
    it('should increment depth by 1', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 5;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.depth).toBe(6);
    });

    it('should update maxDepthReached if new depth is higher', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 5;
      player.idleRoom.maxDepthReached = 5;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.maxDepthReached).toBe(6);
    });

    it('should NOT update maxDepthReached if going backwards', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 5;
      player.idleRoom.maxDepthReached = 10; // Higher than current
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.maxDepthReached).toBe(10);
    });

    it('should increment roomsVisited', async () => {
      const player = createMockPlayer();
      player.idleRoom.roomsVisited = 5;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.roomsVisited).toBe(6);
    });

    it('should update difficultyFloor based on roomsVisited', async () => {
      const player = createMockPlayer();
      player.idleRoom.roomsVisited = 19; // Will become 20
      const room = createMockRoom();

      await processNextRoom(room, player);

      // ceil(20 / 10) = 2
      expect(player.idleRoom.difficultyFloor).toBe(2);
    });

    it('should generate new encounter', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 5;
      player.idleRoom.difficultyFloor = 1;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(mockGenerateEncounter).toHaveBeenCalledWith(
        6, // nextDepth
        'normal_1', // difficultyTier
        1, // difficultyFloor
        10, // autoAscendFloor
        false // eliteSpawnedThisFloor
      );
    });

    it('should set roomId correctly', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 15; // Will go to 16
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Floor 2, Room 6
      expect(player.idleRoom.roomId).toBe('floor_2_room_6');
    });

    it('should set isPlayerTurn to true', async () => {
      const player = createMockPlayer();
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.isPlayerTurn).toBe(true);
    });

    it('should log room entry message', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 5;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.lastActionLog).toContain('enter Room 6');
    });

    it('should set isTransitioning to false', async () => {
      const player = createMockPlayer();
      player.idleRoom.isTransitioning = true;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.isTransitioning).toBe(false);
    });
  });

  describe('Portal Floor Jumping', () => {
    it('should jump to next floor start when using portal', async () => {
      const player = createMockPlayer({ autoAscendFloor: 10 });
      player.idleRoom.depth = 15; // Floor 2, room 5
      player.idleRoom.encounter.type = 'portal';
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Should jump to floor 3 room 1 (depth 21)
      expect(player.idleRoom.depth).toBe(21);
    });

    it('should NOT jump if already on target floor', async () => {
      const player = createMockPlayer({ autoAscendFloor: 2 });
      player.idleRoom.depth = 15; // Floor 2 = target floor
      player.idleRoom.encounter.type = 'portal';
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Should NOT jump, just increment normally
      expect(player.idleRoom.depth).toBe(16);
    });

    it('should calculate correct floor for portal jump', async () => {
      const player = createMockPlayer({ autoAscendFloor: 10 });
      player.idleRoom.depth = 37; // Floor 4, room 7
      player.idleRoom.encounter.type = 'portal';
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Should jump to floor 5 room 1 (depth 41)
      expect(player.idleRoom.depth).toBe(41);
    });
  });

  describe('Elite Spawning Flags', () => {
    it('should set eliteSpawnedThisFloor when leaving elite encounter', async () => {
      const player = createMockPlayer();
      const elite = new MockIdleEnemySchema();
      elite.classification = 'elite';
      elite.isDead = true;
      player.idleRoom.encounter.enemies.push(elite);
      player.idleRoom.eliteSpawnedThisFloor = false;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.eliteSpawnedThisFloor).toBe(true);
    });

    it('should reset eliteSpawnedThisFloor when entering new floor', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 10; // Will go to 11 (new floor)
      player.idleRoom.eliteSpawnedThisFloor = true;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.eliteSpawnedThisFloor).toBe(false);
    });

    it('should NOT reset eliteSpawnedThisFloor on same floor', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 5; // Will go to 6 (same floor 1)
      player.idleRoom.eliteSpawnedThisFloor = true;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.eliteSpawnedThisFloor).toBe(true);
    });

    it('should set eliteSpawnedThisFloor if new encounter has elite', async () => {
      mockGenerateEncounter.mockReturnValueOnce({
        type: 'combat',
        isCompleted: false,
        isPlayerTurn: true,
        playerActionGauge: 0,
        enemies: [
          {
            id: 'elite1',
            classification: 'elite',
            imageId: 'elite_enemy',
          } as MockIdleEnemySchema,
        ],
        lastActionLog: '',
        playerAttackSpeed: 100,
        playerAttackRange: 32,
      } as MockIdleEncounterSchema);

      const player = createMockPlayer();
      player.idleRoom.eliteSpawnedThisFloor = false;
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.eliteSpawnedThisFloor).toBe(true);
    });
  });

  describe('Player Attack Range Initialization', () => {
    it('should set melee attack range from derived stats', async () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 800,
          weaponType: 'melee',
          meleeAttackRange: 40,
        }),
      });
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.playerAttackRange).toBe(40);
    });

    it('should set ranged attack range from derived stats', async () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 1200,
          weaponType: 'ranged',
          rangedAttackRange: 250,
        }),
      });
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.playerAttackRange).toBe(250);
    });

    it('should use default melee range if not specified', async () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 1000,
          weaponType: 'melee',
        }),
      });
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.playerAttackRange).toBe(32);
    });

    it('should use default ranged range if not specified', async () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 1000,
          weaponType: 'ranged',
        }),
      });
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.encounter.playerAttackRange).toBe(200);
    });

    it('should calculate playerAttackSpeed from derived stats', async () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 500, // 2x speed
          weaponType: 'melee',
        }),
      });
      const room = createMockRoom();

      await processNextRoom(room, player);

      // Speed = round((1000 / 500) * 100) = 200
      expect(player.idleRoom.encounter.playerAttackSpeed).toBe(200);
    });
  });

  describe('Floor Calculation Edge Cases', () => {
    it('should calculate room 10 correctly (not room 0)', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 9; // Will go to 10
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.roomId).toBe('floor_1_room_10');
    });

    it('should calculate floor boundaries correctly', async () => {
      const player = createMockPlayer();
      player.idleRoom.depth = 20; // Will go to 21 (floor 3)
      const room = createMockRoom();

      await processNextRoom(room, player);

      expect(player.idleRoom.roomId).toBe('floor_3_room_1');
    });
  });
});
