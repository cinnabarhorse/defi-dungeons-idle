import type { Application, Request, Response } from 'express';
import {
  getInventory,
  upsertInventoryItem,
  decrementInventoryItem,
} from '../lib/db/repos/inventory';
import { logInventoryEvent } from '../lib/db/repos/inventory-events';
import { runTransaction } from '../lib/db/client';
import {
  PORTAL_MAGE_SHOP_BY_ID,
  type ShopItemDefinition,
} from '../data/npc-shops/portalmage';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';

interface PurchaseRequest {
  itemId: string;
  quantity: number;
}

export function registerShopRoutes(app: Application) {
  app.post('/api/shop/purchase', async (req: Request, res: Response) => {
    try {
      const resolved = await resolveAuthPrincipal(req);
      const playerId = resolved?.playerId;
      if (!playerId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { purchases } = req.body;

      // Validate purchases array
      if (!Array.isArray(purchases) || purchases.length === 0) {
        return res.status(400).json({ error: 'Invalid purchases array' });
      }

      if (purchases.length > 10) {
        return res.status(400).json({
          error: 'Too many items',
          max: 10,
        });
      }

      // Validate and normalize each purchase
      const validatedPurchases: Array<{
        shopItem: ShopItemDefinition;
        quantity: number;
      }> = [];

      for (const purchase of purchases) {
        if (
          !purchase ||
          typeof purchase.itemId !== 'string' ||
          typeof purchase.quantity !== 'number'
        ) {
          return res.status(400).json({ error: 'Invalid purchase format' });
        }

        const quantity = Math.floor(purchase.quantity);
        if (quantity < 1 || quantity > 999) {
          return res.status(400).json({
            error: `Invalid quantity for ${purchase.itemId}`,
            min: 1,
            max: 999,
          });
        }

        const shopItem = PORTAL_MAGE_SHOP_BY_ID.get(purchase.itemId);
        if (!shopItem) {
          return res.status(404).json({
            error: `Item not found: ${purchase.itemId}`,
          });
        }

        validatedPurchases.push({ shopItem, quantity });
      }

      // Calculate total cost for all purchases
      let totalCost = 0;
      for (const { shopItem, quantity } of validatedPurchases) {
        totalCost += shopItem.price * quantity;
      }

      // Get currency info from first item (all use Gold)
      const currencyName = validatedPurchases[0].shopItem.currency.name;
      const currencyType = validatedPurchases[0].shopItem.currency.type;

      // Get player's inventory
      const inventory = await getInventory(playerId);

      // Find currency in inventory
      const currencyItem = inventory.find(
        (item) =>
          item.itemType === currencyType &&
          (item.itemName === currencyName ||
            item.itemName?.toLowerCase() === currencyName.toLowerCase())
      );

      const availableBalance = currencyItem?.quantity || 0;

      if (availableBalance < totalCost) {
        return res.status(400).json({
          error: 'Insufficient funds',
          required: totalCost,
          available: availableBalance,
          currency: currencyName,
        });
      }

      // Execute all purchases within a single transaction
      try {
        const result = await runTransaction(async (client) => {
          // Deduct total currency cost
          const decrementResult = await decrementInventoryItem(
            playerId,
            currencyType,
            currencyName,
            totalCost,
            client
          );

          if (!decrementResult) {
            throw new Error('Failed to deduct currency');
          }

          const spendItems = validatedPurchases.map(
            ({ shopItem, quantity }) => ({
              itemId: shopItem.id,
              itemName: shopItem.label,
              quantity,
              price: shopItem.price,
              total: shopItem.price * quantity,
            })
          );

          await logInventoryEvent(
            {
              playerId,
              itemType: currencyType,
              itemName: currencyName,
              delta: -totalCost,
              reason: 'shop_purchase',
              metadata: {
                source: 'shop_http',
                totalCost,
                items: spendItems,
                purchases: spendItems,
              },
            },
            client
          );

          // Grant all purchased items
          const grantedItems: Array<{
            id: string;
            name: string;
            quantity: number;
          }> = [];

          for (const { shopItem, quantity } of validatedPurchases) {
            const grantQuantity = (shopItem.grant.quantity || 1) * quantity;
            const grantResult = await upsertInventoryItem({
              playerId,
              itemType: (shopItem.grant.type ||
                shopItem.grant.itemType ||
                'potion') as string,
              itemName: shopItem.grant.name || 'Unknown Item',
              quantity: grantQuantity,
              itemData: {
                color: shopItem.grant.color,
                description: shopItem.grant.description,
                rarity: shopItem.grant.rarity,
                spriteId: shopItem.grant.spriteId,
              },
              client,
            });

            grantedItems.push({
              id: grantResult.id,
              name: grantResult.itemName,
              quantity: grantQuantity,
            });
          }

          return {
            newCurrencyBalance: decrementResult.quantityAfter,
            grantedItems,
          };
        });

        return res.json({
          success: true,
          items: result.grantedItems,
          spent: totalCost,
          currency: currencyName,
          newBalance: result.newCurrencyBalance,
        });
      } catch (error) {
        logError(error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Purchase transaction failed';
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
