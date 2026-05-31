import type { Request } from 'express';
import { parse, serialize } from 'cookie';
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  signSessionToken,
  verifySessionToken,
} from './token';
import { authSessionsRepo } from '../db';
import type { AuthSessionRecord } from '../db';

const DEFAULT_SESSION_SECRET = 'insecure-development-secret';

// Small in-memory cache to avoid repeated DB lookups during initial load bursts
const SESSION_CACHE_TTL_MS = (() => {
  const raw = Number(process.env.SESSION_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10_000; // default 10s
})();

type CacheEntry = { expiresAt: number; value: ResolvedSession };
const sessionCache = new Map<string, CacheEntry>();

const DEBUG_SESSION_AUTH = process.env.DEBUG_SESSION_AUTH === '1';
//process.env.DEBUG_SESSION_AUTH === '1' || process.env.DEBUG_WS_AUTH === '1';

function maskValue(value?: string | null) {
  if (!value) {
    return value;
  }
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function debugLog(message: string, meta?: Record<string, unknown>) {
  if (!DEBUG_SESSION_AUTH) {
    return;
  }
  if (meta) {
    console.log('[session-auth]', message, meta);
  } else {
    console.log('[session-auth]', message);
  }
}

function debugWarn(message: string, meta?: Record<string, unknown>) {
  if (!DEBUG_SESSION_AUTH) {
    return;
  }
  if (meta) {
    console.warn('[session-auth]', message, meta);
  } else {
    console.warn('[session-auth]', message);
  }
}

export function invalidateSessionCache(sessionId: string) {
  sessionCache.delete(sessionId);
}

function isProduction() {
  console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
  return process.env.NODE_ENV === 'production';
}

function isSecureCookie() {
  const override = (process.env.SESSION_COOKIE_SECURE || '').toLowerCase();
  if (override === 'false' || override === '0') return false;
  if (override === 'true' || override === '1') return true;
  
  // For SameSite=None, we need Secure=true (required by browsers)
  // Browsers allow Secure cookies on localhost even over HTTP
  const cookieDomain = resolveCookieDomain();
  const sameSite = getSameSiteParam(cookieDomain || '');
  if (sameSite === 'none') {
    return true; // Secure required for SameSite=None
  }
  
  return isProduction();
}

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET;
  return secret;
}

function resolveCookieDomain(): string | undefined {
  // Prefer explicit SESSION_COOKIE_DOMAIN; fall back to SIWE_DOMAIN if present
  const raw = (
    process.env.SESSION_COOKIE_DOMAIN ||
    process.env.SIWE_DOMAIN ||
    ''
  )
    .trim()
    .toLowerCase();

  // For localhost, never set a domain - this allows cookies to work across ports
  // Setting domain='localhost' can cause browsers to reject the cookie
  if (!raw || raw === 'localhost' || raw === '127.0.0.1' || raw === '::1') {
    return undefined;
  }

  const withoutDot = raw.replace(/^\./, '');

  // Force apex cookie for any aavegotchi.com subdomain
  if (withoutDot.endsWith('.aavegotchi.com')) {
    return '.aavegotchi.com';
  }

  // Best-effort: collapse to eTLD+1 by taking last two labels
  const parts = withoutDot.split('.');
  if (parts.length >= 2) {
    return `.${parts.slice(-2).join('.')}`;
  }
  return `.${withoutDot}`;
}

// Resolve SameSite behavior based on environment. For cross-origin frontends
// (e.g., Vercel app calling the Hetzner server), we must use "None" to allow
// the browser to attach cookies on XHR/fetch requests. Keep "Lax" by default
// for same-site usage. You can explicitly override via SESSION_COOKIE_SAMESITE.

export interface CreateSessionCookieInput {
  address: string;
  sessionId: string;
  expirationSeconds?: number;
}

export interface SessionFromRequest {
  address: string;
  sessionId: string;
  token: string;
}

export interface ResolvedSession extends SessionFromRequest {
  playerId: string | null;
  record: AuthSessionRecord;
}

export function createSessionCookie(input: CreateSessionCookieInput) {
  const cookieDomain = resolveCookieDomain();

  const sameSiteParam = getSameSiteParam(cookieDomain || '');

  const normalizedAddress = input.address.trim().toLowerCase();
  const token = signSessionToken(
    { address: normalizedAddress, sessionId: input.sessionId },
    getSessionSecret(),
    input.expirationSeconds
      ? { expirationSeconds: input.expirationSeconds }
      : undefined
  );

  console.log('token:', token);
  console.log('cookieDomain:', cookieDomain);
  console.log('sameSiteParam:', sameSiteParam);
  console.log('isSecureCookie:', isSecureCookie());
  console.log('input.expirationSeconds:', input.expirationSeconds);
  console.log('SESSION_DURATION_SECONDS:', SESSION_DURATION_SECONDS);

  const secure = isSecureCookie();
  const sameSite = sameSiteParam;
  
  // Log cookie settings for debugging (only in dev)
  if (!isProduction()) {
    console.log('[cookie]', {
      name: SESSION_COOKIE_NAME,
      domain: cookieDomain || '(not set)',
      sameSite,
      secure,
      path: '/',
    });
  }
  
  const cookie = serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: sameSite,
    secure: secure,
    maxAge: input.expirationSeconds ?? SESSION_DURATION_SECONDS,
    path: '/',
    // Only set domain if it's not undefined (undefined means no domain attribute)
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  return {
    cookie,
    token,
  };
}

export function getSameSiteParam(cookieDomain: string) {
  const envValue = (process.env.SESSION_COOKIE_SAMESITE || '').toLowerCase();
  if (envValue === 'lax' || envValue === 'strict' || envValue === 'none') {
    return envValue as 'lax' | 'strict' | 'none';
  }
  // If a cookie domain is configured and it's not localhost, assume cross-site
  // usage and default to SameSite=None to ensure credentials are included.
  if (
    cookieDomain &&
    cookieDomain !== 'localhost' &&
    cookieDomain !== '127.0.0.1'
  ) {
    return 'none';
  }
  // For localhost (no domain set), we might need SameSite=None for cross-port requests
  // (e.g., localhost:3001 -> localhost:1999). Check if we're in a development environment.
  // In development, use 'none' to allow cross-port cookies on localhost
  if (!cookieDomain && process.env.NODE_ENV !== 'production') {
    return 'none';
  }
  return 'lax';
}

export function clearSessionCookie() {
  const cookieDomain = resolveCookieDomain();

  const sameSiteParam = getSameSiteParam(cookieDomain || '');

  return serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: sameSiteParam,
    secure: isSecureCookie(),
    maxAge: 0,
    path: '/',
    domain: cookieDomain,
  });
}

export function readSessionFromRequest(
  req: Request
): SessionFromRequest | null {
  if (!req.headers.cookie) {
    debugWarn('request missing cookie header', {
      method: req.method,
      url: (req as any).originalUrl || req.url,
    });
    return null;
  }

  const cookies = parse(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    debugWarn('session cookie not found in request cookies', {
      cookieKeys: Object.keys(cookies),
    });
    return null;
  }

  try {
    const payload = verifySessionToken(token, getSessionSecret());
    return {
      address: payload.address,
      sessionId: payload.sessionId,
      token,
    };
  } catch (error) {
    debugWarn('failed to verify session token', {
      tokenPreview: maskValue(token),
      error:
        error instanceof Error ? error.message : String(error ?? 'unknown'),
    });
    return null;
  }
}

export async function resolveSessionFromRequest(
  req: Request
): Promise<ResolvedSession | null> {
  const basic = readSessionFromRequest(req);
  if (!basic) {
    debugWarn('resolveSessionFromRequest: no basic session derived');
    return null;
  }

  try {
    if (SESSION_CACHE_TTL_MS > 0) {
      const cached = sessionCache.get(basic.sessionId);
      if (cached && cached.expiresAt > Date.now()) {
        debugLog('resolveSessionFromRequest: using cached session', {
          sessionId: maskValue(basic.sessionId),
          expiresAt: cached.expiresAt,
        });
        return cached.value;
      }
    }

    const record = await authSessionsRepo.getValidAuthSessionById(
      basic.sessionId
    );
    if (!record) {
      debugWarn('resolveSessionFromRequest: session record not found', {
        sessionId: maskValue(basic.sessionId),
      });
      return null;
    }
    const normalizedAddress = basic.address.trim().toLowerCase();
    if (record.walletAddress !== normalizedAddress) {
      debugWarn('resolveSessionFromRequest: wallet address mismatch', {
        sessionId: maskValue(basic.sessionId),
        recordWallet: record.walletAddress,
        requestWallet: normalizedAddress,
      });
      return null;
    }
    const resolved: ResolvedSession = {
      ...basic,
      address: record.walletAddress,
      playerId: record.playerId,
      record,
    };
    if (SESSION_CACHE_TTL_MS > 0) {
      sessionCache.set(basic.sessionId, {
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
        value: resolved,
      });
    }
    debugLog('resolveSessionFromRequest: session resolved', {
      sessionId: maskValue(basic.sessionId),
      playerId: record.playerId,
    });
    return resolved;
  } catch (error) {
    debugWarn('resolveSessionFromRequest: unexpected error', {
      sessionId: maskValue(basic.sessionId),
      error:
        error instanceof Error ? error.message : String(error ?? 'unknown'),
    });
    return null;
  }
}
