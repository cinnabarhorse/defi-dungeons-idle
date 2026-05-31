import type { Application } from 'express';
import { fetchAavegotchisOfOwnerAtBlock } from '../lib/aavegotchi';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { buildSnapshotMissingError } from '../lib/gotchi-auth-eligibility';
import { normalizeMany } from '../lib/gotchi-normalize';
import {
  generateMany,
  getExistingSpriteInfo,
  type SpriteInfo,
} from '../lib/gotchi-sprites';
import {
  getTodaySnapshotOrCapture,
  getTodayUtcDateString,
} from '../lib/gotchi-snapshot';
import { logError } from '../lib/http-logging';

function toPublicSprite(info: SpriteInfo) {
  return { id: info.id, url: info.url, hash: info.hash };
}

export function registerPlayerGotchiRoutes(app: Application) {
  app.get('/api/aavegotchis', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const snapshotDate = getTodayUtcDateString();
      const snapshot = await getTodaySnapshotOrCapture();
      if (!snapshot) {
        return res.status(503).json(buildSnapshotMissingError(snapshotDate));
      }
      const aavegotchis = await fetchAavegotchisOfOwnerAtBlock(
        resolved.address,
        snapshot.blockNumber
      );
      return res.json({ owner: resolved.address, aavegotchis });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to fetch Aavegotchis' });
    }
  });

  app.post('/api/gotchis/generate', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const snapshotDate = getTodayUtcDateString();
      const snapshot = await getTodaySnapshotOrCapture();
      if (!snapshot) {
        return res.status(503).json(buildSnapshotMissingError(snapshotDate));
      }
      const raw = await fetchAavegotchisOfOwnerAtBlock(
        resolved.address,
        snapshot.blockNumber
      );
      const normalized = normalizeMany(raw);
      const infos = await generateMany(normalized);
      res.setHeader('X-Request-Id', (req as any).id || '');
      return res.json({
        wallet: resolved.address,
        sprites: infos.map(toPublicSprite),
      });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to generate sprites' });
    }
  });

  app.get('/api/gotchis', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const snapshotDate = getTodayUtcDateString();
      const snapshot = await getTodaySnapshotOrCapture();
      if (!snapshot) {
        return res.status(503).json(buildSnapshotMissingError(snapshotDate));
      }
      const raw = await fetchAavegotchisOfOwnerAtBlock(
        resolved.address,
        snapshot.blockNumber
      );
      const normalized = normalizeMany(raw);
      const existing = await Promise.all(
        normalized.map((g) => getExistingSpriteInfo(g.id))
      );
      const infos = existing.filter(Boolean) as SpriteInfo[];
      res.setHeader('X-Request-Id', (req as any).id || '');
      return res.json({
        wallet: resolved.address,
        sprites: infos.map(toPublicSprite),
      });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to list sprites' });
    }
  });
}
