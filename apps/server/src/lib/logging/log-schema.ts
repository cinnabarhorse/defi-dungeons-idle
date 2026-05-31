export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LevelCounts = Record<LogLevel, number>;

export interface RuntimeIdentity {
  serverId: string;
  host: string;
  env: string;
  region: string;
  pmId: number;
}

export interface GameLogInput {
  gameId: string;
  event: string;
  message?: string;
  level?: LogLevel;
  playerId?: string | null;
  sessionId?: string | null;
  actionId?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown> | null;
  ts?: Date | number | string;
}

export interface StructuredLogLine {
  ts: string;
  level: LogLevel;
  event: string;
  message: string;
  gameId: string;
  serverId: string;
  host: string;
  env: string;
  region: string;
  pmId: number;
  playerId?: string;
  sessionId?: string;
  actionId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface FinalizedShard {
  gameId: string;
  seq: number;
  tsStart: string;
  tsEnd: string;
  ndjson: string;
  approxBytes: number;
  lineCount: number;
  levelCounts: LevelCounts;
  host: string;
  serverId: string;
  pmId: number;
  rotationReason: 'size' | 'time' | 'shutdown' | 'manual' | 'lines';
}

export const DEBUG_LOG_BUCKET = 'dd-logs';

const SENSITIVE_KEYWORDS = [
  'token',
  'secret',
  'password',
  'authorization',
  'auth',
  'cookie',
  'key',
  'signature',
  'bearer',
  'session',
  'private',
] as const;

const MAX_DEPTH = 3;
const MAX_KEYS = 50;
const MAX_ARRAY_LENGTH = 25;

export function createEmptyLevelCounts(): LevelCounts {
  return {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
  };
}

export function normalizeTimestamp(input?: Date | number | string): string {
  if (!input) {
    return new Date().toISOString();
  }
  if (input instanceof Date) {
    return input.toISOString();
  }
  if (typeof input === 'number') {
    return new Date(input).toISOString();
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return new Date().toISOString();
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    const date = new Date(trimmed);
    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function scrubValue(value: unknown, depth: number): unknown {
  if (value == null) {
    return value;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    if (typeof value === 'string' && value.length > 2000) {
      return `${value.slice(0, 2000)}…`;
    }
    return value;
  }
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) {
      return `[array:${value.length}]`;
    }
    if (typeof value === 'object') {
      return '[object]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) =>
      scrubValue(entry, depth + 1)
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_KEYS
    );
    const result: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      if (isSensitiveKey(key)) {
        result[key] = '[redacted]';
        continue;
      }
      result[key] = scrubValue(nested, depth + 1);
    }
    return result;
  }
  return String(value);
}

export function sanitizeDetails(
  details?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  const entries = Object.entries(details).slice(0, MAX_KEYS);
  const result: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!key) {
      continue;
    }
    if (isSensitiveKey(key)) {
      result[key] = '[redacted]';
      continue;
    }
    result[key] = scrubValue(value, 1);
  }
  return result;
}

export function normalizeLogLine(
  input: GameLogInput,
  identity: RuntimeIdentity
): StructuredLogLine {
  const level: LogLevel = input.level ?? 'info';
  const message =
    (typeof input.message === 'string' && input.message.trim()) || input.event;
  const playerId =
    typeof input.playerId === 'string' && input.playerId.trim().length
      ? input.playerId.trim()
      : undefined;
  const sessionId =
    typeof input.sessionId === 'string' && input.sessionId.trim().length
      ? input.sessionId.trim()
      : undefined;
  const actionId =
    typeof input.actionId === 'string' && input.actionId.trim().length
      ? input.actionId.trim()
      : undefined;
  const requestId =
    typeof input.requestId === 'string' && input.requestId.trim().length
      ? input.requestId.trim()
      : undefined;

  return {
    ts: normalizeTimestamp(input.ts),
    level,
    event: input.event,
    message,
    gameId: input.gameId,
    serverId: identity.serverId,
    host: identity.host,
    env: identity.env,
    region: identity.region,
    pmId: identity.pmId,
    playerId,
    sessionId,
    actionId,
    requestId,
    details: sanitizeDetails(input.details),
  };
}
