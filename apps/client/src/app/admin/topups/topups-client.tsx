'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '../../../components/ui/Button';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { useEnsNames } from '../../../hooks/useEnsNames';

interface AdminDepositRecord {
  id: string;
  playerId: string | null;
  playerWalletAddress: string | null;
  playerUsername?: string | null;
  tokenSymbol: string;
  amount: string; // decimal string (human units)
  amountWei: string;
  status: string; // pending | confirmed | credited | failed
  chainId: number | null;
  txHash: string | null;
  unlockAt: string | null;
  autoRenew: boolean;
  pointsMinted?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AdminTopupsClientProps {
  initialTopUps: AdminDepositRecord[];
  initialStatus: string;
  initialCurrency: string;
  initialError: string | null;
}

// Default to deposit statuses (confirmed/credited). If needed, extend to support ledger statuses.
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'credited', label: 'Credited' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
];

const TOKEN_OPTIONS = [
  { value: 'ALL', label: 'All tokens' },
  { value: 'USDC', label: 'USDC' },
  { value: 'GHO', label: 'GHO' },
  { value: 'GHST', label: 'GHST' },
] as const;

type TokenFilter = (typeof TOKEN_OPTIONS)[number]['value'];

const TOKEN_ICON_BY_SYMBOL: Record<string, string> = {
  USDC: '/loot-icons/usdc.svg',
  GHO: '/loot-icons/coin.svg',
  GHST: '/loot-icons/ghst.gif',
};

const STATUS_STYLES: Record<string, string> = {
  credited: 'bg-emerald-500/20 text-emerald-200',
  confirmed: 'bg-blue-500/20 text-blue-200',
  pending: 'bg-yellow-500/20 text-yellow-200',
  failed: 'bg-red-500/20 text-red-200',
};

function formatAmountDecimal(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(n);
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

function shortenAddress(address: string | null | undefined): string {
  if (!address) return '—';
  const start = address.slice(0, 6);
  const end = address.slice(-4);
  return `${start}…${end}`;
}

function getExplorerUrl(
  chainId: number | null,
  txHash: string | null
): string | null {
  if (!txHash) return null;
  const numericChainId = chainId ?? null;
  if (numericChainId === 8453) {
    return `https://basescan.org/tx/${txHash}`;
  }
  return null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const ms = target - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function normalizeTokenFilter(value: string | null | undefined): TokenFilter {
  if (value === 'USDC' || value === 'GHO' || value === 'GHST') return value;
  return 'ALL';
}

function normalizeTokenSymbol(value: string | null | undefined): string {
  const normalized = (value || '').trim().toUpperCase();
  return normalized || 'UNKNOWN';
}

export default function AdminTopupsClient({
  initialTopUps,
  initialStatus,
  initialCurrency,
  initialError,
}: AdminTopupsClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatus || 'credited'
  );
  const [tokenFilter, setTokenFilter] = useState<TokenFilter>(() =>
    normalizeTokenFilter(initialCurrency)
  );
  const [topUps, setTopUps] = useState<AdminDepositRecord[]>(initialTopUps);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);
  const [discordTestMessage, setDiscordTestMessage] = useState<string | null>(
    null
  );

  const hasData = topUps.length > 0;
  const statusOptions = useMemo(() => STATUS_OPTIONS, []);
  const tokenOptions = useMemo(() => TOKEN_OPTIONS, []);
  const didInitRef = useRef(false);

  const ensAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const t of topUps) {
      if (t.playerWalletAddress) set.add(t.playerWalletAddress);
    }
    return Array.from(set);
  }, [topUps]);

  const { ensByAddress } = useEnsNames(ensAddresses);

  const fetchTopUps = useCallback(async (status: string, token: TokenFilter) => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const params = new URLSearchParams({
        status,
        type: 'deposits',
      });
      if (token !== 'ALL') {
        params.set('tokenSymbol', token);
      }
      const res = await fetch(
        `${baseUrl}/api/admin/top-ups?${params.toString()}`,
        {
          credentials: 'include',
        }
      );
      const payload = (await res.json().catch(() => null)) as {
        topUps?: AdminDepositRecord[];
        error?: string;
      } | null;
      if (!res.ok || !payload) {
        const message =
          payload?.error || 'Failed to load top-ups for this status.';
        setError(message);
        setTopUps([]);
        return;
      }
      const list = Array.isArray(payload.topUps) ? payload.topUps : [];
      setTopUps(list);
    } catch {
      setError('Failed to load top-ups. Try refreshing.');
      setTopUps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      const normalizedInitialToken = normalizeTokenFilter(initialCurrency);
      if (
        (initialStatus || 'paid') !== statusFilter ||
        normalizedInitialToken !== tokenFilter
      ) {
        void fetchTopUps(statusFilter, tokenFilter);
      }
      return;
    }
    void fetchTopUps(statusFilter, tokenFilter);
  }, [statusFilter, tokenFilter, fetchTopUps, initialStatus, initialCurrency]);

  const handleRefresh = useCallback(() => {
    void fetchTopUps(statusFilter, tokenFilter);
  }, [fetchTopUps, statusFilter, tokenFilter]);

  const handleTestDiscord = useCallback(async () => {
    setIsTestingDiscord(true);
    setDiscordTestMessage(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(`${baseUrl}/api/admin/top-ups/test-discord`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !payload?.ok) {
        setDiscordTestMessage(
          payload?.error || 'Failed to send Discord test message.'
        );
        return;
      }
      setDiscordTestMessage('Discord test message sent.');
    } catch {
      setDiscordTestMessage('Failed to send Discord test message.');
    } finally {
      setIsTestingDiscord(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-400" htmlFor="status-filter">
            Status
          </label>
          <select
            id="status-filter"
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <label className="text-sm text-slate-400" htmlFor="token-filter">
            Token
          </label>
          <select
            id="token-filter"
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-sm"
            value={tokenFilter}
            onChange={(e) => setTokenFilter(normalizeTokenFilter(e.target.value))}
          >
            {tokenOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestDiscord}
            disabled={isTestingDiscord}
          >
            {isTestingDiscord ? 'Sending…' : 'Test Discord'}
          </Button>
        </div>
      </div>
      {discordTestMessage ? (
        <p className="text-xs text-slate-400">{discordTestMessage}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/50 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Created</th>
              <th className="px-3 py-2 text-left font-semibold">Player</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-left font-semibold">Token</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Unlock</th>
              <th className="px-3 py-2 text-left font-semibold">Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {!hasData ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-slate-400"
                >
                  {loading ? 'Loading…' : error || 'No top-ups found.'}
                </td>
              </tr>
            ) : (
              topUps.map((t) => {
                const address = t.playerWalletAddress;
                const ens = address
                  ? ensByAddress[address.toLowerCase()]
                  : null;
                const display = ens || shortenAddress(address);
                const username = (t.playerUsername || '').trim();
                const url = getExplorerUrl(t.chainId, t.txHash);
                const unlockInDays = daysUntil(t.unlockAt);
                const tokenSymbol = normalizeTokenSymbol(t.tokenSymbol);
                const tokenIconSrc =
                  TOKEN_ICON_BY_SYMBOL[tokenSymbol] || '/loot-icons/coin.svg';
                return (
                  <tr key={t.id} className="hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-200">
                        {username || display}
                      </div>
                      {username && (
                        <div className="text-xs text-slate-500">{display}</div>
                      )}
                      <div className="text-xs text-slate-500">
                        {t.playerId ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-100">
                      {formatAmountDecimal(t.amount)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/80 ring-1 ring-slate-700/80"
                        aria-label={`${tokenSymbol} token`}
                        title={tokenSymbol}
                      >
                        <img
                          src={tokenIconSrc}
                          alt=""
                          aria-hidden="true"
                          className="h-4 w-4 object-contain"
                        />
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLES[t.status] ||
                            'bg-slate-700/30 text-slate-200'
                        )}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {t.unlockAt ? (
                        <div className="flex flex-col">
                          <span>{formatDate(t.unlockAt)}</span>
                          {typeof unlockInDays === 'number' && (
                            <span className="text-xs text-slate-500">
                              {unlockInDays > 0
                                ? `in ${unlockInDays}d`
                                : unlockInDays === 0
                                  ? 'today'
                                  : `${Math.abs(unlockInDays)}d ago`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {t.txHash ? (
                        url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-300 hover:underline"
                          >
                            {t.txHash.slice(0, 10)}…
                          </a>
                        ) : (
                          <span className="text-slate-300">
                            {t.txHash.slice(0, 10)}…
                          </span>
                        )
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
