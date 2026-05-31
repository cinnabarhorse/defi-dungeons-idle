import type { Application, Request, Response } from 'express';
import os from 'os';
import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAdminSession } from '../admin-auth';

const execFileAsync = promisify(execFile);

const DEFAULT_ACTIVE_UPSTREAM_PATH =
  '/etc/nginx/conf.d/gv-active-upstream.inc';
const pm2Prefix =
  (process.env.PM2_SLOT_PREFIX || 'gotchiverse-live').trim() || 'gotchiverse-live';
const SLOT_REGEX = new RegExp(`^${escapeRegex(pm2Prefix)}-(\\d+)$`);
const ROOMS_TIMEOUT_MS = (() => {
  const raw = Number(process.env.PM2_STATUS_ROOMS_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 3000;
})();

type SlotProcess = {
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
  git: { sha: string | null; branch: string | null } | null;
};

type SlotsResult = {
  processes: SlotProcess[];
  errors: string[];
};

export function registerAdminServersRoutes(app: Application) {
  app.get('/api/admin/pm2-status', async (req: Request, res: Response) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    const [activePortResult, pm2Result] = await Promise.all([
      readActivePort(),
      listPm2SlotProcesses(),
    ]);

    res.json({
      hostname: os.hostname(),
      activePort: activePortResult.port,
      activePortSource: activePortResult.source,
      processes: pm2Result.processes,
      errors: [
        ...activePortResult.errors,
        ...pm2Result.errors,
      ],
      adminAddress: session.address,
      updatedAt: new Date().toISOString(),
    });
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readActivePort(): Promise<{
  port: number | null;
  source: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const configured =
    (process.env.NGINX_ACTIVE_UPSTREAM_PATH || '').trim() ||
    DEFAULT_ACTIVE_UPSTREAM_PATH;
  const fallbacks = [
    configured,
    // Legacy path used previously; keep as fallback for older hosts
    '/etc/nginx/conf.d/gv-active-upstream.conf',
  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
  for (const activePath of fallbacks) {
    try {
      const contents = await readFile(activePath, 'utf8');
      const match = contents.match(/127\.0\.0\.1:(\d+)/);
      if (match && match[1]) {
        return {
          port: Number(match[1]),
          source: activePath,
          errors,
        };
      }
      errors.push(
        `Active upstream file found but no port matched (${activePath})`
      );
    } catch (error) {
      errors.push(
        `Failed to read active upstream file (${activePath}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return {
    port: null,
    source: configured,
    errors,
  };
}

async function listPm2SlotProcesses(): Promise<SlotsResult> {
  const errors: string[] = [];
  let stdout = '';
  try {
    const result = await execFileAsync('pm2', ['jlist'], {
      maxBuffer: 2 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (error) {
    errors.push(
      `Failed to run pm2 jlist: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { processes: [], errors };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout || '[]');
  } catch (error) {
    errors.push(
      `Failed to parse pm2 jlist output: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { processes: [], errors };
  }

  if (!Array.isArray(parsed)) {
    errors.push('pm2 jlist output was not an array');
    return { processes: [], errors };
  }

  const baseProcesses: SlotProcess[] = parsed
    .map((entry) => mapPm2EntryToSlot(entry))
    .filter((proc): proc is SlotProcess => proc !== null);

  const withRoomStats = await Promise.all(
    baseProcesses.map(async (proc) => {
      const stats = await fetchRoomStats(proc.port);
      if (stats.error) {
        errors.push(stats.error);
      }
      return {
        ...proc,
        roomsCount: stats.roomsCount,
        totalClients: stats.totalClients,
      };
    })
  );

  return {
    processes: withRoomStats,
    errors,
  };
}

function mapPm2EntryToSlot(entry: unknown): SlotProcess | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const name = typeof (entry as any).name === 'string' ? (entry as any).name : '';
  const match = SLOT_REGEX.exec(name);
  if (!match) {
    return null;
  }
  const port = Number(match[1]);
  if (!Number.isFinite(port)) {
    return null;
  }
  const pm2Env = ((entry as any).pm2_env ?? {}) as Record<string, unknown>;
  const monit = ((entry as any).monit ?? {}) as Record<string, unknown>;
  const uptimeMs = deriveUptimeMs(pm2Env);
  const restartCount = deriveRestartCount(pm2Env);
  const cpu =
    typeof monit.cpu === 'number' && Number.isFinite(monit.cpu)
      ? monit.cpu
      : null;
  const memoryBytes =
    typeof monit.memory === 'number' && Number.isFinite(monit.memory)
      ? monit.memory
      : null;

  return {
    name,
    pmId: typeof (entry as any).pm_id === 'number' ? (entry as any).pm_id : null,
    status:
      typeof pm2Env.status === 'string' ? (pm2Env.status as string) : 'unknown',
    restartCount,
    uptimeMs,
    cpu,
    memoryBytes,
    port,
    roomsCount: null,
    totalClients: null,
    git: extractGitInfo(pm2Env),
  };
}

function deriveUptimeMs(env: Record<string, unknown>): number | null {
  const raw = env.pm_uptime;
  if (typeof raw === 'number') {
    return raw <= 0 ? null : Date.now() - raw;
  }
  if (typeof raw === 'string') {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return Date.now() - num;
    }
  }
  return null;
}

function deriveRestartCount(env: Record<string, unknown>): number | null {
  const candidates = [
    env.restart_time,
    env.restart_count,
    (env as any).pm_restart_time,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function extractGitInfo(
  env: Record<string, unknown>
): { sha: string | null; branch: string | null } | null {
  const versioning = (env.versioning ?? {}) as Record<string, unknown>;
  const sha = pickString(
    versioning.revision,
    versioning.git_rev,
    (env as any).GIT_SHA
  );
  const branch = pickString(
    versioning.branch,
    versioning.git_branch,
    (env as any).GIT_BRANCH
  );
  if (!sha && !branch) {
    return null;
  }
  return { sha: sha || null, branch: branch || null };
}

function pickString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

async function fetchRoomStats(port: number): Promise<{
  roomsCount: number | null;
  totalClients: number | null;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROOMS_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('Invalid rooms payload');
    }
    const roomsCount = data.length;
    const totalClients = data.reduce((sum, item) => {
      const clients =
        item && typeof item === 'object' && typeof (item as any).clients === 'number'
          ? (item as any).clients
          : 0;
      return sum + (Number.isFinite(clients) ? clients : 0);
    }, 0);
    return { roomsCount, totalClients };
  } catch (error) {
    return {
      roomsCount: null,
      totalClients: null,
      error: `Failed to fetch rooms for port ${port}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
