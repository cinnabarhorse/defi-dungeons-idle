import type { Application } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import {
  getPgPool,
  inventoryEventsRepo,
  inventoryRecordToItem,
  inventoryRepo,
  playersRepo,
  runTransaction,
  sanitizeInventoryItems as sanitizeInventoryPayloads,
} from '../lib/db';
import { getLickTongueCount } from '../lib/db/mappers';

const GOLD_ITEM_TYPE = 'coin';
const GOLD_ITEM_NAME = 'Gold';
const LICK_TONGUE_ITEM_TYPE = 'material';
const LICK_TONGUE_ITEM_NAME = 'Lick Tongue';
const MAX_GOLD_CREDIT = 100000;
const MAX_LICK_TONGUE_CREDIT = 1000;

function normalizeAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function getGoldCount(inventory: Awaited<ReturnType<typeof inventoryRepo.getInventory>>) {
  return inventory.reduce((total, item) => {
    const type = String(item.itemType ?? '').toLowerCase();
    const name = String(item.itemName ?? '').toLowerCase();
    if (type !== GOLD_ITEM_TYPE || name !== GOLD_ITEM_NAME.toLowerCase()) {
      return total;
    }
    return total + (Number(item.quantity) || 0);
  }, 0);
}

async function recomputeLickTongueCount(playerId: string) {
  const inventory = await inventoryRepo.getInventory(playerId);
  const items = sanitizeInventoryPayloads(
    inventory.map((record) => inventoryRecordToItem(record))
  );
  const lickTongueCount = getLickTongueCount(items);
  try {
    await getPgPool().query(
      `update players set lick_tongue_count = $2, updated_at = now() where id = $1`,
      [playerId, lickTongueCount]
    );
  } catch {
    // Non-fatal; inventory remains source of truth.
  }
  return { inventory, lickTongueCount };
}

export function registerAdminCurrencyRoutes(app: Application) {
  // Get player's current Gold and Lick Tongue counts
  app.get('/api/admin/players/:id/currency', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) return;

    const playerId = req.params.id;
    if (
      !playerId ||
      typeof playerId !== 'string' ||
      playerId.trim().length === 0
    ) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    try {
      const player = await playersRepo.getPlayerById(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const { inventory, lickTongueCount } =
        await recomputeLickTongueCount(playerId);
      const gold = getGoldCount(inventory);

      res.json({
        playerId,
        playerUsername: player.username,
        playerWalletAddress: player.walletAddress,
        gold,
        lickTongues: lickTongueCount,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load player currency' });
    }
  });

  // Credit Gold and/or Lick Tongues to a player
  app.post('/api/admin/players/:id/currency/credit', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) return;

    const playerId = req.params.id;
    if (
      !playerId ||
      typeof playerId !== 'string' ||
      playerId.trim().length === 0
    ) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const gold = normalizeAmount(body.gold);
    const lickTongues = normalizeAmount(body.lickTongues);

    if (gold === 0 && lickTongues === 0) {
      return res
        .status(400)
        .json({ error: 'At least one currency must be credited' });
    }

    if (gold > MAX_GOLD_CREDIT || lickTongues > MAX_LICK_TONGUE_CREDIT) {
      return res.status(400).json({
        error: `Cannot credit more than ${MAX_GOLD_CREDIT} Gold or ${MAX_LICK_TONGUE_CREDIT} Lick Tongues at once`,
      });
    }

    try {
      const player = await playersRepo.getPlayerById(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      await runTransaction(async (client) => {
        if (gold > 0) {
          await inventoryRepo.upsertInventoryItem({
            playerId,
            itemType: GOLD_ITEM_TYPE,
            itemName: GOLD_ITEM_NAME,
            quantity: gold,
            itemData: {},
            client,
          });
          await inventoryEventsRepo.logInventoryEvent(
            {
              playerId,
              itemType: GOLD_ITEM_TYPE,
              itemName: GOLD_ITEM_NAME,
              delta: gold,
              reason: 'admin_credit',
              metadata: {
                source: 'admin_currency_tool',
                adminWallet: session.address,
              },
            },
            client
          );
        }

        if (lickTongues > 0) {
          await inventoryRepo.upsertInventoryItem({
            playerId,
            itemType: LICK_TONGUE_ITEM_TYPE,
            itemName: LICK_TONGUE_ITEM_NAME,
            quantity: lickTongues,
            itemData: {},
            client,
          });
          await inventoryEventsRepo.logInventoryEvent(
            {
              playerId,
              itemType: LICK_TONGUE_ITEM_TYPE,
              itemName: LICK_TONGUE_ITEM_NAME,
              delta: lickTongues,
              reason: 'admin_credit',
              metadata: {
                source: 'admin_currency_tool',
                adminWallet: session.address,
              },
            },
            client
          );
        }
      });

      const { inventory, lickTongueCount } =
        await recomputeLickTongueCount(playerId);
      const goldTotal = getGoldCount(inventory);

      res.json({
        success: true,
        playerId,
        credited: {
          gold,
          lickTongues,
        },
        totals: {
          gold: goldTotal,
          lickTongues: lickTongueCount,
        },
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to credit currency' });
    }
  });

  // Audit Gold and Lick Tongue inventory changes
  app.get('/api/admin/players/:id/currency/audit', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) return;

    const playerId = req.params.id;
    if (
      !playerId ||
      typeof playerId !== 'string' ||
      playerId.trim().length === 0
    ) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;

    try {
      const pool = getPgPool();
      const result = await pool.query(
        `
          select *
            from player_inventory_events
           where player_id = $1
             and (
               (lower(item_type) = lower($2) and lower(item_name) = lower($3))
               or (lower(item_type) = lower($4) and lower(item_name) = lower($5))
             )
           order by created_at desc
           limit $6
        `,
        [
          playerId,
          GOLD_ITEM_TYPE,
          GOLD_ITEM_NAME,
          LICK_TONGUE_ITEM_TYPE,
          LICK_TONGUE_ITEM_NAME,
          limit,
        ]
      );

      res.json({
        playerId,
        limit,
        rows: result.rows,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load currency audit logs' });
    }
  });
}
