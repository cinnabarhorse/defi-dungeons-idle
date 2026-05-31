'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { useSession } from '../../../components/providers/SessionProvider';
import { Button } from '../../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/Dialog';
import { useEnsNames } from '../../../hooks/useEnsNames';

interface PlayerRecord {
  id: string;
  walletAddress: string;
  emailAddress: string | null;
  username: string | null;
  region: string | null;
  lastSeen: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isBanned: boolean;
  isAuthorized: boolean;
  accessGrantedAt: string | null;
  level?: number;
  totalXp?: number;
  unspentPoints?: number;
  unlockedTiers?: string[];
  unlockedCharacters?: string[];
  lickTongueCount?: number;
  statAllocations?: Record<string, unknown>;
  derivedStats?: Record<string, unknown>;
  equippedWearables?: Record<string, unknown>[];
  allocationHistory?: Record<string, unknown>[];
  lastSyncedAt?: string | null;
  selectedCharacterId?: string | null;
  selectedDifficultyTier?: string | null;
  gotchiSpriteUrl?: string | null;
  avatarId?: string | null;
  audioSettings?: Record<string, unknown>;
}

interface DailyRunsSummary {
  enabled: boolean;
  allowedRuns: number;
  usdcStaked: number;
  ghoStaked: number;
  totalStaked: number;
}

function formatRelativeTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '—';
  const now = Date.now();
  let deltaSec = Math.floor((now - timestamp) / 1000);
  if (deltaSec < 0) deltaSec = 0;
  if (deltaSec < 60) return 'just now';
  const minutes = Math.floor(deltaSec / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function shortenAddress(address: string): string {
  if (!address) return '';
  const start = address.slice(0, 6);
  const end = address.slice(-4);
  return `${start}…${end}`;
}

// ENS normalization handled by useEnsNames hook

export default function AdminPlayersPage() {
  const serverBaseUrl = useMemo(() => getAppServerBaseUrl(), []);
  const { hasValidSession, isSessionVerified } = useSession();
  const DEFAULT_PAGE_LIMIT = 100;

  const [id, setId] = useQueryState('id', { history: 'replace' });
  const [wallet, setWallet] = useQueryState('wallet', { history: 'replace' });
  const [pageOffset, setPageOffset] = useQueryState('offset', {
    history: 'replace',
  });
  const [pageLimit, setPageLimit] = useQueryState('limit', {
    history: 'replace',
  });
  const [orderBy, setOrderBy] = useQueryState('orderBy', {
    history: 'replace',
    defaultValue: 'last_seen',
  });
  const [orderDirection, setOrderDirection] = useQueryState('orderDirection', {
    history: 'replace',
    defaultValue: 'desc',
  });
  const [unauthorizedOnly, setUnauthorizedOnly] = useQueryState(
    'unauthorizedOnly',
    {
      history: 'replace',
      parse: (value) => value === 'true' || value === '1' || value === 'yes',
      serialize: (value) => (value ? 'true' : ''),
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [dailyRuns, setDailyRuns] = useState<DailyRunsSummary | null>(null);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [deauthorizingId, setDeauthorizingId] = useState<string | null>(null);

  const canSearch = isSessionVerified && hasValidSession;

  const loadPlayerDetail = useCallback(
    async (endpoint: string) => {
      if (!canSearch) return;
      setLoading(true);
      setError(null);
      setPlayer(null);
      setDailyRuns(null);
      try {
        const res = await fetch(endpoint, { credentials: 'include' });
        if (res.status === 401) {
          setError('Unauthorized');
          return;
        }
        if (res.status === 403) {
          setError('Forbidden: wallet not on admin allowlist');
          return;
        }
        if (res.status === 404) {
          setError('Player not found');
          return;
        }
        if (!res.ok) {
          const payload = await res
            .json()
            .catch(() => ({ error: 'Failed to load player' }));
          setError(payload.error || 'Failed to load player');
          return;
        }
        const payload = (await res.json()) as {
          player: PlayerRecord;
          dailyRuns?: DailyRunsSummary | null;
        };
        setPlayer(payload.player);
        setDailyRuns(payload.dailyRuns ?? null);
      } catch (e) {
        setError('Failed to load player');
      } finally {
        setLoading(false);
      }
    },
    [canSearch]
  );

  const handleSearch = useCallback(async () => {
    if (!canSearch) return;
    const normalizedId = (id || '').trim();
    const normalizedWallet = (wallet || '').trim();
    if (!normalizedId && !normalizedWallet) {
      setError('Enter a player id or wallet address');
      return;
    }
    const endpoint = normalizedId
      ? `${serverBaseUrl}/api/admin/players/by-id/${encodeURIComponent(normalizedId)}`
      : `${serverBaseUrl}/api/admin/players/by-wallet/${encodeURIComponent(normalizedWallet)}`;
    await loadPlayerDetail(endpoint);
  }, [canSearch, id, wallet, serverBaseUrl, loadPlayerDetail]);

  const fetchPlayers = useCallback(async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    setPlayer(null);
    setDailyRuns(null);
    try {
      const limit = Math.max(
        1,
        Math.min(200, Number(pageLimit) || DEFAULT_PAGE_LIMIT)
      );
      const offset = Math.max(0, Number(pageOffset) || 0);
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      params.set('orderBy', orderBy || 'last_seen');
      params.set(
        'orderDirection',
        (orderDirection || 'desc') === 'asc' ? 'asc' : 'desc'
      );
      if (unauthorizedOnly) {
        params.set('unauthorizedOnly', 'true');
      }
      const res = await fetch(
        `${serverBaseUrl}/api/admin/players?${params.toString()}`,
        {
          credentials: 'include',
        }
      );
      if (res.status === 401) {
        setError('Unauthorized');
        return;
      }
      if (res.status === 403) {
        setError('Forbidden: wallet not on admin allowlist');
        return;
      }
      if (!res.ok) {
        const payload = await res
          .json()
          .catch(() => ({ error: 'Failed to load players' }));
        setError(payload.error || 'Failed to load players');
        return;
      }
      const payload = (await res.json()) as {
        players: PlayerRecord[];
        pagination: { limit: number; offset: number; total: number };
      };
      setPlayers(payload.players || []);
      setTotal(
        Number.isFinite(payload.pagination?.total)
          ? payload.pagination.total
          : null
      );
    } catch (e) {
      setError('Failed to load players');
    } finally {
      setLoading(false);
    }
  }, [
    canSearch,
    pageLimit,
    pageOffset,
    orderBy,
    orderDirection,
    unauthorizedOnly,
    serverBaseUrl,
  ]);

  const handleAuthorize = useCallback(
    async (playerId: string) => {
      if (!canSearch) return;
      setAuthorizingId(playerId);
      try {
        const res = await fetch(
          `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId)}/authorize`,
          {
            method: 'POST',
            credentials: 'include',
          }
        );
        if (res.status === 401) {
          setError('Unauthorized');
          return;
        }
        if (res.status === 403) {
          setError('Forbidden: wallet not on admin allowlist');
          return;
        }
        if (!res.ok) {
          const payload = await res
            .json()
            .catch(() => ({ error: 'Failed to authorize player' }));
          setError(payload.error || 'Failed to authorize player');
          return;
        }
        // Refresh the players list
        await fetchPlayers();
        // If the authorized player was selected, update it
        if (player?.id === playerId) {
          const playerRes = await fetch(
            `${serverBaseUrl}/api/admin/players/by-id/${encodeURIComponent(playerId)}`,
            { credentials: 'include' }
          );
          if (playerRes.ok) {
          const payload = (await playerRes.json()) as {
            player: PlayerRecord;
            dailyRuns?: DailyRunsSummary | null;
          };
          setPlayer(payload.player);
          setDailyRuns(payload.dailyRuns ?? null);
          }
        }
      } catch (e) {
        setError('Failed to authorize player');
      } finally {
        setAuthorizingId(null);
      }
    },
    [canSearch, serverBaseUrl, fetchPlayers, player?.id]
  );

  const handleDeauthorize = useCallback(
    async (playerId: string) => {
      if (!canSearch) return;
      if (
        typeof window !== 'undefined' &&
        !window.confirm(
          'Deauthorize this player? They will need to be re-authorized before playing again.'
        )
      ) {
        return;
      }
      setDeauthorizingId(playerId);
      try {
        const res = await fetch(
          `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId)}/deauthorize`,
          {
            method: 'POST',
            credentials: 'include',
          }
        );
        if (res.status === 401) {
          setError('Unauthorized');
          return;
        }
        if (res.status === 403) {
          setError('Forbidden: wallet not on admin allowlist');
          return;
        }
        if (!res.ok) {
          const payload = await res
            .json()
            .catch(() => ({ error: 'Failed to deauthorize player' }));
          setError(payload.error || 'Failed to deauthorize player');
          return;
        }
        await fetchPlayers();
        if (player?.id === playerId) {
          const playerRes = await fetch(
            `${serverBaseUrl}/api/admin/players/by-id/${encodeURIComponent(playerId)}`,
            { credentials: 'include' }
          );
          if (playerRes.ok) {
          const payload = (await playerRes.json()) as {
            player: PlayerRecord;
            dailyRuns?: DailyRunsSummary | null;
          };
          setPlayer(payload.player);
          setDailyRuns(payload.dailyRuns ?? null);
          }
        }
      } catch (e) {
        setError('Failed to deauthorize player');
      } finally {
        setDeauthorizingId(null);
      }
    },
    [canSearch, serverBaseUrl, fetchPlayers, player?.id]
  );

  const currentOffset = Math.max(0, Number(pageOffset) || 0);
  const limitNumber = Math.max(
    1,
    Math.min(200, Number(pageLimit) || DEFAULT_PAGE_LIMIT)
  );
  const currentPage = Math.floor(currentOffset / limitNumber) + 1;
  const totalPages = total ? Math.ceil(total / limitNumber) : null;

  const handleNextPage = useCallback(() => {
    const next = currentOffset + limitNumber;
    const hasMore =
      total == null ? players.length === limitNumber : next < (total || 0);
    if (!hasMore) return;
    setPageOffset(String(next));
  }, [currentOffset, limitNumber, total, players.length, setPageOffset]);

  const handlePrevPage = useCallback(() => {
    const prev = Math.max(0, currentOffset - limitNumber);
    if (prev === currentOffset) return;
    setPageOffset(String(prev));
  }, [currentOffset, limitNumber, setPageOffset]);

  function makeSortable(label: string, key: string) {
    const isActive = orderBy === key;
    const dir = (orderDirection || 'desc') === 'asc' ? 'asc' : 'desc';
    const nextDir = isActive && dir === 'desc' ? 'asc' : 'desc';
    return (
      <button
        className={`flex items-center gap-1 ${isActive ? 'text-white' : ''}`}
        onClick={() => {
          setOrderBy(key);
          setOrderDirection(nextDir);
          setPageOffset('0');
        }}
      >
        <span>{label}</span>
        {isActive ? <span>{dir === 'desc' ? '▼' : '▲'}</span> : null}
      </button>
    );
  }

  useEffect(() => {
    if (!canSearch) return;
    fetchPlayers().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canSearch,
    pageOffset,
    pageLimit,
    orderBy,
    orderDirection,
    unauthorizedOnly,
  ]);

  // Resolve ENS names for listed players and selected player using hook
  const ensAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      if (p.walletAddress) set.add(p.walletAddress);
    }
    if (player?.walletAddress) set.add(player.walletAddress);
    return Array.from(set);
  }, [players, player?.walletAddress]);
  const { ensByAddress } = useEnsNames(ensAddresses);
  const stakeFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    []
  );
  const dailyRunsTotalStaked = useMemo(() => {
    if (!dailyRuns) return null;
    const totalRaw = Number(dailyRuns.totalStaked);
    if (Number.isFinite(totalRaw)) return totalRaw;
    const usdc = Number(dailyRuns.usdcStaked) || 0;
    const gho = Number(dailyRuns.ghoStaked) || 0;
    return usdc + gho;
  }, [dailyRuns]);
  const formatStakeValue = useCallback(
    (value: number | null | undefined) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? stakeFormatter.format(numeric) : '0';
    },
    [stakeFormatter]
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono">
      <header className="border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Players</h1>
            <p className="text-sm text-slate-400">Lookup by id or wallet.</p>
          </div>
          <div className="text-xs text-slate-400 flex gap-4">
            <Link href="/admin" className="hover:text-white">
              Back to Admin
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6">
        {!isSessionVerified ? (
          <div className="text-sm text-slate-400">Verifying session…</div>
        ) : !hasValidSession ? (
          <div className="text-sm text-slate-300">
            Connect wallet to access admin tools.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-400">
                    Player ID
                  </label>
                  <input
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                    placeholder="uuid"
                    value={id || ''}
                    onChange={(e) => setId(e.target.value || null)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-400">
                    Wallet
                  </label>
                  <input
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                    placeholder="0x…"
                    value={wallet || ''}
                    onChange={(e) => setWallet(e.target.value || null)}
                  />
                </div>
                <div className="md:col-span-2 flex gap-2">
                  <Button onClick={handleSearch} disabled={loading}>
                    {loading ? 'Searching…' : 'Search'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setId(null);
                      setWallet(null);
                      setPlayer(null);
                      setDailyRuns(null);
                      setError(null);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {error ? (
                <div className="mt-3 text-sm text-red-400">{error}</div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-900 p-4">
                <div>
                  <div className="text-lg font-semibold">
                    {unauthorizedOnly ? 'Unauthorized Players' : 'Players'}
                  </div>
                  <div className="text-xs text-slate-400">
                    Page {currentPage}
                    {totalPages ? ` of ${totalPages}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    variant={unauthorizedOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setUnauthorizedOnly(!unauthorizedOnly);
                      setPageOffset('0');
                    }}
                  >
                    {unauthorizedOnly ? 'Show All' : 'Unauthorized Only'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentOffset === 0 || loading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={
                      loading ||
                      (total != null
                        ? currentOffset + limitNumber >= (total || 0)
                        : players.length < limitNumber)
                    }
                  >
                    Next
                  </Button>
                  <select
                    className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                    value={String(limitNumber)}
                    onChange={(e) =>
                      setPageLimit(
                        String(
                          Math.max(
                            1,
                            Math.min(200, Number(e.target.value) || DEFAULT_PAGE_LIMIT)
                          )
                        )
                      )
                    }
                  >
                    {[25, 50, 100, 200].map((n) => (
                      <option key={n} value={n}>
                        {n}/page
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchPlayers().catch(() => {})}
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="p-4">
                {loading && players.length === 0 ? (
                  <div className="text-sm text-slate-400">Loading players…</div>
                ) : players.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    No players found.
                  </div>
                ) : (
                  <div className="overflow-auto rounded-md border border-slate-900">
                    <table className="min-w-full text-left text-xs text-slate-200">
                      <thead className="bg-slate-900 text-slate-300">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Username</th>
                          <th className="px-3 py-2 font-semibold">Wallet</th>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">
                            {makeSortable('Created', 'created_at')}
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            {makeSortable('Level', 'level')}
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            {makeSortable('XP', 'total_xp')}
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            {makeSortable('Last Seen', 'last_seen')}
                          </th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p) => (
                          <tr
                            key={p.id}
                            className="border-b border-slate-900/60 hover:bg-slate-900"
                          >
                            <td className="px-3 py-2">{p.username || '—'}</td>
                            <td className="px-3 py-2" title={p.walletAddress}>
                              <div className="flex flex-col">
                                <span className="text-slate-200">
                                  {ensByAddress[p.walletAddress] ||
                                    shortenAddress(p.walletAddress)}
                                </span>
                                {ensByAddress[p.walletAddress] ? (
                                  <span className="text-[10px] text-slate-500">
                                    {shortenAddress(p.walletAddress)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2" title={p.emailAddress || ''}>
                              <span className="text-slate-200">
                                {p.emailAddress || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {p.createdAt ? (
                                <time
                                  dateTime={p.createdAt}
                                  title={p.createdAt}
                                >
                                  {formatRelativeTime(p.createdAt)}
                                </time>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2">{p.level ?? '—'}</td>
                            <td className="px-3 py-2">{p.totalXp ?? '—'}</td>
                            <td className="px-3 py-2">
                              {p.lastSeen ? (
                                <time dateTime={p.lastSeen} title={p.lastSeen}>
                                  {formatRelativeTime(p.lastSeen)}
                                </time>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                <span
                                  className={
                                    p.isAuthorized
                                      ? 'text-green-400'
                                      : 'text-yellow-400'
                                  }
                                >
                                  {p.isAuthorized
                                    ? '✓ Authorized'
                                    : 'Unauthorized'}
                                </span>
                                {p.accessGrantedAt && (
                                  <span className="text-[10px] text-slate-500">
                                    {formatRelativeTime(p.accessGrantedAt)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setId(p.id);
                                    setWallet(null);
                                    const endpoint = `${serverBaseUrl}/api/admin/players/by-id/${encodeURIComponent(
                                      p.id
                                    )}`;
                                    void loadPlayerDetail(endpoint);
                                  }}
                                >
                                  View
                                </Button>
                                {p.isAuthorized ? (
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeauthorize(p.id)}
                                    disabled={deauthorizingId === p.id || loading}
                                  >
                                    {deauthorizingId === p.id
                                      ? 'Deauthorizing…'
                                      : 'Deauthorize'}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleAuthorize(p.id)}
                                    disabled={authorizingId === p.id || loading}
                                  >
                                    {authorizingId === p.id
                                      ? 'Authorizing…'
                                      : 'Authorize'}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">
                      Showing {currentOffset + 1}-
                      {currentOffset + players.length}
                      {total ? ` of ${total}` : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="text-sm text-slate-400">
              Select a player and click View to open details.
            </div>
            <Dialog
              open={player !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setPlayer(null);
                  setDailyRuns(null);
                }
              }}
            >
              {player ? (
                <DialogContent
                  style={{ top: '50%', bottom: 'auto' }}
                  className="w-[95vw] max-w-6xl border-slate-800 bg-slate-950 text-slate-100"
                >
                  <DialogHeader>
                    <DialogTitle className="text-white">
                      {player.username || 'Unnamed Player'}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-[11px] text-slate-400">
                      {player.id}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                    {player.isAuthorized ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeauthorize(player.id)}
                        disabled={deauthorizingId === player.id || loading}
                      >
                        {deauthorizingId === player.id
                          ? 'Deauthorizing…'
                          : 'Deauthorize'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleAuthorize(player.id)}
                        disabled={authorizingId === player.id || loading}
                      >
                        {authorizingId === player.id
                          ? 'Authorizing…'
                          : 'Authorize'}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                        Profile
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Wallet</dt>
                          <dd
                            className="text-slate-200"
                            title={player.walletAddress}
                          >
                            {ensByAddress[player.walletAddress]
                              ? `${ensByAddress[player.walletAddress]} (${shortenAddress(player.walletAddress)})`
                              : player.walletAddress}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Email</dt>
                          <dd className="text-slate-200">
                            {player.emailAddress || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Region</dt>
                          <dd className="text-slate-200">
                            {player.region || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Authorized</dt>
                          <dd className="text-slate-200">
                            {player.isAuthorized ? 'Yes' : 'No'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Access Granted</dt>
                          <dd className="text-slate-200">
                            {player.accessGrantedAt
                              ? formatRelativeTime(player.accessGrantedAt)
                              : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Banned</dt>
                          <dd className="text-slate-200">
                            {player.isBanned ? 'Yes' : 'No'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                        Progression
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Level</dt>
                          <dd className="text-slate-200">
                            {player.level ?? '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Total XP</dt>
                          <dd className="text-slate-200">
                            {player.totalXp ?? '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Unspent</dt>
                          <dd className="text-slate-200">
                            {player.unspentPoints ?? '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Lick Tongues</dt>
                          <dd className="text-slate-200">
                            {player.lickTongueCount ?? '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                        Preferences
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Character</dt>
                          <dd className="text-slate-200">
                            {player.selectedCharacterId || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Difficulty</dt>
                          <dd className="text-slate-200">
                            {player.selectedDifficultyTier || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Avatar</dt>
                          <dd className="text-slate-200">
                            {player.avatarId || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                        Daily Runs
                      </div>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Runs/day</dt>
                          <dd className="text-slate-200">
                            {dailyRuns
                              ? dailyRuns.enabled
                                ? dailyRuns.allowedRuns
                                : 'Disabled'
                              : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">Total staked</dt>
                          <dd className="text-slate-200">
                            {dailyRunsTotalStaked != null
                              ? `${formatStakeValue(dailyRunsTotalStaked)} USDC/GHO`
                              : '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-400">USDC / GHO</dt>
                          <dd className="text-slate-200">
                            {dailyRuns
                              ? `${formatStakeValue(
                                  dailyRuns.usdcStaked
                                )} / ${formatStakeValue(dailyRuns.ghoStaked)}`
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-900 pt-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">
                      Raw
                    </div>
                    <pre className="max-h-[32vh] overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-200">
                      {JSON.stringify(player, null, 2)}
                    </pre>
                  </div>
                </DialogContent>
              ) : null}
            </Dialog>
          </div>
        )}
      </main>
    </div>
  );
}
