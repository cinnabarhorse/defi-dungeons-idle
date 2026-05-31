import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import AdminRunsClient from './admin-runs-client';
import { getAppServerBaseUrl } from '../../../../lib/server-url';
import { SplashBackground } from '../../../../components/SplashBackground';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Admin Runs | DeFi Dungeon',
};

interface Run {
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
  floorReached: number | null;
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
  region: string | null;
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

interface AdminRunsPageProps {
  searchParams: Promise<{ offset?: string }>;
}

export default async function AdminRunsPage({
  searchParams,
}: AdminRunsPageProps) {
  const params = await searchParams;
  const offset = params.offset ? Math.max(0, Number(params.offset)) : 0;
  const initialData = await fetchInitialRuns(offset);

  return (
    <SplashBackground as="main" className="text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 backdrop-blur">
        <header className="mb-6">
          <Link
            href="/me"
            className="text-sm text-white/60 hover:text-white/80"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Admin Runs
          </h1>
          <p className="mt-1 text-sm text-white/60">
            View all dungeon runs across all players
          </p>
        </header>

        <Suspense fallback={<div className="text-white/60">Loading…</div>}>
          <AdminRunsClient
            initialRuns={initialData.runs}
            initialTotal={initialData.total}
            initialOffset={offset}
          />
        </Suspense>
      </div>
    </SplashBackground>
  );
}

async function fetchInitialRuns(
  offset = 0
): Promise<{ runs: Run[]; total: number }> {
  const baseUrl = getAppServerBaseUrl();
  try {
    const h = headers();
    const cookie = h.get('cookie') || '';
    const res = await fetch(
      `${baseUrl}/api/admin/runs?limit=50&offset=${offset}`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: cookie ? { cookie } : undefined,
      }
    );
    if (!res.ok) return { runs: [], total: 0 };
    const data = (await res.json()) as { runs?: Run[]; total?: number } | null;
    return {
      runs: Array.isArray(data?.runs) ? (data!.runs as Run[]) : [],
      total: typeof data?.total === 'number' ? data.total : 0,
    };
  } catch {
    return { runs: [], total: 0 };
  }
}
