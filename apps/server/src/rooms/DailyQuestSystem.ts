/**
 * Daily Quest Competition System
 *
 * This module handles the daily quest competition leaderboard system.
 * Players compete for daily prizes based on their best scores.
 *
 * Key features:
 * - Leaderboard-based competition (top 10 win prizes)
 * - Time multiplier for early runs (1.5x at reset, tapering to 1x)
 * - Tier unlocks based on Lick Tongues (42/100/500 for normal/nightmare/hell)
 * - Automatic score submission on boss kill
 */

import type { GameRoom } from './GameRoom';
import { dailyQuestLeaderboardRepo } from '../lib/db';
import {
  getDailyQuestCompetitionConfig,
  getCompetitionTier,
  getCompetitionDate,
  calculateTimeMultiplier,
  type CompetitionTier,
} from '../lib/daily-quest-competition';

// ──────────────────────────────────────────────────────────────────────────────
// Legacy Stubs - These are called from various places but no longer do anything
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Legacy function - no longer needed with competition system
 * Kept as stub for backwards compatibility with existing call sites
 */
export async function applyHighStakesAttunementsForRun(
  _room: GameRoom,
  _targetPlayerId?: string | null,
  _autoAttune: boolean = false
): Promise<void> {
  // No-op: Competition system doesn't use attunements
  // Scores are automatically submitted on boss kill
}

/**
 * @deprecated Legacy function - no longer needed with competition system
 * Kept as stub for backwards compatibility with existing call sites
 */
export async function clearHighStakesForPlayer(
  _room: GameRoom,
  _playerId: string
): Promise<void> {
  // No-op: Competition system doesn't track high stakes state
}

/**
 * @deprecated Legacy function - no longer needed with competition system
 * Kept as stub for backwards compatibility with existing call sites
 */
export async function clearHighStakesForRun(_room: GameRoom): Promise<void> {
  // No-op: Competition system doesn't track high stakes state
}

/**
 * @deprecated Legacy function - no longer needed with competition system
 * Kept as stub for backwards compatibility with existing call sites
 */
export async function payStoredDailyQuestRewards(
  _room: GameRoom,
  _playerId: string,
  _sessionId: string,
  _options: { skipUiUpdates?: boolean } = {}
): Promise<void> {
  // No-op: Competition rewards are distributed at end of day via prize distribution job
}

// ──────────────────────────────────────────────────────────────────────────────
// Competition System
// ──────────────────────────────────────────────────────────────────────────────

interface GamePlayerRuntimeStats {
  playerId: string;
  gamePlayerId: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  coinsCollected: number;
  usdcEarnedBaseUnits: number;
  xpGained: number;
  levelStart: number;
  levelEnd: number;
}

const REAL_GOTCHI_FINAL_SCORE_MULTIPLIER = 1.25;

function extractDynamicGotchiId(characterId: unknown): string | null {
  if (typeof characterId !== 'string') return null;
  const match = /^gotchi:(\d{1,32})$/i.exec(characterId.trim());
  return match ? match[1] : null;
}

/**
 * Called when the boss is killed. Submits all players' scores to the competition leaderboard.
 * This replaces the old threshold-based payout system.
 */
export async function handleHighStakesBossKill(
  room: GameRoom,
  _killerSessionId?: string,
  _bossX?: number,
  _bossY?: number
): Promise<void> {
  const config = getDailyQuestCompetitionConfig();

  // Check if competition is enabled and we have a valid game
  if (!config.enabled || !(room as any).currentGameId) {
    return;
  }

  // Collect all player entries - only those with dailyQuestActive enabled
  const entries: Array<{
    playerId: string;
    sessionId: string;
    stats: GamePlayerRuntimeStats | null;
    runScore: number;
    player: any;
  }> = [];

  room.state.players.forEach((player: any, sessionId: string) => {
    const playerId = room.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }

    // Only submit scores for players who enabled daily quest competition
    if (!player.dailyQuestActive) {
      console.log(
        '[DailyQuestSystem] Player skipped - dailyQuestActive is false',
        {
          playerId,
          sessionId,
        }
      );
      return;
    }

    const stats = (room as any).cloneRuntimeStats(sessionId);
    const runScore = (room as any).computeRunScoreForPlayer(playerId, stats);
    entries.push({
      playerId,
      sessionId,
      stats,
      runScore,
      player,
    });
  });

  // Submit all players' scores to the competition leaderboard
  for (const entry of entries) {
    if (entry.runScore > 0) {
      try {
        const result = await submitToCompetitionLeaderboard(
          room,
          entry.playerId,
          entry.sessionId,
          entry.runScore
        );

        if (result.submitted) {
          // Notify client of their leaderboard position
          const client = room.getClientBySessionId(entry.sessionId);
          if (client) {
            room.msg.sendTo(client, 'daily_quest:leaderboard_update', {
              tier: result.tier ?? '',
              rawScore: entry.runScore,
              finalScore: result.finalScore,
              timeMultiplier: result.timeMultiplier,
              gotchiBonusMultiplier: result.gotchiBonusMultiplier ?? 1,
              isRealGotchi: result.isRealGotchi === true,
              rank: result.rank,
            });
          }
        }
      } catch (error) {
        console.error('Failed to submit to competition leaderboard', {
          playerId: entry.playerId,
          runScore: entry.runScore,
          error,
        });
      }
    }
  }
}

/**
 * Submit a player's score to the daily quest competition leaderboard.
 * The score is submitted with a time multiplier based on when the run was completed.
 * Only the player's best score per tier per day is kept.
 */
export async function submitToCompetitionLeaderboard(
  room: GameRoom,
  playerId: string,
  sessionId: string,
  rawScore: number
): Promise<{
  submitted: boolean;
  tier: CompetitionTier | null;
  finalScore: number;
  timeMultiplier: number;
  gotchiBonusMultiplier?: number;
  isRealGotchi?: boolean;
  rank: number | null;
  error?: string;
}> {
  const config = getDailyQuestCompetitionConfig();

  if (!config.enabled) {
    return {
      submitted: false,
      tier: null,
      finalScore: 0,
      timeMultiplier: 1,
      rank: null,
      error: 'Competition disabled',
    };
  }

  const difficultyId = room.state.difficultyTier;
  const competitionTier = getCompetitionTier(difficultyId);

  if (!competitionTier) {
    return {
      submitted: false,
      tier: null,
      finalScore: 0,
      timeMultiplier: 1,
      rank: null,
      error: `Difficulty ${difficultyId} not eligible for competition`,
    };
  }

  // Check if this is solo mode (competition requirement)
  if (config.soloOnly && room.state.players.size > 1) {
    return {
      submitted: false,
      tier: competitionTier,
      finalScore: 0,
      timeMultiplier: 1,
      rank: null,
      error: 'Competition only available for solo runs',
    };
  }

  // Note: Tier unlocks no longer gate daily competition - all players can compete
  // on any difficulty they can access. The only limit is total daily runs.

  const nowMs = Date.now();
  const completedAt = new Date(nowMs).toISOString();
  const date = getCompetitionDate({ nowMs });

  // Check if player already has an entry for today
  const existingEntry = await dailyQuestLeaderboardRepo.getPlayerEntry(
    date,
    competitionTier,
    playerId
  );

  // Get player info for leaderboard display
  const player = room.state.players.get(sessionId);
  const playerName = player?.name ?? null;
  const gotchiId = extractDynamicGotchiId(player?.characterId);
  const isRealGotchi = player?.usesRealGotchi === true && gotchiId != null;
  const gotchiBonusMultiplier = isRealGotchi
    ? REAL_GOTCHI_FINAL_SCORE_MULTIPLIER
    : 1;

  // Time multiplier applies to ALL runs (not just the first)
  const timeMultiplier = calculateTimeMultiplier({ nowMs });
  const finalScore = Math.round(
    rawScore * timeMultiplier * gotchiBonusMultiplier
  );

  console.log('[DailyQuestSystem] Score submission', {
    playerId,
    tier: competitionTier,
    rawScore,
    timeMultiplier,
    gotchiBonusMultiplier,
    isRealGotchi,
    finalScore,
    existingFinalScore: existingEntry?.finalScore ?? null,
  });

  try {
    // Upsert the entry - only updates if score is higher
    await dailyQuestLeaderboardRepo.upsertLeaderboardEntry({
      date,
      difficultyId: competitionTier, // Use competition tier, not raw difficulty
      accountId: playerId,
      rawScore,
      timeMultiplier,
      gotchiBonusMultiplier,
      isRealGotchi,
      runId: (room as any).currentGameId!,
      completedAt,
      playerName,
      gotchiId,
    });

    // Get the player's current rank
    const rank = await dailyQuestLeaderboardRepo.getPlayerRank(
      date,
      competitionTier,
      playerId
    );

    console.log('Submitted score to competition leaderboard', {
      playerId,
      tier: competitionTier,
      rawScore,
      timeMultiplier,
      gotchiBonusMultiplier,
      isRealGotchi,
      finalScore,
      rank,
      date,
    });

    return {
      submitted: true,
      tier: competitionTier,
      finalScore,
      timeMultiplier,
      gotchiBonusMultiplier,
      isRealGotchi,
      rank,
    };
  } catch (error) {
    console.error('Failed to submit score to competition leaderboard', {
      playerId,
      tier: competitionTier,
      rawScore,
      error,
    });

    return {
      submitted: false,
      tier: competitionTier,
      finalScore,
      timeMultiplier,
      gotchiBonusMultiplier,
      isRealGotchi,
      rank: null,
      error: 'Database error',
    };
  }
}

/**
 * Check if a player is eligible for daily quest competition on a specific tier.
 * Checks: valid difficulty and remaining daily runs.
 */
export async function checkCompetitionEligibility(
  playerId: string,
  difficultyId: string
): Promise<{
  eligible: boolean;
  tier: CompetitionTier | null;
  hasUnlockedTier: boolean;
  hasRemainingRuns: boolean;
  runsUsed: number;
  runsRemaining: number;
  error?: string;
}> {
  const config = getDailyQuestCompetitionConfig();

  if (!config.enabled) {
    return {
      eligible: false,
      tier: null,
      hasUnlockedTier: false,
      hasRemainingRuns: false,
      runsUsed: 0,
      runsRemaining: 0,
      error: 'Competition disabled',
    };
  }

  const tier = getCompetitionTier(difficultyId);
  if (!tier) {
    return {
      eligible: false,
      tier: null,
      hasUnlockedTier: false,
      hasRemainingRuns: false,
      runsUsed: 0,
      runsRemaining: 0,
      error: 'Difficulty not eligible for competition',
    };
  }

  const date = getCompetitionDate();

  // All tiers are now open to everyone - no unlock requirements
  const hasUnlockedTier = true;

  // Check remaining daily runs (across all tiers)
  const dailyRunStatus = await dailyQuestLeaderboardRepo.hasRemainingDailyRuns(
    date,
    playerId,
    config.dailyRunsPerDay
  );

  return {
    eligible: dailyRunStatus.hasRemaining,
    tier,
    hasUnlockedTier,
    hasRemainingRuns: dailyRunStatus.hasRemaining,
    runsUsed: dailyRunStatus.used,
    runsRemaining: dailyRunStatus.remaining,
    error: dailyRunStatus.hasRemaining
      ? undefined
      : `No daily competition runs remaining (${dailyRunStatus.used}/${config.dailyRunsPerDay} used)`,
  };
}

/**
 * Get a player's daily quest competition status for all tiers.
 */
export async function getPlayerCompetitionStatus(playerId: string): Promise<{
  enabled: boolean;
  date: string;
  dailyRunsPerDay: number;
  runsUsed: number;
  runsRemaining: number;
  multiplierStatus: {
    currentMultiplier: number;
    hoursSinceReset: number;
    minutesUntilNextTier: number | null;
  };
  tiers: Record<
    CompetitionTier,
    {
      unlocked: boolean;
      required: number;
      hasEntry: boolean;
      entry: {
        rawScore: number;
        finalScore: number;
        timeMultiplier: number;
        gotchiBonusMultiplier: number;
        isRealGotchi: boolean;
        rank: number | null;
      } | null;
    }
  >;
}> {
  const config = getDailyQuestCompetitionConfig();
  const date = getCompetitionDate();

  if (!config.enabled) {
    return {
      enabled: false,
      date,
      dailyRunsPerDay: config.dailyRunsPerDay,
      runsUsed: 0,
      runsRemaining: 0,
      multiplierStatus: {
        currentMultiplier: 1,
        hoursSinceReset: 0,
        minutesUntilNextTier: null,
      },
      tiers: {
        normal: { unlocked: true, required: 0, hasEntry: false, entry: null },
        nightmare: { unlocked: true, required: 0, hasEntry: false, entry: null },
        hell: { unlocked: true, required: 0, hasEntry: false, entry: null },
      },
    };
  }

  const entries = await dailyQuestLeaderboardRepo.getPlayerEntriesForDate(
    date,
    playerId
  );

  // Check remaining daily runs (across all tiers)
  const dailyRunStatus = await dailyQuestLeaderboardRepo.hasRemainingDailyRuns(
    date,
    playerId,
    config.dailyRunsPerDay
  );

  // All tiers are now unlocked for everyone
  const tierData: Record<CompetitionTier, any> = {
    normal: {
      unlocked: true,
      required: 0,
      hasEntry: false,
      entry: null,
    },
    nightmare: {
      unlocked: true,
      required: 0,
      hasEntry: false,
      entry: null,
    },
    hell: {
      unlocked: true,
      required: 0,
      hasEntry: false,
      entry: null,
    },
  };

  // Populate entries and get ranks
  for (const entry of entries) {
    const tier = entry.difficultyId as CompetitionTier;
    if (tierData[tier]) {
      const rank = await dailyQuestLeaderboardRepo.getPlayerRank(
        date,
        tier,
        playerId
      );
      tierData[tier].hasEntry = true;
      tierData[tier].entry = {
        rawScore: entry.rawScore,
        finalScore: entry.finalScore,
        timeMultiplier: entry.timeMultiplier,
        gotchiBonusMultiplier: entry.gotchiBonusMultiplier,
        isRealGotchi: entry.isRealGotchi,
        rank,
      };
    }
  }

  const { currentMultiplier, hoursSinceReset, minutesUntilNextTier } =
    await import('../lib/daily-quest-competition').then((m) =>
      m.getMultiplierStatus()
    );

  return {
    enabled: true,
    date,
    dailyRunsPerDay: config.dailyRunsPerDay,
    runsUsed: dailyRunStatus.used,
    runsRemaining: dailyRunStatus.remaining,
    multiplierStatus: {
      currentMultiplier,
      hoursSinceReset,
      minutesUntilNextTier,
    },
    tiers: tierData,
  };
}
