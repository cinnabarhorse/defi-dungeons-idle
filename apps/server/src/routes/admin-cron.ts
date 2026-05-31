/**
 * Admin Cron Routes
 *
 * Endpoints for viewing cron job execution history.
 */

import type { Application, Request, Response } from 'express';
import { cronExecutionsRepo, dailyQuestLeaderboardRepo } from '../lib/db';
import { requireAdminSession } from './admin-auth';
import {
  runPrizeDistributionJob,
  sendPrizeDistributionDiscordNotification,
} from '../jobs/distribute-daily-quest-prizes';
import { getCompetitionDate } from '../lib/daily-quest-competition';

export function registerAdminCronRoutes(app: Application) {
  /**
   * GET /api/admin/cron/executions
   *
   * List cron job executions with optional filtering.
   */
  app.get(
    '/api/admin/cron/executions',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      const jobName = typeof req.query.jobName === 'string' ? req.query.jobName : undefined;
      const status = typeof req.query.status === 'string'
        ? (req.query.status as 'running' | 'success' | 'failed')
        : undefined;
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      try {
        const executions = await cronExecutionsRepo.listExecutions({
          jobName,
          status,
          limit,
          offset,
        });

        res.json({ executions });
      } catch (error) {
        console.error('Failed to list cron executions', { error });
        res.status(500).json({ error: 'Failed to list executions' });
      }
    }
  );

  /**
   * GET /api/admin/cron/executions/:id
   *
   * Get a specific execution by ID.
   */
  app.get(
    '/api/admin/cron/executions/:id',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      const { id } = req.params;

      try {
        const execution = await cronExecutionsRepo.getExecutionById(id);

        if (!execution) {
          res.status(404).json({ error: 'Execution not found' });
          return;
        }

        res.json({ execution });
      } catch (error) {
        console.error('Failed to get cron execution', { id, error });
        res.status(500).json({ error: 'Failed to get execution' });
      }
    }
  );

  /**
   * GET /api/admin/cron/stats
   *
   * Get statistics for cron job executions.
   */
  app.get(
    '/api/admin/cron/stats',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      const jobName = typeof req.query.jobName === 'string'
        ? req.query.jobName
        : 'daily_prize_distribution';

      try {
        const stats = await cronExecutionsRepo.getExecutionStats(jobName);
        const latest = await cronExecutionsRepo.getLatestExecution(jobName);

        res.json({ stats, latest });
      } catch (error) {
        console.error('Failed to get cron stats', { error });
        res.status(500).json({ error: 'Failed to get stats' });
      }
    }
  );

  /**
   * GET /api/admin/cron/check-distribution
   *
   * Check if a distribution has already been done for a specific date.
   */
  app.get(
    '/api/admin/cron/check-distribution',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      // If no date provided, use yesterday (default behavior)
      const date =
        typeof req.query.date === 'string' && req.query.date.trim()
          ? req.query.date.trim()
          : getCompetitionDate({ offsetDays: -1 });

      try {
        const alreadyDistributed =
          await dailyQuestLeaderboardRepo.hasDistributedPrizesForDate(date);

        res.json({
          date,
          alreadyDistributed,
        });
      } catch (error) {
        console.error('Failed to check distribution status', { date, error });
        res.status(500).json({ error: 'Failed to check distribution status' });
      }
    }
  );

  /**
   * POST /api/admin/cron/trigger-distribution
   *
   * Manually trigger prize distribution (for testing or catch-up).
   */
  app.post(
    '/api/admin/cron/trigger-distribution',
    async (req: Request, res: Response) => {
      const admin = await requireAdminSession(req, res);
      if (!admin) return;

      const date = typeof req.body.date === 'string' ? req.body.date : undefined;
      const dryRun = req.body.dryRun === true;
      const allowAlreadyDistributed = req.body.allowAlreadyDistributed === true;

      // Create execution record
      const execution = await cronExecutionsRepo.createExecution({
        jobName: 'daily_prize_distribution',
        targetDate: date,
      });

      console.log(`[Admin] Manually triggered prize distribution`, {
        executionId: execution.id,
        targetDate: date ?? 'yesterday',
        dryRun,
        triggeredBy: admin.address,
      });

      try {
        const result = await runPrizeDistributionJob({
          date,
          dryRun,
          allowAlreadyDistributed,
        });

        const shouldNotifyDiscord =
          result.success && !dryRun && result.prizesDistributed > 0;

        // Update execution record
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
          resultJson: {
            ...result,
            triggeredBy: admin.address,
            dryRun,
            allowAlreadyDistributed,
          },
        });

        if (shouldNotifyDiscord) {
          await sendPrizeDistributionDiscordNotification(result);
        }

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

        res.status(500).json({
          ok: false,
          executionId: execution.id,
          error: errorMessage,
        });
      }
    }
  );
}


