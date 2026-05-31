import type { Application } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import { runScoresRepo } from '../lib/db';

export function registerAdminRunsRoutes(app: Application) {
  app.get('/api/admin/runs', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }

    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;

    let limit = Number(limitParam);
    let offset = Number(offsetParam);

    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    try {
      const result = await runScoresRepo.getAllRuns({
        limit,
        offset,
      });

      res.json({ runs: result.runs, total: result.total });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load runs' });
    }
  });
}