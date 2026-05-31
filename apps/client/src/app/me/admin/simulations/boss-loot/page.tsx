import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import SimulationSelector from './simulation-selector';
import { SplashBackground } from '../../../../../components/SplashBackground';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Boss Loot Simulations | Admin',
};

interface SimulationIndexItem {
  id: number;
  createdAt: string;
  params: {
    simulations: number;
    tiers: string[];
    currencies: Array<'USDC' | 'GHST'>;
  };
}

interface TierSummary {
  tierId: string;
  currency: 'USDC' | 'GHST';
  simulations: number;
  tierDistribution: {
    none: number;
    small: number;
    ok: number;
    good: number;
  };
  tierPercentages: {
    none: number;
    small: number;
    ok: number;
    good: number;
  };
  amountStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
    total: number;
  };
  amountStatsByTier: {
    small: { min: number; max: number; avg: number; total: number; count: number };
    ok: { min: number; max: number; avg: number; total: number; count: number };
    good: { min: number; max: number; avg: number; total: number; count: number };
  };
  baseAmountStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
  };
}

interface SimulationOutput {
  simulationId: number;
  createdAt: string;
  params: {
    simulations: number;
    tiers: string[];
    currencies: Array<'USDC' | 'GHST'>;
  };
  summaries: TierSummary[];
}

function getSimulationById(id: number): SimulationOutput | null {
  const simDir = path.resolve(process.cwd(), 'public/simulations');
  try {
    const simPath = path.join(simDir, `boss-loot_${id}.json`);
    if (!fs.existsSync(simPath)) return null;
    const data = JSON.parse(fs.readFileSync(simPath, 'utf-8'));
    return data as SimulationOutput;
  } catch {
    return null;
  }
}

function getAllSimulations(): SimulationIndexItem[] {
  const simDir = path.resolve(process.cwd(), 'public/simulations');
  try {
    const indexPath = path.join(simDir, 'boss-loot-index.json');
    if (!fs.existsSync(indexPath)) return [];
    const index: SimulationIndexItem[] = JSON.parse(
      fs.readFileSync(indexPath, 'utf-8')
    );
    return index.sort((a, b) => b.id - a.id);
  } catch {
    return [];
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateTotals(summaries: TierSummary[]): {
  totalUsdc: number;
  totalGhst: number;
  tierCounts: {
    none: number;
    small: number;
    ok: number;
    good: number;
  };
  tierUsdcValues: {
    small: number;
    ok: number;
    good: number;
  };
} {
  let totalUsdc = 0;
  let totalGhst = 0;
  const tierCounts = {
    none: 0,
    small: 0,
    ok: 0,
    good: 0,
  };
  const tierUsdcValues = {
    small: 0,
    ok: 0,
    good: 0,
  };

  for (const summary of summaries) {
    if (summary.currency === 'USDC') {
      totalUsdc += summary.amountStats.total;
      
      // Sum USDC values by tier
      tierUsdcValues.small += summary.amountStatsByTier.small.total;
      tierUsdcValues.ok += summary.amountStatsByTier.ok.total;
      tierUsdcValues.good += summary.amountStatsByTier.good.total;
    } else if (summary.currency === 'GHST') {
      totalGhst += summary.amountStats.total;
    }

    // Sum up tier counts across all summaries
    tierCounts.none += summary.tierDistribution.none;
    tierCounts.small += summary.tierDistribution.small;
    tierCounts.ok += summary.tierDistribution.ok;
    tierCounts.good += summary.tierDistribution.good;
  }

  return { totalUsdc, totalGhst, tierCounts, tierUsdcValues };
}

export default async function BossLootSimulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const simulationId = params.id ? Number(params.id) : null;
  const allSimulations = getAllSimulations();

  let data: SimulationOutput | null = null;
  if (simulationId) {
    data = getSimulationById(simulationId);
  } else if (allSimulations.length > 0) {
    data = getSimulationById(allSimulations[0].id);
  }

  if (data && !simulationId && allSimulations.length > 0) {
    redirect(`/me/admin/simulations/boss-loot?id=${data.simulationId}`);
  }

  const totals = data ? calculateTotals(data.summaries) : null;

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
            Boss Loot Simulations
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Probability-based boss currency drop analysis
          </p>
        </header>

        {!data ? (
          <div className="rounded-lg border border-white/20 bg-white/5 p-6">
            <p className="text-white/60">
              No simulation data found. Run the simulation script first:
            </p>
            <code className="mt-2 block rounded bg-black/20 p-2 text-sm">
              npm run sim:boss-loot
            </code>
          </div>
        ) : (
          <div className="space-y-6">
            <SimulationSelector
              simulations={allSimulations}
              currentId={data.simulationId}
            />

            {totals && (
              <div className="rounded-lg border border-white/20 bg-white/5 p-6">
                <h2 className="mb-4 text-xl font-semibold">Execution Summary</h2>
                <div className="grid gap-4 md:grid-cols-3 mb-4">
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">Total USDC</div>
                    <div className="text-2xl font-mono font-semibold">
                      {formatAmount(totals.totalUsdc)}
                    </div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">Total GHST</div>
                    <div className="text-2xl font-mono font-semibold">
                      {formatAmount(totals.totalGhst)}
                    </div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">Total Runs</div>
                    <div className="text-2xl font-mono font-semibold">
                      {(
                        data.params.simulations *
                        data.params.tiers.length *
                        data.params.currencies.length
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">None Drops</div>
                    <div className="text-2xl font-mono font-semibold mb-1">
                      {totals.tierCounts.none.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40">
                      Expected: 60.0% · Actual:{' '}
                      {(
                        (totals.tierCounts.none /
                          (data.params.simulations *
                            data.params.tiers.length *
                            data.params.currencies.length)) *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">Small Drops</div>
                    <div className="text-2xl font-mono font-semibold mb-1">
                      {totals.tierCounts.small.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40 mb-1">
                      Expected: 30.0% · Actual:{' '}
                      {(
                        (totals.tierCounts.small /
                          (data.params.simulations *
                            data.params.tiers.length *
                            data.params.currencies.length)) *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                    <div className="text-xs text-white/50 font-mono">
                      USDC: {formatAmount(totals.tierUsdcValues.small)}
                    </div>
                    {totals.tierCounts.small > 0 && (
                      <div className="text-xs text-white/50 font-mono">
                        Avg/Drop: {formatAmount(totals.tierUsdcValues.small / totals.tierCounts.small)}
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">OK Drops</div>
                    <div className="text-2xl font-mono font-semibold mb-1">
                      {totals.tierCounts.ok.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40 mb-1">
                      Expected: 9.0% · Actual:{' '}
                      {(
                        (totals.tierCounts.ok /
                          (data.params.simulations *
                            data.params.tiers.length *
                            data.params.currencies.length)) *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                    <div className="text-xs text-white/50 font-mono">
                      USDC: {formatAmount(totals.tierUsdcValues.ok)}
                    </div>
                    {totals.tierCounts.ok > 0 && (
                      <div className="text-xs text-white/50 font-mono">
                        Avg/Drop: {formatAmount(totals.tierUsdcValues.ok / totals.tierCounts.ok)}
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm text-white/60 mb-1">Good Drops</div>
                    <div className="text-2xl font-mono font-semibold mb-1">
                      {totals.tierCounts.good.toLocaleString()}
                    </div>
                    <div className="text-xs text-white/40 mb-1">
                      Expected: 1.0% · Actual:{' '}
                      {(
                        (totals.tierCounts.good /
                          (data.params.simulations *
                            data.params.tiers.length *
                            data.params.currencies.length)) *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                    <div className="text-xs text-white/50 font-mono">
                      USDC: {formatAmount(totals.tierUsdcValues.good)}
                    </div>
                    {totals.tierCounts.good > 0 && (
                      <div className="text-xs text-white/50 font-mono">
                        Avg/Drop: {formatAmount(totals.tierUsdcValues.good / totals.tierCounts.good)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-white/20 bg-white/5 p-4">
              <div className="text-sm text-white/60">
                Simulation #{data.simulationId} ·{' '}
                {new Date(data.createdAt).toLocaleString()} ·{' '}
                {data.params.simulations.toLocaleString()} simulations per
                tier/currency
              </div>
            </div>

            <Suspense fallback={<div className="text-white/60">Loading…</div>}>
              <BossLootSimulationsClient summaries={data.summaries} />
            </Suspense>
          </div>
        )}
      </div>
    </SplashBackground>
  );
}

function BossLootSimulationsClient({
  summaries,
}: {
  summaries: TierSummary[];
}) {
  const tiers = Array.from(new Set(summaries.map((s) => s.tierId))).sort();
  const currencies: Array<'USDC' | 'GHST'> = ['USDC', 'GHST'];

  return (
    <div className="space-y-6">
      {tiers.map((tierId) => (
        <div
          key={tierId}
          className="rounded-lg border border-white/20 bg-white/5 p-6"
        >
          <h2 className="mb-4 text-xl font-semibold">{tierId}</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {currencies.map((currency) => {
              const summary = summaries.find(
                (s) => s.tierId === tierId && s.currency === currency
              );
              if (!summary) return null;

              return (
                <div
                  key={`${tierId}-${currency}`}
                  className="rounded border border-white/10 bg-black/20 p-4"
                >
                  <h3 className="mb-3 text-lg font-medium">{currency}</h3>

                  <div className="mb-4 space-y-2">
                    <div className="text-sm font-medium">Tier Distribution</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-white/60">Nothing:</span>{' '}
                        <span className="font-mono">
                          {formatPercent(summary.tierPercentages.none)} (
                          {summary.tierDistribution.none.toLocaleString()})
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Small:</span>{' '}
                        <span className="font-mono">
                          {formatPercent(summary.tierPercentages.small)} (
                          {summary.tierDistribution.small.toLocaleString()})
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">OK:</span>{' '}
                        <span className="font-mono">
                          {formatPercent(summary.tierPercentages.ok)} (
                          {summary.tierDistribution.ok.toLocaleString()})
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Good:</span>{' '}
                        <span className="font-mono">
                          {formatPercent(summary.tierPercentages.good)} (
                          {summary.tierDistribution.good.toLocaleString()})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2">
                    <div className="text-sm font-medium">Amount Statistics</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-white/60">Min:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.amountStats.min)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Max:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.amountStats.max)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Avg:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.amountStats.avg)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Median:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.amountStats.median)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-white/60">Total:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.amountStats.total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2">
                    <div className="text-sm font-medium">Base Amount Stats</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-white/60">Min:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.baseAmountStats.min)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Max:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.baseAmountStats.max)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Avg:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.baseAmountStats.avg)}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/60">Median:</span>{' '}
                        <span className="font-mono">
                          {formatAmount(summary.baseAmountStats.median)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(summary.amountStatsByTier.small.count > 0 ||
                    summary.amountStatsByTier.ok.count > 0 ||
                    summary.amountStatsByTier.good.count > 0) && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">By Tier</div>
                      {summary.amountStatsByTier.small.count > 0 && (
                        <div className="rounded bg-white/5 p-2 text-xs">
                          <div className="font-medium">Small Drops</div>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-white/60">Avg:</span>{' '}
                              <span className="font-mono">
                                {formatAmount(summary.amountStatsByTier.small.avg)}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/60">Count:</span>{' '}
                              {summary.amountStatsByTier.small.count.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                      {summary.amountStatsByTier.ok.count > 0 && (
                        <div className="rounded bg-white/5 p-2 text-xs">
                          <div className="font-medium">OK Drops</div>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-white/60">Avg:</span>{' '}
                              <span className="font-mono">
                                {formatAmount(summary.amountStatsByTier.ok.avg)}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/60">Count:</span>{' '}
                              {summary.amountStatsByTier.ok.count.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                      {summary.amountStatsByTier.good.count > 0 && (
                        <div className="rounded bg-white/5 p-2 text-xs">
                          <div className="font-medium">Good Drops</div>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-white/60">Avg:</span>{' '}
                              <span className="font-mono">
                                {formatAmount(summary.amountStatsByTier.good.avg)}
                              </span>
                            </div>
                            <div>
                              <span className="text-white/60">Count:</span>{' '}
                              {summary.amountStatsByTier.good.count.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
