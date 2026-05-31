/**
 * Internal Cron Routes
 *
 * These endpoints are called by scheduled jobs (Supabase Edge Functions)
 * and are protected by a shared CRON_SECRET.
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { cronExecutionsRepo } from '../lib/db';
import {
  runPrizeDistributionJob,
  sendPrizeDistributionDiscordNotification,
} from '../jobs/distribute-daily-quest-prizes';
import { runDailySummaryJob } from '../jobs/send-daily-discord-summary';
import { runSettleCompetitionTradesJob } from '../jobs/settle-competition-trades';
import { captureDailyGotchiSnapshot } from '../jobs/capture-daily-gotchi-snapshot';

// ────────────────────────────────────────────────────────────────────────────
// Middleware: Verify CRON_SECRET
// ────────────────────────────────────────────────────────────────────────────

function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const cronSecret = process.env.CRON_SECRET;
  const requestId = (req as any).id ?? 'unknown';

  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn('[Cron] Missing auth header', {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      forwardedFor: req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  // Expect: "Bearer <secret>"
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    console.warn('[Cron] Invalid auth header format', {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      forwardedFor: req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });
    res.status(401).json({ error: 'Invalid authorization format' });
    return;
  }

  const providedSecret = match[1];
  if (providedSecret !== cronSecret) {
    console.warn('[Cron] Invalid cron secret', {
      requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      forwardedFor: req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });
    res.status(403).json({ error: 'Invalid cron secret' });
    return;
  }

  next();
}

// ────────────────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────────────────

export function registerInternalCronRoutes(app: Application) {
  /**
   * POST /api/internal/settle-competition-trades
   *
   * Triggered by scheduler and as a precondition for prize distribution.
   * Settles previous day's due trade runs (`close_at <= now`).
   */
  app.post(
    '/api/internal/settle-competition-trades',
    requireCronSecret,
    async (req: Request, res: Response) => {
      const date = typeof req.body?.date === 'string' ? req.body.date : undefined;

      const execution = await cronExecutionsRepo.createExecution({
        jobName: 'daily_trade_settlement',
        targetDate: date,
      });

      console.log('[Cron] Starting daily trade settlement job', {
        executionId: execution.id,
        targetDate: date ?? 'yesterday',
      });

      try {
        const result = await runSettleCompetitionTradesJob({ date });
        const success = result.success && result.remainingUnsettled === 0;

        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success,
          prizesDistributed: result.settled,
          prizesSkipped: result.skippedAlreadySettled,
          prizesFailed: result.failed,
          tiersProcessed: 0,
          errors: result.errors.length > 0 ? result.errors : undefined,
          errorMessage:
            result.errors.length > 0 ? result.errors[0] ?? 'Settlement failed' : undefined,
          resultJson: result,
        });

        if (!success) {
          console.error('[Cron] Daily trade settlement incomplete', {
            executionId: execution.id,
            result,
          });
          res.status(500).json({
            ok: false,
            executionId: execution.id,
            result,
          });
          return;
        }

        console.log('[Cron] Daily trade settlement completed', {
          executionId: execution.id,
          targetDate: result.targetDate,
          settled: result.settled,
          staleSettlements: result.staleSettlements,
          durationMs: result.durationMs,
        });

        res.json({
          ok: true,
          executionId: execution.id,
          result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: false,
          errorMessage,
          errors: [errorMessage],
        });

        console.error('[Cron] Daily trade settlement failed', {
          executionId: execution.id,
          error,
        });

        res.status(500).json({
          ok: false,
          executionId: execution.id,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * POST /api/internal/distribute-daily-prizes
   *
   * Triggered by Supabase Edge Function after trade epoch settlement (~00:20 UTC).
   * Distributes prizes for the previous day's competition.
   */
  app.post(
    '/api/internal/distribute-daily-prizes',
    requireCronSecret,
    async (req: Request, res: Response) => {
      const date = typeof req.body?.date === 'string' ? req.body.date : undefined;
      const dryRun = req.body?.dryRun === true;

      // Create execution record
      const execution = await cronExecutionsRepo.createExecution({
        jobName: 'daily_prize_distribution',
        targetDate: date,
      });

      console.log(`[Cron] Starting daily prize distribution job`, {
        executionId: execution.id,
        targetDate: date ?? 'yesterday',
        dryRun,
      });

      try {
        const settlementResult = await runSettleCompetitionTradesJob({ date });
        if (settlementResult.remainingUnsettled > 0 || !settlementResult.success) {
          await cronExecutionsRepo.completeExecution({
            id: execution.id,
            success: false,
            errors: settlementResult.errors,
            errorMessage:
              settlementResult.errors[0] ??
              'Trade settlement incomplete before distribution',
            resultJson: {
              settlement: settlementResult,
            },
          });
          console.error('[Cron] Blocking prize distribution; due trade settlements remain', {
            executionId: execution.id,
            settlementResult,
          });
          res.status(500).json({
            ok: false,
            executionId: execution.id,
            error: 'Trade settlement incomplete before distribution',
            settlement: settlementResult,
          });
          return;
        }

        // Run the prize distribution job
        const result = await runPrizeDistributionJob({ date, dryRun });

        const shouldNotifyDiscord =
          result.success && !dryRun && result.prizesDistributed > 0;

        // Update execution record with results
        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: result.success,
          prizesDistributed: result.prizesDistributed,
          prizesSkipped: result.prizesSkipped,
          prizesFailed: result.prizesFailed,
          totalUsdc: result.totalUsdcDistributed,
          totalGhst: result.totalGhstDistributed,
          tiersProcessed: result.tiersProcessed,
          errors: result.errors.length > 0 ? result.errors : undefined,
          resultJson: { ...result, dryRun },
        });

        if (shouldNotifyDiscord) {
          await sendPrizeDistributionDiscordNotification(result);
        }

        console.log(`[Cron] Daily prize distribution completed`, {
          executionId: execution.id,
          success: result.success,
          prizesDistributed: result.prizesDistributed,
          totalUsdc: result.totalUsdcDistributed,
          totalGhst: result.totalGhstDistributed,
          dryRun,
        });

        res.json({
          ok: true,
          executionId: execution.id,
          result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update execution record with failure
        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: false,
          errorMessage,
          errors: [errorMessage],
        });

        console.error(`[Cron] Daily prize distribution failed`, {
          executionId: execution.id,
          error,
        });

        res.status(500).json({
          ok: false,
          executionId: execution.id,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * POST /api/internal/daily-summary
   *
   * Triggered by Supabase Edge Function at UTC 00:10 daily.
   * Sends a Discord summary of the previous day's activity.
   */
  app.post(
    '/api/internal/daily-summary',
    requireCronSecret,
    async (req: Request, res: Response) => {
      const date = typeof req.body?.date === 'string' ? req.body.date : undefined;

      // Create execution record
      const execution = await cronExecutionsRepo.createExecution({
        jobName: 'daily_discord_summary',
        targetDate: date,
      });

      console.log(`[Cron] Starting daily Discord summary job`, {
        executionId: execution.id,
        targetDate: date ?? 'yesterday',
      });

      try {
        // Run the daily summary job
        const result = await runDailySummaryJob({ date });

        // Update execution record with results
        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: result.success,
          resultJson: result,
          errors: result.error ? [result.error] : undefined,
        });

        console.log(`[Cron] Daily Discord summary completed`, {
          executionId: execution.id,
          success: result.success,
          runsCompleted: result.runsCompleted,
          dau: result.dau,
          highestScore: result.highestScore,
          discordSent: result.discordSent,
        });

        res.json({
          ok: true,
          executionId: execution.id,
          result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Update execution record with failure
        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: false,
          errorMessage,
          errors: [errorMessage],
        });

        console.error(`[Cron] Daily Discord summary failed`, {
          executionId: execution.id,
          error,
        });

        res.status(500).json({
          ok: false,
          executionId: execution.id,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * POST /api/internal/daily-gotchi-snapshot
   *
   * Triggered by Supabase Edge Function at UTC 00:00 daily.
   * Captures a Base block number for daily gotchi ownership snapshot gating.
   */
  app.post(
    '/api/internal/daily-gotchi-snapshot',
    requireCronSecret,
    async (req: Request, res: Response) => {
      const date = typeof req.body?.date === 'string' ? req.body.date : undefined;

      const execution = await cronExecutionsRepo.createExecution({
        jobName: 'daily_gotchi_snapshot',
        targetDate: date,
      });

      console.log(`[Cron] Starting daily gotchi snapshot job`, {
        executionId: execution.id,
        targetDate: date ?? 'today',
      });

      try {
        const result = await captureDailyGotchiSnapshot({ date });

        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: true,
          resultJson: result,
        });

        console.log(`[Cron] Daily gotchi snapshot completed`, {
          executionId: execution.id,
          date: result.date,
          blockNumber: result.blockNumber,
          baseHeadBlock: result.baseHeadBlock,
          subgraphHeadBlock: result.subgraphHeadBlock,
        });

        res.json({
          ok: true,
          executionId: execution.id,
          result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await cronExecutionsRepo.completeExecution({
          id: execution.id,
          success: false,
          errorMessage,
          errors: [errorMessage],
        });

        console.error(`[Cron] Daily gotchi snapshot failed`, {
          executionId: execution.id,
          error,
        });

        res.status(500).json({
          ok: false,
          executionId: execution.id,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * GET /api/internal/health
   *
   * Simple health check for the internal API.
   * Also protected by CRON_SECRET for consistency.
   */
  app.get(
    '/api/internal/health',
    requireCronSecret,
    (_req: Request, res: Response) => {
      res.json({ ok: true, timestamp: new Date().toISOString() });
    }
  );
}
