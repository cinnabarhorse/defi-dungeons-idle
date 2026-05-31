import type { Application, Request, Response } from 'express';
import { promisify } from 'util';
import { gunzip as gunzipCallback } from 'zlib';
import { requireAdminSession } from '../admin-auth';
import { serverLogIndexRepo, getSupabaseAdminClient } from '../../lib/db';
import { DEBUG_LOG_BUCKET } from '../../lib/logging/log-schema';
import { parseTimestamp } from './utils';

const gunzip = promisify(gunzipCallback);

async function downloadShardBuffer(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const result = await supabase.storage
    .from(DEBUG_LOG_BUCKET)
    .download(storagePath);
  if (result.error || !result.data) {
    throw new Error(
      `Failed to download shard ${storagePath}: ${result.error?.message || 'unknown error'}`
    );
  }
  const arrayBuffer = await result.data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function writeShardToResponse(storagePath: string, res: Response) {
  const compressed = await downloadShardBuffer(storagePath);
  const decompressed = await gunzip(compressed);
  res.write(decompressed);
}

export function registerAdminLogsRoutes(app: Application) {
  app.get('/api/admin/logs/games', async (req: Request, res: Response) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    const limitRaw =
      typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const limit =
      limitRaw && Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(limitRaw, 1000))
        : undefined;
    try {
      const games = await serverLogIndexRepo.listGamesWithLogs({
        from,
        to,
        limit,
      });
      res.json({ games, count: games.length });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to list games with logs',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/api/admin/logs/shard', async (req: Request, res: Response) => {
    const session = await requireAdminSession(req, res);
    if (!session) {
      return;
    }
    const path =
      typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!path) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    try {
      res.setHeader('Content-Type', 'application/x-ndjson');
      await writeShardToResponse(path, res);
      res.end();
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch shard',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get(
    '/api/admin/logs/:gameId/shards',
    async (req: Request, res: Response) => {
      const session = await requireAdminSession(req, res);
      if (!session) {
        return;
      }

      const gameId = req.params.gameId;
      if (!gameId) {
        res.status(400).json({ error: 'gameId is required' });
        return;
      }

      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : undefined;
      const limit =
        limitRaw && Number.isFinite(limitRaw)
          ? Math.max(1, Math.min(limitRaw, 500))
          : undefined;

      try {
        const shards = await serverLogIndexRepo.listShardsForGame({
          gameId,
          from,
          to,
          limit,
        });
        res.json({
          shards,
          count: shards.length,
          gameId,
          adminAddress: session.address,
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to list log shards',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  app.get(
    '/api/admin/logs/:gameId/download',
    async (req: Request, res: Response) => {
      const session = await requireAdminSession(req, res);
      if (!session) {
        return;
      }

      const gameId = req.params.gameId;
      if (!gameId) {
        res.status(400).json({ error: 'gameId is required' });
        return;
      }

      const from = parseTimestamp(req.query.from);
      const to = parseTimestamp(req.query.to);
      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : undefined;
      const limit =
        limitRaw && Number.isFinite(limitRaw)
          ? Math.max(1, Math.min(limitRaw, 500))
          : undefined;

      try {
        const shards = await serverLogIndexRepo.listShardsForGame({
          gameId,
          from,
          to,
          limit,
        });

        if (shards.length === 0) {
          res
            .status(404)
            .json({ error: 'No shards found for requested range' });
          return;
        }

        const sorted = shards.slice().sort((a, b) => {
          return a.tsStart.localeCompare(b.tsStart);
        });

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${gameId}-logs.ndjson"`
        );
        res.setHeader('X-Log-Shard-Count', sorted.length.toString());

        for (const shard of sorted) {
          await writeShardToResponse(shard.storagePath, res);
        }
        res.end();
      } catch (error) {
        res.status(500).json({
          error: 'Failed to download logs',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
