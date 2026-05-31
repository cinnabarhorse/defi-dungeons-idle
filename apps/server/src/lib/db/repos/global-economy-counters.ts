import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';
import type {
  GlobalEconomyCounterRecord,
  GlobalEconomyCounterRow,
} from '../types';

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapRow(row: GlobalEconomyCounterRow): GlobalEconomyCounterRecord {
  return {
    counterName: row.counter_name,
    bucketDate: row.bucket_date,
    amount: toNumber(row.amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

export async function getCounter(
  counterName: string,
  bucketDate: string,
  client?: PoolClient
) {
  const pool = getPool(client);
  const result = await pool.query<GlobalEconomyCounterRow>(
    `
      select *
        from global_economy_counters
       where counter_name = $1
         and bucket_date = $2
    `,
    [counterName, bucketDate]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getCounterForUpdate(
  counterName: string,
  bucketDate: string,
  client: PoolClient
) {
  const pool = getPool(client);
  await pool.query(
    `
      insert into global_economy_counters (
        counter_name,
        bucket_date,
        amount
      ) values ($1,$2,0)
      on conflict (counter_name, bucket_date) do nothing
    `,
    [counterName, bucketDate]
  );
  const result = await pool.query<GlobalEconomyCounterRow>(
    `
      select *
        from global_economy_counters
       where counter_name = $1
         and bucket_date = $2
       for update
    `,
    [counterName, bucketDate]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function incrementCounter(
  counterName: string,
  bucketDate: string,
  amount: number,
  client: PoolClient
) {
  const pool = getPool(client);
  const result: QueryResult<GlobalEconomyCounterRow> = await pool.query(
    `
      update global_economy_counters
         set amount = amount + $3
       where counter_name = $1
         and bucket_date = $2
       returning *
    `,
    [counterName, bucketDate, Math.floor(amount)]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}
