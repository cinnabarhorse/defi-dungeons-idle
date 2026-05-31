import { POTION_TIERS } from '../data/game-config';

/**
 * Compute health potion healing amount based on tier and max HP.
 * Uses POTION_TIERS config for healPercent and minHeal values.
 *
 * @param maxHp - The player's maximum HP
 * @param tier - The potion tier (1, 2, or 3). Invalid tiers default to tier 1.
 * @returns The healing amount (healPercent × maxHp, with minHeal as floor)
 *
 * Examples:
 * - Tier 1, 500 maxHp: max(50, 500×0.10) = 50
 * - Tier 2, 500 maxHp: max(0, 500×0.25) = 125
 * - Tier 3, 500 maxHp: max(0, 500×0.50) = 250
 */
export function computeHealthPotionHeal(maxHp: number, tier: number = 1): number {
  // Get tier config, defaulting to tier 1 for invalid tiers
  const tierConfig = POTION_TIERS[tier] ?? POTION_TIERS[1];
  
  // Fallback if even tier 1 is somehow missing (shouldn't happen)
  if (!tierConfig) {
    const base = 50;
    const percent = Math.floor(Math.max(0, maxHp) * 0.1);
    return Math.max(base, percent);
  }
  
  const { healPercent, minHeal } = tierConfig;
  const percentHeal = Math.floor(Math.max(0, maxHp) * healPercent);
  return Math.max(minHeal, percentHeal);
}

export function computeManaPotionRestore(maxMana: number): number {
  const base = 50;
  const percent = Math.floor(Math.max(0, maxMana) * 0.2);
  return Math.max(base, percent);
}

/**
 * Available potions by tier for smart selection.
 * Keys are tier numbers (1, 2, 3), values are quantity available.
 */
export interface AvailablePotionsByTier {
  [tier: number]: number;
}

export interface PotionItemLike {
  type?: string;
  itemType?: string;
  name?: string;
  potionTier?: number;
}

function getPotionItemStrings(item: PotionItemLike) {
  return {
    type: String(item.type ?? item.itemType ?? '').toLowerCase(),
    name: String(item.name ?? '').toLowerCase(),
  };
}

export function isHealthPotionItem(item: PotionItemLike): boolean {
  const { type, name } = getPotionItemStrings(item);
  const hasHealthTier = Number(item.potionTier) > 0;
  const isHealthPotionType =
    type === 'health_potion' ||
    type === 'greater_health_potion' ||
    type === 'ultra_health_potion' ||
    type.endsWith('_health_potion');
  const isHealthPotionName = name.includes('health') || name.includes('healing');
  return Boolean(hasHealthTier || isHealthPotionType || isHealthPotionName);
}

export function getHealthPotionTier(item: PotionItemLike): number | null {
  const rawTier = Number(item.potionTier);
  if (Number.isFinite(rawTier) && rawTier >= 1 && rawTier <= 3) {
    return Math.floor(rawTier);
  }

  const { type, name } = getPotionItemStrings(item);
  if (type.includes('ultra') || name.includes('ultra')) return 3;
  if (type.includes('greater') || name.includes('greater')) return 2;
  if (type.includes('health') || name.includes('health') || name.includes('healing'))
    return 1;
  return null;
}

/**
 * Select the optimal potion tier to use for auto-consume.
 * 
 * Logic:
 * 1. Find the lowest tier that brings HP > 0 (survive with minimal waste)
 * 2. If no tier can save, use highest available tier (best chance, still dies)
 * 3. Return null if no potions available
 * 
 * @param currentHp - Current HP (typically negative after damage)
 * @param maxHp - Maximum HP for calculating heal amounts
 * @param availablePotions - Object mapping tier numbers to quantities
 * @returns The tier to use, or null if no potions available
 * 
 * Examples:
 * - HP at -40, maxHp 500, has T1 and T2 → select T1 (heals 50, survives at 10)
 * - HP at -100, maxHp 500, has T1 and T2 → select T2 (T1 heals 50 = -50, T2 heals 125 = 25)
 * - HP at -300, maxHp 500, has T1 only → select T1 (best available, still dies)
 * - No potions available → return null
 */
export function selectOptimalPotion(
  currentHp: number,
  maxHp: number,
  availablePotions: AvailablePotionsByTier
): number | null {
  // Get available tiers (those with quantity > 0)
  const availableTiers = Object.entries(availablePotions)
    .filter(([_, quantity]) => quantity > 0)
    .map(([tier]) => Number(tier))
    .filter((tier) => tier >= 1 && tier <= 3)
    .sort((a, b) => a - b); // Sort ascending for lowest-first check
  
  // No potions available
  if (availableTiers.length === 0) {
    return null;
  }
  
  // Try to find lowest tier that saves the player (HP > 0 after heal)
  for (const tier of availableTiers) {
    const healAmount = computeHealthPotionHeal(maxHp, tier);
    const hpAfterHeal = currentHp + healAmount;
    
    if (hpAfterHeal > 0) {
      // This tier saves the player, use it
      return tier;
    }
  }
  
  // No tier can save - return highest available tier (best chance)
  return availableTiers[availableTiers.length - 1];
}
