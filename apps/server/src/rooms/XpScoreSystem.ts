import type { GameRoom } from './GameRoom';
import {
  playersRepo,
  runScoresRepo,
  gamePlayersRepo,
  runTransaction,
} from '../lib/db';
// Old daily-runs imports removed - using competition system now
import { SCORE_CONFIG } from '../lib/constants';
import { getEnemyStats } from '../data/enemies';
import { getKillStreakUnitDeltaForClassification } from '../lib/progression/killStreak';
import { GAME_CONFIG } from '../data/game-config';
import { getRewardLeverageMultiplier } from '../lib/trading-game';

interface PlayerRuntimeScoreState {
  score: number;
  eligible: boolean;
  enteredTreasureAt: number | null;
}

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

export function ensurePlayerScoreState(
  room: GameRoom,
  playerId: string
): PlayerRuntimeScoreState {
  // @ts-expect-error - access private property
  let state = room.playerScoreStateByPlayerId.get(playerId);
  if (!state) {
    state = { score: 0, eligible: true, enteredTreasureAt: null };
    // @ts-expect-error - access private property
    room.playerScoreStateByPlayerId.set(playerId, state);
  }
  return state;
}

export function resetScoreTrackingForRun(room: GameRoom) {
  // @ts-expect-error - access private property
  room.playerScoreStateByPlayerId.clear();
  // @ts-expect-error - access private property
  room.pendingScoreDeltas.clear();
  room.playersDiedThisRunByPlayerId.clear();

  room.state.players.forEach((player, sessionId) => {
    const playerId = room.getPlayerIdForSession(sessionId);
    if (SCORE_CONFIG.enabled && playerId) {
      const state = ensurePlayerScoreState(room, playerId);
      state.score = 0;
      state.eligible = true;
      state.enteredTreasureAt = null;
      player.score = 0;
      player.scoreEligible = true;
      scheduleScoreSync(room, sessionId);
    } else {
      player.score = 0;
      player.scoreEligible = true;
    }
  });
}

export function scheduleScoreSync(room: GameRoom, sessionId: string) {
  if (!SCORE_CONFIG.enabled) {
    return;
  }
  // @ts-expect-error - access private property
  if (!room.pendingScoreDeltas.has(sessionId)) {
    // @ts-expect-error - access private property
    room.pendingScoreDeltas.set(sessionId, 0);
  }
}

export function queueScoreDelta(
  room: GameRoom,
  sessionId: string,
  amount: number
) {
  if (!SCORE_CONFIG.enabled) {
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const playerId = room.getPlayerIdForSession(sessionId);
  if (!playerId) {
    return;
  }

  const state = ensurePlayerScoreState(room, playerId);
  const rounded = Math.round(amount);
  const nextScore = Math.min(
    SCORE_CONFIG.maxValue,
    state.score + (rounded > 0 ? rounded : 0)
  );
  state.score = nextScore;
  // @ts-expect-error - access private property
  const previous = room.pendingScoreDeltas.get(sessionId) ?? 0;
  // @ts-expect-error - access private property
  room.pendingScoreDeltas.set(sessionId, previous + rounded);
}

export function setPlayerScoreEligibilityByPlayerId(
  room: GameRoom,
  playerId: string,
  eligible: boolean
): boolean {
  if (!SCORE_CONFIG.enabled) {
    return false;
  }
  const state = ensurePlayerScoreState(room, playerId);
  if (state.eligible === eligible) {
    return false;
  }
  state.eligible = eligible;
  if (!eligible) {
    room.playersDiedThisRunByPlayerId.add(playerId);
  } else {
    room.playersDiedThisRunByPlayerId.delete(playerId);
  }
  return true;
}

export function markPlayerScoreIneligible(room: GameRoom, sessionId: string) {
  if (!SCORE_CONFIG.enabled) {
    return;
  }
  const playerId = room.getPlayerIdForSession(sessionId);
  if (!playerId) {
    return;
  }
  const changed = setPlayerScoreEligibilityByPlayerId(room, playerId, false);
  if (changed) {
    scheduleScoreSync(room, sessionId);
  }
}

export function flushPendingScores(room: GameRoom) {
  if (!SCORE_CONFIG.enabled) {
    // @ts-expect-error - access private property
    room.pendingScoreDeltas.clear();
    return;
  }
  // @ts-expect-error - access private property
  if (room.pendingScoreDeltas.size === 0) {
    return;
  }

  // @ts-expect-error - access private property
  room.pendingScoreDeltas.forEach((_delta: number, sessionId: string) => {
    const player = room.state.players.get(sessionId);
    if (!player) {
      return;
    }
    const playerId = room.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }
    // @ts-expect-error - access private property
    const state = room.playerScoreStateByPlayerId.get(playerId);
    if (!state) {
      return;
    }
    player.score = state.score;
    player.scoreEligible = state.eligible;
  });

  // @ts-expect-error - access private property
  room.pendingScoreDeltas.clear();
}

export function cloneRuntimeStats(
  room: GameRoom,
  sessionId: string
): GamePlayerRuntimeStats | null {
  // @ts-expect-error - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) {
    return null;
  }
  return { ...stats };
}

export function computeRunScoreForPlayer(
  room: GameRoom,
  playerId: string,
  stats?: GamePlayerRuntimeStats | null
): number {
  const scoreState = ensurePlayerScoreState(room, playerId);
  const baseScore = Math.max(0, Math.floor(scoreState.score ?? 0));
  const floorCleared = Math.max(0, room.getFloorReached());
  const kills = Math.max(0, Math.floor(stats?.kills ?? 0));
  const deaths = Math.max(0, Math.floor(stats?.deaths ?? 0));
  const noDeath =
    deaths <= 0 && !room.playersDiedThisRunByPlayerId.has(playerId);

  const computed =
    floorCleared * 1000 +
    kills * 10 +
    (room.bossKilled ? 5000 : 0) +
    (noDeath ? 2000 : 0);

  return Math.max(baseScore, computed);
}

export async function persistPlayerRunScore(
  room: GameRoom,
  options: {
    playerId: string;
    sessionId?: string;
    statsSnapshot?: GamePlayerRuntimeStats | null;
    partySize?: number;
    reason: 'leave' | 'dispose' | 'boss_kill';
    extraMetadata?: Record<string, unknown>;
  }
) {
  if (!SCORE_CONFIG.enabled && options.reason !== 'boss_kill') {
    console.log('SCORE CONFIG DISABLED', { options });
    return;
  }
  // @ts-expect-error - access private property
  if (!room.currentGameId) {
    console.log('NO GAME ID', { options });
    return;
  }

  const { playerId } = options;
  if (!playerId) {
    console.log('NO PLAYER ID', { options });
    return;
  }

  // @ts-expect-error - access private property
  if (room.persistedScorePlayerIds.has(playerId)) {
    console.log('ALREADY PERSISTED', { playerId });
    return;
  }

  // @ts-expect-error - access private property
  const scoreState = room.playerScoreStateByPlayerId.get(playerId);
  if (!scoreState) {
    console.log('NO SCORE STATE', { playerId });
    return;
  }

  console.log('PERSISTING');

  const score = Math.max(0, Math.floor(scoreState.score ?? 0));
  const validForHighScore =
    score > 0 &&
    scoreState.eligible &&
    scoreState.enteredTreasureAt != null &&
    !room.playersDiedThisRunByPlayerId.has(playerId);

  const durationMs =
    room.runStartedAt != null && room.runStartedAt > 0
      ? Math.max(0, Date.now() - room.runStartedAt)
      : null;

  const stats = options.statsSnapshot ?? null;

  // Old high-stakes tracking removed - using competition system now
  // Competition scores are submitted on boss kill via DailyQuestSystem.handleHighStakesBossKill

  const metadata: Record<string, unknown> = {
    ...(options.extraMetadata ?? {}),
    reason: options.reason,
    enteredTreasureAt: scoreState.enteredTreasureAt,
    partySize: options.partySize ?? room.state.players.size,
    sessionId: options.sessionId ?? null,
  };

  if (stats) {
    metadata.gamePlayerId = stats.gamePlayerId;
    metadata.kills = stats.kills;
    metadata.xpGained = stats.xpGained;
  }

  // Capture leverage for this run (single value from Lobby)
  const leverageTotal = (room.state as any).leverageTotal || 1;
  (metadata as any).leverage = { total: leverageTotal };

  try {
    await runTransaction(async (client) => {
      // XP is already multiplied by leverage at award time (in awardXpForEnemyDefeat),
      // so we record xpGained directly without additional leverage multiplication.
      const xpEarned = stats?.xpGained ?? null;

      // Always persist the score, even if not valid for high score
      await runScoresRepo.recordRunScore({
        playerId,
        // @ts-expect-error - access private property
        gameId: room.currentGameId!,
        score,
        difficultyTier: room.state.difficultyTier,
        durationMs,
        kills: stats?.kills ?? null,
        xpEarned,
        validForHighScore,
        metadata,
        client,
      });

      // Only update highest score if valid for high score
      if (validForHighScore) {
        await playersRepo.updateHighestScore(playerId, score, client);
      }

      // Always save score metadata to game_players for fallback
      if (stats?.gamePlayerId) {
        await gamePlayersRepo.applyStats({
          gamePlayerId: stats.gamePlayerId,
          metadata: {
            score: {
              final: score,
              eligible: validForHighScore,
              submittedAt: new Date().toISOString(),
              durationMs,
              difficultyTier: room.state.difficultyTier,
            },
            leverage: { total: leverageTotal },
            // dailyRuns tracking removed - using competition system now
          },
          client,
        });
      }
    });

    // @ts-expect-error - access private property
    room.persistedScorePlayerIds.add(playerId);
  } catch (error) {
    console.error('Failed to persist run score', {
      playerId,
      // @ts-expect-error - access private property
      gameId: room.currentGameId,
      score,
      error,
    });
  }
}

export function awardXpForEnemyDefeat(
  room: GameRoom,
  enemy: any,
  enemyId: string,
  attackType: 'melee' | 'ranged' | 'grenades',
  killerId?: string
): Map<string, number> {
  const xpAwardedBySession = new Map<string, number>();
  const partySize = room.state.players.size;
  if (partySize <= 0) {
    return xpAwardedBySession;
  }

  const enemyType = enemy?.enemyType || enemy?.name || 'unknown';
  const enemyStats = getEnemyStats(enemyType);
  const baseXp = Math.max(0, enemyStats.baseXp || 0);
  if (baseXp <= 0) {
    return xpAwardedBySession;
  }

  const totalXpPool =
    baseXp *
    room.getDifficultyXpMultiplier() *
    room.getGroupXpMultiplier(partySize);
  if (!Number.isFinite(totalXpPool) || totalXpPool <= 0) {
    return xpAwardedBySession;
  }

  const sessionIds = Array.from(room.state.players.keys());
  const normalizedKiller =
    killerId && sessionIds.includes(killerId) ? killerId : undefined;
  const roomLeverage = room.getLeverageTotal();

  const shares = new Map<string, number>();
  if (!normalizedKiller || partySize <= 1) {
    const share = totalXpPool / partySize;
    sessionIds.forEach((id) => shares.set(id, share));
  } else {
    const others = sessionIds.filter((id) => id !== normalizedKiller);
    const killerShare = totalXpPool * 0.6;
    shares.set(normalizedKiller, killerShare);

    if (others.length === 0) {
      shares.set(normalizedKiller, totalXpPool);
    } else {
      const perMember = (totalXpPool * 0.4) / others.length;
      others.forEach((id) => shares.set(id, perMember));
    }
  }

  const shouldAwardScore = SCORE_CONFIG.enabled && Boolean(killerId);
  const xpSource = {
    enemyId,
    enemyType: enemyStats.enemyType,
    attackType,
    classification: enemyStats.classification,
  };

  // Check if XP should be multiplied by leverage
  const xpMultiplierEnabled = GAME_CONFIG.leverage?.xpMultiplierEnabled ?? true;

  shares.forEach((rawShare, sessionId) => {
    const baseXpAmount = Math.round(rawShare);
    const player = room.state.players.get(sessionId);
    const leverageForScore = getRewardLeverageMultiplier(
      player ?? {},
      roomLeverage
    );

    // Award score based on raw share so that killing an enemy always increases score
    if (shouldAwardScore && baseXpAmount > 0) {
      queueScoreDelta(room, sessionId, baseXpAmount * leverageForScore);
    }

    if (baseXpAmount > 0) {
      // Apply leverage multiplier to XP if enabled
      const xpAmount = xpMultiplierEnabled
        ? Math.round(baseXpAmount * leverageForScore)
        : baseXpAmount;
      
      // Calculate actual XP amount after mode-based reduction
      // (awardXpToPlayer will apply this reduction, but we need to track the actual amount)
      const isCompetition = player?.dailyQuestActive === true;
      const actualXpAmount = isCompetition 
        ? xpAmount 
        : Math.round(xpAmount * 0.1);
      
      if (actualXpAmount > 0) {
        // Pass full amount to awardXpToPlayer - it will apply mode-based reduction
        room.awardXpToPlayer(sessionId, xpAmount, xpSource);
        // Track the actual XP awarded (after mode reduction)
        xpAwardedBySession.set(sessionId, actualXpAmount);
      }
    }
  });

  if (normalizedKiller) {
    const unitDelta = getKillStreakUnitDeltaForClassification(
      enemyStats.classification
    );
    if (unitDelta > 0) {
      // @ts-expect-error - access private method
      room.awardKillStreakUnitsToPlayer(normalizedKiller, unitDelta, {
        enemyId,
        enemyType: enemyStats.enemyType,
        attackType,
        classification: enemyStats.classification,
      });
    }
  }

  return xpAwardedBySession;
}
