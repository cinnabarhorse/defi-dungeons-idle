import Link from 'next/link';
import { getCharacterById } from '../../data/characters';
import { TierBadge } from '../simulations/[id]/tier-badge';
import {
  getTargetFloors,
  listGoldenRunDates,
  loadFullRunFixture,
} from './_lib/fixtures';

function formatNumber(value: number | string): string {
  if (typeof value === 'string') return value;
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

function renderSummary(summary: {
  runs: number;
  victories: number;
  deaths: number;
  avgTicks: number;
  maxTicks: number;
  avgDurationMs: number;
  maxDurationMs: number;
}) {
  return (
    <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
      <div>Runs: {formatNumber(summary.runs)}</div>
      <div>Victories: {formatNumber(summary.victories)}</div>
      <div>Deaths: {formatNumber(summary.deaths)}</div>
      <div>Avg ticks: {formatNumber(Math.round(summary.avgTicks))}</div>
      <div>Max ticks: {formatNumber(summary.maxTicks)}</div>
      <div>Avg duration: {formatNumber(summary.avgDurationMs.toFixed(2))} ms</div>
      <div>Max duration: {formatNumber(summary.maxDurationMs)} ms</div>
    </div>
  );
}

function buildReadableSummary(
  floor: number,
  summary: {
    runs: number;
    victories: number;
    deaths: number;
    avgTicks: number;
    maxTicks: number;
    avgDurationMs: number;
    maxDurationMs: number;
  }
) {
  return `Floor ${floor} completed ${summary.runs} runs with ${
    summary.victories
  } victories and ${summary.deaths} deaths. Average run length was ${Math.round(
    summary.avgTicks
  )} ticks in ${summary.avgDurationMs.toFixed(2)}ms (max ${
    summary.maxTicks
  } ticks, ${summary.maxDurationMs}ms).`;
}

interface GoldenRunsPageProps {
  searchParams?: {
    date?: string;
    left?: string;
    right?: string;
  };
}

function renderCompareSummary(
  label: string,
  left: { runs: number; victories: number; deaths: number; avgTicks: number; avgDurationMs: number },
  right: { runs: number; victories: number; deaths: number; avgTicks: number; avgDurationMs: number }
) {
  const diff = {
    runs: right.runs - left.runs,
    victories: right.victories - left.victories,
    deaths: right.deaths - left.deaths,
    avgTicks: right.avgTicks - left.avgTicks,
    avgDurationMs: right.avgDurationMs - left.avgDurationMs,
  };

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-200">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-2 grid gap-1 md:grid-cols-2">
        <div>Runs: {formatNumber(left.runs)} → {formatNumber(right.runs)} ({diff.runs >= 0 ? '+' : ''}{diff.runs})</div>
        <div>Victories: {formatNumber(left.victories)} → {formatNumber(right.victories)} ({diff.victories >= 0 ? '+' : ''}{diff.victories})</div>
        <div>Deaths: {formatNumber(left.deaths)} → {formatNumber(right.deaths)} ({diff.deaths >= 0 ? '+' : ''}{diff.deaths})</div>
        <div>Avg ticks: {formatNumber(Math.round(left.avgTicks))} → {formatNumber(Math.round(right.avgTicks))} ({diff.avgTicks >= 0 ? '+' : ''}{diff.avgTicks.toFixed(2)})</div>
        <div>Avg duration: {left.avgDurationMs.toFixed(2)} → {right.avgDurationMs.toFixed(2)} ms ({diff.avgDurationMs >= 0 ? '+' : ''}{diff.avgDurationMs.toFixed(2)})</div>
      </div>
    </div>
  );
}

export default function GoldenRunsPage({ searchParams }: GoldenRunsPageProps) {
  const floors = getTargetFloors();
  const dates = listGoldenRunDates();
  const defaultDate = dates[0];
  const selectedDate = searchParams?.date ?? defaultDate;
  const fixtures = floors
    .map((floor) => ({
      floor,
      fixture: loadFullRunFixture(floor, selectedDate),
    }))
    .filter((entry) => Boolean(entry.fixture));

  const compareLeft = searchParams?.left ?? dates[1];
  const compareRight = searchParams?.right ?? dates[0];
  const hasCompare =
    Boolean(compareLeft) &&
    Boolean(compareRight) &&
    compareLeft !== compareRight;
  const overallSummary = fixtures.reduce(
    (acc, entry) => {
      if (!entry.fixture) return acc;
      acc.runs += entry.fixture.summary.runs;
      acc.victories += entry.fixture.summary.victories;
      acc.deaths += entry.fixture.summary.deaths;
      acc.avgTicks += entry.fixture.summary.avgTicks;
      acc.avgDurationMs += entry.fixture.summary.avgDurationMs;
      acc.maxTicks = Math.max(acc.maxTicks, entry.fixture.summary.maxTicks);
      acc.maxDurationMs = Math.max(
        acc.maxDurationMs,
        entry.fixture.summary.maxDurationMs
      );
      return acc;
    },
    {
      runs: 0,
      victories: 0,
      deaths: 0,
      avgTicks: 0,
      maxTicks: 0,
      avgDurationMs: 0,
      maxDurationMs: 0,
    }
  );
  const averageDivisor = Math.max(1, fixtures.length);
  overallSummary.avgTicks = overallSummary.avgTicks / averageDivisor;
  overallSummary.avgDurationMs = overallSummary.avgDurationMs / averageDivisor;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Golden Runs</h1>
        <p className="text-sm text-slate-300">
          Full-run golden suites across all characters, levels, leverages, and
          difficulties. Click any run to view the detailed breakdown.
        </p>
      </div>

      {fixtures.length > 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="text-xs uppercase text-slate-400">
            Summary for {selectedDate ?? 'latest'}
          </div>
          <p className="mt-2">
            {overallSummary.runs} runs total across {fixtures.length} floors,
            with {overallSummary.victories} victories and{' '}
            {overallSummary.deaths} deaths. Average run length was{' '}
            {Math.round(overallSummary.avgTicks)} ticks in{' '}
            {overallSummary.avgDurationMs.toFixed(2)}ms (max{' '}
            {overallSummary.maxTicks} ticks, {overallSummary.maxDurationMs}ms).
          </p>
        </div>
      ) : null}

      {dates.length > 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
          <form className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
              View date
              <select
                name="date"
                defaultValue={selectedDate}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
              >
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
              Compare left
              <select
                name="left"
                defaultValue={compareLeft}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
              >
                <option value="">None</option>
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
              Compare right
              <select
                name="right"
                defaultValue={compareRight}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
              >
                <option value="">None</option>
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              Apply
            </button>
          </form>
        </div>
      ) : null}

      {hasCompare ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-xs uppercase text-slate-400">
            Compare {compareLeft} → {compareRight}
          </div>
          <div className="mt-3 grid gap-3">
            {floors.map((floor) => {
              const leftFixture = loadFullRunFixture(floor, compareLeft);
              const rightFixture = loadFullRunFixture(floor, compareRight);
              if (!leftFixture || !rightFixture) return null;
              return renderCompareSummary(
                `Floor ${floor}`,
                leftFixture.summary,
                rightFixture.summary
              );
            })}
          </div>
        </div>
      ) : null}

      {fixtures.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
          No fixtures found. Run the golden suite to generate fixtures under
          <span className="ml-1 font-mono text-xs">__fixtures__</span>.
        </div>
      ) : (
        <div className="space-y-6">
          {fixtures.map(({ floor, fixture }) => {
            if (!fixture) return null;
            const runs = Object.entries(fixture.runs).sort(([a], [b]) =>
              a.localeCompare(b)
            );
            const runsByCharacter = new Map<string, Array<[string, typeof fixture.runs[string]]>>();
            for (const entry of runs) {
              const [runId, run] = entry;
              const list = runsByCharacter.get(run.characterId) ?? [];
              list.push(entry);
              runsByCharacter.set(run.characterId, list);
            }
            return (
              <details
                key={floor}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                open={floor === floors[0]}
              >
                <summary className="cursor-pointer text-lg font-semibold text-white">
                  Floor {floor}
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
                    <div className="text-xs uppercase text-slate-400">
                      Summary (generated {fixture.generatedAt})
                    </div>
                    <div className="mt-3">{renderSummary(fixture.summary)}</div>
                    <p className="mt-3 text-sm text-slate-300">
                      {buildReadableSummary(floor, fixture.summary)}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs uppercase text-slate-400">
                      Runs ({runs.length})
                    </div>
                    <div className="space-y-4">
                      {[...runsByCharacter.entries()]
                        .map(([characterId, entries]) => {
                          const wins = entries.filter(
                            ([, run]) => run.endedReason === 'victory'
                          );
                          return { characterId, entries, winsCount: wins.length };
                        })
                        .sort((a, b) => b.winsCount - a.winsCount)
                        .map(({ characterId, entries }) => {
                        const wins = entries.filter(
                          ([, run]) => run.endedReason === 'victory'
                        );
                        const deaths = entries.length - wins.length;
                        const bestWin =
                          wins.length > 0
                            ? wins.reduce((best, [, run]) => {
                                if (!best) return run;
                                return run.score > best.score ? run : best;
                              }, null as (typeof wins[number][1]) | null)
                            : null;
                        const bestWinLabel = bestWin
                          ? `${formatNumber(bestWin.score)} (L${bestWin.level} • ${bestWin.leverage}x • ${bestWin.difficulty})`
                          : '—';
                        const characterTier = getCharacterById(characterId)?.tier;

                        return (
                          <details
                            key={characterId}
                            className="rounded-md border border-slate-800 bg-slate-950/30 p-3"
                          >
                            <summary className="cursor-pointer text-xs font-semibold uppercase text-slate-300">
                              <span className="text-slate-200">{characterId}</span>
                              {characterTier ? (
                                <span className="ml-2 inline-flex align-middle">
                                  <TierBadge tier={characterTier} />
                                </span>
                              ) : null}
                              <span className="ml-2 text-slate-400">
                                Wins {formatNumber(wins.length)} • Deaths{' '}
                                {formatNumber(deaths)} • Best win score{' '}
                                {bestWinLabel}
                              </span>
                            </summary>
                            <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                              {entries.map(([runId, run]) => {
                                const isVictory = run.endedReason === 'victory';
                                const tint = isVictory
                                  ? 'border-emerald-700/60 bg-emerald-950/30 hover:border-emerald-500/70'
                                  : 'border-rose-700/60 bg-rose-950/30 hover:border-rose-500/70';
                                return (
                                  <Link
                                    key={runId}
                                    href={`/golden-runs/${floor}/${runId}${
                                      selectedDate ? `?date=${selectedDate}` : ''
                                    }`}
                                    className={`rounded-md border p-3 text-sm text-slate-200 transition ${tint}`}
                                  >
                                    <div className="font-semibold text-white">{runId}</div>
                                    <div className="mt-1 text-xs text-slate-300">
                                      {run.difficulty} • L{run.level} • {run.leverage}x
                                    </div>
                                    <div className="mt-2 text-xs text-slate-300">
                                      {run.endedReason} • score {formatNumber(run.score)}
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
