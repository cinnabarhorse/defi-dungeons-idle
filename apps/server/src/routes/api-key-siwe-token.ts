import type { Application, Request } from 'express';
import { playersRepo } from '../lib/db';
import { logError } from '../lib/http-logging';
import { createApiKeyManagementToken } from '../lib/auth/api-key-management-token';
import { isStakedApiKeysEnabled } from '../lib/auth/api-keys';
import {
  SiweVerificationError,
  verifySiwePayload,
} from '../lib/auth/siwe-verify';

export interface RegisterApiKeySiweTokenRouteOptions {
  siweDomain: string;
  baseChainId: number;
  validateNonce: (nonce: string) => boolean;
  getAllowedDomains: () => string[];
}

export function registerApiKeySiweTokenRoute(
  app: Application,
  options: RegisterApiKeySiweTokenRouteOptions
) {
  app.post('/api/auth/api-keys/siwe-token', async (req, res) => {
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!isStakedApiKeysEnabled()) {
      return res.status(404).json({ error: 'Feature disabled' });
    }

    const { message, signature, isSmartWallet } = req.body ?? {};
    if (typeof message !== 'string' || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    try {
      const verified = await verifySiwePayload({
        message,
        signature,
        isSmartWallet: isSmartWallet === true,
        expectedDomain: options.siweDomain,
        baseChainId: options.baseChainId,
        validateNonce: options.validateNonce,
        allowedDomains: options.getAllowedDomains(),
      });

      const player = await playersRepo.upsertPlayerByWallet({
        walletAddress: verified.address,
        region: typeof req.body?.region === 'string' ? req.body.region : null,
      });
      await playersRepo.touchLastSeen(player.id);

      const managementToken = createApiKeyManagementToken({
        playerId: player.id,
        address: verified.address,
      });

      return res.json({
        token: managementToken.token,
        expiresAt: managementToken.expiresAt,
        playerId: player.id,
        address: verified.address,
      });
    } catch (error) {
      if (error instanceof SiweVerificationError) {
        return res.status(error.status).json({ error: error.message });
      }
      logError(error, req as Request);
      return res.status(400).json({ error: 'Invalid SIWE message' });
    }
  });
}
