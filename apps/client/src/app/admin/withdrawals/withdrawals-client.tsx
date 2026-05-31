'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Button } from '../../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/Dialog';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { useEnsNames } from '../../../hooks/useEnsNames';
import {
  getInitialTxSubmittedAt,
  getLastAttemptAt,
} from './withdrawal-attempt-times';
import type {
  TokenWithdrawal,
  TokenWithdrawalStatus,
  WithdrawalSettingsResponse,
} from '../../../types/withdrawals';

interface WalletBalanceItem {
  formatted: string | null;
}

interface WalletBalancesResponse {
  walletAddress: string;
  chainId: number;
  balances: {
    eth: WalletBalanceItem;
    ghst: WalletBalanceItem;
    usdc: WalletBalanceItem;
  };
}

interface AdminWithdrawalsClientProps {
  initialWithdrawals: TokenWithdrawal[];
  initialStatus: string;
  initialError: string | null;
}

const STATUS_OPTIONS: Array<{
  value: TokenWithdrawalStatus;
  label: string;
}> = [
  { value: 'withdrawal_waiting', label: 'Awaiting Approval' },
  { value: 'withdrawal_approved', label: 'Approved / Queued' },
  { value: 'withdrawal_sending', label: 'Sending' },
  { value: 'withdrawal_pending', label: 'Pending Onchain' },
  { value: 'withdrawal_confirmed', label: 'Completed' },
  { value: 'withdrawal_failed', label: 'Failed' },
  { value: 'withdrawal_rejected', label: 'Rejected' },
  { value: 'received', label: 'New (Unrequested)' },
];

const CURRENCY_FILTERS = ['ALL', 'USDC', 'GHST'] as const;
type CurrencyFilter = (typeof CURRENCY_FILTERS)[number];

const STATUS_LABELS: Record<TokenWithdrawalStatus, string> = {
  received: 'Available',
  withdrawal_waiting: 'Awaiting Approval',
  withdrawal_approved: 'Queued for Auto',
  withdrawal_sending: 'Sending',
  withdrawal_pending: 'Pending Onchain',
  withdrawal_confirmed: 'Completed',
  withdrawal_failed: 'Failed',
  withdrawal_rejected: 'Rejected',
};

const STATUS_STYLES: Record<TokenWithdrawalStatus, string> = {
  received: 'bg-slate-600/30 text-slate-200',
  withdrawal_waiting: 'bg-yellow-500/20 text-yellow-200',
  withdrawal_approved: 'bg-indigo-500/20 text-indigo-100',
  withdrawal_sending: 'bg-indigo-400/20 text-indigo-50',
  withdrawal_pending: 'bg-blue-500/20 text-blue-200',
  withdrawal_confirmed: 'bg-emerald-500/20 text-emerald-200',
  withdrawal_failed: 'bg-red-500/20 text-red-200',
  withdrawal_rejected: 'bg-red-500/20 text-red-200',
};

interface AutomationSettingsState {
  isAutoProcessingEnabled: boolean;
  isBatchProcessingPaused: boolean;
  isConfirmationPaused: boolean;
  isBatchProcessorRunning: boolean | null;
}

interface PendingSummary {
  totalsByCurrency: Record<string, number>;
  count: number;
}

function formatTotals(totalsByCurrency: Record<string, number>): string {
  const entries = Object.entries(totalsByCurrency);
  if (entries.length === 0) return '0';
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries
    .map(
      ([currency, amount]) => `${formatAmount(amount.toString())} ${currency}`
    )
    .join(', ');
}

function formatAmount(amount: string): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return amount;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(numeric);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(
  startedAt: string | null,
  endedAt: string | null
): string {
  if (!startedAt || !endedAt) return '—';
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '—';
  }
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return '—';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function formatSource(source: string): string {
  if (!source) return 'unknown';
  const normalized = source.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function shortenAddress(address: string | null | undefined): string {
  if (!address) return '—';
  const start = address.slice(0, 6);
  const end = address.slice(-4);
  return `${start}…${end}`;
}

function shortenHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  if (hash.length <= 12) {
    return hash;
  }
  return `${hash.slice(0, 10)}…${hash.slice(-4)}`;
}

function shortenGameId(gameId: string | null | undefined): string {
  if (!gameId) return '—';
  return gameId.replace(/-/g, '').slice(0, 8);
}

interface GamePlayer {
  playerId: string;
  walletAddress: string | null;
  characterId: string | null;
  characterName: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  kills: number;
  deaths: number;
  levelBefore: number | null;
  levelAfter: number | null;
}

interface GameDetails {
  id: string;
  roomId: string;
  seed: number | null;
  region: string | null;
  difficultyTier: string | null;
  status: string;
  isPrivate: boolean;
  maxPlayers: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totalEnemyKills: number;
  nextTimedSpawnAt: string | null;
  phase: string;
  phaseChangedAt: string | null;
  runStartedAt: string | null;
  lateJoinCutoffAt: string | null;
  autoCloseAt: string | null;
  startedByPlayerId: string | null;
  metadata: Record<string, unknown>;
  players?: GamePlayer[];
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

function getAddressExplorerUrl(
  chainId: number | null,
  address: string | null | undefined
): string | null {
  if (!address) return null;
  if (chainId === 8453) {
    return `https://basescan.org/address/${address}`;
  }
  return `https://basescan.org/address/${address}`;
}

function toStatus(value: string): TokenWithdrawalStatus {
  if (STATUS_OPTIONS.some((option) => option.value === value)) {
    return value as TokenWithdrawalStatus;
  }
  return 'withdrawal_waiting';
}

export default function AdminWithdrawalsClient({
  initialWithdrawals,
  initialStatus,
  initialError,
}: AdminWithdrawalsClientProps) {
  type SortKey = 'requested' | 'confirmed';
  type SortDirection = 'asc' | 'desc';
  const SORT_KEY_OPTIONS: Array<{ value: SortKey; label: string }> = [
    { value: 'requested', label: 'Requested' },
    { value: 'confirmed', label: 'Confirmed on' },
  ];
  const SORT_DIRECTION_OPTIONS: Array<{
    value: SortDirection;
    label: string;
  }> = [
    { value: 'asc', label: 'Oldest first' },
    { value: 'desc', label: 'Newest first' },
  ];

  const initialStatusValue = toStatus(initialStatus);
  const [statusFilter, setStatusFilter] = useState<TokenWithdrawalStatus>(
    initialStatusValue
  );
  const {
    data: withdrawalsData,
    error: swrError,
    isLoading: swrIsLoading,
    isValidating: swrIsValidating,
    mutate: mutateWithdrawals,
  } = useSWR<TokenWithdrawal[], Error>(
    ['admin-withdrawals', statusFilter],
    async ([, status]) => {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/admin/withdrawals?status=${encodeURIComponent(
          status as TokenWithdrawalStatus
        )}`,
        {
          credentials: 'include',
        }
      );
      const payload = (await res.json().catch(() => null)) as {
        withdrawals?: TokenWithdrawal[];
        error?: string;
      } | null;

      if (!res.ok || !payload) {
        const message =
          payload?.error || 'Failed to load withdrawals for this status.';
        throw new Error(message);
      }

      const list = Array.isArray(payload.withdrawals)
        ? payload.withdrawals
        : [];
      return list;
    },
    {
      fallbackData:
        toStatus(initialStatus) === statusFilter
          ? initialWithdrawals
          : undefined,
      revalidateOnFocus: true,
      refreshInterval: 30_000,
    }
  );
  const withdrawals = withdrawalsData ?? [];
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('ALL');
  const [error, setError] = useState<string | null>(initialError);
  const [success, setSuccess] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [viewingReasonId, setViewingReasonId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gameDetails, setGameDetails] = useState<GameDetails | null>(null);
  const [loadingGameDetails, setLoadingGameDetails] = useState(false);
  const [usernameByPlayerId, setUsernameByPlayerId] = useState<
    Record<string, string | null>
  >({});
  const [sendingTest, setSendingTest] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<PendingSummary>({
    totalsByCurrency: {},
    count: 0,
  });
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [approvingBatch, setApprovingBatch] = useState(false);
  const [walletBalances, setWalletBalances] = useState<{
    eth: string | null;
    ghst: string | null;
    usdc: string | null;
  } | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null
  );
  const [serverWalletChainId, setServerWalletChainId] = useState<number | null>(
    null
  );
  const [serverAddressCopied, setServerAddressCopied] = useState(false);
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettingsState | null>(null);
  const [loadingAutomationSettings, setLoadingAutomationSettings] =
    useState(true);
  const [updatingAutomationSettings, setUpdatingAutomationSettings] =
    useState(false);
  function getDefaultSortForStatus(status: TokenWithdrawalStatus): {
    sortKey: SortKey;
    sortDirection: SortDirection;
  } {
    if (status === 'withdrawal_confirmed') {
      return { sortKey: 'confirmed', sortDirection: 'desc' };
    }
    return { sortKey: 'requested', sortDirection: 'asc' };
  }

  const defaultSort = getDefaultSortForStatus(initialStatusValue);
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort.sortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    defaultSort.sortDirection
  );
  const MAX_BATCH_SIZE = 100;

  const loading = swrIsLoading || swrIsValidating;

  // Surface SWR data fetch errors through the existing error banner
  useEffect(() => {
    if (!swrError) return;
    setError(swrError.message || 'Failed to load withdrawals. Try refreshing.');
  }, [swrError]);

  // Keep the selected status reflected in the URL as a `status` query param
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('status', statusFilter);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // best-effort only; ignore URL update failures
    }
  }, [statusFilter]);

  const sortedWithdrawals = useMemo(() => {
    const list = [...withdrawals];

    function getSortDate(w: TokenWithdrawal, key: SortKey): number | null {
      const iso =
        key === 'requested' ? w.withdrawalRequestedAt : w.withdrawalConfirmedAt;
      if (!iso) return null;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return null;
      return date.getTime();
    }

    list.sort((a, b) => {
      const aTime = getSortDate(a, sortKey);
      const bTime = getSortDate(b, sortKey);

      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return 1;
      if (bTime === null) return -1;

      const diff = aTime - bTime;
      return sortDirection === 'asc' ? diff : -diff;
    });

    return list;
  }, [withdrawals, sortKey, sortDirection]);

  const limitedWithdrawals = useMemo(
    () => sortedWithdrawals.slice(0, 100),
    [sortedWithdrawals]
  );

  const filteredWithdrawals = useMemo(() => {
    if (currencyFilter === 'ALL') {
      return limitedWithdrawals;
    }
    return limitedWithdrawals.filter(
      (withdrawal) =>
        (withdrawal.currency || '').toUpperCase() === currencyFilter
    );
  }, [limitedWithdrawals, currencyFilter]);

  const hasData = filteredWithdrawals.length > 0;
  const statusOptions = useMemo(() => STATUS_OPTIONS, []);
  const selectableWithdrawals = useMemo(
    () => filteredWithdrawals.filter((w) => w.status === 'withdrawal_waiting'),
    [filteredWithdrawals]
  );
  const allSelectedInView = useMemo(
    () =>
      selectableWithdrawals.length > 0 &&
      selectableWithdrawals.every((w) => selectedIds.has(w.id)),
    [selectableWithdrawals, selectedIds]
  );
  const selectedCountInView = useMemo(
    () =>
      selectableWithdrawals.reduce(
        (count, w) => count + (selectedIds.has(w.id) ? 1 : 0),
        0
      ),
    [selectableWithdrawals, selectedIds]
  );

  useEffect(() => {
    const nextDefault = getDefaultSortForStatus(statusFilter);
    setSortKey(nextDefault.sortKey);
    setSortDirection(nextDefault.sortDirection);
  }, [statusFilter]);

  const fetchPendingSummary = useCallback(async () => {
    setLoadingPending(true);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/admin/withdrawals?status=${encodeURIComponent('withdrawal_waiting')}`,
        {
          credentials: 'include',
        }
      );
      const payload = (await res.json().catch(() => null)) as {
        withdrawals?: TokenWithdrawal[];
        error?: string;
      } | null;
      const list = Array.isArray(payload?.withdrawals)
        ? payload!.withdrawals!
        : [];
      const totals: Record<string, number> = {};
      for (const w of list) {
        const amount = Number(w.amount);
        if (!Number.isFinite(amount)) continue;
        const key = w.currency || '';
        totals[key] = (totals[key] ?? 0) + amount;
      }
      setPendingSummary({
        totalsByCurrency: totals,
        count: list.length,
      });
    } catch {
      setPendingSummary({ totalsByCurrency: {}, count: 0 });
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const fetchAutomationSettings = useCallback(async () => {
    setLoadingAutomationSettings(true);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(`${baseUrl}/api/admin/withdrawals/settings`, {
        credentials: 'include',
      });
      const payload = (await res.json().catch(() => null)) as
        | (WithdrawalSettingsResponse & { error?: string })
        | null;
      if (!res.ok || !payload?.settings) {
        setAutomationSettings(null);
        return;
      }
      setAutomationSettings({
        isAutoProcessingEnabled: Boolean(
          payload.settings.isAutoProcessingEnabled ?? payload.featureEnabled
        ),
        isBatchProcessingPaused: Boolean(
          payload.settings.isBatchProcessingPaused
        ),
        isConfirmationPaused: Boolean(payload.settings.isConfirmationPaused),
        isBatchProcessorRunning:
          typeof payload.runtime?.isBatchProcessorRunning === 'boolean'
            ? payload.runtime.isBatchProcessorRunning
            : null,
      });
    } catch {
      setAutomationSettings(null);
    } finally {
      setLoadingAutomationSettings(false);
    }
  }, []);

  useEffect(() => {
    void fetchPendingSummary();
  }, [fetchPendingSummary]);

  useEffect(() => {
    void fetchAutomationSettings();
  }, [fetchAutomationSettings]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, currencyFilter]);

  const fetchWalletBalances = useCallback(async () => {
    setLoadingBalances(true);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/admin/withdrawals/wallet-balances`,
        {
          credentials: 'include',
        }
      );
      const payload = (await res.json().catch(() => null)) as
        | (WalletBalancesResponse & { error?: string })
        | null;
      if (!res.ok || !payload?.balances) {
        setError(payload?.error || 'Failed to load server wallet balances.');
        setWalletBalances(null);
        setServerWalletAddress(null);
        setServerWalletChainId(null);
        return;
      }
      setWalletBalances({
        eth: payload.balances.eth?.formatted ?? null,
        ghst: payload.balances.ghst?.formatted ?? null,
        usdc: payload.balances.usdc?.formatted ?? null,
      });
      setServerWalletAddress(payload.walletAddress || null);
      setServerWalletChainId(
        typeof payload.chainId === 'number' ? payload.chainId : null
      );
    } catch {
      setError('Failed to load server wallet balances.');
      setWalletBalances(null);
      setServerWalletAddress(null);
      setServerWalletChainId(null);
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    void fetchWalletBalances();
  }, [fetchWalletBalances]);

  const handleCopyServerWallet = useCallback(async () => {
    if (!serverWalletAddress) return;
    try {
      await navigator.clipboard.writeText(serverWalletAddress);
      setServerAddressCopied(true);
      setTimeout(() => setServerAddressCopied(false), 1500);
    } catch {
      setServerAddressCopied(false);
    }
  }, [serverWalletAddress]);

  // Resolve ENS names for listed withdrawals and game details players
  const ensAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const w of withdrawals) {
      if (w.playerWalletAddress) set.add(w.playerWalletAddress);
    }
    if (gameDetails?.players) {
      for (const p of gameDetails.players) {
        if (p.walletAddress) set.add(p.walletAddress);
      }
    }
    return Array.from(set);
  }, [withdrawals, gameDetails]);

  const { ensByAddress } = useEnsNames(ensAddresses);

  // Fetch usernames for listed withdrawals
  useEffect(() => {
    const ids = new Set<string>();
    for (const w of withdrawals) {
      if (w.playerId) ids.add(w.playerId);
    }
    const toFetch = Array.from(ids).filter((id) => !(id in usernameByPlayerId));
    if (toFetch.length === 0) return;

    let cancelled = false;
    const baseUrl = getAppServerBaseUrl();
    (async () => {
      await Promise.allSettled(
        toFetch.map((id) =>
          fetch(
            `${baseUrl}/api/admin/players/by-id/${encodeURIComponent(id)}`,
            {
              credentials: 'include',
            }
          )
            .then((res) => (res.ok ? res.json() : null))
            .then((payload: any) => {
              if (cancelled) return;
              const username = payload?.player?.username ?? null;
              setUsernameByPlayerId((prev) =>
                prev[id] !== undefined ? prev : { ...prev, [id]: username }
              );
            })
            .catch(() => {
              if (cancelled) return;
              setUsernameByPlayerId((prev) =>
                prev[id] !== undefined ? prev : { ...prev, [id]: null }
              );
            })
        )
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [withdrawals, usernameByPlayerId]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAllInView = useCallback(() => {
    setSelectedIds((prev) => {
      if (allSelectedInView) {
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
  }, [allSelectedInView, selectableWithdrawals]);

  const handleRefresh = useCallback(() => {
    void mutateWithdrawals();
    void fetchPendingSummary();
    void fetchWalletBalances();
    void fetchAutomationSettings();
    setSelectedIds(new Set());
  }, [
    mutateWithdrawals,
    fetchPendingSummary,
    fetchWalletBalances,
    fetchAutomationSettings,
  ]);

  const updateAutomationSetting = useCallback(
    async (
      key:
        | 'isAutoProcessingEnabled'
        | 'isBatchProcessingPaused'
        | 'isConfirmationPaused',
      nextValue: boolean
    ) => {
      if (!automationSettings) return;
      setUpdatingAutomationSettings(true);
      setError(null);
      setSuccess(null);
      try {
        const baseUrl = getAppServerBaseUrl();
        const res = await fetch(`${baseUrl}/api/admin/withdrawals/settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ [key]: nextValue }),
        });
        const payload = (await res.json().catch(() => null)) as
          | (WithdrawalSettingsResponse & { error?: string })
          | null;
        if (!res.ok || !payload?.settings) {
          setError(payload?.error || 'Failed to update automation settings.');
          return;
        }
        setAutomationSettings({
          isAutoProcessingEnabled: Boolean(
            payload.settings.isAutoProcessingEnabled ?? payload.featureEnabled
          ),
          isBatchProcessingPaused: Boolean(
            payload.settings.isBatchProcessingPaused
          ),
          isConfirmationPaused: Boolean(payload.settings.isConfirmationPaused),
          isBatchProcessorRunning:
            typeof payload.runtime?.isBatchProcessorRunning === 'boolean'
              ? payload.runtime.isBatchProcessorRunning
              : automationSettings?.isBatchProcessorRunning ?? null,
        });
        if (key === 'isAutoProcessingEnabled') {
          setSuccess(
            nextValue ? 'Auto-processing enabled.' : 'Auto-processing disabled.'
          );
        } else if (key === 'isBatchProcessingPaused') {
          setSuccess(
            nextValue ? 'Auto-processing paused.' : 'Auto-processing resumed.'
          );
        } else {
          setSuccess(
            nextValue
              ? 'Confirmation monitor paused.'
              : 'Confirmation monitor resumed.'
          );
        }
      } catch {
        setError('Failed to update automation settings.');
      } finally {
        setUpdatingAutomationSettings(false);
      }
    },
    [automationSettings]
  );

  const handleApproveSelected = useCallback(async () => {
    if (approvingBatch) return;
    if (selectedIds.size === 0) return;
    if (selectedIds.size > MAX_BATCH_SIZE) {
      setError(
        `You can only approve up to ${MAX_BATCH_SIZE} withdrawals at once. Deselect some and try again.`
      );
      return;
    }
    setApprovingBatch(true);
    setError(null);
    setSuccess(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const ids = Array.from(selectedIds);
      const res = await fetch(
        `${baseUrl}/api/admin/withdrawals/batch-approve`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        }
      );
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        total?: number;
        successCount?: number;
        failureCount?: number;
        results?: Array<{
          id: string;
          success: boolean;
          error?: string;
          status?: string;
          mode?: string;
          txHash?: string;
          withdrawal?: TokenWithdrawal;
        }>;
        error?: string;
      } | null;

      if (!res.ok || !payload?.results) {
        setError(
          payload?.error ||
            'Failed to approve selected withdrawals. Try again shortly.'
        );
        return;
      }

      const results = payload.results;
      const successful = results.filter((r) => r.success && r.withdrawal);
      const failed = results.filter((r) => !r.success);

      let queuedCount = 0;
      let broadcastCount = 0;
      let lastTxShort: string | null = null;
      for (const r of successful) {
        const updated = r.withdrawal as TokenWithdrawal;
        // eslint-disable-next-line no-await-in-loop
        await mutateWithdrawals((prev) => {
          const current = prev ?? [];
          if (updated.status !== statusFilter) {
            return current.filter((item) => item.id !== updated.id);
          }
          return current.map((item) =>
            item.id === updated.id ? updated : item
          );
        }, false);
        const mode = (r.mode as string) || null;
        if (mode === 'queued' || updated.status === 'withdrawal_approved') {
          queuedCount++;
        } else {
          const shortTx = shortenHash(r.txHash || updated.txHash);
          if (shortTx) lastTxShort = shortTx;
          broadcastCount++;
        }
      }
      await fetchPendingSummary();
      setSelectedIds(new Set());
      const successCount = successful.length;
      const failCount = failed.length;
      if (successCount > 0 && failCount === 0) {
        if (queuedCount > 0 && broadcastCount > 0) {
          setSuccess(
            `Queued ${queuedCount} and broadcast ${broadcastCount} ${
              successCount === 1 ? 'withdrawal' : 'withdrawals'
            }${lastTxShort ? ` (${lastTxShort})` : '.'}`
          );
        } else if (queuedCount > 0) {
          setSuccess(
            `Queued ${queuedCount} ${
              queuedCount === 1 ? 'withdrawal' : 'withdrawals'
            } for auto-processing.`
          );
        } else {
          setSuccess(
            lastTxShort
              ? `Approved ${broadcastCount} ${
                  broadcastCount === 1 ? 'withdrawal' : 'withdrawals'
                } (${lastTxShort}).`
              : `Approved ${broadcastCount} ${
                  broadcastCount === 1 ? 'withdrawal' : 'withdrawals'
                }.`
          );
        }
      } else if (successCount > 0) {
        setError(`Approved ${successCount}, failed ${failCount}.`);
      } else {
        setError('Failed to approve selected withdrawals.');
      }
    } finally {
      setApprovingBatch(false);
    }
  }, [
    approvingBatch,
    selectedIds,
    statusFilter,
    fetchPendingSummary,
    mutateWithdrawals,
  ]);

  const handleSendTestDiscord = useCallback(async () => {
    if (sendingTest) return;
    setSendingTest(true);
    setError(null);
    setSuccess(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(`${baseUrl}/api/admin/withdrawals/test-discord`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        txid?: string;
        error?: string;
      } | null;
      if (!res.ok || !payload?.ok) {
        setError(payload?.error || 'Failed to send test Discord message.');
        return;
      }
      setSuccess(
        payload.txid
          ? `Test Discord message sent (txid: ${payload.txid}).`
          : 'Test Discord message sent.'
      );
    } catch {
      setError('Failed to send test Discord message.');
    } finally {
      setSendingTest(false);
    }
  }, [sendingTest]);

  const handleGameIdClick = useCallback(async (gameId: string | null) => {
    if (!gameId) return;
    setSelectedGameId(gameId);
    setLoadingGameDetails(true);
    setGameDetails(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(`${baseUrl}/api/admin/games/${gameId}`, {
        credentials: 'include',
      });
      const payload = (await res.json().catch(() => null)) as {
        game?: GameDetails;
        error?: string;
      } | null;

      if (!res.ok || !payload?.game) {
        setError(payload?.error || 'Failed to load game details');
        setSelectedGameId(null);
        return;
      }

      setGameDetails(payload.game);
    } catch {
      setError('Failed to load game details');
      setSelectedGameId(null);
    } finally {
      setLoadingGameDetails(false);
    }
  }, []);

  const handleApprove = useCallback(
    async (withdrawal: TokenWithdrawal) => {
      if (approvingId) return;
      setApprovingId(withdrawal.id);
      setError(null);
      setSuccess(null);
      try {
        const baseUrl = getAppServerBaseUrl();
        const res = await fetch(
          `${baseUrl}/api/admin/withdrawals/batch-approve`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: [withdrawal.id] }),
          }
        );
        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean;
          total?: number;
          successCount?: number;
          failureCount?: number;
          results?: Array<{
            id: string;
            success: boolean;
            error?: string;
            status?: string;
            mode?: string;
            txHash?: string;
            withdrawal?: TokenWithdrawal;
          }>;
          error?: string;
        } | null;

        if (!res.ok || !payload?.results || payload.results.length === 0) {
          const message =
            payload?.error || 'Failed to approve withdrawal request.';
          setError(message);
          return;
        }

        const result = payload.results[0];
        if (!result.success || !result.withdrawal) {
          const message =
            result.error || 'Failed to approve withdrawal request.';
          setError(message);
          return;
        }

        const updated = result.withdrawal as TokenWithdrawal;
        await mutateWithdrawals((prev) => {
          const current = prev ?? [];
          if (updated.status !== statusFilter) {
            return current.filter((item) => item.id !== updated.id);
          }
          return current.map((item) =>
            item.id === updated.id ? updated : item
          );
        }, false);
        const mode = (result.mode as string) || null;
        if (mode === 'queued' || updated.status === 'withdrawal_approved') {
          setSuccess('Withdrawal approved and queued for auto-processing.');
        } else {
          const shortTx = shortenHash(result.txHash || updated.txHash);
          setSuccess(
            shortTx
              ? `Withdrawal approved (${shortTx}).`
              : 'Withdrawal approved and submitted onchain.'
          );
        }
        void fetchPendingSummary();
      } catch {
        setError('Failed to approve withdrawal. Try again shortly.');
      } finally {
        setApprovingId(null);
      }
    },
    [approvingId, statusFilter, fetchPendingSummary, mutateWithdrawals]
  );

  const handleRejectClick = useCallback((withdrawal: TokenWithdrawal) => {
    setRejectingId(withdrawal.id);
    setRejectReason('');
    setError(null);
  }, []);

  const handleRejectCancel = useCallback(() => {
    setRejectingId(null);
    setRejectReason('');
    setError(null);
  }, []);

  const handleRejectConfirm = useCallback(
    async (withdrawal: TokenWithdrawal) => {
      if (!rejectReason.trim()) {
        setError('Rejection reason is required');
        return;
      }

      setError(null);
      setSuccess(null);
      try {
        const baseUrl = getAppServerBaseUrl();
        const res = await fetch(
          `${baseUrl}/api/admin/withdrawals/${withdrawal.id}/reject`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ reason: rejectReason.trim() }),
          }
        );
        const payload = (await res.json().catch(() => null)) as {
          withdrawal?: TokenWithdrawal;
          error?: string;
        } | null;

        if (!res.ok || !payload?.withdrawal) {
          const message =
            payload?.error || 'Failed to reject withdrawal request.';
          setError(message);
          return;
        }

        const updated = payload.withdrawal as TokenWithdrawal;
        await mutateWithdrawals((prev) => {
          const current = prev ?? [];
          if (updated.status !== statusFilter) {
            return current.filter((item) => item.id !== updated.id);
          }
          return current.map((item) =>
            item.id === updated.id ? updated : item
          );
        }, false);
        setSuccess('Withdrawal rejected.');
        setRejectingId(null);
        setRejectReason('');
        void fetchPendingSummary();
      } catch {
        setError('Failed to reject withdrawal. Try again shortly.');
      }
    },
    [rejectReason, statusFilter, fetchPendingSummary, mutateWithdrawals]
  );

  const autoEnabled = automationSettings?.isAutoProcessingEnabled ?? false;
  const autoPaused = automationSettings?.isBatchProcessingPaused ?? false;
  const confirmPaused = automationSettings?.isConfirmationPaused ?? false;
  const batchProcessorRunning =
    automationSettings?.isBatchProcessorRunning ?? null;
  const batchProcessorLabel =
    batchProcessorRunning === null
      ? 'Unknown'
      : batchProcessorRunning
        ? 'Running'
        : 'Stopped';
  const autoStatusLabel = loadingAutomationSettings
    ? 'Loading…'
    : !automationSettings
      ? 'Unavailable'
      : !autoEnabled
        ? 'Disabled'
        : autoPaused
          ? 'Paused'
          : 'Active';
  const confirmStatusLabel = loadingAutomationSettings
    ? 'Loading…'
    : !automationSettings
      ? 'Unavailable'
      : confirmPaused
        ? 'Paused'
        : 'Active';
  const autoStatusDescription =
    !automationSettings && !loadingAutomationSettings
      ? 'Unable to load automation settings.'
      : autoEnabled
        ? 'Approved withdrawals are sent automatically by the server cron.'
        : 'Auto-processing is disabled; approvals send immediately.';
  const confirmStatusDescription =
    'Monitors pending tx receipts roughly every minute.';
  const autoToggleDisabled =
    !automationSettings ||
    updatingAutomationSettings ||
    loadingAutomationSettings;
  const autoPauseToggleDisabled =
    !automationSettings ||
    !autoEnabled ||
    updatingAutomationSettings ||
    loadingAutomationSettings;
  const confirmToggleDisabled =
    !automationSettings ||
    updatingAutomationSettings ||
    loadingAutomationSettings;
  const autoToggleLabel = autoEnabled ? 'Disable Auto' : 'Enable Auto';
  const autoPauseToggleLabel = autoPaused ? 'Resume Auto' : 'Pause Auto';
  const confirmToggleLabel = confirmPaused ? 'Resume' : 'Pause';

  const handleSortClick = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDirection('asc');
      return key;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-400">
          Status{' '}
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(toStatus(event.target.value))}
            className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-400">
          Currency{' '}
          <select
            value={currencyFilter}
            onChange={(event) =>
              setCurrencyFilter(event.target.value as CurrencyFilter)
            }
            className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            {CURRENCY_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option === 'ALL' ? 'All' : option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-400">
          Sort{' '}
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            {SORT_KEY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-400">
          Order{' '}
          <select
            value={sortDirection}
            onChange={(event) =>
              setSortDirection(event.target.value as SortDirection)
            }
            className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          >
            {SORT_DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
        {statusFilter === 'withdrawal_waiting' ? (
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleApproveSelected()}
            disabled={approvingBatch || selectedCountInView === 0}
          >
            {approvingBatch
              ? 'Approving…'
              : `Approve Selected${selectedCountInView > 0 ? ` (${selectedCountInView})` : ''}`}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleSendTestDiscord()}
          disabled={sendingTest}
        >
          {sendingTest ? 'Sending…' : 'Send Test Discord'}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <div className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
            <span className="mr-1">Awaiting approval:</span>
            <span className="text-slate-100 font-semibold">
              {loadingPending
                ? '—'
                : formatTotals(pendingSummary.totalsByCurrency)}
            </span>
            <span className="ml-2 text-slate-500">
              ({pendingSummary.count} txns)
            </span>
          </div>
          <div className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs text-slate-400">
            <span className="mr-1">Server wallet:</span>
            <span className="text-slate-100 font-semibold">
              {loadingBalances
                ? '—'
                : `${walletBalances?.eth ?? '—'} ETH, ${walletBalances?.ghst ?? '—'} GHST, ${walletBalances?.usdc ?? '—'} USDC`}
            </span>
            <button
              type="button"
              onClick={() => void handleCopyServerWallet()}
              disabled={loadingBalances || !serverWalletAddress}
              className={clsx(
                'ml-2 rounded px-2 py-0.5',
                'border border-slate-700',
                'text-blue-300 hover:text-blue-200 hover:border-blue-400',
                'disabled:text-slate-500 disabled:border-slate-800',
                'bg-slate-900/60'
              )}
              aria-label="Copy server wallet address"
              title={serverWalletAddress || ''}
            >
              {serverAddressCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-slate-500">
                Auto-processing
              </p>
              <p className="text-base font-semibold text-slate-100">
                {autoStatusLabel}
              </p>
              <div className="mt-1 text-xs text-slate-400">
                <span className="mr-1">Runtime:</span>
                <span
                  className={clsx(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                    batchProcessorRunning === null && 'bg-slate-700/40 text-slate-200',
                    batchProcessorRunning === true && 'bg-emerald-500/20 text-emerald-200',
                    batchProcessorRunning === false && 'bg-red-500/20 text-red-200'
                  )}
                >
                  {batchProcessorLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400">{autoStatusDescription}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={autoToggleDisabled}
                onClick={() =>
                  updateAutomationSetting(
                    'isAutoProcessingEnabled',
                    !autoEnabled
                  )
                }
              >
                {updatingAutomationSettings && !autoToggleDisabled
                  ? 'Updating…'
                  : autoToggleLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={autoPauseToggleDisabled}
                onClick={() =>
                  updateAutomationSetting(
                    'isBatchProcessingPaused',
                    !autoPaused
                  )
                }
              >
                {updatingAutomationSettings && !autoPauseToggleDisabled
                  ? 'Updating…'
                  : autoPauseToggleLabel}
              </Button>
            </div>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-slate-500">
                Confirmation Monitor
              </p>
              <p className="text-base font-semibold text-slate-100">
                {confirmStatusLabel}
              </p>
              <p className="text-xs text-slate-400">
                {confirmStatusDescription}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={confirmToggleDisabled}
              onClick={() =>
                updateAutomationSetting(
                  'isConfirmationPaused',
                  !(automationSettings?.isConfirmationPaused ?? false)
                )
              }
            >
              {updatingAutomationSettings && !confirmToggleDisabled
                ? 'Updating…'
                : `${confirmToggleLabel} Monitor`}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 max-w-3xl">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 max-w-3xl">
          {success}
        </div>
      ) : null}

      {!hasData && !loading && !error ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
          No withdrawals found for this status and currency filter.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                {statusFilter === 'withdrawal_waiting' ? (
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer"
                    checked={
                      allSelectedInView && selectableWithdrawals.length > 0
                    }
                    onChange={toggleSelectAllInView}
                    disabled={approvingBatch}
                    aria-label="Select all"
                  />
                ) : (
                  <span className="text-slate-500">Select</span>
                )}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Player
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Amount
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Chain
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Source
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Game ID
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                <button
                  type="button"
                  onClick={() => handleSortClick('requested')}
                  className="inline-flex items-center gap-1 hover:text-slate-100"
                >
                  <span>Requested</span>
                  {sortKey === 'requested' && (
                    <span className="text-xs">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                <button
                  type="button"
                  onClick={() => handleSortClick('confirmed')}
                  className="inline-flex items-center gap-1 hover:text-slate-100"
                >
                  <span>Confirmed on</span>
                  {sortKey === 'confirmed' && (
                    <span className="text-xs">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Status
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredWithdrawals.map((withdrawal) => {
              const statusLabel =
                STATUS_LABELS[withdrawal.status] ?? withdrawal.status;
              const statusClass =
                STATUS_STYLES[withdrawal.status] ?? 'bg-slate-700/40';
              const explorerUrl = getExplorerUrl(
                withdrawal.chainId,
                withdrawal.txHash
              );
              const tokenAddressExplorer = getAddressExplorerUrl(
                withdrawal.chainId,
                withdrawal.tokenContractAddress
              );
              const ensName = withdrawal.playerWalletAddress
                ? (ensByAddress[withdrawal.playerWalletAddress] ?? null)
                : null;
              const username = withdrawal.playerId
                ? (usernameByPlayerId[withdrawal.playerId] ?? null)
                : null;
              const displayName =
                username ||
                ensName ||
                shortenAddress(withdrawal.playerWalletAddress);
              const showWalletSubtitle = Boolean(username || ensName);
              const initialTxSubmittedAt =
                getInitialTxSubmittedAt(withdrawal);
              const lastAttemptAt = getLastAttemptAt(withdrawal);
              const showLastAttempt =
                Boolean(lastAttemptAt) &&
                lastAttemptAt !== initialTxSubmittedAt;
              return (
                <tr key={withdrawal.id}>
                  <td className="px-4 py-3 align-top">
                    {withdrawal.status === 'withdrawal_waiting' ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selectedIds.has(withdrawal.id)}
                        onChange={() => toggleSelectOne(withdrawal.id)}
                        disabled={approvingBatch}
                        aria-label="Select row"
                      />
                    ) : (
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-100">
                      {displayName}
                    </div>
                    {showWalletSubtitle ? (
                      <div className="text-xs text-slate-500">
                        {shortenAddress(withdrawal.playerWalletAddress)}
                      </div>
                    ) : null}
                    <div className="text-xs text-slate-500">
                      {withdrawal.playerId?.replace(/-/g, '').slice(0, 8) ??
                        '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-100">
                      {formatAmount(withdrawal.amount)} {withdrawal.currency}
                    </div>
                    <div className="text-xs text-slate-500">
                      {withdrawal.amountBaseUnits} base units
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-200">
                      {withdrawal.chainId ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-200">
                      {formatSource(withdrawal.source)}
                    </div>
                    {explorerUrl ? (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-300 hover:underline"
                      >
                        View TX
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {withdrawal.gameId ? (
                      <button
                        onClick={() =>
                          void handleGameIdClick(withdrawal.gameId)
                        }
                        className="text-blue-300 hover:text-blue-200 hover:underline cursor-pointer text-sm font-mono"
                      >
                        {shortenGameId(withdrawal.gameId)}
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-200">
                      {formatDate(withdrawal.withdrawalRequestedAt)}
                    </div>
                    {initialTxSubmittedAt ? (
                      <div className="text-xs text-slate-500">
                        Initial submit: {formatDate(initialTxSubmittedAt)}
                      </div>
                    ) : null}
                    {showLastAttempt ? (
                      <div className="text-xs text-slate-500">
                        Last attempt: {formatDate(lastAttemptAt)}
                      </div>
                    ) : null}
                    {withdrawal.failureReason ? (
                      <div className="text-xs text-red-300">
                        {withdrawal.failureReason}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-200">
                      {formatDate(withdrawal.withdrawalConfirmedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                        statusClass
                      )}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {withdrawal.status === 'withdrawal_waiting' ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleApprove(withdrawal)}
                          disabled={
                            approvingId === withdrawal.id || approvingBatch
                          }
                        >
                          {approvingId === withdrawal.id
                            ? 'Approving…'
                            : 'Approve'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRejectClick(withdrawal)}
                          disabled={
                            rejectingId === withdrawal.id || approvingBatch
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : withdrawal.status === 'withdrawal_rejected' &&
                      withdrawal.failureReason ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewingReasonId(withdrawal.id)}
                      >
                        View Reason
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading ? (
          <div className="px-4 py-3 text-sm text-slate-400">Loading…</div>
        ) : null}
      </div>

      <Dialog
        open={selectedGameId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGameId(null);
            setGameDetails(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white">Game Details</DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedGameId
                ? `Game ID: ${shortenGameId(selectedGameId)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {loadingGameDetails ? (
            <div className="py-8 text-center text-slate-400">
              Loading game details…
            </div>
          ) : gameDetails ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Status
                  </div>
                  <div className="text-slate-100">{gameDetails.status}</div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Phase
                  </div>
                  <div className="text-slate-100">{gameDetails.phase}</div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Region
                  </div>
                  <div className="text-slate-100">
                    {gameDetails.region || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Difficulty Tier
                  </div>
                  <div className="text-slate-100">
                    {gameDetails.difficultyTier || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Seed
                  </div>
                  <div className="text-slate-100 font-mono">
                    {gameDetails.seed ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Room ID
                  </div>
                  <div className="text-slate-100 font-mono text-xs break-all">
                    {gameDetails.roomId}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Max Players
                  </div>
                  <div className="text-slate-100">
                    {gameDetails.maxPlayers ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Private
                  </div>
                  <div className="text-slate-100">
                    {gameDetails.isPrivate ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 uppercase text-xs mb-1">
                    Total Enemy Kills
                  </div>
                  <div className="text-slate-100">
                    {gameDetails.totalEnemyKills.toLocaleString()}
                  </div>
                </div>
                {gameDetails.startedAt && gameDetails.endedAt && (
                  <div>
                    <div className="text-slate-400 uppercase text-xs mb-1">
                      Match Duration
                    </div>
                    <div className="text-slate-100 font-semibold">
                      {formatDuration(
                        gameDetails.startedAt,
                        gameDetails.endedAt
                      )}
                    </div>
                  </div>
                )}
              </div>
              {gameDetails.players && gameDetails.players.length > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <div className="text-slate-400 uppercase text-xs mb-2">
                    Players
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    {gameDetails.players.map((player) => {
                      const ensName = player.walletAddress
                        ? (ensByAddress[player.walletAddress] ?? null)
                        : null;
                      const username =
                        usernameByPlayerId[player.playerId] ?? null;
                      const display =
                        username ||
                        ensName ||
                        shortenAddress(player.walletAddress);
                      const showWallet = Boolean(username || ensName);
                      return (
                        <div
                          key={player.playerId}
                          className="flex justify-between items-start py-2 border-b border-slate-800 last:border-b-0"
                        >
                          <div className="flex-1">
                            <div className="text-slate-200 font-medium">
                              {display}
                            </div>
                            {showWallet ? (
                              <div className="text-xs text-slate-500 mt-1">
                                {shortenAddress(player.walletAddress)}
                              </div>
                            ) : null}
                            <div className="text-xs text-slate-500 mt-1">
                              {player.playerId.replace(/-/g, '').slice(0, 8)}
                            </div>
                            {player.characterName || player.characterId ? (
                              <div className="text-xs text-slate-400 mt-1">
                                {player.characterName ? (
                                  <>
                                    Character: {player.characterName}
                                    {player.characterId && (
                                      <span className="text-slate-500 ml-1">
                                        ({player.characterId})
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>Character ID: {player.characterId}</>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-right text-xs text-slate-400">
                            <div>Kills: {player.kills}</div>
                            <div>Deaths: {player.deaths}</div>
                            {player.levelBefore !== null && (
                              <div>
                                Level: {player.levelBefore}
                                {player.levelAfter !== null &&
                                  player.levelAfter !== player.levelBefore && (
                                    <> → {player.levelAfter}</>
                                  )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="border-t border-slate-700 pt-4">
                <div className="text-slate-400 uppercase text-xs mb-2">
                  Timestamps
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {gameDetails.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Created:</span>
                      <span className="text-slate-100">
                        {formatDate(gameDetails.createdAt)}
                      </span>
                    </div>
                  )}
                  {gameDetails.startedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Started:</span>
                      <span className="text-slate-100">
                        {formatDate(gameDetails.startedAt)}
                      </span>
                    </div>
                  )}
                  {gameDetails.runStartedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Run Started:</span>
                      <span className="text-slate-100">
                        {formatDate(gameDetails.runStartedAt)}
                      </span>
                    </div>
                  )}
                  {gameDetails.phaseChangedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Phase Changed:</span>
                      <span className="text-slate-100">
                        {formatDate(gameDetails.phaseChangedAt)}
                      </span>
                    </div>
                  )}
                  {gameDetails.endedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ended:</span>
                      <span className="text-slate-100">
                        {formatDate(gameDetails.endedAt)}
                      </span>
                    </div>
                  )}
                  {gameDetails.updatedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Updated:</span>
                      <span className="text-slate-100">
                        {formatDate(gameDetails.updatedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {Object.keys(gameDetails.metadata).length > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <div className="text-slate-400 uppercase text-xs mb-2">
                    Metadata
                  </div>
                  <pre className="text-xs text-slate-300 bg-slate-950 p-3 rounded overflow-auto">
                    {JSON.stringify(gameDetails.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            handleRejectCancel();
          }
        }}
      >
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white">Reject Withdrawal</DialogTitle>
            <DialogDescription className="text-slate-400">
              Please provide a reason for rejecting this withdrawal request.
              This reason will be visible to the player.
            </DialogDescription>
          </DialogHeader>
          {rejectingId ? (
            <div className="grid gap-4 py-4">
              <div>
                <label
                  htmlFor="reject-reason"
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  Rejection Reason *
                </label>
                <textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full min-h-[100px] rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={500}
                />
                <div className="text-xs text-slate-500 mt-1">
                  {rejectReason.length}/500 characters
                </div>
              </div>
              {error ? (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={handleRejectCancel}
              disabled={rejectingId === null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const withdrawal = withdrawals.find(
                  (w) => w.id === rejectingId
                );
                if (withdrawal) {
                  void handleRejectConfirm(withdrawal);
                }
              }}
              disabled={!rejectReason.trim() || rejectingId === null}
            >
              Reject Withdrawal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewingReasonId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingReasonId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white">Rejection Reason</DialogTitle>
            <DialogDescription className="text-slate-400">
              Reason provided for rejecting this withdrawal request.
            </DialogDescription>
          </DialogHeader>
          {viewingReasonId ? (
            <div className="py-4">
              <div className="rounded-md border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 whitespace-pre-wrap">
                {withdrawals.find((w) => w.id === viewingReasonId)
                  ?.failureReason ?? 'No reason provided'}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setViewingReasonId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
