import type { PoolClient } from 'pg';
import { runTransaction, inventoryRepo, inventoryEventsRepo } from './db';
import { getEquippedInventoryItemIds } from './equipment-service';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const MAX_FUNGIBLE_REMOVE_QUANTITY = 10_000;
export const MAX_REMOVE_OPERATIONS = 200;

export type DestroyFungibleRequest = {
  itemType: string;
  itemName: string;
  quantity: number;
};

export type DestroyInstanceRequest = {
  inventoryItemId: string;
};

export type InventoryRemoveRequest =
  | DestroyFungibleRequest
  | DestroyInstanceRequest;

export type InventoryRemovalErrorCode =
  | 'INVENTORY_INVALID_REQUEST'
  | 'ITEM_NOT_FOUND'
  | 'INSUFFICIENT_QUANTITY'
  | 'EQUIPPED_OR_LOCKED';

export class InventoryRemovalError extends Error {
  public readonly code: InventoryRemovalErrorCode;
  public readonly status: number;
  public readonly detail?: Record<string, unknown>;

  constructor(
    code: InventoryRemovalErrorCode,
    message: string,
    status: number,
    detail?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function isDestroyFungibleRequest(
  value: unknown
): value is DestroyFungibleRequest {
  if (!isPlainObject(value)) {
    return false;
  }
  const itemType = value.itemType;
  const itemName = value.itemName;
  const quantity = value.quantity;
  return (
    typeof itemType === 'string' &&
    itemType.trim().length > 0 &&
    typeof itemName === 'string' &&
    itemName.trim().length > 0 &&
    Number.isFinite(Number(quantity))
  );
}

export function isDestroyInstanceRequest(
  value: unknown
): value is DestroyInstanceRequest {
  if (!isPlainObject(value)) {
    return false;
  }
  const inventoryItemId = value.inventoryItemId;
  return (
    typeof inventoryItemId === 'string' && inventoryItemId.trim().length > 0
  );
}

export function normalizeRemoveRequests(
  body: unknown
): InventoryRemoveRequest[] {
  if (Array.isArray(body)) {
    return body
      .map((entry) =>
        isDestroyFungibleRequest(entry) || isDestroyInstanceRequest(entry)
          ? entry
          : null
      )
      .filter(
        (
          value: InventoryRemoveRequest | null
        ): value is InventoryRemoveRequest => Boolean(value)
      );
  }

  if (isPlainObject(body) && Array.isArray((body as any).items)) {
    return (body as any).items
      .map((entry: unknown) =>
        isDestroyFungibleRequest(entry) || isDestroyInstanceRequest(entry)
          ? entry
          : null
      )
      .filter(
        (
          value: InventoryRemoveRequest | null
        ): value is InventoryRemoveRequest => Boolean(value)
      );
  }

  if (isDestroyFungibleRequest(body) || isDestroyInstanceRequest(body)) {
    return [body];
  }

  return [];
}

export interface InventoryRemovalOptions {
  reason: 'destroy_user' | 'drop_user';
  metadata?: Record<string, unknown>;
}

export type AppliedFungibleRemoval = {
  type: 'fungible';
  itemType: string;
  itemName: string;
  quantity: number;
  quantityRemaining: number;
};

export type AppliedWearableRemoval = {
  type: 'wearable';
  inventoryItemId: string;
  itemType: string;
  itemName: string;
  quality?: string | null;
  durabilityScore?: number | null;
};

export type AppliedInventoryRemoval =
  | AppliedFungibleRemoval
  | AppliedWearableRemoval;

export async function processInventoryRemoval(
  playerId: string,
  requests: InventoryRemoveRequest[],
  client: PoolClient,
  options: InventoryRemovalOptions
): Promise<AppliedInventoryRemoval[]> {
  if (requests.length === 0) {
    return [];
  }
  if (requests.length > MAX_REMOVE_OPERATIONS) {
    throw new InventoryRemovalError(
      'INVENTORY_INVALID_REQUEST',
      'Too many removal operations',
      422,
      { max: MAX_REMOVE_OPERATIONS }
    );
  }

  const equippedIds = await getEquippedInventoryItemIds(playerId, client);

  const applied: AppliedInventoryRemoval[] = [];

  for (const request of requests) {
    if (isDestroyFungibleRequest(request)) {
      const itemType = request.itemType.trim();
      const itemName = request.itemName.trim();
      const normalizedQuantity = Math.floor(Number(request.quantity));
      if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
        throw new InventoryRemovalError(
          'INVENTORY_INVALID_REQUEST',
          'Quantity must be a positive integer',
          422,
          { itemType, itemName, quantity: request.quantity }
        );
      }
      if (normalizedQuantity > MAX_FUNGIBLE_REMOVE_QUANTITY) {
        throw new InventoryRemovalError(
          'INVENTORY_INVALID_REQUEST',
          `Quantity exceeds per-request maximum of ${MAX_FUNGIBLE_REMOVE_QUANTITY}`,
          422,
          { itemType, itemName, quantity: normalizedQuantity }
        );
      }

      // Primary attempt: decrement a single canonical row
      let usedFallback = false;
      try {
        const decrementResult = await inventoryRepo.decrementInventoryItem(
          playerId,
          itemType,
          itemName,
          normalizedQuantity,
          client
        );
        if (!decrementResult) {
          // Canonical row not found; try multi-row fallback
          usedFallback = true;
        } else {
          await inventoryEventsRepo.logInventoryEvent(
            {
              playerId,
              itemType,
              itemName,
              delta: -normalizedQuantity,
              reason: options.reason,
              metadata: {
                ...(options.metadata ?? {}),
                quantityBefore: decrementResult.quantityBefore,
                quantityAfter: decrementResult.quantityAfter,
              },
            },
            client
          );
          applied.push({
            type: 'fungible',
            itemType,
            itemName,
            quantity: normalizedQuantity,
            quantityRemaining: decrementResult.quantityAfter,
          });
          continue;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('Insufficient quantity')) {
          usedFallback = true;
        } else {
          throw error;
        }
      }

      // Fallback: spread decrement across all matching rows (case-insensitive name)
      if (usedFallback) {
        const rowsResult = await client.query<{
          item_type: string;
          item_name: string;
          quantity: number;
        }>(
          `select item_type, item_name, quantity
             from player_inventories
            where player_id = $1
              and item_type = $2
              and (lower(trim(item_name)) = lower(trim($3)) or lower(item_name) = lower($3))
            for update`,
          [playerId, itemType, itemName]
        );

        if (rowsResult.rows.length === 0) {
          throw new InventoryRemovalError(
            'ITEM_NOT_FOUND',
            'Item not found',
            404,
            { itemType, itemName }
          );
        }

        let remaining = normalizedQuantity;
        // Spend from largest quantities first
        const sorted = rowsResult.rows
          .map((r) => ({ ...r, q: Number(r.quantity) || 0 }))
          .filter((r) => r.q > 0)
          .sort((a, b) => b.q - a.q);

        const totalAvailable = sorted.reduce((sum, r) => sum + r.q, 0);
        if (totalAvailable < remaining) {
          throw new InventoryRemovalError(
            'INSUFFICIENT_QUANTITY',
            'Insufficient quantity',
            422,
            {
              itemType,
              itemName,
              requested: normalizedQuantity,
              available: totalAvailable,
            }
          );
        }

        for (const row of sorted) {
          if (remaining <= 0) break;
          const spend = Math.min(row.q, remaining);
          const dec = await inventoryRepo.decrementInventoryItem(
            playerId,
            row.item_type,
            row.item_name,
            spend,
            client
          );
          if (!dec) continue;
          await inventoryEventsRepo.logInventoryEvent(
            {
              playerId,
              itemType: row.item_type,
              itemName: row.item_name,
              delta: -spend,
              reason: options.reason,
              metadata: {
                ...(options.metadata ?? {}),
                quantityBefore: dec.quantityBefore,
                quantityAfter: dec.quantityAfter,
              },
            },
            client
          );
          applied.push({
            type: 'fungible',
            itemType: row.item_type,
            itemName: row.item_name,
            quantity: spend,
            quantityRemaining: dec.quantityAfter,
          });
          remaining -= spend;
        }
        continue;
      }
    }

    if (isDestroyInstanceRequest(request)) {
      const inventoryItemId = request.inventoryItemId.trim();
      if (equippedIds.has(inventoryItemId)) {
        throw new InventoryRemovalError(
          'EQUIPPED_OR_LOCKED',
          'Cannot remove an equipped item',
          409,
          { inventoryItemId }
        );
      }

      const removed = await inventoryRepo.removeInventoryItemById(
        playerId,
        inventoryItemId,
        client
      );

      if (!removed) {
        throw new InventoryRemovalError(
          'ITEM_NOT_FOUND',
          'Item not found',
          404,
          { inventoryItemId }
        );
      }

      await inventoryEventsRepo.logInventoryEvent(
        {
          playerId,
          itemType: removed.itemType,
          itemName: removed.itemName,
          delta: -1,
          reason: options.reason,
          inventoryItemId: removed.id,
          metadata: {
            ...(options.metadata ?? {}),
            quality: removed.quality,
            durabilityScore: removed.durabilityScore,
          },
        },
        client
      );

      equippedIds.delete(inventoryItemId);

      applied.push({
        type: 'wearable',
        inventoryItemId,
        itemType: removed.itemType,
        itemName: removed.itemName,
        quality: removed.quality,
        durabilityScore: removed.durabilityScore,
      });
    }
  }

  return applied;
}

export async function executeInventoryRemoval(
  playerId: string,
  requests: InventoryRemoveRequest[],
  options: InventoryRemovalOptions
): Promise<AppliedInventoryRemoval[]> {
  return runTransaction((client) =>
    processInventoryRemoval(playerId, requests, client, options)
  );
}
