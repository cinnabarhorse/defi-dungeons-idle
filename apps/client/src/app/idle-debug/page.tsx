'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAppServerBaseUrl } from '../../lib/server-url';

interface IdleReplayFrame {
  tick: number;
  now: number;
  playerHp: number;
  playerMaxHp: number;
  playerMana: number;
  playerMaxMana: number;
  playerScore: number;
  playerActionGauge: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyActionGauge: number;
  enemyStunTurnsRemaining: number;
  encounterCompleted: boolean;
  runStatus: string;
  killCount: Record<string, number>;
  lastActionLog: string;
  stateHash: string;
}

interface IdleReplayResponse {
  seed: number;
  ticks: number;
  tickMs: number;
  difficultyTier: string;
  leverageTotal: number;
  frames: IdleReplayFrame[];
  finalStateHash: string;
}

const DEFAULT_SEED = 12345;
const DEFAULT_TICKS = 20;
const DEFAULT_TICK_MS = 1000;
const MAX_REPLAY_TICKS = 100_000;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseQueryInt(
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return fallback;
  return clampInt(parsed, min, max);
}

export default function IdleDebugReplayPage() {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [ticks, setTicks] = useState(DEFAULT_TICKS);
  const [tickMs, setTickMs] = useState(DEFAULT_TICK_MS);
  const [frameIndex, setFrameIndex] = useState(0);
  const [replay, setReplay] = useState<IdleReplayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const shouldAutoRunRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    setSeed(parseQueryInt(params.get('seed'), DEFAULT_SEED, 0, 2_000_000_000));
    setTicks(parseQueryInt(params.get('ticks'), DEFAULT_TICKS, 1, MAX_REPLAY_TICKS));
    setTickMs(parseQueryInt(params.get('tickMs'), DEFAULT_TICK_MS, 50, 60_000));
    setFrameIndex(parseQueryInt(params.get('frame'), 0, 0, 1_000_000));
    shouldAutoRunRef.current = params.has('seed');
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('ticks', String(ticks));
    url.searchParams.set('tickMs', String(tickMs));
    url.searchParams.set('frame', String(frameIndex));
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}`);
  }, [frameIndex, isReady, seed, tickMs, ticks]);

  const runReplay = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        seed: String(seed),
        ticks: String(ticks),
        tickMs: String(tickMs),
      });
      const baseUrl = getAppServerBaseUrl();
      const response = await fetch(`${baseUrl}/api/idle/replay?${query.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: string }
          | null;
        const message = payload?.details || payload?.error || `HTTP ${response.status}`;
        throw new Error(message);
      }

      const payload = (await response.json()) as IdleReplayResponse;
      setReplay(payload);
      setFrameIndex((current) =>
        Math.max(0, Math.min(current, Math.max(payload.frames.length - 1, 0)))
      );
    } catch (runError) {
      setReplay(null);
      setError(runError instanceof Error ? runError.message : 'Failed to run replay');
    } finally {
      setLoading(false);
    }
  }, [seed, tickMs, ticks]);

  useEffect(() => {
    if (!isReady || !shouldAutoRunRef.current) return;
    shouldAutoRunRef.current = false;
    void runReplay();
  }, [isReady, runReplay]);

  useEffect(() => {
    if (!replay) return;
    setFrameIndex((current) =>
      Math.max(0, Math.min(current, Math.max(replay.frames.length - 1, 0)))
    );
  }, [replay]);

  const selectedFrame = useMemo(() => {
    if (!replay || replay.frames.length === 0) return null;
    const safeIndex = Math.max(0, Math.min(frameIndex, replay.frames.length - 1));
    return replay.frames[safeIndex] ?? null;
  }, [frameIndex, replay]);

  const maxFrame = replay ? Math.max(0, replay.frames.length - 1) : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Idle Replay Debug</h1>
          <p className="text-sm text-slate-300">
            Run deterministic idle simulation replays by seed and scrub frame-by-frame.
          </p>
        </header>

        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">Seed</span>
              <input
                data-testid="replay-seed-input"
                type="number"
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
                value={seed}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setSeed(clampInt(parsed, 0, 2_000_000_000));
                }}
              />
            </label>

            <label className="space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">Ticks</span>
              <input
                data-testid="replay-ticks-input"
                type="number"
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
                value={ticks}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setTicks(clampInt(parsed, 1, MAX_REPLAY_TICKS));
                }}
              />
            </label>

            <label className="space-y-1">
              <span className="block text-xs uppercase tracking-wide text-slate-400">Tick Ms</span>
              <input
                data-testid="replay-tickms-input"
                type="number"
                className="w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
                value={tickMs}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setTickMs(clampInt(parsed, 50, 60_000));
                }}
              />
            </label>

            <div className="flex items-end">
              <button
                data-testid="replay-run-button"
                type="button"
                onClick={() => void runReplay()}
                className="inline-flex w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? 'Running...' : 'Run Replay'}
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div
            data-testid="replay-error"
            className="rounded-lg border border-red-500/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        ) : null}

        {replay && selectedFrame ? (
          <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
              <div>
                Seed {replay.seed} | Ticks {replay.ticks} | Tick Ms {replay.tickMs}
              </div>
              <div>Final Hash: {replay.finalStateHash}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                <span>Frame</span>
                <span data-testid="replay-frame-tick">Tick {selectedFrame.tick}</span>
              </div>
              <input
                data-testid="replay-frame-slider"
                type="range"
                min={0}
                max={maxFrame}
                step={1}
                value={Math.max(0, Math.min(frameIndex, maxFrame))}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setFrameIndex(clampInt(parsed, 0, maxFrame));
                }}
                className="w-full"
              />
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Player HP</div>
                <div className="mt-1 font-medium">
                  {selectedFrame.playerHp} / {selectedFrame.playerMaxHp}
                </div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Player Mana</div>
                <div className="mt-1 font-medium">
                  {selectedFrame.playerMana} / {selectedFrame.playerMaxMana}
                </div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Enemy HP</div>
                <div className="mt-1 font-medium">
                  {selectedFrame.enemyHp} / {selectedFrame.enemyMaxHp}
                </div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Run Status</div>
                <div className="mt-1 font-medium">{selectedFrame.runStatus}</div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Action Gauge</div>
                <div className="mt-1 font-medium">
                  P: {selectedFrame.playerActionGauge.toFixed(2)} | E:{' '}
                  {selectedFrame.enemyActionGauge.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">State Hash</div>
                <div data-testid="replay-frame-hash" className="mt-1 break-all font-mono text-xs">
                  {selectedFrame.stateHash}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Last Action Log</div>
              <pre className="whitespace-pre-wrap break-words text-xs text-slate-200">
                {selectedFrame.lastActionLog || 'No action logged for this frame.'}
              </pre>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
