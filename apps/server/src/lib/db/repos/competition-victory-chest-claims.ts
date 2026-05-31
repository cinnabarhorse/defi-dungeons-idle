import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';

export interface CompetitionVictoryChestClaimRow {
  game_id: string;
  account_id: string;
  competition_date: string;
  reward_type: string;
  reward_payload: unknown;
  opened_at: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitionVictoryChestClaimRecord {
  gameId: string;
  accountId: string;
  competitionDate: string;
  rewardType: string;
  rewardPayload: Record<string, unknown>;
  openedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetByGameAndPlayerInput {
  gameId: string;
  accountId: string;
  client?: PoolClient;
}

export interface InsertClaimInput {
  gameId: string;
  accountId: string;
  competitionDate: string;
  rewardType: string;
  rewardPayload: Record<string, unknown>;
  client?: PoolClient;
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

function mapRow(
  row: CompetitionVictoryChestClaimRow
): CompetitionVictoryChestClaimRecord {
  return {
    gameId: row.game_id,
    accountId: row.account_id,
    competitionDate: row.competition_date,
    rewardType: row.reward_type,
    rewardPayload:
      row.reward_payload && typeof row.reward_payload === 'object'
        ? (row.reward_payload as Record<string, unknown>)
        : {},
    openedAt: row.opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getByGameAndPlayer(
  input: GetByGameAndPlayerInput
): Promise<CompetitionVictoryChestClaimRecord | null> {
  const pool = getPool(input.client);
  const result: QueryResult<CompetitionVictoryChestClaimRow> = await pool.query(
    `select *
       from competition_victory_chest_claims
      where game_id = $1
        and account_id = $2`,
    [input.gameId, input.accountId]
  );
  if (result.rows.length === 0) return null;
  return mapRow(result.rows[0]);
}

export async function insertClaim(
  input: InsertClaimInput
): Promise<CompetitionVictoryChestClaimRecord> {
  const pool = getPool(input.client);
  const payloadJson = JSON.stringify(input.rewardPayload ?? {});
  const result: QueryResult<CompetitionVictoryChestClaimRow> = await pool.query(
    `insert into competition_victory_chest_claims (
       game_id,
       account_id,
       competition_date,
       reward_type,
       reward_payload
     )
     values ($1, $2, $3, $4, $5::jsonb)
     returning *`,
    [
      input.gameId,
      input.accountId,
      input.competitionDate,
      input.rewardType,
      payloadJson,
    ]
  );
  return mapRow(result.rows[0]);
}

