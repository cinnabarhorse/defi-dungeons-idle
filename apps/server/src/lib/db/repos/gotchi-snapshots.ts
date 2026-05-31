import { getPgPool } from '../client';
import type {
  DailyGotchiOwnershipSnapshotRecord,
  DailyGotchiOwnershipSnapshotRow,
} from '../types';

function mapRow(
  row: DailyGotchiOwnershipSnapshotRow
): DailyGotchiOwnershipSnapshotRecord {
  const rawBlock =
    typeof row.block_number === 'string'
      ? Number(row.block_number)
      : row.block_number;
  return {
    snapshotDate: row.snapshot_date,
    blockNumber: Number.isFinite(rawBlock) ? rawBlock : 0,
    capturedAt: row.captured_at,
  };
}

export async function getByDate(snapshotDate: string) {
  const pool = getPgPool();
  const result = await pool.query<DailyGotchiOwnershipSnapshotRow>(
    `select snapshot_date, block_number, captured_at
       from public.daily_gotchi_ownership_snapshots
      where snapshot_date = $1::date
      limit 1`,
    [snapshotDate]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getLatestOnOrBeforeDate(snapshotDate: string) {
  const pool = getPgPool();
  const result = await pool.query<DailyGotchiOwnershipSnapshotRow>(
    `select snapshot_date, block_number, captured_at
       from public.daily_gotchi_ownership_snapshots
      where snapshot_date <= $1::date
      order by snapshot_date desc
      limit 1`,
    [snapshotDate]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function upsertForDate(snapshotDate: string, blockNumber: number) {
  const pool = getPgPool();
  const result = await pool.query<DailyGotchiOwnershipSnapshotRow>(
    `with inserted as (
       insert into public.daily_gotchi_ownership_snapshots (
         snapshot_date,
         block_number,
         captured_at
       ) values ($1::date, $2::bigint, now())
       on conflict (snapshot_date) do nothing
       returning snapshot_date, block_number, captured_at
     )
     select snapshot_date, block_number, captured_at from inserted
     union all
     select snapshot_date, block_number, captured_at
       from public.daily_gotchi_ownership_snapshots
      where snapshot_date = $1::date
        and not exists (select 1 from inserted)
     limit 1`,
    [snapshotDate, Math.floor(blockNumber)]
  );

  return mapRow(result.rows[0]);
}
