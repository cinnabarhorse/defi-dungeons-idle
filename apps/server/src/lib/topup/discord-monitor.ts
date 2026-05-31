import { depositsRepo } from '../db';
import {
  claimDepositDiscordNotification,
  getGlobalStakedUnlockBalances,
  releaseDepositDiscordNotificationClaim,
} from '../db/repos/deposits';
import { getBaseLogger } from '../logging';
import { notifyUsdcTopupFromDeposit } from './discord';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_INITIAL_OFFSET_MS = 0;
const MAX_BATCH_SIZE = 200;

const logger = getBaseLogger().child({ module: 'usdc_topup_discord_monitor' });

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let monitorRunning = false;
let lastCheckedIso = new Date().toISOString();
let isPolling = false;

function coalesceTimestamp(record: { updatedAt: string | null; createdAt: string | null }): string {
  return record.updatedAt || record.createdAt || new Date().toISOString();
}

function notificationKeyForDeposit(record: {
  id: string;
  txHash: string | null;
}): string {
  const normalizedHash = record.txHash?.trim().toLowerCase() ?? '';
  if (/^0x[0-9a-f]{64}$/.test(normalizedHash)) {
    return `tx:${normalizedHash}`;
  }
  return `id:${record.id}`;
}

async function pollOnce(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  try {
    const deposits = await depositsRepo.listRecentCreditedUsdcDeposits(
      lastCheckedIso,
      MAX_BATCH_SIZE
    );
    if (deposits.length === 0) return;
    const groupedDeposits = new Map<string, { primary: (typeof deposits)[number] }>();
    let latestIso = lastCheckedIso;
    for (const deposit of deposits) {
      const key = notificationKeyForDeposit({
        id: deposit.id,
        txHash: deposit.txHash,
      });
      const existing = groupedDeposits.get(key);
      if (existing) {
        existing.primary = deposit;
      } else {
        groupedDeposits.set(key, {
          primary: deposit,
        });
      }
      const ts = coalesceTimestamp(deposit);
      if (new Date(ts).getTime() > new Date(latestIso).getTime()) {
        latestIso = ts;
      }
    }

    let stakedBalances;
    try {
      stakedBalances = await getGlobalStakedUnlockBalances();
    } catch (error) {
      logger.warn(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'usdc_topup_discord_global_stake_failed'
      );
    }

    for (const group of groupedDeposits.values()) {
      const deposit = group.primary;
      let claimResult:
        | {
            claimedIds: string[];
            shouldNotify: boolean;
          }
        | undefined;
      try {
        claimResult = await claimDepositDiscordNotification({
          depositId: deposit.id,
          txHash: deposit.txHash,
        });
        if (!claimResult.shouldNotify) {
          continue;
        }

        await notifyUsdcTopupFromDeposit({
          userId: deposit.userId,
          depositorAddress: deposit.depositorAddress,
          amount: deposit.amount,
          tokenSymbol: deposit.tokenSymbol,
          stakedBalances,
        });
      } catch (error) {
        if (claimResult?.claimedIds?.length) {
          try {
            await releaseDepositDiscordNotificationClaim(claimResult.claimedIds);
          } catch (releaseError) {
            logger.error(
              {
                err:
                  releaseError instanceof Error
                    ? releaseError.message
                    : String(releaseError),
                depositId: deposit.id,
                txHash: deposit.txHash,
              },
              'usdc_topup_discord_claim_release_failed'
            );
          }
        }
        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            depositId: deposit.id,
            txHash: deposit.txHash,
          },
          'usdc_topup_discord_send_failed'
        );
      }
    }
    lastCheckedIso = latestIso;
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? error.message : String(error),
      },
      'usdc_topup_discord_poll_failed'
    );
  } finally {
    isPolling = false;
  }
}

export async function pollUsdcTopupDiscordMonitorOnce(): Promise<void> {
  await pollOnce();
}

export function startUsdcTopupDiscordMonitor(options?: {
  intervalMs?: number;
  initialOffsetMs?: number;
}): void {
  if (monitorTimer) return;
  const envInterval = Number(process.env.USDC_TOPUP_DISCORD_POLL_INTERVAL_MS);
  const intervalMs =
    options?.intervalMs ??
    (Number.isFinite(envInterval) && envInterval > 0
      ? envInterval
      : DEFAULT_POLL_INTERVAL_MS);
  const initialOffsetMs =
    options?.initialOffsetMs ?? DEFAULT_INITIAL_OFFSET_MS;

  lastCheckedIso = new Date(Date.now() - initialOffsetMs).toISOString();
  monitorTimer = setInterval(() => {
    void pollOnce();
  }, intervalMs);
  monitorRunning = true;
  void pollOnce();
  logger.info(
    { intervalMs, initialOffsetMs },
    'usdc_topup_discord_monitor_started'
  );
}

export function isUsdcTopupDiscordMonitorRunning(): boolean {
  return monitorRunning;
}

export function resetUsdcTopupDiscordMonitorForTests(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  monitorRunning = false;
  lastCheckedIso = new Date().toISOString();
  isPolling = false;
}
