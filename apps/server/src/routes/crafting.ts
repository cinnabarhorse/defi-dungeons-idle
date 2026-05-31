import type { Application, Request, Response } from 'express';
import {
  getInventory,
  upsertInventoryItem,
  decrementInventoryItem,
} from '../lib/db/repos/inventory';
import { runTransaction } from '../lib/db/client';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';
import { CRAFTING_RECIPES } from '../data/game-config';

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

export function registerCraftingRoutes(app: Application) {
  app.post('/api/crafting/craft', async (req: Request, res: Response) => {
    try {
      const resolved = await resolveAuthPrincipal(req);
      const playerId = resolved?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { fromTier, count: rawCount } = req.body;

      // Validate fromTier
      const tier = Number(fromTier);
      if (!Number.isInteger(tier) || tier < 1 || tier > 2) {
        if (tier === 3) {
          return res.status(400).json({ error: 'Cannot craft higher tier' });
        }
        return res.status(400).json({ error: 'Invalid potion tier' });
      }

      // Validate count (default to 1 for backwards compatibility)
      const count = rawCount !== undefined ? Number(rawCount) : 1;
      if (!Number.isInteger(count) || count < 1) {
        return res.status(400).json({ error: 'Invalid craft count' });
      }

      // Find recipe
      const recipe = CRAFTING_RECIPES.find((r) => r.inputTier === tier);
      if (!recipe) {
        return res.status(400).json({ error: 'No recipe for this tier' });
      }

      // Get player's inventory
      const inventory = await getInventory(playerId);

      // Find potions of the input tier
      const inputItemType = POTION_ITEM_TYPES[tier];
      const inputItemName = POTION_NAMES[tier];
      
      // Find by item type or name (handle both old and new formats)
      const inputPotion = inventory.find((item) => {
        if (item.itemType !== 'potion' && item.itemType !== inputItemType) {
          return false;
        }
        const name = item.itemName?.toLowerCase() || '';
        const type = item.itemType?.toLowerCase() || '';
        return (
          name === inputItemName.toLowerCase() ||
          type === inputItemType.toLowerCase() ||
          (name.includes('health') && (item.itemData as any)?.potionTier === tier)
        );
      });

      const availableCount = inputPotion?.quantity || 0;
      const totalInputNeeded = recipe.inputCount * count;

      if (availableCount < totalInputNeeded) {
        return res.status(400).json({
          error: 'Insufficient materials',
          required: totalInputNeeded,
          available: availableCount,
        });
      }

      const outputItemType = POTION_ITEM_TYPES[recipe.outputTier];
      const outputItemName = POTION_NAMES[recipe.outputTier];

      // Execute craft within a transaction
      try {
        const totalInputConsumed = recipe.inputCount * count;
        const totalOutputProduced = recipe.outputCount * count;

        const result = await runTransaction(async (client) => {
          // Deduct input potions
          const decrementResult = await decrementInventoryItem(
            playerId,
            inputPotion!.itemType,
            inputPotion!.itemName,
            totalInputConsumed,
            client
          );

          if (!decrementResult) {
            throw new Error('Failed to deduct input potions');
          }

          // Grant output potion
          const grantResult = await upsertInventoryItem({
            playerId,
            itemType: outputItemType,
            itemName: outputItemName,
            quantity: totalOutputProduced,
            itemData: {
              type: 'potion',
              potionTier: recipe.outputTier,
              color: recipe.outputTier === 2 ? '#ff4757' : '#ff1744',
              description:
                recipe.outputTier === 2
                  ? 'Restores a moderate amount of health when consumed'
                  : 'Restores a large amount of health when consumed',
              rarity: recipe.outputTier === 2 ? 'uncommon' : 'rare',
              spriteId: recipe.outputTier === 2 ? 127 : 129,
            },
            client,
          });

          return {
            inputConsumed: totalInputConsumed,
            outputProduced: totalOutputProduced,
            newInputCount: decrementResult.quantityAfter,
            outputItem: grantResult,
          };
        });

        console.log(
          `Player ${playerId} crafted ${totalOutputProduced}x T${recipe.outputTier} from ${totalInputConsumed}x T${tier}`,
          {
            outputItemType: outputItemType,
            outputItemName: outputItemName,
            inputItemType: inputPotion?.itemType,
            inputItemName: inputPotion?.itemName,
          }
        );

        return res.json({
          success: true,
          inputTier: tier,
          outputTier: recipe.outputTier,
          inputConsumed: result.inputConsumed,
          outputProduced: result.outputProduced,
        });
      } catch (error) {
        logError(error);
        const errorMessage =
          error instanceof Error ? error.message : 'Crafting failed';
        return res.status(500).json({
          error: errorMessage,
        });
      }
    } catch (error) {
      logError(error);
      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  });
}
