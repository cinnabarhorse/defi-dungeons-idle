import os from 'os';
import pino, { type Logger } from 'pino';
import { RuntimeIdentity } from './log-schema';

const DEFAULT_LOG_LEVEL =
  process.env.LOG_LEVEL ||
  process.env.PINO_LOG_LEVEL ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

let cachedLogger: Logger | null = null;
let cachedIdentity: RuntimeIdentity | null = null;

function parsePmId(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function resolveIdentity(): RuntimeIdentity {
  if (cachedIdentity) {
    return cachedIdentity;
  }

  const host = os.hostname();
  const pmId = parsePmId(
    process.env.pm_id ||
      process.env.PM_ID ||
      process.env.NODE_APP_INSTANCE ||
      process.env.INSTANCE_ID
  );
  const serverId =
    process.env.SERVER_ID ||
    process.env.FLY_ALLOC_ID ||
    process.env.HOSTNAME ||
    host;
  const env = process.env.NODE_ENV || 'development';
  const region =
    process.env.FLY_REGION ||
    process.env.REGION ||
    process.env.AWS_REGION ||
    'unknown';

  cachedIdentity = {
    serverId,
    host,
    env,
    region,
    pmId,
  };
  return cachedIdentity;
}

function createLogger(): Logger {
  const identity = resolveIdentity();
  return pino({
    level: DEFAULT_LOG_LEVEL,
    messageKey: 'message',
    base: {
      serverId: identity.serverId,
      host: identity.host,
      env: identity.env,
      region: identity.region,
      pmId: identity.pmId,
      service: 'gotchiverse-server',
    },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  });
}

export function getRuntimeIdentity(): RuntimeIdentity {
  return resolveIdentity();
}

export function getBaseLogger(): Logger {
  if (!cachedLogger) {
    cachedLogger = createLogger();
  }
  return cachedLogger;
}

export function loggerForGame(
  gameId: string,
  bindings: Record<string, unknown> = {}
): Logger {
  const sanitizedGameId = typeof gameId === 'string' ? gameId : 'unknown';
  return getBaseLogger().child({
    gameId: sanitizedGameId,
    ...bindings,
  });
}
