import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { PlayerEquipmentRecord, PlayerEquipmentRow } from '../types';

function mapRow(row: PlayerEquipmentRow): PlayerEquipmentRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    characterId: row.character_id,
    slot: row.slot,
    wearableSlug: row.wearable_slug,
    source: row.source,
    inventoryItemId: row.inventory_item_id,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export async function getEquipment(playerId: string, client?: PoolClient) {
  const pool = getPool(client);
  const result = await pool.query<PlayerEquipmentRow>(
    'select * from player_equipment where player_id = $1 order by slot',
    [playerId]
  );
  return result.rows.map(mapRow);
}

export async function getEquipmentByPlayer(
  playerId: string,
  characterId?: string | null,
  client?: PoolClient
): Promise<
  Array<{ slot: string; wearableSlug: string; inventoryItemId: string | null }>
> {
  const pool = getPool(client);
  const params: any[] = [playerId];
  let query = `select slot, wearable_slug, inventory_item_id
       from player_equipment
      where player_id = $1`;
  if (characterId !== undefined) {
    params.push(characterId);
    query += ` and character_id = $2`;
  }
  query += ` order by slot`;
  const result = await pool.query<
    Pick<PlayerEquipmentRow, 'slot' | 'wearable_slug' | 'inventory_item_id'>
  >(query, params);
  return result.rows.map((row) => ({
    slot: row.slot,
    wearableSlug: row.wearable_slug,
    inventoryItemId: row.inventory_item_id,
  }));
}

export async function getEquippedCountBySlug(
  playerId: string,
  slug: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from player_equipment
      where player_id = $1
        and wearable_slug = $2`,
    [playerId, slug]
  );
  const countValue = result.rows[0]?.count;
  const numeric = Number(countValue);
  return Number.isFinite(numeric) ? numeric : 0;
}

export interface SetEquipmentInput {
  playerId: string;
  characterId?: string | null;
  slot: string;
  wearableSlug: string;
  source?: string;
  inventoryItemId?: string | null;
  client?: PoolClient;
}

export async function setEquipment(input: SetEquipmentInput) {
  // Validate required fields to prevent corrupt data
  if (!input.playerId || !input.slot || !input.wearableSlug) {
    console.error('[equipment] setEquipment called with missing required fields', {
      playerId: input.playerId,
      slot: input.slot,
      wearableSlug: input.wearableSlug,
    });
    throw new Error('setEquipment requires playerId, slot, and wearableSlug');
  }

  // If characterId is not provided, this is likely a bug - log warning
  if (!input.characterId) {
    console.warn('[equipment] setEquipment called without characterId - this may cause data issues', {
      playerId: input.playerId,
      slot: input.slot,
      wearableSlug: input.wearableSlug,
    });
  }

  const pool = getPool(input.client);
  const query = `
    insert into player_equipment (
      player_id,
      character_id,
      slot,
      wearable_slug,
      source,
      inventory_item_id,
      updated_at
    ) values ($1,$2,$3,$4,$5,$6,now())
    on conflict (player_id, character_id, slot) do update set
      wearable_slug = excluded.wearable_slug,
      source = excluded.source,
      inventory_item_id = excluded.inventory_item_id,
      updated_at = now()
    returning *
  `;

  const result: QueryResult<PlayerEquipmentRow> = await pool.query(query, [
    input.playerId,
    input.characterId ?? null,
    input.slot,
    input.wearableSlug,
    input.source ?? 'inventory',
    input.inventoryItemId ?? null,
  ]);
  return mapRow(result.rows[0]);
}

export async function removeEquipment(
  playerId: string,
  slot: string,
  characterId?: string | null,
  client?: PoolClient
) {
  // Require a valid characterId to prevent accidentally removing equipment across all characters
  if (!characterId || typeof characterId !== 'string' || characterId.trim() === '') {
    console.error('[equipment] removeEquipment called with invalid characterId - refusing to remove equipment', {
      playerId,
      slot,
      characterId,
    });
    throw new Error('removeEquipment requires a valid characterId to prevent data corruption');
  }

  const pool = getPool(client);
  await pool.query(
    'delete from player_equipment where player_id = $1 and slot = $2 and character_id = $3',
    [playerId, slot, characterId]
  );
}

export async function clearEquipment(
  playerId: string,
  characterId?: string | null,
  client?: PoolClient
) {
  // Require a valid characterId to prevent accidentally clearing equipment across all characters
  if (!characterId || typeof characterId !== 'string' || characterId.trim() === '') {
    console.error('[equipment] clearEquipment called with invalid characterId - refusing to clear equipment', {
      playerId,
      characterId,
    });
    throw new Error('clearEquipment requires a valid characterId to prevent data corruption');
  }

  const pool = getPool(client);
  await pool.query(
    'delete from player_equipment where player_id = $1 and character_id = $2',
    [playerId, characterId]
  );
}

export async function getEquippedWithInstances(
  playerId: string,
  characterId?: string | null,
  client?: PoolClient
): Promise<
  Array<{
    slot: string;
    wearableSlug: string;
    inventoryItemId: string | null;
    quality: string | null;
    durabilityScore: number | null;
  }>
> {
  const pool = getPool(client);
  const params: any[] = [playerId];

  let query = `
    select
      eq.slot,
      eq.wearable_slug,
      eq.inventory_item_id,
      inv.quality,
      inv.durability_score
      from player_equipment eq
 left join player_inventories inv
        on inv.id = eq.inventory_item_id
     where eq.player_id = $1
  `;
  if (characterId !== undefined) {
    params.push(characterId);
    query += ` and eq.character_id = $2`;
  }
  query += ` order by eq.slot`;

  const result = await pool.query<{
    slot: string;
    wearable_slug: string;
    inventory_item_id: string | null;
    quality: string | null;
    durability_score: number | null;
  }>(query, params);

  return result.rows.map((row) => ({
    slot: row.slot,
    wearableSlug: row.wearable_slug,
    inventoryItemId: row.inventory_item_id,
    quality: row.quality,
    durabilityScore:
      typeof row.durability_score === 'number' ? row.durability_score : null,
  }));
}

/**
 * Returns a summarized view of equipped items for convenience in API layers.
 * - idSet: inventory item IDs that are currently equipped
 * - countBySlug: number of equipped items per wearable slug
 */
export async function getEquippedSummary(
  playerId: string,
  client?: PoolClient
): Promise<{ idSet: Set<string>; countBySlug: Map<string, number> }> {
  const pool = getPool(client);
  const result = await pool.query<{
    wearable_slug: string;
    inventory_item_id: string | null;
    source: string | null;
  }>(
    `select wearable_slug, inventory_item_id, source
       from player_equipment
      where player_id = $1`,
    [playerId]
  );
  const rows = result.rows;
  const idSet = new Set<string>();
  const countBySlug = new Map<string, number>();
  for (const row of rows) {
    const id = row.inventory_item_id;
    if (typeof id === 'string' && id) idSet.add(id);
    const slug = String(row.wearable_slug || '').trim();
    if (!slug) continue;
    const source = String(row.source || '').toLowerCase();
    const hasInstance = typeof id === 'string' && id.trim().length > 0;
    const isOverride = source === 'override';
    const isDerived = source === 'derived';

    if (!hasInstance && !isOverride) {
      // Ignore derived/base-equipment rows (and any other non-override rows)
      // that do not point at a concrete inventory instance.
      if (isDerived || source === 'inventory' || !source) {
        continue;
      }
    }

    countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + 1);
  }
  return { idSet, countBySlug };
}
