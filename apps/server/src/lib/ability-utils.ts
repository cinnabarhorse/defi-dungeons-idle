import {
  getCharacterStats,
  type AbilityReference,
  type CharacterDerivedStats,
} from './character-registry';
import type {
  PoisonParams,
  SlowParams,
  SlowStackingMode,
  StunParams,
  ThornsParams,
} from '../data/abilities';
import { ENEMY_TYPES } from '../data/enemies';

export interface AggregatedCrit {
  chance: number;
  multiplier: number;
}

export interface AggregatedCleave {
  enabled: boolean;
  damageMultiplier: number; // 1 = 100%
  maxTargets?: number; // undefined = unlimited
  coneAngleDeg?: number; // optional override
  includeBreakables: boolean;
}

export interface AggregatedEvade {
  chance: number;
  cooldownMs?: number;
}

export interface AggregatedThorns {
  percent: number;
}

export interface AggregatedLifeSteal {
  percent: number;
}

export interface AggregatedMoveSpeed {
  multiplier: number;
}

export interface AggregatedAttackSpeed {
  multiplier: number;
}

export interface AggregatedDamageMultiplier {
  multiplier: number;
}

export interface AggregatedDamageReduction {
  armor: number;
}

export interface AggregatedRegen {
  perSecond: number;
}

export interface AggregatedVisionRadius {
  multiplier: number;
}

export interface AggregatedPotionFarm {
  enabled: boolean;
  enableReweight: boolean;
  enableExtraRoll: boolean;
  potionWeightMultiplier: number;
  extraRollChance: number;
  maxExtraChanceCap: number;
  hpToManaBias: number;
}

export interface AggregatedGoldFarm {
  enabled: boolean;
  enableReweight: boolean;
  enableExtraRoll: boolean;
  coinWeightMultiplier: number;
  extraRollChance: number;
  maxExtraChanceCap: number;
  amountMultiplier: number;
}

export interface AggregatedTongueFarm {
  bonusChance: number;
}

export interface AggregatedSlow {
  amount: number;
  durationMs: number;
  chance: number;
  appliesTo: 'melee' | 'ranged' | 'all';
  stacking: SlowStackingMode;
  maxStacks?: number;
  minSpeedScalar?: number;
  sourceKey: string;
}

export interface AggregatedStun {
  chance: number;
  durationMs: number;
  appliesTo: 'melee' | 'ranged' | 'grenades' | 'all';
  sourceKey: string;
  abilitySourceId?: string;
}

export interface AggregatedPoison {
  chance: number;
  durationMs: number;
  damagePerTick: number;
  tickIntervalMs: number;
  appliesTo: 'melee' | 'ranged' | 'all';
  sourceKey: string;
  abilitySourceId?: string;
}

const DEFAULT_TONGUE_FARM_TAGS = ['lickquidator'];
const MAX_TONGUE_FARM_BONUS = 0.25;
const SLOW_STACKING_MODES: SlowStackingMode[] = [
  'refresh',
  'extend',
  'strongest',
];
const DEFAULT_SLOW_AMOUNT = 0.25;
const DEFAULT_SLOW_DURATION_MS = 2000;
const DEFAULT_SLOW_CHANCE = 1;
const DEFAULT_STUN_CHANCE = 0.2;
const DEFAULT_STUN_DURATION_MS = 1250;
const DEFAULT_POISON_CHANCE = 0.25;
const DEFAULT_POISON_DURATION_MS = 3000;
const DEFAULT_POISON_TICK_INTERVAL_MS = 1000;
const DEFAULT_POISON_DPS = 5;
const MAX_THORNS_PERCENT = 0.5;

type WeaponStatsSource = Partial<
  Pick<CharacterDerivedStats, 'activeWeapon' | 'weapons'>
> & {
  activeWeaponSlug?: string | null;
};

function normalizeWeaponSlug(slug: unknown): string | undefined {
  if (typeof slug !== 'string') return undefined;
  const trimmed = slug.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getAbilitiesForWeapon(
  stats: WeaponStatsSource | undefined,
  explicitSlug?: string
): AbilityReference[] {
  if (!stats) return [];

  const activeSlug =
    normalizeWeaponSlug(explicitSlug) ||
    normalizeWeaponSlug(
      (stats.activeWeapon as { slug?: string } | undefined)?.slug
    ) ||
    normalizeWeaponSlug(stats.activeWeaponSlug);

  const weapons = Array.isArray(stats.weapons) ? stats.weapons : [];

  if (activeSlug) {
    const fromList = weapons.find(
      (weapon) => normalizeWeaponSlug((weapon as any)?.slug) === activeSlug
    );
    const weapon =
      (fromList as any) ||
      (normalizeWeaponSlug(
        (stats.activeWeapon as { slug?: string } | undefined)?.slug
      ) === activeSlug
        ? stats.activeWeapon
        : undefined);
    if (weapon && Array.isArray((weapon as any).abilities)) {
      return (weapon as any).abilities;
    }
  }

  if (
    stats.activeWeapon &&
    Array.isArray((stats.activeWeapon as any).abilities)
  ) {
    return (stats.activeWeapon as any).abilities;
  }

  return [];
}

function resolveWeaponAbilities(
  characterId: string,
  weaponSlug: string | undefined,
  statsOverride?: WeaponStatsSource | null
): AbilityReference[] {
  if (statsOverride) {
    return getAbilitiesForWeapon(statsOverride, weaponSlug);
  }
  const stats = getCharacterStats(characterId || 'coderdan', {
    activeWeaponSlug: weaponSlug,
  });
  return getAbilitiesForWeapon(stats, weaponSlug);
}

function createDefaultPotionFarmAggregation(): AggregatedPotionFarm {
  return {
    enabled: false,
    enableReweight: false,
    enableExtraRoll: false,
    potionWeightMultiplier: 1,
    extraRollChance: 0,
    maxExtraChanceCap: 0,
    hpToManaBias: 0.5,
  };
}

function createDefaultGoldFarmAggregation(): AggregatedGoldFarm {
  return {
    enabled: false,
    enableReweight: false,
    enableExtraRoll: false,
    coinWeightMultiplier: 1,
    extraRollChance: 0,
    maxExtraChanceCap: 0,
    amountMultiplier: 1,
  };
}

export function aggregateCriticalStrike(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged'
): AggregatedCrit {
  let totalChance = 0;
  let bonusPortion = 0; // Sum of (multiplier - 1)

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'critical-strike') continue;
      const params = ability.params || {};
      const appliesTo = params.appliesTo || 'all';
      if (appliesTo !== 'all' && appliesTo !== weaponType) continue;

      const chance = typeof params.chance === 'number' ? params.chance : 0;
      const mult =
        typeof params.multiplier === 'number' ? params.multiplier : 1;
      totalChance += Math.max(0, chance);
      if (mult > 1) bonusPortion += mult - 1;
    }
  }

  const finalMultiplier = 1 + Math.max(0, bonusPortion);
  return {
    chance: Math.max(0, totalChance),
    multiplier: finalMultiplier,
  };
}

export function aggregateEvade(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged'
): AggregatedEvade {
  let totalChance = 0;
  let cooldownMs = 0;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'evade') continue;
      const params = ability.params || {};
      const chance = typeof params.chance === 'number' ? params.chance : 0;
      if (!Number.isFinite(chance)) continue;
      totalChance += Math.max(0, chance);
      const cooldown =
        typeof params.cooldownMs === 'number'
          ? params.cooldownMs
          : typeof params.internalCooldownMs === 'number'
            ? params.internalCooldownMs
            : 0;
      if (Number.isFinite(cooldown) && cooldown > 0) {
        cooldownMs = Math.max(cooldownMs, cooldown);
      }
    }
  }

  return {
    chance: Math.max(0, Math.min(1, totalChance)),
    cooldownMs: cooldownMs > 0 ? cooldownMs : undefined,
  };
}

export function aggregateThorns(
  abilities: AbilityReference[] | undefined,
  incomingType: 'melee' | 'ranged' | 'all' = 'all'
): AggregatedThorns {
  let percent = 0;
  if (!Array.isArray(abilities)) {
    return { percent: 0 };
  }

  for (const ability of abilities) {
    if (!ability || ability.id !== 'thorns') continue;
    const params = (ability.params || {}) as ThornsParams;
    const appliesFrom = params.appliesFrom || 'all';
    if (incomingType !== 'all' && appliesFrom !== 'all') {
      if (appliesFrom !== incomingType) continue;
    }
    const value = typeof params.percent === 'number' ? params.percent : 0;
    if (!Number.isFinite(value) || value <= 0) continue;
    percent += value;
  }

  return { percent: Math.max(0, Math.min(MAX_THORNS_PERCENT, percent)) };
}

export function aggregateLifeSteal(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged'
): AggregatedLifeSteal {
  let percent = 0;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'life-steal') continue;
      const params = ability.params || {};
      const appliesTo = params.appliesTo || 'melee';
      if (appliesTo !== 'all' && appliesTo !== weaponType) continue;
      const pct = typeof params.percent === 'number' ? params.percent : 0;
      if (!Number.isFinite(pct) || pct <= 0) continue;
      percent += pct;
    }
  }

  return { percent: Math.max(0, percent) };
}

export function aggregateMoveSpeed(
  abilities: AbilityReference[] | undefined
): AggregatedMoveSpeed {
  let multiplier = 1;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'move-speed') continue;
      const params = ability.params || {};
      const mult =
        typeof params.multiplier === 'number' ? params.multiplier : 1;
      if (!Number.isFinite(mult) || mult <= 0) continue;
      multiplier *= mult;
    }
  }

  return { multiplier: Math.max(0, multiplier) };
}

export function aggregateAttackSpeed(
  abilities: AbilityReference[] | undefined
): AggregatedAttackSpeed {
  let multiplier = 1;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'attack-speed') continue;
      const params = ability.params || {};
      const mult =
        typeof params.multiplier === 'number' ? params.multiplier : 1;
      if (!Number.isFinite(mult) || mult <= 0) continue;
      multiplier *= mult;
    }
  }

  return { multiplier: Math.max(0, multiplier) };
}

export function aggregateDamageMultiplier(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged'
): AggregatedDamageMultiplier {
  let multiplier = 1;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'damage-multiplier') continue;
      const params = ability.params || {};
      const appliesTo = params.appliesTo || 'all';
      if (appliesTo !== 'all' && appliesTo !== weaponType) continue;
      const mult =
        typeof params.multiplier === 'number' ? params.multiplier : 1;
      if (!Number.isFinite(mult) || mult <= 0) continue;
      multiplier *= mult;
    }
  }

  return { multiplier: Math.max(0, multiplier) };
}

export function aggregateDamageReduction(
  abilities: AbilityReference[] | undefined
): AggregatedDamageReduction {
  let armor = 0;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'damage-reduction') continue;
      const params = ability.params || {};
      if (typeof params.armor === 'number' && Number.isFinite(params.armor)) {
        armor += params.armor;
        continue;
      }
      if (
        typeof params.percent === 'number' &&
        Number.isFinite(params.percent)
      ) {
        armor += Math.round(params.percent * 100);
        continue;
      }
      if (
        typeof params.reduction === 'number' &&
        Number.isFinite(params.reduction)
      ) {
        armor += params.reduction;
      }
    }
  }

  return { armor: Math.max(0, armor) };
}

export function aggregateRegen(
  abilities: AbilityReference[] | undefined
): AggregatedRegen {
  let perSecond = 0;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'regen') continue;
      const params = ability.params || {};
      const value = typeof params.perSecond === 'number' ? params.perSecond : 0;
      if (!Number.isFinite(value) || value <= 0) continue;
      perSecond += value;
    }
  }

  return { perSecond: Math.max(0, perSecond) };
}

export function aggregateAugmentedVision(
  abilities: AbilityReference[] | undefined
): AggregatedVisionRadius {
  let multiplier = 1;

  if (Array.isArray(abilities)) {
    for (const ability of abilities) {
      if (!ability || ability.id !== 'augmented-vision') continue;
      const params = ability.params || {};
      const mult =
        typeof params.multiplier === 'number' ? params.multiplier : 1;
      if (Number.isFinite(mult) && mult > 0) {
        multiplier *= mult;
      }
    }
  }

  return { multiplier: Math.max(0, multiplier) };
}

export function aggregatePotionFarm(
  abilities: AbilityReference[] | undefined
): AggregatedPotionFarm {
  const result = createDefaultPotionFarmAggregation();
  if (!Array.isArray(abilities)) return result;

  let totalExtraChance = 0;
  let maxCap = 0;
  let biasDefined = false;

  for (const ability of abilities) {
    if (!ability || ability.id !== 'potion-farm') continue;
    const params = ability.params || {};

    const modeRaw = typeof params.mode === 'string' ? params.mode : 'both';
    const enableReweight = modeRaw === 'reweight' || modeRaw === 'both';
    const enableExtra = modeRaw === 'extra-roll' || modeRaw === 'both';

    if (enableReweight) {
      result.enableReweight = true;
      const mult = params.potionWeightMultiplier;
      if (typeof mult === 'number' && Number.isFinite(mult) && mult > 0) {
        result.potionWeightMultiplier = Math.max(
          result.potionWeightMultiplier,
          mult
        );
      }
    }

    if (enableExtra) {
      result.enableExtraRoll = true;
      const extra = params.extraPotionRollChance;
      if (typeof extra === 'number' && Number.isFinite(extra) && extra > 0) {
        totalExtraChance += extra;
      }
      const cap = params.maxExtraChanceCap;
      if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
        maxCap = Math.max(maxCap, cap);
      }
    }

    const bias = params.hpToManaBias;
    if (typeof bias === 'number' && Number.isFinite(bias)) {
      const clamped = Math.min(1, Math.max(0, bias));
      if (!biasDefined) {
        result.hpToManaBias = clamped;
        biasDefined = true;
      }
    }
  }

  if (result.enableExtraRoll) {
    if (maxCap > 0) {
      result.maxExtraChanceCap = maxCap;
      result.extraRollChance = Math.min(totalExtraChance, maxCap);
    } else {
      result.extraRollChance = totalExtraChance;
    }
  }

  result.enabled = result.enableReweight || result.enableExtraRoll;
  result.hpToManaBias = Math.min(1, Math.max(0, result.hpToManaBias));
  result.potionWeightMultiplier = Math.max(0, result.potionWeightMultiplier);
  result.extraRollChance = Math.max(0, result.extraRollChance);

  return result;
}

export function aggregateGoldFarm(
  abilities: AbilityReference[] | undefined
): AggregatedGoldFarm {
  const result = createDefaultGoldFarmAggregation();
  if (!Array.isArray(abilities)) return result;

  let totalExtraChance = 0;
  let maxCap = 0;

  for (const ability of abilities) {
    if (!ability || ability.id !== 'gold-farm') continue;
    const params = ability.params || {};

    const modeRaw = typeof params.mode === 'string' ? params.mode : 'both';
    const enableReweight = modeRaw === 'reweight' || modeRaw === 'both';
    const enableExtra = modeRaw === 'extra-roll' || modeRaw === 'both';

    if (enableReweight) {
      result.enableReweight = true;
      const mult = params.coinWeightMultiplier;
      if (typeof mult === 'number' && Number.isFinite(mult) && mult > 0) {
        result.coinWeightMultiplier = Math.max(result.coinWeightMultiplier, mult);
      }
    }

    if (enableExtra) {
      result.enableExtraRoll = true;
      const extra = params.extraCoinRollChance;
      if (typeof extra === 'number' && Number.isFinite(extra) && extra > 0) {
        totalExtraChance += extra;
      }
      const cap = params.maxExtraChanceCap;
      if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
        maxCap = Math.max(maxCap, cap);
      }
    }

    const amountMult = params.amountMultiplier;
    if (typeof amountMult === 'number' && Number.isFinite(amountMult)) {
      result.amountMultiplier = Math.max(result.amountMultiplier, amountMult);
    }
  }

  if (result.enableExtraRoll) {
    result.maxExtraChanceCap = maxCap;
    result.extraRollChance =
      maxCap > 0 ? Math.min(totalExtraChance, maxCap) : totalExtraChance;
  }

  result.enabled = result.enableReweight || result.enableExtraRoll;
  result.coinWeightMultiplier = Math.max(0, result.coinWeightMultiplier);
  result.extraRollChance = Math.max(0, result.extraRollChance);
  result.amountMultiplier = Math.max(0, result.amountMultiplier);

  return result;
}

export function aggregateTongueFarm(
  abilities: AbilityReference[] | undefined,
  enemyTags: readonly string[] | undefined
): AggregatedTongueFarm {
  if (!Array.isArray(abilities) || abilities.length === 0) {
    return { bonusChance: 0 };
  }

  const tags = Array.isArray(enemyTags) ? enemyTags : [];
  const tagSet = tags.length > 0 ? new Set(tags) : null;
  let totalBonus = 0;

  for (const ability of abilities) {
    if (!ability || ability.id !== 'tongue-farm') continue;
    const params = ability.params || {};

    const appliesRaw = params.appliesToEnemyTags;
    const appliesTo = Array.isArray(appliesRaw)
      ? appliesRaw.filter((tag) => typeof tag === 'string' && tag.length > 0)
      : DEFAULT_TONGUE_FARM_TAGS;

    if (appliesTo.length > 0 && tagSet) {
      let matches = false;
      for (const tag of appliesTo) {
        if (tagSet.has(tag)) {
          matches = true;
          break;
        }
      }
      if (!matches) continue;
    } else if (appliesTo.length > 0 && !tagSet) {
      continue;
    }

    const bonus = params.bonusChance;
    if (typeof bonus !== 'number' || !Number.isFinite(bonus) || bonus <= 0) {
      continue;
    }

    const sourceCap = params.maxBonus;
    const contribution =
      typeof sourceCap === 'number' &&
      Number.isFinite(sourceCap) &&
      sourceCap >= 0
        ? Math.min(bonus, sourceCap)
        : bonus;
    totalBonus += Math.max(0, contribution);
  }

  return {
    bonusChance: Math.max(0, Math.min(MAX_TONGUE_FARM_BONUS, totalBonus)),
  };
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeSlowStackingMode(value: unknown): SlowStackingMode {
  if (typeof value !== 'string') {
    return 'strongest';
  }
  const lower = value.toLowerCase() as SlowStackingMode;
  return SLOW_STACKING_MODES.includes(lower) ? lower : 'strongest';
}

type NormalizedSlowParams = Omit<AggregatedSlow, 'sourceKey'>;

function normalizeSlowParams(
  raw: SlowParams | Record<string, any> | undefined
): NormalizedSlowParams | null {
  const params = (raw || {}) as SlowParams & Record<string, any>;

  const amountRaw = Number(params.amount);
  const amount = Number.isFinite(amountRaw) ? amountRaw : DEFAULT_SLOW_AMOUNT;
  const clampedAmount = Math.min(0.95, Math.max(0, amount));
  if (clampedAmount <= 0) {
    return null;
  }

  const durationRaw = Number(params.durationMs);
  const durationMs = Number.isFinite(durationRaw)
    ? Math.max(1, Math.round(durationRaw))
    : DEFAULT_SLOW_DURATION_MS;
  if (durationMs <= 0) {
    return null;
  }

  const chanceRaw =
    params.chance === undefined ? DEFAULT_SLOW_CHANCE : Number(params.chance);
  const chance = clamp01(chanceRaw, DEFAULT_SLOW_CHANCE);
  if (chance <= 0) {
    return null;
  }

  const appliesToRaw = params.appliesTo;
  const appliesTo =
    appliesToRaw === 'melee' || appliesToRaw === 'ranged'
      ? appliesToRaw
      : 'all';

  const stackingRaw = params.stacking;
  const stacking = normalizeSlowStackingMode(stackingRaw);

  const maxStacksRaw = params.maxStacks;
  const maxStacks =
    typeof maxStacksRaw === 'number' && Number.isFinite(maxStacksRaw)
      ? Math.max(1, Math.floor(maxStacksRaw))
      : undefined;

  const minSpeedScalarRaw = params.minSpeedScalar;
  const minSpeedScalar =
    typeof minSpeedScalarRaw === 'number' && Number.isFinite(minSpeedScalarRaw)
      ? clamp01(minSpeedScalarRaw, 0)
      : undefined;

  return {
    amount: clampedAmount,
    durationMs,
    chance,
    appliesTo,
    stacking,
    maxStacks,
    minSpeedScalar,
  };
}

function aggregateSlow(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged',
  options?: { sourceKeyPrefix?: string }
): AggregatedSlow[] {
  if (!Array.isArray(abilities) || abilities.length === 0) {
    return [];
  }

  const prefix = options?.sourceKeyPrefix ?? 'slow';
  const result: AggregatedSlow[] = [];

  abilities.forEach((ability, idx) => {
    if (!ability || ability.id !== 'slow') return;
    if (ability.kind && ability.kind !== 'passive') return;
    const normalized = normalizeSlowParams(
      (ability as any).params as SlowParams | undefined
    );
    if (!normalized) return;
    if (normalized.appliesTo !== 'all' && normalized.appliesTo !== weaponType) {
      return;
    }

    const rawParams = (ability as any).params || {};
    const explicitSource =
      typeof rawParams.sourceId === 'string'
        ? rawParams.sourceId
        : typeof rawParams.source === 'string'
          ? rawParams.source
          : undefined;
    const sourceKey =
      explicitSource && explicitSource.length > 0
        ? `${prefix}:${explicitSource}`
        : `${prefix}:${idx}`;

    result.push({
      ...normalized,
      sourceKey,
    });
  });

  return result;
}

export function getPlayerSlow(
  characterId: string,
  weaponType: 'melee' | 'ranged',
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedSlow[] {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateSlow(abilities, weaponType, {
      sourceKeyPrefix: `player:${characterId}:${weaponType}`,
    });
  } catch {
    return [];
  }
}

export function getEnemySlow(
  enemyType: string,
  weaponType: 'melee' | 'ranged'
): AggregatedSlow[] {
  try {
    const base = ENEMY_TYPES?.[enemyType];
    return aggregateSlow(base?.abilities, weaponType, {
      sourceKeyPrefix: `enemy:${enemyType}:${weaponType}`,
    });
  } catch {
    return [];
  }
}

type NormalizedStunParams = {
  chance: number;
  durationMs: number;
  appliesTo: 'melee' | 'ranged' | 'grenades' | 'all';
  abilitySourceId?: string;
};

function normalizeStunParams(
  raw: StunParams | Record<string, any> | undefined
): NormalizedStunParams | null {
  const params = (raw || {}) as StunParams & Record<string, any>;

  const chanceRaw =
    params.chance === undefined ? DEFAULT_STUN_CHANCE : Number(params.chance);
  const chance = clamp01(chanceRaw, DEFAULT_STUN_CHANCE);
  if (chance <= 0) {
    return null;
  }

  const durationRaw = Number(params.durationMs);
  const durationMs = Number.isFinite(durationRaw)
    ? Math.max(1, Math.round(durationRaw))
    : DEFAULT_STUN_DURATION_MS;
  if (durationMs <= 0) {
    return null;
  }

  const appliesRaw = params.appliesTo;
  const appliesTo =
    appliesRaw === 'all' ||
    appliesRaw === 'melee' ||
    appliesRaw === 'ranged' ||
    appliesRaw === 'grenades'
      ? appliesRaw
      : 'melee';

  const abilitySourceId =
    typeof params.sourceId === 'string' && params.sourceId.length > 0
      ? params.sourceId
      : undefined;

  return {
    chance,
    durationMs,
    appliesTo,
    abilitySourceId,
  };
}

function aggregateStun(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged' | 'grenades',
  options?: { sourceKeyPrefix?: string }
): AggregatedStun[] {
  if (!Array.isArray(abilities) || abilities.length === 0) {
    return [];
  }

  const prefix = options?.sourceKeyPrefix ?? 'stun';
  const result: AggregatedStun[] = [];

  abilities.forEach((ability, idx) => {
    if (!ability || ability.id !== 'stun') return;
    const normalized = normalizeStunParams(
      (ability as any).params as StunParams | undefined
    );
    if (!normalized) return;
    if (normalized.appliesTo !== 'all' && normalized.appliesTo !== weaponType) {
      return;
    }
    const rawParams = (ability as any).params || {};
    const explicitSource =
      typeof rawParams.sourceId === 'string' && rawParams.sourceId.length > 0
        ? rawParams.sourceId
        : undefined;
    const sourceKey =
      explicitSource && explicitSource.length > 0
        ? `${prefix}:${explicitSource}`
        : `${prefix}:${idx}`;

    result.push({
      chance: normalized.chance,
      durationMs: normalized.durationMs,
      appliesTo: normalized.appliesTo,
      sourceKey,
      abilitySourceId: normalized.abilitySourceId ?? explicitSource,
    });
  });

  return result;
}

type NormalizedPoisonParams = Omit<
  AggregatedPoison,
  'sourceKey' | 'abilitySourceId'
> & { abilitySourceId?: string };

function normalizePoisonParams(
  raw: PoisonParams | Record<string, any> | undefined
): NormalizedPoisonParams | null {
  const params = (raw || {}) as PoisonParams & Record<string, any>;

  const chanceRaw =
    params.chance === undefined ? DEFAULT_POISON_CHANCE : Number(params.chance);
  const chance = clamp01(chanceRaw, DEFAULT_POISON_CHANCE);
  if (chance <= 0) {
    return null;
  }

  const durationRaw = Number(params.durationMs);
  const durationMs = Number.isFinite(durationRaw)
    ? Math.max(1, Math.round(durationRaw))
    : DEFAULT_POISON_DURATION_MS;
  if (durationMs <= 0) {
    return null;
  }

  const tickRaw = Number(params.tickIntervalMs);
  const tickIntervalMs = Number.isFinite(tickRaw)
    ? Math.max(100, Math.round(tickRaw))
    : DEFAULT_POISON_TICK_INTERVAL_MS;
  if (tickIntervalMs <= 0) {
    return null;
  }

  const dpsRaw = Number(params.damagePerSecond);
  const damagePerSecond = Number.isFinite(dpsRaw)
    ? dpsRaw
    : DEFAULT_POISON_DPS;
  const damagePerTick = Math.round(
    damagePerSecond * (tickIntervalMs / 1000)
  );
  if (damagePerTick <= 0) {
    return null;
  }

  const appliesRaw = params.appliesTo;
  const appliesTo =
    appliesRaw === 'all' || appliesRaw === 'melee' || appliesRaw === 'ranged'
      ? appliesRaw
      : 'melee';

  const abilitySourceId =
    typeof params.sourceId === 'string' && params.sourceId.length > 0
      ? params.sourceId
      : undefined;

  return {
    chance,
    durationMs,
    damagePerTick,
    tickIntervalMs,
    appliesTo,
    abilitySourceId,
  };
}

function aggregatePoison(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged',
  options?: { sourceKeyPrefix?: string }
): AggregatedPoison[] {
  if (!Array.isArray(abilities) || abilities.length === 0) {
    return [];
  }

  const prefix = options?.sourceKeyPrefix ?? 'poison';
  const result: AggregatedPoison[] = [];

  abilities.forEach((ability, idx) => {
    if (!ability || ability.id !== 'poison') return;
    const normalized = normalizePoisonParams(
      (ability as any).params as PoisonParams | undefined
    );
    if (!normalized) return;
    if (normalized.appliesTo !== 'all' && normalized.appliesTo !== weaponType) {
      return;
    }

    const rawParams = (ability as any).params || {};
    const explicitSource =
      typeof rawParams.sourceId === 'string' && rawParams.sourceId.length > 0
        ? rawParams.sourceId
        : undefined;
    const sourceKey =
      explicitSource && explicitSource.length > 0
        ? `${prefix}:${explicitSource}`
        : `${prefix}:${idx}`;

    result.push({
      chance: normalized.chance,
      durationMs: normalized.durationMs,
      damagePerTick: normalized.damagePerTick,
      tickIntervalMs: normalized.tickIntervalMs,
      appliesTo: normalized.appliesTo,
      sourceKey,
      abilitySourceId: normalized.abilitySourceId ?? explicitSource,
    });
  });

  return result;
}

export function getEnemyPoison(
  enemyType: string,
  weaponType: 'melee' | 'ranged'
): AggregatedPoison[] {
  try {
    const base = ENEMY_TYPES?.[enemyType];
    return aggregatePoison(base?.abilities, weaponType, {
      sourceKeyPrefix: `enemy:${enemyType}:${weaponType}:poison`,
    });
  } catch {
    return [];
  }
}

export function getPlayerPoison(
  characterId: string,
  weaponType: 'melee' | 'ranged',
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedPoison[] {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregatePoison(abilities, weaponType, {
      sourceKeyPrefix: `player:${characterId}:${weaponType}:poison`,
    });
  } catch {
    return [];
  }
}

export function getPlayerStun(
  characterId: string,
  weaponType: 'melee' | 'ranged' | 'grenades',
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedStun[] {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateStun(abilities, weaponType, {
      sourceKeyPrefix: `player:${characterId}:${weaponType}:stun`,
    });
  } catch {
    return [];
  }
}

export function getEnemyStun(
  enemyType: string,
  weaponType: 'melee' | 'ranged' | 'grenades'
): AggregatedStun[] {
  try {
    const base = ENEMY_TYPES?.[enemyType];
    return aggregateStun(base?.abilities, weaponType, {
      sourceKeyPrefix: `enemy:${enemyType}:${weaponType}:stun`,
    });
  } catch {
    return [];
  }
}

export function getPlayerCrit(
  characterId: string,
  weaponType: 'melee' | 'ranged',
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedCrit {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateCriticalStrike(abilities, weaponType);
  } catch {
    return { chance: 0, multiplier: 1 };
  }
}

export function getPlayerCritForWeapon(
  characterId: string,
  weaponType: 'melee' | 'ranged',
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedCrit {
  return getPlayerCrit(characterId, weaponType, weaponSlug, statsOverride);
}

export function getPlayerEvade(
  characterId: string,
  weaponType: 'melee' | 'ranged'
): AggregatedEvade {
  try {
    const stats = getCharacterStats(characterId || 'coderdan');
    return aggregateEvade(stats.abilities, weaponType);
  } catch {
    return { chance: 0 };
  }
}

export function getPlayerThorns(
  characterId: string,
  statsOverride?: Partial<Pick<CharacterDerivedStats, 'abilities'>> | null,
  incomingType: 'melee' | 'ranged' | 'all' = 'all'
): AggregatedThorns {
  try {
    const abilities =
      statsOverride?.abilities ??
      getCharacterStats(characterId || 'coderdan').abilities;
    return aggregateThorns(abilities, incomingType);
  } catch {
    return { percent: 0 };
  }
}

export function getPlayerLifeSteal(
  characterId: string,
  weaponType: 'melee' | 'ranged',
  weaponSlug: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedLifeSteal {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateLifeSteal(abilities, weaponType);
  } catch {
    return { percent: 0 };
  }
}

export function getPlayerPotionFarm(
  characterId: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedPotionFarm {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      undefined,
      statsOverride
    );
    return aggregatePotionFarm(abilities);
  } catch {
    return createDefaultPotionFarmAggregation();
  }
}

export function getPlayerGoldFarm(
  characterId: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedGoldFarm {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      undefined,
      statsOverride
    );
    return aggregateGoldFarm(abilities);
  } catch {
    return createDefaultGoldFarmAggregation();
  }
}

export function getPlayerPotionFarmForWeapon(
  characterId: string,
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedPotionFarm {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregatePotionFarm(abilities);
  } catch {
    return createDefaultPotionFarmAggregation();
  }
}

export function getPlayerGoldFarmForWeapon(
  characterId: string,
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedGoldFarm {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateGoldFarm(abilities);
  } catch {
    return createDefaultGoldFarmAggregation();
  }
}

export function getPlayerRegen(characterId: string): AggregatedRegen {
  try {
    const stats = getCharacterStats(characterId || 'coderdan');
    return aggregateRegen(stats.abilities);
  } catch {
    return { perSecond: 0 };
  }
}

export function getPlayerTongueFarm(
  characterId: string,
  enemyTags: readonly string[] | undefined,
  statsOverride?: WeaponStatsSource | null
): AggregatedTongueFarm {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      undefined,
      statsOverride
    );
    return aggregateTongueFarm(abilities, enemyTags);
  } catch {
    return { bonusChance: 0 };
  }
}

export function getPlayerTongueFarmForWeapon(
  characterId: string,
  enemyTags: readonly string[] | undefined,
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedTongueFarm {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateTongueFarm(abilities, enemyTags);
  } catch {
    return { bonusChance: 0 };
  }
}

export function getEnemyCrit(
  enemyType: string,
  weaponType: 'melee' | 'ranged'
): AggregatedCrit {
  try {
    const base = ENEMY_TYPES?.[enemyType];
    return aggregateCriticalStrike(base?.abilities, weaponType);
  } catch {
    return { chance: 0, multiplier: 1 };
  }
}

export function getEnemyEvade(
  enemyType: string,
  weaponType: 'melee' | 'ranged'
): AggregatedEvade {
  try {
    const base = ENEMY_TYPES?.[enemyType];
    return aggregateEvade(base?.abilities, weaponType);
  } catch {
    return { chance: 0 };
  }
}

export function rollCrit(chance: number): boolean {
  // Clamp to [0,1] as a true probability roll
  const p = Math.max(0, Math.min(1, chance));
  return Math.random() < p;
}

export function rollEvade(chance: number): boolean {
  const p = Math.max(0, Math.min(1, chance));
  return Math.random() < p;
}

function getFacingAngleRadians(dir: 'up' | 'down' | 'left' | 'right'): number {
  switch (dir) {
    case 'right':
      return 0;
    case 'left':
      return Math.PI;
    case 'up':
      return -Math.PI / 2;
    case 'down':
    default:
      return Math.PI / 2;
  }
}

function normalizeAngleRadians(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function isWithinCone(
  sourceX: number,
  sourceY: number,
  sourceDir: 'up' | 'down' | 'left' | 'right',
  targetX: number,
  targetY: number,
  coneAngleDeg: number
): boolean {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const targetAngle = Math.atan2(dy, dx);
  const facingAngle = getFacingAngleRadians(sourceDir);
  const diff = Math.abs(normalizeAngleRadians(targetAngle - facingAngle));
  const halfCone = (Math.max(0, coneAngleDeg) * Math.PI) / 180 / 2;
  return diff <= halfCone;
}

export function aggregateCleave(
  abilities: AbilityReference[] | undefined,
  weaponType: 'melee' | 'ranged'
): AggregatedCleave {
  const result: AggregatedCleave = {
    enabled: false,
    damageMultiplier: 1,
    maxTargets: undefined,
    coneAngleDeg: undefined,
    includeBreakables: false,
  };

  if (!Array.isArray(abilities)) return result;

  for (const ability of abilities) {
    if (!ability || ability.id !== 'cleave') continue;
    const params = ability.params || {};
    const appliesTo = (params.appliesTo as any) || 'melee';
    if (!(appliesTo === 'melee' || appliesTo === 'all')) continue;
    if (weaponType !== 'melee' && appliesTo !== 'all') continue;

    result.enabled = true;
    const mult =
      typeof params.damageMultiplier === 'number' && params.damageMultiplier > 0
        ? params.damageMultiplier
        : undefined;
    if (typeof mult === 'number') {
      // Stacking policy: take the highest multiplier across sources
      result.damageMultiplier = Math.max(result.damageMultiplier, mult);
    }
    const maxT =
      typeof params.maxTargets === 'number' && params.maxTargets > 0
        ? params.maxTargets
        : undefined;
    if (typeof maxT === 'number') {
      // Stacking policy: take the highest maxTargets
      result.maxTargets = Math.max(result.maxTargets || 0, maxT) || maxT;
    }
    const angle =
      typeof params.coneAngleDeg === 'number' && params.coneAngleDeg > 0
        ? params.coneAngleDeg
        : undefined;
    if (typeof angle === 'number') {
      // Prefer the widest specified cone
      result.coneAngleDeg = Math.max(result.coneAngleDeg || 0, angle) || angle;
    }
    if (params.includeBreakables === true) {
      result.includeBreakables = true;
    }
  }

  return result;
}

export function getPlayerCleave(
  characterId: string,
  weaponType: 'melee' | 'ranged',
  weaponSlug?: string,
  statsOverride?: WeaponStatsSource | null
): AggregatedCleave {
  try {
    const abilities = resolveWeaponAbilities(
      characterId,
      weaponSlug,
      statsOverride
    );
    return aggregateCleave(abilities, weaponType);
  } catch {
    return {
      enabled: false,
      damageMultiplier: 1,
      maxTargets: undefined,
      coneAngleDeg: undefined,
      includeBreakables: false,
    };
  }
}

export function getEnemyCleave(
  enemyType: string,
  weaponType: 'melee' | 'ranged'
): AggregatedCleave {
  try {
    const base = ENEMY_TYPES?.[enemyType];
    return aggregateCleave(base?.abilities, weaponType);
  } catch {
    return {
      enabled: false,
      damageMultiplier: 1,
      maxTargets: undefined,
      coneAngleDeg: undefined,
      includeBreakables: false,
    };
  }
}
