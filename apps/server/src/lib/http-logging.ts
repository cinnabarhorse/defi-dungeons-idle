import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { readSessionFromRequest } from './auth/session';
import { getBaseLogger, emitServerLog, getDebugLogConfig } from './logging';
import { inspect } from 'util';

const logger = getBaseLogger();

function generateRequestId() {
  return randomBytes(8).toString('hex');
}

function nowMs() {
  const [seconds, nanos] = process.hrtime();
  return seconds * 1_000 + Math.floor(nanos / 1_000_000);
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req as any).id || generateRequestId();
  (req as any).id = requestId;
  const startMs = nowMs();
  const startedAt = new Date().toISOString();
  res.setHeader('X-Request-Id', requestId);

  const session = readSessionFromRequest(req);
  const address = session?.address?.toLowerCase() ?? null;

  const onFinish = () => {
    res.removeListener('finish', onFinish);
    res.removeListener('close', onFinish);

    const durationMs = nowMs() - startMs;
    const contentLength = res.getHeader('content-length');
    const setCookie = res.getHeader('set-cookie');
    const setCookiePresent = Array.isArray(setCookie)
      ? setCookie.length > 0
      : Boolean(setCookie);

    // Log as a single JSON line for easy shipping to any log collector
    const logLine = {
      level: 'info',
      time: new Date().toISOString(),
      msg: 'http_request',
      reqId: requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs,
      contentLength:
        typeof contentLength === 'string'
          ? Number(contentLength)
          : contentLength,
      remoteIp:
        (req.headers['x-forwarded-for'] as string) ||
        (req.socket && (req.socket.remoteAddress || '')) ||
        '',
      userAgent: (req.headers['user-agent'] as string) || '',
      hasCookieHeader: Boolean(req.headers.cookie),
      hasSessionCookie: Boolean(address),
      address,
      startedAt,
      setCookiePresent,
    };

    logger.info(logLine, 'http_request');
  };

  res.on('finish', onFinish);
  res.on('close', onFinish);

  next();
}

export function logError(err: unknown, req?: Request) {
  const requestId = req ? (req as any).id : undefined;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const payload = {
    level: 'error',
    msg: 'unhandled_error',
    reqId: requestId,
    path: req?.originalUrl,
    message,
    stack,
  };
  if (getDebugLogConfig().mirrorToConsole) {
    logger.error(payload, 'unhandled_error');
  }
  // Also capture in debug log shards under "server" for visibility in the admin UI
  emitServerLog('server.unhandled_error', {
    message,
    details: {
      reqId: requestId,
      path: req?.originalUrl,
      stack,
    },
  });
}

export function logEvent(
  name: string,
  fields: Record<string, unknown>,
  req?: Request
) {
  const payload = {
    level: 'info',
    time: new Date().toISOString(),
    msg: name,
    reqId: req ? (req as any).id : undefined,
    path: req?.originalUrl,
    ...fields,
  };
  logger.info(payload, name);
}

let consoleCaptureInstalled = false;

function stringifyConsoleArgs(args: unknown[]): string {
  try {
    return args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          const inspected = inspect(a, { depth: 3, breakLength: 120 });
          return inspected;
        } catch {
          return String(a);
        }
      })
      .join(' ');
  } catch {
    return args.map((a) => String(a)).join(' ');
  }
}

export function installConsoleWarningCapture() {
  if (consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    try {
      const message = stringifyConsoleArgs(args);
      emitServerLog('server.warn', {
        level: 'warn',
        message,
        details: { source: 'console.warn' },
      });
    } catch {
      // ignore
    } finally {
      if (getDebugLogConfig().mirrorToConsole) {
        originalWarn(...args);
      }
    }
  };
}
