/**
 * CraftingSystem - Handles potion tier crafting
 *
 * Players can craft higher-tier potions from lower-tier ones:
 * - 3x T1 (Health Potion) → 1x T2 (Greater Healing Potion)
 * - 3x T2 (Greater Healing Potion) → 1x T3 (Ultra Healing Potion)
 */

import type { Client } from 'colyseus';
import type { GameRoom } from './GameRoom';
import { CRAFTING_RECIPES, type CraftingRecipe } from '../data/game-config';

/**
 * Map of potion tier to item type key
 */
const POTION_ITEM_TYPES: Record<number, string> = {
  1: 'health_potion',
  2: 'greater_health_potion',
  3: 'ultra_health_potion',
};

/**
 * Map of potion tier to display name
 */
const POTION_NAMES: Record<number, string> = {
  1: 'Health Potion',
  2: 'Greater Healing Potion',
  3: 'Ultra Healing Potion',
};

export interface CraftPotionPayload {
  fromTier: number;
}

export interface CraftResult {
  success: boolean;
  error?: string;
  inputTier?: number;
  outputTier?: number;
  inputConsumed?: number;
  outputProduced?: number;
}

/**
 * Find the recipe for crafting from a given tier
 */
function findRecipe(fromTier: number): CraftingRecipe | undefined {
  return CRAFTING_RECIPES.find((recipe) => recipe.inputTier === fromTier);
}

/**
 * Get the count of potions for a specific tier from inventory
 */
function getPotionCountByTier(
  inventory: any[],
  tier: number
): { count: number; item: any | null } {
  const itemType = POTION_ITEM_TYPES[tier];
  if (!itemType) {
    return { count: 0, item: null };
  }

  const potion = inventory.find((item: any) => {
    if (!item) return false;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return false;

    const type = String(item.type ?? item.itemType ?? '').toLowerCase();
    if (type !== 'potion') return false;

    // Match by potionTier if available, otherwise by item type/name
    const potionTier = Number(item.potionTier);
    if (potionTier === tier) return true;

    // Fallback to name matching
    const normalizedItemType = String(item.itemType ?? '').toLowerCase();
    return normalizedItemType === itemType.toLowerCase();
  });

  return {
    count: potion ? Number(potion.quantity) || 0 : 0,
    item: potion || null,
  };
}

/**
 * Validate that crafting can be performed
 */
export function validateCraft(
  inventory: any[],
  fromTier: number
): CraftResult {
  // Check if tier is valid (can only craft from T1 or T2)
  if (fromTier !== 1 && fromTier !== 2) {
    return {
      success: false,
      error:
        fromTier === 3
          ? 'Cannot craft higher tier'
          : 'Invalid potion tier for crafting',
    };
  }

  const recipe = findRecipe(fromTier);
  if (!recipe) {
    return {
      success: false,
      error: 'No recipe available for this tier',
    };
  }

  const { count: inputCount } = getPotionCountByTier(inventory, fromTier);

  if (inputCount < recipe.inputCount) {
    return {
      success: false,
      error: 'Insufficient materials',
    };
  }

  return {
    success: true,
    inputTier: recipe.inputTier,
    outputTier: recipe.outputTier,
    inputConsumed: recipe.inputCount,
    outputProduced: recipe.outputCount,
  };
}

/**
 * Handle the craft_potion message from a client
 */
export async function handleCraftPotion(
  room: GameRoom,
  client: Client,
  payload: CraftPotionPayload
): Promise<void> {
  const sessionId = client.sessionId;
  const player = room.state.players.get(sessionId);
  console.warn('[Crafting] craft_potion received', {
    sessionId,
    playerId: player?.id ?? null,
    payload,
  });

  if (!player) {
    console.warn('[Crafting] craft_potion failed: player not found', {
      sessionId,
      payload,
    });
    room.msg.sendTo(client, 'craft_error', {
      error: 'Player not found',
    });
    return;
  }

  const fromTier = Number(payload?.fromTier);
  if (!Number.isInteger(fromTier) || fromTier < 1 || fromTier > 3) {
    console.warn('[Crafting] craft_potion failed: invalid tier', {
      sessionId,
      playerId: player.id,
      fromTier,
      payload,
    });
    room.msg.sendTo(client, 'craft_error', {
      error: 'Invalid potion tier',
    });
    return;
  }

  // Get player inventory
  const inventory = (room as any).playerInventories.get(sessionId);
  if (!inventory || inventory.length === 0) {
    console.warn('[Crafting] craft_potion failed: empty inventory', {
      sessionId,
      playerId: player.id,
      fromTier,
    });
    room.msg.sendTo(client, 'craft_error', {
      error: 'Insufficient materials',
    });
    return;
  }

  // Validate the craft operation
  const validation = validateCraft(inventory, fromTier);
  if (!validation.success) {
    console.warn('[Crafting] craft_potion failed: validation', {
      sessionId,
      playerId: player.id,
      fromTier,
      error: validation.error ?? 'Crafting failed',
    });
    room.msg.sendTo(client, 'craft_error', {
      error: validation.error || 'Crafting failed',
    });
    return;
  }

  const recipe = findRecipe(fromTier)!;
  const { item: inputPotion } = getPotionCountByTier(inventory, fromTier);

  if (!inputPotion) {
    console.warn('[Crafting] craft_potion failed: missing input potion', {
      sessionId,
      playerId: player.id,
      fromTier,
    });
    room.msg.sendTo(client, 'craft_error', {
      error: 'Insufficient materials',
    });
    return;
  }

  // Remove input potions (3x from input tier)
  await room.applyInventoryDelta(sessionId, inputPotion, -recipe.inputCount, {
    auditSource: `craft_room_input:tier_${fromTier}_x${recipe.inputCount}`,
  });

  // Add output potion (1x to output tier)
  const outputItemType = POTION_ITEM_TYPES[recipe.outputTier];
  const outputPotionItem = {
    id: outputItemType,
    itemType: outputItemType,
    type: 'potion',
    name: POTION_NAMES[recipe.outputTier],
    quantity: recipe.outputCount,
    potionTier: recipe.outputTier,
  };

  await room.applyInventoryDelta(sessionId, outputPotionItem, recipe.outputCount, {
    auditSource: `craft_room_output:tier_${recipe.outputTier}_x${recipe.outputCount}`,
  });

  // Get updated inventory for response
  const updatedInventory = (room as any).playerInventories.get(sessionId) || [];
  const inventoryState = buildPotionInventoryState(updatedInventory);

  // Send success response
  room.msg.sendTo(client, 'craft_success', {
    inputTier: fromTier,
    outputTier: recipe.outputTier,
    inputConsumed: recipe.inputCount,
    outputProduced: recipe.outputCount,
    inventory: inventoryState,
  });

  console.warn('[Crafting] craft_potion success', {
    sessionId,
    playerId: player.id,
    fromTier,
    outputTier: recipe.outputTier,
    inputConsumed: recipe.inputCount,
    outputProduced: recipe.outputCount,
  });
}

/**
 * Build a summary of potion inventory by tier for UI display
 */
function buildPotionInventoryState(inventory: any[]): Record<number, number> {
  const state: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

  for (const item of inventory) {
    if (!item) continue;

    const type = String(item.type ?? item.itemType ?? '').toLowerCase();
    if (type !== 'potion') continue;

    const name = String(item.name ?? item.itemType ?? '').toLowerCase();
    if (!name.includes('health') && !name.includes('healing')) continue;

    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;

    // Determine tier
    let tier = Number(item.potionTier);
    if (!tier || tier < 1 || tier > 3) {
      // Fallback to name-based detection
      const itemType = String(item.itemType ?? '').toLowerCase();
      if (itemType === 'ultra_health_potion') {
        tier = 3;
      } else if (itemType === 'greater_health_potion') {
        tier = 2;
      } else {
        tier = 1;
      }
    }

    state[tier] = (state[tier] || 0) + quantity;
  }

  return state;
}

/**
 * Get crafting availability for a player (for UI display)
 */
export function getCraftingAvailability(
  inventory: any[]
): { canCraftT1ToT2: boolean; canCraftT2ToT3: boolean; counts: Record<number, number> } {
  const counts = buildPotionInventoryState(inventory);

  return {
    canCraftT1ToT2: counts[1] >= 3,
    canCraftT2ToT3: counts[2] >= 3,
    counts,
  };
}
