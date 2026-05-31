import type { QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { PlayerProgressionRecord, PlayerProgressionRow } from '../types';

function serializeJson(value: unknown, fallback: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(fallback);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return JSON.stringify(fallback);
    }
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch (error) {
      return JSON.stringify(fallback);
    }
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify(fallback);
  }
}

function mapRow(row: PlayerProgressionRow): PlayerProgressionRecord {
  return {
    playerId: row.player_id,
    level: Number(row.level),
    totalXp: Number(row.total_xp),
    unspentPoints: Number(row.unspent_points),
    rebirthCount: Number(row.rebirth_count),
    unlockedTiers: Array.isArray(row.unlocked_tiers) ? row.unlocked_tiers : [],
    lickTongueCount: Number(row.lick_tongue_count),
    statAllocations: row.stat_allocations ?? {},
    derivedStats: row.derived_stats ?? {},
    equippedWearables: row.equipped_wearables ?? [],
    updatedAt: row.updated_at,
    allocationHistory: row.allocation_history ?? [],
    lastSyncedAt: row.last_synced_at ?? null,
  };
}

export async function getProgression(playerId: string) {
  const pool = getPgPool();
  const result = await pool.query<PlayerProgressionRow>(
    `select
       p.id as player_id,
       p.level,
       p.total_xp,
       p.unspent_points,
       p.rebirth_count,
       p.unlocked_tiers,
       p.lick_tongue_count,
       p.stat_allocations,
       p.derived_stats,
       p.equipped_wearables,
       p.allocation_history,
       p.last_synced_at,
       p.updated_at
     from players p
     where p.id = $1
     limit 1`,
    [playerId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface UpsertProgressionInput {
  playerId: string;
  level: number;
  totalXp: number;
  unspentPoints: number;
  rebirthCount?: number;
  unlockedTiers: string[];
  lickTongueCount: number;
  statAllocations: unknown;
  derivedStats: unknown;
  equippedWearables: unknown;
  allocationHistory: unknown;
  lastSyncedAt?: string | null;
}

export async function upsertProgression(input: UpsertProgressionInput) {
  const pool = getPgPool();
  const statAllocationsJson = serializeJson(input.statAllocations, {});
  const derivedStatsJson = serializeJson(input.derivedStats, {});
  const equippedWearablesJson = serializeJson(
    Array.isArray(input.equippedWearables)
      ? input.equippedWearables
      : (input.equippedWearables ?? []),
    []
  );
  const allocationHistoryJson = serializeJson(
    Array.isArray(input.allocationHistory)
      ? input.allocationHistory
      : (input.allocationHistory ?? []),
    []
  );

  const query = `
    update players
       set level = $2,
           total_xp = $3,
           unspent_points = $4,
           rebirth_count = coalesce($12, rebirth_count),
           unlocked_tiers = $5,
           lick_tongue_count = $6,
           stat_allocations = $7::jsonb,
           derived_stats = $8::jsonb,
           equipped_wearables = $9::jsonb,
           allocation_history = $10::jsonb,
           last_synced_at = $11,
           updated_at = now()
     where id = $1
     returning
       id as player_id,
       level,
       total_xp,
       unspent_points,
       rebirth_count,
       unlocked_tiers,
       lick_tongue_count,
       stat_allocations,
       derived_stats,
       equipped_wearables,
       allocation_history,
       last_synced_at,
       updated_at
  `;

  const params = [
    input.playerId,
    input.level,
    input.totalXp,
    input.unspentPoints,
    input.unlockedTiers,
    input.lickTongueCount,
    statAllocationsJson,
    derivedStatsJson,
    equippedWearablesJson,
    allocationHistoryJson,
    input.lastSyncedAt ?? null,
    input.rebirthCount ?? null,
  ];

  const result: QueryResult<PlayerProgressionRow> = await pool.query(
    query,
    params
  );
  return mapRow(result.rows[0]);
}

export interface UpdateProgressionDelta {
  level?: number;
  totalXp?: number;
  unspentPoints?: number;
  rebirthCount?: number;
  unlockedTiers?: string[];
  lickTongueCount?: number;
  statAllocations?: unknown;
  derivedStats?: unknown;
  equippedWearables?: unknown;
  allocationHistory?: unknown;
  lastSyncedAt?: string | null;
}

export async function updateProgression(
  playerId: string,
  patch: UpdateProgressionDelta
) {
  const pool = getPgPool();
  const fields: string[] = [];
  const values: unknown[] = [];

  const pushField = (column: string, value: unknown, cast?: string) => {
    const placeholderIndex = values.length + 2;
    const castSuffix = cast ? `::${cast}` : '';
    fields.push(`${column} = $${placeholderIndex}${castSuffix}`);
    values.push(value);
  };

  if (patch.level !== undefined) pushField('level', patch.level);
  if (patch.totalXp !== undefined) pushField('total_xp', patch.totalXp);
  if (patch.unspentPoints !== undefined)
    pushField('unspent_points', patch.unspentPoints);
  if (patch.rebirthCount !== undefined)
    pushField('rebirth_count', patch.rebirthCount);
  if (patch.unlockedTiers !== undefined)
    pushField('unlocked_tiers', patch.unlockedTiers);
  if (patch.lickTongueCount !== undefined)
    pushField('lick_tongue_count', patch.lickTongueCount);
  if (patch.statAllocations !== undefined)
    pushField(
      'stat_allocations',
      serializeJson(patch.statAllocations, {}),
      'jsonb'
    );
  if (patch.derivedStats !== undefined)
    pushField('derived_stats', serializeJson(patch.derivedStats, {}), 'jsonb');
  if (patch.equippedWearables !== undefined)
    pushField(
      'equipped_wearables',
      serializeJson(
        Array.isArray(patch.equippedWearables)
          ? patch.equippedWearables
          : (patch.equippedWearables ?? []),
        []
      ),
      'jsonb'
    );
  if (patch.allocationHistory !== undefined)
    pushField(
      'allocation_history',
      serializeJson(
        Array.isArray(patch.allocationHistory)
          ? patch.allocationHistory
          : (patch.allocationHistory ?? []),
        []
      ),
      'jsonb'
    );
  if (patch.lastSyncedAt !== undefined)
    pushField('last_synced_at', patch.lastSyncedAt);

  if (fields.length === 0) {
    return getProgression(playerId);
  }

  const query = `
    update players
       set ${fields.join(', ')},
           updated_at = now()
     where id = $1
     returning
       id as player_id,
       level,
       total_xp,
       unspent_points,
       rebirth_count,
       unlocked_tiers,
       lick_tongue_count,
       stat_allocations,
       derived_stats,
       equipped_wearables,
       allocation_history,
       last_synced_at,
       updated_at
  `;

  const result = await pool.query<PlayerProgressionRow>(query, [
    playerId,
    ...values,
  ]);
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}
