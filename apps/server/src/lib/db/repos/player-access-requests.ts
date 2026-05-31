import { getPgPool } from '../client';
import type {
  PlayerAccessRequestRecord,
  PlayerAccessRequestRow,
} from '../types';

function mapRow(row: PlayerAccessRequestRow): PlayerAccessRequestRecord {
  const normalizedStatus = String(row.status || 'pending').toLowerCase();
  const status =
    normalizedStatus === 'approved' || normalizedStatus === 'rejected'
      ? (normalizedStatus as 'approved' | 'rejected')
      : 'pending';

  return {
    id: row.id,
    playerId: row.player_id,
    walletAddress: row.wallet_address,
    email: row.email,
    status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getByWallet(walletAddress: string) {
  const pool = getPgPool();
  const result = await pool.query<PlayerAccessRequestRow>(
    `select *
       from player_access_requests
      where wallet_address = $1
      limit 1`,
    [walletAddress.trim().toLowerCase()]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

interface UpsertRequestInput {
  walletAddress: string;
  email: string;
  playerId?: string | null;
  notes?: string | null;
}

export async function upsertRequest(input: UpsertRequestInput) {
  const pool = getPgPool();
  const normalizedWallet = input.walletAddress.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();
  const result = await pool.query<PlayerAccessRequestRow>(
    `insert into player_access_requests (wallet_address, email, player_id, notes)
     values ($1, $2, $3, $4)
     on conflict (wallet_address) do update
       set email = excluded.email,
           player_id = coalesce(excluded.player_id, player_access_requests.player_id),
           notes = excluded.notes,
           status = 'pending',
           updated_at = now()
     returning *`,
    [normalizedWallet, normalizedEmail, input.playerId ?? null, input.notes ?? null]
  );
  return mapRow(result.rows[0]);
}

interface UpdateStatusInput {
  walletAddress: string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string | null;
  playerId?: string | null;
}

export async function updateStatus(input: UpdateStatusInput) {
  const pool = getPgPool();
  const normalizedWallet = input.walletAddress.trim().toLowerCase();
  const result = await pool.query<PlayerAccessRequestRow>(
    `update player_access_requests
        set status = $2,
            notes = coalesce($3, notes),
            player_id = coalesce($4, player_id),
            updated_at = now()
      where wallet_address = $1
      returning *`,
    [normalizedWallet, input.status, input.notes ?? null, input.playerId ?? null]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}
