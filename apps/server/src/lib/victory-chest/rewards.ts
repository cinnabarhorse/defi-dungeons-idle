import crypto from 'node:crypto';
import { GAME_CONFIG } from '../../data/game-config';
import {
  getAllWearableSlugs,
  getWearableBySlug,
  getWearableRarity,
  type WearableDefinition,
} from '../../data/wearables';

export interface VictoryChestGoldBonus {
  amount: number;
}

export interface VictoryChestPotionReward {
  type: 'potion';
  potionTier: 2 | 3;
  itemName: 'Greater Healing Potion' | 'Ultra Healing Potion';
  quantity: 1 | 2 | 3;
}

export interface VictoryChestBonusRunReward {
  type: 'bonus_progression_run' | 'bonus_competition_run';
  bonusRuns: 1;
  mode: 'progression' | 'competition';
}

export interface VictoryChestWearableReward {
  type: 'wearable';
  wearableSlug: string;
  wearableName: string;
  svgId: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'godlike';
  quality: 'excellent';
  durabilityScore: number;
}

export type VictoryChestReward =
  | VictoryChestPotionReward
  | VictoryChestBonusRunReward
  | VictoryChestWearableReward;

export interface VictoryChestRolledReward {
  reward: VictoryChestReward;
  goldBonus: VictoryChestGoldBonus;
}

interface WeightedChoice<T> {
  value: T;
  weight: number;
}

function getWeightScale(weights: number[]): number {
  let maxDecimals = 0;
  for (const w of weights) {
    if (!Number.isFinite(w)) continue;
    const asString = String(w);
    if (!asString.includes('.')) continue;
    const decimals = asString.split('.')[1]?.length ?? 0;
    if (decimals > maxDecimals) maxDecimals = decimals;
  }
  // Clamp to avoid huge multipliers if someone passes 0.0000001 etc.
  maxDecimals = Math.min(maxDecimals, 6);
  return 10 ** maxDecimals;
}

function randomIntInclusive(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi < lo) return lo;
  // crypto.randomInt upper bound is exclusive
  return crypto.randomInt(lo, hi + 1);
}

function pickWeighted<T>(choices: Array<WeightedChoice<T>>): T {
  const normalized = choices
    .map((c) => ({ ...c, weight: Number.isFinite(c.weight) ? c.weight : 0 }))
    .filter((c) => c.weight > 0);
  if (normalized.length === 0) {
    return choices[0]!.value;
  }

  // crypto.randomInt requires safe integers; allow fractional weights by scaling.
  const scale = getWeightScale(normalized.map((c) => c.weight));
  const scaled = normalized
    .map((c) => ({
      ...c,
      weight: Math.max(0, Math.round(c.weight * scale)),
    }))
    .filter((c) => c.weight > 0);
  if (scaled.length === 0) {
    return normalized[0]!.value;
  }

  const total = scaled.reduce((sum, c) => sum + c.weight, 0);
  const safeTotal = Number.isSafeInteger(total)
    ? total
    : Math.max(1, Math.floor(total));
  const r = crypto.randomInt(0, safeTotal);
  let acc = 0;
  for (const c of scaled) {
    acc += c.weight;
    if (r < acc) return c.value;
  }
  return scaled[scaled.length - 1]!.value;
}

function rollGoldBonus(): VictoryChestGoldBonus {
  const config = GAME_CONFIG.victoryChest?.goldBonus?.amounts ?? [];
  const chosen = pickWeighted(
    config.map((c) => ({ value: Number(c.amount) || 0, weight: Number(c.weight) || 0 }))
  );
  return { amount: Math.max(0, Math.floor(chosen)) };
}

function rollPotionReward(): VictoryChestPotionReward {
  const tier = pickWeighted([
    {
      value: 2 as const,
      weight: Number(GAME_CONFIG.victoryChest?.potion?.tierWeights?.greater) || 0,
    },
    {
      value: 3 as const,
      weight: Number(GAME_CONFIG.victoryChest?.potion?.tierWeights?.ultra) || 0,
    },
  ]);

  const quantity = pickWeighted([
    {
      value: 1 as const,
      weight: Number(GAME_CONFIG.victoryChest?.potion?.quantityWeights?.[1]) || 0,
    },
    {
      value: 2 as const,
      weight: Number(GAME_CONFIG.victoryChest?.potion?.quantityWeights?.[2]) || 0,
    },
    {
      value: 3 as const,
      weight: Number(GAME_CONFIG.victoryChest?.potion?.quantityWeights?.[3]) || 0,
    },
  ]);

  const itemName =
    tier === 2 ? 'Greater Healing Potion' : ('Ultra Healing Potion' as const);
  return { type: 'potion', potionTier: tier, itemName, quantity };
}

function rollBonusRunReward(
  mode: 'progression' | 'competition'
): VictoryChestBonusRunReward {
  return {
    type: mode === 'competition' ? 'bonus_competition_run' : 'bonus_progression_run',
    bonusRuns: 1,
    mode,
  };
}

function rollWearableReward(): VictoryChestWearableReward {
  const rarity = pickWeighted([
    { value: 'common' as const, weight: Number(GAME_CONFIG.victoryChest?.wearable?.rarityWeights?.common) || 0 },
    { value: 'uncommon' as const, weight: Number(GAME_CONFIG.victoryChest?.wearable?.rarityWeights?.uncommon) || 0 },
    { value: 'rare' as const, weight: Number(GAME_CONFIG.victoryChest?.wearable?.rarityWeights?.rare) || 0 },
    { value: 'legendary' as const, weight: Number(GAME_CONFIG.victoryChest?.wearable?.rarityWeights?.legendary) || 0 },
    { value: 'mythical' as const, weight: Number(GAME_CONFIG.victoryChest?.wearable?.rarityWeights?.mythical) || 0 },
    { value: 'godlike' as const, weight: Number(GAME_CONFIG.victoryChest?.wearable?.rarityWeights?.godlike) || 0 },
  ]);

  const allWearables = getAllWearableSlugs()
    .map((slug) => getWearableBySlug(slug))
    .filter(Boolean) as WearableDefinition[];
  const candidates = allWearables.filter(
    (wearable) => getWearableRarity(wearable) === rarity
  );
  const chosen = candidates.length
    ? candidates[randomIntInclusive(0, candidates.length - 1)]!
    : allWearables[0]!;
  const wearable = getWearableBySlug(chosen.slug) ?? chosen;
  // Keep durability deterministic-ish range; use a reasonable excellent band
  const durabilityScore = randomIntInclusive(700, 950);

  return {
    type: 'wearable',
    wearableSlug: wearable.slug,
    wearableName: wearable.name,
    svgId: wearable.svgId,
    rarity: (wearable.rarityLevel ??
      'common') as VictoryChestWearableReward['rarity'],
    quality: 'excellent',
    durabilityScore,
  };
}

export function rollVictoryChestReward(): VictoryChestRolledReward {
  const main = pickWeighted([
    { value: 'potion' as const, weight: Number(GAME_CONFIG.victoryChest?.weights?.potion) || 0 },
    { value: 'bonus_progression_run' as const, weight: Number(GAME_CONFIG.victoryChest?.weights?.bonusProgressionRun) || 0 },
    { value: 'bonus_competition_run' as const, weight: Number(GAME_CONFIG.victoryChest?.weights?.bonusCompetitionRun) || 0 },
    { value: 'wearable' as const, weight: Number(GAME_CONFIG.victoryChest?.weights?.wearable) || 0 },
  ]);

  const reward =
    main === 'potion'
      ? rollPotionReward()
      : main === 'bonus_progression_run'
        ? rollBonusRunReward('progression')
        : main === 'bonus_competition_run'
          ? rollBonusRunReward('competition')
          : rollWearableReward();

  return { reward, goldBonus: rollGoldBonus() };
}

