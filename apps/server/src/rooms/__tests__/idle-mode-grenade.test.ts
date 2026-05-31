/**
 * Unit Tests for processGrenade() - Idle Mode Grenade System
 *
 * Tests the grenade processing logic including:
 * - Damage grenades (AOE damage with 1.5x multiplier)
 * - Critical strikes on grenades
 * - Healing grenades (milkshake)
 * - Stun from grenades (coconut, basketball)
 * - Cooldown tracking (default 3 turns, or from definition)
 * - Kill processing (score, XP, loot)
 * - Encounter progress updates
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
  processGrenade,
  getEquippedGrenadeSlug,
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

describe('processGrenade', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset WEAPON_DEFINITIONS to empty object
    const weaponsMock = require('../../data/weapons');
    weaponsMock.WEAPON_DEFINITIONS = {};

    // Reset deserializeStoredWearable to return null
    const equipmentMock = require('../../lib/equipment-service');
    equipmentMock.deserializeStoredWearable.mockReturnValue(null);
  });

  describe('No Grenade Equipped', () => {
    it('should return early if no grenade is equipped', () => {
      const player = createMockPlayer();
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Enemy should not be damaged
      expect(enemy.hp).toBe(100);
      // No log message
      expect(player.idleRoom.encounter.lastActionLog).toBe('');
    });
  });

  describe('Damage Grenades', () => {
    beforeEach(() => {
      // Setup: Player has a damage grenade equipped
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'test_grenade',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        test_grenade: {
          weaponType: 'grenades',
          grenade: {
            damageCenter: 50,
            damageEdge: 25,
            cooldownMs: 3000,
          },
        },
      };
    });

    it('should deal AOE damage with 1.5x multiplier to all enemies', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 200, maxHp: 200 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 200, maxHp: 200 });
      const enemy3 = createMockEnemy({ id: 'enemy3', hp: 200, maxHp: 200 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2, enemy3);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Base damage is 50 (from mock), AOE multiplier = 1.5, so 75 damage each
      expect(enemy1.hp).toBe(125); // 200 - 75
      expect(enemy2.hp).toBe(125);
      expect(enemy3.hp).toBe(125);
    });

    it('should NOT deal damage to dead enemies', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 200 });
      const enemy2 = createMockEnemy({
        id: 'enemy2',
        hp: 0,
        isDead: true,
      });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Only enemy1 should take damage
      expect(enemy1.hp).toBe(125); // 200 - 75
      expect(enemy2.hp).toBe(0); // Unchanged (dead)
    });

    it('should log BOOM message with damage and enemy count', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy1 = createMockEnemy({ id: 'enemy1', hp: 200 });
      const enemy2 = createMockEnemy({ id: 'enemy2', hp: 200 });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toContain('BOOM!');
      expect(player.idleRoom.encounter.lastActionLog).toContain('75 damage');
      expect(player.idleRoom.encounter.lastActionLog).toContain('2 enemies');
    });

    it('should log CRITICAL STRIKE message on crit', () => {
      const { computePlayerDamageWithCrit } =
        require('../../lib/ability-handlers');
      (computePlayerDamageWithCrit as jest.Mock).mockReturnValueOnce({
        damage: 100,
        isCrit: true,
      });

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({ hp: 300 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toContain(
        'CRITICAL STRIKE'
      );
      // Crit damage = 100 * 1.5 = 150
      expect(enemy.hp).toBe(150); // 300 - 150
    });
  });

  describe('Kill Processing', () => {
    beforeEach(() => {
      // Setup: Player has a damage grenade equipped
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'test_grenade',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        test_grenade: {
          weaponType: 'grenades',
          grenade: {
            damageCenter: 50,
            cooldownMs: 3000,
          },
        },
      };
    });

    it('should mark enemies as dead when HP reaches 0', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      // Enemy with 50 HP will die from 75 damage
      const enemy = createMockEnemy({ hp: 50, maxHp: 50 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(enemy.hp).toBe(0);
      expect(enemy.isDead).toBe(true);
    });

    it('should award score based on xpReward and leverage', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
        score: 0,
      });
      const enemy = createMockEnemy({ hp: 50, xpReward: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();
      room.state.leverageTotal = 2;

      processGrenade(room, 'session1', player);

      // Score = xpReward * leverage = 100 * 2 = 200
      expect(player.score).toBe(200);
    });

    it('should call queueScoreDelta on kill', () => {
      const { queueScoreDelta } = require('../XpScoreSystem');

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({ hp: 50, xpReward: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();
      room.state.leverageTotal = 2;

      processGrenade(room, 'session1', player);

      expect(queueScoreDelta).toHaveBeenCalledWith(room, 'session1', 200);
    });

    it('should call awardXpToPlayer on kill', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({
        hp: 50,
        xpReward: 100,
        imageId: 'goblin',
        classification: 'normal',
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(room.awardXpToPlayer).toHaveBeenCalledWith(
        'session1',
        100,
        expect.objectContaining({
          enemyId: enemy.id,
          enemyType: 'goblin',
          attackType: 'grenades',
          classification: 'normal',
        })
      );
    });

    it('should multiply XP by leverage when enabled', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({ hp: 50, xpReward: 50 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();
      room.state.leverageTotal = 3;

      processGrenade(room, 'session1', player);

      // XP = xpReward * leverage = 50 * 3 = 150
      expect(room.awardXpToPlayer).toHaveBeenCalledWith(
        'session1',
        150,
        expect.any(Object)
      );
    });

    it('should track kill count', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({
        hp: 50,
        imageId: 'goblin',
        name: 'Goblin Scout',
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      const killKey = 'goblin|Goblin Scout';
      expect(player.idleRoom.killCount.get(killKey)).toBe(1);
    });

    it('should increment kill count for subsequent kills', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      player.idleRoom.killCount.set('goblin|Goblin Scout', 5);
      const enemy = createMockEnemy({
        hp: 50,
        imageId: 'goblin',
        name: 'Goblin Scout',
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.killCount.get('goblin|Goblin Scout')).toBe(6);
    });

    it('should roll for loot on enemy death', () => {
      const { rollEnemyDrop } = require('../../data/loot-table');

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({ hp: 50 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(rollEnemyDrop).toHaveBeenCalled();
    });

    it('should roll boss drops when killing a boss', () => {
      const { rollBossDrops } = require('../../data/loot-table');

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({
        id: 'boss',
        hp: 50,
        classification: 'boss',
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(rollBossDrops).toHaveBeenCalled();
    });
  });

  describe('Stun Effect', () => {
    beforeEach(() => {
      // Setup: Player has a stun grenade equipped
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'coconut',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        coconut: {
          weaponType: 'grenades',
          grenade: {
            damageCenter: 50,
            cooldownMs: 3000,
          },
        },
      };
    });

    it('should apply stun when stun source is available', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2000 },
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy = createMockEnemy({ hp: 200, stunTurnsRemaining: 0 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // 2000ms = 2 turns
      expect(enemy.stunTurnsRemaining).toBe(2);
    });

    it('should convert ms duration to turns using ceiling', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 1500 }, // 1.5 seconds = 2 turns
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy = createMockEnemy({ hp: 200, stunTurnsRemaining: 0 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // ceil(1500 / 1000) = 2 turns
      expect(enemy.stunTurnsRemaining).toBe(2);
    });

    it('should refresh stun with longer duration', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 4000 },
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy = createMockEnemy({ hp: 200, stunTurnsRemaining: 2 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Should refresh to 4 turns (longer than current 2)
      expect(enemy.stunTurnsRemaining).toBe(4);
    });

    it('should NOT apply shorter stun duration', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 1000 },
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy = createMockEnemy({ hp: 200, stunTurnsRemaining: 5 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Should NOT overwrite with shorter duration
      expect(enemy.stunTurnsRemaining).toBe(5);
    });

    it('should NOT stun dead enemies', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2000 },
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      // Enemy will die from grenade damage (50 HP < 75 damage)
      const enemy = createMockEnemy({ hp: 50, stunTurnsRemaining: 0 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Dead enemy should not be stunned
      expect(enemy.isDead).toBe(true);
      expect(enemy.stunTurnsRemaining).toBe(0);
    });

    it('should log stun message when applied', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2000 },
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy = createMockEnemy({
        hp: 200,
        name: 'Goblin',
        stunTurnsRemaining: 0,
      });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toContain('STUNNED');
      expect(player.idleRoom.encounter.lastActionLog).toContain('Goblin');
      expect(player.idleRoom.encounter.lastActionLog).toContain('2 turns');
    });

    it('should respect stun chance (skip if chance fails)', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 0.5, durationMs: 2000 },
      ]);

      // Mock Math.random to return 0.8 (higher than 0.5 chance)
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.8);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy = createMockEnemy({ hp: 200, stunTurnsRemaining: 0 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Stun should not be applied (random 0.8 >= chance 0.5)
      expect(enemy.stunTurnsRemaining).toBe(0);

      Math.random = originalRandom;
    });

    it('should apply stun to all alive enemies', () => {
      const { getPlayerStun } = require('../../lib/ability-utils');
      (getPlayerStun as jest.Mock).mockReturnValueOnce([
        { chance: 1, durationMs: 2000 },
      ]);

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
      });
      const enemy1 = createMockEnemy({
        id: 'enemy1',
        hp: 200,
        stunTurnsRemaining: 0,
      });
      const enemy2 = createMockEnemy({
        id: 'enemy2',
        hp: 200,
        stunTurnsRemaining: 0,
      });
      player.idleRoom.encounter.enemies.push(enemy1, enemy2);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(enemy1.stunTurnsRemaining).toBe(2);
      expect(enemy2.stunTurnsRemaining).toBe(2);
    });
  });

  describe('Healing Grenades', () => {
    beforeEach(() => {
      // Setup: Player has a healing-only grenade equipped (milkshake)
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'milkshake',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        milkshake: {
          weaponType: 'grenades',
          grenade: {
            // No damage
            damageCenter: 0,
            damageEdge: 0,
            healingSplash: {
              healAmount: 50,
            },
            cooldownMs: 5000,
          },
        },
      };

      const wearablesMock = require('../../data/wearables');
      wearablesMock.getWearableBySlug.mockReturnValue({
        name: 'Milkshake',
        svgId: 'milkshake_svg',
      });
    });

    it('should heal player with healing splash grenade', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'milkshake' }]),
        hp: 50,
        maxHp: 100,
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy({ hp: 100 }));
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Should heal 50 HP
      expect(player.hp).toBe(100); // 50 + 50 = 100 (capped at max)
    });

    it('should NOT heal above max HP', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'milkshake' }]),
        hp: 80,
        maxHp: 100,
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy({ hp: 100 }));
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.hp).toBe(100); // Capped at maxHp
    });

    it('should NOT heal when already at full HP', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'milkshake' }]),
        hp: 100,
        maxHp: 100,
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy({ hp: 100 }));
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.hp).toBe(100);
      // Should not log heal message
      expect(player.idleRoom.encounter.lastActionLog).not.toContain('healed');
    });

    it('should log healing message with item name', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'milkshake' }]),
        hp: 50,
        maxHp: 100,
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy({ hp: 100 }));
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.encounter.lastActionLog).toContain('Milkshake');
      expect(player.idleRoom.encounter.lastActionLog).toContain('healed');
      expect(player.idleRoom.encounter.lastActionLog).toContain('50 HP');
    });

    it('should NOT deal damage with healing-only grenade', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'milkshake' }]),
        hp: 50,
        maxHp: 100,
      });
      const enemy = createMockEnemy({ hp: 100 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Enemy should not take damage
      expect(enemy.hp).toBe(100);
    });
  });

  describe('Hybrid Grenades (Damage + Healing)', () => {
    beforeEach(() => {
      // Setup: Player has a grenade that both damages and heals
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'hybrid_grenade',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        hybrid_grenade: {
          weaponType: 'grenades',
          grenade: {
            damageCenter: 50,
            damageEdge: 25,
            healingSplash: {
              healAmount: 30,
            },
            cooldownMs: 4000,
          },
        },
      };

      const wearablesMock = require('../../data/wearables');
      wearablesMock.getWearableBySlug.mockReturnValue({
        name: 'Hybrid Grenade',
        svgId: 'hybrid_svg',
      });
    });

    it('should both deal damage and heal player', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'hybrid_grenade' }]),
        hp: 50,
        maxHp: 100,
      });
      const enemy = createMockEnemy({ hp: 200 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Enemy should take damage (50 * 1.5 = 75)
      expect(enemy.hp).toBe(125); // 200 - 75
      // Player should be healed
      expect(player.hp).toBe(80); // 50 + 30
    });
  });

  describe('Cooldown Tracking', () => {
    beforeEach(() => {
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'test_grenade',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        test_grenade: {
          weaponType: 'grenades',
          grenade: {
            damageCenter: 50,
            cooldownMs: 3000,
          },
        },
      };
    });

    it('should set default 3-turn cooldown', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.grenadeCooldownRemaining).toBe(3);
    });

    it('should use cooldownMs from grenade definition', () => {
      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS.test_grenade.grenade.cooldownMs = 5000;

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // ceil(5000 / 1000) = 5 turns
      expect(player.idleRoom.grenadeCooldownRemaining).toBe(5);
    });

    it('should round up cooldown using ceiling', () => {
      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS.test_grenade.grenade.cooldownMs = 2500;

      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      player.idleRoom.encounter.enemies.push(createMockEnemy());
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // ceil(2500 / 1000) = 3 turns
      expect(player.idleRoom.grenadeCooldownRemaining).toBe(3);
    });
  });

  describe('Encounter Progress', () => {
    beforeEach(() => {
      const equipmentMock = require('../../lib/equipment-service');
      equipmentMock.deserializeStoredWearable.mockReturnValue({
        slug: 'test_grenade',
      });

      const weaponsMock = require('../../data/weapons');
      weaponsMock.WEAPON_DEFINITIONS = {
        test_grenade: {
          weaponType: 'grenades',
          grenade: {
            damageCenter: 50,
            cooldownMs: 3000,
          },
        },
      };
    });

    it('should update encounter progress after grenade', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      const enemy = createMockEnemy({ hp: 200, maxHp: 200 });
      player.idleRoom.encounter.enemies.push(enemy);
      player.idleRoom.encounter.progressMax = 200;
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      // Enemy took 75 damage, 125 HP remaining
      expect(player.idleRoom.encounter.progressCurrent).toBe(125);
    });

    it('should mark encounter complete when all enemies dead', () => {
      const player = createMockPlayer({
        equippedWearables: JSON.stringify([{ slug: 'test_grenade' }]),
      });
      // Enemy will die from 75 damage
      const enemy = createMockEnemy({ hp: 50 });
      player.idleRoom.encounter.enemies.push(enemy);
      const room = createMockRoom();

      processGrenade(room, 'session1', player);

      expect(player.idleRoom.encounter.isCompleted).toBe(true);
    });
  });
});

describe('getEquippedGrenadeSlug', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const weaponsMock = require('../../data/weapons');
    weaponsMock.WEAPON_DEFINITIONS = {
      coconut: { weaponType: 'grenades' },
      sword: { weaponType: 'melee' },
    };
  });

  it('should return null if no wearables equipped', () => {
    const player = createMockPlayer({ equippedWearables: '[]' });

    const result = getEquippedGrenadeSlug(player);

    expect(result).toBeNull();
  });

  it('should return null if invalid JSON', () => {
    const player = createMockPlayer({ equippedWearables: 'invalid json' });

    const result = getEquippedGrenadeSlug(player);

    expect(result).toBeNull();
  });

  it('should return grenade slug when equipped', () => {
    const equipmentMock = require('../../lib/equipment-service');
    equipmentMock.deserializeStoredWearable.mockReturnValue({ slug: 'coconut' });

    const player = createMockPlayer({
      equippedWearables: JSON.stringify([{ slug: 'coconut' }]),
    });

    const result = getEquippedGrenadeSlug(player);

    expect(result).toBe('coconut');
  });

  it('should return null if equipped item is not a grenade', () => {
    const equipmentMock = require('../../lib/equipment-service');
    equipmentMock.deserializeStoredWearable.mockReturnValue({ slug: 'sword' });

    const player = createMockPlayer({
      equippedWearables: JSON.stringify([{ slug: 'sword' }]),
    });

    const result = getEquippedGrenadeSlug(player);

    expect(result).toBeNull();
  });

  it('should find grenade even if not first in equipped list', () => {
    const equipmentMock = require('../../lib/equipment-service');
    equipmentMock.deserializeStoredWearable
      .mockReturnValueOnce({ slug: 'sword' }) // First item is sword
      .mockReturnValueOnce({ slug: 'coconut' }); // Second item is grenade

    const player = createMockPlayer({
      equippedWearables: JSON.stringify([
        { slug: 'sword' },
        { slug: 'coconut' },
      ]),
    });

    const result = getEquippedGrenadeSlug(player);

    expect(result).toBe('coconut');
  });
});
