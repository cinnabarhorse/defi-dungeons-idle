import type { Application, Request, Response } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';
import { runTransaction } from '../lib/db/client';
import {
  inventoryRepo,
  equipmentRepo,
  economyRepo,
  globalEconomyCountersRepo,
} from '../lib/db';
import {
  EQUIPMENT_SELL_DAILY_CAP,
  EQUIPMENT_SELL_MAX_ITEMS_PER_REQUEST,
  EQUIPMENT_SELL_RATE_LIMIT_MAX_REQUESTS,
  EQUIPMENT_SELL_RATE_LIMIT_WINDOW_MS,
  getSellPriceForWearable,
  isExplicitlyDeniedSellItem,
  isSellableEquipmentType,
  type EquipmentSellRarity,
} from '../lib/inventory-sell';

const GLOBAL_COUNTER_NAME = 'equipment_sell_gold';

type SellRequest =
  | { kind: 'instance'; inventoryItemId: string }
  | {
      kind: 'fungible';
      itemType: string;
      itemName: string;
      quantity: number;
    };

interface SellSummaryItem {
  itemType: string;
  itemName: string;
  quantity: number;
  payout: number;
  inventoryItemId?: string;
  rarity?: EquipmentSellRarity;
  quality?: string | null;
}

class InventorySellError extends Error {
  status: number;
  code: string;
  detail?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status = 400,
    detail?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const rateLimitState = new Map<
  string,
  { windowStart: number; count: number }
>();

export function resetInventorySellRateLimit() {
  rateLimitState.clear();
}

function isRateLimited(playerId: string) {
  const now = Date.now();
  const current = rateLimitState.get(playerId);
  if (!current || now - current.windowStart > EQUIPMENT_SELL_RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(playerId, { windowStart: now, count: 1 });
    return false;
  }
  if (current.count >= EQUIPMENT_SELL_RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  current.count += 1;
  return false;
}

function getBucketDateUtc(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getNextResetUtcIso(date = new Date()) {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  );
  return next.toISOString();
}

function normalizeSellRequests(body: any): SellRequest[] {
  const raw =
    Array.isArray(body) && body.length > 0
      ? body
      : Array.isArray(body?.sales)
        ? body.sales
        : Array.isArray(body?.items)
          ? body.items
          : body
            ? [body]
            : [];

  return raw
    .map((entry: any) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      if (typeof entry.inventoryItemId === 'string') {
        const inventoryItemId = entry.inventoryItemId.trim();
        if (!inventoryItemId) return null;
        return { kind: 'instance', inventoryItemId } as SellRequest;
      }
      const itemType =
        typeof entry.itemType === 'string' ? entry.itemType.trim() : '';
      const itemName =
        typeof entry.itemName === 'string' ? entry.itemName.trim() : '';
      const quantity = Math.floor(Number(entry.quantity) || 0);
      if (!itemType || !itemName || quantity <= 0) {
        return null;
      }
      return {
        kind: 'fungible',
        itemType,
        itemName,
        quantity,
      } as SellRequest;
    })
    .filter(Boolean) as SellRequest[];
}

function resolveSellPriceForRecord(
  record: {
    itemType: string;
    itemName: string;
    wearableSlug?: string | null;
    quality?: string | null;
    itemData?: unknown;
  },
  quantity: number
) {
  const normalizedType = String(record.itemType || '').toLowerCase();
  const slug =
    String(record.wearableSlug || record.itemName || '').trim() ||
    String(record.itemName || '').trim();

  if (normalizedType === 'wearable') {
    const wearablePrice = getSellPriceForWearable(slug, record.quality ?? null);
    if (!wearablePrice) {
      return null;
    }
    return {
      ...wearablePrice,
      totalPrice: wearablePrice.unitPrice,
    };
  }

  const wearablePrice = getSellPriceForWearable(slug, record.quality ?? null);
  if (wearablePrice) {
    return {
      ...wearablePrice,
      totalPrice: wearablePrice.unitPrice * quantity,
    };
  }
  return null;
}

export function registerInventorySellRoutes(app: Application) {
  app.get('/api/economy/equipment-sell-cap', async (_req: Request, res: Response) => {
    try {
      const bucketDate = getBucketDateUtc();
      const record = await globalEconomyCountersRepo.getCounter(
        GLOBAL_COUNTER_NAME,
        bucketDate
      );
      const soldToday = record?.amount ?? 0;
      const remainingToday = Math.max(0, EQUIPMENT_SELL_DAILY_CAP - soldToday);
      return res.json({
        dailyCap: EQUIPMENT_SELL_DAILY_CAP,
        soldToday,
        remainingToday,
        resetsAtUtc: getNextResetUtcIso(),
      });
    } catch (error) {
      logError(error);
      return res.status(500).json({ error: 'Failed to load cap' });
    }
  });

  app.post('/api/player/inventory/sell', async (req: Request, res: Response) => {
    const resolved = await resolveAuthPrincipal(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }
  const playerId = resolved.playerId;

    const requests = normalizeSellRequests(req.body);
    if (requests.length === 0) {
      return res.status(400).json({ error: 'Invalid sell request' });
    }

    if (requests.length > EQUIPMENT_SELL_MAX_ITEMS_PER_REQUEST) {
      return res.status(400).json({
        error: 'Too many items',
        max: EQUIPMENT_SELL_MAX_ITEMS_PER_REQUEST,
      });
    }

    if (isRateLimited(resolved.playerId)) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many sell requests. Please slow down.',
      });
    }

    try {
      const result = await runTransaction(async (client) => {
        const bucketDate = getBucketDateUtc();
        const counter = await globalEconomyCountersRepo.getCounterForUpdate(
          GLOBAL_COUNTER_NAME,
          bucketDate,
          client
        );

        if (!counter) {
          throw new InventorySellError(
            'Failed to initialize sell counter',
            'COUNTER_INIT_FAILED',
            500
          );
        }

        const equippedSummary = await equipmentRepo.getEquippedSummary(
          playerId,
          client
        );

        const instanceRequests = requests.filter(
          (request) => request.kind === 'instance'
        ) as Array<SellRequest & { kind: 'instance' }>;
        const instanceIds = instanceRequests.map((request) => request.inventoryItemId);

        const instanceMap = await inventoryRepo.getInventoryMapByIds(
          instanceIds,
          client
        );

        let totalPayout = 0;
        const soldItems: SellSummaryItem[] = [];

        for (const request of instanceRequests) {
          const record = instanceMap.get(request.inventoryItemId);
          if (!record || record.playerId !== playerId) {
            throw new InventorySellError(
              'Item not found',
              'ITEM_NOT_FOUND',
              404
            );
          }

          if (!isSellableEquipmentType(record.itemType)) {
            throw new InventorySellError(
              'Item is not sellable',
              'ITEM_NOT_SELLABLE'
            );
          }

          if (isExplicitlyDeniedSellItem(record.itemType, record.itemName)) {
            throw new InventorySellError(
              'Item cannot be sold',
              'ITEM_NOT_SELLABLE'
            );
          }

          if (equippedSummary.idSet.has(record.id)) {
            throw new InventorySellError(
              'Equipped items cannot be sold',
              'ITEM_EQUIPPED'
            );
          }

          const price = resolveSellPriceForRecord(
            {
              itemType: record.itemType,
              itemName: record.itemName,
              wearableSlug: record.wearableSlug,
              quality: record.quality,
              itemData: record.itemData,
            },
            1
          );
          if (!price) {
            throw new InventorySellError(
              'Item cannot be priced',
              'ITEM_NOT_SELLABLE'
            );
          }

          const removed = await inventoryRepo.removeInventoryItemById(
            playerId,
            record.id,
            client
          );
          if (!removed) {
            throw new InventorySellError('Item not found', 'ITEM_NOT_FOUND', 404);
          }

          totalPayout += price.totalPrice;
          soldItems.push({
            itemType: record.itemType,
            itemName: record.itemName,
            quantity: 1,
            payout: price.totalPrice,
            inventoryItemId: record.id,
            rarity: price.rarity,
            quality: record.quality ?? null,
          });
        }

        const fungibleRequests = requests.filter(
          (request) => request.kind === 'fungible'
        ) as Array<SellRequest & { kind: 'fungible' }>;

        for (const request of fungibleRequests) {
          if (!isSellableEquipmentType(request.itemType)) {
            throw new InventorySellError(
              'Item is not sellable',
              'ITEM_NOT_SELLABLE'
            );
          }

          if (request.itemType.toLowerCase() === 'wearable') {
            throw new InventorySellError(
              'Wearables must be sold by inventory item id',
              'WEARABLE_ID_REQUIRED'
            );
          }

          if (isExplicitlyDeniedSellItem(request.itemType, request.itemName)) {
            throw new InventorySellError(
              'Item cannot be sold',
              'ITEM_NOT_SELLABLE'
            );
          }

          const decremented = await inventoryRepo.decrementInventoryItemWithRecord(
            playerId,
            request.itemType,
            request.itemName,
            request.quantity,
            client
          );

          if (!decremented) {
            throw new InventorySellError(
              'Item not found',
              'ITEM_NOT_FOUND',
              404
            );
          }

          const price = resolveSellPriceForRecord(
            {
              itemType: decremented.record.itemType,
              itemName: decremented.record.itemName,
              wearableSlug: decremented.record.wearableSlug,
              quality: decremented.record.quality,
              itemData: decremented.record.itemData,
            },
            request.quantity
          );

          if (!price) {
            throw new InventorySellError(
              'Item cannot be priced',
              'ITEM_NOT_SELLABLE'
            );
          }

          totalPayout += price.totalPrice;
          soldItems.push({
            itemType: decremented.record.itemType,
            itemName: decremented.record.itemName,
            quantity: request.quantity,
            payout: price.totalPrice,
            rarity: price.rarity,
            quality: decremented.record.quality ?? null,
          });
        }

        if (totalPayout <= 0) {
          throw new InventorySellError('Nothing to sell', 'NO_SELLABLE_ITEMS');
        }

        const remaining = Math.max(0, EQUIPMENT_SELL_DAILY_CAP - counter.amount);
        if (totalPayout > remaining) {
          throw new InventorySellError(
            'Sold out for today',
            'GLOBAL_SELL_CAP_REACHED',
            400,
            {
              dailyCap: EQUIPMENT_SELL_DAILY_CAP,
              soldToday: counter.amount,
              remainingToday: remaining,
              resetsAtUtc: getNextResetUtcIso(),
            }
          );
        }

        const updatedCounter = await globalEconomyCountersRepo.incrementCounter(
          GLOBAL_COUNTER_NAME,
          bucketDate,
          totalPayout,
          client
        );

        if (!updatedCounter) {
          throw new InventorySellError(
            'Failed to update sell counter',
            'COUNTER_UPDATE_FAILED',
            500
          );
        }

        const goldRecord = await inventoryRepo.upsertInventoryItem({
          playerId,
          itemType: 'coin',
          itemName: 'Gold',
          quantity: totalPayout,
          client,
        });

        await economyRepo
          .logTransaction({
            playerId,
            currency: 'Gold',
            amount: totalPayout,
            source: 'inventory_sell',
            metadata: {
              items: soldItems.map((item) => ({
                itemType: item.itemType,
                itemName: item.itemName,
                quantity: item.quantity,
                payout: item.payout,
                rarity: item.rarity,
                quality: item.quality ?? null,
              })),
            },
            client,
          })
          .catch((error) => logError(error));

        const soldToday = updatedCounter.amount;
        const remainingToday = Math.max(0, EQUIPMENT_SELL_DAILY_CAP - soldToday);

        return {
          success: true,
          payout: totalPayout,
          currency: 'Gold',
          soldItems,
          newBalance: goldRecord.quantity,
          dailyCap: EQUIPMENT_SELL_DAILY_CAP,
          soldToday,
          remainingToday,
          resetsAtUtc: getNextResetUtcIso(),
        };
      });

      return res.json(result);
    } catch (error) {
      if (error instanceof InventorySellError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
          detail: error.detail ?? null,
        });
      }
      logError(error, req);
      return res.status(500).json({ error: 'Failed to sell inventory' });
    }
  });
}
