import {
  getAllItemCategories,
  getItemTypesByCategory,
  getRandomItemType,
  generateItemData,
  ITEM_COLORS,
} from './items';
import {
  itemTypes as WEARABLE_ITEM_TYPES,
  slugifyWearableName,
} from './wearables';
import { getDifficultyTier } from './difficulty-tiers';
import { GAME_CONFIG } from './game-config';

/**
 * Canonical Loot Table — single source of truth for loot probabilities and selection.
 *
 * Mirrors the existing behavior from server systems (EnemyDeathSystem), so that
 * systems call into this module rather than re-encoding probabilities.
 */

export interface PotionFarmConfig {
  enabled: boolean;
  enableReweight: boolean;
  potionWeightMultiplier: number;
  enableExtraRoll: boolean;
  extraRollChance: number; // absolute 0..1
  hpToManaBias: number; // 0..1
}

export interface GoldFarmConfig {
  enabled: boolean;
  enableReweight: boolean;
  coinWeightMultiplier: number;
  enableExtraRoll: boolean;
  extraRollChance: number; // absolute 0..1
  maxExtraChanceCap: number;
  amountMultiplier: number;
}

export interface EnemyDropContext {
  enemyType?: string;
  enemyTags?: string[];
  killStreakPotionCoinFindBonus?: number; // absolute 0..1
  potionFarm?: PotionFarmConfig;
  goldFarm?: GoldFarmConfig;
  classification?: 'trash' | 'elite' | 'boss' | 'normal';
  rewardMultiplier?: number;
  difficultyTierId?: string; // used to apply dropRateMultiplier for normal enemies
  dailyQuestActive?: boolean; // if true, boss always drops lick tongue (legacy, use earnLickTongue instead)
  earnLickTongue?: boolean; // if true, boss drops lick tongue (based on mode reward config)
}

export interface DroppedItemData {
  // Minimal common fields shared by items generated from items.ts
  type: string;
  name: string;
  quantity: number;
  color: string;
  description: string;
  rarity?: string;
  wearableId?: number;
  spriteId?: number;
  // Wearable-specific extra fields preserved from EnemyDeathSystem
  // These may not exist for non-wearables
  wearableSlug?: string;
  quality?: WearableQuality;
  durabilityScore?: number;
}

// =====================
// Source identifiers (for non-enemy loot origins)
// =====================

export const LOOT_SOURCE_IDS = {
  treasureChest: 'treasure_chest',
} as const;

export type LootSourceId =
  | (typeof LOOT_SOURCE_IDS)[keyof typeof LOOT_SOURCE_IDS]
  | string;

type BossLootDepthConfig = {
  enabled?: boolean;
  wearableCategoryBiasPerFloor?: number;
  wearableCategoryBiasMax?: number;
  wearableRarityBoostPerFloor?: Partial<
    Record<'legendary' | 'mythical' | 'godlike', number>
  >;
  wearableRarityBoostMax?: Partial<
    Record<'legendary' | 'mythical' | 'godlike', number>
  >;
  wearableStateBiasPerFloor?: Partial<Record<WearableQuality, number>>;
  wearableStateBiasMax?: Partial<Record<WearableQuality, number>>;
  currencyDropBonusPerFloor?: number;
  currencyDropMaxBonus?: number;
  currencyDropTargetCap?: number;
  currencyAmountBonusPerFloor?: number;
  currencyAmountMaxBonus?: number;
  probabilityDropRateWeight?: number;
  amountDropRateWeight?: number;
};

function getBossLootDepthConfig(): BossLootDepthConfig | null {
  const depthConfig = (GAME_CONFIG as any)?.bossLoot?.depth as
    | BossLootDepthConfig
    | undefined;
  if (!depthConfig) return null;
  if (depthConfig.enabled === false) return null;
  return depthConfig;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (Number.isNaN(value)) return min;
  if (min > max) return max;
  return Math.max(min, Math.min(max, value));
}

// =====================
// Wearable selection and quality — mirrors EnemyDeathSystem
// =====================

const WEARABLE_QUALITIES = [
  'broken',
  'budget',
  'average',
  'excellent',
  'flawless',
] as const;

export type WearableQuality = (typeof WEARABLE_QUALITIES)[number];

const WEARABLE_QUALITY_DISTRIBUTION: Array<{
  quality: WearableQuality;
  weight: number;
}> = [
  { quality: 'broken', weight: 0.2 },
  { quality: 'budget', weight: 0.3 },
  { quality: 'average', weight: 0.4 },
  { quality: 'excellent', weight: 0.1 },
  { quality: 'flawless', weight: 0 },
];

const WEARABLE_DURABILITY_RANGES: Record<WearableQuality, [number, number]> = {
  broken: [50, 250],
  budget: [250, 500],
  average: [450, 700],
  excellent: [650, 900],
  flawless: [900, 1000],
};

const WEARABLE_RARITY_WEIGHTS: Record<
  'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike',
  number
> = {
  common: 50,
  uncommon: 30,
  rare: 15,
  legendary: 4,
  mythical: 1,
  godlike: 0.5,
};

const EXCLUDED_WEARABLE_POOL_IDS = new Set<number>([0]);

function isWearablePoolCandidate(
  id: number,
  wearable: (typeof WEARABLE_ITEM_TYPES)[number]
): boolean {
  if (EXCLUDED_WEARABLE_POOL_IDS.has(id)) return false;
  return Number(wearable.category) === 0;
}

// Optional per-enemy wearable weight overrides by wearableId (absolute weights)
// Example:
// ENEMY_WEARABLE_WEIGHT_OVERRIDES = { cactus: { 101: 2.5, 205: 0.2 } };
const ENEMY_WEARABLE_WEIGHT_OVERRIDES: Record<
  string,
  Record<number, number>
> = {};

type WearableRarityKey = keyof typeof WEARABLE_RARITY_WEIGHTS;

function buildWearableCategoryBiasOverrides(
  floorIndex: number
): Partial<Record<string, number>> | undefined {
  const config = getBossLootDepthConfig();
  if (!config) return undefined;
  if (!(floorIndex > 0)) return undefined;
  const perFloor = Number(config.wearableCategoryBiasPerFloor) || 0;
  if (!(perFloor > 0)) return undefined;
  const cap = Math.max(0, Number(config.wearableCategoryBiasMax) || 0);
  const bonus = clampNumber(floorIndex * perFloor, 0, cap);
  if (!(bonus > 0)) return undefined;
  return { wearable: 1 + bonus };
}

function buildWearableRarityDepthMultipliers(
  floorIndex: number
): Partial<Record<WearableRarityKey, number>> | undefined {
  const config = getBossLootDepthConfig();
  if (!config) return undefined;
  if (!(floorIndex > 0)) return undefined;
  const perFloor = config.wearableRarityBoostPerFloor;
  if (!perFloor) return undefined;
  const maxMap = config.wearableRarityBoostMax ?? {};
  const result: Partial<Record<WearableRarityKey, number>> = {};
  let hasEntry = false;
  (['legendary', 'mythical', 'godlike'] as const).forEach((rarity) => {
    const perFloorValue = Number(perFloor[rarity] ?? 0);
    if (!(perFloorValue > 0)) {
      return;
    }
    const maxBonus = Math.max(0, Number(maxMap[rarity]) || 0);
    const bonus = clampNumber(perFloorValue * floorIndex, 0, maxBonus);
    if (!(bonus > 0)) {
      return;
    }
    result[rarity] = 1 + bonus;
    hasEntry = true;
  });
  return hasEntry ? result : undefined;
}

function buildWearableQualityDepthMultipliers(
  floorIndex: number
): Partial<Record<WearableQuality, number>> | undefined {
  const config = getBossLootDepthConfig();
  if (!config) return undefined;
  if (!(floorIndex > 0)) return undefined;
  const perFloor = config.wearableStateBiasPerFloor;
  if (!perFloor) return undefined;
  const maxMap = config.wearableStateBiasMax ?? {};
  const result: Partial<Record<WearableQuality, number>> = {};
  let hasEntry = false;
  for (const quality of WEARABLE_QUALITIES) {
    const perFloorValue = Number(perFloor[quality] ?? 0);
    if (!perFloorValue) continue;
    const maxBias = Math.max(0, Number(maxMap[quality]) || 0.5);
    const delta = clampNumber(perFloorValue * floorIndex, -maxBias, maxBias);
    const multiplier = Math.max(0, 1 + delta);
    result[quality] = multiplier;
    hasEntry = true;
  }
  return hasEntry ? result : undefined;
}

function rollWearableQuality(
  multiplierOverrides?: Partial<Record<WearableQuality, number>>
): WearableQuality {
  const distribution = WEARABLE_QUALITY_DISTRIBUTION.map((entry) => {
    const override =
      multiplierOverrides && entry.quality in multiplierOverrides
        ? Number(multiplierOverrides[entry.quality])
        : 1;
    const factor = Number.isFinite(override) ? Math.max(0, override) : 1;
    return {
      quality: entry.quality,
      weight: Math.max(0, entry.weight * factor),
    };
  });
  const totalWeight = distribution.reduce(
    (sum, entry) => sum + entry.weight,
    0
  );
  if (totalWeight <= 0) {
    return 'average';
  }
  let roll = Math.random() * totalWeight;
  for (const entry of distribution) {
    if (roll < entry.weight) return entry.quality;
    roll -= entry.weight;
  }
  return distribution[distribution.length - 1].quality;
}

function rollDurabilityForQuality(quality: WearableQuality): number {
  const [min, max] = WEARABLE_DURABILITY_RANGES[quality] ?? [200, 900];
  const clampedMin = Math.max(1, Math.floor(min));
  const clampedMax = Math.max(clampedMin, Math.floor(max));
  if (clampedMax <= clampedMin) return clampedMin;
  return clampedMin + Math.floor(Math.random() * (clampedMax - clampedMin + 1));
}

function deriveWearableRarityFromTraits(sumAbsModifiers: number) {
  if (sumAbsModifiers >= 6) return 'godlike' as const;
  if (sumAbsModifiers >= 5) return 'mythical' as const;
  if (sumAbsModifiers >= 4) return 'legendary' as const;
  if (sumAbsModifiers >= 3) return 'rare' as const;
  if (sumAbsModifiers >= 2) return 'uncommon' as const;
  return 'common' as const;
}

function computeWearableRarity(wearable: (typeof WEARABLE_ITEM_TYPES)[number]) {
  const explicit: any = wearable as any;
  if (explicit && typeof explicit.rarityLevel === 'string') {
    return explicit.rarityLevel as keyof typeof WEARABLE_RARITY_WEIGHTS;
  }
  const mods = Array.isArray(wearable.traitModifiers)
    ? wearable.traitModifiers
    : [];
  const sum = mods.reduce((acc, v) => acc + Math.abs(Number(v) || 0), 0);
  return deriveWearableRarityFromTraits(sum);
}

function hasWearableCandidates(): boolean {
  for (const [idStr, wearable] of Object.entries(WEARABLE_ITEM_TYPES)) {
    const id = Number(idStr);
    if (isWearablePoolCandidate(id, wearable)) return true;
  }
  return false;
}

function selectRandomWearableForDrop(
  enemyType?: string,
  rarityMultiplierMap?: Partial<
    Record<
      'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike',
      number
    >
  >
): {
  wearableId: number;
  name: string;
  rarity: keyof typeof WEARABLE_RARITY_WEIGHTS;
} | null {
  const candidates: Array<{
    id: number;
    name: string;
    rarity: keyof typeof WEARABLE_RARITY_WEIGHTS;
    weight: number;
  }> = [];

  for (const [idStr, wearable] of Object.entries(WEARABLE_ITEM_TYPES)) {
    const id = Number(idStr);
    if (!isWearablePoolCandidate(id, wearable)) continue;
    const rarity = computeWearableRarity(wearable);
    let weight =
      (WEARABLE_RARITY_WEIGHTS[rarity] || 0) *
      (rarityMultiplierMap?.[rarity] ?? 1);
    if (enemyType) {
      const override = ENEMY_WEARABLE_WEIGHT_OVERRIDES[enemyType];
      if (override) {
        const w = override[id];
        if (typeof w === 'number') weight = Math.max(0, w);
      }
    }
    if (weight <= 0) continue;
    candidates.push({ id, name: wearable.name, rarity, weight });
  }

  if (candidates.length === 0) return null;

  const total = candidates.reduce((acc, c) => acc + c.weight, 0);
  if (!(total > 0)) return null;

  let roll = Math.random() * total;
  for (const c of candidates) {
    if (roll < c.weight) {
      return { wearableId: c.id, name: c.name, rarity: c.rarity };
    }
    roll -= c.weight;
  }
  const last = candidates[candidates.length - 1];
  return { wearableId: last.id, name: last.name, rarity: last.rarity };
}

function mergeRarityMultipliers(
  base?: Partial<Record<WearableRarityKey, number>>,
  depth?: Partial<Record<WearableRarityKey, number>>
): Partial<Record<WearableRarityKey, number>> | undefined {
  if (!base && !depth) return undefined;
  const merged: Partial<Record<WearableRarityKey, number>> = {};
  if (base) {
    for (const [rarity, value] of Object.entries(base)) {
      if (value == null) continue;
      merged[rarity as WearableRarityKey] = Number(value);
    }
  }
  if (depth) {
    for (const [rarity, value] of Object.entries(depth)) {
      if (!(typeof value === 'number' && Number.isFinite(value))) continue;
      const current = merged[rarity as WearableRarityKey] ?? 1;
      merged[rarity as WearableRarityKey] = Math.max(0, current * value);
    }
  }
  return merged;
}

// =====================
// Enemy drop table
// =====================

const BASE_ENEMY_DROP_CHANCE = 0.2; // normal enemies
const ELITE_ENEMY_DROP_CHANCE = 1.0; // elites always drop
const BASE_DROP_CHANCE_CAP = 0.95; // cap after run bonus

const BASE_LICK_TONGUE_DROP_CHANCE = 0.1; // before Tongue Farm aggregation

// =====================
// Class/per-enemy base drop config
// =====================

const ENEMY_CLASS_BASE_DROP: Record<'trash' | 'elite' | 'boss', number> = {
  trash: BASE_ENEMY_DROP_CHANCE,
  elite: ELITE_ENEMY_DROP_CHANCE,
  boss: BASE_ENEMY_DROP_CHANCE,
};

const ENEMY_CLASS_MULTIPLIERS: Record<'trash' | 'elite' | 'boss', number> = {
  trash: 1,
  elite: 1,
  boss: 1,
};

const ENEMY_BASE_DROP_OVERRIDES: Record<
  string,
  { absolute?: number; multiplier?: number }
> = {};

const APPLY_REWARD_MULTIPLIER_TO_DROP_CHANCE = false;
const REWARD_MULTIPLIER_DROP_SCALE: { min: number; max: number } = {
  min: 0.5,
  max: 2.0,
};

function normalizeClassification(
  classification?: 'trash' | 'elite' | 'boss' | 'normal'
): 'trash' | 'elite' | 'boss' {
  if (classification === 'elite') return 'elite';
  if (classification === 'boss') return 'boss';
  return 'trash';
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeBaseEnemyDropThreshold(context: EnemyDropContext): number {
  const cls = normalizeClassification(context.classification);
  // Elites always drop something
  if (cls === 'elite') return ELITE_ENEMY_DROP_CHANCE;
  let base = ENEMY_CLASS_BASE_DROP[cls] * ENEMY_CLASS_MULTIPLIERS[cls];

  if (context.enemyType) {
    const override = ENEMY_BASE_DROP_OVERRIDES[context.enemyType];
    if (override) {
      if (typeof override.absolute === 'number') base = override.absolute;
      else if (typeof override.multiplier === 'number')
        base *= override.multiplier;
    }
  }

  // Apply difficulty tier multiplier for normal enemies only
  if (cls === 'trash' && typeof context.difficultyTierId === 'string') {
    const tier = getDifficultyTier(context.difficultyTierId);
    if (tier && typeof tier.dropRateMultiplier === 'number') {
      base *= Math.max(0, tier.dropRateMultiplier);
    }
  }

  if (
    APPLY_REWARD_MULTIPLIER_TO_DROP_CHANCE &&
    typeof context.rewardMultiplier === 'number'
  ) {
    const scaled = clamp(
      context.rewardMultiplier,
      REWARD_MULTIPLIER_DROP_SCALE.min,
      REWARD_MULTIPLIER_DROP_SCALE.max
    );
    base *= scaled;
  }

  base = clamp01(base);

  const runBonus = Number(context.killStreakPotionCoinFindBonus || 0);
  const threshold = Math.min(
    BASE_DROP_CHANCE_CAP,
    Math.max(0, base + runBonus)
  );
  return threshold;
}

export function rollEnemyDrop(
  context: EnemyDropContext
): DroppedItemData | null {
  const categoriesSet = new Set<string>(getAllItemCategories());
  if (hasWearableCandidates()) categoriesSet.add('wearable');
  const availableCategories = Array.from(categoriesSet);
  if (availableCategories.length === 0) return null;

  // Elite enemies: always drop a wearable (no coins/potions/materials/weapons)
  {
    const cls = normalizeClassification(context.classification);
    if (cls === 'elite') {
      const rarityMultipliers = getEliteWearableRarityMultipliers(
        context.difficultyTierId
      );

      const picked = selectRandomWearableForDrop(
        context.enemyType,
        rarityMultipliers
      );
      if (!picked) return null;
      const quality = rollWearableQuality();
      const durabilityScore = rollDurabilityForQuality(quality);
      const wearableSlug = slugifyWearableName(picked.name);

      return {
        type: 'wearable',
        name: picked.name,
        quantity: 1,
        color: ITEM_COLORS.wearable,
        description: 'Wearable equipment',
        rarity: picked.rarity,
        wearableId: picked.wearableId as any,
        wearableSlug,
        quality,
        durabilityScore,
      } as DroppedItemData;
    }
  }

  // Primary roll using class-/enemy-aware base threshold
  const primarySucceeded =
    Math.random() < computeBaseEnemyDropThreshold(context);

  // Extra roll path mirrors EnemyDeathSystem
  let dropSucceeded = primarySucceeded;
  let selectedCategory: string | undefined;
  const farm = context.potionFarm;
  const goldFarm = context.goldFarm;
  const coinWeightMultiplier =
    goldFarm && goldFarm.enabled && goldFarm.enableReweight
      ? Math.max(0, goldFarm.coinWeightMultiplier)
      : 1;

  if (dropSucceeded) {
    selectedCategory = selectDropCategoryForEnemy(
      availableCategories,
      farm && farm.enabled && farm.enableReweight
        ? Math.max(0, farm.potionWeightMultiplier)
        : 1,
      coinWeightMultiplier,
      context.enemyType
    );
  } else {
    const runBonus = Number(context.killStreakPotionCoinFindBonus || 0);
    const extraRollChance = Math.max(0, Math.min(0.5, runBonus));
    if (extraRollChance > 0 && Math.random() < extraRollChance) {
      dropSucceeded = true;
      selectedCategory = availableCategories.includes('potion')
        ? 'potion'
        : availableCategories.includes('coin')
          ? 'coin'
          : undefined;
    } else if (
      farm &&
      farm.enabled &&
      farm.enableExtraRoll &&
      farm.extraRollChance > 0 &&
      Math.random() < farm.extraRollChance
    ) {
      dropSucceeded = true;
      selectedCategory = 'potion';
    } else if (
      goldFarm &&
      goldFarm.enabled &&
      goldFarm.enableExtraRoll &&
      goldFarm.extraRollChance > 0 &&
      Math.random() < goldFarm.extraRollChance
    ) {
      dropSucceeded = true;
      selectedCategory = 'coin';
    }
  }

  if (!dropSucceeded || !selectedCategory) return null;

  // Wearable special case: construct wearable itemData here
  if (selectedCategory === 'wearable') {
    const rarityMultipliers = getEliteWearableRarityMultipliers(
      context.difficultyTierId
    );
    const picked = selectRandomWearableForDrop(
      context.enemyType,
      rarityMultipliers
    );
    if (!picked) return null;
    const quality = rollWearableQuality();
    const durabilityScore = rollDurabilityForQuality(quality);
    const wearableSlug = slugifyWearableName(picked.name);

    return {
      type: 'wearable',
      name: picked.name,
      quantity: 1,
      color: ITEM_COLORS.wearable,
      description: 'Wearable equipment',
      rarity: picked.rarity,
      wearableId: picked.wearableId as any, // will be filled by consumer if needed
      wearableSlug,
      quality,
      durabilityScore,
    } as DroppedItemData;
  }

  // For coins: deny USDC for enemy drops
  let itemType = selectItemTypeForCategory(
    selectedCategory,
    farm,
    context.enemyType
  );
  if (selectedCategory === 'coin') {
    const nonUsdc = getItemTypesByCategory('coin').filter(
      (t) => t !== 'usdc_coin'
    );
    if (nonUsdc.length > 0) {
      itemType = nonUsdc[Math.floor(Math.random() * nonUsdc.length)];
    }
  }

  const drop = generateItemData(itemType) as DroppedItemData;
  if (selectedCategory === 'coin' && goldFarm && goldFarm.enabled) {
    const mult =
      typeof goldFarm.amountMultiplier === 'number'
        ? goldFarm.amountMultiplier
        : 1;
    if (Number.isFinite(mult) && mult > 1) {
      drop.quantity = Math.max(1, Math.round(drop.quantity * mult));
    }
  }
  return drop;
}

// Boss multi-drop: always at least one wearable, plus an optional coin roll
export function rollBossDrops(context: EnemyDropContext): DroppedItemData[] {
  const results: DroppedItemData[] = [];

  // Always drop one wearable
  {
    const rarityMultipliers = getEliteWearableRarityMultipliers(
      context.difficultyTierId
    );
    const picked = selectRandomWearableForDrop(
      context.enemyType,
      rarityMultipliers
    );
    if (picked) {
      const quality = rollWearableQuality();
      const durabilityScore = rollDurabilityForQuality(quality);
      const wearableSlug = slugifyWearableName(picked.name);
      results.push({
        type: 'wearable',
        name: picked.name,
        quantity: 1,
        color: ITEM_COLORS.wearable,
        description: 'Wearable equipment',
        rarity: picked.rarity,
        wearableId: picked.wearableId as any,
        wearableSlug,
        quality,
        durabilityScore,
      } as DroppedItemData);
    }
  }

  // Drop lick tongue based on mode reward configuration
  // Check earnLickTongue first (new config-based), fallback to dailyQuestActive (legacy)
  if (context.earnLickTongue ?? context.dailyQuestActive) {
    const lickTongueItem = generateItemData('lick_tongue') as DroppedItemData;
    results.push(lickTongueItem);
  }

  // Optional coin drop using the standard threshold logic for bosses
  {
    const threshold = computeBaseEnemyDropThreshold({
      ...context,
      classification: 'boss',
    });
    const primarySucceeded = Math.random() < threshold;
    if (primarySucceeded) {
      // Deny USDC for enemy drops
      const nonUsdc = getItemTypesByCategory('coin').filter(
        (t) => t !== 'usdc_coin'
      );
      let itemType: string | undefined;
      if (nonUsdc.length > 0) {
        itemType = nonUsdc[Math.floor(Math.random() * nonUsdc.length)];
      } else {
        itemType = selectItemTypeForCategory(
          'coin',
          context.potionFarm,
          context.enemyType
        );
      }
      if (itemType) {
        const drop = generateItemData(itemType) as DroppedItemData;
        const goldFarm = context.goldFarm;
        if (goldFarm && goldFarm.enabled) {
          const mult =
            typeof goldFarm.amountMultiplier === 'number'
              ? goldFarm.amountMultiplier
              : 1;
          if (Number.isFinite(mult) && mult > 1) {
            drop.quantity = Math.max(1, Math.round(drop.quantity * mult));
          }
        }
        results.push(drop);
      }
    }
  }

  return results;
}

function selectDropCategory(
  categories: string[],
  potionWeightMultiplier: number
): string {
  if (categories.length === 1) return categories[0];

  const weights = categories.map((category) =>
    category === 'potion' ? Math.max(0, potionWeightMultiplier || 0) : 1
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(totalWeight > 0)) {
    return categories[Math.floor(Math.random() * categories.length)];
  }

  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < categories.length; i += 1) {
    cumulative += weights[i];
    if (roll < cumulative) return categories[i];
  }
  return categories[categories.length - 1];
}

// Optional per-enemy category weight overrides: higher weight = more likely category
// Example:
// ENEMY_CATEGORY_WEIGHT_OVERRIDES = {
//   cactus: { potion: 2, coin: 0.5 },
// };
const ENEMY_CATEGORY_WEIGHT_OVERRIDES: Record<
  string,
  Partial<Record<string, number>>
> = {};

export function selectDropCategoryForEnemy(
  categories: string[],
  potionWeightMultiplier: number,
  coinWeightMultiplier: number,
  enemyType?: string
): string {
  if (categories.length === 1) return categories[0];

  const baseWeights = categories.map((category) =>
    category === 'potion'
      ? Math.max(0, potionWeightMultiplier || 0)
      : category === 'coin'
        ? Math.max(0, coinWeightMultiplier || 0)
        : 1
  );

  if (enemyType) {
    const override = ENEMY_CATEGORY_WEIGHT_OVERRIDES[enemyType];
    if (override) {
      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i];
        const w = override[cat];
        if (typeof w === 'number') baseWeights[i] = Math.max(0, w);
      }
    }
  }

  const totalWeight = baseWeights.reduce((sum, weight) => sum + weight, 0);
  if (!(totalWeight > 0)) {
    return categories[Math.floor(Math.random() * categories.length)];
  }

  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < categories.length; i += 1) {
    cumulative += baseWeights[i];
    if (roll < cumulative) return categories[i];
  }
  return categories[categories.length - 1];
}

// Generic variant for non-enemy sources (e.g., treasure chests)
export function selectDropCategoryForSource(
  categories: string[],
  potionWeightMultiplier: number,
  coinWeightMultiplier: number,
  sourceId?: LootSourceId,
  categoryWeightOverrides?: Partial<Record<string, number>>
): string {
  if (categories.length === 1) return categories[0];

  const baseWeights = categories.map((category) =>
    category === 'potion'
      ? Math.max(0, potionWeightMultiplier || 0)
      : category === 'coin'
        ? Math.max(0, coinWeightMultiplier || 0)
        : 1
  );

  if (sourceId) {
    const override = ENEMY_CATEGORY_WEIGHT_OVERRIDES[sourceId];
    if (override) {
      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i];
        const w = override[cat];
        if (typeof w === 'number') baseWeights[i] = Math.max(0, w);
      }
    }
  }

  if (categoryWeightOverrides) {
    for (let i = 0; i < categories.length; i += 1) {
      const override = categoryWeightOverrides[categories[i]];
      if (override == null) continue;
      const factor = Number(override);
      if (!Number.isFinite(factor)) continue;
      baseWeights[i] = Math.max(0, baseWeights[i] * factor);
    }
  }

  const totalWeight = baseWeights.reduce((sum, weight) => sum + weight, 0);
  if (!(totalWeight > 0)) {
    return categories[Math.floor(Math.random() * categories.length)];
  }

  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < categories.length; i += 1) {
    cumulative += baseWeights[i];
    if (roll < cumulative) return categories[i];
  }
  return categories[categories.length - 1];
}

// Optional per-enemy item type weights within a category
// Example:
// ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES = {
//   cactus: { weapon: { cactus_spike: 3, dagger: 1 } },
//   slime_big: { potion: { health_potion: 2, mana_potion: 0.5 } },
// };
const ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES: Record<
  string,
  Partial<Record<string, Record<string, number>>>
> = {};

function selectDefaultPotionItemType(): string {
  const potionTypes = getItemTypesByCategory('potion');
  if (potionTypes.length === 0) return getRandomItemType('potion');

  const healthTypes = potionTypes.filter(
    (type) => type.includes('health') || type.includes('healing')
  );
  const manaTypes = potionTypes.filter((type) => type.includes('mana'));
  const otherTypes = potionTypes.filter(
    (type) => !healthTypes.includes(type) && !manaTypes.includes(type)
  );
  const totalWeight = healthTypes.length + manaTypes.length + otherTypes.length;
  if (totalWeight <= 0) return getRandomItemType('potion');

  const roll = Math.random() * totalWeight;
  if (roll < healthTypes.length) {
    return healthTypes.length > 0
      ? healthTypes[Math.floor(Math.random() * healthTypes.length)]
      : 'health_potion';
  }
  if (roll < healthTypes.length + manaTypes.length) {
    return manaTypes.length > 0
      ? manaTypes[Math.floor(Math.random() * manaTypes.length)]
      : 'mana_potion';
  }
  return otherTypes.length > 0
    ? otherTypes[Math.floor(Math.random() * otherTypes.length)]
    : getRandomItemType('potion');
}

export function selectItemTypeForCategory(
  category: string,
  potionFarm?: PotionFarmConfig,
  enemyType?: string
): string {
  // When potion farm is active, keep existing bias logic for potions
  if (category === 'potion' && potionFarm) {
    const bias = Math.min(1, Math.max(0, potionFarm.hpToManaBias));
    const potionTypes = getItemTypesByCategory('potion');
    if (potionTypes.length === 0) return getRandomItemType('potion');
    const hpPotion = potionTypes.find((type) => type === 'health_potion');
    const manaPotion = potionTypes.find((type) => type === 'mana_potion');
    if (hpPotion && manaPotion)
      return Math.random() < bias ? hpPotion : manaPotion;
    return potionTypes[Math.floor(Math.random() * potionTypes.length)];
  }

  // Enemy-specific item type weights by category
  if (enemyType) {
    const available = getItemTypesByCategory(category as any);
    const override = ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES[enemyType]?.[category];
    if (override) {
      const entries = available
        .map((t) => ({ t, w: Math.max(0, Number(override[t] ?? 0)) }))
        .filter((e) => e.w > 0);
      if (entries.length > 0) {
        const total = entries.reduce((s, e) => s + e.w, 0);
        let roll = Math.random() * total;
        for (const e of entries) {
          if (roll < e.w) return e.t;
          roll -= e.w;
        }
        return entries[entries.length - 1].t;
      }
    }
  }

  if (category === 'potion') {
    return selectDefaultPotionItemType();
  }

  return getRandomItemType(category as any);
}

// Generic variant for non-enemy sources (e.g., treasure chests)
export function selectItemTypeForSource(
  category: string,
  potionFarm?: PotionFarmConfig,
  sourceId?: LootSourceId
): string {
  // When potion farm is active, keep existing bias logic for potions
  if (category === 'potion' && potionFarm) {
    const bias = Math.min(1, Math.max(0, potionFarm.hpToManaBias));
    const potionTypes = getItemTypesByCategory('potion');
    if (potionTypes.length === 0) return getRandomItemType('potion');
    const hpPotion = potionTypes.find((type) => type === 'health_potion');
    const manaPotion = potionTypes.find((type) => type === 'mana_potion');
    if (hpPotion && manaPotion)
      return Math.random() < bias ? hpPotion : manaPotion;
    return potionTypes[Math.floor(Math.random() * potionTypes.length)];
  }

  if (sourceId) {
    const available = getItemTypesByCategory(category as any);
    const override = ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES[sourceId]?.[category];
    if (override) {
      const entries = available
        .map((t) => ({ t, w: Math.max(0, Number(override[t] ?? 0)) }))
        .filter((e) => e.w > 0);
      if (entries.length > 0) {
        const total = entries.reduce((s, e) => s + e.w, 0);
        let roll = Math.random() * total;
        for (const e of entries) {
          if (roll < e.w) return e.t;
          roll -= e.w;
        }
        return entries[entries.length - 1].t;
      }
    }
  }

  if (category === 'potion') {
    return selectDefaultPotionItemType();
  }

  return getRandomItemType(category as any);
}

// =====================
// Chest loot (guaranteed item generation)
// =====================

export function rollChestItem(options: {
  difficultyTierId?: string;
  potionFarm?: PotionFarmConfig;
  goldFarm?: GoldFarmConfig;
  sourceId?: LootSourceId;
  floorIndex?: number;
}): DroppedItemData {
  // Chests only produce coin or wearable items (no potions/materials/weapons)
  const availableCategories: string[] = ['coin'];
  if (hasWearableCandidates()) availableCategories.push('wearable');

  // Always produce something; default to potion category if none found
  const farm = options.potionFarm;
  const goldFarm = options.goldFarm;
  const sourceId = options.sourceId;
  const floorIndex = Math.max(0, Math.floor(options.floorIndex ?? 0));
  const depthActive =
    sourceId === LOOT_SOURCE_IDS.treasureChest && floorIndex > 0;
  const depthCategoryOverrides = depthActive
    ? buildWearableCategoryBiasOverrides(floorIndex)
    : undefined;
  const depthQualityOverrides = depthActive
    ? buildWearableQualityDepthMultipliers(floorIndex)
    : undefined;
  const depthRarityMultipliers = depthActive
    ? buildWearableRarityDepthMultipliers(floorIndex)
    : undefined;
  const selectedCategory =
    availableCategories.length > 0
      ? selectDropCategoryForSource(
          availableCategories,
          farm && farm.enabled && farm.enableReweight
            ? Math.max(0, farm.potionWeightMultiplier)
            : 1,
          goldFarm && goldFarm.enabled && goldFarm.enableReweight
            ? Math.max(0, goldFarm.coinWeightMultiplier)
            : 1,
          sourceId,
          depthCategoryOverrides
        )
      : 'potion';

  if (selectedCategory === 'wearable') {
    const baseRarityMultipliers = getEliteWearableRarityMultipliers(
      options.difficultyTierId
    );
    const mergedRarityMultipliers = mergeRarityMultipliers(
      baseRarityMultipliers as
        | Partial<Record<WearableRarityKey, number>>
        | undefined,
      depthRarityMultipliers
    );
    const picked = selectRandomWearableForDrop(
      sourceId,
      mergedRarityMultipliers
    );
    if (!picked) {
      // Fallback into a coin item if no wearable candidates to honor chest constraints
      const fallbackCoins = getItemTypesByCategory('coin').filter(
        (type) => type !== 'usdc_coin'
      );
      const fallbackType =
        fallbackCoins.length > 0
          ? fallbackCoins[Math.floor(Math.random() * fallbackCoins.length)]
          : selectItemTypeForSource('coin', farm, sourceId);
      return generateItemData(fallbackType) as DroppedItemData;
    }
    const quality = rollWearableQuality(depthQualityOverrides);
    const durabilityScore = rollDurabilityForQuality(quality);
    const wearableSlug = slugifyWearableName(picked.name);
    return {
      type: 'wearable',
      name: picked.name,
      quantity: 1,
      color: ITEM_COLORS.wearable,
      description: 'Wearable equipment',
      rarity: picked.rarity,
      wearableId: picked.wearableId as any,
      wearableSlug,
      quality,
      durabilityScore,
    } as DroppedItemData;
  }

  // For coins in chests: deny USDC here as chest USDC is handled by its own pipeline
  let itemType = selectItemTypeForSource(selectedCategory, farm, sourceId);
  if (selectedCategory === 'coin') {
    const nonUsdc = getItemTypesByCategory('coin').filter(
      (t) => t !== 'usdc_coin'
    );
    if (nonUsdc.length > 0) {
      itemType = nonUsdc[Math.floor(Math.random() * nonUsdc.length)];
    } else {
      // If only USDC exists, fallback to wearable if possible
      if (availableCategories.includes('wearable')) {
        const baseRarityMultipliers = getEliteWearableRarityMultipliers(
          options.difficultyTierId
        );
        const mergedRarityMultipliers = mergeRarityMultipliers(
          baseRarityMultipliers as
            | Partial<Record<WearableRarityKey, number>>
            | undefined,
          depthRarityMultipliers
        );
        const picked = selectRandomWearableForDrop(
          sourceId,
          mergedRarityMultipliers
        );
        if (picked) {
          const quality = rollWearableQuality(depthQualityOverrides);
          const durabilityScore = rollDurabilityForQuality(quality);
          const wearableSlug = slugifyWearableName(picked.name);
          return {
            type: 'wearable',
            name: picked.name,
            quantity: 1,
            color: ITEM_COLORS.wearable,
            description: 'Wearable equipment',
            rarity: picked.rarity,
            wearableId: picked.wearableId as any,
            wearableSlug,
            quality,
            durabilityScore,
          } as DroppedItemData;
        }
      }
      // As a last resort, keep itemType as-is (will be generated below)
    }
  }

  const drop = generateItemData(itemType) as DroppedItemData;
  if (selectedCategory === 'coin' && goldFarm && goldFarm.enabled) {
    const mult =
      typeof goldFarm.amountMultiplier === 'number'
        ? goldFarm.amountMultiplier
        : 1;
    if (Number.isFinite(mult) && mult > 1) {
      drop.quantity = Math.max(1, Math.round(drop.quantity * mult));
    }
  }
  return drop;
}

export function rollChestItems(options: {
  count: number;
  difficultyTierId?: string;
  potionFarm?: PotionFarmConfig;
  goldFarm?: GoldFarmConfig;
  sourceId?: string;
  floorIndex?: number;
}): DroppedItemData[] {
  const n = Math.max(1, Math.floor(options.count || 1));
  const results: DroppedItemData[] = [];
  for (let i = 0; i < n; i += 1) {
    results.push(
      rollChestItem({
        difficultyTierId: options.difficultyTierId,
        potionFarm: options.potionFarm,
        goldFarm: options.goldFarm,
        sourceId: options.sourceId,
        floorIndex: options.floorIndex,
      })
    );
  }
  return results;
}

// =====================
// Chest currency rewards (USDC / GHST)
// =====================

export interface ChestCurrencyReward {
  currency: 'USDC' | 'GHST';
  amount: number; // denomination in the given currency
  probability: number; // approximate probability of this outcome
  expectedValue: number; // expected value for this tier
}

const CHEST_REWARD_DISTRIBUTIONS: Record<
  'normal' | 'nightmare' | 'hell',
  {
    minReward: number;
    maxReward: number;
    expectedReturn: number;
    volatility: number;
  }
> = {
  // Nerfed expected returns to reduce average payout across tiers
  normal: {
    minReward: 0,
    maxReward: 1,
    expectedReturn: 0.55,
    volatility: 0.25,
  },
  nightmare: {
    minReward: 0,
    maxReward: 1,
    expectedReturn: 0.45,
    volatility: 0.4,
  },
  hell: { minReward: 0, maxReward: 1, expectedReturn: 0.4, volatility: 0.55 },
};

function seededRandomForChest(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return Math.abs(x - Math.floor(x));
}

function probabilityForAmount(
  amount: number,
  maxAmount: number,
  volatility: number
): number {
  const normalized = maxAmount > 0 ? amount / maxAmount : 0;
  const baseProb = Math.exp(-normalized * (3 - volatility));
  return Math.min(baseProb, 1.0);
}

function getTierTypeForChest(
  tierId: string
): 'normal' | 'nightmare' | 'hell' {
  // Normalize tier ID - support both new (normal) and legacy (normal_1) formats
  const normalized = (tierId || '').toLowerCase();
  if (normalized.startsWith('hell') || normalized === 'beyond_hell') return 'hell';
  if (normalized.startsWith('nightmare')) return 'nightmare';
  return 'normal';
}

export function rollChestCurrency(options: {
  difficultyTierId: string;
  currency: 'USDC' | 'GHST';
  randomSeed?: number;
}): ChestCurrencyReward {
  const tier =
    typeof options.difficultyTierId === 'string'
      ? getDifficultyTier(options.difficultyTierId)
      : null;
  if (!tier) {
    return {
      currency: options.currency,
      amount: 0,
      probability: 0,
      expectedValue: 0,
    };
  }

  const tierType = getTierTypeForChest(tier.id);
  const distribution = CHEST_REWARD_DISTRIBUTIONS[tierType];
  const rnd =
    options.randomSeed !== undefined
      ? seededRandomForChest(options.randomSeed)
      : Math.random();

  // Target the tier's expected value and apply a symmetric volatility around it
  const expectedValue = tier.levelCost * distribution.expectedReturn;
  const spread = Math.min(0.9, Math.max(0, distribution.volatility * 0.6));
  const factor = 1 - spread + 2 * spread * rnd; // Uniform in [1-spread, 1+spread], mean 1
  const unclamped = expectedValue * factor;
  const amount = Math.min(
    tier.maxEarnings,
    Math.max(0, Math.floor(unclamped * 100) / 100)
  );
  const probability = probabilityForAmount(
    amount,
    tier.maxEarnings,
    distribution.volatility
  );

  return {
    currency: options.currency,
    amount,
    probability,
    expectedValue,
  };
}

export function rollChestCurrencyBundle(options: {
  difficultyTierId: string;
  currencies: Array<'USDC' | 'GHST'>;
  randomSeed?: number;
}): ChestCurrencyReward[] {
  const list =
    Array.isArray(options.currencies) && options.currencies.length > 0
      ? options.currencies
      : (['USDC'] as Array<'USDC' | 'GHST'>);
  return list.map((c, idx) =>
    rollChestCurrency({
      difficultyTierId: options.difficultyTierId,
      currency: c,
      randomSeed:
        options.randomSeed !== undefined ? options.randomSeed + idx : undefined,
    })
  );
}

// =====================
// Boss Currency Drops - Probability-Based Tier System
// =====================

export type BossCurrencyTier = 'none' | 'small' | 'ok' | 'good';

export interface BossCurrencyReward extends ChestCurrencyReward {
  tier: BossCurrencyTier;
  baseAmount: number; // Original amount before tier multiplier
  dropTarget: number;
  depthBonusApplied: number;
}

/**
 * Boss currency drop with probability-based tiers.
 * Amounts scale with difficulty tier - uses base rollChestCurrency calculation
 * then applies tier multiplier.
 */
export function rollBossCurrency(options: {
  difficultyTierId: string;
  currency: 'USDC' | 'GHST';
  leverageTotal?: number;
  randomSeed?: number;
  floorIndex?: number;
  dailyQuestBonus?: number;
  guaranteeDrop?: boolean;
}): BossCurrencyReward {
  const tierForBoss = getDifficultyTier(options.difficultyTierId);
  const dropRateMultiplier =
    tierForBoss && typeof (tierForBoss as any).dropRateMultiplier === 'number'
      ? Math.max(0, (tierForBoss as any).dropRateMultiplier)
      : 1;
  const baseReward = rollChestCurrency({
    difficultyTierId: options.difficultyTierId,
    currency: options.currency,
    randomSeed: options.randomSeed,
  });

  const rnd =
    options.randomSeed !== undefined
      ? seededRandomForChest((options.randomSeed ?? 0) + 1000)
      : Math.random();

  const depthConfig = getBossLootDepthConfig();
  const floorIndex =
    typeof options.floorIndex === 'number'
      ? Math.max(0, Math.floor(options.floorIndex))
      : 0;
  let depthBonus = 0;
  let dropTargetCap =
    depthConfig && depthConfig.currencyDropTargetCap !== undefined
      ? clampNumber(Number(depthConfig.currencyDropTargetCap) || 0.6, 0, 1)
      : 1;
  if (depthConfig && floorIndex > 0) {
    const perFloor = Number(depthConfig.currencyDropBonusPerFloor) || 0;
    const maxBonus = Math.max(0, Number(depthConfig.currencyDropMaxBonus) || 0);
    if (perFloor > 0 && maxBonus > 0) {
      depthBonus = clampNumber(perFloor * floorIndex, 0, maxBonus);
    }
  } else {
    dropTargetCap = 1;
  }

  // Leverage-scaled total drop probability
  // L = 1 -> 40% total drop; L = 10 -> 60% total drop (linear ramp)
  const L = Math.max(1, Math.min(50, Number(options.leverageTotal ?? 1)));
  const s = (L - 1) / 9; // 0..1
  const dropTargetBase = 0.25 + 0.2 * s; // 0.25 → 0.45 (nerfed baseline)
  // Apply tier drop-rate based scaling to probability
  let probScale = 1;
  if (depthConfig) {
    const w = Number(depthConfig.probabilityDropRateWeight) || 0;
    if (w !== 0) {
      probScale = Math.max(0, 1 + w * (dropRateMultiplier - 1));
    }
  }
  const dropTargetPre = Math.min(dropTargetCap, dropTargetBase + depthBonus);
  const dropTarget = Math.min(dropTargetCap, dropTargetPre * probScale);

  // Preserve baseline tier ratios within the drop portion, but disallow "good" on floor 1
  let smallW = 0.85;
  let okW = 0.14;
  let goodW = floorIndex >= 1 ? 0.01 : 0;
  const wSum = Math.max(1e-9, smallW + okW + goodW);
  const pSmall = (smallW / wSum) * dropTarget;
  const pOk = (okW / wSum) * dropTarget;
  const pGood = (goodW / wSum) * dropTarget;
  const pNone = Math.max(0, 1 - (pSmall + pOk + pGood));

  let tier: BossCurrencyTier;
  let multiplier: number;

  if (rnd < pNone) {
    tier = 'none';
    multiplier = 0;
  } else if (rnd < pNone + pSmall) {
    tier = 'small';
    multiplier = 0.2;
  } else if (rnd < pNone + pSmall + pOk) {
    tier = 'ok';
    multiplier = 0.7;
  } else if (rnd < pNone + pSmall + pOk + pGood) {
    tier = 'good';
    multiplier = 1.8;
  } else {
    tier = 'none';
    multiplier = 0;
  }

  // Amount depth bonus (separate from probability). Defaults controlled by GAME_CONFIG.bossLoot.depth
  let amountBonus = 0;
  if (depthConfig && floorIndex > 0) {
    const perFloorAmount = Number(depthConfig.currencyAmountBonusPerFloor) || 0;
    const maxAmountBonus = Math.max(
      0,
      Number(depthConfig.currencyAmountMaxBonus) || 0
    );
    if (perFloorAmount > 0 && maxAmountBonus > 0) {
      amountBonus = clampNumber(perFloorAmount * floorIndex, 0, maxAmountBonus);
    }
  }
  // Apply tier drop-rate based scaling to amount
  let amountScale = 1;
  if (depthConfig) {
    const wA = Number(depthConfig.amountDropRateWeight) || 0;
    if (wA !== 0) {
      amountScale = Math.max(0, 1 + wA * (dropRateMultiplier - 1));
    }
  }
  const adjustedBaseAmount =
    baseReward.amount * (1 + amountBonus) * amountScale;
  let finalAmount =
    multiplier > 0 ? Math.max(0.1, adjustedBaseAmount * multiplier) : 0;

  const bonus = options.dailyQuestBonus ?? 0;
  if (bonus > 0) {
    finalAmount += bonus;
  }

  if (options.guaranteeDrop && finalAmount <= 0) {
    finalAmount = Math.max(0.1, baseReward.amount);
  }

  return {
    currency: options.currency,
    amount: finalAmount,
    probability: multiplier > 0 ? baseReward.probability : 0,
    expectedValue: baseReward.expectedValue * multiplier,
    tier,
    baseAmount: baseReward.amount,
    dropTarget,
    depthBonusApplied: depthBonus,
  };
}

// =====================
// Special drops (Lick Tongue) — mirrors EnemyDeathSystem
// =====================

export interface TongueFarmAggregation {
  bonusChance: number; // absolute
}

export function maybeRollLickTongueDrop(
  enemyTags: string[] | undefined,
  aggregateTongueFarm: (tags: string[] | undefined) => TongueFarmAggregation
): boolean {
  const isLickquidator = Array.isArray(enemyTags)
    ? enemyTags.includes('lickquidator')
    : false;
  if (!isLickquidator) return false;

  let bonusChance = 0;
  try {
    const aggregation = aggregateTongueFarm(enemyTags);
    bonusChance = Number(aggregation?.bonusChance || 0);
  } catch {}

  const finalChance = Math.max(
    0,
    Math.min(1, BASE_LICK_TONGUE_DROP_CHANCE + bonusChance)
  );
  return Math.random() < finalChance;
}

// Exported helper for tests/simulations
export function getEnemyDropThresholdForSimulation(
  context: EnemyDropContext
): number {
  return computeBaseEnemyDropThreshold(context);
}

export function getEliteWearableRarityMultipliers(
  difficultyTierId?: string
):
  | Partial<
      Record<
        'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike',
        number
      >
    >
  | undefined {
  if (typeof difficultyTierId !== 'string') return undefined;
  const tier = getDifficultyTier(difficultyTierId);
  if (!tier) return undefined;
  const m = Math.max(0, tier.dropRateMultiplier);
  return {
    common: 1 / (1 + 0.3 * m),
    uncommon: 1 / (1 + 0.2 * m),
    rare: 1 + 0.15 * m,
    legendary: 1 + 0.25 * m,
    mythical: 1 + 0.35 * m,
    godlike: 1 + 0.5 * m,
  } as const;
}

// Expected distributions for wearables (for simulations/tests)
export function getExpectedWearableQualityProportions(): Record<
  WearableQuality,
  number
> {
  const total = WEARABLE_QUALITY_DISTRIBUTION.reduce(
    (sum, e) => sum + e.weight,
    0
  );
  const result: Record<WearableQuality, number> = {
    broken: 0,
    budget: 0,
    average: 0,
    excellent: 0,
    flawless: 0,
  };
  if (!(total > 0)) return result;
  for (const e of WEARABLE_QUALITY_DISTRIBUTION) {
    result[e.quality] = e.weight / total;
  }
  return result;
}

export function getExpectedWearableRarityProportions(
  rarityMultipliers?: Partial<
    Record<
      'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike',
      number
    >
  >
): Record<keyof typeof WEARABLE_RARITY_WEIGHTS, number> {
  const sums: Record<keyof typeof WEARABLE_RARITY_WEIGHTS, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    legendary: 0,
    mythical: 0,
    godlike: 0,
  };
  for (const [idStr, wearable] of Object.entries(WEARABLE_ITEM_TYPES)) {
    const id = Number(idStr);
    if (!isWearablePoolCandidate(id, wearable)) continue;
    const rarity = computeWearableRarity(wearable);
    const base = WEARABLE_RARITY_WEIGHTS[rarity] || 0;
    const mult = rarityMultipliers?.[rarity] ?? 1;
    const w = base * mult;
    sums[rarity] += w;
  }
  const total = (Object.values(sums) as number[]).reduce((a, b) => a + b, 0);
  const result: Record<keyof typeof WEARABLE_RARITY_WEIGHTS, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    legendary: 0,
    mythical: 0,
    godlike: 0,
  };
  if (!(total > 0)) return result;
  (Object.keys(sums) as Array<keyof typeof WEARABLE_RARITY_WEIGHTS>).forEach(
    (k) => {
      result[k] = sums[k] / total;
    }
  );
  return result;
}
