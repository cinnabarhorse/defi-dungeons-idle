import { gql, request } from 'graphql-request';
import type { DepositRecord, DepositStatus } from '../db/types';
import { depositsRepo } from '../db';
import { SUPPORTED_TOKEN_ADDRESSES } from './config';

interface SubgraphWithdrawal {
  id: string;
  txHash: string; // withdrawal tx hash
  deposit: {
    txHash: string; // original deposit tx hash
  };
}

export interface SubgraphDeposit {
  id: string; // "0xaddress-depositId"
  depositId: string; // BigInt as string
  token: string; // token address (bytes)
  amount: string; // BigInt as string (wei)
  yieldAmount: string;
  pointsMinted: string;
  unlockAt: string; // BigInt timestamp (seconds)
  withdrawn: boolean;
  withdrawalTx: string | null;
  timestamp: string; // created timestamp (seconds)
  txHash: string;
}

interface SubgraphUserTokenStakeBalance {
  token: string;
  stakedAmount: string;
}

interface SubgraphUserStakeBalance {
  tokenBalances: SubgraphUserTokenStakeBalance[];
}

export interface SubgraphStakedTokenBalances {
  usdc: number;
  gho: number;
  ghst: number;
  total: number;
}

// Known token addresses on Base
const GAMEPOINTS_CONTRACT = '0xb27fa55e15be89e69b9e5babcfb30a8f67ad92a0';

const DEFAULT_DEPOSITS_SUBGRAPH_ENDPOINT =
  'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/dd-deposits-subgraph/prod/gn';

function getDepositsSubgraphEndpoint(): string | null {
  const fromEnv =
    process.env.SUBGRAPH_DEPOSITS ?? process.env.SUBGRAPH_DEPOSITS_BASE ?? '';
  const trimmedEnv = fromEnv.trim();
  if (trimmedEnv.length > 0) {
    return trimmedEnv;
  }

  const fallback = DEFAULT_DEPOSITS_SUBGRAPH_ENDPOINT.trim();
  if (!fallback) {
    return null;
  }

  return fallback;
}

function parseTokenAmountFromBaseUnits(
  amountRaw: string,
  decimals: number
): number {
  try {
    const raw = BigInt(amountRaw);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = raw / divisor;
    const fractional = raw % divisor;
    const fractionalStr = fractional
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '');
    const formatted = `${whole.toString()}${fractionalStr ? '.' + fractionalStr : ''}`;
    const parsed = Number.parseFloat(formatted);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function fetchStakedBalancesFromSubgraph(
  userAddress: string
): Promise<SubgraphStakedTokenBalances | null> {
  const endpoint = getDepositsSubgraphEndpoint();
  if (!endpoint) return null;

  const normalizedAddress = userAddress.trim().toLowerCase();
  if (!normalizedAddress || !/^0x[0-9a-f]{40}$/.test(normalizedAddress)) {
    return null;
  }

  const query = gql`
    query StakedBalancesByUser($user: ID!) {
      user(id: $user) {
        tokenBalances(first: 20) {
          token
          stakedAmount
        }
      }
    }
  `;

  try {
    const result = await request<{ user: SubgraphUserStakeBalance | null }>(
      endpoint,
      query,
      { user: normalizedAddress }
    );

    const balances = { usdc: 0, gho: 0, ghst: 0, total: 0 };
    const tokenBalances = result.user?.tokenBalances ?? [];

    for (const row of tokenBalances) {
      const tokenAddress = row.token?.toLowerCase();
      const tokenMeta = SUPPORTED_TOKEN_ADDRESSES[tokenAddress ?? ''];
      if (!tokenMeta) continue;
      const amount = parseTokenAmountFromBaseUnits(
        row.stakedAmount,
        tokenMeta.decimals
      );
      if (amount <= 0) continue;

      if (tokenMeta.symbol === 'USDC') balances.usdc += amount;
      if (tokenMeta.symbol === 'GHO') balances.gho += amount;
      if (tokenMeta.symbol === 'GHST') balances.ghst += amount;
    }

    balances.total = balances.usdc + balances.gho;
    return balances;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'staked_balances_subgraph_fetch_error',
        endpoint,
        userAddress: normalizedAddress,
        error:
          error instanceof Error ? error.message : 'Unknown subgraph error',
      })
    );
    return null;
  }
}

async function fetchSubgraphWithdrawalsByDepositTxHashes(
  depositTxHashes: string[]
): Promise<SubgraphWithdrawal[]> {
  const endpoint = getDepositsSubgraphEndpoint();
  if (!endpoint) return [];

  const hashes = Array.from(
    new Set(
      depositTxHashes
        .map((h) => h?.trim().toLowerCase())
        .filter((h): h is string => Boolean(h) && /^0x[0-9a-f]{64}$/.test(h))
    )
  );

  if (hashes.length === 0) return [];

  const query = gql`
    query WithdrawalsByDepositTx($hashes: [Bytes!]!) {
      withdrawals(where: { deposit_: { txHash_in: $hashes } }) {
        id
        txHash
        deposit {
          txHash
        }
      }
    }
  `;

  try {
    const result = await request<{ withdrawals: SubgraphWithdrawal[] }>(
      endpoint,
      query,
      {
        hashes,
      }
    );

    return result.withdrawals ?? [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'deposits_subgraph_withdrawals_fetch_error',
        endpoint,
        error:
          error instanceof Error ? error.message : 'Unknown subgraph error',
      })
    );
    return [];
  }
}

export async function syncWithdrawnDepositsFromSubgraph(
  deposits: DepositRecord[]
): Promise<string[]> {
  if (!deposits.length) return [];

  const txHashes = deposits
    .map((d) => d.txHash)
    .filter((h): h is string => Boolean(h));

  if (!txHashes.length) return [];

  const subgraphWithdrawals =
    await fetchSubgraphWithdrawalsByDepositTxHashes(txHashes);

  if (!subgraphWithdrawals.length) return [];

  // Map depositTxHash -> withdrawalTxHash
  const byDepositTx = new Map<string, string>();
  for (const w of subgraphWithdrawals) {
    const depositTx = w.deposit?.txHash?.toLowerCase();
    const withdrawalTx = w.txHash?.toLowerCase();
    if (!depositTx || !withdrawalTx) continue;
    byDepositTx.set(depositTx, withdrawalTx);
  }

  const updatedIds: string[] = [];

  for (const deposit of deposits) {
    if (!deposit.txHash) continue;
    const key = deposit.txHash.toLowerCase();
    const withdrawalTx = byDepositTx.get(key);
    if (!withdrawalTx) continue;
    if (deposit.withdrawn && deposit.withdrawalTx) continue;

    try {
      await depositsRepo.updateDeposit({
        id: deposit.id,
        withdrawn: true,
        withdrawalTx,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'sync_withdrawn_update_failed',
          id: deposit.id,
          txHash: deposit.txHash,
          error:
            error instanceof Error ? error.message : 'Unknown update error',
        })
      );
      continue;
    }

    updatedIds.push(deposit.id);
  }

  return updatedIds;
}

/**
 * Fetch all deposits for a user address from the subgraph.
 * Returns deposits ordered by timestamp descending.
 */
export async function fetchDepositsFromSubgraph(
  userAddress: string
): Promise<SubgraphDeposit[]> {
  const endpoint = getDepositsSubgraphEndpoint();
  if (!endpoint) return [];

  const normalizedAddress = userAddress.trim().toLowerCase();
  if (!normalizedAddress || !/^0x[0-9a-f]{40}$/.test(normalizedAddress)) {
    return [];
  }

  const query = gql`
    query DepositsByUser($user: ID!) {
      deposits(
        where: { user: $user }
        orderBy: timestamp
        orderDirection: desc
        first: 200
      ) {
        id
        depositId
        token
        amount
        yieldAmount
        pointsMinted
        unlockAt
        withdrawn
        withdrawalTx
        timestamp
        txHash
      }
    }
  `;

  try {
    const result = await request<{ deposits: SubgraphDeposit[] }>(
      endpoint,
      query,
      { user: normalizedAddress }
    );

    return result.deposits ?? [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'deposits_subgraph_fetch_error',
        endpoint,
        userAddress: normalizedAddress,
        error:
          error instanceof Error ? error.message : 'Unknown subgraph error',
      })
    );
    return [];
  }
}

/**
 * Convert a subgraph deposit to a DepositRecord format.
 * This allows subgraph-only deposits to be displayed in the UI.
 */
function subgraphDepositToRecord(
  sg: SubgraphDeposit,
  depositorAddress: string
): DepositRecord {
  const tokenAddress = sg.token.toLowerCase();
  const tokenMeta = SUPPORTED_TOKEN_ADDRESSES[tokenAddress];
  const decimals = tokenMeta?.decimals ?? 18;
  const tokenSymbol = tokenMeta?.symbol ?? 'UNKNOWN';

  // Convert wei to human-readable amount
  const amountBigInt = BigInt(sg.amount);
  const divisor = BigInt(10 ** decimals);
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const amount = `${wholePart}.${fractionalStr}`.replace(/\.?0+$/, '') || '0';

  // Convert timestamp (seconds) to ISO string
  const unlockAtMs = Number(sg.unlockAt) * 1000;
  const timestampMs = Number(sg.timestamp) * 1000;

  return {
    id: `subgraph-${sg.id}`,
    userId: null,
    chainId: 8453, // Base
    contractAddress: GAMEPOINTS_CONTRACT,
    depositorAddress: depositorAddress.toLowerCase(),
    tokenAddress,
    tokenSymbol,
    amount,
    amountWei: sg.amount,
    txHash: sg.txHash.toLowerCase(),
    txStatus: 'credited' as DepositStatus, // On subgraph = confirmed on-chain
    depositId: sg.depositId,
    yieldAmount: sg.yieldAmount,
    pointsMinted: sg.pointsMinted,
    unlockAt: new Date(unlockAtMs).toISOString(),
    autoRenew: false,
    expiresAt: null,
    createdAt: new Date(timestampMs).toISOString(),
    updatedAt: null,
    discordNotifiedAt: null,
    withdrawn: sg.withdrawn,
    withdrawalTx: sg.withdrawalTx,
  };
}

/**
 * Merge database deposits with subgraph deposits.
 * - DB deposits are primary
 * - Subgraph supplements missing fields on existing DB deposits
 * - Subgraph adds deposits that are on-chain but missing from DB
 *
 * This ensures users can see and claim deposits even if DB records are broken.
 */
export function mergeDepositsWithSubgraph(
  dbDeposits: DepositRecord[],
  subgraphDeposits: SubgraphDeposit[],
  depositorAddress: string
): DepositRecord[] {
  if (subgraphDeposits.length === 0) {
    return dbDeposits;
  }

  // Index DB deposits by txHash for quick lookup
  const dbByTxHash = new Map<string, DepositRecord>();
  for (const d of dbDeposits) {
    if (d.txHash) {
      dbByTxHash.set(d.txHash.toLowerCase(), d);
    }
  }

  // Track which subgraph deposits are new (not in DB)
  const newDeposits: DepositRecord[] = [];

  for (const sg of subgraphDeposits) {
    const txHash = sg.txHash.toLowerCase();
    const existing = dbByTxHash.get(txHash);

    if (existing) {
      // DB has this deposit - supplement missing/broken fields from subgraph
      // These are the critical fields needed for withdrawal
      if (!existing.depositId) {
        existing.depositId = sg.depositId;
      }
      if (!existing.pointsMinted) {
        existing.pointsMinted = sg.pointsMinted;
      }
      if (!existing.yieldAmount) {
        existing.yieldAmount = sg.yieldAmount;
      }
      if (!existing.unlockAt) {
        existing.unlockAt = new Date(Number(sg.unlockAt) * 1000).toISOString();
      }
      // Always trust subgraph for withdrawal status (it's on-chain truth)
      existing.withdrawn = sg.withdrawn;
      if (sg.withdrawalTx) {
        existing.withdrawalTx = sg.withdrawalTx;
      }
      // If DB says pending but it's on subgraph, it's confirmed
      if (
        existing.txStatus === 'pending' ||
        existing.txStatus === 'confirmed'
      ) {
        existing.txStatus = 'credited';
      }
    } else {
      // Deposit exists on-chain but NOT in DB - add it
      newDeposits.push(subgraphDepositToRecord(sg, depositorAddress));
    }
  }

  // Combine: DB deposits (now supplemented) + new subgraph-only deposits
  // Sort by createdAt descending
  const merged = [...dbDeposits, ...newDeposits];
  merged.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return merged;
}
