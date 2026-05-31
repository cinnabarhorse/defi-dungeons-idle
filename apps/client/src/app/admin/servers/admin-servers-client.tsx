'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { SERVER_REGIONS } from '../../../lib/server-regions';

const POLL_INTERVAL_MS = 20_000;

type Pm2Process = {
  name: string;
  pmId: number | null;
  status: string;
  restartCount: number | null;
  uptimeMs: number | null;
  cpu: number | null;
  memoryBytes: number | null;
  port: number;
  roomsCount: number | null;
  totalClients: number | null;
  git?: { sha: string | null; branch: string | null } | null;
};

type Pm2StatusResponse = {
  hostname: string;
  activePort: number | null;
  activePortSource?: string | null;
  processes: Pm2Process[];
  errors?: string[];
  adminAddress?: string;
  updatedAt?: string;
};

type RegionState = {
  data: Pm2StatusResponse | null;
  error: string | null;
  isLoading: boolean;
  lastFetchedAt: string | null;
};

type RegionStates = Record<string, RegionState>;

function defaultRegionState(): RegionState {
  return {
    data: null,
    error: null,
    isLoading: true,
    lastFetchedAt: null,
  };
}

function createInitialStates(): RegionStates {
  return SERVER_REGIONS.reduce((acc, region) => {
    acc[region.id] = defaultRegionState();
    return acc;
  }, {} as RegionStates);
}

function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  return `${trimmed}/api/admin/pm2-status`;
}

function formatUptime(ms: number | null): string {
  if (!Number.isFinite(ms) || ms === null) {
    return '—';
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatCpu(value: number | null): string {
  if (!Number.isFinite(value) || value === null) {
    return '—';
  }
  return `${value.toFixed(1)}%`;
}

function formatMemory(bytes: number | null): string {
  if (!Number.isFinite(bytes) || bytes === null) {
    return '—';
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value: number | null): string {
  if (!Number.isFinite(value) || value === null) {
    return '—';
  }
  return new Intl.NumberFormat().format(value);
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return '—';
  }
}

export function AdminServersClient() {
  const [states, setStates] = useState<RegionStates>(() => createInitialStates());
  const refreshRef = useRef<() => void>();

  useEffect(() => {
    let isMounted = true;
    const controllers = new Set<AbortController>();

    const updateRegion = (regionId: string, patch: Partial<RegionState>) => {
      setStates((prev) => {
        const current = prev[regionId] || defaultRegionState();
        return {
          ...prev,
          [regionId]: {
            ...current,
            ...patch,
          },
        };
      });
    };

    const fetchRegion = async (regionId: string, endpoint: string) => {
      updateRegion(regionId, { isLoading: true, error: null });
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch(endpoint, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as Pm2StatusResponse;
        if (!isMounted) {
          return;
        }
        updateRegion(regionId, {
          data,
          error: null,
          isLoading: false,
          lastFetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        if ((error as Error).name === 'AbortError') {
          return;
        }
        updateRegion(regionId, {
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      } finally {
        controllers.delete(controller);
      }
    };

    async function loadAll() {
      await Promise.all(
        SERVER_REGIONS.map((region) =>
          fetchRegion(region.id, buildEndpoint(region.serverUrl))
        )
      );
    }

    refreshRef.current = () => {
      void loadAll();
    };

    void loadAll();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void loadAll();
    }, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadAll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-white/70">
          Polling every {Math.round(POLL_INTERVAL_MS / 1000)}s (pauses when tab
          hidden).
        </div>
        <button
          type="button"
          onClick={() => refreshRef.current?.()}
          className="rounded border border-white/30 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20 transition"
        >
          Manual Refresh
        </button>
      </div>
      {SERVER_REGIONS.map((region) => {
        const state = states[region.id] || defaultRegionState();
        const data = state.data;
        const processes = data?.processes
          ? [...data.processes].sort((a, b) => a.port - b.port)
          : [];
        const hostLabel = (() => {
          try {
            const url = new URL(region.serverUrl);
            return url.host;
          } catch {
            return region.serverUrl;
          }
        })();
        return (
          <section
            key={region.id}
            className="rounded-lg border border-white/10 bg-slate-950/80 p-5 shadow-lg shadow-black/40"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="text-sm uppercase tracking-wide text-white/50">
                  {region.flag} {region.name}
                </div>
                <div className="text-lg font-semibold text-white">
                  {hostLabel}
                </div>
              </div>
              <div className="ml-auto text-right text-sm text-white/70">
                <div>Active port</div>
                <div className="font-mono text-xl text-lime-300">
                  {data?.activePort ?? '—'}
                </div>
              </div>
              <div className="text-xs text-white/50">
                Last server update: {formatTimestamp(data?.updatedAt)} • Last
                fetch: {formatTimestamp(state.lastFetchedAt)}
              </div>
            </div>
            {state.error && (
              <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                Failed to load region: {state.error}
              </div>
            )}
            {data?.errors && data.errors.length > 0 && (
              <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <div className="font-semibold mb-1">Warnings</div>
                <ul className="list-disc pl-5 space-y-1">
                  {data.errors.map((err, idx) => (
                    <li key={`${region.id}-err-${idx}`}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 overflow-x-auto rounded border border-white/10">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Port</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Uptime</th>
                    <th className="px-3 py-2 text-left font-medium">CPU</th>
                    <th className="px-3 py-2 text-left font-medium">Memory</th>
                    <th className="px-3 py-2 text-left font-medium">Rooms</th>
                    <th className="px-3 py-2 text-left font-medium">Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-4 text-center text-white/60"
                      >
                        No slot processes reported.
                      </td>
                    </tr>
                  ) : (
                    processes.map((proc) => {
                      const isActive = data?.activePort === proc.port;
                      return (
                        <tr
                          key={proc.name}
                          className={clsx(
                            'border-t border-white/5',
                            isActive ? 'bg-lime-500/10' : 'bg-transparent'
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-white">
                            {proc.port}
                            {isActive && (
                              <span className="ml-2 rounded bg-lime-400/20 px-2 py-0.5 text-xs text-lime-200">
                                active
                              </span>
                            )}
                            {proc.git?.sha && (
                              <span className="ml-2 text-xs text-white/50">
                                {proc.git.sha.slice(0, 7)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-white/80">
                            {proc.status}
                          </td>
                          <td className="px-3 py-2 text-white/80">
                            {formatUptime(proc.uptimeMs)}
                          </td>
                          <td className="px-3 py-2 text-white/80">
                            {formatCpu(proc.cpu)}
                          </td>
                          <td className="px-3 py-2 text-white/80">
                            {formatMemory(proc.memoryBytes)}
                          </td>
                          <td className="px-3 py-2 text-white/80">
                            {formatNumber(proc.roomsCount)}
                          </td>
                          <td className="px-3 py-2 text-white/80">
                            {formatNumber(proc.totalClients)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {state.isLoading && (
              <div className="mt-3 text-xs uppercase tracking-wide text-white/40">
                Syncing latest data…
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
