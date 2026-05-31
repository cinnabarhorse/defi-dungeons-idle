import type { Express, Request, Response } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import {
  depositsRepo,
  playersRepo,
  type DepositStatus,
  type PlayerRecord,
} from '../lib/db';
import { getTokenBySymbol } from '../lib/topup/config';

const DISCORD_USDC_TOPUP_WEBHOOK_URL =
  process.env.DISCORD_USDC_TOPUP_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1464924643289989134/kWbM2XGVTUZEBUv_xzbvbe3yS27pETRS8xSsdO2oQIS1lgpzZv0YJnJPZ_zj4NPpEmKj';

function normalizeDepositStatus(value: unknown): DepositStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const lowered = value.trim().toLowerCase();
  const allowed: DepositStatus[] = ['pending', 'confirmed', 'credited', 'failed'];
  return allowed.find((s) => s === lowered) as DepositStatus | undefined;
}

export function registerAdminTopUpRoutes(app: Express): void {
  // Simple health endpoint for smoke tests
  app.get('/api/admin/topups/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Admin: POST /api/admin/top-ups/test-discord
  // Sends a test Discord webhook message to verify configuration
  app.post('/api/admin/top-ups/test-discord', async (req: Request, res: Response) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) return;

    try {
      if (!DISCORD_USDC_TOPUP_WEBHOOK_URL) {
        return res
          .status(400)
          .json({ error: 'Discord webhook URL not configured' });
      }

      const content = `**USDC top-up test**\n\n${adminSession.address} deposited **1 USDC**`;
      const response = await fetch(DISCORD_USDC_TOPUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Discord request failed');
        return res.status(502).json({ error: text });
      }

      return res.json({ ok: true });
    } catch (error) {
      logError(error, req);
      return res
        .status(500)
        .json({ error: 'Failed to send Discord test message' });
    }
  });

  // Admin list of top-ups. Supports "type=deposits" (default) to show on-chain deposits with unlockAt.
  app.get('/api/admin/top-ups', async (req: Request, res: Response) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) return;

    const typeParam = String(req.query.type ?? 'deposits').toLowerCase();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 200));

    // Currently only deposits are supported for admin listing (includes unlockAt)
    if (typeParam !== 'deposits') {
      return res.status(400).json({ error: 'Unsupported type' });
    }

    try {
      const status = normalizeDepositStatus(req.query.status) ?? 'credited';
      const tokenQuery =
        typeof req.query.tokenSymbol === 'string' ? req.query.tokenSymbol : '';
      const normalizedToken = tokenQuery.trim().toUpperCase();
      const tokenConfig =
        normalizedToken && normalizedToken !== 'ALL'
          ? getTokenBySymbol(normalizedToken)
          : null;
      if (normalizedToken && normalizedToken !== 'ALL' && !tokenConfig) {
        return res.status(400).json({ error: 'Unsupported token symbol' });
      }
      const deposits = await depositsRepo.listDepositsByStatus(
        status,
        limit,
        tokenConfig?.symbol
      );

      // Enrich with player info when available
      const playerByIdCache = new Map<string, PlayerRecord | null>();
      const playerByWalletCache = new Map<string, PlayerRecord | null>();

      const getPlayerById = async (id: string | null | undefined) => {
        const key = id?.trim();
        if (!key) return null;
        if (playerByIdCache.has(key)) return playerByIdCache.get(key)!;
        const player = await playersRepo.getPlayerById(key).catch(() => null);
        playerByIdCache.set(key, player);
        return player;
      };

      const getPlayerByWallet = async (address: string | null | undefined) => {
        const key = (address ?? '').toLowerCase();
        if (!key) return null;
        if (playerByWalletCache.has(key)) return playerByWalletCache.get(key)!;
        const player = await playersRepo.getPlayerByWallet(key).catch(() => null);
        playerByWalletCache.set(key, player);
        return player;
      };

      const enriched = await Promise.all(
        deposits.map(async (d) => {
          const player =
            (await getPlayerById(d.userId)) ||
            (await getPlayerByWallet(d.depositorAddress));
          return {
            id: d.id,
            // Resolve player when possible; deposits can exist before a player is linked
            playerId: player?.id ?? d.userId ?? null,
            playerWalletAddress: player?.walletAddress ?? d.depositorAddress ?? null,
            playerUsername: player?.username ?? null,
            tokenSymbol: d.tokenSymbol,
            amount: d.amount,
            amountWei: d.amountWei,
            status: d.txStatus,
            txHash: d.txHash,
            chainId: d.chainId,
            unlockAt: d.unlockAt,
            autoRenew: d.autoRenew,
            pointsMinted: d.pointsMinted,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        })
      );

      return res.json({ topUps: enriched, status, type: 'deposits' });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to load admin top-ups' });
    }
  });
}
