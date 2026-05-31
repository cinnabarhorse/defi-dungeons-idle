import type { Application } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { clearSessionCookie } from '../lib/auth/session';
import { getWalletPlayEligibilityAtTodaySnapshot } from '../lib/gotchi-auth-eligibility';

export function registerAuthSessionRoute(app: Application) {
  app.get('/api/auth/session', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.status(401).json({ address: null, playerId: null });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ address: resolved.address, playerId: null });
    }

    const playEligibility = await getWalletPlayEligibilityAtTodaySnapshot(
      resolved.address
    );

    return res.json({
      address: resolved.address,
      playerId: resolved.playerId,
      token: resolved.token,
      canPlayToday: playEligibility.canPlayToday,
      playErrorCode: playEligibility.code,
      playError: playEligibility.error,
      acquiredAfterSnapshot: playEligibility.acquiredAfterSnapshot,
      playResetAt: playEligibility.resetAtUtc,
    });
  });
}
