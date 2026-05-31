import { ethers } from 'ethers';
import { BASE_CHAIN_ID } from '../topup/config';
import {
  tokenWithdrawalsRepo,
  playersRepo,
  withdrawalSettingsRepo,
  type TokenWithdrawalRecord,
} from '../db';
import { getBaseLogger, emitServerLog } from '../logging';
import {
  getPendingTimeoutMs,
  WITHDRAWAL_CONFIRMATION_INTERVAL_MS,
} from './config';
import {
  notifyWithdrawalFailure,
  notifyWithdrawalSuccess,
} from './discord';

const DEFAULT_BASE_RPC_URL =
  process.env.BASE_RPC_URL || 'https://mainnet.base.org';

const providerCache = new Map<number, ethers.JsonRpcProvider>();
const logger = getBaseLogger().child({ module: 'withdrawal_tx_monitor' });

function getProviderForChain(chainId: number): ethers.JsonRpcProvider {
  const normalized = Math.trunc(chainId);
  if (normalized !== BASE_CHAIN_ID) {
    // For now we only support Base; extend if multi-chain is needed.
    throw new Error(`Unsupported chain id for monitor: ${normalized}`);
  }
  let provider = providerCache.get(normalized);
  if (!provider) {
    provider = new ethers.JsonRpcProvider(DEFAULT_BASE_RPC_URL);
    providerCache.set(normalized, provider);
  }
  return provider;
}

async function notifyFailureWithWallet(
  withdrawal: TokenWithdrawalRecord,
  failureReason: string,
  txHash?: string | null
): Promise<void> {
  try {
    const player = await playersRepo.getPlayerById(withdrawal.playerId);
    const wallet = player?.walletAddress ?? null;
    await notifyWithdrawalFailure({
      withdrawal,
      failureReason,
      txHash,
      toWallet: wallet,
    });
  } catch {
    // Swallow notification errors; do not impact status updates
  }
}

function hasTimedOut(
  withdrawal: TokenWithdrawalRecord,
  nowMs: number
): boolean {
  const pendingAt = withdrawal.withdrawalPendingAt;
  if (!pendingAt) return false;
  const timestamp = Date.parse(pendingAt);
  if (Number.isNaN(timestamp)) return false;
  const timeoutMs = getPendingTimeoutMs(withdrawal.chainId);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return false;
  }
  return nowMs - timestamp >= timeoutMs;
}

export async function checkPendingWithdrawals(): Promise<void> {
  const settings = await withdrawalSettingsRepo.getSettings().catch((error) => {
    logger.error(
      {
        msg: 'withdrawal_settings_fetch_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'withdrawal_settings_fetch_failed'
    );
    return null;
  });

  if (settings?.isConfirmationPaused) {
    return;
  }

  const pending =
    await tokenWithdrawalsRepo.getTokenWithdrawalsByStatus(
      'withdrawal_pending'
    );

  const nowMs = Date.now();

  for (const withdrawal of pending) {
    const txHash = withdrawal.txHash;
    if (!txHash) {
      if (hasTimedOut(withdrawal, nowMs)) {
        const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
          id: withdrawal.id,
          status: 'withdrawal_failed',
          onlyIfCurrentStatus: 'withdrawal_pending',
          failureReason: 'pending_timeout_24h',
        });
        emitServerLog('withdrawal.pending_timeout', {
          details: {
            withdrawalId: withdrawal.id,
            reason: 'missing_tx_hash',
          },
        });
        if (updated) {
          await notifyFailureWithWallet(updated, 'pending_timeout_24h');
        }
      }
      continue;
    }

    const chainId = withdrawal.chainId ?? BASE_CHAIN_ID;
    let receipt: ethers.TransactionReceipt | null = null;
    try {
      const provider = getProviderForChain(chainId);
      receipt = await provider.getTransactionReceipt(txHash);
    } catch {
      // Provider error - skip this iteration
      continue;
    }

    if (!receipt) {
      if (hasTimedOut(withdrawal, nowMs)) {
        const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
          id: withdrawal.id,
          status: 'withdrawal_failed',
          onlyIfCurrentStatus: 'withdrawal_pending',
          txHash,
          failureReason: 'pending_timeout_24h',
        });
        emitServerLog('withdrawal.pending_timeout', {
          details: {
            withdrawalId: withdrawal.id,
            txHash,
            reason: 'pending_timeout_24h',
          },
        });
        if (updated) {
          await notifyFailureWithWallet(updated, 'pending_timeout_24h', txHash);
        }
      }
      continue;
    }

    if (receipt.status === 1) {
      // Confirmed success
      const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_confirmed',
        onlyIfCurrentStatus: 'withdrawal_pending',
        txHash,
      });
      if (updated) {
        try {
          const player = await playersRepo.getPlayerById(updated.playerId);
          const wallet = player?.walletAddress ?? 'unknown';
          await notifyWithdrawalSuccess({
            withdrawal: updated,
            toWallet: wallet,
            txHash,
          });
        } catch {
          // Ignore notification errors
        }
      }
    } else {
      // Failed / reverted
      const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_failed',
        onlyIfCurrentStatus: 'withdrawal_pending',
        txHash,
        failureReason: 'Transaction reverted',
      });
      emitServerLog('withdrawal.tx_failed', {
        details: {
          withdrawalId: withdrawal.id,
          reason: 'Transaction reverted',
        },
      });
      if (updated) {
        await notifyFailureWithWallet(updated, 'Transaction reverted', txHash);
      }
    }
  }
}

let monitorStarted = false;
let monitorTimer: ReturnType<typeof setInterval> | null = null;

export function startWithdrawalTxMonitor(
  intervalMs = WITHDRAWAL_CONFIRMATION_INTERVAL_MS
): void {
  if (monitorStarted) return;
  monitorStarted = true;
  monitorTimer = setInterval(() => {
    void checkPendingWithdrawals();
  }, intervalMs);
}

export function stopWithdrawalTxMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    monitorStarted = false;
  }
}
