export const BASE_LEVEL_CAP = 99;
export const LEVEL_CAP = 199;

export type StatKey = 'energy' | 'aggression' | 'spookiness' | 'brainSize';

export interface StatAllocation {
  energy: number;
  aggression: number;
  spookiness: number;
  brainSize: number;
}

export interface ProgressionProfile {
  level: number;
  totalXp: number;
  unspentPoints: number;
  stats: StatAllocation;
  allocationHistory: StatKey[];
  lastSyncedAt?: number;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1 normalized progress toward next level
}

export interface XpGainResult {
  profile: ProgressionProfile;
  levelUps: number;
  previousLevel: number;
  currentLevel: number;
  totalXpAdded: number;
}

export interface LevelLossResult {
  profile: ProgressionProfile;
  levelsLost: number;
  previousLevel: number;
  currentLevel: number;
}

export interface StatSpendResult {
  profile: ProgressionProfile;
  stat: StatKey;
  totalSpent: number;
}

const ENERGY_HASTE_PER_POINT = 0.03; // 3% faster per point (multiplicative)
const ENERGY_MAX_HASTE = 0.6; // 60% reduction cap (final scalar >= 0.4)
const AGGRESSION_DAMAGE_PER_POINT = 0.04; // 4% more damage per point
const SPOOKINESS_FLAT_HP_PER_POINT = 15;
const SPOOKINESS_HP_MULTIPLIER_PER_POINT = 0.02; // +2% max HP per point
const SPOOKINESS_HP_MULTIPLIER_CAP = 1.5; // +150% cap from spookiness multiplier
const BRAIN_SIZE_MANA_PER_POINT = 20;
const BRAIN_SIZE_REGEN_PER_POINT = 0.05; // +5% mana regen per point
const BRAIN_SIZE_COOLDOWN_REFUND_PER_POINT = 0.01; // Placeholder for future abilities

export interface ProgressionModifiers {
  attackSpeedScalar: number; // multiply base cooldown ( <= 1 reduces cooldown )
  damageMultiplier: number;
  maxHealthFlatBonus: number;
  maxHealthMultiplier: number;
  maxManaBonus: number;
  manaRegenMultiplier: number;
  cooldownRefundChance: number;
}

const XP_CURVE: number[] = buildXpCurve();

function buildXpCurve(): number[] {
  const table: number[] = new Array(LEVEL_CAP + 1).fill(0);
  for (let level = 1; level < LEVEL_CAP; level += 1) {
    let xp: number;
    if (level <= 10) {
      xp = 10 * (180 + level * 35); // 10x requirements
    } else if (level <= 20) {
      xp = 10 * (530 + (level - 10) * 85);
    } else if (level <= 40) {
      xp = 10 * (1380 + (level - 20) * 150);
    } else if (level <= 60) {
      xp = 10 * (4380 + (level - 40) * 240);
    } else if (level <= 80) {
      xp = 10 * (9180 + (level - 60) * 360);
    } else if (level < LEVEL_CAP) {
      xp = 10 * (16200 + (level - 80) * 480);
    } else {
      xp = 0;
    }
    table[level] = Math.round(xp);
  }
  table[LEVEL_CAP] = 0;
  table[0] = 0;
  return table;
}

const CUMULATIVE_XP: number[] = buildCumulativeXp();

function resolveLevelCap(levelCap?: number): number {
  if (!Number.isFinite(levelCap)) {
    return LEVEL_CAP;
  }
  return clamp(Math.floor(levelCap as number), 1, LEVEL_CAP);
}

function buildCumulativeXp(): number[] {
  const totals: number[] = new Array(LEVEL_CAP + 1).fill(0);
  let running = 0;
  for (let level = 1; level <= LEVEL_CAP; level += 1) {
    totals[level] = running;
    running += XP_CURVE[level];
  }
  return totals;
}

export function getXpRequiredForLevel(
  level: number,
  levelCap: number = LEVEL_CAP
): number {
  const resolvedLevelCap = resolveLevelCap(levelCap);
  if (level < 1) return XP_CURVE[1];
  if (level >= resolvedLevelCap) return 0;
  return XP_CURVE[level];
}

export function getTotalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= LEVEL_CAP) return CUMULATIVE_XP[LEVEL_CAP];
  return CUMULATIVE_XP[level];
}

export function getLevelProgress(
  totalXp: number,
  levelCap: number = LEVEL_CAP
): LevelProgress {
  const resolvedLevelCap = resolveLevelCap(levelCap);
  const sanitized = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < resolvedLevelCap && sanitized >= CUMULATIVE_XP[level + 1]) {
    level += 1;
  }

  const xpIntoLevel = sanitized - CUMULATIVE_XP[level];
  const xpForNextLevel = getXpRequiredForLevel(level, resolvedLevelCap);
  const progress = xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 0;

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    progress: clamp(progress, 0, 1),
  };
}

export function createDefaultProfile(): ProgressionProfile {
  return {
    level: 1,
    totalXp: 0,
    unspentPoints: 0,
    stats: {
      energy: 0,
      aggression: 0,
      spookiness: 0,
      brainSize: 0,
    },
    allocationHistory: [],
    lastSyncedAt: undefined,
  };
}

export function applyXp(
  profile: ProgressionProfile,
  xpAmount: number,
  levelCap: number = LEVEL_CAP
): XpGainResult {
  const resolvedLevelCap = resolveLevelCap(levelCap);
  const sanitized = Math.max(0, xpAmount);
  const clone = cloneProfile(profile);
  const previousLevel = clone.level;
  clone.totalXp = Math.min(
    CUMULATIVE_XP[resolvedLevelCap],
    Math.max(0, clone.totalXp + sanitized)
  );

  const { level } = getLevelProgress(clone.totalXp, resolvedLevelCap);
  clone.level = level;
  let levelUps = Math.max(0, level - previousLevel);
  if (level === resolvedLevelCap) {
    // cap overflow xp at start of cap level
    clone.totalXp = CUMULATIVE_XP[resolvedLevelCap];
  }

  if (levelUps > 0) {
    clone.unspentPoints += levelUps;
  }

  return {
    profile: clone,
    levelUps,
    previousLevel,
    currentLevel: clone.level,
    totalXpAdded: sanitized,
  };
}

export function applyLevelLoss(
  profile: ProgressionProfile,
  levelsToLose: number
): LevelLossResult {
  const loss = Math.max(0, Math.floor(levelsToLose));
  if (loss === 0) {
    return {
      profile: cloneProfile(profile),
      levelsLost: 0,
      previousLevel: profile.level,
      currentLevel: profile.level,
    };
  }

  const clone = cloneProfile(profile);
  const previousLevel = clone.level;
  const newLevel = Math.max(1, clone.level - loss);
  const actualLoss = previousLevel - newLevel;

  clone.level = newLevel;
  clone.totalXp = CUMULATIVE_XP[newLevel];
  clone.unspentPoints = Math.min(clone.unspentPoints, newLevel - 1);

  let pointsToRemove = actualLoss;
  while (pointsToRemove > 0) {
    if (clone.unspentPoints > 0) {
      clone.unspentPoints -= 1;
    } else if (clone.allocationHistory.length > 0) {
      const stat = clone.allocationHistory.pop()!;
      clone.stats[stat] = Math.max(0, clone.stats[stat] - 1);
    }
    pointsToRemove -= 1;
  }

  return {
    profile: clone,
    levelsLost: actualLoss,
    previousLevel,
    currentLevel: clone.level,
  };
}

export function spendStatPoint(
  profile: ProgressionProfile,
  stat: StatKey
): StatSpendResult {
  if (profile.unspentPoints <= 0) {
    throw new Error('No unspent stat points available');
  }

  const clone = cloneProfile(profile);
  clone.unspentPoints -= 1;
  clone.stats[stat] += 1;
  clone.allocationHistory.push(stat);

  return {
    profile: clone,
    stat,
    totalSpent: clone.stats[stat],
  };
}

export function refundLatestStatPoint(
  profile: ProgressionProfile
): ProgressionProfile {
  if (profile.allocationHistory.length === 0) {
    return cloneProfile(profile);
  }

  const clone = cloneProfile(profile);
  const stat = clone.allocationHistory.pop();
  if (stat) {
    clone.stats[stat] = Math.max(0, clone.stats[stat] - 1);
    clone.unspentPoints += 1;
  }
  return clone;
}

export function resetAllocations(
  profile: ProgressionProfile
): ProgressionProfile {
  const clone = cloneProfile(profile);
  const totalAllocated =
    clone.stats.energy +
    clone.stats.aggression +
    clone.stats.spookiness +
    clone.stats.brainSize;

  clone.stats = {
    energy: 0,
    aggression: 0,
    spookiness: 0,
    brainSize: 0,
  };
  clone.unspentPoints += totalAllocated;
  clone.allocationHistory = [];
  return clone;
}

export function computeProgressionModifiers(
  stats: StatAllocation
): ProgressionModifiers {
  const energy = Math.max(0, stats.energy);
  const aggression = Math.max(0, stats.aggression);
  const spookiness = Math.max(0, stats.spookiness);
  const brainSize = Math.max(0, stats.brainSize);

  const haste = Math.min(energy * ENERGY_HASTE_PER_POINT, ENERGY_MAX_HASTE);
  const attackSpeedScalar = clamp(1 - haste, 0.4, 1);

  const damageMultiplier = 1 + aggression * AGGRESSION_DAMAGE_PER_POINT;

  const maxHealthMultiplier = clamp(
    1 + spookiness * SPOOKINESS_HP_MULTIPLIER_PER_POINT,
    1,
    1 + SPOOKINESS_HP_MULTIPLIER_CAP
  );
  const maxHealthFlatBonus = spookiness * SPOOKINESS_FLAT_HP_PER_POINT;

  const maxManaBonus = brainSize * BRAIN_SIZE_MANA_PER_POINT;
  const manaRegenMultiplier = 1 + brainSize * BRAIN_SIZE_REGEN_PER_POINT;
  const cooldownRefundChance = clamp(
    brainSize * BRAIN_SIZE_COOLDOWN_REFUND_PER_POINT,
    0,
    0.4
  );

  return {
    attackSpeedScalar,
    damageMultiplier,
    maxHealthFlatBonus,
    maxHealthMultiplier,
    maxManaBonus,
    manaRegenMultiplier,
    cooldownRefundChance,
  };
}

export function getXpCurve(): readonly number[] {
  return XP_CURVE;
}

export function getCumulativeXpTable(): readonly number[] {
  return CUMULATIVE_XP;
}

export function cloneProfile(profile: ProgressionProfile): ProgressionProfile {
  return {
    level: profile.level,
    totalXp: profile.totalXp,
    unspentPoints: profile.unspentPoints,
    stats: { ...profile.stats },
    allocationHistory: [...profile.allocationHistory],
    lastSyncedAt: profile.lastSyncedAt,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeProfile(
  input: Partial<ProgressionProfile> | null | undefined,
  levelCap: number = LEVEL_CAP
): ProgressionProfile {
  const resolvedLevelCap = resolveLevelCap(levelCap);
  if (!input || typeof input !== 'object') {
    return createDefaultProfile();
  }
  const base = createDefaultProfile();
  const stats = input.stats || base.stats;
  const safeStats: StatAllocation = {
    energy: sanitizeInt(stats.energy),
    aggression: sanitizeInt(stats.aggression),
    spookiness: sanitizeInt(stats.spookiness),
    brainSize: sanitizeInt(stats.brainSize),
  };
  const sanitized: ProgressionProfile = {
    level: clamp(Math.floor(input.level ?? base.level), 1, resolvedLevelCap),
    totalXp: Math.min(
      CUMULATIVE_XP[resolvedLevelCap],
      Math.max(0, Math.floor(input.totalXp ?? base.totalXp))
    ),
    unspentPoints: Math.max(0, Math.floor(input.unspentPoints ?? 0)),
    stats: safeStats,
    allocationHistory: Array.isArray(input.allocationHistory)
      ? input.allocationHistory
          .map((value) =>
            value === 'energy' ||
            value === 'aggression' ||
            value === 'spookiness' ||
            value === 'brainSize'
              ? value
              : null
          )
          .filter((value): value is StatKey => value !== null)
      : [],
    lastSyncedAt:
      typeof input.lastSyncedAt === 'number' &&
      Number.isFinite(input.lastSyncedAt)
        ? input.lastSyncedAt
        : undefined,
  };

  const { level } = getLevelProgress(sanitized.totalXp, resolvedLevelCap);
  sanitized.level = level;

  const totalAllocated =
    safeStats.energy +
    safeStats.aggression +
    safeStats.spookiness +
    safeStats.brainSize;
  const maxPoints = Math.max(0, level - 1);

  if (totalAllocated + sanitized.unspentPoints > maxPoints) {
    const overflow = totalAllocated + sanitized.unspentPoints - maxPoints;
    sanitized.unspentPoints = Math.max(0, sanitized.unspentPoints - overflow);
  }

  return sanitized;
}

function sanitizeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function toSerializableProfile(
  profile: ProgressionProfile
): ProgressionProfile {
  return cloneProfile(profile);
}
