import type { Application } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import * as inventoryRepo from '../lib/db/repos/inventory';
import { getPgPool, playersRepo } from '../lib/db';

const HEALTH_POTION_TYPE = 'potion';
const HEALTH_POTION_NAME = 'Health Potion';
const MANA_POTION_TYPE = 'potion';
const MANA_POTION_NAME = 'Mana Potion';

export function registerAdminPotionsRoutes(app: Application) {
  // Get player's current potion counts
  app.get('/api/admin/players/:id/potions', async (req, res) => {
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

      const inventory = await inventoryRepo.getInventory(playerId);

      const healthPotions = inventory
        .filter(
          (item) =>
            item.itemType === HEALTH_POTION_TYPE &&
            item.itemName === HEALTH_POTION_NAME
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      const manaPotions = inventory
        .filter(
          (item) =>
            item.itemType === MANA_POTION_TYPE &&
            item.itemName === MANA_POTION_NAME
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      res.json({
        playerId,
        playerUsername: player.username,
        playerWalletAddress: player.walletAddress,
        healthPotions,
        manaPotions,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to get player potions' });
    }
  });

  // Credit potions to a player
  app.post('/api/admin/players/:id/potions/credit', async (req, res) => {
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

    const healthPotionsRaw = body.healthPotions;
    const manaPotionsRaw = body.manaPotions;

    const healthPotions =
      typeof healthPotionsRaw === 'number' && Number.isFinite(healthPotionsRaw)
        ? Math.max(0, Math.floor(healthPotionsRaw))
        : 0;
    const manaPotions =
      typeof manaPotionsRaw === 'number' && Number.isFinite(manaPotionsRaw)
        ? Math.max(0, Math.floor(manaPotionsRaw))
        : 0;

    if (healthPotions === 0 && manaPotions === 0) {
      return res
        .status(400)
        .json({ error: 'At least one potion type must be credited' });
    }

    if (healthPotions > 1000 || manaPotions > 1000) {
      return res
        .status(400)
        .json({ error: 'Cannot credit more than 1000 potions at once' });
    }

    try {
      const player = await playersRepo.getPlayerById(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      if (healthPotions > 0) {
        await inventoryRepo.upsertInventoryItem({
          playerId,
          itemType: HEALTH_POTION_TYPE,
          itemName: HEALTH_POTION_NAME,
          quantity: healthPotions,
          itemData: {},
        });
      }

      if (manaPotions > 0) {
        await inventoryRepo.upsertInventoryItem({
          playerId,
          itemType: MANA_POTION_TYPE,
          itemName: MANA_POTION_NAME,
          quantity: manaPotions,
          itemData: {},
        });
      }

      // Get updated counts
      const inventory = await inventoryRepo.getInventory(playerId);

      const totalHealthPotions = inventory
        .filter(
          (item) =>
            item.itemType === HEALTH_POTION_TYPE &&
            item.itemName === HEALTH_POTION_NAME
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      const totalManaPotions = inventory
        .filter(
          (item) =>
            item.itemType === MANA_POTION_TYPE &&
            item.itemName === MANA_POTION_NAME
        )
        .reduce((sum, item) => sum + item.quantity, 0);

      res.json({
        success: true,
        playerId,
        credited: {
          healthPotions,
          manaPotions,
        },
        totals: {
          healthPotions: totalHealthPotions,
          manaPotions: totalManaPotions,
        },
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to credit potions' });
    }
  });

  // Audit potion inventory changes
  app.get('/api/admin/players/:id/potions/audit', async (req, res) => {
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
            from player_inventory_potion_audit
           where player_id = $1
           order by created_at desc
           limit $2
        `,
        [playerId, limit]
      );

      res.json({
        playerId,
        limit,
        rows: result.rows,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load potion audit logs' });
    }
  });
}
