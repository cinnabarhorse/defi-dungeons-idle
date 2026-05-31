import type { Application, Request } from 'express';
import { playersRepo, authSessionsRepo } from '../lib/db';
import { getWalletPlayEligibilityAtTodaySnapshot } from '../lib/gotchi-auth-eligibility';
import { createSessionCookie } from '../lib/auth/session';
import {
  verifySiwePayload,
  SiweVerificationError,
} from '../lib/auth/siwe-verify';
import { logError } from '../lib/http-logging';

export interface RegisterAuthVerifyRouteOptions {
  siweDomain: string;
  baseChainId: number;
  sessionDurationSeconds: number;
  validateNonce: (nonce: string) => boolean;
  getAllowedDomains: () => string[];
}

function getClientIp(req: Request) {
  const header = (req.headers['x-forwarded-for'] as string) || '';
  if (header) {
    const [first] = header.split(',');
    if (first && first.trim()) {
      return first.trim();
    }
  }
  return req.socket?.remoteAddress || null;
}

export function registerAuthVerifyRoute(
  app: Application,
  options: RegisterAuthVerifyRouteOptions
) {
  app.post('/api/auth/verify', async (req, res) => {
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

      const normalizedAddress = verified.address;
      const playEligibility = await getWalletPlayEligibilityAtTodaySnapshot(
        normalizedAddress
      );

      const player = await playersRepo.upsertPlayerByWallet({
        walletAddress: normalizedAddress,
        region: typeof req.body?.region === 'string' ? req.body.region : null,
      });

      await playersRepo.touchLastSeen(player.id);

      const hadAnySession = await authSessionsRepo.hasAnySessionForPlayer(
        player.id
      );

      const expiresAt = new Date(
        Date.now() + options.sessionDurationSeconds * 1000
      );
      const sessionRecord = await authSessionsRepo.createAuthSession({
        playerId: player.id,
        walletAddress: normalizedAddress,
        nonce: verified.nonce,
        expiresAt,
        userAgent: (req.headers['user-agent'] as string) || null,
        ip: getClientIp(req),
      });

      const session = createSessionCookie({
        address: normalizedAddress,
        sessionId: sessionRecord.id,
        expirationSeconds: options.sessionDurationSeconds,
      });
      res.setHeader('Set-Cookie', session.cookie);

      return res.json({
        address: normalizedAddress,
        playerId: player.id,
        sessionId: sessionRecord.id,
        token: session.token,
        issuedAt: sessionRecord.issuedAt || new Date().toISOString(),
        expirationTime: expiresAt.toISOString(),
        isFirstLogin: !hadAnySession,
        canPlayToday: playEligibility.canPlayToday,
        playErrorCode: playEligibility.code,
        playError: playEligibility.error,
        acquiredAfterSnapshot: playEligibility.acquiredAfterSnapshot,
        playResetAt: playEligibility.resetAtUtc,
      });
    } catch (error) {
      if (error instanceof SiweVerificationError) {
        return res.status(error.status).json({ error: error.message });
      }
      logError(error, req);
      if (process.env.DEBUG_SIWE === '1') {
        try {
          const snippet =
            typeof req.body?.message === 'string'
              ? String(req.body.message).slice(0, 200)
              : null;
          return res
            .status(400)
            .json({ error: 'Invalid SIWE message', debug: { snippet } });
        } catch (debugError) {
          void debugError;
        }
      }
      return res.status(400).json({ error: 'Invalid SIWE message' });
    }
  });
}
