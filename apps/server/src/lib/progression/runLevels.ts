import {
  RUN_ARCHETYPES_BY_ID,
  getRunArchetypeIdForCharacter,
  type RunArchetypeDefinition,
  type RunLevelTraitDefinition,
} from '../../data/archetypes';

export const RUN_LEVEL_CAP = 99;

const MIN_ATTACK_SPEED_SCALAR = 0.2; // Hard floor to avoid zero or negative cooldowns
const MAX_ARMOR_PERCENT = 0.8;
const RUN_XP_SCALE = 5; // Scale factor to increase XP required per run level
const XP_CURVE: number[] = buildRunXpCurve();
const CUMULATIVE_XP: number[] = buildCumulativeRunXp();
const MAX_TOTAL_XP = CUMULATIVE_XP[RUN_LEVEL_CAP];

export interface RunLevelModifiers {
  attackSpeedScalar: number;
  damageMultiplier: number;
  maxHealthMultiplier: number;
  maxHealthFlatBonus: number;
  movementSpeedMultiplier: number;
  armorBonus: number;
  lifeStealPercent: number;
  criticalChanceBonus: number;
  evadeChanceBonus: number;
  hpRegenPerSecondBonus: number;
  manaRegenMultiplier: number;
  attackRangeMultiplier: number;
  magicFindBonus: number;
  potionCoinFindBonus: number;
}

export interface RunProfile {
  archetypeId: string;
  level: number;
  totalXp: number;
  modifiers: RunLevelModifiers;
  createdAt: number;
  updatedAt: number;
}

export interface RunLevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
}

export interface RunXpGainResult {
  profile: RunProfile;
  levelUps: number;
  previousLevel: number;
  currentLevel: number;
  totalXpAdded: number;
  progress: RunLevelProgress;
}

export function createRunProfile(
  archetypeId: string,
  now: number = Date.now()
): RunProfile {
  const normalizedId = normalizeArchetypeId(archetypeId);
  return {
    archetypeId: normalizedId,
    level: 1,
    totalXp: 0,
    modifiers: computeRunModifiers(normalizedId, 1),
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneRunProfile(profile: RunProfile): RunProfile {
  return {
    archetypeId: profile.archetypeId,
    level: profile.level,
    totalXp: profile.totalXp,
    modifiers: { ...profile.modifiers },
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function withRunProfileLevel(
  profile: RunProfile,
  level: number,
  now: number = Date.now()
): RunProfile {
  const next = cloneRunProfile(profile);
  next.level = clamp(Math.floor(level), 1, RUN_LEVEL_CAP);
  next.modifiers = computeRunModifiers(next.archetypeId, next.level);
  next.updatedAt = now;
  return next;
}

export function applyRunXp(
  profile: RunProfile,
  xpAmount: number,
  now: number = Date.now()
): RunXpGainResult {
  const sanitized = Math.max(0, Math.floor(xpAmount));
  const clone = cloneRunProfile(profile);
  const previousLevel = clone.level;
  const nextTotal = clamp(clone.totalXp + sanitized, 0, MAX_TOTAL_XP);
  clone.totalXp = nextTotal;

  const progress = getRunLevelProgress(clone.totalXp);
  clone.level = progress.level;
  const levelUps = Math.max(0, clone.level - previousLevel);

  if (clone.level >= RUN_LEVEL_CAP) {
    clone.totalXp = MAX_TOTAL_XP;
  }

  clone.modifiers = computeRunModifiers(clone.archetypeId, clone.level);
  clone.updatedAt = now;

  return {
    profile: clone,
    levelUps,
    previousLevel,
    currentLevel: clone.level,
    totalXpAdded: sanitized,
    progress,
  };
}

export function getRunXpRequiredForLevel(level: number): number {
  if (level < 1) return XP_CURVE[1];
  if (level >= RUN_LEVEL_CAP) return 0;
  return XP_CURVE[level];
}

export function getRunLevelTotalXp(level: number): number {
  if (level <= 1) return 0;
  if (level >= RUN_LEVEL_CAP) return MAX_TOTAL_XP;
  return CUMULATIVE_XP[level];
}

export function getRunLevelProgress(totalXp: number): RunLevelProgress {
  const sanitized = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < RUN_LEVEL_CAP && sanitized >= CUMULATIVE_XP[level + 1]) {
    level += 1;
  }

  const xpIntoLevel = sanitized - CUMULATIVE_XP[level];
  const xpForNextLevel = getRunXpRequiredForLevel(level);
  const progress =
    xpForNextLevel > 0 ? clamp(xpIntoLevel / xpForNextLevel, 0, 1) : 0;

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    progress,
  };
}

export function resolveArchetypeForCharacter(
  characterId: string | null | undefined
): string {
  return getRunArchetypeIdForCharacter(characterId);
}

function computeRunModifiers(
  archetypeId: string,
  level: number
): RunLevelModifiers {
  const normalizedLevel = clamp(Math.floor(level), 1, RUN_LEVEL_CAP);
  const base = createDefaultModifiers();
  const archetype = RUN_ARCHETYPES_BY_ID[archetypeId];
  const trait: RunLevelTraitDefinition | undefined = archetype?.levelTrait;
  if (!trait || trait.type === 'none') {
    return base;
  }

  const valuePerLevel = trait.valuePerLevel ?? 0;
  const maxBonus = trait.cap ?? Number.POSITIVE_INFINITY;
  const additiveBonus = Math.min(maxBonus, valuePerLevel * normalizedLevel);

  switch (trait.type) {
    case 'damage_multiplier': {
      base.damageMultiplier = Math.max(0, 1 + additiveBonus);
      break;
    }
    case 'attack_speed': {
      const perLevel = clamp(valuePerLevel, 0, 0.95);
      const scalar = Math.pow(1 - perLevel, normalizedLevel);
      const minScalar =
        typeof trait.cap === 'number'
          ? Math.max(0, 1 - clamp(trait.cap, 0, 0.95))
          : MIN_ATTACK_SPEED_SCALAR;
      base.attackSpeedScalar = clamp(scalar, minScalar, 1);
      break;
    }
    case 'movement_speed': {
      base.movementSpeedMultiplier = Math.max(0, 1 + additiveBonus);
      break;
    }
    case 'percent_damage_reduction': {
      const cappedPercent = clamp(
        additiveBonus,
        0,
        Math.min(maxBonus, MAX_ARMOR_PERCENT)
      );
      base.armorBonus = Math.max(0, Math.round(cappedPercent * 100));
      break;
    }
    case 'hp_regen': {
      base.hpRegenPerSecondBonus = Math.max(0, additiveBonus);
      break;
    }
    case 'life_steal': {
      base.lifeStealPercent = clamp(additiveBonus, 0, 0.95);
      break;
    }
    case 'critical': {
      base.criticalChanceBonus = clamp(additiveBonus, 0, 0.95);
      break;
    }
    case 'evade': {
      base.evadeChanceBonus = clamp(additiveBonus, 0, 0.95);
      break;
    }
    case 'magic_find': {
      base.magicFindBonus = Math.max(0, additiveBonus);
      break;
    }
    case 'potion_coin_find': {
      base.potionCoinFindBonus = Math.max(0, additiveBonus);
      break;
    }
    case 'mana_regen': {
      base.manaRegenMultiplier = Math.max(0, 1 + additiveBonus);
      break;
    }
    case 'attack_range': {
      base.attackRangeMultiplier = Math.max(0, 1 + additiveBonus);
      break;
    }
    default:
      break;
  }

  return base;
}

function createDefaultModifiers(): RunLevelModifiers {
  return {
    attackSpeedScalar: 1,
    damageMultiplier: 1,
    maxHealthMultiplier: 1,
    maxHealthFlatBonus: 0,
    movementSpeedMultiplier: 1,
    armorBonus: 0,
    lifeStealPercent: 0,
    criticalChanceBonus: 0,
    evadeChanceBonus: 0,
    hpRegenPerSecondBonus: 0,
    manaRegenMultiplier: 1,
    attackRangeMultiplier: 1,
    magicFindBonus: 0,
    potionCoinFindBonus: 0,
  };
}

function normalizeArchetypeId(archetypeId: string | null | undefined): string {
  if (!archetypeId) return 'unknown';
  const normalized = String(archetypeId).toLowerCase();
  return RUN_ARCHETYPES_BY_ID[normalized] ? normalized : 'unknown';
}

function buildRunXpCurve(): number[] {
  const curve: number[] = new Array(RUN_LEVEL_CAP + 1).fill(0);
  for (let level = 1; level < RUN_LEVEL_CAP; level += 1) {
    const baseXp = Math.round(120 + Math.pow(level, 1.2) * 25);
    const xp = Math.round(baseXp * RUN_XP_SCALE);
    curve[level] = Math.max(1, xp);
  }
  curve[RUN_LEVEL_CAP] = 0;
  curve[0] = 0;
  return curve;
}

function buildCumulativeRunXp(): number[] {
  const totals: number[] = new Array(RUN_LEVEL_CAP + 1).fill(0);
  let running = 0;
  for (let level = 1; level <= RUN_LEVEL_CAP; level += 1) {
    totals[level] = running;
    running += XP_CURVE[level];
  }
  return totals;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function getArchetypeDefinition(
  archetypeId: string
): RunArchetypeDefinition | undefined {
  return RUN_ARCHETYPES_BY_ID[archetypeId];
}

export function recalculateRunModifiers(profile: RunProfile): RunProfile {
  const clone = cloneRunProfile(profile);
  clone.modifiers = computeRunModifiers(clone.archetypeId, clone.level);
  clone.updatedAt = Date.now();
  return clone;
}
