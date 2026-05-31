import type { QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { AuthSessionRecord, AuthSessionRow } from '../types';

function mapAuthSessionRow(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    walletAddress: row.wallet_address,
    nonce: row.nonce,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    ip: row.ip,
    valid: row.valid,
  };
}

export interface CreateAuthSessionInput {
  playerId: string | null;
  walletAddress: string;
  nonce: string;
  expiresAt?: Date;
  userAgent?: string | null;
  ip?: string | null;
}

export async function createAuthSession(input: CreateAuthSessionInput) {
  const pool = getPgPool();
  const query = `
    insert into auth_sessions (player_id, wallet_address, nonce, expires_at, user_agent, ip)
    values ($1, $2, $3, $4, $5, $6)
    returning *
  `;

  const result: QueryResult<AuthSessionRow> = await pool.query(query, [
    input.playerId,
    input.walletAddress.trim().toLowerCase(),
    input.nonce,
    input.expiresAt ? input.expiresAt.toISOString() : null,
    input.userAgent ?? null,
    input.ip ?? null,
  ]);

  return mapAuthSessionRow(result.rows[0]);
}

export async function getAuthSessionById(id: string) {
  const pool = getPgPool();
  const result = await pool.query<AuthSessionRow>(
    'select * from auth_sessions where id = $1 limit 1',
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapAuthSessionRow(result.rows[0]);
}

export async function getValidAuthSessionById(id: string) {
  const pool = getPgPool();
  const result = await pool.query<AuthSessionRow>(
    `select *
       from auth_sessions
      where id = $1
        and valid = true
        and (expires_at is null or expires_at > now())
      limit 1`,
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapAuthSessionRow(result.rows[0]);
}

export async function invalidateAuthSession(id: string) {
  const pool = getPgPool();
  const result = await pool.query<AuthSessionRow>(
    `update auth_sessions
        set valid = false
      where id = $1
      returning *`,
    [id]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapAuthSessionRow(result.rows[0]);
}

export async function invalidateSessionsForPlayer(playerId: string) {
  const pool = getPgPool();
  await pool.query(
    'update auth_sessions set valid = false where player_id = $1',
    [playerId]
  );
}

export async function hasAnySessionForPlayer(playerId: string) {
  const pool = getPgPool();
  const result = await pool.query(
    'select 1 from auth_sessions where player_id = $1 limit 1',
    [playerId]
  );
  return result.rows.length > 0;
}
