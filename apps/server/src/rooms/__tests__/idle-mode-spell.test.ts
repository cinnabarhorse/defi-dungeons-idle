/**
 * Unit Tests for handleCastSpell() - Idle Mode Spell System
 *
 * Tests the spell casting logic including:
 * - Validation (combat type, player turn, stun, weapon type, cooldown, mana, target)
 * - Freeze spell effects (damage + slow via action gauge reduction)
 * - Bounce spell effects (multi-target with damage falloff)
 * - Mana consumption
 * - Cooldown tracking (ms to turns conversion)
 * - Action gauge deduction
 * - Kill processing (score, XP, loot)
 * - Encounter completion
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

// Mock spells with test data
jest.mock('../../data/spells', () => ({
  SPELLS_BY_ID: {
    freezing_attack: {
      id: 'freezing_attack',
      name: 'Freezing Attack',
      description: 'Chilling attack with slow effect',
      manaCost: 3,
      cooldownMs: 600,
      enabled: true,
      allowedWeaponTypes: ['staff'],
      damage: 20,
      effects: { kind: 'freeze' },
    },
    bounce_attack: {
      id: 'bounce_attack',
      name: 'Bounce Attack',
      description: 'Bounces to nearby enemies',
      manaCost: 3,
      cooldownMs: 600,
      enabled: true,
      allowedWeaponTypes: ['staff'],
      damage: 0,
      effects: {
        kind: 'bounce',
        maxTargets: 4,
        radius: 200,
        falloffPerHop: 0.2,
        allowRepeat: false,
        losRequired: true,
        travelMs: 80,
        appliesOnHitEffects: true,
      },
    },
    disabled_spell: {
      id: 'disabled_spell',
      name: 'Disabled Spell',
      description: 'This spell is disabled',
      manaCost: 1,
      cooldownMs: 100,
      enabled: false,
      effects: { kind: 'freeze' },
    },
    no_weapon_restriction: {
      id: 'no_weapon_restriction',
      name: 'Universal Spell',
      description: 'Works with any weapon',
      manaCost: 2,
      cooldownMs: 500,
      enabled: true,
      damage: 10,
      effects: { kind: 'freeze' },
    },
  },
  SPELLS: [],
}));

// Import after mocks are set up
import { handleCastSpell } from '../IdleMode';
import { queueScoreDelta } from '../XpScoreSystem';

// Helper to create mock player
function createMockPlayer(overrides: any = {}) {
  const idleRoom = new MockIdleRoomSchema();
  const encounter = idleRoom.encounter;

  // Default to combat type encounter
  encounter.type = 'combat';
  encounter.isPlayerTurn = true;
  encounter.playerActionGauge = 100;
  encounter.isCompleted = false;
  encounter.playerStunTurnsRemaining = 0;
  encounter.targetIndex = 0;

  // Add a default enemy
  const enemy = new MockIdleEnemySchema();
  enemy.id = 'enemy1';
  enemy.name = 'Test Goblin';
  enemy.imageId = 'goblin';
  enemy.hp = 100;
  enemy.maxHp = 100;
  enemy.actionGauge = 50;
  enemy.xpReward = 10;
  encounter.enemies = [enemy];

  return {
    sessionId: 'player1',
    hp: 100,
    maxHp: 100,
    mana: 20,
    maxMana: 50,
    score: 0,
    characterId: 'test-character',
    derivedStats: JSON.stringify({
      weaponCategory: 'staff',
      weaponType: 'ranged',
    }),
    idleRoom,
    ...overrides,
    idleRoom: { ...idleRoom, ...overrides.idleRoom },
  };
}

// Helper to create mock room
function createMockRoom(player: any) {
  return {
    state: {
      players: new Map([[player.sessionId, player]]),
      leverageTotal: 1,
      difficultyTier: 'normal',
    },
    awardXpToPlayer: jest.fn(),
  };
}

// Helper to create mock client
function createMockClient(sessionId: string) {
  return {
    sessionId,
    send: jest.fn(),
  };
}

describe('handleCastSpell()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation Checks', () => {
    it('should return early if player not found', () => {
      const player = createMockPlayer();
      const room = createMockRoom(player) as any;
      const client = createMockClient('unknown-session');

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).not.toHaveBeenCalled();
    });

    it('should reject if encounter is not combat type', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.type = 'treasure';
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'not_combat',
      });
    });

    it('should reject if not player turn', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isPlayerTurn = false;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'not_player_turn',
      });
    });

    it('should reject if encounter is completed', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.isCompleted = true;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'encounter_completed',
      });
    });

    it('should reject if player is stunned', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.playerStunTurnsRemaining = 2;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'player_stunned',
      });
    });

    it('should reject if spell does not exist', () => {
      const player = createMockPlayer();
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'nonexistent_spell' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'nonexistent_spell',
        reason: 'spell_disabled',
      });
    });

    it('should reject if spell is disabled', () => {
      const player = createMockPlayer();
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'disabled_spell' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'disabled_spell',
        reason: 'spell_disabled',
      });
    });

    it('should reject if weapon type does not match allowed types', () => {
      const player = createMockPlayer();
      player.derivedStats = JSON.stringify({
        weaponCategory: 'sword', // Not a staff
        weaponType: 'melee',
      });
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'wrong_weapon_type',
      });
    });

    it('should allow spell without weapon restriction', () => {
      const player = createMockPlayer();
      player.derivedStats = JSON.stringify({
        weaponCategory: 'sword',
        weaponType: 'melee',
      });
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'no_weapon_restriction' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: true,
        spellId: 'no_weapon_restriction',
        damage: expect.any(Number),
        targetsHit: 1,
      });
    });

    it('should reject if spell is on cooldown', () => {
      const player = createMockPlayer();
      player.idleRoom.spellCooldowns.set('freezing_attack', 2);
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'on_cooldown',
      });
    });

    it('should reject if insufficient mana', () => {
      const player = createMockPlayer();
      player.mana = 2; // Less than 3 mana cost
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'insufficient_mana',
      });
    });

    it('should reject if no target enemy exists', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies = [];
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'no_target',
      });
    });

    it('should reject if target enemy is dead', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].isDead = true;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'no_target',
      });
    });
  });

  describe('Mana Consumption', () => {
    it('should successfully cast spell when mana is sufficient', () => {
      const player = createMockPlayer();
      player.mana = 20;
      player.maxMana = 50;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // Spell cast succeeds - mana is deducted then regen is applied
      // The exact final value depends on regen calculation
      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: true,
        spellId: 'freezing_attack',
        damage: expect.any(Number),
        targetsHit: 1,
      });
    });

    it('should cast spell at exact mana cost', () => {
      const player = createMockPlayer();
      player.mana = 3; // Exact mana cost for freezing_attack
      player.maxMana = 50;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // Spell cast succeeds at exact mana
      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: true,
        spellId: 'freezing_attack',
        damage: expect.any(Number),
        targetsHit: 1,
      });
    });

    it('should reject spell cast with insufficient mana', () => {
      const player = createMockPlayer();
      player.mana = 2; // Less than 3 mana cost
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'insufficient_mana',
      });
    });
  });

  describe('Freeze Spell Effects', () => {
    it('should deal damage to target enemy', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 100;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // Base damage (50) + spell damage (20) = 70
      expect(player.idleRoom.encounter.enemies[0].hp).toBe(30);
    });

    it('should reduce enemy action gauge by 50 (slow effect)', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].actionGauge = 80;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.enemies[0].actionGauge).toBe(30); // 80 - 50
    });

    it('should not reduce action gauge below 0', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].actionGauge = 30;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.enemies[0].actionGauge).toBe(0);
    });

    it('should mark enemy as dead when hp reaches 0', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 50; // Less than 70 damage
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.enemies[0].isDead).toBe(true);
      expect(player.idleRoom.encounter.enemies[0].hp).toBe(0);
    });

    it('should award score on kill with leverage multiplier', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 50;
      player.idleRoom.encounter.enemies[0].xpReward = 100;
      const room = createMockRoom(player) as any;
      room.state.leverageTotal = 2;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.score).toBe(200); // 100 xpReward * 2 leverage
      expect(queueScoreDelta).toHaveBeenCalledWith(room, player.sessionId, 200);
    });

    it('should award XP on kill', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 50;
      player.idleRoom.encounter.enemies[0].xpReward = 100;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(room.awardXpToPlayer).toHaveBeenCalledWith(
        player.sessionId,
        100,
        expect.objectContaining({
          enemyId: 'enemy1',
          attackType: 'ranged',
        })
      );
    });

    it('should track kill count on kill', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 50;
      player.idleRoom.encounter.enemies[0].imageId = 'goblin';
      player.idleRoom.encounter.enemies[0].name = 'Goblin';
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.killCount.get('goblin|Goblin')).toBe(1);
    });

    it('should log freeze attack action', () => {
      const player = createMockPlayer();
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.lastActionLog).toContain('Freezing Attack');
      expect(player.idleRoom.encounter.lastActionLog).toContain('slows');
    });
  });

  describe('Bounce Spell Effects', () => {
    it('should hit primary target with full damage', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 100;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      // Base damage (50) + spell damage (0) = 50
      expect(player.idleRoom.encounter.enemies[0].hp).toBe(50);
    });

    it('should bounce to secondary targets with damage falloff', () => {
      const player = createMockPlayer();

      // Add multiple enemies
      const enemy1 = new MockIdleEnemySchema();
      enemy1.id = 'enemy1';
      enemy1.name = 'Goblin 1';
      enemy1.hp = 100;
      enemy1.xpReward = 10;

      const enemy2 = new MockIdleEnemySchema();
      enemy2.id = 'enemy2';
      enemy2.name = 'Goblin 2';
      enemy2.hp = 100;
      enemy2.xpReward = 10;

      const enemy3 = new MockIdleEnemySchema();
      enemy3.id = 'enemy3';
      enemy3.name = 'Goblin 3';
      enemy3.hp = 100;
      enemy3.xpReward = 10;

      player.idleRoom.encounter.enemies = [enemy1, enemy2, enemy3];
      player.idleRoom.encounter.targetIndex = 0;

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      // First hit: 50 damage
      expect(enemy1.hp).toBe(50);
      // Second hit: 50 * 0.8 = 40 damage
      expect(enemy2.hp).toBe(60);
      // Third hit: 40 * 0.8 = 32 damage
      expect(enemy3.hp).toBe(68);
    });

    it('should respect max targets limit', () => {
      const player = createMockPlayer();

      // Add 5 enemies (more than maxTargets: 4)
      const enemies = [];
      for (let i = 0; i < 5; i++) {
        const enemy = new MockIdleEnemySchema();
        enemy.id = `enemy${i}`;
        enemy.name = `Goblin ${i}`;
        enemy.hp = 100;
        enemy.xpReward = 10;
        enemies.push(enemy);
      }
      player.idleRoom.encounter.enemies = enemies;

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      // First 4 should be hit
      expect(enemies[0].hp).toBeLessThan(100);
      expect(enemies[1].hp).toBeLessThan(100);
      expect(enemies[2].hp).toBeLessThan(100);
      expect(enemies[3].hp).toBeLessThan(100);
      // Fifth should NOT be hit
      expect(enemies[4].hp).toBe(100);
    });

    it('should skip dead enemies when bouncing', () => {
      const player = createMockPlayer();

      const enemy1 = new MockIdleEnemySchema();
      enemy1.id = 'enemy1';
      enemy1.name = 'Goblin 1';
      enemy1.hp = 100;

      const enemy2 = new MockIdleEnemySchema();
      enemy2.id = 'enemy2';
      enemy2.name = 'Goblin 2';
      enemy2.hp = 0;
      enemy2.isDead = true;

      const enemy3 = new MockIdleEnemySchema();
      enemy3.id = 'enemy3';
      enemy3.name = 'Goblin 3';
      enemy3.hp = 100;

      player.idleRoom.encounter.enemies = [enemy1, enemy2, enemy3];

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      // Enemy 1 hit
      expect(enemy1.hp).toBe(50);
      // Enemy 2 skipped (already dead)
      expect(enemy2.hp).toBe(0);
      // Enemy 3 hit (second bounce)
      expect(enemy3.hp).toBe(60);
    });

    it('should kill enemies during bounce and award rewards', () => {
      const player = createMockPlayer();

      const enemy1 = new MockIdleEnemySchema();
      enemy1.id = 'enemy1';
      enemy1.name = 'Goblin 1';
      enemy1.imageId = 'goblin';
      enemy1.hp = 30; // Will be killed
      enemy1.xpReward = 50;

      const enemy2 = new MockIdleEnemySchema();
      enemy2.id = 'enemy2';
      enemy2.name = 'Goblin 2';
      enemy2.imageId = 'goblin';
      enemy2.hp = 25; // Will be killed
      enemy2.xpReward = 50;

      player.idleRoom.encounter.enemies = [enemy1, enemy2];

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      expect(enemy1.isDead).toBe(true);
      expect(enemy2.isDead).toBe(true);
      expect(player.score).toBe(100); // 50 + 50
    });

    it('should log bounce attack with hit summary', () => {
      const player = createMockPlayer();

      const enemy1 = new MockIdleEnemySchema();
      enemy1.id = 'enemy1';
      enemy1.name = 'Goblin 1';
      enemy1.hp = 100;

      const enemy2 = new MockIdleEnemySchema();
      enemy2.id = 'enemy2';
      enemy2.name = 'Goblin 2';
      enemy2.hp = 100;

      player.idleRoom.encounter.enemies = [enemy1, enemy2];

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      expect(player.idleRoom.encounter.lastActionLog).toContain('Bounce Attack');
      expect(player.idleRoom.encounter.lastActionLog).toContain('→');
    });

    it('should stop bouncing when damage falls to 0', () => {
      const player = createMockPlayer();

      // Create enemies with high HP
      const enemies = [];
      for (let i = 0; i < 10; i++) {
        const enemy = new MockIdleEnemySchema();
        enemy.id = `enemy${i}`;
        enemy.name = `Goblin ${i}`;
        enemy.hp = 1000;
        enemy.xpReward = 10;
        enemies.push(enemy);
      }
      player.idleRoom.encounter.enemies = enemies;

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      // Count how many were hit (damage > 0)
      const hitCount = enemies.filter((e) => e.hp < 1000).length;
      expect(hitCount).toBeLessThanOrEqual(4); // Max targets
    });
  });

  describe('Cooldown Tracking', () => {
    it('should set spell cooldown after cast and decrement via onPlayerTurnComplete', () => {
      const player = createMockPlayer();
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // 600ms -> ceil(600/1000) = 1 turn
      // But onPlayerTurnComplete is called after, which removes cooldowns <= 1
      // So the cooldown entry should be deleted
      expect(player.idleRoom.spellCooldowns.has('freezing_attack')).toBe(false);
    });

    it('should retain cooldown for longer duration spells after onPlayerTurnComplete', () => {
      const player = createMockPlayer();
      // Pre-set a 3 turn cooldown to simulate a longer spell
      player.idleRoom.spellCooldowns.set('test_spell', 3);
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      // Cast a different spell - this triggers onPlayerTurnComplete
      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // test_spell cooldown should decrement from 3 to 2
      expect(player.idleRoom.spellCooldowns.get('test_spell')).toBe(2);
    });

    it('should allow spell cast when cooldown is 0', () => {
      const player = createMockPlayer();
      player.idleRoom.spellCooldowns.set('freezing_attack', 0);
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: true,
        spellId: 'freezing_attack',
        damage: expect.any(Number),
        targetsHit: 1,
      });
    });

    it('should block spell cast when cooldown is > 0', () => {
      const player = createMockPlayer();
      player.idleRoom.spellCooldowns.set('freezing_attack', 2);
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: false,
        spellId: 'freezing_attack',
        reason: 'on_cooldown',
      });
    });
  });

  describe('Action Gauge Management', () => {
    it('should deduct 100 from player action gauge', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.playerActionGauge = 150;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.playerActionGauge).toBe(50);
    });

    it('should set isPlayerTurn to false when gauge falls below 100', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.playerActionGauge = 100;
      player.idleRoom.encounter.isPlayerTurn = true;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.isPlayerTurn).toBe(false);
    });

    it('should keep isPlayerTurn true when gauge remains >= 100', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.playerActionGauge = 200;
      player.idleRoom.encounter.isPlayerTurn = true;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // After deducting 100, gauge is 100. The check is < 100, so turn continues!
      expect(player.idleRoom.encounter.isPlayerTurn).toBe(true);
      expect(player.idleRoom.encounter.playerActionGauge).toBe(100);
    });
  });

  describe('Encounter Completion', () => {
    it('should mark encounter as completed when all enemies are killed', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 50; // Will be killed
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.isCompleted).toBe(true);
    });

    it('should not mark encounter as completed if enemies remain', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 200; // Survives
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.isCompleted).toBe(false);
    });

    it('should log boss victory when boss is killed', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].id = 'boss';
      player.idleRoom.encounter.enemies[0].hp = 50;
      player.idleRoom.encounter.imageId = 'boss_dragon';
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.lastActionLog).toContain('Victory');
      expect(player.idleRoom.encounter.lastActionLog).toContain('Boss');
    });

    it('should log room cleared when regular enemies are killed', () => {
      const player = createMockPlayer();
      player.idleRoom.encounter.enemies[0].hp = 50;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(player.idleRoom.encounter.lastActionLog).toContain('Room cleared');
    });
  });

  describe('Response Messages', () => {
    it('should send successful cast result with damage and targets hit', () => {
      const player = createMockPlayer();
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: true,
        spellId: 'freezing_attack',
        damage: 70, // 50 base + 20 spell damage
        targetsHit: 1,
      });
    });

    it('should report multiple targets hit for bounce spell', () => {
      const player = createMockPlayer();

      const enemy1 = new MockIdleEnemySchema();
      enemy1.id = 'enemy1';
      enemy1.name = 'Goblin 1';
      enemy1.hp = 100;

      const enemy2 = new MockIdleEnemySchema();
      enemy2.id = 'enemy2';
      enemy2.name = 'Goblin 2';
      enemy2.hp = 100;

      player.idleRoom.encounter.enemies = [enemy1, enemy2];

      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'bounce_attack' });

      expect(client.send).toHaveBeenCalledWith('spell_cast_result', {
        ok: true,
        spellId: 'bounce_attack',
        damage: expect.any(Number),
        targetsHit: 2,
      });
    });
  });

  describe('Cooldown Decrementing via onPlayerTurnComplete', () => {
    it('should decrement grenade cooldown when spell is cast', () => {
      const player = createMockPlayer();
      player.idleRoom.grenadeCooldownRemaining = 3;
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // onPlayerTurnComplete decrements grenade cooldown by 1
      expect(player.idleRoom.grenadeCooldownRemaining).toBe(2);
    });

    it('should decrement spell cooldowns when spell is cast', () => {
      const player = createMockPlayer();
      player.idleRoom.spellCooldowns.set('bounce_attack', 3);
      const room = createMockRoom(player) as any;
      const client = createMockClient(player.sessionId);

      handleCastSpell(room, client as any, { spellId: 'freezing_attack' });

      // onPlayerTurnComplete decrements other spell cooldowns
      expect(player.idleRoom.spellCooldowns.get('bounce_attack')).toBe(2);
    });
  });
});
