import type { Application } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import { depositsRepo, playersRepo } from '../lib/db';
import { getDailyRunAllowance, getDailyRunsConfig } from '../lib/daily-runs';

async function buildDailyRunsSummary(playerId: string) {
  const config = getDailyRunsConfig();
  const balances = await depositsRepo.getStakedUnlockBalances(playerId);
  const totalStaked = balances.total;
  const allowedRuns = config.enabled
    ? getDailyRunAllowance({
        usdcStaked: totalStaked,
        tiers: config.tiers,
      })
    : 0;

  return {
    enabled: config.enabled,
    allowedRuns,
    usdcStaked: balances.usdc,
    ghoStaked: balances.gho,
    totalStaked,
    tiers: config.tiers,
  };
}

export function registerAdminPlayersRoutes(app: Application) {
  app.get('/api/admin/players', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;
    const orderByParam = req.query.orderBy;
    const orderDirParam = req.query.orderDirection;
    const unauthorizedOnlyParam = req.query.unauthorizedOnly;

    let limit = Number(limitParam);
    let offset = Number(offsetParam);
    const orderBy =
      typeof orderByParam === 'string' ? orderByParam : 'last_seen';
    const orderDirection =
      typeof orderDirParam === 'string' && orderDirParam.toLowerCase() === 'asc'
        ? 'asc'
        : 'desc';
    const unauthorizedOnly =
      unauthorizedOnlyParam === 'true' ||
      unauthorizedOnlyParam === '1' ||
      unauthorizedOnlyParam === 'yes';

    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    if (limit > 200) limit = 200;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    try {
      const pool = (await import('../lib/db/client')).getPgPool();
      const client = await pool.connect();
      try {
        const whereClause = unauthorizedOnly
          ? 'where is_authorized = false'
          : '';
        const countRes = await client.query<{ total: string }>(
          `select count(*)::bigint as total from players ${whereClause}`
        );
        const totalRaw = countRes.rows[0]?.total;
        const total = typeof totalRaw === 'string' ? Number(totalRaw) : 0;

        const safeOrder = [
          'created_at',
          'updated_at',
          'last_seen',
          'level',
          'total_xp',
          'username',
          'wallet_address',
        ].includes(orderBy)
          ? orderBy
          : 'created_at';
        const dataRes = await client.query(
          `select * from players ${whereClause} order by ${safeOrder} ${orderDirection} limit $1 offset $2`,
          [limit, offset]
        );
        const players = dataRes.rows.map((row: any) =>
          playersRepo.mapPlayerRow(row)
        );
        res.json({ players, pagination: { limit, offset, total } });
      } finally {
        client.release();
      }
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to list players' });
    }
  });

  app.get('/api/admin/players/by-id/:id', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    try {
      const id = req.params.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        return res.status(400).json({ error: 'id is required' });
      }
      const player = await playersRepo.getPlayerById(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      const dailyRuns = await buildDailyRunsSummary(player.id);
      res.json({ player, dailyRuns });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load player' });
    }
  });

  app.get('/api/admin/players/by-wallet/:wallet', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }
    try {
      const wallet = req.params.wallet;
      if (typeof wallet !== 'string' || wallet.trim().length === 0) {
        return res.status(400).json({ error: 'wallet is required' });
      }
      const player = await playersRepo.getPlayerByWallet(wallet);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      const dailyRuns = await buildDailyRunsSummary(player.id);
      res.json({ player, dailyRuns });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load player' });
    }
  });

  app.post('/api/admin/players/:id/authorize', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    try {
      const id = req.params.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        return res.status(400).json({ error: 'id is required' });
      }
      const player = await playersRepo.authorizePlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.json({ player });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to authorize player' });
    }
  });

  app.post('/api/admin/players/:id/deauthorize', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    try {
      const id = req.params.id;
      if (typeof id !== 'string' || id.trim().length === 0) {
        return res.status(400).json({ error: 'id is required' });
      }
      const player = await playersRepo.deauthorizePlayer(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.json({ player });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to deauthorize player' });
    }
  });
}
