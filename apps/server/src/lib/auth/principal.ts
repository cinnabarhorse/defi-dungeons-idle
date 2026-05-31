import type { Request } from 'express';
import { authSessionsRepo, playersRepo, apiKeysRepo } from '../db';
import {
  getRequestIpFromHeaders,
  getRequestUserAgentFromHeaders,
  hashApiKey,
  isStakedApiKeysEnabled,
  maskApiKeyForLogs,
} from './api-keys';
import {
  resolveSessionFromRequest,
  type ResolvedSession,
  getSessionSecret,
} from './session';
import { verifySessionToken } from './token';
import {
  verifyApiKeyManagementToken,
  type ApiKeyManagementTokenClaims,
} from './api-key-management-token';

export type AuthMethod =
  | 'session_cookie'
  | 'session_bearer'
  | 'api_key'
  | 'api_key_management';

export interface AuthPrincipal {
  authMethod: AuthMethod;
  playerId: string | null;
  address: string;
  sessionId: string | null;
  apiKeyId: string | null;
  token: string | null;
  username: string | null;
  isAuthorized: boolean | null;
}

export interface ResolveAuthPrincipalOptions {
  allowApiKey?: boolean;
  allowManagementToken?: boolean;
}

const REQUEST_CACHE_KEY = '__authPrincipalCache';
const API_KEY_TOKEN_PREFIX = 'ddk_live_';

function getCacheKey(options: ResolveAuthPrincipalOptions): string {
  return JSON.stringify({
    allowApiKey: options.allowApiKey !== false,
    allowManagementToken: options.allowManagementToken === true,
  });
}

function getRequestHeaders(req: Request): Record<string, unknown> {
  return (req.headers || {}) as Record<string, unknown>;
}

function getAuthorizationHeader(req: Request): string | undefined {
  const value = req.headers.authorization;
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

function extractBearerToken(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token || null;
}

function isApiKeyToken(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(API_KEY_TOKEN_PREFIX) &&
    value.length > API_KEY_TOKEN_PREFIX.length
  );
}

async function resolvePrincipalFromSessionRecord(
  sessionId: string,
  address: string,
  token: string,
  authMethod: 'session_bearer'
): Promise<AuthPrincipal | null> {
  const record = await authSessionsRepo.getValidAuthSessionById(sessionId);
  if (!record) {
    return null;
  }

  const normalizedAddress = address.trim().toLowerCase();
  if (record.walletAddress !== normalizedAddress) {
    return null;
  }

  return {
    authMethod,
    playerId: record.playerId,
    address: record.walletAddress,
    sessionId: record.id,
    apiKeyId: null,
    token,
    username: null,
    isAuthorized: null,
  };
}

async function resolvePrincipalFromSessionCookie(
  session: ResolvedSession
): Promise<AuthPrincipal> {
  return {
    authMethod: 'session_cookie',
    playerId: session.playerId,
    address: session.address,
    sessionId: session.sessionId,
    apiKeyId: null,
    token: session.token,
    username: null,
    isAuthorized: null,
  };
}

async function tryResolveApiKeyPrincipal(req: Request): Promise<AuthPrincipal | null> {
  if (!isStakedApiKeysEnabled()) {
    return null;
  }

  const authorization = getAuthorizationHeader(req);
  const bearerToken = extractBearerToken(authorization);
  if (!bearerToken || !isApiKeyToken(bearerToken)) {
    return null;
  }

  try {
    const keyHash = hashApiKey(bearerToken);
    const apiKey = await apiKeysRepo.getActiveApiKeyByHash(keyHash);
    if (!apiKey) {
      console.warn('HTTP auth: API key not found or revoked', {
        keyPreview: maskApiKeyForLogs(bearerToken),
      });
      return null;
    }

    const player = await playersRepo.getPlayerById(apiKey.playerId);
    if (!player) {
      return null;
    }

    const headers = getRequestHeaders(req);
    const requestIp = getRequestIpFromHeaders(headers, req.socket?.remoteAddress ?? null);
    const userAgent = getRequestUserAgentFromHeaders(headers);

    await apiKeysRepo.recordAuthSuccess(apiKey.id, {
      ip: requestIp,
      userAgent,
    });

    return {
      authMethod: 'api_key',
      playerId: player.id,
      address: player.walletAddress,
      sessionId: null,
      apiKeyId: apiKey.id,
      token: null,
      username: player.username ?? null,
      isAuthorized: player.isAuthorized,
    };
  } catch (error) {
    console.warn('HTTP auth: API key verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function tryResolveManagementTokenPrincipal(
  req: Request
): Promise<AuthPrincipal | null> {
  const authorization = getAuthorizationHeader(req);
  const bearerToken = extractBearerToken(authorization);
  if (!bearerToken) {
    return null;
  }

  let claims: ApiKeyManagementTokenClaims;
  try {
    claims = verifyApiKeyManagementToken(bearerToken);
  } catch {
    return null;
  }

  const player = await playersRepo.getPlayerById(claims.playerId);
  if (!player) {
    return null;
  }

  if (player.walletAddress.toLowerCase() !== claims.address.toLowerCase()) {
    return null;
  }

  return {
    authMethod: 'api_key_management',
    playerId: player.id,
    address: player.walletAddress,
    sessionId: null,
    apiKeyId: null,
    token: bearerToken,
    username: player.username ?? null,
    isAuthorized: player.isAuthorized,
  };
}

async function tryResolveSessionBearerPrincipal(
  req: Request
): Promise<AuthPrincipal | null> {
  const authorization = getAuthorizationHeader(req);
  const bearerToken = extractBearerToken(authorization);
  if (!bearerToken) {
    return null;
  }

  try {
    const payload = verifySessionToken(bearerToken, getSessionSecret());
    if (!payload?.sessionId || !payload.address) {
      return null;
    }

    return await resolvePrincipalFromSessionRecord(
      payload.sessionId,
      payload.address,
      bearerToken,
      'session_bearer'
    );
  } catch {
    return null;
  }
}

export async function resolveAuthPrincipal(
  req: Request,
  options: ResolveAuthPrincipalOptions = {}
): Promise<AuthPrincipal | null> {
  const allowApiKey = options.allowApiKey !== false;
  const allowManagementToken = options.allowManagementToken === true;

  const reqAny = req as any;
  const cacheKey = getCacheKey({ allowApiKey, allowManagementToken });
  if (!reqAny[REQUEST_CACHE_KEY]) {
    reqAny[REQUEST_CACHE_KEY] = new Map<string, AuthPrincipal | null>();
  }
  const cache: Map<string, AuthPrincipal | null> = reqAny[REQUEST_CACHE_KEY];

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  let resolved: AuthPrincipal | null = null;

  if (allowApiKey) {
    resolved = await tryResolveApiKeyPrincipal(req);
  }

  if (!resolved && allowManagementToken) {
    resolved = await tryResolveManagementTokenPrincipal(req);
  }

  if (!resolved) {
    resolved = await tryResolveSessionBearerPrincipal(req);
  }

  if (!resolved) {
    const session = await resolveSessionFromRequest(req);
    if (session) {
      resolved = await resolvePrincipalFromSessionCookie(session);
    }
  }

  cache.set(cacheKey, resolved);
  return resolved;
}
