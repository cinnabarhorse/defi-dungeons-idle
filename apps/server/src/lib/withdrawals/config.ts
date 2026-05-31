import { BASE_CHAIN_ID } from '../topup/config';

const DEFAULT_MAX_PER_RUN = 100;
const DEFAULT_PENDING_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_SENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5m
const DEFAULT_PROCESS_INTERVAL_MS = 60_000;
const DEFAULT_CONFIRMATION_INTERVAL_MS = 60_000;

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export const MAX_WITHDRAWALS_PER_RUN = parseNumber(
  process.env.MAX_WITHDRAWALS_PER_RUN,
  DEFAULT_MAX_PER_RUN
);

export const WITHDRAWAL_SENDING_TIMEOUT_MS = parseNumber(
  process.env.WITHDRAWAL_SENDING_TIMEOUT_MS,
  DEFAULT_SENDING_TIMEOUT_MS
);

export const WITHDRAWAL_PROCESS_INTERVAL_MS = parseNumber(
  process.env.WITHDRAWAL_PROCESS_INTERVAL_MS,
  DEFAULT_PROCESS_INTERVAL_MS
);

export const WITHDRAWAL_CONFIRMATION_INTERVAL_MS = parseNumber(
  process.env.WITHDRAWAL_CONFIRMATION_INTERVAL_MS,
  DEFAULT_CONFIRMATION_INTERVAL_MS
);

export const PENDING_TIMEOUTS_BY_CHAIN: Record<number, number> = {
  [BASE_CHAIN_ID]: parseNumber(
    process.env.WITHDRAWAL_PENDING_TIMEOUT_MS,
    DEFAULT_PENDING_TIMEOUT_MS
  ),
};

export function getPendingTimeoutMs(chainId?: number | null): number {
  if (chainId == null || !Number.isFinite(chainId)) {
    return PENDING_TIMEOUTS_BY_CHAIN[BASE_CHAIN_ID];
  }
  const normalized = Math.trunc(chainId);
  return (
    PENDING_TIMEOUTS_BY_CHAIN[normalized] ??
    PENDING_TIMEOUTS_BY_CHAIN[BASE_CHAIN_ID] ??
    DEFAULT_PENDING_TIMEOUT_MS
  );
}
