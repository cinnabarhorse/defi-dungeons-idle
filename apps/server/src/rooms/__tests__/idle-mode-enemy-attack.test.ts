/**
 * Unit Tests for processEnemyAttack() - Idle Mode Enemy AI
 *
 * Tests the enemy attack processing logic including:
 * - Basic attack mechanics (damage, gauge deduction)
 * - Stun handling (skip turn, decrement)
 * - Boss Bloodlust Charge special ability
 * - Movement and range logic
 * - Leverage damage multiplier
 * - Auto-potion use on lethal damage
 * - Poison application from enemy attacks
 * - Death handling (runStatus, log messages)
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
  runHealthPotionsCollectedTier1: number = 0;
  runHealthPotionsCollectedTier2: number = 0;
  runHealthPotionsCollectedTier3: number = 0;
  runHealthPotionsUsed: number = 0;
  runManaPotionsUsed: number = 0;
  runHealthPotionsUsedTier1: number = 0;
  runHealthPotionsUsedTier2: number = 0;
  runHealthPotionsUsedTier3: number = 0;
  persistentHealthPotionsUsed: number = 0;
  persistentManaPotionsUsed: number = 0;
  persistentHealthPotionsUsedTier1: number = 0;
  persistentHealthPotionsUsedTier2: number = 0;
  persistentHealthPotionsUsedTier3: number = 0;
}

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
  getPlayerThorns: jest.fn(() => ({ percent: 0 })),
  getEnemyPoison: jest.fn(() => []),
}));

jest.mock('../../data/weapons', () => ({
  WEAPON_DEFINITIONS: {},
}));

jest.mock('../../data/wearables', () => ({
  getWearableBySlug: jest.fn(() => null),
}));

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
  GAME_CONFIG: { leverage: { xpMultiplierEnabled: true } },
}));

jest.mock('../../lib/daily-quest-competition', () => ({
  calculateTimeMultiplier: jest.fn(() => 1.0),
}));

jest.mock('../DailyQuestSystem', () => ({
  submitToCompetitionLeaderboard: jest.fn(() =>
    Promise.resolve({ submitted: false })
  ),
}));

jest.mock('../SharedGame', () => ({
  persistInventory: jest.fn(() => Promise.resolve()),
  recordKill: jest.fn(),
  buildFungibleDeltaInput: jest.fn((prev, next) => ({
    add: next.filter((item: any) => {
      const prevItem = prev.find((p: any) => 
        (p.type || p.itemType) === (item.type || item.itemType) &&
        p.name === item.name
      );
      if (!prevItem) return true;
      return (item.quantity || 0) > (prevItem.quantity || 0);
    }),
    delete: prev.filter((prevItem: any) => {
      const nextItem = next.find((n: any) =>
        (n.type || n.itemType) === (prevItem.type || prevItem.itemType) &&
        n.name === prevItem.name
      );
      if (!nextItem) return true;
      return (prevItem.quantity || 0) > (nextItem.quantity || 0);
    }),
  })),
}));

jest.mock('../../lib/db', () => ({
  inventoryRepo: {
    upsertInventoryItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../lib/db/mappers', () => ({
  getHealthPotionCount: jest.fn(() => 0),
  getManaPotionCount: jest.fn(() => 0),
  getLickTongueCount: jest.fn(() => 0),
}));

jest.mock('../../lib/equipment-service', () => ({
  deserializeStoredWearable: jest.fn(() => null),
}));

jest.mock('../../lib/idle-systems/EncounterManager', () => ({
  EncounterManager: {
    generateEncounter: jest.fn(() => {
      const encounter = new MockIdleEncounterSchema();
      encounter.type = 'combat';
      encounter.isCompleted = false;
      encounter.isPlayerTurn = true;
      encounter.playerActionGauge = 0;
      const enemy = new MockIdleEnemySchema();
      enemy.id = 'enemy1';
      enemy.name = 'Test Enemy';
      enemy.hp = 100;
      enemy.maxHp = 100;
      enemy.atk = 10;
      enemy.attackSpeed = 100;
      enemy.actionGauge = 0;
      enemy.attackRange = 32;
      encounter.enemies.push(enemy);
      return encounter;
    }),
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
import { processEnemyAttack, logAction } from '../IdleMode';

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

  const encounter = new MockIdleEncounterSchema();
  encounter.type = 'combat';
  encounter.name = 'Test Enemy';
  encounter.isCompleted = false;
  encounter.isPlayerTurn = false;
  encounter.playerActionGauge = 0;
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
    score: 0,
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
    ...overrides,
  };
}

// Helper to create a mock enemy
function createMockEnemy(
  overrides: Partial<MockIdleEnemySchema> = {}
): MockIdleEnemySchema {
  const enemy = new MockIdleEnemySchema();
  enemy.id = 'enemy1';
  enemy.name = 'Test Enemy';
  enemy.imageId = 'test_enemy';
  enemy.hp = 100;
  enemy.maxHp = 100;
  enemy.atk = 10;
  enemy.attackSpeed = 100;
  enemy.actionGauge = 100;
  enemy.attackRange = 32;
  enemy.moveSpeed = 32;
  enemy.isDead = false;
  enemy.xpReward = 10;
  enemy.classification = 'normal';
  enemy.stunTurnsRemaining = 0;
  enemy.specialState = 'idle';
  enemy.specialCooldown = 0;

  Object.assign(enemy, overrides);
  return enemy;
}

// Helper to create a mock room
function createMockRoom(players: Map<string, any> = new Map()): any {
  return {
    state: {
      players,
      difficultyTier: 'normal_1',
      leverageTotal: 1,
    },
    lastIdleTick: 0,
    bossKilled: false,
    handlePlayerDeath: jest.fn(),
    getPlayerIdForSession: jest.fn(() => 'player-123'),
    getClientBySessionId: jest.fn(() => null),
    awardXpToPlayer: jest.fn(),
    applyInventoryDelta: jest.fn(() => Promise.resolve()),
    logEconomyTransaction: jest.fn(),
    markFloorReached: jest.fn(),
    msg: {
      sendTo: jest.fn(),
    },
    playerInventories: new Map(),
  };
}

describe('processEnemyAttack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Attack Mechanics', () => {
    it('should deal damage to player when enemy is in range', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 20, actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0; // In range
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBe(80); // 100 - 20
    });

    it('should skip dead enemies', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 20,
        actionGauge: 100,
        isDead: true,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBe(100); // No damage
    });

    it('should deduct 100 from enemy action gauge', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10, actionGauge: 150 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(enemy.actionGauge).toBe(50); // 150 - 100
    });

    it('should clamp action gauge to 0', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10, actionGauge: 50 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(enemy.actionGauge).toBe(0); // Clamped from -50
    });

    it('should sum damage from multiple attackers', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy1 = createMockEnemy({ id: 'e1', atk: 10, actionGauge: 100 });
      const enemy2 = createMockEnemy({ id: 'e2', atk: 15, actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy1, enemy2]);

      expect(player.hp).toBe(75); // 100 - (10 + 15)
    });

    it('should log attack message with enemy count', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy1 = createMockEnemy({ id: 'e1', atk: 10 });
      const enemy2 = createMockEnemy({ id: 'e2', atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy1, enemy2]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('2 enemies');
      expect(player.idleRoom.encounter.lastActionLog).toContain('20 damage');
    });

    it('should log single enemy attack with attacker name', () => {
      const player = createMockPlayer({ hp: 100 });
      player.idleRoom.encounter.name = 'Goblin Scout';
      const enemy = createMockEnemy({ atk: 15 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('Test Enemy');
      expect(player.idleRoom.encounter.lastActionLog).toContain('15 damage');
    });
  });

  describe('Leverage Damage Multiplier', () => {
    it('should apply leverage multiplier to damage', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10, actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.state.leverageTotal = 2; // 2x leverage

      processEnemyAttack(room, player, [enemy]);

      // Damage = 10 * 2 = 20
      expect(player.hp).toBe(80);
    });

    it('should round adjusted damage', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10, actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.state.leverageTotal = 1.5;

      processEnemyAttack(room, player, [enemy]);

      // Damage = round(10 * 1.5) = 15
      expect(player.hp).toBe(85);
    });

    it('should show leverage in log message', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.state.leverageTotal = 1.5;

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('L: 1.5x');
    });
  });

  describe('Thorns Reflection', () => {
    it('should reflect damage back to the attacker', () => {
      const { getPlayerThorns } = require('../../lib/ability-utils');
      (getPlayerThorns as jest.Mock).mockReturnValueOnce({ percent: 0.2 });

      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 50, hp: 100, actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBe(50);
      expect(enemy.hp).toBe(90); // 50 damage taken * 20% = 10 reflected
    });

    it('should reflect based on actual damage taken when lethal', () => {
      const { getPlayerThorns } = require('../../lib/ability-utils');
      (getPlayerThorns as jest.Mock).mockReturnValueOnce({ percent: 0.5 });

      const player = createMockPlayer({ hp: 10, maxHp: 100 });
      const enemy = createMockEnemy({ atk: 50, hp: 100, actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBe(0);
      expect(enemy.hp).toBe(95); // actualTaken = 10, 10 * 50% = 5
    });

    it('should split reflection across multiple attackers', () => {
      const { getPlayerThorns } = require('../../lib/ability-utils');
      (getPlayerThorns as jest.Mock).mockReturnValueOnce({ percent: 0.1 });

      const player = createMockPlayer({ hp: 100 });
      const enemy1 = createMockEnemy({ id: 'e1', atk: 30, hp: 100 });
      const enemy2 = createMockEnemy({ id: 'e2', atk: 70, hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy1, enemy2]);

      expect(player.hp).toBe(0);
      expect(enemy1.hp).toBe(97); // 30% of total 100, reflect 10 => 3
      expect(enemy2.hp).toBe(93); // 70% of total 100, reflect 10 => 7
    });

    it('should update encounter progress on thorns kill', () => {
      const { getPlayerThorns } = require('../../lib/ability-utils');
      (getPlayerThorns as jest.Mock).mockReturnValueOnce({ percent: 1 });

      const player = createMockPlayer({ hp: 20 });
      const enemy = createMockEnemy({ atk: 20, hp: 10, maxHp: 10 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.progressMax = 10;
      player.idleRoom.encounter.progressCurrent = 10;
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(enemy.isDead).toBe(true);
      expect(player.idleRoom.encounter.isCompleted).toBe(true);
      expect(player.idleRoom.encounter.progressCurrent).toBe(0);
    });
  });

  describe('Enemy Stun Handling', () => {
    it('should skip stunned enemy turn', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 20,
        actionGauge: 100,
        stunTurnsRemaining: 2,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBe(100); // No damage
    });

    it('should decrement stun turns', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 20,
        actionGauge: 100,
        stunTurnsRemaining: 3,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(enemy.stunTurnsRemaining).toBe(2);
    });

    it('should still deduct action gauge when stunned', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 20,
        actionGauge: 150,
        stunTurnsRemaining: 1,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(enemy.actionGauge).toBe(50); // 150 - 100
    });

    it('should log stun status with remaining turns', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        name: 'Goblin',
        stunTurnsRemaining: 2,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('stunned');
      expect(player.idleRoom.encounter.lastActionLog).toContain('1 turn');
    });

    it('should log recovery when stun wears off', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        name: 'Goblin',
        stunTurnsRemaining: 1,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'recovers from stun'
      );
    });
  });

  describe('Movement and Range', () => {
    it('should move closer when out of range', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 10,
        actionGauge: 100,
        attackRange: 32,
        moveSpeed: 16,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 100; // Out of range
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.distance).toBe(84); // 100 - 16
      expect(player.hp).toBe(100); // No damage yet
    });

    it('should attack immediately after reaching player', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 10,
        actionGauge: 100,
        attackRange: 32,
        moveSpeed: 50,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 40; // Just out of range
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      // Enemy moved 50px, now at -10 (clamped to 0), and attacked
      expect(player.idleRoom.encounter.distance).toBe(0);
      expect(player.hp).toBe(90); // 100 - 10
    });

    it('should clamp distance to 0', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 10,
        actionGauge: 100,
        attackRange: 32,
        moveSpeed: 100,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 50;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.distance).toBe(0); // Clamped
    });

    it('should log "closes in" when moving without attacking', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 10,
        actionGauge: 100,
        attackRange: 32,
        moveSpeed: 10,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 100;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('closes in');
      expect(player.idleRoom.encounter.lastActionLog).toContain('90px');
    });

    it('should log "reached you and" when reaching and attacking', () => {
      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({
        atk: 10,
        actionGauge: 100,
        attackRange: 32,
        moveSpeed: 100,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 50;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'reached you and'
      );
    });
  });

  describe('Boss Bloodlust Charge', () => {
    it('should start charging when cooldown is 0 and idle', () => {
      const player = createMockPlayer({ hp: 100 });
      const boss = createMockEnemy({
        classification: 'boss',
        specialState: 'idle',
        specialCooldown: 0,
        atk: 50,
      });
      player.idleRoom.encounter.enemies.push(boss);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [boss]);

      expect(boss.specialState).toBe('charging');
      expect(player.hp).toBe(100); // No damage while charging
      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'charging up a BLOODLUST ATTACK'
      );
    });

    it('should execute charge on next turn dealing 2.5x damage', () => {
      const player = createMockPlayer({ hp: 200 });
      const boss = createMockEnemy({
        classification: 'boss',
        specialState: 'charging',
        atk: 40,
        attackRange: 32,
      });
      player.idleRoom.encounter.enemies.push(boss);
      player.idleRoom.encounter.distance = 100; // Far away
      const room = createMockRoom();

      processEnemyAttack(room, player, [boss]);

      // Charge damage = 40 * 2.5 = 100
      expect(player.hp).toBe(100);
      // Distance closed instantly
      expect(player.idleRoom.encounter.distance).toBe(22); // attackRange - 10
      expect(boss.specialState).toBe('idle');
      expect(boss.specialCooldown).toBe(4);
      expect(player.idleRoom.encounter.lastActionLog).toContain('BLOODLUST');
      expect(player.idleRoom.encounter.lastActionLog).toContain('100 damage');
    });

    it('should have 40% chance to stun player after charge', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.3); // Below 0.4 threshold

      const player = createMockPlayer({ hp: 200 });
      const boss = createMockEnemy({
        classification: 'boss',
        specialState: 'charging',
        atk: 40,
      });
      player.idleRoom.encounter.enemies.push(boss);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [boss]);

      expect(player.idleRoom.encounter.playerStunTurnsRemaining).toBe(2);
      expect(player.idleRoom.encounter.lastActionLog).toContain('STUNNED');

      Math.random = originalRandom;
    });

    it('should NOT stun player if random >= 0.4', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5);

      const player = createMockPlayer({ hp: 200 });
      const boss = createMockEnemy({
        classification: 'boss',
        specialState: 'charging',
        atk: 40,
      });
      player.idleRoom.encounter.enemies.push(boss);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [boss]);

      expect(player.idleRoom.encounter.playerStunTurnsRemaining).toBe(0);

      Math.random = originalRandom;
    });

    it('should NOT refresh with shorter stun duration', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.1); // Would stun for 2 turns

      const player = createMockPlayer({ hp: 200 });
      player.idleRoom.encounter.playerStunTurnsRemaining = 5; // Already stunned longer
      const boss = createMockEnemy({
        classification: 'boss',
        specialState: 'charging',
        atk: 40,
      });
      player.idleRoom.encounter.enemies.push(boss);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [boss]);

      // Should NOT overwrite with shorter duration
      expect(player.idleRoom.encounter.playerStunTurnsRemaining).toBe(5);

      Math.random = originalRandom;
    });

    it('should decrement specialCooldown when > 0', () => {
      const player = createMockPlayer({ hp: 100 });
      const boss = createMockEnemy({
        classification: 'boss',
        specialState: 'idle',
        specialCooldown: 3,
        atk: 20,
      });
      player.idleRoom.encounter.enemies.push(boss);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [boss]);

      expect(boss.specialCooldown).toBe(2);
      expect(player.hp).toBe(80); // Normal attack
    });

    it('should trigger charge for portal_guardian imageId', () => {
      const player = createMockPlayer({ hp: 100 });
      const guardian = createMockEnemy({
        classification: 'normal', // Not boss classification
        imageId: 'portal_guardian',
        specialState: 'idle',
        specialCooldown: 0,
        atk: 30,
      });
      player.idleRoom.encounter.enemies.push(guardian);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [guardian]);

      expect(guardian.specialState).toBe('charging');
    });
  });

  describe('Auto-Potion Use', () => {
    it('should auto-use potions when HP drops to 0', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 100,
        healthPotionCount: 1,
      });
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.playerInventories.set('test-session-id', [
        { type: 'potion', name: 'Health Potion', quantity: 1 },
      ]);

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBeGreaterThan(0);
      expect(player.idleRoom.runStatus).toBe('active');
    });

    it('should use run-collected potions before persistent inventory', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 100,
        healthPotionCount: 1,
      });
      player.idleRoom.runHealthPotionsCollected = 2;
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      // Run potions used first
      expect(player.idleRoom.runHealthPotionsCollected).toBe(1); // 2 - 1
      expect(player.healthPotionCount).toBe(1); // Persistent unchanged
    });

    it('should use persistent potions when run potions cannot save', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 500,
        healthPotionCount: 1,
      });
      player.idleRoom.runHealthPotionsCollected = 1;
      player.idleRoom.runHealthPotionsCollectedTier1 = 1;
      const enemy = createMockEnemy({ atk: 110 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.playerInventories.set('test-session-id', [
        {
          type: 'potion',
          name: 'Greater Healing Potion',
          quantity: 1,
          potionTier: 2,
        },
      ]);

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBeGreaterThan(0);
      expect(player.idleRoom.runStatus).toBe('active');
      expect(player.idleRoom.runHealthPotionsCollected).toBe(0);
      expect(player.idleRoom.runHealthPotionsCollectedTier1).toBe(0);
      expect(player.idleRoom.runHealthPotionsUsed).toBe(1);
      expect(player.healthPotionCount).toBe(0);
      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ name: 'Greater Healing Potion' }),
        -1,
        expect.objectContaining({ auditSource: 'idle_auto_heal:tier_2' })
      );
    });

    it('should use multiple tiers in one attack when available', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 500,
        healthPotionCount: 2,
      });
      player.idleRoom.runHealthPotionsCollected = 1;
      player.idleRoom.runHealthPotionsCollectedTier1 = 1;
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.playerInventories.set('test-session-id', [
        {
          type: 'potion',
          name: 'Greater Healing Potion',
          quantity: 1,
          potionTier: 2,
        },
        {
          type: 'potion',
          name: 'Ultra Healing Potion',
          quantity: 1,
          potionTier: 3,
        },
      ]);

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBeGreaterThan(0);
      expect(player.idleRoom.runStatus).toBe('active');
      expect(player.idleRoom.runHealthPotionsCollected).toBe(0);
      expect(player.idleRoom.runHealthPotionsUsed).toBe(1);
      expect(player.healthPotionCount).toBe(0);
      expect(player.idleRoom.persistentHealthPotionsUsed).toBe(2);
      expect(room.applyInventoryDelta).toHaveBeenCalledTimes(2);
    });

    it('should only use one potion per tier per damage instance', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 500,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 6;
      player.idleRoom.runHealthPotionsCollectedTier1 = 2;
      player.idleRoom.runHealthPotionsCollectedTier2 = 2;
      player.idleRoom.runHealthPotionsCollectedTier3 = 2;
      // Damage results in death even after one potion per tier
      const enemy = createMockEnemy({ atk: 600 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      // One potion per tier used, still dies
      expect(player.hp).toBe(0); // Clamped to 0 on death
      expect(player.idleRoom.runHealthPotionsCollected).toBe(3); // 6 - 3
      expect(player.idleRoom.runHealthPotionsCollectedTier1).toBe(1);
      expect(player.idleRoom.runHealthPotionsCollectedTier2).toBe(1);
      expect(player.idleRoom.runHealthPotionsCollectedTier3).toBe(1);
      expect(player.idleRoom.runHealthPotionsUsed).toBe(3);
      expect(player.idleRoom.runStatus).toBe('dead');
    });

    it('should calculate heal amount correctly (max of 10% maxHp or 50)', () => {
      // Test with low maxHp (10% < 50)
      const player = createMockPlayer({
        hp: 10,
        maxHp: 100, // 10% = 10, but min is 50
        healthPotionCount: 1,
      });
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.playerInventories.set('test-session-id', [
        { type: 'potion', name: 'Health Potion', quantity: 1 },
      ]);

      processEnemyAttack(room, player, [enemy]);

      // HP = 10 - 20 + 50 = 40
      expect(player.hp).toBe(40);
    });

    it('should log potion use message', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 100,
        healthPotionCount: 1,
      });
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.playerInventories.set('test-session-id', [
        { type: 'potion', name: 'Health Potion', quantity: 1 },
      ]);

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('CRITICAL!');
      expect(player.idleRoom.encounter.lastActionLog).toContain('HP Potion');
    });

    it('should call applyInventoryDelta when using persistent potions', () => {
      const player = createMockPlayer({
        hp: 10,
        maxHp: 100,
        healthPotionCount: 1,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();
      room.playerInventories.set('test-session-id', [
        { type: 'potion', name: 'Health Potion', quantity: 1 },
      ]);

      processEnemyAttack(room, player, [enemy]);

      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ type: 'potion' }),
        -1,
        expect.objectContaining({ auditSource: 'idle_auto_heal:tier_1' })
      );
    });
  });

  describe('Poison Application', () => {
    it('should apply poison from attacking enemy', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 3000, damagePerTick: 5 },
      ]);

      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(3);
      expect(player.idleRoom.playerPoisonDamagePerTurn).toBe(5);
    });

    it('should convert poison duration ms to turns using ceiling', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2500, damagePerTick: 5 },
      ]);

      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      // ceil(2500 / 1000) = 3 turns
      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(3);
    });

    it('should log new poison message', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 3000, damagePerTick: 5 },
      ]);

      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10, name: 'Venomous Spider' });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain('POISONED');
      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'Venomous Spider'
      );
      expect(player.idleRoom.encounter.lastActionLog).toContain('3 turns');
      expect(player.idleRoom.encounter.lastActionLog).toContain('5 dmg/turn');
    });

    it('should log refresh message when already poisoned', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 3000, damagePerTick: 5 },
      ]);

      const player = createMockPlayer({ hp: 100 });
      player.idleRoom.playerPoisonTurnsRemaining = 1; // Already poisoned
      const enemy = createMockEnemy({ atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'Poison refreshed'
      );
      expect(player.idleRoom.encounter.lastActionLog).toContain('3 turns');
    });

    it('should NOT apply poison to dead player', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValue([
        { chance: 1, durationMs: 3000, damagePerTick: 5 },
      ]);

      const player = createMockPlayer({
        hp: 10,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      const enemy = createMockEnemy({ atk: 20 }); // Lethal damage
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(0);
    });

    it('should respect poison chance', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValueOnce([
        { chance: 0.5, durationMs: 3000, damagePerTick: 5 },
      ]);

      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.8); // Above 0.5 chance

      const player = createMockPlayer({ hp: 100 });
      const enemy = createMockEnemy({ atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(0);

      Math.random = originalRandom;
    });

    it('should only apply one poison per attack cycle', () => {
      const { getEnemyPoison } = require('../../lib/ability-utils');
      (getEnemyPoison as jest.Mock).mockReturnValue([
        { chance: 1, durationMs: 5000, damagePerTick: 10 },
      ]);

      const player = createMockPlayer({ hp: 100 });
      const enemy1 = createMockEnemy({ id: 'e1', atk: 10 });
      const enemy2 = createMockEnemy({ id: 'e2', atk: 10 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy1, enemy2]);

      // Only first enemy's poison should be applied (then break)
      expect(getEnemyPoison).toHaveBeenCalledTimes(2);
      // Poison should be set only once
      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(5);
    });
  });

  describe('Death Handling', () => {
    it('should set runStatus to dead when HP <= 0', () => {
      const player = createMockPlayer({
        hp: 10,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.runStatus).toBe('dead');
    });

    it('should notify room death handler so deaths persist to game_players', () => {
      const player = createMockPlayer({
        hp: 10,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(room.handlePlayerDeath).toHaveBeenCalledWith(
        'test-session-id',
        'enemy_attack'
      );
    });


    it('should log defeat message', () => {
      const player = createMockPlayer({
        hp: 10,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      const enemy = createMockEnemy({ atk: 20 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'You were defeated'
      );
      expect(player.idleRoom.encounter.lastActionLog).toContain('LOOT LOST');
    });

    it('should clamp HP to 0', () => {
      const player = createMockPlayer({
        hp: 10,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      const enemy = createMockEnemy({ atk: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.distance = 0;
      const room = createMockRoom();

      processEnemyAttack(room, player, [enemy]);

      expect(player.hp).toBe(0); // Clamped, not negative
    });
  });
});
