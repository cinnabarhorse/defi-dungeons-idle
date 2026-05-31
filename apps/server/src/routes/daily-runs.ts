import type { Application, Request } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';
import {
  dailyQuestLeaderboardRepo,
  depositsRepo,
  playerDailyRunBonusRepo,
  playerDailyRunsRepo,
} from '../lib/db';
import {
  getDailyRunAllowance,
  getDailyRunsConfig,
  getDailyRunsDate,
  getDailyRunsResetAt,
} from '../lib/daily-runs';
import {
  getDailyQuestCompetitionConfig,
  getCompetitionTier,
  getCompetitionDate,
  getMultiplierStatus,
  getTierPrizePool,
} from '../lib/daily-quest-competition';

async function getSessionPlayerId(req: Request): Promise<string | null> {
  const resolved = await resolveAuthPrincipal(req);
  return resolved?.playerId ?? null;
}

export function registerDailyRunRoutes(app: Application) {
  /**
   * Daily runs status for progression runs.
   */
  app.get('/api/player/daily-runs', async (req, res) => {
    try {
      const playerId = await getSessionPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const config = getDailyRunsConfig();
      if (!config.enabled) {
        return res.status(404).json({ error: 'Daily runs are disabled' });
      }

      const date = getDailyRunsDate();
      const resetAtUtc = getDailyRunsResetAt();
      const stakedBalances = await depositsRepo.getStakedUnlockBalances(playerId);
      const ghstBalances = await depositsRepo.getStakedTokenBalances(playerId, ['GHST']);
      const ghstStaked = ghstBalances['GHST'] ?? 0;
      const totalStaked = stakedBalances.total;
      const baseAllowedRuns = getDailyRunAllowance({
        usdcStaked: totalStaked,
        tiers: config.tiers,
      });
      const [usedRuns, bonusRunsRaw] = await Promise.all([
        playerDailyRunsRepo.getDailyRunUsage(playerId, date),
        playerDailyRunBonusRepo.getBonusRuns({
          accountId: playerId,
          date,
          mode: 'progression',
        }),
      ]);
      const bonusRuns = Number.isFinite(bonusRunsRaw)
        ? Math.max(0, Math.floor(bonusRunsRaw))
        : 0;
      const allowedRuns = Math.max(0, Math.floor(baseAllowedRuns) + bonusRuns);
      const remainingRuns = Math.max(0, allowedRuns - usedRuns);

      return res.json({
        date,
        resetAtUtc,
        usdcStaked: stakedBalances.usdc,
        ghoStaked: stakedBalances.gho,
        ghstStaked,
        totalStaked,
        allowedRuns,
        baseAllowedRuns,
        bonusRuns,
        usedRuns,
        remainingRuns,
        tiers: config.tiers,
      });
    } catch (error) {
      logError(error, req);
      return res.status(500).json({ error: 'Failed to load daily runs' });
    }
  });
  /**
   * Preview endpoint for daily quest competition.
   * Returns the player's status and prize pool info for the selected difficulty.
   */
  app.get('/api/daily-runs/preview', async (req, res) => {
    try {
      const config = getDailyQuestCompetitionConfig();
      if (!config.enabled) {
        return res.status(404).json({ error: 'Daily quest competition is disabled' });
      }

      const playerId = await getSessionPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const difficultyId =
        typeof req.query.difficultyId === 'string'
          ? req.query.difficultyId.toLowerCase().replace(/-/g, '_')
          : null;

      if (!difficultyId) {
        return res.status(400).json({ error: 'Missing difficultyId' });
      }

      const competitionTier = getCompetitionTier(difficultyId);
      if (!competitionTier) {
        return res.status(400).json({ error: 'Difficulty not eligible for competition' });
      }

      const date = getCompetitionDate();
      const multiplierStatus = getMultiplierStatus();
      const prizePool = getTierPrizePool(competitionTier);

      // Check player's unlock status (kept for compatibility but no longer gates daily runs)
      const unlocks =
        await dailyQuestLeaderboardRepo.getPlayerDailyQuestUnlocks(playerId);

      // All tiers are now open - unlock status no longer gates daily competition
      const hasUnlockedTier = true;

      // Get player's current entry for today (if any)
      const existingEntry = await dailyQuestLeaderboardRepo.getPlayerEntry(
        date,
        competitionTier,
        playerId
      );

      // Get player's rank if they have an entry
      let playerRank: number | null = null;
      if (existingEntry) {
        playerRank = await dailyQuestLeaderboardRepo.getPlayerRank(
          date,
          competitionTier,
          playerId
        );
      }

      // Check how many daily runs the player has remaining today (across all tiers)
      const dailyRunStatus = await dailyQuestLeaderboardRepo.hasRemainingDailyRuns(
        date,
        playerId,
        config.dailyRunsPerDay
      );

      // For backward compatibility with the lobby UI:
      // - remainingAttunements: runs left for the day (across all tiers)
      // - thresholdScore: 0 (no threshold in competition mode)
      // - activeDifficultyId: null (competition mode doesn't have persistent attunement state)
      const hasCompletedRunToday = !!existingEntry;
      const remainingAttunements = dailyRunStatus.remaining;

      return res.json({
        date,
        difficultyId,
        competitionTier,
        enabled: true,
        mode: 'competition',

        // Competition-specific fields
        multiplierStatus,
        prizePool,
        hasUnlockedTier,
        unlockRequired: 0, // No unlock requirements for daily runs
        hasCompletedRunToday,
        // Time multiplier applies to all runs (not just first)
        willGetTimeMultiplier: dailyRunStatus.hasRemaining,

        // Backward-compatible fields for lobby UI
        remainingAttunements,
        attunementsPerDay: config.dailyRunsPerDay,
        // activeDifficultyId is null in preview - the "Enabled" state is ephemeral
        // and only set by the client after calling /attune, before joining the game
        activeDifficultyId: null,
        activeRunId: null,
        thresholdScore: 0,

        // Player's current entry if any
        currentEntry: existingEntry
          ? {
              rawScore: existingEntry.rawScore,
              finalScore: existingEntry.finalScore,
              timeMultiplier: existingEntry.timeMultiplier,
              gotchiBonusMultiplier: existingEntry.gotchiBonusMultiplier,
              isRealGotchi: existingEntry.isRealGotchi,
              rank: playerRank,
            }
          : null,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load daily quest preview' });
    }
  });

  /**
   * Attune endpoint - now just confirms competition participation.
   * In competition mode, scores are automatically submitted on boss kill.
   * This endpoint just confirms the player wants to participate.
   */
  app.post('/api/daily-runs/attune', async (req, res) => {
    try {
      const config = getDailyQuestCompetitionConfig();
      if (!config.enabled) {
        return res.status(404).json({ error: 'Daily quest competition is disabled' });
      }

      const playerId = await getSessionPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const difficultyId =
        typeof req.body?.difficultyId === 'string'
          ? req.body.difficultyId.toLowerCase().replace(/-/g, '_')
          : typeof req.query.difficultyId === 'string'
            ? (req.query.difficultyId as string).toLowerCase().replace(/-/g, '_')
            : null;

      if (!difficultyId) {
        return res.status(400).json({ error: 'Missing difficultyId' });
      }

      const competitionTier = getCompetitionTier(difficultyId);
      if (!competitionTier) {
        return res.status(400).json({ error: 'Difficulty not eligible for competition' });
      }

      const date = getCompetitionDate();

      // Check if player has remaining daily runs (across all tiers)
      const dailyRunStatus = await dailyQuestLeaderboardRepo.hasRemainingDailyRuns(
        date,
        playerId,
        config.dailyRunsPerDay
      );

      if (!dailyRunStatus.hasRemaining) {
        return res.status(403).json({
          error: `No daily competition runs remaining. You've used all ${config.dailyRunsPerDay} runs for today.`,
          code: 'NO_RUNS_REMAINING',
          used: dailyRunStatus.used,
          max: config.dailyRunsPerDay,
        });
      }

      const multiplierStatus = getMultiplierStatus();
      const prizePool = getTierPrizePool(competitionTier);

      // In competition mode, "attuning" just means acknowledging participation
      // The actual attunement consumption happens when joining the game
      return res.json({
        success: true,
        date,
        difficultyId,
        competitionTier,
        mode: 'competition',
        multiplierStatus,
        prizePool,

        // Backward compatible fields
        thresholdScore: 0,
        remainingAttunements: dailyRunStatus.remaining - 1, // Will be consumed when joining
        attunementsPerDay: config.dailyRunsPerDay,
        activeDifficultyId: competitionTier,
        activeRunId: null,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to attune daily quest' });
    }
  });

  // Dev-only endpoint to reset unlock status for testing
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/daily-runs/dev-replenish', async (req, res) => {
      try {
        const config = getDailyQuestCompetitionConfig();
        if (!config.enabled) {
          return res.status(404).json({ error: 'Daily quest competition is disabled' });
        }

        const playerId = await getSessionPlayerId(req);
        if (!playerId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // In competition mode, "replenish" means clearing today's entries
        // so the player can submit a new score
        const date = getCompetitionDate();

        // Actually delete the entries in dev mode (both leaderboard and attunements)
        const { getPgPool } = await import('../lib/db/client');
        const pool = getPgPool();
        await pool.query(
          `DELETE FROM daily_quest_leaderboard WHERE date = $1 AND account_id = $2`,
          [date, playerId]
        );
        await pool.query(
          `DELETE FROM daily_quest_attunements WHERE date = $1 AND account_id = $2`,
          [date, playerId]
        );

        console.log('[DEV] Cleared competition entries and attunements for', {
          playerId,
          date,
        });

        return res.json({
          ok: true,
          date,
          remainingAttunements: config.dailyRunsPerDay,
          attunementsPerDay: config.dailyRunsPerDay,
          message: 'Dev mode: competition entries deleted',
        });
      } catch (error) {
        logError(error, req);
        res.status(500).json({ error: 'Failed to replenish' });
      }
    });
  }
}
