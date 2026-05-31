import type { Application, Request, Response } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';
import { runTransaction } from '../lib/db/client';
import {
  economyRepo,
  equipmentRepo,
  inventoryEventsRepo,
  inventoryRepo,
  playersRepo,
  type PlayerInventoryRow,
} from '../lib/db';
import {
  ensurePlayerCanModifyEquipment,
  EquipmentError,
} from '../lib/equipment-service';
import { verifyGotchiOwnershipForTodaySnapshot } from '../lib/gotchi-ownership-snapshot';
import { getWearableBySlug, getWearableRarity } from '../data/wearables';
import { normalizeQualityTier } from '../data/wearable-quality';
import { GAME_CONFIG } from '../data/game-config';

type ForgeRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'mythical'
  | 'godlike';

const LICK_TONGUE_ITEM_TYPE = 'material';
const LICK_TONGUE_ITEM_NAME = 'Lick Tongue';

type ForgeSourceQuality = 'broken' | 'budget' | 'average' | 'excellent' | 'flawless';

class ForgeRouteError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isGotchiCharacterId(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^gotchi:\d{1,32}$/i.test(value.trim());
}

function getForgeRarityConfig(slug: string) {
  const wearable = getWearableBySlug(slug);
  if (!wearable) {
    throw new ForgeRouteError('Wearable not recognized', 'INVALID_WEARABLE');
  }
  const rarity = getWearableRarity(wearable) as ForgeRarity;
  const successChancePct =
    GAME_CONFIG.wearableForge?.successChancePctByRarity?.[rarity];
  const goldCost = GAME_CONFIG.wearableForge?.goldCostByRarity?.[rarity];
  const lickTongueCostWhenInputMissing = Math.max(
    1,
    Math.floor(GAME_CONFIG.wearableForge?.lickTongueCostByRarity?.[rarity] ?? 1)
  );
  if (!Number.isFinite(successChancePct) || !Number.isFinite(goldCost)) {
    throw new ForgeRouteError(
      'Forge configuration is missing for wearable rarity',
      'FORGE_CONFIG_MISSING',
      500
    );
  }
  return {
    rarity,
    successChancePct: Math.max(0, Math.min(100, Math.floor(successChancePct))),
    goldCost: Math.max(1, Math.floor(goldCost)),
    lickTongueCostWhenInputMissing,
  };
}

function getForgeSourceQualityMultiplier(quality: ForgeSourceQuality): number {
  const value =
    GAME_CONFIG.wearableForge?.successChanceMultiplierBySourceQuality?.[quality];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return quality === 'excellent' ? 1 : 0.5;
}

function getForgeSourcePriority(quality: ForgeSourceQuality): number {
  switch (quality) {
    case 'excellent':
      return 5;
    case 'flawless':
      return 4;
    case 'average':
      return 3;
    case 'budget':
      return 2;
    case 'broken':
    default:
      return 1;
  }
}

function compareForgeSourceRecords(
  a: {
    quality: string | null | undefined;
    durabilityScore: number | null | undefined;
    createdAt?: string | null;
    id: string;
  },
  b: {
    quality: string | null | undefined;
    durabilityScore: number | null | undefined;
    createdAt?: string | null;
    id: string;
  }
): number {
  const qualityA = normalizeQualityTier(a.quality) as ForgeSourceQuality;
  const qualityB = normalizeQualityTier(b.quality) as ForgeSourceQuality;
  const priorityA = getForgeSourcePriority(qualityA);
  const priorityB = getForgeSourcePriority(qualityB);
  if (priorityA !== priorityB) {
    return priorityB - priorityA;
  }
  const durabilityA = Number(a.durabilityScore) || 0;
  const durabilityB = Number(b.durabilityScore) || 0;
  if (durabilityA !== durabilityB) {
    return durabilityB - durabilityA;
  }
  const createdA = Date.parse(a.createdAt ?? '');
  const createdB = Date.parse(b.createdAt ?? '');
  if (Number.isFinite(createdA) && Number.isFinite(createdB)) {
    return createdA - createdB;
  }
  return String(a.id).localeCompare(String(b.id));
}

function getForgeSuccessChancePct(input: {
  baseSuccessChancePct: number;
  sourceQuality: ForgeSourceQuality;
}) {
  return Math.max(
    1,
    Math.min(
      100,
      Math.round(
        input.baseSuccessChancePct *
          getForgeSourceQualityMultiplier(input.sourceQuality)
      )
    )
  );
}

async function getLickTongueRowsForUpdate(
  playerId: string,
  client: { query: (...args: any[]) => Promise<{ rows: PlayerInventoryRow[] }> }
): Promise<PlayerInventoryRow[]> {
  const result = await client.query(
    `select *
       from player_inventories
      where player_id = $1
        and (
          (item_type = $2 and item_name = $3)
          or lower(item_name) like $4
          or lower(item_name) like $5
        )
      order by case
        when item_type = $2 and item_name = $3 then 0
        else 1
      end,
      lower(item_name) asc`,
    [
      playerId,
      LICK_TONGUE_ITEM_TYPE,
      LICK_TONGUE_ITEM_NAME,
      '%lick tongue%',
      '%lick_tongue%',
    ]
  );
  return result.rows;
}

export function registerPlayerInventoryForgeRoutes(app: Application) {
  app.post('/api/player/inventory/forge', async (req: Request, res: Response) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }
    const playerId = resolved.playerId;
    const walletAddress = resolved.address;

    const wearableSlug =
      typeof req.body?.wearableSlug === 'string'
        ? req.body.wearableSlug.trim()
        : '';
    if (!wearableSlug) {
      return res.status(400).json({ error: 'wearableSlug is required' });
    }

    try {
      await ensurePlayerCanModifyEquipment(resolved.playerId);

      const player = await playersRepo.getPlayerById(playerId);
      const selectedCharacterId =
        typeof player?.selectedCharacterId === 'string'
          ? player.selectedCharacterId.trim()
          : '';
      if (!isGotchiCharacterId(selectedCharacterId)) {
        throw new ForgeRouteError(
          'Forge requires a selected Aavegotchi',
          'GOTCHI_REQUIRED'
        );
      }

      const gotchiId = selectedCharacterId.split(':')[1] || '';
      const snapshot = await verifyGotchiOwnershipForTodaySnapshot(
        walletAddress,
        gotchiId
      );

      if (snapshot.snapshotMissing) {
        throw new ForgeRouteError(
          'Daily gotchi ownership snapshot missing',
          'SNAPSHOT_UNAVAILABLE',
          503
        );
      }
      if (!snapshot.owned) {
        throw new ForgeRouteError(
          'Selected gotchi is not owned by the current wallet',
          'GOTCHI_NOT_OWNED',
          403
        );
      }
      if (!snapshot.slugs.includes(wearableSlug)) {
        throw new ForgeRouteError(
          'Selected gotchi must have the matching NFT wearable equipped',
          'NFT_WEARABLE_REQUIRED'
        );
      }

      const forgeConfig = getForgeRarityConfig(wearableSlug);
      const outputQuality = normalizeQualityTier(
        GAME_CONFIG.wearableForge?.outputQuality
      );
      const outputDurability = Math.max(
        1,
        Math.floor(GAME_CONFIG.wearableForge?.outputDurability ?? 1000)
      );

      const result = await runTransaction(async (client) => {
        const equippedSummary = await equipmentRepo.getEquippedSummary(
          playerId,
          client
        );
        const copies = await inventoryRepo.getWearableInventoryBySlug(
          playerId,
          wearableSlug,
          client
        );

        const ownedCopies = copies
          .filter(
            (record) =>
              record.playerId === playerId &&
              !equippedSummary.idSet.has(record.id)
          )
          .sort(compareForgeSourceRecords);
        const forgeableCopies = ownedCopies.filter(
          (record) => normalizeQualityTier(record.quality) !== 'flawless'
        );
        const sourceCopy = forgeableCopies[0] ?? null;
        let usedLickTongueBypass = false;
        let lickTonguesSpent = 0;
        let lickTongueBalance: number | null = null;
        if (!sourceCopy) {
          if (ownedCopies.length > 0) {
            throw new ForgeRouteError(
              'This wearable is already flawless',
              'ALREADY_FLAWLESS'
            );
          }
          throw new ForgeRouteError(
            'An unequipped copy of this wearable is required',
            'FORGE_SOURCE_REQUIRED'
          );
        }
        const sourceQuality = normalizeQualityTier(
          sourceCopy.quality
        ) as ForgeSourceQuality;
        const successChancePct = getForgeSuccessChancePct({
          baseSuccessChancePct: forgeConfig.successChancePct,
          sourceQuality,
        });

        let lickTongueRows = await getLickTongueRowsForUpdate(playerId, client);
        let totalAvailableLickTongues = lickTongueRows.reduce((sum, row) => {
          const quantity = Number(row.quantity) || 0;
          return sum + (quantity > 0 ? quantity : 0);
        }, 0);
        const recordedLickTongueCount = Math.max(
          0,
          Number(player?.lickTongueCount) || 0
        );

        if (recordedLickTongueCount > totalAvailableLickTongues) {
          const deficit = recordedLickTongueCount - totalAvailableLickTongues;
          if (deficit > 0) {
            await inventoryRepo.upsertInventoryItem({
              playerId,
              itemType: LICK_TONGUE_ITEM_TYPE,
              itemName: LICK_TONGUE_ITEM_NAME,
              quantity: deficit,
              client,
            });

            lickTongueRows = await getLickTongueRowsForUpdate(playerId, client);
            totalAvailableLickTongues = lickTongueRows.reduce((sum, row) => {
              const quantity = Number(row.quantity) || 0;
              return sum + (quantity > 0 ? quantity : 0);
            }, 0);
          }
        }

        if (totalAvailableLickTongues < forgeConfig.lickTongueCostWhenInputMissing) {
          throw new ForgeRouteError(
            'Insufficient Lick Tongues',
            'INSUFFICIENT_LICK_TONGUES'
          );
        }

        let remainingLickTongues = forgeConfig.lickTongueCostWhenInputMissing;
        for (const row of lickTongueRows) {
          if (remainingLickTongues <= 0) {
            break;
          }
          const available = Number(row.quantity) || 0;
          if (available <= 0) {
            continue;
          }
          const spend = Math.min(available, remainingLickTongues);
          const decremented = await inventoryRepo.decrementInventoryItem(
            playerId,
            row.item_type,
            row.item_name,
            spend,
            client
          );
          if (!decremented) {
            throw new ForgeRouteError(
              'Failed to spend required Lick Tongues',
              'LICK_TONGUE_DECREMENT_FAILED',
              500
            );
          }
          remainingLickTongues -= spend;
        }

        if (remainingLickTongues > 0) {
          throw new ForgeRouteError(
            'Failed to spend required Lick Tongues',
            'LICK_TONGUE_DECREMENT_FAILED',
            500
          );
        }

        lickTonguesSpent = forgeConfig.lickTongueCostWhenInputMissing;
        lickTongueBalance = Math.max(
          0,
          totalAvailableLickTongues - lickTonguesSpent
        );
        usedLickTongueBypass = true;

        await client.query(
          `update players
              set lick_tongue_count = $2,
                  updated_at = now()
            where id = $1`,
          [playerId, lickTongueBalance]
        );

        await inventoryEventsRepo.logInventoryEvent(
          {
            playerId,
            itemType: LICK_TONGUE_ITEM_TYPE,
            itemName: LICK_TONGUE_ITEM_NAME,
            delta: -lickTonguesSpent,
            reason: 'wearable_forge_bypass',
            metadata: {
              selectedCharacterId,
              wearableSlug,
              lickTonguesSpent,
              sourceQuality,
            },
          },
          client
        );

        let goldResult;
        try {
          goldResult = await inventoryRepo.decrementInventoryItem(
            playerId,
            'coin',
            'Gold',
            forgeConfig.goldCost,
            client
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'Insufficient quantity to decrement inventory item'
          ) {
            throw new ForgeRouteError(
              'Insufficient Gold',
              'INSUFFICIENT_GOLD'
            );
          }
          throw error;
        }

        if (!goldResult) {
          throw new ForgeRouteError('Insufficient Gold', 'INSUFFICIENT_GOLD');
        }

        if (sourceCopy) {
          const removed = await inventoryRepo.removeInventoryItemById(
            playerId,
            sourceCopy.id,
            client
          );
          if (!removed) {
            throw new ForgeRouteError(
              'Wearable not found',
              'ITEM_NOT_FOUND',
              404
            );
          }

          await inventoryEventsRepo.logInventoryEvent(
            {
              playerId,
              itemType: 'wearable',
              itemName: wearableSlug,
              delta: -1,
              reason: 'wearable_forge_consume',
              metadata: {
                selectedCharacterId,
                inputQuality: sourceQuality,
                wearableSlug,
              },
              inventoryItemId: sourceCopy.id,
            },
            client
          );
        }

        const success = Math.random() < successChancePct / 100;

        let grantedItem: {
          inventoryItemId: string;
          wearableSlug: string;
          quality: string;
          durabilityScore: number;
        } | null = null;

        if (success) {
          const created = await inventoryRepo.createInventoryInstance({
            playerId,
            wearableSlug,
            quality: outputQuality,
            durabilityScore: outputDurability,
            itemData: {
              source: 'wearable_forge',
            },
            client,
          });

          await inventoryEventsRepo.logInventoryEvent(
            {
              playerId,
              itemType: 'wearable',
              itemName: wearableSlug,
              delta: 1,
              reason: 'wearable_forge_success',
              metadata: {
                selectedCharacterId,
                outputQuality,
                wearableSlug,
              },
              inventoryItemId: created.id,
            },
            client
          );

          grantedItem = {
            inventoryItemId: created.id,
            wearableSlug: created.wearableSlug ?? wearableSlug,
            quality: created.quality ?? outputQuality,
            durabilityScore: created.durabilityScore ?? outputDurability,
          };
        }

        await economyRepo.logTransaction({
          playerId,
          currency: 'Gold',
          amount: forgeConfig.goldCost,
          source: 'wearable_forge',
          metadata: {
            selectedCharacterId,
            wearableSlug,
            rarity: forgeConfig.rarity,
            successChancePct,
            outcome: success ? 'success' : 'failure',
            consumedInventoryItemId: sourceCopy?.id ?? null,
            usedLickTongueBypass,
            lickTonguesSpent,
            sourceQuality,
          },
          client,
        });

        return {
          outcome: success ? 'success' : 'failure',
          wearableSlug,
          goldSpent: forgeConfig.goldCost,
          goldBalance: goldResult.quantityAfter,
          sourceQuality,
          successChancePct,
          lickTonguesSpent,
          lickTongueBalance,
          usedLickTongueBypass,
          consumedInventoryItemId: sourceCopy?.id ?? null,
          grantedItem,
        };
      });

      return res.json(result);
    } catch (error) {
      if (error instanceof EquipmentError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof ForgeRouteError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
        });
      }
      logError(error, req);
      return res.status(500).json({ error: 'Failed to forge wearable' });
    }
  });
}
