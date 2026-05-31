import type { Client } from 'colyseus';
import type { GameRoom } from './GameRoom';
import {
  executeInventoryRemoval,
  InventoryRemovalError,
  type InventoryRemoveRequest,
  type AppliedInventoryRemoval,
} from '../lib/inventory-removal';
import {
  sanitizeInventoryItems as sanitizeInventoryPayloads,
  getLickTongueCount,
  getHealthPotionCount,
  getManaPotionCount,
  type InventoryItemPayload,
} from '../lib/db';
import { ProgressionProfile, sanitizeProfile, toSerializableProfile } from '@gotchiverse/progression';

export function buildInventoryRemovalRequests(
  payload: Record<string, unknown> | null | undefined
): InventoryRemoveRequest[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (
    typeof payload.inventoryItemId === 'string' &&
    payload.inventoryItemId.trim().length > 0
  ) {
    return [{ inventoryItemId: payload.inventoryItemId.trim() }];
  }

  const itemType =
    typeof payload.itemType === 'string' ? payload.itemType.trim() : '';
  const itemName =
    typeof payload.itemName === 'string' ? payload.itemName.trim() : '';
  if (itemType && itemName) {
    const quantityRaw = Number((payload as any).quantity);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0
        ? Math.floor(quantityRaw)
        : 1;
    return [
      {
        itemType,
        itemName,
        quantity,
      },
    ];
  }

  return [];
}

export function applyRemovedItemsToSessionInventory(
  room: GameRoom,
  sessionId: string,
  removals: AppliedInventoryRemoval[]
): InventoryItemPayload[] {
  if (!removals.length) {
    // @ts-ignore - access private property
    return room.playerInventories.get(sessionId) ?? [];
  }

  // @ts-ignore - access private property
  const previous = room.playerInventories.get(sessionId) ?? [];
  const working = previous.map((item) => ({ ...item }));
  const toLower = (value: unknown) =>
    typeof value === 'string' ? value.toLowerCase() : '';

  for (const removal of removals) {
    if (removal.type === 'fungible') {
      const targetType = removal.itemType.toLowerCase();
      const targetName = removal.itemName.toLowerCase();
      const index = working.findIndex((entry) => {
        const entryType = toLower(entry.type ?? (entry as any).itemType);
        const entryName = toLower(entry.name ?? (entry as any).itemName);
        return entryType === targetType && entryName === targetName;
      });
      if (index < 0) {
        console.warn('Fungible removal not found in cached inventory', {
          sessionId,
          removal,
        });
        continue;
      }
      const currentQuantity = Number(working[index].quantity) || 0;
      const nextQuantity = Math.max(0, currentQuantity - removal.quantity);
      if (nextQuantity <= 0) {
        working.splice(index, 1);
      } else {
        working[index] = {
          ...working[index],
          quantity: nextQuantity,
        };
      }
    } else {
      const index = working.findIndex((entry) => {
        const candidateId =
          (typeof entry.inventoryItemId === 'string' && entry.inventoryItemId) ||
          (typeof entry.id === 'string' && entry.id) ||
          (typeof entry.instanceId === 'string' && entry.instanceId) ||
          null;
        return candidateId === removal.inventoryItemId;
      });
      if (index < 0) {
        console.warn('Wearable removal not found in cached inventory', {
          sessionId,
          removal,
        });
        continue;
      }
      working.splice(index, 1);
    }
  }

  const sanitized = sanitizeInventoryPayloads(working);
  // @ts-ignore - access private property
  room.playerInventories.set(sessionId, sanitized);
  return sanitized;
}

export async function handleDestroyItem(
  room: GameRoom,
  client: Client,
  payload: Record<string, unknown>
) {
  const sessionId = client.sessionId;
  const playerId = room.getPlayerIdForSession(sessionId);
  if (!playerId) {
    room.msg.sendTo(client, 'inventory_remove_error', {
      code: 'UNAUTHORIZED',
      message: 'Player not linked to session',
    });
    return;
  }

  const requests = buildInventoryRemovalRequests(payload);
  if (requests.length === 0) {
    room.msg.sendTo(client, 'inventory_remove_error', {
      code: 'INVENTORY_INVALID_REQUEST',
      message: 'Invalid destroy request',
    });
    return;
  }

  let removals: AppliedInventoryRemoval[];
  try {
    removals = await executeInventoryRemoval(playerId, requests, {
      reason: 'destroy_user',
      metadata: {
        source: 'game_room',
        sessionId,
        roomId: room.state.id,
      },
    });
  } catch (error) {
    if (error instanceof InventoryRemovalError) {
      room.msg.sendTo(client, 'inventory_remove_error', {
        code: error.code,
        message: error.message,
        detail: error.detail ?? null,
      });
      return;
    }
    console.error('Failed to destroy inventory item', {
      sessionId,
      playerId,
      payload,
      error,
    });
    room.msg.sendTo(client, 'inventory_remove_error', {
      code: 'UNKNOWN',
      message: 'Failed to destroy item',
    });
    return;
  }

  const updatedInventory = applyRemovedItemsToSessionInventory(
    room,
    sessionId,
    removals
  );

  const player = room.state.players.get(sessionId);
  if (player) {
    player.lickTongueCount = getLickTongueCount(updatedInventory);
    player.healthPotionCount = getHealthPotionCount(updatedInventory);
    player.manaPotionCount = getManaPotionCount(updatedInventory);
  }

  room.msg.sendTo(client, 'inventory_removed', {
    removed: removals as Array<Record<string, unknown>>,
    inventory: updatedInventory,
    action: 'destroy',
  });
}

export async function handleDropItem(
  room: GameRoom,
  client: Client,
  _payload: Record<string, unknown>
) {
  room.msg.sendTo(client, 'inventory_remove_error', {
    code: 'NOT_IMPLEMENTED',
    message: 'Drop action not yet implemented',
  });
}

export async function handleProgressionSync(
  room: GameRoom,
  client: Client,
  data: { profile?: unknown }
) {
  const sanitized = sanitizeProfile(
    (data?.profile as ProgressionProfile) || undefined
  );
  sanitized.lastSyncedAt = Date.now();
  // @ts-ignore - access private method
  room.setProgressionProfile(client.sessionId, sanitized, { persist: false });
  // @ts-ignore - access private method
  room.recordLevelSnapshot(client.sessionId, sanitized.level);
  // @ts-ignore - access private method
  room.applyProgressionToPlayer(client.sessionId, { fullHeal: true });
  // @ts-ignore - access private method
  await room.persistProgression(client.sessionId, sanitized);

  room.msg.sendTo(client, 'progression:profile', {
    profile: toSerializableProfile(sanitized),
    source: 'server_ack',
  });
}



