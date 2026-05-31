import type { Pool, PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type { WithdrawalSettingsRecord, WithdrawalSettingsRow } from '../types';

const SETTINGS_ROW_ID = 1;

function mapRow(row: WithdrawalSettingsRow): WithdrawalSettingsRecord {
  return {
    id: row.id,
    isAutoProcessingEnabled: Boolean(row.is_auto_processing_enabled),
    isBatchProcessingPaused: Boolean(row.is_batch_processing_paused),
    isConfirmationPaused: Boolean(row.is_confirmation_paused),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: Pool | PoolClient) {
  return client ?? getPgPool();
}

async function ensureRow(pool: Pool | PoolClient): Promise<void> {
  await pool.query(
    `insert into public.withdrawal_settings (id)
     values ($1)
     on conflict (id) do nothing`,
    [SETTINGS_ROW_ID]
  );
}

export async function getSettings(
  client?: Pool | PoolClient
): Promise<WithdrawalSettingsRecord> {
  const pool = getPool(client);
  await ensureRow(pool);
  const result: QueryResult<WithdrawalSettingsRow> = await pool.query(
    `select *
       from public.withdrawal_settings
      where id = $1
      limit 1`,
    [SETTINGS_ROW_ID]
  );
  if (result.rows.length === 0) {
    throw new Error('Failed to load withdrawal settings');
  }
  return mapRow(result.rows[0]);
}

export interface UpdateWithdrawalSettingsInput {
  isAutoProcessingEnabled?: boolean;
  isBatchProcessingPaused?: boolean;
  isConfirmationPaused?: boolean;
  client?: PoolClient;
}

export async function updateSettings(
  input: UpdateWithdrawalSettingsInput
): Promise<WithdrawalSettingsRecord> {
  const pool = getPool(input.client);
  await ensureRow(pool);
  const updates: string[] = [];
  const params: unknown[] = [SETTINGS_ROW_ID];

  if (input.isAutoProcessingEnabled !== undefined) {
    params.push(Boolean(input.isAutoProcessingEnabled));
    updates.push(`is_auto_processing_enabled = $${params.length}`);
  }

  if (input.isBatchProcessingPaused !== undefined) {
    params.push(Boolean(input.isBatchProcessingPaused));
    updates.push(`is_batch_processing_paused = $${params.length}`);
  }

  if (input.isConfirmationPaused !== undefined) {
    params.push(Boolean(input.isConfirmationPaused));
    updates.push(`is_confirmation_paused = $${params.length}`);
  }

  if (updates.length === 0) {
    return getSettings(pool);
  }

  updates.push('updated_at = now()');

  const result: QueryResult<WithdrawalSettingsRow> = await pool.query(
    `update public.withdrawal_settings
        set ${updates.join(', ')}
      where id = $1
      returning *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to update withdrawal settings');
  }

  return mapRow(result.rows[0]);
}
