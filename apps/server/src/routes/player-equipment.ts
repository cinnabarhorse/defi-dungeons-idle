import type { Application, Request, Response } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { playersRepo } from '../lib/db';
import {
  batchEquipWearables,
  batchUnequipWearables,
  EquipmentError,
  equipWearable,
  getEquippedInventoryItemIds,
  getPlayerEquipmentState,
  type EquipmentState,
  unequipWearable,
} from '../lib/equipment-service';
import { logError } from '../lib/http-logging';
import { verifyGotchiOwnershipForTodaySnapshot } from '../lib/gotchi-ownership-snapshot';
import {
  setGotchiWearables,
  setGotchiWearableAssignments,
} from '../data/characters';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeEquipmentResponse(
  playerId: string,
  state: EquipmentState,
  equippedInventoryItemIds: string[]
) {
  return {
    playerId,
    characterId: state.characterId,
    equipment: state.equipment,
    overrides: state.overrides,
    equippedInventoryItemIds,
    equippedWearables: state.equippedWearables,
    equippedWearablesWithQuality: state.equippedWearablesWithQuality,
    derivedStats: state.derivedStats,
    version: state.version,
  };
}

function handleEquipmentErrorResponse(
  error: unknown,
  req: Request,
  res: Response,
  fallbackMessage: string
) {
  if (error instanceof EquipmentError) {
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
    });
  }
  logError(error, req);
  return res.status(500).json({ error: fallbackMessage });
}

function isGotchiCharacterId(value: string): boolean {
  return /^gotchi:\d{1,32}$/i.test(value);
}

async function hydrateGotchiWearablesForCharacter(
  address: string,
  characterId: string
) {
  if (!isGotchiCharacterId(characterId)) return;
  const gotchiIdPart = characterId.split(':')[1] || '';
  if (!gotchiIdPart) return;
  try {
    const { owned, slugs, assignments } =
      await verifyGotchiOwnershipForTodaySnapshot(
        address,
        gotchiIdPart
      );
    if (owned) {
      setGotchiWearables(gotchiIdPart, slugs || []);
      if (assignments?.length) {
        setGotchiWearableAssignments(gotchiIdPart, assignments);
      }
    }
  } catch {
    // Best-effort hydration; ignore failures and allow equipment flow to continue.
  }
}

export function registerPlayerEquipmentRoutes(app: Application) {
  app.get('/api/player/equipment', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }

    try {
      try {
        const player = await playersRepo.getPlayerById(resolved.playerId);
        const selected =
          typeof player?.selectedCharacterId === 'string'
            ? player.selectedCharacterId.trim()
            : '';
        if (selected && isGotchiCharacterId(selected)) {
          await hydrateGotchiWearablesForCharacter(resolved.address, selected);
        }
      } catch {
        // ignore hydration failures; equipment still returns overrides
      }

      const [state, equippedInventoryItemIds] = await Promise.all([
        getPlayerEquipmentState(resolved.playerId),
        getEquippedInventoryItemIds(resolved.playerId).then((ids) =>
          Array.from(ids)
        ),
      ]);

      res.json(
        serializeEquipmentResponse(
          resolved.playerId,
          state,
          equippedInventoryItemIds
        )
      );
    } catch (error) {
      handleEquipmentErrorResponse(error, req, res, 'Failed to load equipment');
    }
  });

  app.post('/api/player/equipment', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }

    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    const body = req.body as Record<string, unknown>;

    try {
      let state: EquipmentState;
      if (Array.isArray(body.assignments)) {
        state = await batchEquipWearables({
          playerId: resolved.playerId,
          assignments: body.assignments as Array<{ slot: string; slug: string }>,
        });
      } else {
        if (typeof body.slot !== 'string' || typeof body.slug !== 'string') {
          return res.status(400).json({
            error: 'Invalid request payload',
            details: ['slot and slug are required'],
          });
        }
        state = await equipWearable({
          playerId: resolved.playerId,
          slot: body.slot,
          slug: body.slug,
        });
      }
      const equippedInventoryItemIds = await getEquippedInventoryItemIds(
        resolved.playerId
      ).then((ids) => Array.from(ids));
      res.json(
        serializeEquipmentResponse(
          resolved.playerId,
          state,
          equippedInventoryItemIds
        )
      );
    } catch (error) {
      handleEquipmentErrorResponse(error, req, res, 'Failed to equip wearable');
    }
  });

  app.delete('/api/player/equipment', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }

    const slotParam = Array.isArray(req.query.slot)
      ? req.query.slot[0]
      : req.query.slot;

    const body = isPlainObject(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

    try {
      let state: EquipmentState;
      if (Array.isArray(body.slots)) {
        state = await batchUnequipWearables({
          playerId: resolved.playerId,
          slots: body.slots as string[],
        });
      } else {
        if (typeof slotParam !== 'string' || slotParam.trim().length === 0) {
          return res.status(400).json({
            error: 'Invalid request payload',
            details: ['slot query parameter is required'],
          });
        }

        state = await unequipWearable({
          playerId: resolved.playerId,
          slot: slotParam,
        });
      }
      const equippedInventoryItemIds = await getEquippedInventoryItemIds(
        resolved.playerId
      ).then((ids) => Array.from(ids));
      res.json(
        serializeEquipmentResponse(
          resolved.playerId,
          state,
          equippedInventoryItemIds
        )
      );
    } catch (error) {
      handleEquipmentErrorResponse(error, req, res, 'Failed to unequip wearable');
    }
  });
}
