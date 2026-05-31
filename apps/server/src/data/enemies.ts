/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Server Enemies Data - Generated from /data/enemies.ts
 * This file contains full enemy stats for gameplay and AI systems.
 *
 * To make changes, edit /data/enemies.ts and run: npm run generate:shared
 */

import { ENEMY_SPRITE_CONFIGS, getAnimationDuration } from './enemy-sprite-configs';

// Lightweight enemy info for client (map editor, type definitions)
export interface ClientEnemyInfo {
  enemyType: string;
  name: string;
  tags?: string[];
  /** Optional SFX key to play when this enemy dies */
  deathSound?: string;
}

// Full enemy stats for server (gameplay, AI, combat)
export interface EnemyStats {
  enemyType: string;
  name: string;
  health: number;
  maxHealth: number;
  damage: number;
  aggroRange: number;
  attackRange: number;
  speed: number;
  patrolRadius: number;
  attackType: 'melee' | 'ranged';
  projectileSpeed?: number;
  rangedAttackSpeed?: number;
  // Optional ranged burst/reload parameters (used by specific enemies like cactus)
  reloadDurationMs?: number;
  rangedMagazineSize?: number;
  guardType?: 'fortress' | 'entrance';
  animated?: boolean;
  spriteConfig?: {
    displayWidth: number;
    displayHeight: number;
    interactiveWidth: number;
    interactiveHeight: number;
  };
  /** Optional ability references imported from data/abilities */
  abilities?: Array<{ id: string; params?: Record<string, any> }>;
  /** Base XP value awarded before difficulty and party modifiers */
  baseXp: number;
  /** Approximate threat tier used for level-difference scaling (1 = trivial) */
  threatLevel: number;
  /** Optional classification for additional multipliers */
  classification?: 'trash' | 'elite' | 'boss';
  /** Optional semantic tags for ability interactions (e.g., 'lickquidator'). */
  tags?: string[];
  /** Optional SFX key to play when this enemy dies */
  deathSound?: string;
}

export interface EliteAbilityAssignment {
  id: string;
  params?: Record<string, number | string | boolean>;
}

export interface EliteArchetype {
  id: string;
  label: string;
  leaderEnemyTypeId: string;
  sizeMultiplier: number;
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  abilityIds: EliteAbilityAssignment[];
  minMinions: number;
  maxMinions: number;
  minionTypeIds: string[];
  spawnWeight: number;
  allowedRoomTiers: string[];
  allowedBiomes?: string[];
  visualTags: string[];
  rewardMultiplier: number;
  baseThreatWeight: number;
  auraColor?: string;
}

const LICKQUIDATOR_TAG = 'lickquidator';

function addLickquidatorTag<T extends { tags?: string[] }>(entry: T): T {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (tags.includes(LICKQUIDATOR_TAG)) return entry;
  return { ...entry, tags: [...tags, LICKQUIDATOR_TAG] };
}

function addLickquidatorTags<T extends { tags?: string[] }>(
  entries: Record<string, T>
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [
      key,
      addLickquidatorTag(value),
    ])
  ) as Record<string, T>;
}

// Enemy definitions - full data for server
const ENEMY_TYPES_BASE: Record<string, EnemyStats> = {
  rekt_doggo: {
    enemyType: 'rekt_doggo',
    name: 'RektDoggo',
    health: 50,
    maxHealth: 50,
    damage: 5,
    aggroRange: 100,
    attackRange: 28,
    speed: 1.4,
    patrolRadius: 45,
    attackType: 'melee',
    animated: true,
    baseXp: 160,
    threatLevel: 4,
    deathSound: 'dogbark',
    spriteConfig: {
      displayWidth: 96,
      displayHeight: 72,
      interactiveWidth: 80,
      interactiveHeight: 60,
    },
  },
  portal_guardian: {
    enemyType: 'portal_guardian',
    name: 'Portal Guardian',
    health: 1000,
    maxHealth: 1000,
    damage: 5,
    aggroRange: 2000,
    attackRange: 30,
    speed: 1.82,
    patrolRadius: 45,
    attackType: 'melee',
    abilities: [
      {
        id: 'bloodlust_charge',
        params: {
          powerupMs: 2400,
          recoveryMs: 0,
          cooldownMs: 9000,
          chargeSpeed: 11,
          chargeDamageMultiplier: 2,
          incomingDamageMultiplier: 2,
          hitRadius: 30,
          maxDashMs: 1400,
        },
      },
      {
        id: 'boss_charge_stun',
        params: {
          durationMs: 4000,
          chance: 1,
          damage: 20,
        },
      },
    ],
    animated: true,
    baseXp: 1200,
    threatLevel: 10,
    classification: 'boss',
    spriteConfig: {
      displayWidth: 96,
      displayHeight: 72,
      interactiveWidth: 80,
      interactiveHeight: 60,
    },
  },
  licky: {
    enemyType: 'licky',
    name: 'Licky',
    health: 30,
    maxHealth: 30,
    damage: 3,
    aggroRange: 90,
    attackRange: 32,
    speed: 1.6,
    patrolRadius: 50,
    attackType: 'melee',
    animated: true,
    baseXp: 90,
    threatLevel: 2,
    tags: ['lickquidator'],
    deathSound: 'lickdeath',
    spriteConfig: {
      displayWidth: 126,
      displayHeight: 77,
      interactiveWidth: 126,
      interactiveHeight: 77,
    },
  },
  slime: {
    enemyType: 'slime',
    name: 'Slime',
    health: 100,
    maxHealth: 100,
    damage: 3,
    aggroRange: 80,
    attackRange: 26,
    speed: 1.3,
    patrolRadius: 40,
    attackType: 'melee',
    abilities: [
      {
        id: 'poison',
        params: {
          chance: 0.25,
          durationMs: 5000,
          damagePerSecond: 3,
          tickIntervalMs: 1000,
          appliesTo: 'melee',
        },
      },
    ],
    animated: true,
    baseXp: 80,
    threatLevel: 1,
    deathSound: 'slimedeath',
    spriteConfig: {
      displayWidth: 57,
      displayHeight: 43,
      interactiveWidth: 57,
      interactiveHeight: 43,
    },
  },
  blue_slime: {
    enemyType: 'blue_slime',
    name: 'Blue Slime',
    health: 100,
    maxHealth: 100,
    damage: 3,
    aggroRange: 85,
    attackRange: 28,
    speed: 1.4,
    patrolRadius: 45,
    attackType: 'melee',
    abilities: [
      {
        id: 'slow',
        params: {
          amount: 0.25,
          durationMs: 3000,
          appliesTo: 'melee',
          chance: 1,
        },
      },
    ],
    animated: true,
    baseXp: 80,
    threatLevel: 1,
    deathSound: 'slimedeath',
    spriteConfig: {
      displayWidth: 92,
      displayHeight: 42,
      interactiveWidth: 92,
      interactiveHeight: 42,
    },
  },
  cactus: {
    enemyType: 'cactus',
    name: 'Cactus',
    health: 30,
    maxHealth: 30,
    damage: 2,
    aggroRange: 500,
    attackRange: 400,
    speed: 0,
    patrolRadius: 0,
    attackType: 'ranged',
    projectileSpeed: 500,
    rangedAttackSpeed: 750,
    reloadDurationMs: 3000,
    rangedMagazineSize: 8,
    animated: true,
    baseXp: 150,
    threatLevel: 3,
    deathSound: 'cactusdeath',

    spriteConfig: {
      displayWidth: 102,
      displayHeight: 59,
      interactiveWidth: 102,
      interactiveHeight: 59,
    },
  },
  base_dog: {
    enemyType: 'base_dog',
    name: 'Base Dog',
    health: 35,
    maxHealth: 35,
    damage: 3,
    aggroRange: 90,
    attackRange: 30,
    speed: 1.5,
    patrolRadius: 0,
    attackType: 'melee',
    animated: true,
    baseXp: 110,
    threatLevel: 3,
    deathSound: 'dogbark',
    spriteConfig: {
      displayWidth: 96,
      displayHeight: 72,
      interactiveWidth: 80,
      interactiveHeight: 60,
    },
  },
};

export const ENEMY_TYPES: Record<string, EnemyStats> =
  addLickquidatorTags(ENEMY_TYPES_BASE);

export const ELITE_ARCHETYPES: Record<string, EliteArchetype> = {
  bloodsworn_pack: {
    id: 'bloodsworn_pack',
    label: 'Bloodsworn Pack',
    leaderEnemyTypeId: 'base_dog',
    sizeMultiplier: 2.4,
    healthMultiplier: 3.2,
    damageMultiplier: 1.75,
    speedMultiplier: 1.15,
    abilityIds: [
      {
        id: 'life-steal',
        params: { percent: 0.12, maxPerHit: 35, appliesTo: 'melee' },
      },
      {
        id: 'evade',
        params: { chance: 0.18, cooldownMs: 3500 },
      },
      {
        id: 'elite_minion_aura',
        params: {
          radiusTiles: 4,
          attackSpeedMultiplier: 1.12,
          moveSpeedMultiplier: 1.1,
        },
      },
    ],
    minMinions: 8,
    maxMinions: 10,
    minionTypeIds: ['base_dog'],
    spawnWeight: 1,
    allowedRoomTiers: ['any'],
    allowedBiomes: ['dungeon'],
    visualTags: ['elite', 'aura:red'],
    rewardMultiplier: 1.5,
    baseThreatWeight: 4.5,
    auraColor: 'red',
  },
  wyrd_hunt: {
    id: 'wyrd_hunt',
    label: 'Wyrd Hunt',
    leaderEnemyTypeId: 'licky',
    sizeMultiplier: 2.1,
    healthMultiplier: 2.8,
    damageMultiplier: 1.6,
    speedMultiplier: 1.2,
    abilityIds: [
      {
        id: 'life-steal',
        params: { percent: 0.1, maxPerHit: 28, appliesTo: 'melee' },
      },
      {
        id: 'evade',
        params: { chance: 0.2, cooldownMs: 2800 },
      },
      {
        id: 'elite_minion_aura',
        params: {
          radiusTiles: 4,
          attackSpeedMultiplier: 1.08,
          damageMultiplier: 1.12,
        },
      },
    ],
    minMinions: 8,
    maxMinions: 10,
    minionTypeIds: ['licky'],
    spawnWeight: 1,
    allowedRoomTiers: ['any'],
    allowedBiomes: ['dungeon'],
    visualTags: ['elite', 'aura:green'],
    rewardMultiplier: 1.5,
    baseThreatWeight: 4.2,
    auraColor: 'green',
  },
  radiant_slime_coterie: {
    id: 'radiant_slime_coterie',
    label: 'Radiant Coterie',
    leaderEnemyTypeId: 'blue_slime',
    sizeMultiplier: 2.6,
    healthMultiplier: 3.4,
    damageMultiplier: 1.55,
    speedMultiplier: 1.05,
    abilityIds: [
      {
        id: 'life-steal',
        params: { percent: 0.09, maxPerHit: 24, appliesTo: 'melee' },
      },
      {
        id: 'evade',
        params: { chance: 0.15, cooldownMs: 3200 },
      },
      {
        id: 'elite_minion_aura',
        params: { radiusTiles: 5, damageReduction: 0.12, regenPerSecond: 6 },
      },
    ],
    minMinions: 8,
    maxMinions: 10,
    minionTypeIds: ['blue_slime'],
    spawnWeight: 0.75,
    allowedRoomTiers: ['any'],
    allowedBiomes: ['dungeon'],
    visualTags: ['elite', 'aura:blue'],
    rewardMultiplier: 1.6,
    baseThreatWeight: 4.8,
    auraColor: 'blue',
  },
  thunderborn_alpha: {
    id: 'thunderborn_alpha',
    label: 'Thunderborn Alpha',
    leaderEnemyTypeId: 'rekt_doggo',
    sizeMultiplier: 2.9,
    healthMultiplier: 3.6,
    damageMultiplier: 1.8,
    speedMultiplier: 1.1,
    abilityIds: [
      {
        id: 'life-steal',
        params: { percent: 0.11, maxPerHit: 32, appliesTo: 'melee' },
      },
      {
        id: 'evade',
        params: { chance: 0.17, cooldownMs: 3600 },
      },
      {
        id: 'elite_minion_aura',
        params: {
          radiusTiles: 4,
          moveSpeedMultiplier: 1.08,
          damageMultiplier: 1.1,
          attackSpeedMultiplier: 1.05,
        },
      },
    ],
    minMinions: 8,
    maxMinions: 10,
    minionTypeIds: ['rekt_doggo'],
    spawnWeight: 0.65,
    allowedRoomTiers: ['any'],
    allowedBiomes: ['dungeon'],
    visualTags: ['elite', 'aura:yellow'],
    rewardMultiplier: 1.65,
    baseThreatWeight: 5.2,
    auraColor: 'yellow',
  },
};

export const ELITE_ARCHETYPE_IDS = Object.keys(ELITE_ARCHETYPES);

// Elite leader name pools by enemy type
export const ELITE_NAME_CHOICES: Record<string, string[]> = {
  rekt_doggo: [
    'Rovan the Leashless',
    'Kessa the Muzzle-scarred',
    'Orin the Denless',
    'Ilven the Paw-torn',
    'Merek the Bone-bitten',
    'Tyren the Streetworn',
    'Jasko the Rust-bitten',
    'Thalen the Patchwork',
    'Edda the Scrapbound',
    'Vorik the Collar-cracked',
  ],
  base_dog: [
    'Cael the Unshaken',
    'Mira the Stone-true',
    'Rook the Grounded',
    'Sel the Unbothered',
    'Garran the Unfazed',
    'Ilan the Unmoved',
    'Petra the Steadfast',
    'Varo the Unapologetic',
    'Nessa the Clear-eyed',
    'Tovin the Iron-willed',
  ],
  blue_slime: [
    'Elor the Gelid',
    'Vessa the Luminant',
    'Torq the Amorphous',
    'Nyli the Viscous',
    'Brek the Iridescent',
    'Alune the Colloidal',
    'Draz the Fluorescent',
    'Mirel the Quivering',
    'Ovi the Translucent',
    'Khel the Dripping',
  ],
  licky: [
    'Kaelith the Slick-tongued',
    'Sava the Drool-slick',
    'Morin the Glossal',
    'Yressa the Mawsworn',
    'Dorek the Spittle-anointed',
    'Thali the Saliva-baptized',
    'Enro the Tongue-writhing',
    'Jass the Gulletbound',
    'Veira the Slaver-marked',
    'Pyrel the Unhallowed-tongued',
  ],
};

export function getRandomEliteNameForType(enemyType: string): string {
  const names = ELITE_NAME_CHOICES[enemyType] || [];
  if (!names.length) return 'Nameless the Unfathomed';
  return names[Math.floor(Math.random() * names.length)];
}




// Utility functions
export function getEnemyTypesList(): string[] {
  return Object.keys(ENEMY_TYPES);
}

export function getRandomEnemyType(): string {
  const types = getEnemyTypesList();
  return types[Math.floor(Math.random() * types.length)];
}


/**
 * Get enemy stats by type
 */
export function getEnemyStats(enemyType: string): EnemyStats {
  const stats = ENEMY_TYPES[enemyType];
  if (!stats) {
    console.warn(`Unknown enemy type: ${enemyType}, using slime as default`);
    return ENEMY_TYPES.slime;
  }
  return { ...stats };
}

/**
 * Calculate animation duration in milliseconds from sprite configs
 */
export function getEnemyAnimationDuration(enemyType: string, animationType: string): number {
  const spriteConfig = ENEMY_SPRITE_CONFIGS[enemyType];
  if (!spriteConfig) {
    return 500;
  }
  return getAnimationDuration(spriteConfig, animationType);
}

/**
 * Create enemy spawn data with position
 */
export function createEnemySpawn(
  enemyType: string,
  x: number,
  y: number,
  overrides?: Partial<EnemyStats> & Record<string, any>
) {
  const baseStats = getEnemyStats(enemyType);
  const finalStats = { ...baseStats, ...overrides };
  return {
    x,
    y,
    type: enemyType,
    stats: { ...finalStats, homeX: x, homeY: y, isGuarding: true },
  };
}

export interface EnemyType {
  type: string;
  stats: EnemyStats;
}