import type { QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { ApiKeyRecord, ApiKeyRow } from '../types';

function toSafeCounter(value: string | number | bigint): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  if (numeric > Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.floor(numeric);
}

function mapApiKeyRow(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.name,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    authSuccessCount: toSafeCounter(row.auth_success_count),
    roomJoinCount: toSafeCounter(row.room_join_count),
    lastUsedAt: row.last_used_at,
    lastUsedIp: row.last_used_ip,
    lastUsedUserAgent: row.last_used_user_agent,
  };
}

export interface CreateApiKeyInput {
  playerId: string;
  name?: string | null;
  keyHash: string;
  keyPrefix: string;
}

export async function createApiKey(input: CreateApiKeyInput) {
  const pool = getPgPool();
  const result: QueryResult<ApiKeyRow> = await pool.query(
    `insert into api_keys (player_id, name, key_hash, key_prefix)
     values ($1, $2, $3, $4)
     returning *`,
    [
      input.playerId,
      input.name?.trim() ? input.name.trim() : null,
      input.keyHash,
      input.keyPrefix,
    ]
  );
  return mapApiKeyRow(result.rows[0]);
}

export async function listApiKeysByPlayer(playerId: string, limit = 100) {
  const pool = getPgPool();
  const normalizedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const result: QueryResult<ApiKeyRow> = await pool.query(
    `select *
       from api_keys
      where player_id = $1
      order by created_at desc
      limit $2`,
    [playerId, normalizedLimit]
  );
  return result.rows.map(mapApiKeyRow);
}

export async function getActiveApiKeyCount(playerId: string): Promise<number> {
  const pool = getPgPool();
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from api_keys
      where player_id = $1
        and revoked_at is null`,
    [playerId]
  );
  return toSafeCounter(result.rows[0]?.count ?? '0');
}

export async function revokeApiKey(
  id: string,
  playerId: string,
  reason: string
): Promise<ApiKeyRecord | null> {
  const pool = getPgPool();
  const result: QueryResult<ApiKeyRow> = await pool.query(
    `update api_keys
        set revoked_at = now(),
            revoked_reason = $3
      where id = $1
        and player_id = $2
        and revoked_at is null
      returning *`,
    [id, playerId, reason]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapApiKeyRow(result.rows[0]);
}

export async function getActiveApiKeyByHash(
  keyHash: string
): Promise<ApiKeyRecord | null> {
  const pool = getPgPool();
  const result: QueryResult<ApiKeyRow> = await pool.query(
    `select *
       from api_keys
      where key_hash = $1
        and revoked_at is null
      limit 1`,
    [keyHash]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapApiKeyRow(result.rows[0]);
}

export interface RecordApiKeyAuthSuccessInput {
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAuthSuccess(
  id: string,
  input: RecordApiKeyAuthSuccessInput = {}
): Promise<ApiKeyRecord | null> {
  const pool = getPgPool();
  const ip =
    typeof input.ip === 'string' && input.ip.trim().length > 0
      ? input.ip.trim().slice(0, 128)
      : null;
  const userAgent =
    typeof input.userAgent === 'string' && input.userAgent.trim().length > 0
      ? input.userAgent.trim().slice(0, 512)
      : null;

  const result: QueryResult<ApiKeyRow> = await pool.query(
    `update api_keys
        set auth_success_count = auth_success_count + 1,
            last_used_at = now(),
            last_used_ip = $2,
            last_used_user_agent = $3
      where id = $1
        and revoked_at is null
      returning *`,
    [id, ip, userAgent]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapApiKeyRow(result.rows[0]);
}

export async function incrementRoomJoinCount(
  id: string
): Promise<ApiKeyRecord | null> {
  const pool = getPgPool();
  const result: QueryResult<ApiKeyRow> = await pool.query(
    `update api_keys
        set room_join_count = room_join_count + 1
      where id = $1
        and revoked_at is null
      returning *`,
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapApiKeyRow(result.rows[0]);
}
