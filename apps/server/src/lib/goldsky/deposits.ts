import { getGoldskyDepositsPool } from './client';
import { getPgPool } from '../db/client';
import { decodeEventLog } from 'viem';
import { GAMEPOINTS_ABI } from '../topup/abi';

export interface DepositRow {
  // Common raw_logs fields; actual schema depends on Goldsky dataset sink
  block_number: number;
  log_index: number;
  transaction_hash: string;
  address: string;
  data: string;
  topics: unknown;
  block_timestamp?: string | Date;
  // Allow additional columns without strict typing
  [key: string]: unknown;
}

export interface DecodedDeposit {
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  user: string;
  depositId: string;
  depositToken: string;
  depositAmountRaw: string;
  depositAmount: number;
  yieldAmountRaw: string;
  pointsMintedRaw: string;
  pointsMinted: number;
  unlockAt?: string;
}

export type SupabaseDepositStatus =
  | 'pending'
  | 'confirmed'
  | 'credited'
  | 'failed'
  | 'not_found';

export interface DecodedDepositWithStatus extends DecodedDeposit {
  supabaseStatus: SupabaseDepositStatus;
  supabaseTxStatus?: string | null;
}

const TOKEN_DECIMALS: Record<string, number> = {
  // Base USDC
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,
  // Base GHO
  '0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee': 18,
  // Base GHST
  '0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb': 18,
};

function toTopicsArray(topics: unknown): string[] {
  if (!topics) return [];
  if (Array.isArray(topics)) {
    return (topics as unknown[]).map((t) => String(t));
  }
  if (typeof topics === 'string') {
    const trimmed = topics.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((t) => String(t));
        }
      } catch {
        // fallthrough to comma-split
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function formatAmount(
  raw: bigint,
  tokenAddress: string
): { raw: string; num: number } {
  const decimals = TOKEN_DECIMALS[tokenAddress.toLowerCase()] ?? 18;
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  // Simple numeric conversion for display; safe for moderate sizes
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const num = Number(`${whole.toString()}${fracStr ? '.' + fracStr : ''}`);
  return { raw: raw.toString(), num };
}

export function decodeDepositEvent(row: DepositRow): DecodedDeposit | null {
  const topicsArr = toTopicsArray(row.topics);
  if (topicsArr.length < 3 || !row.data) return null;
  try {
    const decoded = decodeEventLog({
      // Casts are safe here because data/topics are 0x-prefixed hex strings from Goldsky
      abi: GAMEPOINTS_ABI as any,
      data: String(row.data) as `0x${string}`,
      topics: topicsArr as any,
    });
    const evt = decoded as any;
    if (evt.eventName !== 'Deposited') return null;
    const args = evt.args as {
      user: string;
      depositId: bigint;
      depositToken: string;
      depositAmount: bigint;
      yieldAmount: bigint;
      pointsMinted: bigint;
      unlockAt: bigint;
    };
    const amount = formatAmount(args.depositAmount, args.depositToken);
    const points = formatAmount(args.pointsMinted, args.depositToken);
    const unlockTs =
      args.unlockAt && args.unlockAt > 0n
        ? new Date(Number(args.unlockAt) * 1000).toISOString()
        : undefined;
    return {
      blockNumber: Number(row.block_number),
      logIndex: Number(row.log_index),
      transactionHash: String(row.transaction_hash),
      user: args.user,
      depositId: args.depositId.toString(),
      depositToken: args.depositToken,
      depositAmountRaw: amount.raw,
      depositAmount: amount.num,
      yieldAmountRaw: args.yieldAmount.toString(),
      pointsMintedRaw: points.raw,
      pointsMinted: points.num,
      unlockAt: unlockTs,
    };
  } catch {
    return null;
  }
}

export async function fetchRecentDeposits(limit = 100): Promise<DepositRow[]> {
  const pool = getGoldskyDepositsPool();
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : 100;
  const { rows } = await pool.query<DepositRow>(
    `select * from public.deposits
       order by block_number desc, log_index desc
       limit $1`,
    [effectiveLimit]
  );
  return rows;
}

export async function fetchDecodedRecentDeposits(
  limit = 100
): Promise<DecodedDeposit[]> {
  const rows = await fetchRecentDeposits(limit);
  const decoded = rows
    .map((r) => decodeDepositEvent(r))
    .filter((x): x is DecodedDeposit => x !== null);
  return decoded;
}

export async function fetchDecodedRecentDepositsWithStatus(
  limit = 100
): Promise<DecodedDepositWithStatus[]> {
  const decoded = await fetchDecodedRecentDeposits(limit);
  if (decoded.length === 0) return [];
  const hashes = decoded
    .map((d) => d.transactionHash?.toLowerCase())
    .filter((h): h is string => Boolean(h));
  const pool = getPgPool();
  const { rows } = await pool.query<{
    tx_hash_lower: string | null;
    tx_status: string | null;
    points_minted: string | null;
  }>(
    `select lower(coalesce(tx_hash, '')) as tx_hash_lower,
            tx_status,
            points_minted
         from public.deposits
         where lower(coalesce(tx_hash, '')) = any($1)`,
    [hashes]
  );
  const byHash = new Map<
    string,
    { tx_status: string | null; points_minted: string | null }
  >();
  for (const r of rows) {
    if (!r.tx_hash_lower) continue;
    byHash.set(r.tx_hash_lower, {
      tx_status: r.tx_status,
      points_minted: r.points_minted,
    });
  }
  return decoded.map((d) => {
    const rec = byHash.get(d.transactionHash.toLowerCase());
    let supabaseStatus: SupabaseDepositStatus = 'not_found';
    let supabaseTxStatus: string | null | undefined = undefined;
    if (rec) {
      supabaseTxStatus = rec.tx_status;
      const txStatus = (rec.tx_status || '').toLowerCase();
      const pointsMintedStr = (rec.points_minted || '').trim();
      const credited =
        txStatus === 'credited' ||
        (pointsMintedStr !== '' && pointsMintedStr !== '0');
      if (credited) {
        supabaseStatus = 'credited';
      } else if (txStatus === 'confirmed') {
        supabaseStatus = 'confirmed';
      } else if (txStatus === 'failed') {
        supabaseStatus = 'failed';
      } else {
        supabaseStatus = 'pending';
      }
    }
    return {
      ...d,
      supabaseStatus,
      supabaseTxStatus,
    };
  });
}

export async function fetchGoldskyRowByTxHash(
  txHash: string
): Promise<DepositRow | null> {
  const pool = getGoldskyDepositsPool();
  const { rows } = await pool.query<DepositRow>(
    `select *
       from public.deposits
      where lower(transaction_hash) = lower($1)
      order by block_number desc, log_index desc
      limit 1`,
    [txHash]
  );
  return rows[0] ?? null;
}

export async function fetchDepositsSinceBlock(
  blockNumberExclusive: number,
  limit = 1000
): Promise<DepositRow[]> {
  const pool = getGoldskyDepositsPool();
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : 1000;
  const fromBlock =
    Number.isFinite(blockNumberExclusive) && blockNumberExclusive > 0
      ? blockNumberExclusive
      : 0;
  const { rows } = await pool.query<DepositRow>(
    `select * from public.deposits
       where block_number > $1
       order by block_number asc, log_index asc
       limit $2`,
    [fromBlock, effectiveLimit]
  );
  return rows;
}

export async function fetchDepositsSinceTimestamp(
  isoTimestampExclusive: string,
  limit = 1000
): Promise<DepositRow[]> {
  const pool = getGoldskyDepositsPool();
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : 1000;
  // Some sinks name this column 'block_timestamp' (timestamptz)
  const { rows } = await pool.query<DepositRow>(
    `select * from public.deposits
       where block_timestamp > $1
       order by block_timestamp asc, log_index asc
       limit $2`,
    [isoTimestampExclusive, effectiveLimit]
  );
  return rows;
}
