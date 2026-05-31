import type { Room } from 'colyseus';
import { GameRoomState } from '../../schemas';
import type { GameRoomApi } from '../../types/game-room-api';

/** Fixed pickup radius (px); vacuum radius stat removed. */
const PICKUP_RADIUS = 100;

export async function updateVacuumSystem(
  room: Room<GameRoomState>,
  now: number
) {
  for (const [playerId, player] of room.state.players) {
    const pickupRadius = PICKUP_RADIUS;

    const itemsToPickup: string[] = [];
    let checkedCount = 0;

    for (const [itemId, entity] of room.state.entities) {
      if (entity.kind !== 'collectible') continue;
      checkedCount++;

      const manhattanDistance =
        Math.abs(entity.x - player.x) + Math.abs(entity.y - player.y);
      if (manhattanDistance > pickupRadius * 1.5) continue;

      const distance = Math.sqrt(
        Math.pow(entity.x - player.x, 2) + Math.pow(entity.y - player.y, 2)
      );
      if (distance <= pickupRadius) {
        itemsToPickup.push(itemId);
      }
    }

    if (itemsToPickup.length > 0) {
      console.log(
        `🧲 Player ${player.name} vacuuming ${itemsToPickup.length}/${checkedCount} items (radius: ${pickupRadius}px)`
      );
    }

    for (const itemId of itemsToPickup) {
      const entity = room.state.entities.get(itemId);
      if (!entity) continue;

      const itemData = JSON.parse(entity.state || '{}');

      console.log(
        `🧲 Player ${player.name} picked up ${itemData.name || itemData.type}`
      );

      // Find client to send a pickup message
      const api = room as unknown as GameRoomApi;
      const iterable: Iterable<any> = api.clients as Iterable<any>;
      const client = Array.from(iterable || []).find(
        (c: any) => c && c.sessionId === playerId
      ) as any;
      if (client && typeof client.send === 'function') {
        let stackingId = itemId;
        if (itemData.type === 'material' && itemData.name) {
          stackingId = `material_${itemData.name}`;
        } else if (itemData.type === 'coin' && itemData.name) {
          stackingId = `coin_${itemData.name}`;
        } else if (itemData.type === 'wearable' && itemData.wearableId) {
          stackingId = `wearable_${itemData.wearableId}`;
        } else if (itemData.type === 'potion' && itemData.name) {
          stackingId = `potion_${itemData.name}`;
        } else if (itemData.type === 'weapon' && itemData.name) {
          stackingId = `weapon_${itemData.name}`;
        }

        const quantity = Number(itemData.quantity);
        const resolvedQuantity = Number.isFinite(quantity)
          ? Math.max(1, Math.floor(quantity))
          : 1;

        const resolvedType =
          (itemData.type as string) ||
          (itemData.itemType as string) ||
          'material';
        const item: any = {
          ...itemData,
          id: stackingId,
          type: resolvedType,
          itemType: (itemData.itemType as string) || resolvedType,
          name: itemData.name || resolvedType,
          quantity: resolvedQuantity,
        };
        if (typeof item.usdcAmount === 'number') {
          item.usdcAmount = Number(item.usdcAmount.toFixed(2));
        }
        if (typeof (item as any).ghstAmount === 'number') {
          // Keep raw fractional GHST display value; don't round to int
          (item as any).ghstAmount = Number((item as any).ghstAmount);
        }
        if (!item.color) {
          item.color = '#ffffff';
        }
        if (!item.rarity) {
          item.rarity = 'common';
        }
        if (!item.description && itemData.description) {
          item.description = itemData.description;
        }
        if (itemData.type === 'wearable' && itemData.wearableId) {
          item.wearableId = itemData.wearableId;
          item.imageUrl = `/wearables/${itemData.wearableId}.svg`;
        }
        if (itemData.spriteId) {
          item.spriteId = itemData.spriteId;
        }

        client.send('item_pickup', {
          itemId,
          item,
        });

        if (typeof api.applyInventoryDelta === 'function') {
          void api
            .applyInventoryDelta(playerId, item, item.quantity || 1, {
              entityId: itemId,
            })
            .catch((error: unknown) => {
              console.error('Failed to apply inventory delta from vacuum', {
                sessionId: playerId,
                item,
                error,
              });
            });
        }
      }

      room.state.entities.delete(itemId);
    }
  }
}
