import type { Application, Request, Response } from 'express';
import {
  getTotalXpForLevel,
  sanitizeProfile,
  toSerializableProfile,
  type ProgressionProfile,
} from '@gotchiverse/progression';
import type { PlayerInventoryRow } from '../lib/db/types';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { runTransaction } from '../lib/db/client';
import { decrementInventoryItem, upsertInventoryItem } from '../lib/db/repos/inventory';
import { logInventoryEvent } from '../lib/db/repos/inventory-events';
import { logError, logEvent } from '../lib/http-logging';
import {
  ABSOLUTE_PLAYER_LEVEL_CAP,
  REBIRTH_COST_LICK_TONGUES,
  getUnlockedMaxLevel,
  isRebirthCapReached,
  sanitizeRebirthCount,
} from '../lib/progression/rebirth';

const DEFAULT_UNLOCKED_TIERS = ['normal_1'];
const LICK_TONGUE_ITEM_TYPE = 'material';
const LICK_TONGUE_ITEM_NAME = 'Lick Tongue';

function clampProfileToMaxLevel(
  profile: ProgressionProfile,
  currentMaxLevel: number
): ProgressionProfile {
  const sanitized = sanitizeProfile(profile, currentMaxLevel);
  const maxTotalXp = getTotalXpForLevel(currentMaxLevel);
  if (sanitized.totalXp <= maxTotalXp) {
    return sanitized;
  }
  return sanitizeProfile(
    {
      ...sanitized,
      totalXp: maxTotalXp,
    },
    currentMaxLevel
  );
}

function getRebirthProgressionMeta(rebirthCountInput: unknown) {
  const rebirthCount = sanitizeRebirthCount(rebirthCountInput);
  return {
    rebirthCount,
    currentMaxLevel: getUnlockedMaxLevel(rebirthCount),
    absoluteMaxLevel: ABSOLUTE_PLAYER_LEVEL_CAP,
    rebirthCost: REBIRTH_COST_LICK_TONGUES,
  } as const;
}

// Rebirth progression: reset level/xp in exchange for Lick Tongues and +3 max levels.
export function registerPlayerProgressionRebirthRoutes(app: Application) {
  app.post(
    '/api/player/progression/rebirth',
    async (req: Request, res: Response) => {
      const resolved = await resolveAuthPrincipal(req);
      res.setHeader('X-Request-Id', (req as any).id || '');

      if (!resolved) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!resolved.playerId) {
        return res.status(403).json({ error: 'Player not linked to session' });
      }

      try {
        const playerId = resolved.playerId as string;
        const result = await runTransaction(async (client) => {
          const playerResult = await client.query<{
            level: number | null;
            total_xp: number | null;
            unspent_points: number | null;
            rebirth_count: number | null;
            unlocked_tiers: unknown;
            lick_tongue_count: number | null;
            stat_allocations: unknown;
            allocation_history: unknown;
            last_synced_at: string | null;
          }>(
            `select
               level,
               total_xp,
               unspent_points,
               rebirth_count,
               unlocked_tiers,
               lick_tongue_count,
               stat_allocations,
               allocation_history,
               last_synced_at
             from players
             where id = $1
             for update`,
            [playerId]
          );

          if (playerResult.rows.length === 0) {
            const err = new Error('Player not found');
            (err as any).code = 'PLAYER_NOT_FOUND';
            throw err;
          }

          const playerRow = playerResult.rows[0];
          const rebirthCountBefore = sanitizeRebirthCount(playerRow.rebirth_count);

          if (isRebirthCapReached(rebirthCountBefore)) {
            const err = new Error('Maximum rebirth reached');
            (err as any).code = 'REBIRTH_CAP_REACHED';
            throw err;
          }

          const currentMaxLevel = getUnlockedMaxLevel(rebirthCountBefore);
          const currentProfile = clampProfileToMaxLevel(
            sanitizeProfile(
              {
                level: Number(playerRow.level ?? 1),
                totalXp: Number(playerRow.total_xp ?? 0),
                unspentPoints: Number(playerRow.unspent_points ?? 0),
                stats:
                  playerRow.stat_allocations &&
                  typeof playerRow.stat_allocations === 'object'
                    ? (playerRow.stat_allocations as ProgressionProfile['stats'])
                    : undefined,
                allocationHistory: Array.isArray(playerRow.allocation_history)
                  ? playerRow.allocation_history
                  : undefined,
                lastSyncedAt: playerRow.last_synced_at
                  ? Date.parse(playerRow.last_synced_at)
                  : undefined,
              },
              currentMaxLevel
            ),
            currentMaxLevel
          );

          if (currentProfile.level < currentMaxLevel) {
            const err = new Error('Must be at current max level to rebirth');
            (err as any).code = 'LEVEL_TOO_LOW';
            (err as any).requiredLevel = currentMaxLevel;
            (err as any).currentLevel = currentProfile.level;
            throw err;
          }

          let inventoryResult = await client.query<PlayerInventoryRow>(
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

          let inventoryRows = inventoryResult.rows;
          let totalAvailable = inventoryRows.reduce((total, row) => {
            const quantity = Number(row.quantity) || 0;
            return total + (quantity > 0 ? quantity : 0);
          }, 0);

          const recordedCount = Number(playerRow.lick_tongue_count) || 0;
          if (recordedCount > totalAvailable) {
            const deficit = recordedCount - totalAvailable;
            if (deficit > 0) {
              await upsertInventoryItem({
                playerId,
                itemType: LICK_TONGUE_ITEM_TYPE,
                itemName: LICK_TONGUE_ITEM_NAME,
                quantity: deficit,
                client,
              });

              inventoryResult = await client.query<PlayerInventoryRow>(
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

              inventoryRows = inventoryResult.rows;
              totalAvailable = inventoryRows.reduce((total, row) => {
                const quantity = Number(row.quantity) || 0;
                return total + (quantity > 0 ? quantity : 0);
              }, 0);
            }
          }

          if (totalAvailable < REBIRTH_COST_LICK_TONGUES) {
            const err = new Error('Not enough Lick Tongues');
            (err as any).code = 'INSUFFICIENT_TONGUES';
            (err as any).required = REBIRTH_COST_LICK_TONGUES;
            (err as any).available = totalAvailable;
            throw err;
          }

          let remaining = REBIRTH_COST_LICK_TONGUES;
          for (const row of inventoryRows) {
            if (remaining <= 0) {
              break;
            }
            const available = Number(row.quantity) || 0;
            if (available <= 0) {
              continue;
            }
            const spend = Math.min(available, remaining);
            const decremented = await decrementInventoryItem(
              playerId,
              row.item_type,
              row.item_name,
              spend,
              client
            );
            if (!decremented) {
              const err = new Error('Inventory row disappeared during rebirth');
              (err as any).code = 'DECREMENT_FAILED';
              throw err;
            }
            remaining -= spend;
          }

          if (remaining > 0) {
            const err = new Error('Failed to deduct required quantity');
            (err as any).code = 'DECREMENT_FAILED';
            throw err;
          }

          const nextRebirthCount = sanitizeRebirthCount(rebirthCountBefore + 1);
          const updatedLickTongueCount = Math.max(
            0,
            totalAvailable - REBIRTH_COST_LICK_TONGUES
          );
          const lastSyncedAtIso = new Date().toISOString();

          const updateResult = await client.query<{
            unlocked_tiers: unknown;
            lick_tongue_count: number | null;
            rebirth_count: number | null;
          }>(
            `update players
                set level = 1,
                    total_xp = 0,
                    unspent_points = 0,
                    rebirth_count = $2,
                    lick_tongue_count = $3,
                    stat_allocations = $4::jsonb,
                    allocation_history = $5::jsonb,
                    last_synced_at = $6,
                    updated_at = now()
              where id = $1
              returning unlocked_tiers, lick_tongue_count, rebirth_count`,
            [
              playerId,
              nextRebirthCount,
              updatedLickTongueCount,
              JSON.stringify({
                energy: 0,
                aggression: 0,
                spookiness: 0,
                brainSize: 0,
              }),
              JSON.stringify([]),
              lastSyncedAtIso,
            ]
          );

          const updatedRow = updateResult.rows[0];
          const unlockedTiers =
            Array.isArray(updatedRow?.unlocked_tiers) &&
            updatedRow.unlocked_tiers.length > 0
              ? (updatedRow.unlocked_tiers as string[])
              : DEFAULT_UNLOCKED_TIERS;
          const persistedLickTongueCount =
            Number(updatedRow?.lick_tongue_count) || updatedLickTongueCount;

          return {
            rebirthCountBefore,
            rebirthCountAfter: Number(updatedRow?.rebirth_count) || nextRebirthCount,
            unlockedTiers,
            lickTongueCount: persistedLickTongueCount,
          };
        });

        const rebirthMeta = getRebirthProgressionMeta(result.rebirthCountAfter);
        const resetProfile = sanitizeProfile(
          {
            level: 1,
            totalXp: 0,
            unspentPoints: 0,
            stats: {
              energy: 0,
              aggression: 0,
              spookiness: 0,
              brainSize: 0,
            },
            allocationHistory: [],
          },
          rebirthMeta.currentMaxLevel
        );

        try {
          await logInventoryEvent({
            playerId,
            itemType: LICK_TONGUE_ITEM_TYPE,
            itemName: LICK_TONGUE_ITEM_NAME,
            delta: -REBIRTH_COST_LICK_TONGUES,
            reason: 'rebirth_purchase',
            metadata: {
              cost: REBIRTH_COST_LICK_TONGUES,
              rebirthCountBefore: result.rebirthCountBefore,
              rebirthCountAfter: result.rebirthCountAfter,
              currentMaxLevel: rebirthMeta.currentMaxLevel,
            },
          });
        } catch (eventError) {
          console.warn('Failed to log inventory event for rebirth', {
            playerId,
            error: eventError,
          });
        }

        logEvent(
          'player_rebirth',
          {
            rebirthCountBefore: result.rebirthCountBefore,
            rebirthCountAfter: result.rebirthCountAfter,
            currentMaxLevel: rebirthMeta.currentMaxLevel,
            lickTongueCost: REBIRTH_COST_LICK_TONGUES,
            remainingTongues: result.lickTongueCount,
          },
          req
        );

        res.json({
          profile: toSerializableProfile(resetProfile),
          unlockedTiers: result.unlockedTiers,
          lickTongueCount: result.lickTongueCount,
          rebirthCount: rebirthMeta.rebirthCount,
          currentMaxLevel: rebirthMeta.currentMaxLevel,
          absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
          rebirthCost: rebirthMeta.rebirthCost,
        });
      } catch (error) {
        if ((error as any)?.code === 'PLAYER_NOT_FOUND') {
          return res.status(404).json({ error: 'Player not found' });
        }
        if ((error as any)?.code === 'INSUFFICIENT_TONGUES') {
          return res.status(400).json({ error: 'Not enough Lick Tongues' });
        }
        if ((error as any)?.code === 'LEVEL_TOO_LOW') {
          const requiredLevel =
            Number((error as any)?.requiredLevel) || getUnlockedMaxLevel(0);
          const currentLevel = Number((error as any)?.currentLevel) || 1;
          return res.status(400).json({
            error: `Reach level ${requiredLevel} before rebirthing (current level ${currentLevel}).`,
          });
        }
        if ((error as any)?.code === 'REBIRTH_CAP_REACHED') {
          return res.status(400).json({
            error: `Rebirth is capped at level ${ABSOLUTE_PLAYER_LEVEL_CAP}.`,
          });
        }
        if ((error as any)?.code === 'DECREMENT_FAILED') {
          return res
            .status(409)
            .json({ error: 'Rebirth could not be completed, please retry' });
        }
        logError(error, req);
        res.status(500).json({ error: 'Failed to complete rebirth' });
      }
    }
  );
}
