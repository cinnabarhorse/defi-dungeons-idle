import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadFullRunFixture } from '../../_lib/fixtures';

interface GoldenRunPageParams {
  params: {
    floor: string;
    runId: string;
  };
  searchParams?: {
    date?: string;
  };
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

export default function GoldenRunDetailPage({
  params,
  searchParams,
}: GoldenRunPageParams) {
  const targetFloor = Number(params.floor);
  if (!Number.isFinite(targetFloor)) return notFound();
  const fixture = loadFullRunFixture(targetFloor, searchParams?.date);
  if (!fixture) return notFound();

  const run = fixture.runs[params.runId];
  if (!run) return notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <Link
          href={`/golden-runs${searchParams?.date ? `?date=${searchParams.date}` : ''}`}
          className="text-xs uppercase text-slate-400 hover:text-slate-200"
        >
          ← Back to Golden Runs
        </Link>
        <h1 className="text-2xl font-semibold text-white">
          {params.runId}
        </h1>
        <p className="text-sm text-slate-300">
          Floor {targetFloor} • {run.difficulty} • L{run.level} • {run.leverage}x
        </p>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
        <div className="text-xs uppercase text-slate-400">
          Run Summary (generated {fixture.generatedAt})
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
          <div>Run status: {run.runStatus}</div>
          <div>Ended reason: {run.endedReason}</div>
          <div>Score: {formatNumber(run.score)}</div>
          <div>Ticks: {formatNumber(run.ticksRun)}</div>
          <div>Duration: {formatNumber(run.durationMs)} ms</div>
          <div>Depth reached: {formatNumber(run.depth)}</div>
          <div>Floor reached: {formatNumber(run.floor)}</div>
          <div>Seed: {formatNumber(run.seed)}</div>
        </div>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs uppercase text-slate-400">
          Stat Allocation
        </div>
        <div className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
          <div>Energy: {formatNumber(run.statAllocation.energy)}</div>
          <div>Aggression: {formatNumber(run.statAllocation.aggression)}</div>
          <div>Spookiness: {formatNumber(run.statAllocation.spookiness)}</div>
          <div>Brain Size: {formatNumber(run.statAllocation.brainSize)}</div>
        </div>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs uppercase text-slate-400">Suite Summary</div>
        <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
          <div>Runs: {formatNumber(fixture.summary.runs)}</div>
          <div>Victories: {formatNumber(fixture.summary.victories)}</div>
          <div>Deaths: {formatNumber(fixture.summary.deaths)}</div>
          <div>
            Avg ticks: {formatNumber(Math.round(fixture.summary.avgTicks))}
          </div>
          <div>Max ticks: {formatNumber(fixture.summary.maxTicks)}</div>
          <div>
            Avg duration: {fixture.summary.avgDurationMs.toFixed(2)} ms
          </div>
          <div>
            Max duration: {formatNumber(fixture.summary.maxDurationMs)} ms
          </div>
        </div>
      </div>
    </div>
  );
}
