import type { Application } from 'express';
import { requireAdminSession } from './admin-auth';
import { logError } from '../lib/http-logging';
import { charactersRepo } from '../lib/db';

export function registerAdminGotchisRoutes(app: Application) {
  // Get gotchi equipment from DB cache
  app.get('/api/admin/gotchis/:id', async (req, res) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }
    try {
      const rawId = String(req.params.id ?? '').trim();
      if (!/^\d+$/.test(rawId)) {
        return res.status(400).json({ error: 'Invalid gotchi id' });
      }
      const record = await charactersRepo.getByGotchiId(rawId);
      if (!record) {
        return res.status(404).json({ error: 'Gotchi not found in cache' });
      }
      res.json({
        gotchi: {
          gotchiId: record.gotchiId,
          ownerAddress: record.ownerAddress,
          wearableSlugs: record.wearableSlugs,
          lastSyncedAt: record.lastSyncedAt,
        },
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load gotchi from DB' });
    }
  });
}
