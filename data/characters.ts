/**
 * Shared Character Data - Single Source of Truth
 * This file contains all character definitions used by both client and server
 */

import {
  aggregateEquipmentStats,
  aggregateEquipmentStatsWithQuality,
  type AggregatedModifier,
  type EquipmentStat,
  type WearableSlot,
  type EquippedWearableWithQuality,
  slugifyWearableName,
} from './wearables';
import {
  type WeaponAbility,
  type WeaponCategory,
  type WeaponProfile,
  type WeaponType,
  type GrenadeWeaponDefinition,
} from './weapons';
import {
  DEFAULT_QUALITY_TIER,
  normalizeQualityTier,
  type QualityTier,
} from './wearable-quality';

export interface AbilityReference {
  id: string;
  kind?: WeaponAbility['kind'];
  params?: Record<string, any>;
}

export interface EquippedWeaponSummary {
  slug: string;
  id: number;
  name: string;
  aavegotchiId?: number;
  weaponType: WeaponType;
  weaponCategory: WeaponCategory;
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
  abilities: AbilityReference[];
  grenade?: GrenadeWeaponDefinition;
}

export interface CharacterStats {
  meleeAttackRange?: number; // Custom melee attack range (default: 80px)
  rangedAttackRange?: number; // Custom ranged attack range (default: 110px)
  damage?: number; // Custom damage (default: 10)
  /** Optional per-hit base damage range (inclusive). If set, overrides damage. */
  damageRange?: { min: number; max: number };
  /** Optional scalar applied after flat damage adjustments (default: 1). */
  totalDamage?: number;
  attackSpeed?: number; // Custom attack interval (default: 1000ms)
  weaponType?: WeaponType; // Custom weapon type (default: 'melee')
  weaponCategory?: WeaponCategory; // Custom weapon category (default: 'sword')
  projectileSpeed?: number; // Custom projectile speed (default: 200 pixels/second)
  /** Optional visual-only playback scale multipliers (do not alter timings or projectile speed) */
  attackVisualScale?: number; // melee attack clip visual speed multiplier (default 1)
  attackRangedVisualScale?: number; // ranged attack clip visual speed multiplier (default 1)
  /** Optional base max health override before equipment */
  maxHealth?: number;
  /** Optional unified armor stat (A units) */
  armor?: number;
  /** @deprecated Legacy flat damage reduction applied before percent modifiers */
  flatDamageReduction?: number;
  /** @deprecated Legacy percent-based damage reduction (0.1 = 10%) */
  percentDamageReduction?: number;
  /** Optional movement speed multiplier (1 = baseline) */
  movementSpeed?: number;
}

export type EquipmentSlotMap = Partial<
  Record<
    | 'head'
    | 'body'
    | 'face'
    | 'eyes'
    | 'handLeft'
    | 'handRight'
    | 'pet'
    | 'background',
    string
  >
>;

type CharacterEquipmentSlot = Exclude<WearableSlot, 'none'>;

const CHARACTER_EQUIPMENT_SLOT_ORDER: CharacterEquipmentSlot[] = [
  'head',
  'body',
  'face',
  'eyes',
  'handLeft',
  'handRight',
  'pet',
  'background',
];

const CHARACTER_EQUIPMENT_SLOT_SET = new Set<WearableSlot>([
  ...CHARACTER_EQUIPMENT_SLOT_ORDER,
  'none',
]);

function isEquipmentSlotName(value: unknown): value is WearableSlot {
  return (
    typeof value === 'string' &&
    CHARACTER_EQUIPMENT_SLOT_SET.has(value as WearableSlot)
  );
}

export interface CharacterInfo {
  id: string;
  name: string;
  description: string;
  theme: string;
  tier: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  stats?: CharacterStats; // Optional character-specific stats
  characterClass?: string; // RPG class (Rogue, Mage, etc.)
  spriteName?: string; // Sprite file name override (without .png extension)
  /** Optional ability references imported from data/abilities */
  abilities?: AbilityReference[];
  /** Optional equipped wearables mapped to slots */
  equippedWearables?: EquipmentSlotMap;
  unlockCost: number;
  /** If false, character exists for NPC/cutscene only and is not selectable */
  isPlayable?: boolean;
}

export interface CharacterEquipmentItemSummary {
  slug: string;
  id: number;
  slot: WearableSlot;
  quality: QualityTier;
  qualityScalar: number;
}

export interface CharacterEquipmentSummary {
  slugs: string[];
  items: CharacterEquipmentItemSummary[];
  modifiers: ReturnType<typeof aggregateEquipmentStatsWithQuality>['modifiers'];
  missing: string[];
}

export type CharacterDerivedStats = Required<
  Omit<CharacterStats, 'flatDamageReduction' | 'percentDamageReduction'>
> & {
  equipment: CharacterEquipmentSummary;
  abilities: AbilityReference[];
  weapons: EquippedWeaponSummary[];
  activeWeapon?: EquippedWeaponSummary;
};

const DEFAULT_MAX_HEALTH = 100;
const DEFAULT_MOVEMENT_SPEED = 1;
function normalizeWearableSlugs(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (slug): slug is string => typeof slug === 'string' && slug.length > 0
  );
}

function normalizeEquippedWearablesWithQuality(
  input:
    | Array<{ slug?: string; quality?: QualityTier; slot?: unknown }>
    | null
    | undefined
): EquippedWearableWithQuality[] | undefined {
  if (input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    return undefined;
  }

  const normalized: EquippedWearableWithQuality[] = [];
  for (const entry of input) {
    if (!entry) continue;
    const slug = normalizeWearableSlugs([entry.slug])[0];
    if (!slug) continue;
    normalized.push({
      slug,
      quality: normalizeQualityTier(entry.quality),
      slot: isEquipmentSlotName(entry.slot)
        ? (entry.slot as WearableSlot)
        : undefined,
    });
  }
  return normalized;
}

function buildAssignmentsBySlug(
  map: EquipmentSlotMap | undefined
): Map<string, WearableSlot[]> {
  const result = new Map<string, WearableSlot[]>();
  if (!map) return result;

  for (const slot of CHARACTER_EQUIPMENT_SLOT_ORDER) {
    const slug = map[slot];
    if (!slug) continue;
    const existing = result.get(slug) ?? [];
    existing.push(slot);
    result.set(slug, existing);
  }

  (Object.entries(map) as Array<[string, string]>).forEach(
    ([slotKey, slug]) => {
      if (!slug) return;
      if (!isEquipmentSlotName(slotKey)) return;
      const slot = slotKey as WearableSlot;
      if (
        slot === 'none' ||
        CHARACTER_EQUIPMENT_SLOT_ORDER.includes(slot as CharacterEquipmentSlot)
      ) {
        return;
      }
      const existing = result.get(slug) ?? [];
      existing.push(slot);
      result.set(slug, existing);
    }
  );
  return result;
}

function buildAssignmentsFromEquippedWithQuality(
  entries: EquippedWearableWithQuality[] | undefined
): Map<string, WearableSlot[]> {
  const result = new Map<string, WearableSlot[]>();
  if (!entries) return result;
  for (const entry of entries) {
    if (!entry) continue;
    const { slug, slot } = entry;
    if (!slug || !slot || slot === 'none') continue;
    const existing = result.get(slug) ?? [];
    existing.push(slot);
    result.set(slug, existing);
  }
  return result;
}

function collectWearablesFromSlotMap(
  map: EquipmentSlotMap | undefined
): Array<{ slot: WearableSlot; slug: string }> {
  if (!map) return [];
  const entries: Array<{ slot: WearableSlot; slug: string }> = [];
  for (const slot of CHARACTER_EQUIPMENT_SLOT_ORDER) {
    const slug = map[slot];
    if (slug) {
      entries.push({ slot, slug });
    }
  }
  return entries;
}

function buildEquipmentSummary(
  wearableSlugs: string[],
  aggregation: ReturnType<typeof aggregateEquipmentStatsWithQuality>,
  assignmentsBySlug: Map<string, WearableSlot[]>,
  context: string
): CharacterEquipmentSummary {
  const assignmentQueues = new Map<string, WearableSlot[]>();
  for (const [slug, slots] of assignmentsBySlug.entries()) {
    assignmentQueues.set(slug, [...slots]);
  }

  const equipmentItems = aggregation.wearables.map((entry) => {
    const queue = assignmentQueues.get(entry.slug);
    if (!queue || queue.length === 0) {
      throw new Error(
        `[characters] Missing slot assignment for "${entry.slug}" while deriving equipment for ${context}`
      );
    }
    const slot = queue.shift()!;
    if (queue.length === 0) {
      assignmentQueues.delete(entry.slug);
    } else {
      assignmentQueues.set(entry.slug, queue);
    }
    return {
      slug: entry.slug,
      id: entry.wearable.id,
      slot,
      quality: entry.quality,
      qualityScalar: entry.qualityScalar,
    };
  });

  if (assignmentQueues.size > 0) {
    const remaining = Array.from(assignmentQueues.entries())
      .map(([slug, slots]) => `${slug}=>${slots.join('+')}`)
      .join(', ');
    console.warn(
      `[characters] Unused slot assignments detected for ${context}: ${remaining}`
    );
  }

  return {
    slugs: wearableSlugs,
    items: equipmentItems,
    modifiers: aggregation.modifiers,
    missing: aggregation.missing,
  };
}

function applyModifierValue(
  value: number,
  modifier: AggregatedModifier | undefined,
  clamp?: { min?: number; max?: number; invertMultiply?: boolean }
): number {
  if (!modifier) return value;
  let result = Number.isFinite(value) ? value : 0;
  result += modifier.add;
  if (clamp?.invertMultiply) {
    result = modifier.multiply > 0 ? result / modifier.multiply : result;
  } else {
    result *= modifier.multiply;
  }
  if (typeof modifier.min === 'number') result = Math.max(result, modifier.min);
  if (typeof modifier.max === 'number') result = Math.min(result, modifier.max);
  if (clamp?.min !== undefined) result = Math.max(result, clamp.min);
  if (clamp?.max !== undefined) result = Math.min(result, clamp.max);
  return result;
}

function normalizeArmorStat(stats?: CharacterStats): number {
  const armor =
    stats && typeof stats.armor === 'number' && Number.isFinite(stats.armor)
      ? stats.armor
      : 0;
  const flat =
    stats &&
    typeof stats.flatDamageReduction === 'number' &&
    Number.isFinite(stats.flatDamageReduction)
      ? stats.flatDamageReduction
      : 0;
  const percent =
    stats &&
    typeof stats.percentDamageReduction === 'number' &&
    Number.isFinite(stats.percentDamageReduction)
      ? Math.round(stats.percentDamageReduction * 100)
      : 0;
  return Math.max(0, armor, flat, percent);
}

function getArmorModifier(
  modifiers: Record<EquipmentStat, AggregatedModifier>
): AggregatedModifier {
  const armorModifier = modifiers.armor
    ? { ...modifiers.armor }
    : ({ add: 0, multiply: 1 } satisfies AggregatedModifier);

  const legacy = modifiers as Record<string, AggregatedModifier | undefined>;
  const flat = legacy.flatDamageReduction;
  if (flat) {
    armorModifier.add += flat.add;
    if (typeof flat.min === 'number') {
      armorModifier.min =
        typeof armorModifier.min === 'number'
          ? Math.max(armorModifier.min, flat.min)
          : flat.min;
    }
    if (typeof flat.max === 'number') {
      armorModifier.max =
        typeof armorModifier.max === 'number'
          ? Math.min(armorModifier.max, flat.max)
          : flat.max;
    }
  }

  const percent = legacy.percentDamageReduction;
  if (percent) {
    armorModifier.add += Math.round(percent.add * 100);
    if (typeof percent.min === 'number') {
      const minValue = Math.round(percent.min * 100);
      armorModifier.min =
        typeof armorModifier.min === 'number'
          ? Math.max(armorModifier.min, minValue)
          : minValue;
    }
    if (typeof percent.max === 'number') {
      const maxValue = Math.round(percent.max * 100);
      armorModifier.max =
        typeof armorModifier.max === 'number'
          ? Math.min(armorModifier.max, maxValue)
          : maxValue;
    }
  }

  return armorModifier;
}

/**
 * Re-apply only the stats that can be overridden by the active weapon.
 * This is used in the gotchi path after we set weapon base stats so
 * quality-scaled equipment effects are not lost.
 */
function applyWeaponOverridableStats(
  derivedStats: {
    meleeAttackRange: number;
    rangedAttackRange: number;
    attackSpeed: number;
    projectileSpeed: number;
  },
  modifiers: Record<EquipmentStat, AggregatedModifier>
): void {
  derivedStats.meleeAttackRange = Math.max(
    0,
    Math.round(
      applyModifierValue(
        derivedStats.meleeAttackRange,
        modifiers.meleeAttackRange,
        { min: 0 }
      )
    )
  );

  derivedStats.rangedAttackRange = Math.max(
    0,
    Math.round(
      applyModifierValue(
        derivedStats.rangedAttackRange,
        modifiers.rangedAttackRange,
        { min: 0 }
      )
    )
  );

  derivedStats.attackSpeed = Math.max(
    50,
    Math.round(
      applyModifierValue(derivedStats.attackSpeed, modifiers.attackSpeed, {
        min: 50,
        invertMultiply: true,
      })
    )
  );

  derivedStats.projectileSpeed = Math.max(
    0,
    Math.round(
      applyModifierValue(
        derivedStats.projectileSpeed,
        modifiers.projectileSpeed,
        { min: 0 }
      )
    )
  );
}

function isDamageRange(value: unknown): value is { min: number; max: number } {
  if (!value || typeof value !== 'object') return false;
  const range = value as { min?: unknown; max?: unknown };
  return typeof range.min === 'number' && typeof range.max === 'number';
}

function toAbilityReference(
  ability: AbilityReference | WeaponAbility
): AbilityReference {
  const base: AbilityReference = { id: ability.id };
  const kind = (ability as WeaponAbility).kind;
  if (kind) base.kind = kind;
  const params = (ability as { params?: Record<string, any> }).params;
  if (params && typeof params === 'object') {
    base.params = { ...params };
  }
  return base;
}

function buildWeaponSummary(
  slug: string,
  weapon: WeaponProfile,
  qualityScalar = 1
): EquippedWeaponSummary {
  const scalar = Number.isFinite(qualityScalar) ? qualityScalar : 1;
  const baseDamage = weapon.damage;
  const scaledDamage =
    typeof baseDamage === 'number'
      ? Math.round(baseDamage * scalar)
      : baseDamage;
  const scaledRange = weapon.damageRange
    ? {
        min: Math.round(weapon.damageRange.min * scalar),
        max: Math.round(weapon.damageRange.max * scalar),
      }
    : undefined;
  const baseTotalDamage = (weapon as any).totalDamage;
  const scaledTotalDamage =
    typeof baseTotalDamage === 'number'
      ? 1 + (baseTotalDamage - 1) * scalar
      : baseTotalDamage;

  let grenadeSummary = weapon.grenade ? { ...weapon.grenade } : undefined;
  if (grenadeSummary) {
    if (typeof grenadeSummary.damageCenter === 'number') {
      grenadeSummary.damageCenter = Math.round(
        grenadeSummary.damageCenter * scalar
      );
    }
    if (typeof grenadeSummary.damageEdge === 'number') {
      grenadeSummary.damageEdge = Math.round(
        grenadeSummary.damageEdge * scalar
      );
    }
  }

  return {
    slug,
    id: weapon.id,
    name: weapon.name,
    aavegotchiId: weapon.aavegotchiId,
    weaponType: weapon.weaponType,
    weaponCategory: weapon.weaponCategory,
    damage: typeof scaledDamage === 'number' ? scaledDamage : weapon.damage,
    damageRange: scaledRange,
    totalDamage: scaledTotalDamage,
    attackSpeed: weapon.attackSpeed,
    meleeAttackRange: weapon.meleeAttackRange,
    rangedAttackRange: weapon.rangedAttackRange,
    projectileSpeed: weapon.projectileSpeed,
    attackAnimProfile: weapon.attackAnimProfile,
    abilities: weapon.abilities.map(toAbilityReference),
    grenade: grenadeSummary,
  };
}

const UNLOCK_COSTS = {
  tier1: 5,
  tier2: 25,
  tier3: 100,
  tier4: 500,
};

/**
 * All available characters - Single source of truth
 * Used by both client and server
 */
export const ALL_CHARACTERS: CharacterInfo[] = [
  {
    id: 'aagent',
    name: 'Aagent',
    description: 'Stealthy sniper with crit strike',
    theme: 'Agent/Spy',
    tier: 'tier2',
    unlockCost: UNLOCK_COSTS.tier2,
    equippedWearables: {
      handRight: 'aagent-pistol',
      body: 'aagent-shirt',
      head: 'aagent-fedora-hat',
      eyes: 'aagent-shades',
      face: 'aagent-headset',
    },
  },
  {
    id: 'baarbarian',
    name: 'Baarbarian',
    description: 'Fierce berserker with cleave attack',
    theme: 'Warrior/Barbarian',
    tier: 'tier1',
    stats: {
      weaponType: 'melee',
      attackSpeed: 950,
    },
    unlockCost: UNLOCK_COSTS.tier1,
    equippedWearables: {
      handRight: 'doublesided-axe',
      body: 'animal-skins',
      head: 'horned-helmet',
      face: 'forked-beard',
    },
  },
  {
    id: 'bushidogotchi',
    name: 'Bushidogotchi',
    description: 'Honor-bound samurai warrior with extended reach',
    theme: 'Samurai/Ninja',
    tier: 'tier4',
    stats: {},
    unlockCost: UNLOCK_COSTS.tier4,
    equippedWearables: {
      head: 'kabuto-helmet',
      body: 'yoroi-armor',
      handRight: 'haanzo-katana',
    },
  },
  {
    id: 'citaadelknight',
    name: 'Citaadel Knight',
    description: 'Noble knight defender of the realm',
    theme: 'Knight/Paladin',
    tier: 'tier3',
    stats: {
      weaponType: 'melee',
    },
    unlockCost: UNLOCK_COSTS.tier3,
    equippedWearables: {
      head: 'citaadel-helm',
      body: 'plate-armor',
      handRight: 'spirit-sword',
    },
  },
  {
    id: 'fairy',
    name: 'Fairy',
    description: 'Mystical fairy with magical powers',
    theme: 'Magic/Nature',
    tier: 'tier2',
    equippedWearables: {
      face: 'flower-studs',
      body: 'fairy-wings',
      head: 'red-hair',
    },
    unlockCost: UNLOCK_COSTS.tier2,
    isPlayable: false,
  },
  {
    id: 'geisha',
    name: 'Geisha',
    description: 'Elegant assassin with crit strike',
    theme: 'Traditional/Cultural',
    tier: 'tier2',
    stats: {},
    equippedWearables: {
      head: 'geisha-headpiece',
      body: 'kimono',
      eyes: 'alluring-eyes',
      handRight: 'paper-fan',
    },
    unlockCost: UNLOCK_COSTS.tier2,
  },
  {
    id: 'coderdan',
    name: 'Coderdan',
    description: 'Elite developer with coding mastery',
    theme: 'Tech/Hacker',
    tier: 'tier3',
    stats: {
      attackSpeed: 750,
    },
    equippedWearables: {
      handRight: 'portal-mage-black-axe',
      handLeft: 'milkshake',
      face: 'sergey-beard',
      eyes: 'coderdan-shades',
      body: 'red-plaid',
    },
    unlockCost: UNLOCK_COSTS.tier3,
  },
  {
    id: 'gldnxross',
    name: 'Goldnxross',
    description: 'Golden warrior with divine power',
    theme: 'Divine/Holy',
    tier: 'tier2',
    stats: {},
    equippedWearables: {
      head: 'marine-cap',
      face: 'sergey-beard',
      body: 'link-mess-dress',
      handRight: 'mk2-grenade',
      handLeft: 'link-bubbly',
    },
    unlockCost: UNLOCK_COSTS.tier2,
  },
  {
    id: 'gotchidator',
    name: 'Gotchidator',
    description: 'Relentless hunter from the future',
    theme: 'Sci-Fi/Cyborg',
    tier: 'tier2',

    unlockCost: UNLOCK_COSTS.tier2,
    equippedWearables: {
      face: 'lick-tongue',
      head: 'lick-brain',
      handRight: 'lick-tentacle',
      eyes: 'lick-eyes',
    },
  },
  {
    id: 'laozigotchi',
    name: 'Laozigotchi',
    description: 'Ancient sage with wisdom of the ages',
    theme: 'Wisdom/Philosophy',
    tier: 'tier4',
    equippedWearables: {
      handRight: 'link-cube',
      body: 'taoist-robe',
      eyes: 'bushy-eyebrows',
      face: 'beard-of-wisdom',
    },
    unlockCost: UNLOCK_COSTS.tier4,
    isPlayable: false,
  },
  {
    id: 'mudgen',
    name: 'Mudgen',
    description: 'Master builder and blockchain architect',
    theme: 'Tech/Builder',
    tier: 'tier4',
    equippedWearables: {
      handLeft: 'mudgen-diamond',
      body: 'blue-plaid',
      handRight: 'legendary-wizard-staff',
      head: 'gentleman-hat',
    },
    unlockCost: UNLOCK_COSTS.tier4,
    isPlayable: false,
  },

  {
    id: 'portalmage',
    name: 'Nyx',
    description: 'Mystical mage who controls dimensional portals',
    theme: 'Magic/Portal',
    tier: 'tier4',
    equippedWearables: {
      handRight: 'portal-mage-black-axe',
      head: 'portal-mage-helmet',
      body: 'portal-mage-armor',
    },
    unlockCost: UNLOCK_COSTS.tier4,
  },
  {
    id: 'stani',
    name: 'Stani',
    description: 'Builder, lender, and memelord.',
    theme: 'DeFi/Builder',
    tier: 'tier4',
    // NPC only for now
    isPlayable: false,
    unlockCost: 0,
  },
  {
    id: 'wizard',
    name: 'Wizard',
    description: 'Ranged shooter with enhanced sight',
    theme: 'Magic/Arcane',
    tier: 'tier1',

    equippedWearables: {
      head: 'common-wizard-hat',
      handRight: 'common-wizard-staff',
      eyes: 'wizard-visor',
    },
    unlockCost: UNLOCK_COSTS.tier1,
  },
  {
    id: 'xibot',
    name: 'XIBOT',
    description: 'Advanced AI entity with machine intelligence',
    theme: 'AI/Robot',
    tier: 'tier2',
    stats: {},
    equippedWearables: {
      eyes: 'wizard-visor',
      head: 'xibot-mohawk',
      handRight: 'common-wizard-staff',
      body: 'llamacorn-shirt',
    },
    unlockCost: UNLOCK_COSTS.tier2,
  },
  {
    id: 'farmer',
    name: 'Farmer',
    description: 'Durable fighter who farms potions',
    theme: 'Farming/Agriculture',
    tier: 'tier1',
    equippedWearables: {
      head: 'straw-hat',
      body: 'farmer-jeans',
      handRight: 'pitchfork',
    },
    unlockCost: UNLOCK_COSTS.tier1,
  },
];

/**
 * Cache for dynamic gotchi wearable data
 * Key: gotchi:<id>, Value: array of wearable slugs
 */
const GOTCHI_WEARABLE_CACHE = new Map<string, string[]>();

/**
 * Cache for dynamic gotchi wearable assignments (slot + slug)
 * Key: gotchi:<id>, Value: array of { slot, slug } assignments
 */
const GOTCHI_WEARABLE_ASSIGNMENTS_CACHE = new Map<
  string,
  Array<{ slot: WearableSlot; slug: string }>
>();

/**
 * Store wearable slugs for a dynamic gotchi character
 */
export function setGotchiWearables(
  gotchiId: string,
  wearableSlugs: string[]
): void {
  const key = `gotchi:${gotchiId}`;
  GOTCHI_WEARABLE_CACHE.set(key, wearableSlugs);
}

/**
 * Get wearable slugs for a dynamic gotchi character
 */
export function getGotchiWearables(gotchiId: string): string[] | undefined {
  const key = `gotchi:${gotchiId}`;
  return GOTCHI_WEARABLE_CACHE.get(key);
}

/**
 * Store wearable assignments for a dynamic gotchi character
 */
export function setGotchiWearableAssignments(
  gotchiId: string,
  assignments: Array<{ slot: WearableSlot; slug: string }>
): void {
  const key = `gotchi:${gotchiId}`;
  GOTCHI_WEARABLE_ASSIGNMENTS_CACHE.set(key, assignments);
}

/**
 * Get wearable assignments for a gotchi character
 */
export function getGotchiWearableAssignments(
  gotchiId: string
): Array<{ slot: WearableSlot; slug: string }> | undefined {
  const key = `gotchi:${gotchiId}`;
  return GOTCHI_WEARABLE_ASSIGNMENTS_CACHE.get(key);
}

/**
 * Derive stats for a dynamic gotchi character from its wearable slugs
 */
function deriveGotchiStatsFromWearables(
  wearableSlugs: string[],
  gotchiId?: string,
  assignmentOverrides?: Map<string, WearableSlot[]>,
  equippedWithQuality?: EquippedWearableWithQuality[]
): CharacterDerivedStats {
  // Start with naked gotchi defaults (melee-focused)
  const baseStats = {
    maxHealth: 100,
    damage: 15, // Slightly higher than default 10 for gotchis
    damageRange: { min: 15, max: 15 },
    totalDamage: 1,
    attackSpeed: 1000,
    meleeAttackRange: 80,
    rangedAttackRange: 110,
    weaponType: 'melee' as WeaponType,
    weaponCategory: 'sword' as WeaponCategory,
    projectileSpeed: 200,
    armor: 0,
    movementSpeed: 1,
    attackVisualScale: 1,
    attackRangedVisualScale: 1,
  };

  // Aggregate equipment stats (respect quality when provided)
  const aggregation = equippedWithQuality
    ? aggregateEquipmentStatsWithQuality(equippedWithQuality)
    : aggregateEquipmentStats(wearableSlugs);

  if (aggregation.missing.length > 0) {
    const key = `gotchi-wearables:${aggregation.missing.join(',')}`;
    if (!REPORTED_MISSING_WEARABLES.has(key)) {
      REPORTED_MISSING_WEARABLES.add(key);
      console.warn(
        `[characters] Unknown wearable slugs for gotchi: ${aggregation.missing.join(', ')}`
      );
    }
  }

  // Apply equipment modifiers to base stats
  let derivedStats = { ...baseStats };

  // Apply modifiers from wearables
  // Skip damage-specific fields here; they are handled in a dedicated pass below
  for (const [statName, modifier] of Object.entries(aggregation.modifiers)) {
    if (
      statName === 'damage' ||
      statName === 'damageMin' ||
      statName === 'damageMax' ||
      statName === 'totalDamage'
    ) {
      continue;
    }
    const statKey = statName as keyof typeof baseStats;
    if (typeof derivedStats[statKey] === 'number') {
      const baseValue = derivedStats[statKey] as number;
      (derivedStats as any)[statKey] = applyModifierValue(baseValue, modifier, {
        invertMultiply: statName === 'attackSpeed',
      });
    }
  }

  // Handle weapons specially
  const weaponSummaries = aggregation.wearables
    .filter((entry) => entry.weapon)
    .map((entry) =>
      buildWeaponSummary(entry.slug, entry.weapon!, entry.qualityScalar)
    );

  const activeWeapon =
    weaponSummaries.find((weapon) => weapon.weaponType !== 'grenades') ||
    weaponSummaries[0];
  if (activeWeapon) {
    if (typeof activeWeapon.damage === 'number') {
      derivedStats.damage = activeWeapon.damage;
      derivedStats.damageRange = {
        min: activeWeapon.damage,
        max: activeWeapon.damage,
      };
    }
    if (activeWeapon.damageRange) {
      derivedStats.damageRange = {
        min: activeWeapon.damageRange.min,
        max: activeWeapon.damageRange.max,
      };
    }
    // totalDamage handled separately
    if (typeof activeWeapon.attackSpeed === 'number') {
      derivedStats.attackSpeed = activeWeapon.attackSpeed;
    }
    if (typeof activeWeapon.meleeAttackRange === 'number') {
      derivedStats.meleeAttackRange = activeWeapon.meleeAttackRange;
    }
    if (typeof activeWeapon.rangedAttackRange === 'number') {
      derivedStats.rangedAttackRange = activeWeapon.rangedAttackRange;
    }
    if (typeof activeWeapon.projectileSpeed === 'number') {
      derivedStats.projectileSpeed = activeWeapon.projectileSpeed;
    }
    // Update weapon type based on weapon
    derivedStats.weaponType = activeWeapon.weaponType;
    (derivedStats as any).weaponCategory = activeWeapon.weaponCategory;
  }

  // Build equipment summary
  const equippedWearables = wearableSlugs;
  let assignmentsBySlug = assignmentOverrides;
  if (!assignmentsBySlug) {
    assignmentsBySlug = new Map<string, WearableSlot[]>();
    if (aggregation.wearables.length > 0) {
      const assignments = gotchiId && getGotchiWearableAssignments(gotchiId);
      if (!assignments || assignments.length === 0) {
        throw new Error(
          `[characters] Missing gotchi slot assignments for ${gotchiId ? `gotchi:${gotchiId}` : 'unknown gotchi'}`
        );
      }
      for (const entry of assignments) {
        if (!entry) continue;
        const { slug, slot } = entry;
        if (!slug || !isEquipmentSlotName(slot) || slot === 'none') continue;
        const existing = assignmentsBySlug.get(slug) ?? [];
        existing.push(slot);
        assignmentsBySlug.set(slug, existing);
      }
    }
  }

  const equipment = buildEquipmentSummary(
    equippedWearables,
    aggregation,
    assignmentsBySlug,
    gotchiId ? `gotchi:${gotchiId}` : 'gotchi'
  );

  // Re-apply only weapon-overridable stats after weapon overrides
  const modifiers = aggregation.modifiers as Record<string, AggregatedModifier>;
  applyWeaponOverridableStats(
    derivedStats as any as {
      meleeAttackRange: number;
      rangedAttackRange: number;
      attackSpeed: number;
      projectileSpeed: number;
    },
    modifiers as any
  );

  // Apply damage modifiers to base damage and range, then scale by totalDamage
  const baseDamageValue = derivedStats.damage;
  const baseRangeMin = derivedStats.damageRange.min;
  const baseRangeMax = derivedStats.damageRange.max;
  const baseScalarValue = 1; // start from 1; apply totalDamage only once below

  const modifiedBaseDamage = applyModifierValue(
    baseDamageValue,
    (modifiers as any).damage
  );
  const modifiedMinBase = applyModifierValue(
    baseRangeMin,
    (modifiers as any).damage
  );
  const modifiedMaxBase = applyModifierValue(
    baseRangeMax,
    (modifiers as any).damage
  );
  const adjustedMin = applyModifierValue(
    modifiedMinBase,
    (modifiers as any).damageMin
  );
  const adjustedMax = applyModifierValue(
    modifiedMaxBase,
    (modifiers as any).damageMax
  );

  let scalarAdjusted = applyModifierValue(
    baseScalarValue,
    (modifiers as any).totalDamage,
    { min: 0 }
  );
  if (!Number.isFinite(scalarAdjusted)) scalarAdjusted = 0;
  scalarAdjusted = Math.max(0, scalarAdjusted);
  (derivedStats as any).totalDamage = scalarAdjusted;

  const finalScalar = scalarAdjusted;
  derivedStats.damage = Math.max(
    0,
    Math.round(modifiedBaseDamage * finalScalar)
  );
  const minBeforeScale = Math.min(adjustedMin, adjustedMax);
  const maxBeforeScale = Math.max(adjustedMin, adjustedMax);
  const finalMin = Math.max(0, Math.round(minBeforeScale * finalScalar));
  const finalMax = Math.max(finalMin, Math.round(maxBeforeScale * finalScalar));
  derivedStats.damageRange = { min: finalMin, max: finalMax };

  const wearableAbilities = aggregation.wearables.flatMap((entry) => {
    const abilities =
      entry.abilities && entry.abilities.length > 0
        ? entry.abilities
        : entry.wearable.abilities;
    return abilities.map(toAbilityReference);
  });

  const combinedAbilities = [
    ...wearableAbilities,
    ...weaponSummaries.flatMap((weapon) => weapon.abilities),
  ];

  return {
    ...derivedStats,
    totalDamage: (derivedStats as any).totalDamage ?? 1,
    equipment,
    abilities: combinedAbilities,
    weapons: weaponSummaries,
  };
}

/**
 * Get character stats with defaults
 */
const REPORTED_MISSING_WEARABLES = new Set<string>();

export interface GetCharacterStatsOptions {
  equippedWearables?: EquipmentSlotMap | null;
  equippedWearablesWithQuality?: EquippedWearableWithQuality[] | null;
  activeWeaponSlug?: string | null;
}

export function getCharacterStats(
  characterId: string,
  options: GetCharacterStatsOptions = {}
): CharacterDerivedStats {
  const overrideWearablesWithQuality = normalizeEquippedWearablesWithQuality(
    options.equippedWearablesWithQuality
  );

  // Handle dynamic gotchi characters
  if (characterId.startsWith('gotchi:')) {
    const gotchiId = characterId.split(':')[1];

    if (overrideWearablesWithQuality !== undefined) {
      const assignmentOverrides = buildAssignmentsFromEquippedWithQuality(
        overrideWearablesWithQuality
      );
      if (
        overrideWearablesWithQuality.length > 0 &&
        assignmentOverrides.size === 0
      ) {
        throw new Error(
          `[characters] equippedWearablesWithQuality overrides must include slot assignments for gotchi:${gotchiId}`
        );
      }
      const wearableSlugs = overrideWearablesWithQuality.map(
        (entry) => entry.slug
      );
      return deriveGotchiStatsFromWearables(
        wearableSlugs,
        gotchiId,
        assignmentOverrides,
        overrideWearablesWithQuality
      );
    }

    if (options.equippedWearables !== undefined) {
      if (options.equippedWearables === null) {
        return deriveGotchiStatsFromWearables([], gotchiId, new Map());
      }
      const slotEntries = collectWearablesFromSlotMap(
        options.equippedWearables
      );
      const assignmentOverrides = buildAssignmentsBySlug(
        options.equippedWearables
      );
      const wearableSlugs = slotEntries.map((entry) => entry.slug);
      return deriveGotchiStatsFromWearables(
        wearableSlugs,
        gotchiId,
        assignmentOverrides
      );
    }

    const wearableSlugs = getGotchiWearables(gotchiId);
    if (wearableSlugs) {
      return deriveGotchiStatsFromWearables(wearableSlugs, gotchiId);
    }
    // Fallback to naked gotchi stats if no wearables cached
    return deriveGotchiStatsFromWearables([], gotchiId);
  }

  const character = ALL_CHARACTERS.find((c) => c.id === characterId);
  const stats = character?.stats || {};

  const baseDamageStat =
    typeof stats.damage === 'number' && Number.isFinite(stats.damage)
      ? stats.damage
      : 10;
  const baseDamageRangeStat = isDamageRange(stats.damageRange)
    ? { min: stats.damageRange.min, max: stats.damageRange.max }
    : undefined;
  let baseDamage = baseDamageStat;
  let baseDamageRange = baseDamageRangeStat
    ? { ...baseDamageRangeStat }
    : { min: baseDamageStat, max: baseDamageStat };
  let baseDamageScalar =
    typeof (stats as any).totalDamage === 'number' &&
    Number.isFinite((stats as any).totalDamage)
      ? (stats as any).totalDamage
      : 1;
  let baseAttackSpeed =
    typeof stats.attackSpeed === 'number' && Number.isFinite(stats.attackSpeed)
      ? stats.attackSpeed
      : 1000;
  let baseMeleeAttackRange =
    typeof stats.meleeAttackRange === 'number' &&
    Number.isFinite(stats.meleeAttackRange)
      ? stats.meleeAttackRange
      : 80;
  let baseRangedAttackRange =
    typeof stats.rangedAttackRange === 'number' &&
    Number.isFinite(stats.rangedAttackRange)
      ? stats.rangedAttackRange
      : 110;
  let baseWeaponType: WeaponType = stats.weaponType ?? 'melee';
  let baseWeaponCategory: WeaponCategory = stats.weaponCategory ?? 'sword';
  let baseProjectileSpeed =
    typeof stats.projectileSpeed === 'number' &&
    Number.isFinite(stats.projectileSpeed)
      ? stats.projectileSpeed
      : 200;
  const characterAbilities = Array.isArray(character?.abilities)
    ? character.abilities.map(toAbilityReference)
    : [];

  let slotEntries: Array<{ slot: WearableSlot; slug: string }> = [];
  let assignmentsBySlug = new Map<string, WearableSlot[]>();
  let equippedWearablesWithQualityResolved: EquippedWearableWithQuality[];

  if (overrideWearablesWithQuality !== undefined) {
    const missingSlot = overrideWearablesWithQuality.filter(
      (entry) => entry.slug && !entry.slot
    );
    if (missingSlot.length > 0) {
      const missingSlugs = missingSlot.map((entry) => entry.slug).join(', ');
      throw new Error(
        `[characters] equippedWearablesWithQuality overrides missing slot assignments for character ${characterId}: ${missingSlugs}`
      );
    }
    assignmentsBySlug = buildAssignmentsFromEquippedWithQuality(
      overrideWearablesWithQuality
    );
    equippedWearablesWithQualityResolved = overrideWearablesWithQuality;
    slotEntries = overrideWearablesWithQuality.map((entry) => ({
      slot: entry.slot as WearableSlot,
      slug: entry.slug,
    }));
  } else {
    const slotMap =
      options.equippedWearables === null
        ? undefined
        : (options.equippedWearables ?? character?.equippedWearables);
    slotEntries = collectWearablesFromSlotMap(slotMap);
    assignmentsBySlug = buildAssignmentsBySlug(slotMap);
    equippedWearablesWithQualityResolved = slotEntries.map((entry) => ({
      slug: entry.slug,
      quality: DEFAULT_QUALITY_TIER,
      slot: entry.slot,
    }));
  }

  const wearableSlugs =
    overrideWearablesWithQuality !== undefined
      ? overrideWearablesWithQuality.map((entry) => entry.slug)
      : slotEntries.map((entry) => entry.slug);

  const aggregation = aggregateEquipmentStatsWithQuality(
    equippedWearablesWithQualityResolved
  );

  if (aggregation.missing.length > 0) {
    const key = `${characterId}:${aggregation.missing.join(',')}`;
    if (!REPORTED_MISSING_WEARABLES.has(key)) {
      REPORTED_MISSING_WEARABLES.add(key);
      console.warn(
        `[characters] Unknown wearable slugs for ${characterId}: ${aggregation.missing.join(', ')}`
      );
    }
  }

  const weaponSummaries = aggregation.wearables
    .filter((entry) => entry.weapon)
    .map((entry) =>
      buildWeaponSummary(entry.slug, entry.weapon!, entry.qualityScalar)
    );

  const requestedWeaponSlug =
    typeof options.activeWeaponSlug === 'string' &&
    options.activeWeaponSlug.trim().length > 0
      ? slugifyWearableName(options.activeWeaponSlug)
      : null;

  let activeWeapon =
    (requestedWeaponSlug &&
      weaponSummaries.find((weapon) => weapon.slug === requestedWeaponSlug)) ||
    weaponSummaries.find((weapon) => weapon.weaponType !== 'grenades') ||
    weaponSummaries[0];
  if (activeWeapon) {
    if (typeof activeWeapon.damage === 'number') {
      baseDamage = activeWeapon.damage;
    }
    if (activeWeapon.damageRange) {
      baseDamageRange = {
        min: activeWeapon.damageRange.min,
        max: activeWeapon.damageRange.max,
      };
    } else if (typeof activeWeapon.damage === 'number') {
      baseDamageRange = {
        min: activeWeapon.damage,
        max: activeWeapon.damage,
      };
    }
    if (typeof (activeWeapon as any).totalDamage === 'number') {
      baseDamageScalar = (activeWeapon as any).totalDamage;
    }
    if (typeof activeWeapon.attackSpeed === 'number') {
      baseAttackSpeed = activeWeapon.attackSpeed;
    }
    if (typeof activeWeapon.meleeAttackRange === 'number') {
      baseMeleeAttackRange = activeWeapon.meleeAttackRange;
    }
    if (typeof activeWeapon.rangedAttackRange === 'number') {
      baseRangedAttackRange = activeWeapon.rangedAttackRange;
    }
    if (typeof activeWeapon.projectileSpeed === 'number') {
      baseProjectileSpeed = activeWeapon.projectileSpeed;
    }
    baseWeaponType = activeWeapon.weaponType;
    baseWeaponCategory = activeWeapon.weaponCategory;
  }

  if (!isDamageRange(baseDamageRange)) {
    baseDamageRange = { min: baseDamage, max: baseDamage };
  }

  if (
    activeWeapon &&
    typeof activeWeapon.damage !== 'number' &&
    activeWeapon.damageRange
  ) {
    baseDamage =
      (activeWeapon.damageRange.min + activeWeapon.damageRange.max) / 2;
  }

  if (!Number.isFinite(baseDamage)) {
    baseDamage =
      (baseDamageRange.min + baseDamageRange.max) / 2 || baseDamageStat;
  }

  const wearableAbilities = aggregation.wearables.flatMap((entry) => {
    const abilities =
      entry.abilities && entry.abilities.length > 0
        ? entry.abilities
        : entry.wearable.abilities;
    return abilities.map(toAbilityReference);
  });

  const combinedAbilities = [
    ...characterAbilities,
    ...wearableAbilities,
    ...weaponSummaries.flatMap((weapon) => weapon.abilities),
  ];

  const equipment = buildEquipmentSummary(
    wearableSlugs,
    aggregation,
    assignmentsBySlug,
    `character ${characterId}`
  );

  const derived: CharacterDerivedStats = {
    meleeAttackRange: baseMeleeAttackRange,
    rangedAttackRange: baseRangedAttackRange,
    damage: baseDamage,
    damageRange: { min: baseDamageRange.min, max: baseDamageRange.max },
    totalDamage: baseDamageScalar,
    attackSpeed: baseAttackSpeed,
    weaponType: baseWeaponType,
    weaponCategory: baseWeaponCategory,
    projectileSpeed: baseProjectileSpeed,
    attackVisualScale: stats.attackVisualScale || 1,
    attackRangedVisualScale: stats.attackRangedVisualScale || 1,
    maxHealth: stats.maxHealth || DEFAULT_MAX_HEALTH,
    armor: normalizeArmorStat(stats),
    movementSpeed: stats.movementSpeed || DEFAULT_MOVEMENT_SPEED,
    equipment,
    abilities: combinedAbilities,
    weapons: weaponSummaries,
    activeWeapon,
  };

  const modifiers = aggregation.modifiers;

  derived.maxHealth = Math.max(
    1,
    Math.round(
      applyModifierValue(derived.maxHealth, modifiers.maxHealth, { min: 1 })
    )
  );
  const armorModifier = getArmorModifier(modifiers);
  derived.armor = Math.max(
    0,
    applyModifierValue(derived.armor, armorModifier, {
      min: 0,
    })
  );
  derived.movementSpeed = Math.max(
    0,
    applyModifierValue(derived.movementSpeed, modifiers.movementSpeed, {
      min: 0,
    })
  );

  derived.meleeAttackRange = Math.max(
    0,
    Math.round(
      applyModifierValue(derived.meleeAttackRange, modifiers.meleeAttackRange, {
        min: 0,
      })
    )
  );
  derived.rangedAttackRange = Math.max(
    0,
    Math.round(
      applyModifierValue(
        derived.rangedAttackRange,
        modifiers.rangedAttackRange,
        {
          min: 0,
        }
      )
    )
  );
  derived.attackSpeed = Math.max(
    50,
    Math.round(
      applyModifierValue(derived.attackSpeed, modifiers.attackSpeed, {
        min: 50,
        invertMultiply: true,
      })
    )
  );
  derived.projectileSpeed = Math.max(
    0,
    Math.round(
      applyModifierValue(derived.projectileSpeed, modifiers.projectileSpeed, {
        min: 0,
      })
    )
  );

  const baseDamageValue = derived.damage;
  const baseRangeMin = derived.damageRange.min;
  const baseRangeMax = derived.damageRange.max;
  const baseScalarValue = (derived as any).totalDamage;

  const modifiedBaseDamage = applyModifierValue(
    baseDamageValue,
    modifiers.damage
  );
  const modifiedMinBase = applyModifierValue(baseRangeMin, modifiers.damage);
  const modifiedMaxBase = applyModifierValue(baseRangeMax, modifiers.damage);
  const adjustedMin = applyModifierValue(modifiedMinBase, modifiers.damageMin);
  const adjustedMax = applyModifierValue(modifiedMaxBase, modifiers.damageMax);

  let scalarAdjusted = applyModifierValue(
    baseScalarValue,
    (modifiers as any).totalDamage,
    {
      min: 0,
    }
  );
  if (!Number.isFinite(scalarAdjusted)) {
    scalarAdjusted = 0;
  }
  scalarAdjusted = Math.max(0, scalarAdjusted);
  (derived as any).totalDamage = scalarAdjusted;

  const finalScalar = scalarAdjusted;
  derived.damage = Math.max(0, Math.round(modifiedBaseDamage * finalScalar));

  const minBeforeScale = Math.min(adjustedMin, adjustedMax);
  const maxBeforeScale = Math.max(adjustedMin, adjustedMax);
  const finalMin = Math.max(0, Math.round(minBeforeScale * finalScalar));
  const finalMax = Math.max(finalMin, Math.round(maxBeforeScale * finalScalar));
  derived.damageRange = { min: finalMin, max: finalMax };

  return derived;
}

/**
 * Get attack range for a specific weapon type and character
 */
export function getAttackRange(
  characterId: string,
  weaponType: 'melee' | 'ranged'
): number {
  const stats = getCharacterStats(characterId);
  return weaponType === 'melee'
    ? stats.meleeAttackRange
    : stats.rangedAttackRange;
}

/**
 * Get character by ID
 */
export function getCharacterById(characterId: string): CharacterInfo | null {
  return ALL_CHARACTERS.find((c) => c.id === characterId) || null;
}

/**
 * Get random character
 */
export function getRandomCharacter(): CharacterInfo {
  const randomIndex = Math.floor(Math.random() * ALL_CHARACTERS.length);
  return ALL_CHARACTERS[randomIndex];
}

/**
 * NPC character IDs that should not be used for bots
 */
export const NPC_CHARACTER_IDS = [
  'laozigotchi',
  'mudgen',
  'stani',
] as const;

/**
 * Get characters available for bot spawning (excludes NPCs)
 */
export function getBotEligibleCharacters(): CharacterInfo[] {
  return ALL_CHARACTERS.filter(
    (char) =>
      char.isPlayable !== false && !NPC_CHARACTER_IDS.includes(char.id as any)
  );
}

/**
 * Get weighted random character (rarity-based) excluding NPCs
 */
export function getWeightedRandomCharacter(): CharacterInfo {
  const eligibleCharacters = getBotEligibleCharacters();
  const rand = Math.random();

  if (rand < 0.5) {
    // 50% chance for common characters
    const commons = eligibleCharacters.filter((char) => char.tier === 'tier1');
    return (
      commons[Math.floor(Math.random() * commons.length)] ||
      getRandomCharacterForBot()
    );
  } else if (rand < 0.8) {
    // 30% chance for uncommon characters
    const uncommons = eligibleCharacters.filter(
      (char) => char.tier === 'tier2'
    );
    return uncommons.length > 0
      ? uncommons[Math.floor(Math.random() * uncommons.length)]
      : getRandomCharacterForBot();
  } else {
    // 20% chance for rare+ characters
    const rares = eligibleCharacters.filter((char) => char.tier === 'tier3');
    return rares.length > 0
      ? rares[Math.floor(Math.random() * rares.length)]
      : getRandomCharacterForBot();
  }
}

/**
 * Get random character for bots (excludes NPCs)
 */
export function getRandomCharacterForBot(): CharacterInfo {
  const eligibleCharacters = getBotEligibleCharacters();
  const randomIndex = Math.floor(Math.random() * eligibleCharacters.length);
  return eligibleCharacters[randomIndex];
}
