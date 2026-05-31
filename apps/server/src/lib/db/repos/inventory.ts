import type { PoolClient, QueryResult } from 'pg';
import { getPgPool, runTransaction } from '../client';
import type { PlayerInventoryRecord, PlayerInventoryRow } from '../types';
import { durabilityCapForQuality } from '../../../data/wearable-quality';

function mapRow(row: PlayerInventoryRow): PlayerInventoryRecord {
  const quality = row.quality;
  const durabilityCap = durabilityCapForQuality(quality);
  return {
    id: row.id,
    playerId: row.player_id,
    itemType: row.item_type,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    itemData: row.item_data ?? {},
    instanceId: row.instance_id,
    wearableSlug: row.wearable_slug ?? null,
    quality,
    qualityScore:
      typeof row.quality_score === 'number' ? row.quality_score : null,
    durabilityScore: Math.max(
      0,
      Math.min(durabilityCap, Number(row.durability_score) || 0)
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

function isPotionRecord(itemType: string, itemName: string, itemData?: unknown) {
  const type = String(itemType ?? '').toLowerCase();
  const name = String(itemName ?? '').toLowerCase();
  const dataType =
    itemData && typeof itemData === 'object'
      ? String((itemData as any).type ?? '').toLowerCase()
      : '';
  return (
    type.includes('potion') ||
    name.includes('potion') ||
    dataType === 'potion'
  );
}

function resolveHealthPotionTier(itemType: string, itemName: string) {
  const type = String(itemType ?? '').toLowerCase();
  const name = String(itemName ?? '').toLowerCase();
  if (type.includes('ultra') || name.includes('ultra')) return 3;
  if (type.includes('greater') || name.includes('greater')) return 2;
  if (type.includes('health') || name.includes('health') || name.includes('healing'))
    return 1;
  return null;
}

function normalizePotionInput(
  itemType: string,
  itemName: string,
  itemData?: unknown
) {
  if (!isPotionRecord(itemType, itemName, itemData)) {
    return { itemType, itemName, itemData };
  }
  const normalizedType = 'potion';
  const data =
    itemData && typeof itemData === 'object' ? { ...(itemData as any) } : {};
  data.type = 'potion';
  if (typeof data.potionTier !== 'number') {
    const tier = resolveHealthPotionTier(itemType, itemName);
    if (tier) {
      data.potionTier = tier;
    }
  }
  return { itemType: normalizedType, itemName, itemData: data };
}


export async function getInventory(playerId: string) {
  const pool = getPgPool();
  const result = await pool.query<PlayerInventoryRow>(
    `
      select *
        from player_inventories
       where player_id = $1
    `,
    [playerId]
  );
  const records = result.rows.map(mapRow);

  // Sort in-memory to avoid DB sort overhead on large inventories
  return records.sort((a, b) => {
    // 1. Wearable first (0 vs 1)
    const aWearable = a.itemType === 'wearable' ? 0 : 1;
    const bWearable = b.itemType === 'wearable' ? 0 : 1;
    if (aWearable !== bWearable) {
      return aWearable - bWearable;
    }

    // 2. Quality (wearables only)
    if (aWearable === 0) {
      const getQualityScore = (q: string | null) => {
        switch (q) {
          case 'flawless':
            return 0;
          case 'excellent':
            return 1;
          case 'average':
            return 2;
          case 'budget':
            return 3;
          case 'broken':
            return 4;
          default:
            return 5;
        }
      };
      const aScore = getQualityScore(a.quality);
      const bScore = getQualityScore(b.quality);
      if (aScore !== bScore) {
        return aScore - bScore;
      }
    }

    // 3. Durability desc
    if (a.durabilityScore !== b.durabilityScore) {
      return b.durabilityScore - a.durabilityScore;
    }

    // 4. CreatedAt asc
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) {
      return aTime - bTime;
    }

    // 5. ItemType
    const typeCmp = String(a.itemType).localeCompare(String(b.itemType));
    if (typeCmp !== 0) {
      return typeCmp;
    }

    // 6. ItemName
    return String(a.itemName).localeCompare(String(b.itemName));
  });
}

export interface UpsertInventoryItemInput {
  playerId: string;
  itemType: string;
  itemName: string;
  quantity: number;
  itemData?: unknown;
  client?: PoolClient;
}

export async function upsertInventoryItem(input: UpsertInventoryItemInput) {
  const normalized = normalizePotionInput(
    input.itemType,
    input.itemName,
    input.itemData
  );
  const normalizedInput = {
    ...input,
    itemType: normalized.itemType,
    itemName: normalized.itemName,
    itemData: normalized.itemData,
  };
  if (
    String(normalizedInput.itemType ?? '')
      .toLowerCase()
      .trim() === 'wearable' ||
    String(normalizedInput.itemName ?? '').startsWith('wearable:')
  ) {
    throw new Error(
      'Wearable items must be inserted via createInventoryInstance'
    );
  }

  const query = `
    insert into player_inventories (
      player_id,
      item_type,
      item_name,
      quantity,
      item_data,
      created_at,
      updated_at
    ) values ($1,$2,$3,$4,$5,now(),now())
    on conflict (player_id, item_type, item_name)
      where lower(item_type) <> 'wearable'
    do update set
      quantity = player_inventories.quantity + excluded.quantity,
      item_data = excluded.item_data,
      updated_at = now()
    returning *
  `;

  const runWithClient = async (client: PoolClient) => {
    await client.query(
      "select set_config('app.potion_audit_source', $1, true)",
      [`server:${process.pid}`]
    );
    const result: QueryResult<PlayerInventoryRow> = await client.query(query, [
      normalizedInput.playerId,
      normalizedInput.itemType,
      normalizedInput.itemName,
      normalizedInput.quantity,
      normalizedInput.itemData ?? {},
    ]);
    return result;
  };

  const result: QueryResult<PlayerInventoryRow> = input.client
    ? await runWithClient(input.client)
    : await runTransaction(async (client) => runWithClient(client));

  if (String(normalizedInput.itemType ?? '').toLowerCase() === 'potion') {
    // NOTE:
    // This is a successful write path. Logging with `warn` + a fake Error stack
    // looks like a failure in our structured logs, so keep it informational.
    console.log('[Inventory] Potion upserted', {
      playerId: normalizedInput.playerId,
      itemType: normalizedInput.itemType,
      itemName: normalizedInput.itemName,
      quantity: normalizedInput.quantity,
    });
  }
  return mapRow(result.rows[0]);
}

export interface CreateInventoryInstanceInput {
  playerId: string;
  wearableSlug: string;
  quality: 'broken' | 'budget' | 'average' | 'excellent' | 'flawless';
  durabilityScore: number;
  qualityScore?: number | null;
  itemData?: unknown;
  client?: PoolClient;
}

export interface CreateInventoryInstancesInput {
  playerId: string;
  items: Array<{
    wearableSlug: string;
    quality: 'broken' | 'budget' | 'average' | 'excellent' | 'flawless' | string;
    durabilityScore?: number;
    qualityScore?: number | null;
    itemData?: unknown;
  }>;
  client?: PoolClient;
}

export async function createInventoryInstances(
  input: CreateInventoryInstancesInput
) {
  if (!input.items.length) {
    return [] as PlayerInventoryRecord[];
  }

  const allowedQualities = new Set([
    'broken',
    'budget',
    'average',
    'excellent',
    'flawless',
  ]);

  const sanitizedItems = input.items.map((item) => {
    const qualityLowered =
      typeof item.quality === 'string' ? item.quality.toLowerCase() : '';
    const quality = allowedQualities.has(qualityLowered)
      ? (qualityLowered as
          | 'broken'
          | 'budget'
          | 'average'
          | 'excellent'
          | 'flawless')
      : 'average';
    const durabilityCap = durabilityCapForQuality(quality);
    const durabilityValue =
      typeof item.durabilityScore === 'number' ? item.durabilityScore : NaN;
    const sanitizedDurability = Number.isFinite(durabilityValue)
      ? Math.max(1, Math.min(durabilityCap, Math.floor(durabilityValue)))
      : durabilityCap;
    const qualityScore =
      typeof item.qualityScore === 'number' && Number.isFinite(item.qualityScore)
        ? Math.max(0, Math.floor(item.qualityScore))
        : null;
    const itemData = {
      wearableSlug: item.wearableSlug,
      quality,
      qualityScore,
      durabilityScore: sanitizedDurability,
      ...(item.itemData && typeof item.itemData === 'object'
        ? item.itemData
        : {}),
    };
    return {
      wearableSlug: item.wearableSlug,
      quality,
      qualityScore,
      durabilityScore: sanitizedDurability,
      itemData,
    };
  });

  const values = sanitizedItems.map((item, index) => {
    const base = index * 6;
    return `($${base + 1}, 'wearable', $${base + 2}, 1, $${base + 6}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, now(), now())`;
  });

  const params = sanitizedItems.flatMap((item) => [
    input.playerId,
    item.wearableSlug,
    item.quality,
    item.qualityScore,
    item.durabilityScore,
    item.itemData,
  ]);

  const query = `
    insert into player_inventories (
      player_id,
      item_type,
      item_name,
      quantity,
      item_data,
      wearable_slug,
      quality,
      quality_score,
      durability_score,
      created_at,
      updated_at
    ) values ${values.join(',')}
    returning *
  `;

  const runWithClient = async (client: PoolClient) => {
    const result = await client.query<PlayerInventoryRow>(query, params);
    return result.rows.map(mapRow);
  };

  if (input.client) {
    return runWithClient(input.client);
  }

  return runTransaction(async (client) => runWithClient(client));
}

export async function createInventoryInstance(
  input: CreateInventoryInstanceInput
) {
  const pool = getPool(input.client);

  const sanitizedDurability = Number.isFinite(input.durabilityScore)
    ? Math.max(
        1,
        Math.min(
          durabilityCapForQuality(input.quality),
          Math.floor(input.durabilityScore)
        )
      )
    : durabilityCapForQuality(input.quality);
  const qualityScore =
    typeof input.qualityScore === 'number' &&
    Number.isFinite(input.qualityScore)
      ? Math.max(0, Math.floor(input.qualityScore))
      : null;

  const itemData = {
    wearableSlug: input.wearableSlug,
    quality: input.quality,
    qualityScore,
    durabilityScore: sanitizedDurability,
    ...(input.itemData && typeof input.itemData === 'object'
      ? input.itemData
      : {}),
  };

  const result = await pool.query<PlayerInventoryRow>(
    `
      insert into player_inventories (
        player_id,
        item_type,
        item_name,
        quantity,
        item_data,
        wearable_slug,
        quality,
        quality_score,
        durability_score,
        created_at,
        updated_at
      ) values (
        $1,
        'wearable',
        $2,
        1,
        $6,
        $2,
        $3,
        $4,
        $5,
        now(),
        now()
      )
      returning *
    `,
    [
      input.playerId,
      input.wearableSlug,
      input.quality,
      qualityScore,
      sanitizedDurability,
      itemData,
    ]
  );

  return mapRow(result.rows[0]);
}

export async function removeInventoryItem(
  playerId: string,
  itemType: string,
  itemName: string,
  client?: PoolClient
) {
  const pool = getPool(client);
  await pool.query(
    'delete from player_inventories where player_id = $1 and item_type = $2 and item_name = $3',
    [playerId, itemType, itemName]
  );
}

export async function removeInventoryItemById(
  playerId: string,
  inventoryItemId: string,
  client?: PoolClient
) {
  const pool = getPool(client);
  const result = await pool.query<PlayerInventoryRow>(
    'delete from player_inventories where player_id = $1 and id = $2 returning *',
    [playerId, inventoryItemId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface DecrementInventoryItemResult {
  quantityBefore: number;
  quantityAfter: number;
  deleted: boolean;
  record: PlayerInventoryRecord | null;
}

export interface DecrementInventoryItemWithRecordResult {
  quantityBefore: number;
  quantityAfter: number;
  deleted: boolean;
  record: PlayerInventoryRecord;
}

export async function decrementInventoryItem(
  playerId: string,
  itemType: string,
  itemName: string,
  amount: number,
  client: PoolClient
): Promise<DecrementInventoryItemResult | null> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Decrement amount must be a positive number');
  }

  const result = await client.query<PlayerInventoryRow>(
    `select *
       from player_inventories
      where player_id = $1
        and item_type = $2
        and item_name = $3
      for update`,
    [playerId, itemType, itemName]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const currentQuantity = Number(row.quantity) || 0;
  if (currentQuantity < amount) {
    throw new Error('Insufficient quantity to decrement inventory item');
  }

  const nextQuantity = currentQuantity - amount;

  if (nextQuantity === 0) {
    await client.query(
      `delete from player_inventories
        where id = $1`,
      [row.id]
    );
    return {
      quantityBefore: currentQuantity,
      quantityAfter: 0,
      deleted: true,
      record: null,
    };
  }

  const updateResult = await client.query<PlayerInventoryRow>(
    `update player_inventories
        set quantity = $2,
            updated_at = now()
      where id = $1
      returning *`,
    [row.id, nextQuantity]
  );

  const updatedRow = updateResult.rows[0];
  return {
    quantityBefore: currentQuantity,
    quantityAfter: nextQuantity,
    deleted: false,
    record: mapRow(updatedRow),
  };
}

export async function decrementInventoryItemWithRecord(
  playerId: string,
  itemType: string,
  itemName: string,
  amount: number,
  client: PoolClient
): Promise<DecrementInventoryItemWithRecordResult | null> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Decrement amount must be a positive number');
  }

  const result = await client.query<PlayerInventoryRow>(
    `select *
       from player_inventories
      where player_id = $1
        and item_type = $2
        and item_name = $3
      for update`,
    [playerId, itemType, itemName]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const currentQuantity = Number(row.quantity) || 0;
  if (currentQuantity < amount) {
    throw new Error('Insufficient quantity to decrement inventory item');
  }

  const nextQuantity = currentQuantity - amount;

  if (nextQuantity === 0) {
    await client.query(
      `delete from player_inventories
        where id = $1`,
      [row.id]
    );
    return {
      quantityBefore: currentQuantity,
      quantityAfter: 0,
      deleted: true,
      record: mapRow(row),
    };
  }

  const updateResult = await client.query<PlayerInventoryRow>(
    `update player_inventories
        set quantity = $2,
            updated_at = now()
      where id = $1
      returning *`,
    [row.id, nextQuantity]
  );

  const updatedRow = updateResult.rows[0];
  return {
    quantityBefore: currentQuantity,
    quantityAfter: nextQuantity,
    deleted: false,
    record: mapRow(updatedRow),
  };
}


export async function getInventoryQuantity(
  playerId: string,
  slug: string,
  client?: PoolClient
): Promise<number> {
  const pool = getPool(client);
  const result = await pool.query<{ quantity: string | number }>(
    `select coalesce(sum(quantity), 0)::numeric as quantity
       from player_inventories
      where player_id = $1
        and item_type = 'wearable'
        and item_name = $2`,
    [playerId, slug]
  );
  const value = result.rows[0]?.quantity;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getInventoryByIds(
  ids: string[],
  client?: PoolClient
): Promise<PlayerInventoryRecord[]> {
  const uniqueIds = Array.from(
    new Set(ids.filter((value) => typeof value === 'string' && value.trim()))
  );
  if (uniqueIds.length === 0) {
    return [];
  }

  const pool = getPool(client);
  const result = await pool.query<PlayerInventoryRow>(
    `
      select *
        from player_inventories
       where id = any($1::uuid[])
    `,
    [uniqueIds]
  );
  return result.rows.map(mapRow);
}

export async function getInventoryMapByIds(
  ids: string[],
  client?: PoolClient
): Promise<Map<string, PlayerInventoryRecord>> {
  const records = await getInventoryByIds(ids, client);
  const map = new Map<string, PlayerInventoryRecord>();
  for (const record of records) {
    map.set(record.id, record);
  }
  return map;
}

export async function getWearableInventoryBySlug(
  playerId: string,
  slug: string,
  client?: PoolClient
): Promise<PlayerInventoryRecord[]> {
  const pool = getPool(client);
  const result = await pool.query<PlayerInventoryRow>(
    `
      select *
        from player_inventories
       where player_id = $1
         and wearable_slug = $2
       order by
         case
           when quality = 'flawless' then 0
           when quality = 'excellent' then 1
           when quality = 'average' then 2
           when quality = 'budget' then 3
           when quality = 'broken' then 4
           else 5
         end,
         durability_score desc,
         created_at asc
    `,
    [playerId, slug]
  );
  return result.rows.map(mapRow);
}

function mergeWearableItemData(
  record: PlayerInventoryRecord,
  durabilityScore: number
): Record<string, unknown> {
  const base =
    record.itemData && typeof record.itemData === 'object'
      ? { ...(record.itemData as Record<string, unknown>) }
      : {};
  return {
    ...base,
    wearableSlug: record.wearableSlug,
    quality: record.quality,
    qualityScore: record.qualityScore,
    durabilityScore,
  };
}

async function updateWearableDurabilityRecord(
  record: PlayerInventoryRecord,
  durabilityScore: number,
  client: PoolClient
): Promise<PlayerInventoryRecord> {
  const cap = durabilityCapForQuality(record.quality);
  const nextDurability = Math.max(
    0,
    Math.min(cap, Math.floor(Number(durabilityScore) || 0))
  );
  const itemData = mergeWearableItemData(record, nextDurability);
  const result = await client.query<PlayerInventoryRow>(
    `update player_inventories
        set durability_score = $2,
            item_data = $3,
            updated_at = now()
      where id = $1
      returning *`,
    [record.id, nextDurability, itemData]
  );
  return mapRow(result.rows[0]);
}

export async function setWearableDurabilityById(
  playerId: string,
  inventoryItemId: string,
  durabilityScore: number,
  client: PoolClient
): Promise<PlayerInventoryRecord | null> {
  const result = await client.query<PlayerInventoryRow>(
    `select *
       from player_inventories
      where player_id = $1
        and id = $2
        and item_type = 'wearable'
      for update`,
    [playerId, inventoryItemId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return updateWearableDurabilityRecord(mapRow(result.rows[0]), durabilityScore, client);
}

export async function applyWearableDurabilityLossById(
  playerId: string,
  inventoryItemId: string,
  durabilityLoss: number,
  client: PoolClient
): Promise<PlayerInventoryRecord | null> {
  const result = await client.query<PlayerInventoryRow>(
    `select *
       from player_inventories
      where player_id = $1
        and id = $2
        and item_type = 'wearable'
      for update`,
    [playerId, inventoryItemId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  const record = mapRow(result.rows[0]);
  const loss = Number.isFinite(durabilityLoss)
    ? Math.max(0, Math.floor(durabilityLoss))
    : 0;
  const currentDurability = Number(record.durabilityScore) || 0;
  return updateWearableDurabilityRecord(
    record,
    Math.max(0, currentDurability - loss),
    client
  );
}
