import {
  Schema,
  type,
  MapSchema,
  filter,
  filterChildren,
  ArraySchema,
} from '@colyseus/schema';
import type { Direction, Animation, EntityKind } from '../types';
import {
  IdleRoomSchema,
  IdleEncounterSchema,
  IdleLootSchema,
  IdleEnemySchema,
} from './IdleSchemas';
export { IdleRoomSchema, IdleEncounterSchema, IdleLootSchema, IdleEnemySchema };

export class BaseEntitySchema extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('string') dir: Direction = 'down';
  @type('string') anim: Animation = 'idle';
  @type('number') hp: number = 100;
  @type('number') maxHp: number = 100;
  @type('boolean') onRoad: boolean = false;
  @type('number') lastAttackTime: number = 0;
  @type('string') attackType: string = 'melee'; // 'melee' or 'ranged'
}

export class PlayerSchema extends BaseEntitySchema {
  @type('string') wallet: string = '';
  @type('string') avatarId: string = '';
  @type('string') characterId: string = ''; // Character sprite ID for multi-character support
  @type('number') lastMoveTime: number = 0;
  @type('boolean') isBot: boolean = false;
  @type('number') score: number = 0;
  @type('boolean') scoreEligible: boolean = true;
  @type('number') xp: number = 0;
  @type('number') level: number = 1;
  @type('number') xpIntoLevel: number = 0;
  @type('number') xpForNextLevel: number = 100;
  @type('number') mana: number = 0;
  @type('number') maxMana: number = 0;

  // Dev-only flag: when true (and NODE_ENV !== 'production'), the server
  // will ignore incoming damage for this player. Toggled via debug handlers.
  @type('boolean') devInvincible: boolean = false;

  // Pathfinding state
  @type('number') targetX: number = -1; // -1 means no target
  @type('number') targetY: number = -1;
  @type('boolean') isAutoWalking: boolean = false;
  @type('string') currentPath: string = ''; // JSON string of path nodes
  @type('number') pathIndex: number = 0; // Current step in path
  @type('number') repathCount: number = 0; // Counter to prevent infinite re-pathing
  @type('boolean') isSprinting: boolean = false; // Sprint state for pathfinding

  // Action system state (server-authoritative, client read-only)
  @type('string') currentAction: string = ''; // 'chop_tree', 'mine_stone', '' etc.
  @type('string') actionTarget: string = ''; // Target entity ID
  @type('number') actionStartTime: number = 0; // When action started
  @type('string') actionAnimation: string = ''; // Animation to play during action

  // Note: Inventory removed from shared state to prevent large payload issues
  // Server tracks inventory separately for auto-healing without broadcasting to all clients

  // Difficulty progression tracking
  @type('string') unlockedTiers: string = '["normal"]'; // JSON string of unlocked tier IDs
  @type('number') lickTongueCount: number = 0; // Cached count for quick access
  @type('number') healthPotionCount: number = 0;
  @type('number') manaPotionCount: number = 0;
  @type('string') equippedWearables: string = '[]';
  @type('string') derivedStats: string = '{}';
  @type('number') activeWeaponIndex: number = -1;

  // --- IDLE CONVERSION FIELDS ---
  @type(IdleRoomSchema) idleRoom: IdleRoomSchema = new IdleRoomSchema();
  @type('boolean') isAutoExploring: boolean = true;
  @type('number') autoAscendFloor: number = 3; // Default target floor is 3
  @type('boolean') dailyQuestActive: boolean = false;
  @type('boolean') usesRealGotchi: boolean = false;
  @type('string') tradeToken: string = 'BTC';
  @type('string') tradeDirection: string = 'long';
  @type('number') tradeLeverage: number = 1;
}

export class EntitySchema extends Schema {
  @type('string') id: string = '';
  @type('string') kind: EntityKind = 'obstacle';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('string') state: string = '{}'; // JSON string for flexibility
}

export class EnemySchema extends BaseEntitySchema {
  @type('number') moveTimer: number = 0;
  @type('number') nextMoveTime: number = 0;
  @type('number') targetX: number = 0;
  @type('number') targetY: number = 0;
  @type('boolean') isAttacking: boolean = false;
  @type('string') targetPlayerId: string = '';
  @type('number') aggroRange: number = 96; // Detection/aggro range
  @type('number') attackRange: number = 24; // Actual attack range
  @type('number') damage: number = 20; // Damage dealt by this enemy
  @type('number') projectileSpeed: number = 200; // Speed of projectiles for ranged enemies
  @type('number') rangedAttackSpeed: number = 2000; // Attack cooldown in milliseconds for ranged enemies
  @type('string') enemyType: string = ''; // Enemy type key for direct access
  @type('number') speed: number = 1.0; // Movement speed (0 for stationary enemies)
  @type('boolean') forcedAggro: boolean = false; // When true, enemy will aggro regardless of distance
  @type('string') aggroTargetPlayerId: string = ''; // Player who triggered forced aggro
  @type('boolean') isCharging: boolean = false; // When true, enemy is charging at increased speed after being hit
  @type('boolean') isElite: boolean = false;
  @type('string') eliteArchetypeId: string = '';
  @type('string') leaderId: string = '';
  @type('number') sizeMultiplier: number = 1;
  @type(['string']) visualTags = new ArraySchema<string>();
  @type('number') threatScore: number = 0;
  @type('number') rewardMultiplier: number = 1;

  @type('number') chargeEndTime: number = 0; // When the charging effect ends

  // Runtime-only (not encoded) animation scheduling fields
  // When now >= animUntil, the server should transition to postAnim and clear these
  animUntil: number = 0;
  postAnim: string = '';

  // Runtime-only (not encoded) precomputed ability modifiers
  // Sum of lifesteal percentages that apply to melee (includes 'all')
  lifeStealMeleePct: number = 0;

  // Runtime-only (not encoded) ranged reload/burst state and config
  // Applied to specific enemies like cactus during spawn
  reloadDurationMs: number = 0;
  rangedMagazineSize: number = 0;
  isReloading: boolean = false;
  reloadUntil: number = 0;
  shotsFiredInBurst: number = 0;

  constructor() {
    super();
    this.name = 'Enemy'; // Override default name for enemies
  }
}

export class ProjectileSchema extends Schema {
  @type('string') id: string = '';
  @type('string') ownerId: string = ''; // Player who fired it
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') velocityX: number = 0;
  @type('number') velocityY: number = 0;
  @type('number') damage: number = 10;
  @type('number') createdAt: number = 0;
  @type('boolean') exploding: boolean = false; // Flag for explosion animation
  @type('boolean') isCrit: boolean = false; // Whether this projectile crit on spawn
}

export class NPCSchema extends BaseEntitySchema {
  @type('string') characterId: string = ''; // Character sprite ID
  @type('string') dialogueId: string = ''; // Reference to dialogue JSON file
  @type('number') spawnTime: number = 0;
  @type('number') despawnTime: number = 0;
}

export class GameRoomState extends Schema {
  room?: any;

  attachRoom(room: any) {
    this.room = room;
  }

  @type('string') id: string = '';
  @type('string') roomCode: string = '';
  @type('string') hostSessionId: string = '';
  @type('number') seed: number = 0;
  @type('string') region: string = '';
  @type('string') difficultyTier: string = 'normal'; // Current difficulty tier for this room
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: EntitySchema }) entities = new MapSchema<EntitySchema>();
  @type({ map: EnemySchema })
  enemies = new MapSchema<EnemySchema>();
  @type({ map: NPCSchema })
  npcs = new MapSchema<NPCSchema>();
  @type({ map: ProjectileSchema })
  projectiles = new MapSchema<ProjectileSchema>();
  @type('string') phase: string = 'in_game';
  @type('number') countdownEndsAt: number = 0;
  @type('number') lateJoinCutoffAt: number = 0;
  @type('number') autoCloseAt: number = 0;
  @type('string') startedByPlayerId: string = '';
  @type('number') runStartedAt: number = 0;
  @type('number') startedAt: number = 0;
  @type('number') lastTick: number = 0;
  @type('number') currentFloor: number = 0;
  @type('number') floorReached: number = 0;
  @type('number') nextTimedSpawnAt: number = 0; // Unix ms for next timed spawn (0 = paused)

  @type('number') leverageTotal: number = 1;
  @type('number') floorLeverage: number = 1;
  @type('number') roomLeverage: number = 1;
  @type('boolean') floorLeverageLocked: boolean = false;
  @type('boolean') roomLeverageLocked: boolean = false;
  @type('number') floorLeverageSetAt: number = 0;
  @type('number') roomLeverageSetAt: number = 0;

  // Legacy Portal Guardian spawn tracking (no longer used)
  @type('number') totalEnemyKills: number = 0; // Total enemies defeated in this room

  // Runtime-only (not encoded) queues for scheduled tasks processed during ticks
  _scheduledEnemyRemovals?: Array<{ id: string; at: number; reason?: string }>;
  _scheduledEnemyFollowups?: Array<{
    at: number;
    kind: 'spawn_random';
    count?: number;
  }>;
  _scheduledSpellFollowups?: Array<{
    at: number;
    kind: 'spell_bounce';
    playerId: string;
    fromId: string;
    toId: string;
    hopIndex: number;
    damage: number;
    spellId: string;
    weaponType: 'melee' | 'ranged';
    appliesOnHitEffects?: boolean;
  }>;
}
