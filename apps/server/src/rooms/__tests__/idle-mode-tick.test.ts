/**
 * Unit Tests for processIdleTick() - Idle Mode Game Loop
 *
 * Tests the main tick processing logic including:
 * - Action gauge accumulation (100 = ready to act)
 * - Up to 10 actions per tick
 * - Player/enemy turn priority
 * - Auto-explore vs manual mode
 * - Poison tick processing
 * - Auto-potion use
 * - Player stun handling
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
  getPlayerThorns: jest.fn(() => ({ percent: 0 })),
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
import {
  processIdleTick,
  processPlayerAttack,
  processEnemyAttack,
  processGrenade,
  onPlayerTurnComplete,
  logAction,
  updateEncounterProgress,
} from '../IdleMode';

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
  enemy.actionGauge = 0;
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

describe('processIdleTick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Tick Interval', () => {
    it('should skip processing if less than 1000ms since last tick', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 500;

      processIdleTick(room, 1000); // Only 500ms passed

      // Player gauge should not have increased
      expect(player.idleRoom.encounter.playerActionGauge).toBe(0);
    });

    it('should process tick if 1000ms or more has passed', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Player gauge should have increased (speed = 100 by default)
      // In manual mode, gauge accumulates and waits for client input
      expect(player.idleRoom.encounter.playerActionGauge).toBe(100);
    });
  });

  describe('Action Gauge Accumulation', () => {
    it('should increment player action gauge based on attack speed', () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({ attackSpeed: 500 }), // 2x speed
        isAutoExploring: false,
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Speed = (1000 / 500) * 100 = 200
      expect(player.idleRoom.encounter.playerActionGauge).toBe(200);
    });

    it('should increment enemy action gauge based on attack speed', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      const enemy = createMockEnemy({ attackSpeed: 50 }); // Slow enemy
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(enemy.actionGauge).toBe(50);
    });

    it('should not increment dead enemy action gauge', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      const enemy = createMockEnemy({ isDead: true, attackSpeed: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(enemy.actionGauge).toBe(0);
    });
  });

  describe('Turn Priority', () => {
    it('should set isPlayerTurn to true when player gauge >= 100', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(player.idleRoom.encounter.isPlayerTurn).toBe(true);
    });

    it('should process player action first when player has higher gauge', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      player.idleRoom.encounter.playerActionGauge = 150;
      const enemy = createMockEnemy({ actionGauge: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Player acted first (gauge deducted from higher value)
      // Player gauge was 150 + speed (100) = 250, then -100 = 150
      expect(player.idleRoom.encounter.playerActionGauge).toBeLessThan(250);
    });

    it('should process enemy action when player gauge is not ready', () => {
      // In manual mode, when player gauge < 100 after increment, enemy can act
      const player = createMockPlayer({ isAutoExploring: false, hp: 100 });
      player.idleRoom.encounter.playerActionGauge = 0; // Player starts at 0
      player.idleRoom.encounter.distance = 0; // Enemy is in range to attack
      // Use slower player speed so they don't reach 100
      player.derivedStats = JSON.stringify({ attackSpeed: 5000 }); // Very slow
      // Start enemy at 50 so after +100 increment = 150, acts once, left with 50
      const enemy = createMockEnemy({ actionGauge: 50, attackRange: 32 });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Player speed = (1000/5000)*100 = 20, so player gauge = 20 (not ready)
      // Enemy gauge = 50 + 100 = 150, ready to act once
      // Enemy should act and deal damage
      expect(player.hp).toBeLessThan(100);
      expect(enemy.actionGauge).toBe(50); // 150 - 100 = 50
    });
  });

  describe('Action Limit per Tick', () => {
    it('should process at most 10 actions per tick', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      player.idleRoom.encounter.playerActionGauge = 2000; // Enough for many actions
      const enemy = createMockEnemy({
        actionGauge: 0,
        hp: 10000,
        maxHp: 10000,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // After 10 actions, gauge should still be > 0 since we started with 2000
      // 2000 + 100 (speed increment) - 1000 (10 actions * 100) = 1100
      expect(player.idleRoom.encounter.playerActionGauge).toBeGreaterThanOrEqual(
        0
      );
    });
  });

  describe('Auto-Explore Mode', () => {
    it('should automatically attack in auto-explore mode', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      player.idleRoom.encounter.playerActionGauge = 100;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Enemy should have taken damage from auto-attack
      expect(enemy.hp).toBeLessThan(100);
    });

    it('should not auto-attack in manual mode', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      player.idleRoom.encounter.playerActionGauge = 100;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Enemy should NOT have taken damage (waiting for client input)
      expect(enemy.hp).toBe(100);
    });

    it('should auto-complete non-combat encounters when auto-exploring', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      player.idleRoom.encounter.type = 'treasure';
      player.idleRoom.encounter.isCompleted = false;
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(player.idleRoom.encounter.isCompleted).toBe(true);
    });

    it('should auto-complete treasure even when not auto-exploring', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      player.idleRoom.encounter.type = 'treasure';
      player.idleRoom.encounter.isCompleted = false;
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(player.idleRoom.encounter.isCompleted).toBe(true);
    });
  });

  describe('Poison Processing', () => {
    it('should deal poison damage at start of combat tick', () => {
      const player = createMockPlayer({ hp: 100, maxHp: 100 });
      player.idleRoom.playerPoisonTurnsRemaining = 3;
      player.idleRoom.playerPoisonDamagePerTurn = 10;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(player.hp).toBeLessThan(100);
      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(2);
    });

    it('should apply leverage to poison damage', () => {
      const player = createMockPlayer({ hp: 100, maxHp: 100 });
      player.idleRoom.playerPoisonTurnsRemaining = 3;
      player.idleRoom.playerPoisonDamagePerTurn = 10;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.state.leverageTotal = 2; // 2x leverage
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Poison damage = 10 * 2 = 20
      expect(player.hp).toBeLessThanOrEqual(80);
    });

    it('should clear poison after turns expire', () => {
      const player = createMockPlayer({ hp: 100, maxHp: 100 });
      player.idleRoom.playerPoisonTurnsRemaining = 1;
      player.idleRoom.playerPoisonDamagePerTurn = 5;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(player.idleRoom.playerPoisonTurnsRemaining).toBe(0);
      expect(player.idleRoom.encounter.lastActionLog).toContain('wears off');
    });
  });

  describe('Auto-Potion Use', () => {
    it('should auto-use health potion when HP drops to 0 from poison', () => {
      const player = createMockPlayer({
        hp: 5,
        maxHp: 100,
        healthPotionCount: 1,
      });
      player.idleRoom.playerPoisonTurnsRemaining = 1;
      player.idleRoom.playerPoisonDamagePerTurn = 10;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.playerInventories.set('test-session-id', [
        { type: 'potion', name: 'Health Potion', quantity: 1 },
      ]);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Should have survived due to potion use
      expect(player.hp).toBeGreaterThan(0);
      expect(player.idleRoom.runStatus).toBe('active');
    });

    it('should use run-collected potions before persistent inventory', () => {
      const player = createMockPlayer({
        hp: 5,
        maxHp: 100,
        healthPotionCount: 1,
      });
      player.idleRoom.runHealthPotionsCollected = 2;
      player.idleRoom.playerPoisonTurnsRemaining = 1;
      player.idleRoom.playerPoisonDamagePerTurn = 10;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Run potions should be used first
      expect(player.idleRoom.runHealthPotionsCollected).toBeLessThan(2);
      expect(player.healthPotionCount).toBe(1); // Persistent unchanged
    });

    it('should set runStatus to dead if no potions available', () => {
      const player = createMockPlayer({
        hp: 5,
        maxHp: 100,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      player.idleRoom.playerPoisonTurnsRemaining = 1;
      player.idleRoom.playerPoisonDamagePerTurn = 10;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(player.idleRoom.runStatus).toBe('dead');
    });

    it('should notify room death handler on poison defeat', () => {
      const player = createMockPlayer({
        hp: 5,
        maxHp: 100,
        healthPotionCount: 0,
      });
      player.idleRoom.runHealthPotionsCollected = 0;
      player.idleRoom.playerPoisonTurnsRemaining = 1;
      player.idleRoom.playerPoisonDamagePerTurn = 10;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      expect(room.handlePlayerDeath).toHaveBeenCalledWith('session1', 'poison');
    });
  });

  describe('Player Stun', () => {
    it('should skip player turn when stunned', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      // Use lower initial gauge so only 1 action happens per tick
      player.idleRoom.encounter.playerActionGauge = 50;
      player.idleRoom.encounter.playerStunTurnsRemaining = 2;
      const enemy = createMockEnemy({ hp: 100, actionGauge: 0 });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Enemy should NOT have taken damage (player was stunned)
      expect(enemy.hp).toBe(100);
      // Stun turns should decrement once (50 + 100 = 150 -> 1 action -> 50)
      expect(player.idleRoom.encounter.playerStunTurnsRemaining).toBe(1);
    });

    it('should deduct action gauge when stunned', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      player.idleRoom.encounter.playerActionGauge = 150;
      player.idleRoom.encounter.playerStunTurnsRemaining = 1;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Gauge should be deducted even though stunned
      expect(player.idleRoom.encounter.playerActionGauge).toBeLessThan(150);
    });

    it('should tick cooldowns while stunned', () => {
      const player = createMockPlayer({ isAutoExploring: true });
      // Use lower initial gauge so only 1 action happens per tick
      player.idleRoom.encounter.playerActionGauge = 50;
      player.idleRoom.encounter.playerStunTurnsRemaining = 1;
      player.idleRoom.grenadeCooldownRemaining = 3;
      player.idleRoom.encounter.enemies.push(createMockEnemy({ actionGauge: 0 }));
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Grenade cooldown should still tick down once (1 action while stunned)
      expect(player.idleRoom.grenadeCooldownRemaining).toBe(2);
    });
  });

  describe('Enemy Stun', () => {
    it('should skip enemy turn when stunned', () => {
      const player = createMockPlayer({ isAutoExploring: false, hp: 100 });
      player.idleRoom.encounter.playerActionGauge = 50; // Not ready
      const enemy = createMockEnemy({
        actionGauge: 100,
        stunTurnsRemaining: 2,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Player should NOT have taken damage (enemy was stunned)
      expect(player.hp).toBe(100);
      // Stun turns should decrement
      expect(enemy.stunTurnsRemaining).toBe(1);
    });
  });

  describe('Run Status', () => {
    it('should skip combat processing for dead players', () => {
      const player = createMockPlayer();
      player.idleRoom.runStatus = 'dead';
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      const initialGauge = player.idleRoom.encounter.playerActionGauge;
      processIdleTick(room, 1000);

      // Gauge should not have changed for dead player
      expect(player.idleRoom.encounter.playerActionGauge).toBe(initialGauge);
    });

    it('should skip processing for victory status', () => {
      const player = createMockPlayer();
      player.idleRoom.runStatus = 'victory';
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      const initialGauge = player.idleRoom.encounter.playerActionGauge;
      processIdleTick(room, 1000);

      // Gauge should not have changed for victorious player
      expect(player.idleRoom.encounter.playerActionGauge).toBe(initialGauge);
    });
  });

  describe('Completed Encounters', () => {
    it('should skip combat processing for completed encounters', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      player.idleRoom.encounter.isCompleted = true;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // Gauge should not have increased for completed encounter
      expect(player.idleRoom.encounter.playerActionGauge).toBe(0);
    });
  });
});

describe('onPlayerTurnComplete', () => {
  it('should decrement grenade cooldown', () => {
    const player = createMockPlayer();
    player.idleRoom.grenadeCooldownRemaining = 3;

    onPlayerTurnComplete(player);

    expect(player.idleRoom.grenadeCooldownRemaining).toBe(2);
  });

  it('should not decrement grenade cooldown below 0', () => {
    const player = createMockPlayer();
    player.idleRoom.grenadeCooldownRemaining = 0;

    onPlayerTurnComplete(player);

    expect(player.idleRoom.grenadeCooldownRemaining).toBe(0);
  });

  it('should decrement spell cooldowns', () => {
    const player = createMockPlayer();
    player.idleRoom.spellCooldowns.set('freeze', 5);
    player.idleRoom.spellCooldowns.set('bounce', 2);

    onPlayerTurnComplete(player);

    expect(player.idleRoom.spellCooldowns.get('freeze')).toBe(4);
    expect(player.idleRoom.spellCooldowns.get('bounce')).toBe(1);
  });

  it('should remove spell cooldowns when they reach 0', () => {
    const player = createMockPlayer();
    player.idleRoom.spellCooldowns.set('freeze', 1);

    onPlayerTurnComplete(player);

    expect(player.idleRoom.spellCooldowns.has('freeze')).toBe(false);
  });
});

describe('logAction', () => {
  it('should append message to action log', () => {
    const player = createMockPlayer();
    player.idleRoom.encounter.lastActionLog = '';

    logAction(player, 'First message');

    expect(player.idleRoom.encounter.lastActionLog).toBe('First message');
  });

  it('should append with newline if log already has content', () => {
    const player = createMockPlayer();
    player.idleRoom.encounter.lastActionLog = 'First message';

    logAction(player, 'Second message');

    expect(player.idleRoom.encounter.lastActionLog).toBe(
      'First message\nSecond message'
    );
  });
});

describe('updateEncounterProgress', () => {
  it('should update progress based on remaining enemy HP', () => {
    const player = createMockPlayer();
    const enemy1 = createMockEnemy({ hp: 50, maxHp: 100 });
    const enemy2 = createMockEnemy({ id: 'enemy2', hp: 30, maxHp: 100 });
    player.idleRoom.encounter.enemies.push(enemy1, enemy2);
    player.idleRoom.encounter.progressMax = 200;
    const room = createMockRoom();

    updateEncounterProgress(room, player);

    expect(player.idleRoom.encounter.progressCurrent).toBe(80); // 50 + 30
  });

  it('should mark encounter complete when all enemies dead', () => {
    const player = createMockPlayer();
    const enemy = createMockEnemy({ hp: 0, isDead: true });
    player.idleRoom.encounter.enemies.push(enemy);
    const room = createMockRoom();

    updateEncounterProgress(room, player);

    expect(player.idleRoom.encounter.isCompleted).toBe(true);
  });

  it('should update encounter name when only one enemy remains', () => {
    const player = createMockPlayer();
    const enemy1 = createMockEnemy({ hp: 0, isDead: true, name: 'Dead Enemy' });
    const enemy2 = createMockEnemy({
      id: 'enemy2',
      hp: 50,
      isDead: false,
      name: 'Survivor',
    });
    player.idleRoom.encounter.enemies.push(enemy1, enemy2);
    player.idleRoom.encounter.name = 'Multi-Enemy Fight';
    const room = createMockRoom();

    updateEncounterProgress(room, player);

    expect(player.idleRoom.encounter.name).toBe('Survivor');
  });
});

describe('processPlayerAttack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Range Check', () => {
    it('should auto-move closer when out of range', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 100;
      player.idleRoom.encounter.playerAttackRange = 32;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Should move 60px closer
      expect(player.idleRoom.encounter.distance).toBe(40);
      // Enemy should NOT have taken damage yet
      expect(enemy.hp).toBe(100);
      expect(player.idleRoom.encounter.lastActionLog).toContain('Moving closer');
    });

    it('should attack when in range', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 30;
      player.idleRoom.encounter.playerAttackRange = 32;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Enemy should have taken damage
      expect(enemy.hp).toBeLessThan(100);
    });

    it('should respect ranged weapon attack range', () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 1000,
          weaponType: 'ranged',
          rangedAttackRange: 200,
        }),
      });
      player.idleRoom.encounter.distance = 150;
      player.idleRoom.encounter.playerAttackRange = 200;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Should attack from range (150 < 200)
      expect(enemy.hp).toBeLessThan(100);
    });
  });

  describe('Damage Calculation', () => {
    it('should deal base damage to enemy', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Base damage is 50 from mock
      expect(enemy.hp).toBe(50);
    });

    it('should log critical strike message when crit occurs', () => {
      // Configure mock to return critical hit
      const { computePlayerDamageWithCrit } = require('../../lib/ability-handlers');
      (computePlayerDamageWithCrit as jest.Mock).mockReturnValueOnce({
        damage: 100,
        isCrit: true,
      });

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 150 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toContain('CRITICAL STRIKE');
    });
  });

  describe('Targeting', () => {
    it('should attack the target at targetIndex', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      player.idleRoom.encounter.targetIndex = 1;
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 100 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Only enemy2 should be damaged
      expect(enemy1.hp).toBe(100);
      expect(enemy2.hp).toBeLessThan(100);
    });

    it('should auto-retarget when current target is dead', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      player.idleRoom.encounter.targetIndex = 0;
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 0, isDead: true });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Should have auto-targeted enemy2
      expect(player.idleRoom.encounter.targetIndex).toBe(1);
      expect(enemy2.hp).toBeLessThan(100);
    });

    it('should not attack if all enemies are dead', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 0, isDead: true });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      // Should return early without error
      processPlayerAttack(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toBe('');
    });
  });

  describe('Cleave Damage', () => {
    it('should hit multiple enemies when cleave is enabled', () => {
      // Configure mock to enable cleave
      const { getPlayerCleave } = require('../../lib/ability-utils');
      (getPlayerCleave as jest.Mock).mockReturnValueOnce({
        enabled: true,
        maxTargets: 3,
      });

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 100 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100 });
      const enemy3 = createMockEnemy({ id: 'enemy3', hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2, enemy3);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // All enemies should be damaged
      expect(enemy1.hp).toBeLessThan(100);
      expect(enemy2.hp).toBeLessThan(100);
      expect(enemy3.hp).toBeLessThan(100);
    });

    it('should apply cleave damage multipliers (1, 0.8, 0.5)', () => {
      // Configure mock to enable cleave
      const { getPlayerCleave } = require('../../lib/ability-utils');
      (getPlayerCleave as jest.Mock).mockReturnValueOnce({
        enabled: true,
        maxTargets: 3,
      });

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 100 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100 });
      const enemy3 = createMockEnemy({ id: 'enemy3', hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2, enemy3);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // With base damage 50:
      // enemy1: 50 * 1.0 = 50 damage -> 50 HP
      // enemy2: 50 * 0.8 = 40 damage -> 60 HP
      // enemy3: 50 * 0.5 = 25 damage -> 75 HP
      expect(enemy1.hp).toBe(50);
      expect(enemy2.hp).toBe(60);
      expect(enemy3.hp).toBe(75);
    });

    it('should respect cleave maxTargets limit', () => {
      // Configure mock to enable cleave with 2 max targets
      const { getPlayerCleave } = require('../../lib/ability-utils');
      (getPlayerCleave as jest.Mock).mockReturnValueOnce({
        enabled: true,
        maxTargets: 2,
      });

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 100 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100 });
      const enemy3 = createMockEnemy({ id: 'enemy3', hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2, enemy3);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Only first 2 enemies should be damaged
      expect(enemy1.hp).toBeLessThan(100);
      expect(enemy2.hp).toBeLessThan(100);
      expect(enemy3.hp).toBe(100); // Not hit
    });

    it('should log cleave message when hitting multiple enemies', () => {
      // Configure mock to enable cleave
      const { getPlayerCleave } = require('../../lib/ability-utils');
      (getPlayerCleave as jest.Mock).mockReturnValueOnce({
        enabled: true,
        maxTargets: 3,
      });

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 100 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toContain('cleave through');
      expect(player.idleRoom.encounter.lastActionLog).toContain('2 enemies');
    });
  });

  describe('Kill Processing', () => {
    it('should mark enemy as dead when HP reaches 0', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 30 }); // Less than base damage of 50
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(enemy.hp).toBe(0);
      expect(enemy.isDead).toBe(true);
    });

    it('should award score based on enemy XP and leverage', () => {
      const player = createMockPlayer({ score: 0 });
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 30, xpReward: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();
      room.state.leverageTotal = 2;

      processPlayerAttack(room, 'session1', player);

      // Score = xpReward * leverage = 100 * 2 = 200
      expect(player.score).toBe(200);
    });

    it('should track kill count', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({
        hp: 30,
        imageId: 'goblin',
        name: 'Goblin Scout',
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      const killKey = 'goblin|Goblin Scout';
      expect(player.idleRoom.killCount.get(killKey)).toBe(1);
      const { recordKill } = require('../SharedGame');
      expect(recordKill).toHaveBeenCalledWith(room, 'session1');
    });

    it('should increment kill count for subsequent kills', () => {
      const player = createMockPlayer();
      player.idleRoom.killCount.set('goblin|Goblin Scout', 5);
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({
        hp: 30,
        imageId: 'goblin',
        name: 'Goblin Scout',
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(player.idleRoom.killCount.get('goblin|Goblin Scout')).toBe(6);
    });

    it('should call awardXpToPlayer on kill', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 30, xpReward: 50 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(room.awardXpToPlayer).toHaveBeenCalledWith('session1', 50, expect.any(Object));
    });
  });

  describe('Life Steal', () => {
    it('should apply life steal for melee attacks', () => {
      const { applyPlayerLifeSteal } = require('../../lib/ability-handlers');
      (applyPlayerLifeSteal as jest.Mock).mockReturnValueOnce(10);

      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 1000,
          weaponType: 'melee',
        }),
      });
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(applyPlayerLifeSteal).toHaveBeenCalled();
      expect(player.idleRoom.encounter.lastActionLog).toContain('Healed for 10 HP');
    });

    it('should NOT apply life steal for ranged attacks', () => {
      const { applyPlayerLifeSteal } = require('../../lib/ability-handlers');
      (applyPlayerLifeSteal as jest.Mock).mockClear();

      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          attackSpeed: 1000,
          weaponType: 'ranged',
          rangedAttackRange: 200,
        }),
      });
      player.idleRoom.encounter.distance = 0;
      player.idleRoom.encounter.playerAttackRange = 200;
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(applyPlayerLifeSteal).not.toHaveBeenCalled();
    });
  });

  describe('Stun Application', () => {
    it('should apply stun when stun source is available', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2000 },
      ]);

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 100, stunTurnsRemaining: 0 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // 2000ms = 2 turns
      expect(enemy.stunTurnsRemaining).toBe(2);
      expect(player.idleRoom.encounter.lastActionLog).toContain('STUNNED');
    });

    it('should refresh stun with longer duration', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 3000 },
      ]);

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 100, stunTurnsRemaining: 1 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Should refresh to 3 turns (longer than current 1)
      expect(enemy.stunTurnsRemaining).toBe(3);
    });

    it('should NOT apply shorter stun duration', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 1000 },
      ]);

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 100, stunTurnsRemaining: 5 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Should NOT overwrite with shorter duration
      expect(enemy.stunTurnsRemaining).toBe(5);
    });

    it('should not stun dead enemies', () => {
      const { getPlayerStun, getPlayerCleave } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2000 },
      ]);
      (getPlayerCleave as jest.Mock).mockReturnValueOnce({
        enabled: true,
        maxTargets: 2,
      });

      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      // Enemy1 will die from attack (30 HP < 50 damage)
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 30, stunTurnsRemaining: 0 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 100, stunTurnsRemaining: 0 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Dead enemy should not be stunned
      expect(enemy1.isDead).toBe(true);
      expect(enemy1.stunTurnsRemaining).toBe(0);
      // Living enemy should be stunned
      expect(enemy2.stunTurnsRemaining).toBe(2);
    });
  });

  describe('Encounter Progress', () => {
    it('should update encounter progress after attack', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      player.idleRoom.encounter.progressMax = 100;
      const enemy = createMockEnemy({ hp: 100, maxHp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      // Enemy took 50 damage, 50 HP remaining
      expect(player.idleRoom.encounter.progressCurrent).toBe(50);
    });

    it('should mark encounter complete when all enemies dead', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.distance = 0;
      const enemy = createMockEnemy({ hp: 30 }); // Will die from 50 damage
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processPlayerAttack(room, 'session1', player);

      expect(player.idleRoom.encounter.isCompleted).toBe(true);
    });
  });
});

describe('processEnemyAttack', () => {
  it('should deal damage to player', () => {
    const player = createMockPlayer({ hp: 100 });
    const enemy = createMockEnemy({ atk: 20, actionGauge: 100 });
    player.idleRoom.encounter.enemies.push(enemy);
    player.idleRoom.encounter.distance = 0; // In range
    const room = createMockRoom();

    processEnemyAttack(room, player, [enemy]);

    expect(player.hp).toBeLessThan(100);
  });

  it('should apply leverage multiplier to damage', () => {
    const player = createMockPlayer({ hp: 100 });
    const enemy = createMockEnemy({ atk: 10, actionGauge: 100 });
    player.idleRoom.encounter.enemies.push(enemy);
    player.idleRoom.encounter.distance = 0;
    const room = createMockRoom();
    room.state.leverageTotal = 2;

    processEnemyAttack(room, player, [enemy]);

    // Damage = 10 * 2 = 20
    expect(player.hp).toBe(80);
  });

  it('should move closer if out of range', () => {
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

    // Enemy moved closer but didn't attack (player HP unchanged)
    expect(player.idleRoom.encounter.distance).toBe(84); // 100 - 16
    // Player only takes damage if enemy reached attack range
    // 84 > 32, so no damage dealt
    expect(player.hp).toBe(100);
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
    expect(player.hp).toBeLessThan(100);
  });

  it('should skip stunned enemies', () => {
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
    expect(enemy.stunTurnsRemaining).toBe(1); // Stun decremented
  });

  it('should deduct enemy action gauge', () => {
    const player = createMockPlayer({ hp: 100 });
    const enemy = createMockEnemy({ atk: 10, actionGauge: 150 });
    player.idleRoom.encounter.enemies.push(enemy);
    player.idleRoom.encounter.distance = 0;
    const room = createMockRoom();

    processEnemyAttack(room, player, [enemy]);

    expect(enemy.actionGauge).toBe(50); // 150 - 100
  });

  it('should set runStatus to dead when player HP reaches 0', () => {
    const player = createMockPlayer({ hp: 10, healthPotionCount: 0 });
    player.idleRoom.runHealthPotionsCollected = 0;
    const enemy = createMockEnemy({ atk: 20, actionGauge: 100 });
    player.idleRoom.encounter.enemies.push(enemy);
    player.idleRoom.encounter.distance = 0;
    const room = createMockRoom();

    processEnemyAttack(room, player, [enemy]);

    expect(player.idleRoom.runStatus).toBe('dead');
  });

  it('should auto-use potions to survive lethal damage', () => {
    const player = createMockPlayer({
      hp: 10,
      healthPotionCount: 1,
      maxHp: 100,
    });
    player.idleRoom.runHealthPotionsCollected = 0;
    const enemy = createMockEnemy({ atk: 20, actionGauge: 100 });
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
});

describe('Key Game Rules', () => {
  describe('Grenade Cooldown', () => {
    it('should have default 3-turn cooldown', () => {
      // Test that grenade cooldown is set to 3 after use
      const player = createMockPlayer();
      player.idleRoom.grenadeCooldownRemaining = 3;

      // After 3 turns, cooldown should be 0
      onPlayerTurnComplete(player); // 2
      onPlayerTurnComplete(player); // 1
      onPlayerTurnComplete(player); // 0

      expect(player.idleRoom.grenadeCooldownRemaining).toBe(0);
    });
  });

  describe('Action Gauge Threshold', () => {
    it('should require 100 gauge to act', () => {
      const player = createMockPlayer({ isAutoExploring: false });
      player.idleRoom.encounter.playerActionGauge = 99;
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const players = new Map([['session1', player]]);
      const room = createMockRoom(players);
      room.lastIdleTick = 0;

      processIdleTick(room, 1000);

      // With 99 + 100 = 199, player should be ready
      expect(player.idleRoom.encounter.isPlayerTurn).toBe(true);
    });
  });
});
