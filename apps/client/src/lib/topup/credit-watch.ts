import type { DepositApiRecord } from '../../types/topup';

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 2 * 60_000;

interface WaitForDepositCreditParams {
  txHash: string;
  fetchDeposits: (signal?: AbortSignal) => Promise<DepositApiRecord[]>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function normalizeTxHash(value: string): string {
  return value.trim().toLowerCase();
}

function findDepositsByTxHash(
  deposits: DepositApiRecord[],
  txHash: string
): DepositApiRecord[] {
  const normalized = normalizeTxHash(txHash);
  const matches: DepositApiRecord[] = [];
  for (const deposit of deposits) {
    if (!deposit.txHash) continue;
    if (normalizeTxHash(deposit.txHash) === normalized) {
      matches.push(deposit);
    }
  }
  return matches;
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error('Aborted'));
    };

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForDepositCredit({
  txHash,
  fetchDeposits,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
}: WaitForDepositCreditParams): Promise<boolean> {
  const normalizedHash = normalizeTxHash(txHash);
  if (!normalizedHash) return false;

  const deadline = Date.now() + Math.max(1000, timeoutMs);
  const pollInterval = Math.max(500, pollIntervalMs);

  while (Date.now() <= deadline) {
    if (signal?.aborted) {
      return false;
    }

    try {
      const deposits = await fetchDeposits(signal);
      const matching = findDepositsByTxHash(deposits, normalizedHash);
      const statuses = matching.map((deposit) =>
        String(deposit.txStatus ?? '').toLowerCase()
      );

      if (statuses.includes('credited')) {
        return true;
      }

      if (statuses.length > 0 && statuses.every((s) => s === 'failed')) {
        return false;
      }
    } catch {
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return false;
    }

    try {
      await wait(Math.min(pollInterval, remaining), signal);
    } catch {
      return false;
    }
  }

  return false;
}
