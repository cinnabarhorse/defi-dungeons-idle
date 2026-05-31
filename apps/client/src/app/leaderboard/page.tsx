'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getAppServerBaseUrl } from '../../lib/server-url';
import { SplashBackground } from '../../components/SplashBackground';
import { Leaderboard } from '../../components/leaderboard/Leaderboard';
import { TopRuns } from '../../components/leaderboard/TopRuns';
import type { LeaderboardEntry } from '../../types/leaderboard';
import { cn } from '../../lib/utils';

// ──────────────────────────────────────────────────────────────────────────────
// Date Utilities
// ──────────────────────────────────────────────────────────────────────────────

/** Get today's competition date in YYYY-MM-DD format (UTC) */
function getTodayUTC(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/** Format a date string for display */
function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Get the previous day in YYYY-MM-DD format */
function getPreviousDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
}

/** Get the next day in YYYY-MM-DD format */
function getNextDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split('T')[0];
}

// ──────────────────────────────────────────────────────────────────────────────
// Daily Quest Competition Types
// ──────────────────────────────────────────────────────────────────────────────

type CompetitionTier = 'normal' | 'nightmare' | 'hell';

interface DQLeaderboardEntry {
  rank: number;
  playerName: string | null;
  gotchiId: string | null;
  rawScore: number;
  timeMultiplier: number;
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
  finalScore: number;
  completedAt: string;
  accountId: string;
  walletAddress: string | null;
}

interface TierLeaderboard {
  tier: CompetitionTier;
  date: string;
  entries: DQLeaderboardEntry[];
  totalEntries: number;
  prizePool: { usdc: number; ghst: number };
  prizes: Array<{
    position: number;
    usdc: number;
    ghst: number;
    share: number;
  }>;
}

interface MultiplierStatus {
  currentMultiplier: number;
  hoursSinceReset: number;
  minutesUntilNextTier: number | null;
  nextTierMultiplier: number | null;
}

interface LeaderboardSummary {
  date: string;
  multiplierStatus: MultiplierStatus;
  tiers: Record<
    CompetitionTier,
    {
      totalEntries: number;
      topEntries: Array<{
        rank: number;
        playerName: string | null;
        finalScore: number;
      }>;
      prizePool: { usdc: number; ghst: number };
    }
  >;
}

// ──────────────────────────────────────────────────────────────────────────────
// Daily Quest API Functions
// ──────────────────────────────────────────────────────────────────────────────

async function fetchDQLeaderboardSummary(
  date?: string
): Promise<LeaderboardSummary> {
  const baseUrl = getAppServerBaseUrl();
  const url = new URL(`${baseUrl}/api/daily-quest/leaderboards`);
  if (date) {
    url.searchParams.set('date', date);
  }
  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load leaderboard summary');
  }

  return response.json();
}

async function fetchDQTierLeaderboard(
  tier: CompetitionTier,
  date?: string
): Promise<TierLeaderboard> {
  const baseUrl = getAppServerBaseUrl();
  const url = new URL(`${baseUrl}/api/daily-quest/leaderboard/${tier}`);
  url.searchParams.set('limit', '100');
  if (date) {
    url.searchParams.set('date', date);
  }
  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${tier} leaderboard`);
  }

  return response.json();
}

// ──────────────────────────────────────────────────────────────────────────────
// Adventurer Leaderboard Types & API
// ──────────────────────────────────────────────────────────────────────────────

interface LeaderboardResponse {
  players?: LeaderboardEntry[];
}

async function fetchLeaderboard(
  sortBy: 'level' | 'usdc'
): Promise<LeaderboardEntry[]> {
  const baseUrl = getAppServerBaseUrl();
  const url = new URL(`${baseUrl}/api/leaderboard`);
  url.searchParams.set('sortBy', sortBy);

  const response = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load leaderboard');
  }

  const data = (await response.json()) as LeaderboardResponse;
  if (!data || !Array.isArray(data.players)) {
    return [];
  }

  return data.players.map((entry) => ({
    ...entry,
    level: Math.max(1, Number(entry.level) || 1),
  }));
}

interface TopRun {
  id: string;
  gameId: string;
  playerId: string;
  playerWalletAddress?: string | null;
  playerUsername?: string | null;
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
  levelBefore: number | null;
  levelAfter: number | null;
  status: 'completed' | 'abandoned' | 'game_ended' | 'in_progress';
  region: string | null;
}

async function fetchTopRuns(): Promise<TopRun[]> {
  const baseUrl = getAppServerBaseUrl();
  const url = new URL(`${baseUrl}/api/leaderboard/top-runs`);
  url.searchParams.set('limit', '100');
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load top runs');
  }
  const data = (await response.json()) as { runs?: TopRun[] } | null;
  return Array.isArray(data?.runs) ? data!.runs : [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Reset Countdown Hook
// ──────────────────────────────────────────────────────────────────────────────

function useResetCountdown() {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    function calculateTimeLeft() {
      const now = new Date();
      const utcNow = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours(),
          now.getUTCMinutes(),
          now.getUTCSeconds()
        )
      );
      const nextMidnight = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
          0,
          0,
          0
        )
      );
      const diff = nextMidnight.getTime() - utcNow.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return { hours, minutes, seconds };
    }

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return timeLeft;
}

// ──────────────────────────────────────────────────────────────────────────────
// Score Formatter
// ──────────────────────────────────────────────────────────────────────────────

const scoreFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

// ──────────────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  // View mode: 'competition' (default) or 'adventurer'
  const [viewMode, setViewMode] = useState<'competition' | 'adventurer'>(
    'competition'
  );

  // Daily Quest Competition state
  const [selectedTier, setSelectedTier] = useState<CompetitionTier>('normal');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayUTC);
  const [summary, setSummary] = useState<LeaderboardSummary | null>(null);
  const [tierData, setTierData] = useState<TierLeaderboard | null>(null);
  const [dqLoading, setDqLoading] = useState(true);
  const [dqError, setDqError] = useState<string | null>(null);

  // Computed date states
  const todayUTC = useMemo(() => getTodayUTC(), []);
  const isToday = selectedDate === todayUTC;
  const canGoForward = selectedDate < todayUTC;
  const competitionRows = useMemo(() => {
    if (!tierData) return [];
    const entriesByRank = new Map(tierData.entries.map((entry) => [entry.rank, entry]));
    return tierData.prizes.map((prize) => ({
      prize,
      entry: entriesByRank.get(prize.position) ?? null,
    }));
  }, [tierData]);

  // Adventurer leaderboard state
  const [sortBy, setSortBy] = useState<'level' | 'usdc' | 'top_runs'>(
    'top_runs'
  );
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [runs, setRuns] = useState<TopRun[]>([]);
  const [advLoading, setAdvLoading] = useState(false);
  const [advError, setAdvError] = useState<string | null>(null);

  const timeLeft = useResetCountdown();

  // Load Daily Quest Competition data
  const loadDQData = useCallback(async () => {
    setDqLoading(true);
    setDqError(null);
    try {
      const [summaryData, tierLeaderboard] = await Promise.all([
        fetchDQLeaderboardSummary(selectedDate),
        fetchDQTierLeaderboard(selectedTier, selectedDate),
      ]);
      setSummary(summaryData);
      setTierData(tierLeaderboard);
    } catch (err) {
      setDqError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setDqLoading(false);
    }
  }, [selectedTier, selectedDate]);

  // Load DQ data on mount and when tier or date changes
  useEffect(() => {
    loadDQData();
  }, [loadDQData]);

  // Auto-refresh DQ data every 30 seconds (only for today's leaderboard)
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(loadDQData, 30000);
    return () => clearInterval(interval);
  }, [loadDQData, isToday]);

  // Date navigation handlers
  const handlePreviousDay = useCallback(() => {
    setSelectedDate((prev) => getPreviousDay(prev));
  }, []);

  const handleNextDay = useCallback(() => {
    if (canGoForward) {
      setSelectedDate((prev) => getNextDay(prev));
    }
  }, [canGoForward]);

  const handleGoToToday = useCallback(() => {
    setSelectedDate(getTodayUTC());
  }, []);

  // Load adventurer leaderboard when switching to that view
  useEffect(() => {
    if (viewMode !== 'adventurer') return;

    setAdvLoading(true);
    setAdvError(null);

    if (sortBy === 'top_runs') {
      fetchTopRuns()
        .then((data) => {
          setRuns(data);
          setAdvLoading(false);
        })
        .catch((error) => {
          setAdvError(error instanceof Error ? error.message : 'Unknown error');
          setAdvLoading(false);
        });
    } else {
      fetchLeaderboard(sortBy)
        .then((data) => {
          setPlayers(data);
          setAdvLoading(false);
        })
        .catch((error) => {
          setAdvError(error instanceof Error ? error.message : 'Unknown error');
          setAdvLoading(false);
        });
    }
  }, [viewMode, sortBy]);

  const tierLabels: Record<CompetitionTier, string> = {
    normal: '⚡ Normal',
    nightmare: '💀 Nightmare',
    hell: '🔥 Hell',
  };

  return (
    <SplashBackground as="main" className="text-white pb-20">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8 backdrop-blur">
        {viewMode === 'competition' ? (
          <>
            {/* Daily Quest Competition Header */}
            <header className="text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/70">
                DeFi Dungeon
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl flex items-center justify-center gap-3">
                <span className="text-4xl">🏆</span>
                Daily Quest Competition
              </h1>
              <p className="mt-4 text-sm text-white/70 sm:text-base">
                Compete for daily prizes! Top 10 players in each tier win USDC
                &amp; GHST.
              </p>
              <p className="mt-2">
                <button
                  onClick={() => setViewMode('adventurer')}
                  className="text-sm text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
                >
                  View Adventurer Leaderboards
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </p>

              {/* Date Navigation */}
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={handlePreviousDay}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-4 py-2 min-w-[180px] justify-center">
                  <Calendar className="h-4 w-4 text-amber-400" />
                  <span className="font-medium text-white">
                    {formatDateForDisplay(selectedDate)}
                  </span>
                  {isToday && (
                    <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                      Today
                    </span>
                  )}
                </div>

                <button
                  onClick={handleNextDay}
                  disabled={!canGoForward}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                    canGoForward
                      ? 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                      : 'bg-white/5 text-white/20 cursor-not-allowed'
                  )}
                  aria-label="Next day"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                {!isToday && (
                  <button
                    onClick={handleGoToToday}
                    className="ml-2 rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30 transition-colors"
                  >
                    Back to Today
                  </button>
                )}
              </div>

              {/* Reset Countdown (only show for today) */}
              {isToday && timeLeft && (
                <div
                  className={cn(
                    'mt-6 inline-flex flex-col items-center gap-1 rounded-2xl border px-6 py-3',
                    timeLeft.hours < 1
                      ? 'border-red-500/50 bg-gradient-to-r from-red-500/20 to-orange-500/20'
                      : 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10'
                  )}
                >
                  <span className="text-sm text-white/70">
                    Daily competition ends in
                  </span>
                  <span
                    className={cn(
                      'font-mono text-2xl font-bold',
                      timeLeft.hours < 1 ? 'text-red-400' : 'text-amber-400'
                    )}
                  >
                    {String(timeLeft.hours).padStart(2, '0')}:
                    {String(timeLeft.minutes).padStart(2, '0')}:
                    {String(timeLeft.seconds).padStart(2, '0')}
                  </span>
                </div>
              )}

              {/* Historical data notice */}
              {!isToday && (
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">
                  <Calendar className="h-4 w-4" />
                  Viewing historical leaderboard for{' '}
                  {formatDateForDisplay(selectedDate)}
                </div>
              )}
            </header>

            {/* Tier Tabs */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-full bg-black/40 p-1 border border-white/10 backdrop-blur">
                {(['normal', 'nightmare', 'hell'] as CompetitionTier[]).map(
                  (tier) => (
                    <button
                      key={tier}
                      aria-pressed={selectedTier === tier}
                      className={cn(
                        'px-4 py-2 text-sm rounded-full transition-colors font-medium',
                        selectedTier === tier
                          ? 'bg-amber-600/30 text-white border border-amber-500/30'
                          : 'text-gray-300 hover:text-white'
                      )}
                      onClick={() => setSelectedTier(tier)}
                    >
                      {tierLabels[tier]}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Multiplier Status (only show for today) */}
            {isToday && summary?.multiplierStatus && (
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 px-6 py-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">
                      {summary.multiplierStatus.currentMultiplier.toFixed(2)}×
                    </div>
                    <div className="text-xs text-white/60">Current Bonus</div>
                  </div>
                  {summary.multiplierStatus.minutesUntilNextTier !== null &&
                    summary.multiplierStatus.nextTierMultiplier !== null && (
                      <div className="text-sm text-white/50 border-l border-white/10 pl-4">
                        Drops to{' '}
                        <span className="text-amber-400 font-mono">
                          {summary.multiplierStatus.nextTierMultiplier.toFixed(
                            2
                          )}
                          ×
                        </span>{' '}
                        in{' '}
                        <span className="text-amber-400 font-mono">
                          {Math.floor(
                            summary.multiplierStatus.minutesUntilNextTier / 60
                          )}
                          h {summary.multiplierStatus.minutesUntilNextTier % 60}
                          m
                        </span>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Prize Pool Info */}
            {tierData && (
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-6 rounded-xl bg-white/5 border border-white/10 px-6 py-3">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">
                      ${tierData.prizePool.usdc.toFixed(2)}
                    </div>
                    <div className="text-xs text-white/60">USDC Pool</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-400">
                      {tierData.prizePool.ghst.toFixed(2)}
                    </div>
                    <div className="text-xs text-white/60">GHST Pool</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">
                      {tierData.totalEntries}
                    </div>
                    <div className="text-xs text-white/60">Players</div>
                  </div>
                </div>
              </div>
            )}

            {/* Leaderboard Table */}
            <section className="overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-b from-amber-900/10 to-transparent shadow-2xl shadow-amber-900/10 backdrop-blur">
              {dqLoading ? (
                <div className="px-8 py-16 text-center text-white/70">
                  <p className="text-lg font-medium">Loading competition...</p>
                </div>
              ) : dqError ? (
                <div className="px-8 py-16 text-center text-red-400">
                  <p className="text-lg font-medium">{dqError}</p>
                </div>
              ) : tierData && competitionRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/50">
                        <th className="px-4 py-4 font-medium">Rank</th>
                        <th className="px-2 py-4 font-medium">Player</th>
                        <th className="px-2 py-4 font-medium text-right">
                          Score
                        </th>
                        <th className="px-2 py-4 font-medium text-right">
                          Multiplier
                        </th>
                        <th className="px-4 py-4 font-medium text-right">
                          Prize
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitionRows.map(({ prize, entry }) => {
                        const rank = prize.position;
                        return (
                          <tr
                            key={entry?.accountId ?? `slot-${rank}`}
                            className={cn(
                              'border-b border-white/5 transition-colors hover:bg-white/5',
                              rank <= 3 && 'bg-amber-500/5'
                            )}
                          >
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                                  rank === 1 && 'bg-amber-500 text-black',
                                  rank === 2 && 'bg-gray-300 text-black',
                                  rank === 3 && 'bg-amber-700 text-white',
                                  rank > 3 && 'bg-white/10 text-white/70'
                                )}
                              >
                                {rank}
                              </span>
                            </td>
                            <td className="px-2 py-3">
                              {entry ? (
                                <div className="flex flex-col">
                                  <span className="font-medium text-white">
                                    {entry.playerName ||
                                      `Player ${entry.accountId.slice(0, 8)}`}
                                  </span>
                                  {entry.walletAddress && (
                                    <span className="text-xs text-white/40 font-mono">
                                      {entry.walletAddress.slice(0, 6)}...
                                      {entry.walletAddress.slice(-4)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="h-5">
                                  <span className="sr-only">Unfilled slot</span>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-3 text-right">
                              {entry ? (
                                <span className="font-mono text-amber-300">
                                  {scoreFormatter.format(entry.finalScore)}
                                </span>
                              ) : (
                                <span className="font-mono text-white/30">—</span>
                              )}
                            </td>
                            <td className="px-2 py-3 text-right">
                              {entry ? (
                                <div className="flex flex-col items-end">
                                  <span
                                    className={cn(
                                      'font-mono text-xs',
                                      entry.timeMultiplier *
                                        (entry.gotchiBonusMultiplier ?? 1) >
                                        1
                                        ? 'text-green-400'
                                        : 'text-white/50'
                                    )}
                                  >
                                    {(
                                      entry.timeMultiplier *
                                      (entry.gotchiBonusMultiplier ?? 1)
                                    ).toFixed(2)}
                                    ×
                                  </span>
                                  {entry.isRealGotchi && (
                                    <span className="text-[10px] text-emerald-300">
                                      +25% gotchi
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="font-mono text-xs text-white/30">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end text-xs">
                                <span className="text-green-400">
                                  ${prize.usdc.toFixed(2)}
                                </span>
                                <span className="text-purple-400">
                                  {prize.ghst.toFixed(2)} GHST
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-8 py-16 text-center text-white/50">
                  <p className="text-lg">
                    No entries for {tierLabels[selectedTier]}
                  </p>
                  <p className="mt-2 text-sm">
                    {isToday
                      ? 'Be the first to compete today!'
                      : `No competitions were recorded on ${formatDateForDisplay(selectedDate)}`}
                  </p>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            {/* Adventurer Leaderboard View */}
            <header className="text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-violet-300/70">
                DeFi Dungeon
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Adventurer Leaderboard
              </h1>
              <p className="mt-4 text-sm text-white/70 sm:text-base">
                Live snapshot of top players and runs across the dungeon.
              </p>
              <p className="mt-2">
                <button
                  onClick={() => setViewMode('competition')}
                  className="text-sm text-amber-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1"
                >
                  <svg
                    className="h-3 w-3 rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  Back to Daily Quest Competition
                </button>
              </p>
            </header>

            <div className="flex justify-center">
              <div className="inline-flex rounded-full bg-black/40 p-1 border border-white/10 backdrop-blur">
                <button
                  aria-pressed={sortBy === 'usdc'}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-full transition-colors',
                    sortBy === 'usdc'
                      ? 'bg-purple-600/30 text-white border border-purple-500/30'
                      : 'text-gray-300 hover:text-white'
                  )}
                  onClick={() => setSortBy('usdc')}
                >
                  Most Earned
                </button>
                <button
                  aria-pressed={sortBy === 'level'}
                  className={cn(
                    'ml-1 px-3 py-1.5 text-sm rounded-full transition-colors',
                    sortBy === 'level'
                      ? 'bg-purple-600/30 text-white border border-purple-500/30'
                      : 'text-gray-300 hover:text-white'
                  )}
                  onClick={() => setSortBy('level')}
                >
                  Highest Level
                </button>
                <button
                  aria-pressed={sortBy === 'top_runs'}
                  className={cn(
                    'ml-1 px-3 py-1.5 text-sm rounded-full transition-colors',
                    sortBy === 'top_runs'
                      ? 'bg-purple-600/30 text-white border border-purple-500/30'
                      : 'text-gray-300 hover:text-white'
                  )}
                  onClick={() => setSortBy('top_runs')}
                >
                  Top Scores
                </button>
              </div>
            </div>

            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-violet-900/20 backdrop-blur">
              {advLoading ? (
                <div className="px-8 py-16 text-center text-white/70">
                  <p className="text-lg font-medium">Loading leaderboard...</p>
                </div>
              ) : sortBy === 'top_runs' ? (
                <TopRuns runs={runs} error={advError} />
              ) : (
                <Leaderboard
                  players={players}
                  error={advError}
                  showCharacter={sortBy !== 'usdc'}
                />
              )}
            </section>
          </>
        )}
      </div>
    </SplashBackground>
  );
}
