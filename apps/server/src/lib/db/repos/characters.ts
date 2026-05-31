import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type {
  AavegotchiCharacterRow,
  AavegotchiCharacterRecord,
} from '../types';

function mapRow(row: AavegotchiCharacterRow): AavegotchiCharacterRecord {
  return {
    id: row.id,
    gotchiId: row.gotchi_id,
    ownerAddress: row.owner_address,
    wearableSlugs: Array.isArray(row.wearable_slugs)
      ? [...row.wearable_slugs]
      : [],
    lastSyncedAt: row.last_synced_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export interface UpsertCharacterInput {
  gotchiId: string;
  ownerAddress: string;
  wearableSlugs: string[];
  lastSyncedAt?: Date | string | null;
}

export async function upsertCharacters(
  inputs: UpsertCharacterInput[],
  client?: PoolClient
) {
  if (inputs.length === 0) {
    return [] as AavegotchiCharacterRecord[];
  }

  const pool = getPool(client);
  const params: unknown[] = [];
  const values: string[] = [];

  inputs.forEach((input, index) => {
    const base = index * 4;
    const normalizedOwner = input.ownerAddress.trim().toLowerCase();
    params.push(input.gotchiId, normalizedOwner, input.wearableSlugs, input.lastSyncedAt ?? new Date().toISOString());
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
    );
  });

  const query = `
    insert into aavegotchi_characters (
      gotchi_id,
      owner_address,
      wearable_slugs,
      last_synced_at
    ) values ${values.join(', ')}
    on conflict (gotchi_id) do update set
      owner_address = excluded.owner_address,
      wearable_slugs = excluded.wearable_slugs,
      last_synced_at = excluded.last_synced_at
    returning *
  `;

  const result: QueryResult<AavegotchiCharacterRow> = await pool.query(query, params);
  return result.rows.map(mapRow);
}

export async function listByOwner(ownerAddress: string) {
  const pool = getPgPool();
  const normalized = ownerAddress.trim().toLowerCase();
  const result = await pool.query<AavegotchiCharacterRow>(
    `select *
       from aavegotchi_characters
      where owner_address = $1
      order by gotchi_id`,
    [normalized]
  );
  return result.rows.map(mapRow);
}

export async function getByGotchiId(gotchiId: string) {
  const pool = getPgPool();
  const result = await pool.query<AavegotchiCharacterRow>(
    'select * from aavegotchi_characters where gotchi_id = $1 limit 1',
    [gotchiId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}
