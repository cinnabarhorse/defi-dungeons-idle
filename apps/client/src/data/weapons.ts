/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Client Weapons Data - Generated from /data/weapons.ts
 * This file contains weapon types and definitions used by characters.
 *
 * To make changes, edit /data/weapons.ts and run: npm run generate:shared
 */

import {
  ABILITIES,
  type AbilityInstance,
  type AnyAbilityInstance,
  type HealingSplashParams,
} from './abilities';
import type { WearableSlot } from './wearables';

export type WeaponType = 'melee' | 'ranged' | 'grenades';

export type WeaponCategory =
  | 'sword'
  | 'axe'
  | 'hammer'
  | 'spear'
  | 'dagger'
  | 'claw'
  | 'exotic'
  | 'staff'
  | 'bow'
  | 'gun'
  | 'lasso'
  | 'frag'
  | 'heavy-frag'
  | 'heal-splash';

export type WeaponAbility = AnyAbilityInstance;

export interface GrenadeWeaponDefinition {
  blastRadiusPx: number;
  damageCenter: number;
  damageEdge: number;
  throwSpeedPxPerSec: number;
  maxRangePx?: number;
  cooldownMs: number;
  explodeOnImpact: boolean;
  fuseMs?: number;
  ammoPerUse: number;
  /** Optional mana cost to throw this grenade (default applied by rarity) */
  manaCost?: number;
  healingSplash?: HealingSplashParams;
}

export interface WeaponCategoryDefaults {
  damage?: number;
  damageRange?: { min: number; max: number };
  attackSpeed?: number;
  meleeAttackRange?: number;
  rangedAttackRange?: number;
  projectileSpeed?: number;
  /** Optional attack animation profile used for timing hit impacts */
  attackAnimProfile?: {
    totalFrames: number;
    impactFrameIndex: number;
    frameRateBase?: number;
  };
  /** Default abilities granted to all weapons in this category */
  abilities?: WeaponAbility[];
  grenade?: Partial<GrenadeWeaponDefinition>;
}

export const WEAPON_RARITY_MULTIPLIERS: Record<
  'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike',
  number
> = {
  common: 1,
  uncommon: 1.3,
  rare: 1.7,
  legendary: 2.3,
  mythical: 3.1,
  godlike: 4,
};

export const GRENADE_MANA_COST_BY_RARITY: Record<
  'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike',
  number
> = Object.freeze({
  common: 4,
  uncommon: 5,
  rare: 6,
  legendary: 8,
  mythical: 10,
  godlike: 12,
});

export const WEAPON_CATEGORY_DEFAULTS: Record<
  WeaponCategory,
  WeaponCategoryDefaults
> = {
  sword: {
    damageRange: { min: 12, max: 16 },
    attackSpeed: 650,
    meleeAttackRange: 130,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
  },
  axe: {
    damageRange: { min: 18, max: 26 },
    attackSpeed: 950,
    meleeAttackRange: 170,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
    abilities: [
      ABILITIES.cleave({
        appliesTo: 'melee',
      }),
    ].map(cloneAbilityInstance),
  },
  claw: {
    damageRange: { min: 18, max: 26 },
    attackSpeed: 450,
    meleeAttackRange: 70,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
  },
  hammer: {
    damageRange: { min: 20, max: 26 },
    attackSpeed: 1000,
    meleeAttackRange: 140,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
    abilities: [
      ABILITIES.stun({
        chance: 0.2,
        durationMs: 1250,
        appliesTo: 'melee',
        sourceId: 'hammer-category',
      }),
    ].map(cloneAbilityInstance),
  },
  spear: {
    damageRange: { min: 8, max: 12 },
    attackSpeed: 650,
    meleeAttackRange: 180,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
  },
  dagger: {
    damageRange: { min: 14, max: 18 },
    attackSpeed: 500,
    meleeAttackRange: 90,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
  },

  exotic: {
    damageRange: { min: 12, max: 18 },
    attackSpeed: 700,
    meleeAttackRange: 120,
    attackAnimProfile: {
      totalFrames: 6,
      impactFrameIndex: 2,
      frameRateBase: 12,
    },
  },
  staff: {
    damageRange: { min: 10, max: 14 },
    attackSpeed: 600,
    rangedAttackRange: 400,
    projectileSpeed: 1000,
    attackAnimProfile: {
      totalFrames: 3,
      impactFrameIndex: 1,
      frameRateBase: 12,
    },
  },
  bow: {
    damageRange: { min: 10, max: 14 },
    attackSpeed: 600,
    rangedAttackRange: 600,
    projectileSpeed: 900,
    attackAnimProfile: {
      totalFrames: 3,
      impactFrameIndex: 1,
      frameRateBase: 12,
    },
  },
  gun: {
    damageRange: { min: 12, max: 16 },
    attackSpeed: 500,
    rangedAttackRange: 600,
    projectileSpeed: 900,
    attackAnimProfile: {
      totalFrames: 3,
      impactFrameIndex: 1,
      frameRateBase: 12,
    },
    abilities: [
      ABILITIES.criticalStrike({
        chance: 0.08,
        multiplier: 2,
        appliesTo: 'ranged',
      }),
    ].map(cloneAbilityInstance),
  },
  lasso: {
    damageRange: { min: 6, max: 8 },
    attackSpeed: 900,
    rangedAttackRange: 350,
    projectileSpeed: 900,
    attackAnimProfile: {
      totalFrames: 3,
      impactFrameIndex: 1,
      frameRateBase: 12,
    },
  },
  frag: {
    grenade: {
      blastRadiusPx: 96,
      damageCenter: 80,
      damageEdge: 20,
      cooldownMs: 1500,
    },
  },
  'heavy-frag': {
    grenade: {
      blastRadiusPx: 112,
      damageCenter: 100,
      damageEdge: 30,
      cooldownMs: 1800,
    },
  },
  'heal-splash': {
    grenade: {
      blastRadiusPx: 110,
      damageCenter: 0,
      damageEdge: 0,
      cooldownMs: 10000,
      healingSplash: {
        radius: 110,
        healAmount: 80,
        cooldownMs: 10000,
        affectsSelf: true,
        alliesOnly: true,
      },
    },
  },
};

export interface WeaponAuthoringDefinition {
  aavegotchiId?: number;
  weaponType: WeaponType;
  weaponCategory: WeaponCategory;
  itemType?: string;
  damage?: number;
  damageRange?: { min: number; max: number };
  totalDamage?: number;
  attackSpeed?: number;
  meleeAttackRange?: number;
  rangedAttackRange?: number;
  projectileSpeed?: number;
  /** Optional attack animation profile used for timing hit impacts */
  attackAnimProfile?: {
    totalFrames: number;
    impactFrameIndex: number;
    frameRateBase?: number;
  };
  abilities?: WeaponAbility[];
  slots?: WearableSlot[];
  grenade?: GrenadeWeaponDefinition;
}

export interface WeaponProfile {
  slug: string;
  id: number;
  name: string;
  aavegotchiId?: number;
  weaponType: WeaponType;
  itemType?: string;
  damage?: number;
  damageRange?: { min: number; max: number };
  totalDamage?: number;
  attackSpeed?: number;
  weaponCategory: WeaponCategory;
  meleeAttackRange?: number;
  rangedAttackRange?: number;
  projectileSpeed?: number;
  /** Optional attack animation profile used for timing hit impacts */
  attackAnimProfile?: {
    totalFrames: number;
    impactFrameIndex: number;
    frameRateBase?: number;
  };
  abilities: WeaponAbility[];
  grenade?: GrenadeWeaponDefinition;
}

export function cloneAbilityInstance<T extends AbilityInstance<any>>(
  ability: T
): T {
  return {
    ...ability,
    params:
      ability.params && typeof ability.params === 'object'
        ? { ...(ability.params as Record<string, any>) }
        : ability.params,
  } as T;
}

function makeGrenadeForCategory(
  category: WeaponCategory,
  overrides: Partial<GrenadeWeaponDefinition> = {}
): GrenadeWeaponDefinition {
  const globalBase: GrenadeWeaponDefinition = {
    blastRadiusPx: 80,
    damageCenter: 60,
    damageEdge: 15,
    throwSpeedPxPerSec: 1000,
    maxRangePx: 1000,
    cooldownMs: 3000,
    explodeOnImpact: true,
    fuseMs: 0,
    ammoPerUse: 1,
    healingSplash: undefined,
  };

  const categoryDefaults =
    (WEAPON_CATEGORY_DEFAULTS[category]?.grenade as
      | Partial<GrenadeWeaponDefinition>
      | undefined) ?? {};

  const categoryHealing = categoryDefaults.healingSplash;
  const overrideHealing = overrides.healingSplash;
  const mergedHealing =
    overrideHealing && categoryHealing
      ? { ...categoryHealing, ...overrideHealing }
      : (overrideHealing ?? categoryHealing);

  return {
    ...globalBase,
    ...categoryDefaults,
    ...overrides,
    healingSplash: mergedHealing,
  } as GrenadeWeaponDefinition;
}

export const WEAPON_DEFINITIONS: Record<string, WeaponAuthoringDefinition> = {
  'aagent-pistol': {
    weaponType: 'ranged',
    weaponCategory: 'gun',
  },
  // Basic bow found in wearables: "Bow and Arrow"
  'bow-and-arrow': {
    weaponType: 'ranged',
    weaponCategory: 'bow',
  },
  // Longbow wearable
  longbow: {
    weaponType: 'ranged',
    weaponCategory: 'bow',
  },
  // Lasso ranged utility
  lasso: {
    weaponType: 'ranged',
    weaponCategory: 'lasso',
  },
  // Melee wearables
  'thaave-hammer': {
    weaponType: 'melee',
    weaponCategory: 'hammer',
  },
  'energy-gun': {
    weaponType: 'ranged',
    weaponCategory: 'gun',
  },
  'nail-gun': {
    weaponType: 'ranged',
    weaponCategory: 'gun',
  },
  'legendary-wizard-staff': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'royal-scepter': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'paint-brush': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'staff-of-creation': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'staff-of-charming': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'geode-smasher': {
    weaponType: 'melee',
    weaponCategory: 'hammer',
  },
  'dao-egg': {
    weaponType: 'grenades',
    weaponCategory: 'heal-splash',
    grenade: makeGrenadeForCategory('heal-splash', {
      blastRadiusPx: 120,
      healingSplash: {
        radius: 120,
        healAmount: 110,
        cooldownMs: 10000,
        affectsSelf: true,
        alliesOnly: true,
      },
    }),
  },
  'uranium-rod': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag', {
      throwSpeedPxPerSec: 900,
    }),
  },
  handsaw: {
    weaponType: 'melee',
    weaponCategory: 'axe',
  },
  'sushi-knife': {
    weaponType: 'melee',
    weaponCategory: 'dagger',
  },
  pickaxe: {
    weaponType: 'melee',
    weaponCategory: 'axe',
  },
  parasol: {
    weaponType: 'melee',
    weaponCategory: 'spear',
  },
  'portal-mage-axe': {
    weaponType: 'melee',
    weaponCategory: 'axe',
  },
  'portal-mage-black-axe': {
    weaponType: 'melee',
    weaponCategory: 'axe',
  },
  'mechanical-claw': {
    weaponType: 'melee',
    weaponCategory: 'claw',
  },
  'hook-hand': {
    weaponType: 'melee',
    weaponCategory: 'claw',
  },
  'up-arrow': {
    weaponType: 'melee',
    weaponCategory: 'spear',
  },
  'bitcoin-guitar': {
    weaponType: 'melee',
    weaponCategory: 'hammer',
  },
  'spirit-sword': {
    weaponType: 'melee',
    weaponCategory: 'sword',
  },
  'common-wizard-staff': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'paper-fan': {
    weaponType: 'melee',
    weaponCategory: 'claw',
  },
  'witchy-wand': {
    weaponType: 'ranged',
    weaponCategory: 'staff',
  },
  'lick-tentacle': {
    weaponType: 'melee',
    weaponCategory: 'exotic',
    abilities: [ABILITIES.tongueFarm({ bonusChance: 0.05 })].map(
      cloneAbilityInstance
    ),
  },

  pitchfork: {
    weaponType: 'melee',
    weaponCategory: 'spear',
    abilities: [
      ABILITIES.potionFarm({
        mode: 'both',
        potionWeightMultiplier: 2.5,
        extraPotionRollChance: 0.03,
        maxExtraChanceCap: 0.15,
        hpToManaBias: 0.5,
      }),
    ].map(cloneAbilityInstance),
  },
  'haanzo-katana': {
    aavegotchiId: 315,

    weaponType: 'melee',
    weaponCategory: 'sword',
    abilities: [
      ABILITIES.lifeSteal({ percent: 0.05, appliesTo: 'melee' }),
      ABILITIES.criticalStrike({
        chance: 0.1,
        multiplier: 2,
        appliesTo: 'all',
      }),
      ABILITIES.cleave({
        maxTargets: 3,
        damageMultiplier: 1,
        appliesTo: 'melee',
        includeBreakables: true,
      }),
    ].map(cloneAbilityInstance),
    slots: ['handRight'],
  },
  'doublesided-axe': {
    aavegotchiId: 296,

    weaponType: 'melee',
    weaponCategory: 'axe',
    slots: ['handRight'],
  },
  'mk2-grenade': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag', {
      throwSpeedPxPerSec: 900,
    }),
    slots: ['handLeft', 'handRight'],
  },
  'm67-grenade': {
    weaponType: 'grenades',
    weaponCategory: 'heavy-frag',
    grenade: makeGrenadeForCategory('heavy-frag', {
      throwSpeedPxPerSec: 850,
    }),
    slots: ['handLeft', 'handRight'],
  },
  'link-bubbly': {
    weaponType: 'grenades',
    weaponCategory: 'heal-splash',
    grenade: makeGrenadeForCategory('heal-splash', {
      blastRadiusPx: 100,
      healingSplash: {
        radius: 100,
        healAmount: 60,
        cooldownMs: 10000,
        affectsSelf: true,
        alliesOnly: true,
      },
    }),
    slots: ['handLeft', 'handRight'],
  },
  'link-cube': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'mudgen-diamond': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'sushi-piece': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'bedtime-milk': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'water-bottle': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  coconut: {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    abilities: [
      ABILITIES.stun({
        chance: 0.2,
        durationMs: 1250,
        appliesTo: 'grenades',
        sourceId: 'coconut',
      }),
    ].map(cloneAbilityInstance),
    slots: ['handLeft', 'handRight'],
  },
  'water-jug': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'baby-bottle': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  martini: {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  wine: {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  milkshake: {
    weaponType: 'grenades',
    weaponCategory: 'heal-splash',
    grenade: makeGrenadeForCategory('heal-splash', {
      blastRadiusPx: 120,
      healingSplash: {
        radius: 120,
        healAmount: 110,
        cooldownMs: 10000,
        affectsSelf: true,
        alliesOnly: true,
      },
    }),
    slots: ['handLeft', 'handRight'],
  },
  'apple-juice': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  fireball: {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'lil-pump-drank': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'gotchi-mug': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  basketball: {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    abilities: [
      ABILITIES.stun({
        chance: 0.2,
        durationMs: 1250,
        appliesTo: 'grenades',
        sourceId: 'basketball',
      }),
    ].map(cloneAbilityInstance),
    slots: ['handLeft', 'handRight'],
  },
  'candy-jaar': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'gm-seeds': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
  'baable-gum': {
    weaponType: 'grenades',
    weaponCategory: 'frag',
    grenade: makeGrenadeForCategory('frag'),
    slots: ['handLeft', 'handRight'],
  },
};
