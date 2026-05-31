import {
  RUN_ARCHETYPES_BY_ID,
  getRunArchetypeIdForCharacter,
  type RunArchetypeDefinition,
  type RunLevelTraitDefinition,
} from '../../data/archetypes';

const STREAK_UNIT_CAP_DEFAULT = 9999;
const STREAK_UNIT_TRASH_DEFAULT = 2;
const STREAK_UNIT_ELITE_DEFAULT = 20;
const STREAK_UNIT_BOSS_DEFAULT = 10;
const STREAK_DECAY_GRACE_MS_DEFAULT = 10_000;
const STREAK_DECAY_RATE_UNITS_PER_SEC_DEFAULT = 1;

const MIN_ATTACK_SPEED_SCALAR = 0.2;
const MAX_ARMOR_PERCENT = 0.8;

function parseNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const ENABLE_KILL_STREAKS =
  process.env.ENABLE_KILL_STREAKS !== '0' &&
  process.env.ENABLE_KILL_STREAKS !== 'false';

export const STREAK_UNIT_CAP = Math.max(
  0,
  parseNumberEnv('STREAK_UNIT_CAP', STREAK_UNIT_CAP_DEFAULT)
);
export const STREAK_UNIT_TRASH = Math.max(
  0,
  parseNumberEnv('STREAK_UNIT_TRASH', STREAK_UNIT_TRASH_DEFAULT)
);
export const STREAK_UNIT_ELITE = Math.max(
  0,
  parseNumberEnv('STREAK_UNIT_ELITE', STREAK_UNIT_ELITE_DEFAULT)
);
export const STREAK_UNIT_BOSS = Math.max(
  0,
  parseNumberEnv('STREAK_UNIT_BOSS', STREAK_UNIT_BOSS_DEFAULT)
);
export const STREAK_DECAY_GRACE_MS = Math.max(
  0,
  parseNumberEnv('STREAK_DECAY_GRACE_MS', STREAK_DECAY_GRACE_MS_DEFAULT)
);
export const STREAK_DECAY_RATE_UNITS_PER_SEC = Math.max(
  0,
  parseNumberEnv(
    'STREAK_DECAY_RATE_UNITS_PER_SEC',
    STREAK_DECAY_RATE_UNITS_PER_SEC_DEFAULT
  )
);

export interface KillStreakModifiers {
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

export interface KillStreakProfile {
  units: number;
  archetypeId: string;
  modifiers: KillStreakModifiers;
  lastKillAt: number;
  updatedAt: number;
}

interface KillStreakUpdateResult {
  profile: KillStreakProfile;
  deltaUnits: number;
}

export function createKillStreakProfile(
  archetypeId: string,
  now: number = Date.now()
): KillStreakProfile {
  const normalizedId = normalizeArchetypeId(archetypeId);
  return {
    archetypeId: normalizedId,
    units: 0,
    modifiers: computeKillStreakModifiers(normalizedId, 0),
    lastKillAt: 0,
    updatedAt: now,
  };
}

export function cloneKillStreakProfile(
  profile: KillStreakProfile
): KillStreakProfile {
  return {
    units: profile.units,
    archetypeId: profile.archetypeId,
    modifiers: { ...profile.modifiers },
    lastKillAt: profile.lastKillAt,
    updatedAt: profile.updatedAt,
  };
}

export function computeKillStreakModifiers(
  archetypeId: string,
  units: number,
  leverage: number = 1
): KillStreakModifiers {
  const sanitizedUnits = clamp(Math.floor(units), 0, STREAK_UNIT_CAP);
  const leverageScalar = Math.max(1, Number(leverage) || 1);
  const base = createDefaultModifiers();
  const archetype = RUN_ARCHETYPES_BY_ID[archetypeId];
  const trait: RunLevelTraitDefinition | undefined = archetype?.levelTrait;
  if (!trait || trait.type === 'none') {
    return base;
  }

  const valuePerUnit =
    (trait as any).valuePerUnit ?? trait.valuePerLevel ?? 0;
  const maxBonus = trait.cap ?? Number.POSITIVE_INFINITY;
  const additiveBonus = Math.min(maxBonus, valuePerUnit * sanitizedUnits);
  const leveragedBonus = Math.min(
    maxBonus,
    additiveBonus * leverageScalar
  );

  switch (trait.type) {
    case 'damage_multiplier': {
      base.damageMultiplier = Math.max(0, 1 + leveragedBonus);
      break;
    }
    case 'attack_speed': {
      const perUnit = clamp(valuePerUnit, 0, 0.95);
      const effectiveUnits = sanitizedUnits * leverageScalar;
      const scalar = Math.pow(1 - perUnit, effectiveUnits);
      const minScalar =
        typeof trait.cap === 'number'
          ? Math.max(0, 1 - clamp(trait.cap, 0, 0.95))
          : MIN_ATTACK_SPEED_SCALAR;
      base.attackSpeedScalar = clamp(scalar, minScalar, 1);
      break;
    }
    case 'movement_speed': {
      base.movementSpeedMultiplier = Math.max(0, 1 + leveragedBonus);
      break;
    }
    case 'percent_damage_reduction': {
      const cappedPercent = clamp(
        leveragedBonus,
        0,
        Math.min(maxBonus, MAX_ARMOR_PERCENT)
      );
      base.armorBonus = Math.max(0, Math.round(cappedPercent * 100));
      break;
    }
    case 'hp_regen': {
      base.hpRegenPerSecondBonus = Math.max(0, leveragedBonus);
      break;
    }
    case 'life_steal': {
      base.lifeStealPercent = clamp(leveragedBonus, 0, 0.95);
      break;
    }
    case 'critical': {
      base.criticalChanceBonus = clamp(leveragedBonus, 0, 0.95);
      break;
    }
    case 'evade': {
      base.evadeChanceBonus = clamp(leveragedBonus, 0, 0.95);
      break;
    }
    case 'magic_find': {
      base.magicFindBonus = Math.max(0, leveragedBonus);
      break;
    }
    case 'potion_coin_find': {
      base.potionCoinFindBonus = Math.max(0, leveragedBonus);
      break;
    }
    case 'mana_regen': {
      base.manaRegenMultiplier = Math.max(0, 1 + leveragedBonus);
      break;
    }
    case 'attack_range': {
      base.attackRangeMultiplier = Math.max(0, 1 + leveragedBonus);
      break;
    }
    default:
      break;
  }

  return base;
}

export function applyKillStreakIncrement(
  profile: KillStreakProfile,
  unitDelta: number,
  now: number = Date.now()
): KillStreakUpdateResult {
  const sanitizedDelta = Math.max(0, unitDelta);
  if (sanitizedDelta <= 0) {
    const clone = cloneKillStreakProfile(profile);
    clone.updatedAt = now;
    return { profile: clone, deltaUnits: 0 };
  }

  const clone = cloneKillStreakProfile(profile);
  const nextUnits = clamp(clone.units + sanitizedDelta, 0, STREAK_UNIT_CAP);
  const appliedDelta = nextUnits - clone.units;
  if (appliedDelta === 0) {
    clone.updatedAt = now;
    clone.lastKillAt = now;
    return { profile: clone, deltaUnits: 0 };
  }

  clone.units = nextUnits;
  clone.lastKillAt = now;
  clone.updatedAt = now;
  clone.modifiers = computeKillStreakModifiers(clone.archetypeId, nextUnits);
  return { profile: clone, deltaUnits: appliedDelta };
}

export function applyKillStreakDecay(
  profile: KillStreakProfile,
  now: number = Date.now()
): KillStreakUpdateResult {
  const clone = cloneKillStreakProfile(profile);

  if (clone.units <= 0) {
    clone.units = 0;
    clone.updatedAt = now;
    return { profile: clone, deltaUnits: 0 };
  }

  const lastKillAt = clone.lastKillAt || 0;
  const graceUntil =
    lastKillAt > 0 ? lastKillAt + STREAK_DECAY_GRACE_MS : clone.updatedAt;
  if (now <= graceUntil) {
    return { profile: clone, deltaUnits: 0 };
  }

  const decayStart = Math.max(clone.updatedAt, graceUntil);
  const elapsedMs = Math.max(0, now - decayStart);
  if (elapsedMs <= 0 || STREAK_DECAY_RATE_UNITS_PER_SEC <= 0) {
    return { profile: clone, deltaUnits: 0 };
  }

  const unitsToDecay =
    (elapsedMs / 1000) * STREAK_DECAY_RATE_UNITS_PER_SEC;
  if (unitsToDecay <= 0) {
    clone.updatedAt = now;
    return { profile: clone, deltaUnits: 0 };
  }

  const nextUnits = clamp(clone.units - unitsToDecay, 0, STREAK_UNIT_CAP);
  const deltaUnits = nextUnits - clone.units;
  if (deltaUnits === 0) {
    clone.updatedAt = now;
    return { profile: clone, deltaUnits: 0 };
  }

  clone.units = nextUnits;
  clone.updatedAt = now;
  clone.modifiers = computeKillStreakModifiers(clone.archetypeId, nextUnits);

  return { profile: clone, deltaUnits };
}

export function resolveArchetypeForCharacter(
  characterId: string | null | undefined
): string {
  return getRunArchetypeIdForCharacter(characterId);
}

export function getKillStreakUnitDeltaForClassification(
  classification: string | null | undefined
): number {
  const normalized = typeof classification === 'string'
    ? classification.trim().toLowerCase()
    : '';

  if (!normalized) {
    return STREAK_UNIT_TRASH;
  }

  if (normalized === 'elite' || normalized === 'champion') {
    return STREAK_UNIT_ELITE;
  }

  if (normalized === 'boss') {
    return STREAK_UNIT_BOSS;
  }

  return STREAK_UNIT_TRASH;
}

export function getArchetypeDefinition(
  archetypeId: string
): RunArchetypeDefinition | undefined {
  return RUN_ARCHETYPES_BY_ID[archetypeId];
}

export function recalculateKillStreakModifiers(
  profile: KillStreakProfile
): KillStreakProfile {
  const clone = cloneKillStreakProfile(profile);
  clone.modifiers = computeKillStreakModifiers(
    clone.archetypeId,
    clone.units
  );
  clone.updatedAt = Date.now();
  return clone;
}

function createDefaultModifiers(): KillStreakModifiers {
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

function normalizeArchetypeId(
  archetypeId: string | null | undefined
): string {
  if (!archetypeId) return 'unknown';
  const normalized = String(archetypeId).toLowerCase();
  return RUN_ARCHETYPES_BY_ID[normalized] ? normalized : 'unknown';
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
