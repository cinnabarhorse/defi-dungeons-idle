import type { TokenWithdrawal } from '../../../types/withdrawals';

const THIRDWEB_TX_UPDATED_AT_KEY = 'thirdwebTransactionUpdatedAt';

type AttemptTimestampWithdrawal = Pick<
  TokenWithdrawal,
  | 'status'
  | 'withdrawalSendingAt'
  | 'withdrawalPendingAt'
  | 'updatedAt'
  | 'metadata'
>;

function toDateMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function pickTimestamp(
  values: Array<string | null | undefined>,
  strategy: 'earliest' | 'latest'
): string | null {
  let chosen: { iso: string; ms: number } | null = null;

  for (const value of values) {
    const ms = toDateMs(value);
    if (ms == null || !value) {
      continue;
    }

    if (!chosen) {
      chosen = { iso: value, ms };
      continue;
    }

    if (strategy === 'earliest' ? ms < chosen.ms : ms > chosen.ms) {
      chosen = { iso: value, ms };
    }
  }

  return chosen?.iso ?? null;
}

function getQueuedAtFromMetadata(
  metadata: TokenWithdrawal['metadata'] | null | undefined
): string | null {
  const value = metadata?.[THIRDWEB_TX_UPDATED_AT_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function getInitialTxSubmittedAt(
  withdrawal: AttemptTimestampWithdrawal
): string | null {
  return pickTimestamp(
    [
      withdrawal.withdrawalSendingAt,
      getQueuedAtFromMetadata(withdrawal.metadata),
      withdrawal.withdrawalPendingAt,
    ],
    'earliest'
  );
}

export function getLastAttemptAt(
  withdrawal: AttemptTimestampWithdrawal
): string | null {
  const candidates = [
    withdrawal.withdrawalSendingAt,
    getQueuedAtFromMetadata(withdrawal.metadata),
    withdrawal.withdrawalPendingAt,
  ];

  if (
    withdrawal.status === 'withdrawal_failed' ||
    withdrawal.status === 'withdrawal_sending'
  ) {
    candidates.push(withdrawal.updatedAt);
  }

  return pickTimestamp(candidates, 'latest');
}
