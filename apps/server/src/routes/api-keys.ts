import type { Application } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import {
  generateApiKey,
  getApiKeyMaxActivePerPlayer,
  getApiKeyPrefix,
  hashApiKey,
  isStakedApiKeysEnabled,
} from '../lib/auth/api-keys';
import { apiKeysRepo } from '../lib/db';
import {
  isStakeExemptAddress,
} from '../lib/auth/stake-entitlement';
import { verifyWalletOwnsAnyAavegotchi } from '../lib/auth/gotchi-ownership';
import { logError } from '../lib/http-logging';

export interface ApiKeyListItem {
  id: string;
  name: string | null;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  authSuccessCount: number;
  roomJoinCount: number;
}

export interface CreateApiKeyResponse {
  key: ApiKeyListItem;
  apiKey: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapApiKeyListItem(record: {
  id: string;
  name: string | null;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  authSuccessCount: number;
  roomJoinCount: number;
}): ApiKeyListItem {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    authSuccessCount: record.authSuccessCount,
    roomJoinCount: record.roomJoinCount,
  };
}

function getNameFromBody(body: unknown): string | null {
  if (!isPlainObject(body)) {
    return null;
  }
  const raw = body.name;
  if (typeof raw !== 'string') {
    return null;
  }
  const name = raw.trim();
  if (!name) {
    return null;
  }
  return name.slice(0, 64);
}

function featureDisabledResponse(res: any) {
  return res.status(404).json({ error: 'Feature disabled' });
}

function hasRequestedWithXmlHttpRequest(req: any): boolean {
  const value = req?.headers?.['x-requested-with'];
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'xmlhttprequest';
  }
  if (Array.isArray(value)) {
    return value.some(
      (entry) =>
        typeof entry === 'string' &&
        entry.trim().toLowerCase() === 'xmlhttprequest'
    );
  }
  return false;
}

function csrfRejectedResponse(res: any) {
  return res.status(403).json({
    error: 'csrf_validation_failed',
    message: 'Missing required X-Requested-With header',
  });
}

function logApiKeyEligibilityDecision(input: {
  playerId: string;
  walletAddress: string;
  result: 'eligible' | 'ineligible' | 'unavailable';
  source: 'subgraph' | 'rpc' | 'none';
  reason: string;
}) {
  console.info(
    JSON.stringify({
      level: 'info',
      msg: 'api_key_create_eligibility',
      route: '/api/auth/api-keys',
      playerId: input.playerId,
      walletAddress: input.walletAddress,
      result: input.result,
      source: input.source,
      reason: input.reason,
    })
  );
}

export function registerApiKeyRoutes(app: Application) {
  app.post('/api/auth/api-keys', async (req, res) => {
    res.setHeader('X-Request-Id', (req as any).id || '');
    if (!isStakedApiKeysEnabled()) {
      return featureDisabledResponse(res);
    }

    const resolved = await resolveAuthPrincipal(req, {
      allowManagementToken: true,
    });
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }
    if (
      resolved.authMethod === 'session_cookie' &&
      !hasRequestedWithXmlHttpRequest(req)
    ) {
      return csrfRejectedResponse(res);
    }

    try {
      if (!isStakeExemptAddress(resolved.address)) {
        const ownership = await verifyWalletOwnsAnyAavegotchi(resolved.address);
        if (ownership.unavailable) {
          logApiKeyEligibilityDecision({
            playerId: resolved.playerId,
            walletAddress: resolved.address,
            result: 'unavailable',
            source: ownership.source,
            reason: ownership.reason,
          });
          return res.status(503).json({
            error: 'gotchi_ownership_verification_unavailable',
            message:
              'Unable to verify Aavegotchi ownership at this time. Please try again shortly.',
            verification: ownership,
          });
        }

        if (!ownership.owned) {
          logApiKeyEligibilityDecision({
            playerId: resolved.playerId,
            walletAddress: resolved.address,
            result: 'ineligible',
            source: ownership.source,
            reason: ownership.reason,
          });
          return res.status(403).json({
            error: 'gotchi_ownership_required',
            message: 'At least one owned Aavegotchi is required to create an API key.',
            verification: ownership,
          });
        }

        logApiKeyEligibilityDecision({
          playerId: resolved.playerId,
          walletAddress: resolved.address,
          result: 'eligible',
          source: ownership.source,
          reason: ownership.reason,
        });
      } else {
        logApiKeyEligibilityDecision({
          playerId: resolved.playerId,
          walletAddress: resolved.address,
          result: 'eligible',
          source: 'none',
          reason: 'admin_exempt',
        });
      }

      const maxActive = getApiKeyMaxActivePerPlayer();
      const activeCount = await apiKeysRepo.getActiveApiKeyCount(resolved.playerId);
      if (activeCount >= maxActive) {
        return res.status(409).json({
          error: 'active_key_limit_reached',
          message: `Max active API keys reached (${maxActive})`,
          maxActive,
        });
      }

      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = getApiKeyPrefix(apiKey);
      const name = getNameFromBody(req.body);

      const record = await apiKeysRepo.createApiKey({
        playerId: resolved.playerId,
        name,
        keyHash,
        keyPrefix,
      });

      const response: CreateApiKeyResponse = {
        key: mapApiKeyListItem(record),
        apiKey,
      };
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.status(201).json(response);
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.get('/api/auth/api-keys', async (req, res) => {
    res.setHeader('X-Request-Id', (req as any).id || '');
    if (!isStakedApiKeysEnabled()) {
      return featureDisabledResponse(res);
    }

    const resolved = await resolveAuthPrincipal(req, {
      allowManagementToken: true,
    });
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }

    try {
      const rows = await apiKeysRepo.listApiKeysByPlayer(resolved.playerId);
      const keys = rows.map(mapApiKeyListItem);
      return res.json({ keys });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to list API keys' });
    }
  });

  app.delete('/api/auth/api-keys/:id', async (req, res) => {
    res.setHeader('X-Request-Id', (req as any).id || '');
    if (!isStakedApiKeysEnabled()) {
      return featureDisabledResponse(res);
    }

    const resolved = await resolveAuthPrincipal(req, {
      allowManagementToken: true,
    });
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }
    if (
      resolved.authMethod === 'session_cookie' &&
      !hasRequestedWithXmlHttpRequest(req)
    ) {
      return csrfRejectedResponse(res);
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Invalid key id' });
    }

    try {
      const revoked = await apiKeysRepo.revokeApiKey(
        id,
        resolved.playerId,
        'revoked_by_owner'
      );
      if (!revoked) {
        return res.status(404).json({ error: 'API key not found' });
      }
      return res.json({ key: mapApiKeyListItem(revoked) });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to revoke API key' });
    }
  });
}
