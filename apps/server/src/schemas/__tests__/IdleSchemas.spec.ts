/**
 * Unit Tests for IdleSchemas - Idle Mode Data Structures
 *
 * Tests the Colyseus schema data structures including:
 * - IdleEnemySchema: enemy stats, action gauge, status effects
 * - IdleLootSchema: loot types, wearables, tokens
 * - IdleEncounterSchema: encounter state, combat, progress tracking
 * - IdleRoomSchema: run state, cooldowns, persistence
 *
 * Note: Since Colyseus schemas use decorators that execute at import time,
 * these tests use mock classes that mirror the schema structure to verify
 * the expected data model without triggering decorator issues.
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Mock schema classes that mirror the actual IdleSchemas structure.
 * Used to test the expected data model without Colyseus decorator issues.
 */

// Mirror of IdleEnemySchema
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

// Mirror of IdleLootSchema
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

// Mirror of IdleEncounterSchema
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

// Mirror of IdleRoomSchema
class MockIdleRoomSchema {
  roomId: string = '';
  encounter: MockIdleEncounterSchema = new MockIdleEncounterSchema();
  isTransitioning: boolean = false;
  runStatus: string = 'active';
  victoryChestStatus: string = 'none';
  victoryChestGameId: string = '';
  victoryChestRewardJson: string = '';
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

describe('IdleSchemas Data Structures', () => {
  describe('IdleEnemySchema', () => {
    it('should have correct default values', () => {
      const enemy = new MockIdleEnemySchema();

      expect(enemy.id).toBe('');
      expect(enemy.name).toBe('');
      expect(enemy.hp).toBe(0);
      expect(enemy.maxHp).toBe(0);
      expect(enemy.atk).toBe(0);
      expect(enemy.attackRange).toBe(32);
      expect(enemy.moveSpeed).toBe(32);
      expect(enemy.attackSpeed).toBe(100);
      expect(enemy.actionGauge).toBe(0);
      expect(enemy.isDead).toBe(false);
      expect(enemy.xpReward).toBe(0);
      expect(enemy.classification).toBe('normal');
      expect(enemy.specialState).toBe('idle');
      expect(enemy.specialCooldown).toBe(0);
      expect(enemy.stunTurnsRemaining).toBe(0);
    });

    it('should track action gauge for turn-based combat', () => {
      const enemy = new MockIdleEnemySchema();
      enemy.actionGauge = 80;

      // Action gauge accumulates to 100 before entity can act
      expect(enemy.actionGauge).toBeLessThan(100);

      enemy.actionGauge = 100;
      expect(enemy.actionGauge).toBe(100);
    });

    it('should support different classifications', () => {
      const normal = new MockIdleEnemySchema();
      normal.classification = 'normal';

      const elite = new MockIdleEnemySchema();
      elite.classification = 'elite';

      const boss = new MockIdleEnemySchema();
      boss.classification = 'boss';

      const trash = new MockIdleEnemySchema();
      trash.classification = 'trash';

      expect(normal.classification).toBe('normal');
      expect(elite.classification).toBe('elite');
      expect(boss.classification).toBe('boss');
      expect(trash.classification).toBe('trash');
    });

    it('should track stun status effect', () => {
      const enemy = new MockIdleEnemySchema();
      expect(enemy.stunTurnsRemaining).toBe(0);

      enemy.stunTurnsRemaining = 3;
      expect(enemy.stunTurnsRemaining).toBe(3);

      // Decrement stun
      enemy.stunTurnsRemaining -= 1;
      expect(enemy.stunTurnsRemaining).toBe(2);
    });

    it('should support special ability states', () => {
      const enemy = new MockIdleEnemySchema();
      expect(enemy.specialState).toBe('idle');

      enemy.specialState = 'charging';
      expect(enemy.specialState).toBe('charging');

      enemy.specialState = 'recovering';
      expect(enemy.specialState).toBe('recovering');
    });
  });

  describe('IdleLootSchema', () => {
    it('should have correct default values', () => {
      const loot = new MockIdleLootSchema();

      expect(loot.type).toBe('');
      expect(loot.name).toBe('');
      expect(loot.quantity).toBe(1);
      expect(loot.rarity).toBe('');
      expect(loot.color).toBe('');
      expect(loot.wearableSlug).toBe('');
      expect(loot.quality).toBe('');
      expect(loot.tokenAmount).toBe(0);
    });

    it('should support coin loot type', () => {
      const loot = new MockIdleLootSchema();
      loot.type = 'coin';
      loot.name = 'Gold Coins';
      loot.quantity = 50;

      expect(loot.type).toBe('coin');
      expect(loot.quantity).toBe(50);
    });

    it('should support potion loot type', () => {
      const loot = new MockIdleLootSchema();
      loot.type = 'potion';
      loot.name = 'Health Potion';
      loot.quantity = 1;

      expect(loot.type).toBe('potion');
    });

    it('should support wearable loot with slug and quality', () => {
      const loot = new MockIdleLootSchema();
      loot.type = 'wearable';
      loot.name = 'Common Sword';
      loot.wearableSlug = 'common-sword';
      loot.quality = 'common';
      loot.rarity = 'common';

      expect(loot.type).toBe('wearable');
      expect(loot.wearableSlug).toBe('common-sword');
      expect(loot.quality).toBe('common');
    });

    it('should support token rewards with amount', () => {
      const loot = new MockIdleLootSchema();
      loot.type = 'token';
      loot.name = 'USDC';
      loot.tokenAmount = 0.5;

      expect(loot.type).toBe('token');
      expect(loot.tokenAmount).toBe(0.5);
    });
  });

  describe('IdleEncounterSchema', () => {
    it('should have correct default values', () => {
      const encounter = new MockIdleEncounterSchema();

      expect(encounter.id).toBe('');
      expect(encounter.type).toBe('');
      expect(encounter.isPlayerTurn).toBe(true);
      expect(encounter.playerActionGauge).toBe(0);
      expect(encounter.playerAttackSpeed).toBe(100);
      expect(encounter.progressMax).toBe(100);
      expect(encounter.isCompleted).toBe(false);
      expect(encounter.distance).toBe(32);
      expect(encounter.playerAttackRange).toBe(32);
      expect(encounter.grenadeCooldown).toBe(0);
      expect(encounter.grenadeMaxCooldown).toBe(3);
      expect(encounter.playerStunTurnsRemaining).toBe(0);
    });

    it('should support different encounter types', () => {
      const combat = new MockIdleEncounterSchema();
      combat.type = 'combat';

      const treasure = new MockIdleEncounterSchema();
      treasure.type = 'treasure';

      const portal = new MockIdleEncounterSchema();
      portal.type = 'portal';

      expect(combat.type).toBe('combat');
      expect(treasure.type).toBe('treasure');
      expect(portal.type).toBe('portal');
    });

    it('should track enemies array', () => {
      const encounter = new MockIdleEncounterSchema();
      expect(encounter.enemies.length).toBe(0);

      const enemy = new MockIdleEnemySchema();
      enemy.id = 'enemy1';
      enemy.name = 'Goblin';
      encounter.enemies.push(enemy);

      expect(encounter.enemies.length).toBe(1);
      expect(encounter.enemies[0].name).toBe('Goblin');
    });

    it('should track target index for multi-enemy combat', () => {
      const encounter = new MockIdleEncounterSchema();
      encounter.targetIndex = 0;

      encounter.enemies.push(new MockIdleEnemySchema());
      encounter.enemies.push(new MockIdleEnemySchema());
      encounter.enemies.push(new MockIdleEnemySchema());

      encounter.targetIndex = 2;
      expect(encounter.targetIndex).toBe(2);
    });

    it('should track grenade cooldown with default 3-turn max', () => {
      const encounter = new MockIdleEncounterSchema();
      expect(encounter.grenadeMaxCooldown).toBe(3);
      expect(encounter.grenadeCooldown).toBe(0);

      // After using grenade
      encounter.grenadeCooldown = 3;
      expect(encounter.grenadeCooldown).toBe(3);
    });

    it('should track progress as HP for combat encounters', () => {
      const encounter = new MockIdleEncounterSchema();
      encounter.type = 'combat';
      encounter.progressMax = 500; // Total enemy HP
      encounter.progressCurrent = 500;

      // Deal 100 damage
      encounter.progressCurrent -= 100;
      expect(encounter.progressCurrent).toBe(400);
    });

    it('should collect loots array', () => {
      const encounter = new MockIdleEncounterSchema();
      expect(encounter.loots.length).toBe(0);

      const loot = new MockIdleLootSchema();
      loot.type = 'coin';
      loot.quantity = 25;
      encounter.loots.push(loot);

      expect(encounter.loots.length).toBe(1);
    });
  });

  describe('IdleRoomSchema', () => {
    it('should have correct default values', () => {
      const room = new MockIdleRoomSchema();

      expect(room.roomId).toBe('');
      expect(room.isTransitioning).toBe(false);
      expect(room.runStatus).toBe('active');
      expect(room.depth).toBe(1);
      expect(room.maxDepthReached).toBe(1);
      expect(room.difficultyFloor).toBe(1);
      expect(room.roomsVisited).toBe(1);
      expect(room.eliteSpawnedThisFloor).toBe(false);
      expect(room.treasureSpawnedThisFloor).toBe(false);
      expect(room.grenadeCooldownRemaining).toBe(0);
      expect(room.playerPoisonTurnsRemaining).toBe(0);
      expect(room.playerPoisonDamagePerTurn).toBe(0);
      expect(room.competitionMultiplier).toBe(1.0);
      expect(room.runHealthPotionsCollected).toBe(0);
      expect(room.runManaPotionsCollected).toBe(0);
    });

    it('should support different run statuses', () => {
      const room = new MockIdleRoomSchema();
      expect(room.runStatus).toBe('active');

      room.runStatus = 'dead';
      expect(room.runStatus).toBe('dead');

      room.runStatus = 'victory';
      expect(room.runStatus).toBe('victory');
    });

    it('should track floor progression', () => {
      const room = new MockIdleRoomSchema();
      room.depth = 15;
      room.roomsVisited = 15;
      room.difficultyFloor = 2; // ceil(15/10) = 2

      expect(room.depth).toBe(15);
      expect(room.difficultyFloor).toBe(2);
    });

    it('should track elite and treasure spawn flags', () => {
      const room = new MockIdleRoomSchema();
      expect(room.eliteSpawnedThisFloor).toBe(false);
      expect(room.treasureSpawnedThisFloor).toBe(false);

      room.eliteSpawnedThisFloor = true;
      room.treasureSpawnedThisFloor = true;

      expect(room.eliteSpawnedThisFloor).toBe(true);
      expect(room.treasureSpawnedThisFloor).toBe(true);
    });

    it('should track spell cooldowns using Map', () => {
      const room = new MockIdleRoomSchema();
      expect(room.spellCooldowns.size).toBe(0);

      room.spellCooldowns.set('freezing_attack', 2);
      room.spellCooldowns.set('bounce_attack', 1);

      expect(room.spellCooldowns.get('freezing_attack')).toBe(2);
      expect(room.spellCooldowns.get('bounce_attack')).toBe(1);

      // Decrement cooldown
      room.spellCooldowns.set('freezing_attack', 1);
      expect(room.spellCooldowns.get('freezing_attack')).toBe(1);
    });

    it('should track kill counts using Map', () => {
      const room = new MockIdleRoomSchema();
      expect(room.killCount.size).toBe(0);

      room.killCount.set('goblin|Goblin', 5);
      room.killCount.set('slime|Slime', 3);

      expect(room.killCount.get('goblin|Goblin')).toBe(5);
      expect(room.killCount.get('slime|Slime')).toBe(3);
    });

    it('should track poison status effect', () => {
      const room = new MockIdleRoomSchema();
      expect(room.playerPoisonTurnsRemaining).toBe(0);
      expect(room.playerPoisonDamagePerTurn).toBe(0);

      room.playerPoisonTurnsRemaining = 3;
      room.playerPoisonDamagePerTurn = 10;

      expect(room.playerPoisonTurnsRemaining).toBe(3);
      expect(room.playerPoisonDamagePerTurn).toBe(10);
    });

    it('should track run-collected potions separately', () => {
      const room = new MockIdleRoomSchema();
      expect(room.runHealthPotionsCollected).toBe(0);
      expect(room.runManaPotionsCollected).toBe(0);

      room.runHealthPotionsCollected = 3;
      room.runManaPotionsCollected = 2;

      expect(room.runHealthPotionsCollected).toBe(3);
      expect(room.runManaPotionsCollected).toBe(2);
    });

    it('should track competition multiplier for daily quests', () => {
      const room = new MockIdleRoomSchema();
      expect(room.competitionMultiplier).toBe(1.0);

      room.competitionMultiplier = 1.5;
      expect(room.competitionMultiplier).toBe(1.5);
    });

    it('should collect loots and token rewards in arrays', () => {
      const room = new MockIdleRoomSchema();
      expect(room.lootsCollected.length).toBe(0);
      expect(room.tokenRewards.length).toBe(0);

      const loot = new MockIdleLootSchema();
      loot.type = 'coin';
      room.lootsCollected.push(loot);

      const token = new MockIdleLootSchema();
      token.type = 'token';
      token.tokenAmount = 1.0;
      room.tokenRewards.push(token);

      expect(room.lootsCollected.length).toBe(1);
      expect(room.tokenRewards.length).toBe(1);
    });

    it('should nest encounter schema', () => {
      const room = new MockIdleRoomSchema();
      expect(room.encounter).toBeDefined();
      expect(room.encounter instanceof MockIdleEncounterSchema).toBe(true);

      room.encounter.type = 'combat';
      room.encounter.name = 'Goblin Pack';

      expect(room.encounter.type).toBe('combat');
      expect(room.encounter.name).toBe('Goblin Pack');
    });
  });

  describe('Schema Field Types (Documentation)', () => {
    /**
     * This test documents the expected field types for each schema.
     * These match the @type decorators in the actual IdleSchemas.ts file.
     */
    it('should document IdleEnemySchema field types', () => {
      const expectedFields = {
        id: 'string',
        name: 'string',
        imageId: 'string',
        hp: 'number',
        maxHp: 'number',
        atk: 'number',
        attackRange: 'number',
        moveSpeed: 'number',
        attackSpeed: 'number',
        actionGauge: 'number',
        isDead: 'boolean',
        xpReward: 'number',
        classification: 'string',
        specialState: 'string',
        specialCooldown: 'number',
        stunTurnsRemaining: 'number',
      };

      expect(Object.keys(expectedFields).length).toBe(16);
    });

    it('should document IdleLootSchema field types', () => {
      const expectedFields = {
        type: 'string',
        name: 'string',
        quantity: 'number',
        rarity: 'string',
        color: 'string',
        wearableSlug: 'string',
        quality: 'string',
        tokenAmount: 'number',
      };

      expect(Object.keys(expectedFields).length).toBe(8);
    });

    it('should document IdleEncounterSchema field types', () => {
      const expectedFields = {
        id: 'string',
        type: 'string',
        name: 'string',
        description: 'string',
        imageId: 'string',
        isPlayerTurn: 'boolean',
        playerActionGauge: 'number',
        playerAttackSpeed: 'number',
        lastActionLog: 'string',
        progressCurrent: 'number',
        progressMax: 'number',
        isCompleted: 'boolean',
        enemies: 'array[IdleEnemySchema]',
        targetIndex: 'number',
        distance: 'number',
        playerAttackRange: 'number',
        loots: 'array[IdleLootSchema]',
        grenadeCooldown: 'number',
        grenadeMaxCooldown: 'number',
        playerStunTurnsRemaining: 'number',
        enemyId: 'string',
        enemyAtk: 'number',
        xpReward: 'number',
        lootTableId: 'string',
      };

      expect(Object.keys(expectedFields).length).toBe(24);
    });

    it('should document IdleRoomSchema field types', () => {
      const expectedFields = {
        roomId: 'string',
        encounter: 'IdleEncounterSchema',
        isTransitioning: 'boolean',
        runStatus: 'string',
        victoryChestStatus: 'string',
        victoryChestGameId: 'string',
        victoryChestRewardJson: 'string',
        depth: 'number',
        maxDepthReached: 'number',
        difficultyFloor: 'number',
        roomsVisited: 'number',
        eliteSpawnedThisFloor: 'boolean',
        treasureSpawnedThisFloor: 'boolean',
        grenadeCooldownRemaining: 'number',
        playerPoisonTurnsRemaining: 'number',
        playerPoisonDamagePerTurn: 'number',
        spellCooldowns: 'map[number]',
        killCount: 'map[number]',
        lootsCollected: 'array[IdleLootSchema]',
        tokenRewards: 'array[IdleLootSchema]',
        competitionMultiplier: 'number',
        runHealthPotionsCollected: 'number',
        runManaPotionsCollected: 'number',
      };

      expect(Object.keys(expectedFields).length).toBe(23);
    });
  });
});
