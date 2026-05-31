/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Server Difficulty Tiers Data - Generated from /data/difficulty-tiers.ts
 * This file is automatically synced to ensure consistency.
 *
 * To make changes, edit /data/difficulty-tiers.ts and run: npm run generate:shared
 */

/**
 * Difficulty Tiers - Single Source of Truth
 * This file contains difficulty tier definitions used by both client and server
 *
 * v2.0 - Simplified to 3 tiers: Normal, Nightmare, Hell
 * Stats are based on the original tier 1 of each difficulty category.
 */

export interface DifficultyTier {
  id: string;
  name: string;
  usdcStakedRequired: number;
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  enemySpeedMultiplier: number;
  enemyAggroRangeMultiplier: number;
  dropRateMultiplier: number; // For future loot improvements
  maxEarnings: number; // max USDC earned per run
  description: string;
  levelCost: number; // the amount of USDC required to play per run
  xpMultiplier: number; // XP multiplier applied to enemy base XP
}

export const DIFFICULTY_TIERS: Record<string, DifficultyTier> = {
  normal: {
    id: 'normal',
    name: 'Normal',
    usdcStakedRequired: 0,
    enemyHealthMultiplier: 1.0,
    enemyDamageMultiplier: 1.0,
    enemySpeedMultiplier: 1.0,
    enemyAggroRangeMultiplier: 1.0,
    dropRateMultiplier: 1.0,
    maxEarnings: 4,
    levelCost: 1,
    xpMultiplier: 1.0,
    description:
      'The starting difficulty - enemies are at their base strength.',
  },
  nightmare: {
    id: 'nightmare',
    name: 'Nightmare',
    usdcStakedRequired: 100,
    enemyHealthMultiplier: 2.0,
    enemyDamageMultiplier: 1.5,
    enemySpeedMultiplier: 1.2,
    enemyAggroRangeMultiplier: 1.3,
    dropRateMultiplier: 1.5,
    maxEarnings: 25,
    levelCost: 5,
    xpMultiplier: 1.4,
    description: 'Enter the nightmare realm - enemies are twice as tough!',
  },
  hell: {
    id: 'hell',
    name: 'Hell',
    usdcStakedRequired: 1000,
    enemyHealthMultiplier: 4.0,
    enemyDamageMultiplier: 2.5,
    enemySpeedMultiplier: 1.5,
    enemyAggroRangeMultiplier: 1.6,
    dropRateMultiplier: 2.5,
    maxEarnings: 100,
    levelCost: 10,
    xpMultiplier: 2.0,
    description:
      'Welcome to hell - enemies are four times deadlier than normal.',
  },
};

// Utility functions
export function getDifficultyTier(tierId: string): DifficultyTier | null {
  // Support legacy tier IDs by mapping to new tiers
  const normalized = normalizeTierId(tierId);
  return DIFFICULTY_TIERS[normalized] || null;
}

/**
 * Normalize legacy tier IDs to new simplified tier IDs.
 * Maps: normal_1, normal_2, normal_3 → normal
 *       nightmare_1, nightmare_2, nightmare_3 → nightmare
 *       hell_1, hell_2, hell_3, beyond_hell → hell
 */
export function normalizeTierId(tierId: string): string {
  const id = (tierId || '').toLowerCase().trim();

  if (id.startsWith('normal')) return 'normal';
  if (id.startsWith('nightmare')) return 'nightmare';
  if (id.startsWith('hell') || id === 'beyond_hell') return 'hell';

  // Return as-is if already normalized or unknown
  return id;
}

export function getNextLockedTier(
  usdcStakedBalance: number
): DifficultyTier | null {
  const nextTierId = DIFFICULTY_TIER_SEQUENCE.find(
    (tierId) =>
      DIFFICULTY_TIERS[tierId].usdcStakedRequired > usdcStakedBalance
  );
  return nextTierId ? DIFFICULTY_TIERS[nextTierId] : null;
}

export function getUnlockCost(tierId: string): number | null {
  const tier = getDifficultyTier(tierId);
  return tier ? tier.usdcStakedRequired : null;
}

export function isTierEligible(
  tierId: string,
  usdcStakedBalance: number
): boolean {
  const cost = getUnlockCost(tierId);
  return cost !== null && usdcStakedBalance >= cost;
}

// Sequential unlocking helpers - simplified to 3 tiers
export const DIFFICULTY_TIER_SEQUENCE: string[] = [
  'normal',
  'nightmare',
  'hell',
];

export function getPreviousTierId(tierId: string): string | null {
  const normalized = normalizeTierId(tierId);
  const index = DIFFICULTY_TIER_SEQUENCE.indexOf(normalized);
  if (index <= 0) return null;
  return DIFFICULTY_TIER_SEQUENCE[index - 1] || null;
}

export function meetsSequentialPrerequisite(
  tierId: string,
  unlockedTiers: string[]
): boolean {
  const previous = getPreviousTierId(tierId);
  if (!previous) return true;
  // Normalize unlocked tiers for comparison
  const normalizedUnlocked = unlockedTiers.map(normalizeTierId);
  return normalizedUnlocked.includes(previous);
}

export function canUnlockTier(
  tierId: string,
  usdcStakedBalance: number,
  unlockedTiers: string[]
): boolean {
  const normalized = normalizeTierId(tierId);
  const normalizedUnlocked = unlockedTiers.map(normalizeTierId);

  if (normalizedUnlocked.includes(normalized)) return false;
  if (!isTierEligible(normalized, usdcStakedBalance)) return false;
  return meetsSequentialPrerequisite(normalized, unlockedTiers);
}

// Reward calculation interfaces and types
export interface RewardCalculationResult {
  amount: number;
  probability: number;
  expectedValue: number;
}

export interface RewardDistribution {
  minReward: number;
  maxReward: number;
  expectedReturn: number; // As percentage of cost (e.g., 0.8 = 80% return)
  volatility: number; // Higher = more variance in rewards
}

// Reward distribution configuration for each tier
const REWARD_DISTRIBUTIONS: Record<string, RewardDistribution> = {
  normal: {
    minReward: 0,
    maxReward: 1,
    expectedReturn: 0.85, // 85% return on investment
    volatility: 0.3, // Low volatility for beginner tier
  },
  nightmare: {
    minReward: 0,
    maxReward: 1,
    expectedReturn: 0.8, // 80% return on investment
    volatility: 0.5, // Medium volatility
  },
  hell: {
    minReward: 0,
    maxReward: 1,
    expectedReturn: 0.75, // 75% return on investment
    volatility: 0.7, // High volatility - high risk, high reward
  },
};

/**
 * Calculates the probabilistic USDC reward for opening a treasure chest
 * Uses a beta distribution for realistic reward curves with configurable risk/reward profiles
 */
export function calculateTreasureReward(
  tierId: string,
  randomSeed?: number
): RewardCalculationResult {
  const normalized = normalizeTierId(tierId);
  const tier = getDifficultyTier(normalized);
  if (!tier) {
    return { amount: 0, probability: 0, expectedValue: 0 };
  }

  const distribution = REWARD_DISTRIBUTIONS[normalized] || REWARD_DISTRIBUTIONS.normal;
  const random =
    randomSeed !== undefined ? seededRandom(randomSeed) : Math.random();

  // Calculate expected value based on cost and return rate
  const expectedValue = tier.levelCost * distribution.expectedReturn;

  // Use beta distribution for realistic reward curves
  // Higher volatility = more extreme outcomes (either very low or very high rewards)
  const alpha = 2 - distribution.volatility; // Lower alpha = more left-skewed (more small rewards)
  const beta = 2 + distribution.volatility; // Higher beta = longer tail (rare big rewards)

  const betaRandom = betaDistribution(random, alpha, beta);

  // Apply non-linear scaling to create more interesting reward distribution
  // This creates a curve where most rewards are small, but big rewards are possible
  const scaledRandom = Math.pow(
    betaRandom,
    1.5 - distribution.volatility * 0.5
  );

  // Calculate final reward amount
  const rewardAmount = Math.floor(scaledRandom * tier.maxEarnings * 100) / 100; // Round to 2 decimal places

  // Calculate probability of getting this exact reward (approximate)
  const probability = calculateRewardProbability(
    rewardAmount,
    tier.maxEarnings,
    distribution
  );

  return {
    amount: rewardAmount,
    probability: probability,
    expectedValue: expectedValue,
  };
}

/**
 * Generates a seeded random number for deterministic testing
 */
function seededRandom(seed: number): number {
  // Add 1 to avoid sin(0) = 0 issues
  const x = Math.sin(seed + 1) * 10000;
  return Math.abs(x - Math.floor(x));
}

/**
 * Approximates beta distribution using uniform random
 * This creates more realistic reward distributions than pure uniform
 */
function betaDistribution(random: number, alpha: number, beta: number): number {
  // Simple approximation of beta distribution
  // For more accuracy, you could use a proper beta distribution implementation
  const u1 = Math.max(0.001, Math.min(0.999, random)); // Clamp to avoid edge cases
  const u2 = Math.max(0.001, Math.min(0.999, seededRandom(random * 1000)));

  const x = Math.pow(u1, 1 / Math.max(0.1, alpha));
  const y = Math.pow(u2, 1 / Math.max(0.1, beta));

  const sum = x + y;
  return sum > 0 ? x / sum : 0.5; // Fallback to 0.5 if sum is 0
}

/**
 * Calculates approximate probability of getting a specific reward amount
 */
function calculateRewardProbability(
  amount: number,
  maxAmount: number,
  distribution: RewardDistribution
): number {
  const normalizedAmount = amount / maxAmount;

  // Probability decreases exponentially for higher rewards
  // Adjusted by volatility - higher volatility = flatter probability curve
  const baseProb = Math.exp(-normalizedAmount * (3 - distribution.volatility));

  // Normalize to ensure probabilities make sense
  return Math.min(baseProb, 1.0);
}

/**
 * Gets the expected value for a given difficulty tier
 */
export function getExpectedReward(tierId: string): number {
  const normalized = normalizeTierId(tierId);
  const tier = getDifficultyTier(normalized);
  if (!tier) return 0;

  const distribution = REWARD_DISTRIBUTIONS[normalized] || REWARD_DISTRIBUTIONS.normal;
  return tier.levelCost * distribution.expectedReturn;
}

/**
 * Simulates multiple treasure chest openings to analyze reward distribution
 * Useful for balancing and testing
 */
export function simulateRewards(
  tierId: string,
  simulations: number = 1000
): {
  averageReward: number;
  medianReward: number;
  minReward: number;
  maxReward: number;
  totalPayout: number;
  profitMargin: number; // Percentage of cost recovered
} {
  const normalized = normalizeTierId(tierId);
  const tier = getDifficultyTier(normalized);
  if (!tier) {
    return {
      averageReward: 0,
      medianReward: 0,
      minReward: 0,
      maxReward: 0,
      totalPayout: 0,
      profitMargin: 0,
    };
  }

  const rewards: number[] = [];
  let totalPayout = 0;

  for (let i = 0; i < simulations; i++) {
    const result = calculateTreasureReward(normalized, i);
    rewards.push(result.amount);
    totalPayout += result.amount;
  }

  rewards.sort((a, b) => a - b);

  const averageReward = totalPayout / simulations;
  const medianReward = rewards[Math.floor(simulations / 2)];
  const minReward = rewards[0];
  const maxReward = rewards[simulations - 1];
  const totalCost = tier.levelCost * simulations;
  const profitMargin = (totalPayout / totalCost) * 100;

  return {
    averageReward,
    medianReward,
    minReward,
    maxReward,
    totalPayout,
    profitMargin,
  };
}
