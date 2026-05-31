/**
 * Dev Mode Server Handler
 *
 * Processes dev mode options from client join requests and applies
 * testing overrides for equipment, potions, and other game settings.
 *
 * IMPORTANT: Dev mode is only enabled in development environments.
 */

import { PlayerSchema } from '../schemas';
import { isAdminAddress } from '../routes/admin-auth';

export interface DevModeOptions {
  devMode?: boolean;
  devEquipment?: string[];
  devHealthPotions?: number;
  /** Tier 2 (Greater Healing) potions for testing */
  devGreaterPotions?: number;
  /** Tier 3 (Ultra Healing) potions for testing */
  devUltraPotions?: number;
  devManaPotions?: number;
  devLickTongueCount?: number;
  devStartHpPercent?: number;
  devStartManaPercent?: number;
  devStartFloor?: number;
  /** Starting depth (room index). Useful to jump to boss room (e.g. 10). */
  devStartDepth?: number;
  devInfiniteResources?: boolean;
  devSkipEntryFee?: boolean;
}

/**
 * Check if dev mode is allowed for this request
 * Dev mode is only allowed for admin addresses in production
 */
export function isDevModeAllowed(walletAddress?: string): boolean {
  // Always allow in development
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) return true;

  // In production, only allow for admin addresses
  if (walletAddress && isAdminAddress(walletAddress)) {
    return true;
  }

  return false;
}

/**
 * Apply dev mode options to a player
 */
export function applyDevModeToPlayer(
  player: PlayerSchema,
  options: DevModeOptions,
  walletAddress?: string
): { applied: boolean; features: string[] } {
  const features: string[] = [];

  // Check if dev mode is requested and allowed
  if (!options.devMode) {
    return { applied: false, features };
  }

  if (!isDevModeAllowed(walletAddress)) {
    console.warn('[DevMode] Dev mode requested but not allowed for this user');
    return { applied: false, features };
  }

  console.log('[DevMode] Applying dev mode overrides for player:', player.id);

  // Apply health potion override
  if (
    typeof options.devHealthPotions === 'number' &&
    Number.isFinite(options.devHealthPotions) &&
    options.devHealthPotions >= 0
  ) {
    player.healthPotionCount = options.devHealthPotions;
    features.push(`healthPotions=${options.devHealthPotions}`);
  }

  // Apply mana potion override
  if (
    typeof options.devManaPotions === 'number' &&
    Number.isFinite(options.devManaPotions) &&
    options.devManaPotions >= 0
  ) {
    player.manaPotionCount = options.devManaPotions;
    features.push(`manaPotions=${options.devManaPotions}`);
  }

  // Apply lick tongue count override
  if (
    typeof options.devLickTongueCount === 'number' &&
    Number.isFinite(options.devLickTongueCount) &&
    options.devLickTongueCount >= 0
  ) {
    player.lickTongueCount = options.devLickTongueCount;
    features.push(`lickTongue=${options.devLickTongueCount}`);
  }

  // Apply starting HP override
  if (
    typeof options.devStartHpPercent === 'number' &&
    Number.isFinite(options.devStartHpPercent) &&
    options.devStartHpPercent >= 0 &&
    options.devStartHpPercent <= 100
  ) {
    const hpPercent = options.devStartHpPercent / 100;
    const minimumHp = options.devStartHpPercent === 0 ? 0 : 1;
    player.hp = Math.max(minimumHp, Math.floor(player.maxHp * hpPercent));
    features.push(`startHp=${options.devStartHpPercent}%`);
  }

  // Apply starting mana override
  if (
    typeof options.devStartManaPercent === 'number' &&
    Number.isFinite(options.devStartManaPercent) &&
    options.devStartManaPercent >= 0 &&
    options.devStartManaPercent <= 100
  ) {
    const manaPercent = options.devStartManaPercent / 100;
    player.mana = Math.floor(player.maxMana * manaPercent);
    features.push(`startMana=${options.devStartManaPercent}%`);
  }

  // Apply starting floor override
  if (
    typeof options.devStartFloor === 'number' &&
    Number.isFinite(options.devStartFloor) &&
    options.devStartFloor >= 1
  ) {
    const startDepth = (options.devStartFloor - 1) * 10 + 1;
    player.idleRoom.depth = startDepth;
    player.idleRoom.maxDepthReached = startDepth;
    features.push(`startFloor=${options.devStartFloor}`);
  }

  // Apply starting depth override (wins over devStartFloor if both provided)
  if (
    typeof options.devStartDepth === 'number' &&
    Number.isFinite(options.devStartDepth) &&
    options.devStartDepth >= 1
  ) {
    const startDepth = Math.floor(options.devStartDepth);
    player.idleRoom.depth = startDepth;
    player.idleRoom.maxDepthReached = startDepth;
    features.push(`startDepth=${startDepth}`);
  }

  // Mark infinite resources flag on player for later use
  if (options.devInfiniteResources) {
    (player as any).devInfiniteResources = true;
    features.push('infiniteResources');
  }

  // Mark skip entry fee flag
  if (options.devSkipEntryFee) {
    (player as any).devSkipEntryFee = true;
    features.push('skipEntryFee');
  }

  if (features.length > 0) {
    console.log('[DevMode] Applied features:', features.join(', '));
  }

  return { applied: true, features };
}

/**
 * Apply dev mode equipment overrides
 * This should be called after the player's equipment state is initialized
 */
export function applyDevModeEquipment(
  player: PlayerSchema,
  equipmentSlugs: string[],
  buildEquipmentState: (characterId: string, overrides: any[]) => any
): void {
  if (!equipmentSlugs || equipmentSlugs.length === 0) return;

  console.log('[DevMode] Applying equipment overrides:', equipmentSlugs);

  // Build equipment overrides from dev mode slugs
  const overrides = equipmentSlugs.map((slug, index) => ({
    // Assign to alternating hand slots for simplicity
    slot: index % 2 === 0 ? 'handRight' : 'handLeft',
    slug,
    inventoryItemId: null,
    quality: 'legendary', // Dev mode items are legendary
  }));

  try {
    const equipmentState = buildEquipmentState(
      player.characterId || 'coderdan',
      overrides
    );

    // Update player's equipped wearables and derived stats
    player.equippedWearables = JSON.stringify(equipmentState.equippedWearables);
    player.derivedStats = JSON.stringify(equipmentState.derivedStats);

    console.log('[DevMode] Equipment applied successfully');
  } catch (error) {
    console.error('[DevMode] Failed to apply equipment:', error);
  }
}

/**
 * Check if player has infinite resources (dev mode)
 */
export function hasInfiniteResources(player: PlayerSchema): boolean {
  return (player as any).devInfiniteResources === true;
}

/**
 * Check if player should skip entry fee (dev mode)
 */
export function shouldSkipEntryFee(player: PlayerSchema): boolean {
  return (player as any).devSkipEntryFee === true;
}

/**
 * Dev mode potion inventory item structure
 */
export interface DevModeInventoryItem {
  id: string;
  type: string;
  name: string;
  quantity: number;
  potionTier?: number;
  itemType?: string;
}

/**
 * Generate dev mode inventory items for tiered potions
 * Returns an array of inventory items to be merged with the player's existing inventory
 */
export function generateDevModePotions(
  options: DevModeOptions
): DevModeInventoryItem[] {
  const items: DevModeInventoryItem[] = [];

  // Tier 1 Health Potions
  if (
    typeof options.devHealthPotions === 'number' &&
    Number.isFinite(options.devHealthPotions) &&
    options.devHealthPotions > 0
  ) {
    items.push({
      id: 'dev_health_potion',
      type: 'potion',
      itemType: 'health_potion',
      name: 'Health Potion',
      quantity: options.devHealthPotions,
      potionTier: 1,
    });
  }

  // Tier 2 Greater Healing Potions
  if (
    typeof options.devGreaterPotions === 'number' &&
    Number.isFinite(options.devGreaterPotions) &&
    options.devGreaterPotions > 0
  ) {
    items.push({
      id: 'dev_greater_health_potion',
      type: 'potion',
      itemType: 'greater_health_potion',
      name: 'Greater Healing Potion',
      quantity: options.devGreaterPotions,
      potionTier: 2,
    });
  }

  // Tier 3 Ultra Healing Potions
  if (
    typeof options.devUltraPotions === 'number' &&
    Number.isFinite(options.devUltraPotions) &&
    options.devUltraPotions > 0
  ) {
    items.push({
      id: 'dev_ultra_health_potion',
      type: 'potion',
      itemType: 'ultra_health_potion',
      name: 'Ultra Healing Potion',
      quantity: options.devUltraPotions,
      potionTier: 3,
    });
  }

  return items;
}

