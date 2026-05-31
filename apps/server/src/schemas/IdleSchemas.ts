import { Schema, type, ArraySchema, MapSchema } from '@colyseus/schema';

export class IdleEnemySchema extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('string') imageId: string = '';
  @type('number') hp: number = 0;
  @type('number') maxHp: number = 0;
  @type('number') atk: number = 0;
  @type('number') attackRange: number = 32;
  @type('number') moveSpeed: number = 32;
  @type('number') attackSpeed: number = 100; // Base speed, 100 = 1 attack per turn cycle
  @type('number') actionGauge: number = 0; // Accumulates to 100 to take action
  @type('boolean') isDead: boolean = false;
  @type('number') xpReward: number = 0;
  @type('string') classification: string = 'normal'; // trash, elite, boss, normal

  // Special Abilities
  @type('string') specialState: string = 'idle'; // idle, charging, recovering
  @type('number') specialCooldown: number = 0; // Turns remaining until special can be used

  // Status Effects
  @type('number') stunTurnsRemaining: number = 0; // Turns remaining while stunned (skips actions)
}

export class IdleLootSchema extends Schema {
  @type('string') type: string = ''; // coin, potion, wearable, etc.
  @type('string') name: string = '';
  @type('number') quantity: number = 1;
  @type('string') rarity: string = '';
  @type('string') color: string = '';
  @type('string') wearableSlug: string = '';
  @type('string') quality: string = '';
  @type('number') durabilityScore: number = 0;
  @type('number') tokenAmount: number = 0; // For USDC/GHST token amounts
}

export class IdleEncounterSchema extends Schema {
  @type('string') id: string = ''; // Unique ID for the encounter instance
  @type('string') type: string = ''; // 'combat', 'treasure', 'shop', 'npc', 'rest', 'portal'

  // Visual/Flavor
  @type('string') name: string = ''; // "Goblin Scout", "Old Chest"
  @type('string') description: string = ''; // Flavor text
  @type('string') imageId: string = ''; // ID for client to render image

  // Turn-Based Combat State
  @type('boolean') isPlayerTurn: boolean = true;
  @type('number') playerActionGauge: number = 0; // Accumulates to 100 to take action
  @type('number') playerAttackSpeed: number = 100; // Base speed, 100 = 1 attack per turn cycle
  @type('string') lastActionLog: string = ''; // "Goblin attacks for 5 dmg!"

  // Progress State (Global encounter progress, e.g. total HP or main objective)
  @type('number') progressCurrent: number = 0;
  @type('number') progressMax: number = 100;
  @type('boolean') isCompleted: boolean = false;

  // Mob & Distance System
  @type([IdleEnemySchema]) enemies = new ArraySchema<IdleEnemySchema>();
  @type('number') targetIndex: number = 0;
  @type('number') distance: number = 32; // Pixels
  @type('number') playerAttackRange: number = 32; // From weapon

  // Loot System
  @type([IdleLootSchema]) loots = new ArraySchema<IdleLootSchema>();

  // Grenade System
  @type('number') grenadeCooldown: number = 0; // Turns remaining
  @type('number') grenadeMaxCooldown: number = 3; // Standard 3-turn cooldown

  // Player Status Effects
  @type('number') playerStunTurnsRemaining: number = 0; // Turns remaining while player is stunned

  // Legacy/Helpers (can be removed later or mapped)
  @type('string') enemyId: string = '';
  @type('number') enemyAtk: number = 0;
  @type('number') xpReward: number = 0;

  // Loot Specific (if type === 'treasure')
  @type('string') lootTableId: string = '';
}

export class IdleRoomSchema extends Schema {
  @type('string') roomId: string = ''; // "floor_1_room_5"
  @type(IdleEncounterSchema) encounter: IdleEncounterSchema =
    new IdleEncounterSchema();

  @type('boolean') isTransitioning: boolean = false;
  @type('boolean') speedRun: boolean = false; // Accelerated combat ticks
  @type('number') speedRunMultiplier: number = 20; // Combat tick speed boost
  @type('string') runStatus: string = 'active'; // 'active', 'dead', 'victory'
  @type('number') depth: number = 1;
  @type('number') maxDepthReached: number = 1;
  @type('number') difficultyFloor: number = 1;
  @type('number') roomsVisited: number = 1;
  @type('boolean') eliteSpawnedThisFloor: boolean = false;
  @type('boolean') treasureSpawnedThisFloor: boolean = false;
  @type('number') grenadeCooldownRemaining: number = 0; // Persistent across encounters
  @type('number') playerPoisonTurnsRemaining: number = 0; // Turns remaining while player is poisoned (persistent)
  @type('number') playerPoisonDamagePerTurn: number = 0; // Damage dealt each turn from poison (persistent)
  @type({ map: 'number' }) spellCooldowns = new MapSchema<number>();
  @type({ map: 'number' }) killCount = new MapSchema<number>();
  @type([IdleLootSchema]) lootsCollected = new ArraySchema<IdleLootSchema>();
  @type([IdleLootSchema]) tokenRewards = new ArraySchema<IdleLootSchema>(); // Separate tracking for USDC/GHST tokens
  @type('number') competitionMultiplier: number = 1.0; // Time-based multiplier for daily quest score

  // Run-collected potions: immediately usable but lost on death
  // These are separate from persistent inventory to enable instant use during the run
  @type('number') runHealthPotionsCollected: number = 0;
  @type('number') runManaPotionsCollected: number = 0;
  @type('number') runHealthPotionsCollectedTier1: number = 0;
  @type('number') runHealthPotionsCollectedTier2: number = 0;
  @type('number') runHealthPotionsCollectedTier3: number = 0;
  @type('number') runHealthPotionsUsed: number = 0;
  @type('number') runManaPotionsUsed: number = 0;
  @type('number') runHealthPotionsUsedTier1: number = 0;
  @type('number') runHealthPotionsUsedTier2: number = 0;
  @type('number') runHealthPotionsUsedTier3: number = 0;
  @type('number') persistentHealthPotionsUsed: number = 0;
  @type('number') persistentManaPotionsUsed: number = 0;
  @type('number') persistentHealthPotionsUsedTier1: number = 0;
  @type('number') persistentHealthPotionsUsedTier2: number = 0;
  @type('number') persistentHealthPotionsUsedTier3: number = 0;
  @type('string') lastKillingEnemyName: string = '';
  @type('number') lastKillingEnemyHpRemaining: number = -1;
  @type('number') lastKillingEnemyHpMax: number = -1;
  @type('number') lastKillingEnemyDamage: number = -1;
  @type('number') lastKillingPlayerHpRemaining: number = -1;

  // Competition Victory Chest (server authoritative)
  @type('string') victoryChestStatus: string = 'none'; // 'none' | 'available' | 'opened'
  @type('string') victoryChestGameId: string = '';
  @type('string') victoryChestRewardJson: string = '';
}
