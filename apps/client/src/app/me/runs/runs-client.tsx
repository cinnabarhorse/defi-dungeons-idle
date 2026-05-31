'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCharacterById } from '../../../data/characters';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { LeverageBreakdownButton } from '../../../components/runs/leverage-breakdown-button';

interface Run {
  id: string;
  gameId: string;
  score: number | null;
  difficultyTier: string | null;
  completedAt: string | null;
  durationMs: number | null;
  kills: number | null;
  xpEarned: number | null;
  validForHighScore: boolean;
  characterId: string | null;
  lickTonguesCollected: number;
  deaths: number | null;
  damageDealt: number | null;
  damageTaken: number | null;
  coinsCollected: number | null;
  usdcEarned: number | null;
  ghstEarned: number | null;
  levelBefore: number | null;
  levelAfter: number | null;
  status: 'completed' | 'abandoned' | 'game_ended' | 'in_progress';
  dailyRuns?: {
    isHighStakes?: boolean;
    runScore?: number | null;
    thresholdScore?: number | null;
  } | null;
  leverageTotal?: number | null;
  legacyLeverage?: number | null;
  tradeRunLeverage?: number | null;
  tradeRunToken?: 'BTC' | 'ETH' | 'GHST' | null;
  tradeRunDirection?: 'long' | 'short' | null;
}

interface RunsClientProps {
  initialRuns?: Run[];
  initialTotal?: number;
  initialOffset?: number;
}

const PAGE_SIZE = 50;

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatNumber(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString();
}

function getStatusBadge(run: Pick<Run, 'deaths'>): {
  label: 'WIN' | 'DEFEAT';
  className: string;
} {
  const deaths = Number(run.deaths ?? 0);
  if (Number.isFinite(deaths) && deaths > 0) {
    return {
      label: 'DEFEAT',
      className: 'bg-red-500/20 text-red-400',
    };
  }

  return {
    label: 'WIN',
    className: 'bg-green-500/20 text-green-400',
  };
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // For older dates, show actual date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '—';
  }
}

function formatCharacter(characterId: string | null): string {
  if (!characterId) return '—';
  if (characterId.startsWith('gotchi:')) {
    const gotchiId = characterId.split(':')[1] ?? '';
    return gotchiId ? `Gotchi #${gotchiId}` : 'Owned Gotchi';
  }
  const character = getCharacterById(characterId);
  if (character) {
    return character.name;
  }
  return characterId;
}

export default function RunsClient({
  initialRuns = [],
  initialTotal = 0,
  initialOffset = 0,
}: RunsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const currentOffset = useMemo(() => {
    const offset = searchParams.get('offset');
    return offset ? Math.max(0, Number(offset)) : 0;
  }, [searchParams]);

  const totalPages = useMemo(() => Math.ceil(total / PAGE_SIZE), [total]);
  const currentPage = useMemo(
    () => Math.floor(currentOffset / PAGE_SIZE) + 1,
    [currentOffset]
  );
  const hasNextPage = currentOffset + PAGE_SIZE < total;
  const hasPrevPage = currentOffset > 0;

  const fetchRuns = useCallback(async (offset: number) => {
    setIsLoading(true);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/player/runs?limit=${PAGE_SIZE}&offset=${offset}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { runs?: Run[]; total?: number };
        setRuns(data.runs ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // ignore errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // On initial mount, use server data if available
    if (!hasInitialized) {
      setHasInitialized(true);
      if (currentOffset === initialOffset && initialRuns.length > 0) {
        // We already have the correct data, don't fetch
        return;
      }
    }

    // Fetch when offset changes (handles client-side navigation)
    fetchRuns(currentOffset);
  }, [
    currentOffset,
    fetchRuns,
    hasInitialized,
    initialOffset,
    initialRuns.length,
  ]);

  const handleNextPage = useCallback(() => {
    if (!hasNextPage) return;
    const nextOffset = currentOffset + PAGE_SIZE;
    router.push(`/me/runs?offset=${nextOffset}`);
  }, [router, currentOffset, hasNextPage]);

  const handlePrevPage = useCallback(() => {
    if (!hasPrevPage) return;
    const prevOffset = Math.max(0, currentOffset - PAGE_SIZE);
    router.push(`/me/runs?offset=${prevOffset}`);
  }, [router, currentOffset, hasPrevPage]);

  if (runs.length === 0 && !isLoading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-white/60">No runs found</p>
        <p className="mt-2 text-sm text-white/40">
          Complete a dungeon run to see it here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pagination Controls */}
      {total > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-white/60">
            Showing {currentOffset + 1}–
            {Math.min(currentOffset + PAGE_SIZE, total)} of{' '}
            {total.toLocaleString()} runs
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={!hasPrevPage || isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <div className="text-sm text-white/60">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={handleNextPage}
              disabled={!hasNextPage || isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Runs Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {isLoading ? (
          <div className="p-8 text-center text-white/60">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">
                    Character
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-white/60">
                    Competition
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    Leverage
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    Score
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    Kills
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    👅 Tongues
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    XP
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">
                    Coins
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {runs.map((run) => {
                  const statusBadge = getStatusBadge(run);
                  return (
                    <tr
                      key={run.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-white/90">
                        {formatDate(run.completedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/90">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/90">
                        {formatCharacter(run.characterId)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/90">
                        {run.difficultyTier || '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-white/90">
                        {run.dailyRuns?.isHighStakes ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/90">
                        <LeverageBreakdownButton
                          leverageTotal={run.leverageTotal}
                          legacyLeverage={run.legacyLeverage}
                          tradeRunLeverage={run.tradeRunLeverage}
                          tradeRunToken={run.tradeRunToken}
                          tradeRunDirection={run.tradeRunDirection}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/90">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-white">
                        {formatNumber(run.dailyRuns?.runScore ?? run.score)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/90">
                        {formatNumber(run.kills)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/90">
                        {formatNumber(run.lickTonguesCollected)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/90">
                        {formatNumber(run.xpEarned)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/90">
                        {formatNumber(run.coinsCollected)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
