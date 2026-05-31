/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Client Enemies Data - Generated from /data/enemies.ts
 * This file contains lightweight enemy info for map editor and type definitions.
 *
 * To make changes, edit /data/enemies.ts and run: npm run generate:shared
 */

// Lightweight enemy info for client (map editor, type definitions)
export interface ClientEnemyInfo {
  enemyType: string;
  name: string;
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

// Client-only lightweight data
const ENEMY_TYPES_BASE: Record<string, ClientEnemyInfo> = {
  rekt_doggo: {
    enemyType: 'rekt_doggo',
    name: 'RektDoggo',
    deathSound: 'dogbark',
  },
  portal_guardian: { enemyType: 'portal_guardian', name: 'Portal Guardian' },
  licky: { enemyType: 'licky', name: 'Licky', deathSound: 'lickdeath' },
  slime: { enemyType: 'slime', name: 'Slime', deathSound: 'slimedeath' },
  blue_slime: {
    enemyType: 'blue_slime',
    name: 'Blue Slime',
    deathSound: 'slimedeath',
  },
  cactus: { enemyType: 'cactus', name: 'Cactus', deathSound: 'cactusdeath' },
  base_dog: { enemyType: 'base_dog', name: 'Base Dog', deathSound: 'dogbark' },
};

export const ENEMY_TYPES: Record<string, ClientEnemyInfo> =
  addLickquidatorTags(ENEMY_TYPES_BASE);

// Utility functions
export function getEnemyTypesList(): string[] {
  return Object.keys(ENEMY_TYPES);
}

export function getRandomEnemyType(): string {
  const types = getEnemyTypesList();
  return types[Math.floor(Math.random() * types.length)];
}
