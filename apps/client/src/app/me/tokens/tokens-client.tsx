'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Button } from '../../../components/ui/Button';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import type {
  TokenWithdrawal,
  TokenWithdrawalStatus,
} from '../../../types/withdrawals';

type TokensFilter = 'AVAILABLE' | 'COMPLETED' | 'ALL';

interface TokensClientProps {
  initialWithdrawals: TokenWithdrawal[];
  minWithdrawalAmount: number;
  minWithdrawalAmountByCurrency: Record<string, number>;
}

const STATUS_LABELS: Record<TokenWithdrawalStatus, string> = {
  received: 'Available',
  withdrawal_waiting: 'Awaiting Approval',
  withdrawal_approved: 'Approved / Queued',
  withdrawal_sending: 'Sending',
  withdrawal_pending: 'Pending Onchain',
  withdrawal_confirmed: 'Completed',
  withdrawal_failed: 'Failed',
  withdrawal_rejected: 'Rejected',
};

const STATUS_STYLES: Record<TokenWithdrawalStatus, string> = {
  received: 'bg-white/10 text-white',
  withdrawal_waiting: 'bg-yellow-500/20 text-yellow-200',
  withdrawal_approved: 'bg-indigo-500/20 text-indigo-100',
  withdrawal_sending: 'bg-indigo-400/20 text-indigo-50',
  withdrawal_pending: 'bg-blue-500/20 text-blue-200',
  withdrawal_confirmed: 'bg-emerald-500/20 text-emerald-200',
  withdrawal_failed: 'bg-red-500/20 text-red-200',
  withdrawal_rejected: 'bg-red-600/20 text-red-300',
};

function formatAmount(amount: string): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return amount;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(numeric);
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatSource(source: string): string {
  if (!source) return 'Unknown';
  const normalized = source.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getExplorerUrl(
  chainId: number | null,
  txHash: string | null
): string | null {
  if (!txHash) return null;
  if (chainId === 8453) {
    return `https://basescan.org/tx/${txHash}`;
  }
  return `https://basescan.org/tx/${txHash}`;
}

const DEFAULT_MIN_AMOUNTS: Record<string, number> = {
  USDC: 0.1,
  GHST: 0.1,
};

function mergeMinAmountMap(
  current: Record<string, number>,
  incoming: Record<string, unknown> | null | undefined,
  fallback: number
): Record<string, number> {
  if (!incoming || typeof incoming !== 'object') {
    return current;
  }

  let changed = false;
  const next: Record<string, number> = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key !== 'string') continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const upper = key.toUpperCase();
    if (next[upper] !== numeric) {
      next[upper] = numeric;
      changed = true;
    }
  }

  if (!changed) {
    return next;
  }

  if (fallback > 0 && (!next.USDC || next.USDC <= 0)) {
    next.USDC = fallback;
  }

  for (const [key, value] of Object.entries(DEFAULT_MIN_AMOUNTS)) {
    if (!next[key] || next[key] <= 0) {
      next[key] = value;
    }
  }

  return next;
}

function formatThresholdSummary(map: Record<string, number>): string {
  const entries = Object.entries(map).filter(([, amount]) =>
    Number.isFinite(amount)
  );
  if (!entries.length) {
    return '—';
  }
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${currency} ≥ ${amount.toFixed(2)}`)
    .join(', ');
}

function getCurrencyKey(currency: string | null | undefined): string {
  if (!currency) return 'USDC';
  const trimmed = currency.trim();
  return trimmed.length ? trimmed.toUpperCase() : 'USDC';
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USDC: 6,
  GHST: 18,
};

function getCurrencyDecimals(currencyKey: string): number {
  return CURRENCY_DECIMALS[currencyKey] ?? 6;
}

function tryParseBaseUnits(value: string | null | undefined): bigint | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

function parseDecimalToBaseUnits(value: string, decimals: number): bigint {
  const precision = Math.max(0, Math.min(decimals, 18));
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('-')) return 0n;
  if (trimmed.includes('e') || trimmed.includes('E')) return 0n;

  const [wholeRaw, fractionRaw = ''] = trimmed.split('.');
  const wholeDigits = wholeRaw.replace(/[^\d]/g, '');
  const fractionDigits = fractionRaw.replace(/[^\d]/g, '');
  const whole = wholeDigits.length ? wholeDigits : '0';
  const paddedFraction = (fractionDigits + '0'.repeat(precision)).slice(
    0,
    precision
  );
  const combined = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '');
  if (!combined) return 0n;
  try {
    return BigInt(combined);
  } catch {
    return 0n;
  }
}

function parseMinRequiredBaseUnits(
  currencyKey: string,
  minAmountsByCurrency: Record<string, number>,
  minAmount: number
): bigint {
  const minRequired = minAmountsByCurrency[currencyKey] ?? minAmount;
  if (!Number.isFinite(minRequired) || minRequired <= 0) return 0n;
  return parseDecimalToBaseUnits(
    minRequired.toString(),
    getCurrencyDecimals(currencyKey)
  );
}

export default function TokensClient({
  initialWithdrawals,
  minWithdrawalAmount,
  minWithdrawalAmountByCurrency,
}: TokensClientProps) {
  const [withdrawals, setWithdrawals] =
    useState<TokenWithdrawal[]>(initialWithdrawals);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [minAmount, setMinAmount] = useState<number>(minWithdrawalAmount);
  const [minAmountsByCurrency, setMinAmountsByCurrency] = useState<
    Record<string, number>
  >({
    ...DEFAULT_MIN_AMOUNTS,
    ...minWithdrawalAmountByCurrency,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [withdrawingBatch, setWithdrawingBatch] = useState(false);
  const [filter, setFilter] = useState<TokensFilter>('AVAILABLE');

  // Disable page scrolling while the blocking overlay is shown
  useEffect(() => {
    if (!withdrawingBatch) return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [withdrawingBatch]);

  const aggregateByCurrencyBaseUnits = useMemo(() => {
    const totals: Record<string, bigint> = {};
    for (const w of withdrawals) {
      if (w.status !== 'received') continue;
      const val = tryParseBaseUnits(w.amountBaseUnits);
      if (val === null) continue;
      const key = getCurrencyKey(w.currency);
      totals[key] = (totals[key] ?? 0n) + val;
    }
    return totals;
  }, [withdrawals]);

  const hasWithdrawable = useMemo(() => {
    return Object.entries(aggregateByCurrencyBaseUnits).some(
      ([currency, total]) => {
        const minBaseUnits = parseMinRequiredBaseUnits(
          currency,
          minAmountsByCurrency,
          minAmount
        );
        return total >= minBaseUnits;
      }
    );
  }, [aggregateByCurrencyBaseUnits, minAmountsByCurrency, minAmount]);

  const thresholdSummary = useMemo(
    () => formatThresholdSummary(minAmountsByCurrency),
    [minAmountsByCurrency]
  );

  const filteredWithdrawals = useMemo(() => {
    switch (filter) {
      case 'AVAILABLE':
        return withdrawals.filter((w) => w.status === 'received');
      case 'COMPLETED':
        return withdrawals.filter((w) => w.status === 'withdrawal_confirmed');
      case 'ALL':
      default:
        return withdrawals;
    }
  }, [withdrawals, filter]);

  const selectableWithdrawals = useMemo(() => {
    return filteredWithdrawals.filter((withdrawal) => {
      if (withdrawal.status !== 'received') {
        return false;
      }
      const baseUnits = tryParseBaseUnits(withdrawal.amountBaseUnits);
      if (baseUnits === null) {
        return false;
      }

      const currencyKey = getCurrencyKey(withdrawal.currency);
      const minBaseUnits = parseMinRequiredBaseUnits(
        currencyKey,
        minAmountsByCurrency,
        minAmount
      );

      // Selectable if individual OR aggregate meets threshold
      if (baseUnits >= minBaseUnits) return true;
      const aggregate = aggregateByCurrencyBaseUnits[currencyKey] ?? 0n;
      return aggregate >= minBaseUnits;
    });
  }, [
    filteredWithdrawals,
    minAmountsByCurrency,
    minAmount,
    aggregateByCurrencyBaseUnits,
  ]);

  const selectableIdSet = useMemo(
    () => new Set(selectableWithdrawals.map((w) => w.id)),
    [selectableWithdrawals]
  );

  const allSelected = useMemo(
    () =>
      selectableWithdrawals.length > 0 &&
      selectableWithdrawals.every((w) => selectedIds.has(w.id)),
    [selectableWithdrawals, selectedIds]
  );

  const selectedCount = useMemo(
    () =>
      selectableWithdrawals.reduce(
        (count, w) => count + (selectedIds.has(w.id) ? 1 : 0),
        0
      ),
    [selectableWithdrawals, selectedIds]
  );

  const selectedMeetsThreshold = useMemo(() => {
    if (selectedCount === 0) return false;
    const totals: Record<string, bigint> = {};
    for (const w of selectableWithdrawals) {
      if (!selectedIds.has(w.id)) continue;
      const val = tryParseBaseUnits(w.amountBaseUnits);
      if (val === null) continue;
      const key = getCurrencyKey(w.currency);
      totals[key] = (totals[key] ?? 0n) + val;
    }
    if (Object.keys(totals).length === 0) return false;

    return Object.entries(totals).every(([currency, total]) => {
      const minBaseUnits = parseMinRequiredBaseUnits(
        currency,
        minAmountsByCurrency,
        minAmount
      );
      return total >= minBaseUnits;
    });
  }, [
    selectableWithdrawals,
    selectedIds,
    selectedCount,
    minAmountsByCurrency,
    minAmount,
  ]);

  function toggleSelectOne(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll(): void {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        for (const w of selectableWithdrawals) {
          next.delete(w.id);
        }
        return next;
      }
      const next = new Set(prev);
      for (const w of selectableWithdrawals) {
        next.add(w.id);
      }
      return next;
    });
  }

  const handleWithdraw = async (tokenId: string) => {
    if (!tokenId || pendingId) return;
    setPendingId(tokenId);
    setError(null);
    setSuccess(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(`${baseUrl}/api/tokens/withdraw/${tokenId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await res.json().catch(() => null)) as {
        withdrawal?: TokenWithdrawal;
        error?: string;
        minWithdrawalAmount?: number;
        minWithdrawalAmountByCurrency?: Record<string, unknown>;
      } | null;

      if (typeof payload?.minWithdrawalAmount === 'number') {
        setMinAmount(payload.minWithdrawalAmount);
      }

      if (
        payload?.minWithdrawalAmountByCurrency &&
        typeof payload.minWithdrawalAmountByCurrency === 'object'
      ) {
        const nextMin =
          typeof payload.minWithdrawalAmount === 'number'
            ? payload.minWithdrawalAmount
            : minAmount;
        setMinAmountsByCurrency((prev) =>
          mergeMinAmountMap(
            prev,
            payload.minWithdrawalAmountByCurrency,
            nextMin
          )
        );
      }

      if (!res.ok || !payload?.withdrawal) {
        const message =
          payload?.error ||
          'Failed to request withdrawal. Please try again later.';
        setError(message);
        return;
      }

      setWithdrawals((prev) =>
        prev.map((item) =>
          item.id === tokenId ? (payload.withdrawal as TokenWithdrawal) : item
        )
      );
      setSuccess('Withdrawal requested. Waiting for admin approval.');
    } catch (err) {
      setError('Failed to request withdrawal. Please try again.');
    } finally {
      setPendingId(null);
    }
  };

  async function handleWithdrawSelected(): Promise<void> {
    if (withdrawingBatch) return;
    if (selectedIds.size === 0) return;
    setWithdrawingBatch(true);
    setError(null);
    setSuccess(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const ids = selectableWithdrawals
        .filter((w) => selectedIds.has(w.id))
        .map((w) => w.id);

      const res = await fetch(`${baseUrl}/api/tokens/withdraw-batch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        withdrawals?: TokenWithdrawal[];
        successCount?: number;
        failCount?: number;
        error?: string;
        minWithdrawalAmount?: number;
        minWithdrawalAmountByCurrency?: Record<string, unknown>;
      } | null;

      if (typeof payload?.minWithdrawalAmount === 'number') {
        setMinAmount(payload.minWithdrawalAmount);
      }
      if (
        payload?.minWithdrawalAmountByCurrency &&
        typeof payload.minWithdrawalAmountByCurrency === 'object'
      ) {
        const nextMin =
          typeof payload.minWithdrawalAmount === 'number'
            ? payload.minWithdrawalAmount
            : minAmount;
        setMinAmountsByCurrency((prev) =>
          mergeMinAmountMap(
            prev,
            payload.minWithdrawalAmountByCurrency as Record<string, unknown>,
            nextMin
          )
        );
      }

      if (!res.ok || !payload?.withdrawals) {
        const message =
          payload?.error || 'Failed to request selected withdrawals.';
        setError(message);
        return;
      }

      const updatedMap = new Map(
        payload.withdrawals.map((w) => [w.id, w])
      );
      setWithdrawals((prev) =>
        prev.map((item) => updatedMap.get(item.id) ?? item)
      );
      setSelectedIds(new Set());

      const sc = payload.successCount ?? payload.withdrawals.length;
      const fc = payload.failCount ?? 0;
      if (sc > 0 && fc === 0) {
        setSuccess(
          `Requested ${sc} ${sc === 1 ? 'withdrawal' : 'withdrawals'}.`
        );
      } else if (sc > 0) {
        setError(`Requested ${sc}, failed ${fc}.`);
      } else {
        setError('Failed to request selected withdrawals.');
      }
    } catch {
      setError('Failed to request withdrawals. Please try again.');
    } finally {
      setWithdrawingBatch(false);
    }
  }

  if (withdrawals.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
        <h2 className="text-lg font-semibold text-white">
          No token rewards yet
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Defeat bosses and open treasure chests to earn on-chain tokens such as
          USDC and GHST. Rewards will appear here and can be withdrawn once each
          currency&apos;s minimum threshold is met.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}

      {!hasWithdrawable ? (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          No withdrawals are currently available. Minimum withdrawals per
          currency: {thresholdSummary}.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-white/70">
          Show{' '}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as TokensFilter)}
            className="ml-2 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
          >
            <option value="AVAILABLE">Available</option>
            <option value="COMPLETED">Completed</option>
            <option value="ALL">All</option>
          </select>
        </label>

        {selectableWithdrawals.length > 0 ? (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer"
                checked={allSelected && selectableWithdrawals.length > 0}
                onChange={toggleSelectAll}
                disabled={withdrawingBatch}
                aria-label="Select all available"
              />
              Select all available
            </label>
            <Button
              onClick={() => void handleWithdrawSelected()}
              disabled={withdrawingBatch || selectedCount === 0 || !selectedMeetsThreshold}
              size="sm"
            >
              {withdrawingBatch
                ? 'Withdrawing…'
                : `Withdraw Selected${
                    selectedCount > 0 ? ` (${selectedCount})` : ''
                  }`}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {filteredWithdrawals.map((withdrawal) => {
          const statusLabel = STATUS_LABELS[withdrawal.status] ?? 'Unknown';
          const statusClass = STATUS_STYLES[withdrawal.status] ?? 'bg-white/10';
          const explorerUrl = getExplorerUrl(
            withdrawal.chainId,
            withdrawal.txHash
          );
          const currencyKey = getCurrencyKey(withdrawal.currency);
          const baseUnits = tryParseBaseUnits(withdrawal.amountBaseUnits);
          const minBaseUnits = parseMinRequiredBaseUnits(
            currencyKey,
            minAmountsByCurrency,
            minAmount
          );
          const meetsMinimum = baseUnits !== null && baseUnits >= minBaseUnits;
          const canRequest = withdrawal.status === 'received' && meetsMinimum;
          const isSelectable = selectableIdSet.has(withdrawal.id);
          return (
            <div
              key={withdrawal.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  {isSelectable ? (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 cursor-pointer"
                      checked={selectedIds.has(withdrawal.id)}
                      onChange={() => toggleSelectOne(withdrawal.id)}
                      disabled={withdrawingBatch}
                      aria-label="Select withdrawal"
                    />
                  ) : null}
                  <div>
                    <div className="text-xl font-semibold text-white">
                      {formatAmount(withdrawal.amount)} {withdrawal.currency}
                    </div>
                    <div className="text-xs text-white/60">
                      Source: {formatSource(withdrawal.source)}
                    </div>
                    <div className="text-xs text-white/40">
                      Earned: {formatDate(withdrawal.receivedAt)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-3 py-1 text-xs font-medium tracking-wide',
                      statusClass
                    )}
                  >
                    {statusLabel}
                  </span>
                  {withdrawal.status === 'received' ? (
                    <Button
                      onClick={() => handleWithdraw(withdrawal.id)}
                      disabled={pendingId === withdrawal.id || !canRequest}
                      size="sm"
                    >
                      {pendingId === withdrawal.id ? 'Requesting…' : 'Withdraw'}
                    </Button>
                  ) : null}
                  {!meetsMinimum && withdrawal.status === 'received' ? (
                    <p className="text-xs text-yellow-200">
                      Below minimum — select multiple to withdraw together
                    </p>
                  ) : null}
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-xs text-white/60 md:grid-cols-2">
                {withdrawal.withdrawalRequestedAt ? (
                  <div>
                    <dt className="uppercase tracking-wide text-white/40">
                      Requested
                    </dt>
                    <dd>{formatDate(withdrawal.withdrawalRequestedAt)}</dd>
                  </div>
                ) : null}
                {withdrawal.withdrawalPendingAt ? (
                  <div>
                    <dt className="uppercase tracking-wide text-white/40">
                      Pending Onchain
                    </dt>
                    <dd>{formatDate(withdrawal.withdrawalPendingAt)}</dd>
                  </div>
                ) : null}
                {withdrawal.withdrawalConfirmedAt ? (
                  <div>
                    <dt className="uppercase tracking-wide text-white/40">
                      Confirmed
                    </dt>
                    <dd>{formatDate(withdrawal.withdrawalConfirmedAt)}</dd>
                  </div>
                ) : null}
                {withdrawal.failureReason ? (
                  <div className="md:col-span-2">
                    <dt className="uppercase tracking-wide text-white/40">
                      Failure Reason
                    </dt>
                    <dd className="text-red-200">{withdrawal.failureReason}</dd>
                  </div>
                ) : null}
              </dl>

              {explorerUrl ? (
                <div className="mt-4 text-xs">
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/70 hover:text-white underline-offset-4 hover:underline"
                  >
                    View transaction on Basescan
                  </a>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {withdrawingBatch && typeof window !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[999999] w-screen h-screen bg-black/70 overscroll-none"
              role="dialog"
              aria-modal="true"
              aria-live="assertive"
              aria-busy="true"
            >
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="rounded-xl border border-white/20 bg-slate-900 px-6 py-4 text-white shadow-xl">
                  <p className="text-sm">Working, do not close the page</p>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
