import type { PoolClient } from 'pg';
import { getPgPool } from '../client';
import type {
  PlayerInventoryEventRecord,
  PlayerInventoryEventRow,
} from '../types';

function mapRow(row: PlayerInventoryEventRow): PlayerInventoryEventRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    itemType: row.item_type,
    itemName: row.item_name,
    delta: Number(row.delta),
    reason: row.reason,
    gameId: row.game_id,
    metadata: row.metadata ?? {},
    inventoryItemId: row.inventory_item_id,
    createdAt: row.created_at,
  };
}

export interface LogInventoryEventInput {
  playerId: string;
  itemType: string;
  itemName: string;
  delta: number;
  reason: string;
  gameId?: string | null;
  metadata?: unknown;
  inventoryItemId?: string | null;
}

export interface InventoryEventsQueryOptions {
  limit?: number;
  potionOnly?: boolean;
}

export async function logInventoryEvent(
  input: LogInventoryEventInput,
  client?: PoolClient
) {
  const runner = client ?? getPgPool();
  const query = `
    insert into player_inventory_events (
      player_id,
      item_type,
      item_name,
      delta,
      reason,
      game_id,
      metadata,
      inventory_item_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    returning *
  `;

  const result = await runner.query<PlayerInventoryEventRow>(query, [
    input.playerId,
    input.itemType,
    input.itemName,
    input.delta,
    input.reason,
    input.gameId ?? null,
    input.metadata ?? {},
    input.inventoryItemId ?? null,
  ]);

  return mapRow(result.rows[0]);
}

export async function getRecentInventoryEventsForPlayer(
  playerId: string,
  options: InventoryEventsQueryOptions = {}
) {
  const runner = getPgPool();
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const potionOnly = options.potionOnly !== false;
  const query = `
    select *
      from player_inventory_events
     where player_id = $1
       ${potionOnly ? "and (item_type = 'potion' or item_name ilike '%potion%')" : ''}
     order by created_at desc
     limit $2
  `;
  const result = await runner.query<PlayerInventoryEventRow>(query, [
    playerId,
    limit,
  ]);
  return result.rows.map(mapRow);
}
