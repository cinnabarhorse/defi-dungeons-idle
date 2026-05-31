import type { Application, Request, Response } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';
import { runTransaction } from '../lib/db/client';
import { inventoryRepo, inventoryEventsRepo, economyRepo } from '../lib/db';
import {
  durabilityCapForQuality,
  getRepairCostForDurability,
  normalizeQualityTier,
} from '../data/wearable-quality';
import {
  ensurePlayerCanModifyEquipment,
  EquipmentError,
  refreshAndBroadcastEquipmentState,
} from '../lib/equipment-service';

class RepairRouteError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function registerPlayerInventoryRepairRoutes(app: Application) {
  app.post('/api/player/inventory/repair', async (req: Request, res: Response) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }
    const playerId = resolved.playerId;

    const inventoryItemIds = Array.isArray(req.body?.inventoryItemIds)
      ? req.body.inventoryItemIds
          .map((value: unknown) =>
            typeof value === 'string' ? value.trim() : ''
          )
          .filter((value: string) => value.length > 0)
      : [];
    const inventoryItemId =
      typeof req.body?.inventoryItemId === 'string'
        ? req.body.inventoryItemId.trim()
        : '';
    const targetIds =
      inventoryItemIds.length > 0
        ? Array.from(new Set(inventoryItemIds))
        : inventoryItemId
          ? [inventoryItemId]
          : [];
    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'inventoryItemId is required' });
    }

    try {
      await ensurePlayerCanModifyEquipment(playerId);

      const result = await runTransaction(async (client) => {
        const inventoryMap = await inventoryRepo.getInventoryMapByIds(
          targetIds,
          client
        );
        const records = targetIds.map((id) => inventoryMap.get(id)).filter(Boolean);
        if (records.length !== targetIds.length) {
          throw new RepairRouteError('Wearable not found', 'ITEM_NOT_FOUND', 404);
        }

        const normalizedRecords = records.map((record) => {
          if (!record || record.playerId !== playerId) {
            throw new RepairRouteError('Wearable not found', 'ITEM_NOT_FOUND', 404);
          }
          if (String(record.itemType).toLowerCase() !== 'wearable') {
            throw new RepairRouteError(
              'Only wearable instances can be repaired',
              'ITEM_NOT_REPAIRABLE'
            );
          }

          const quality = normalizeQualityTier(record.quality);
          const durabilityCap = durabilityCapForQuality(quality);
          const currentDurability = Math.max(
            0,
            Math.floor(Number(record.durabilityScore) || 0)
          );
          if (currentDurability >= durabilityCap) {
            throw new RepairRouteError(
              'Wearable is already fully repaired',
              'ALREADY_REPAIRED'
            );
          }

          return {
            record,
            quality,
            durabilityCap,
            currentDurability,
            goldSpent: getRepairCostForDurability({
              quality,
              durabilityScore: currentDurability,
            }),
          };
        });

        const totalGoldSpent = normalizedRecords.reduce(
          (sum, entry) => sum + entry.goldSpent,
          0
        );

        let goldResult;
        try {
          goldResult = await inventoryRepo.decrementInventoryItem(
            playerId,
            'coin',
            'Gold',
            totalGoldSpent,
            client
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'Insufficient quantity to decrement inventory item'
          ) {
            throw new RepairRouteError(
              'Insufficient Gold',
              'INSUFFICIENT_GOLD'
            );
          }
          throw error;
        }
        if (!goldResult) {
          throw new RepairRouteError('Insufficient Gold', 'INSUFFICIENT_GOLD');
        }

        const repairedItems = [] as Array<{
          inventoryItemId: string;
          durabilityScore: number;
          goldSpent: number;
        }>;
        const repairEventItems = normalizedRecords.map((entry) => ({
          inventoryItemId: entry.record.id,
          wearableSlug: entry.record.wearableSlug,
          quality: entry.quality,
          durabilityBefore: entry.currentDurability,
          durabilityAfter: entry.durabilityCap,
          goldSpent: entry.goldSpent,
        }));

        await inventoryEventsRepo.logInventoryEvent(
          {
            playerId,
            itemType: 'coin',
            itemName: 'Gold',
            delta: -totalGoldSpent,
            reason: 'wearable_repair',
            metadata: {
              totalCost: totalGoldSpent,
              items: repairEventItems,
            },
          },
          client
        );

        for (const entry of normalizedRecords) {
          const updated = await inventoryRepo.setWearableDurabilityById(
            playerId,
            entry.record.id,
            entry.durabilityCap,
            client
          );
          if (!updated) {
            throw new RepairRouteError('Wearable not found', 'ITEM_NOT_FOUND', 404);
          }

          repairedItems.push({
            inventoryItemId: entry.record.id,
            durabilityScore: updated.durabilityScore,
            goldSpent: entry.goldSpent,
          });
        }

        await economyRepo.logTransaction({
          playerId,
          currency: 'Gold',
          amount: totalGoldSpent,
          source: 'wearable_repair',
          metadata: {
            items: repairEventItems,
          },
          client,
        });

        return {
          repairedItems,
          goldSpent: totalGoldSpent,
          goldBalance: goldResult.quantityAfter,
          inventoryItemId:
            repairedItems.length === 1 ? repairedItems[0].inventoryItemId : null,
          durabilityScore:
            repairedItems.length === 1 ? repairedItems[0].durabilityScore : null,
        };
      });

      await refreshAndBroadcastEquipmentState(playerId).catch((error) => {
        logError(error, req);
      });

      return res.json(result);
    } catch (error) {
      if (error instanceof EquipmentError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof RepairRouteError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
        });
      }
      logError(error, req);
      return res.status(500).json({ error: 'Failed to repair wearable' });
    }
  });
}
