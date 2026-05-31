import type { Client } from 'colyseus';
import type { GameRoom } from './GameRoom';
import {
  competitionVictoryChestClaimsRepo,
  inventoryRepo,
  playerDailyRunBonusRepo,
  runTransaction,
} from 'src/lib/db';
import { getDailyRunsDate } from 'src/lib/daily-runs';
import { getCompetitionDate } from 'src/lib/daily-quest-competition';
import { rollVictoryChestReward } from 'src/lib/victory-chest/rewards';
import type { VictoryChestOpenedPayload } from 'src/types/messages';

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sendOpenFailed(room: GameRoom, client: Client, reason: string) {
  try {
    room.msg.sendTo(client, 'victory_chest_open_failed', { reason });
  } catch {
    // ignore
  }
}

export async function handleOpenVictoryChest(room: GameRoom, client: Client) {
  console.log('[VictoryChest] handleOpenVictoryChest start', {
    sessionId: client.sessionId,
  });
  const player = room.state.players.get(client.sessionId);
  if (!player) {
    sendOpenFailed(room, client, 'Player not found in room');
    return;
  }

  console.log('[VictoryChest] gating snapshot', {
    sessionId: client.sessionId,
    runStatus: player.idleRoom?.runStatus,
    dailyQuestActive: player.dailyQuestActive,
    status: player.idleRoom?.victoryChestStatus,
    gameId: String(player.idleRoom?.victoryChestGameId || ''),
  });

  if (player.idleRoom.runStatus !== 'victory') {
    sendOpenFailed(room, client, 'Chest only available after Victory');
    return;
  }
  if (player.dailyQuestActive !== true) {
    sendOpenFailed(room, client, 'Chest only available for competition runs');
    return;
  }

  const gameId = String(player.idleRoom.victoryChestGameId || '');
  if (!gameId) {
    sendOpenFailed(room, client, 'Missing gameId for victory chest');
    return;
  }

  const playerId = room.getPlayerIdForSession(client.sessionId);
  if (!playerId) {
    sendOpenFailed(room, client, 'Missing playerId for session');
    return;
  }

  // Fast-path: already opened in state (reconnect/double click)
  const existingFromState = safeJsonParse(
    String(player.idleRoom.victoryChestRewardJson ?? '')
  );
  if (player.idleRoom.victoryChestStatus === 'opened' && existingFromState) {
    room.msg.sendTo(
      client,
      'victory_chest_opened',
      existingFromState as VictoryChestOpenedPayload
    );
    return;
  }

  // Ensure chest is available (or was opened but state payload is missing/corrupt)
  if (
    player.idleRoom.victoryChestStatus !== 'available' &&
    player.idleRoom.victoryChestStatus !== 'opened'
  ) {
    sendOpenFailed(room, client, 'Victory chest is not available');
    return;
  }

  const competitionDate = getCompetitionDate();
  const progressionDate = getDailyRunsDate();

  const existing = await competitionVictoryChestClaimsRepo.getByGameAndPlayer({
    gameId,
    accountId: playerId,
  });
  if (existing) {
    const payload =
      (existing.rewardPayload ?? {}) as unknown as VictoryChestOpenedPayload;
    player.idleRoom.victoryChestStatus = 'opened';
    player.idleRoom.victoryChestRewardJson = JSON.stringify(payload);
    room.msg.sendTo(client, 'victory_chest_opened', payload);
    return;
  }

  // If state says opened but we can't hydrate from DB, fail safe (no re-roll).
  if (player.idleRoom.victoryChestStatus === 'opened') {
    sendOpenFailed(room, client, 'Victory chest already opened');
    return;
  }

  const rolled = rollVictoryChestReward();
  const payload: VictoryChestOpenedPayload = {
    source: 'competition_victory_chest',
    gameId,
    competitionDate,
    goldBonus: rolled.goldBonus,
    reward: rolled.reward,
  };

  await runTransaction(async (dbClient) => {
    // Re-check idempotency inside transaction
    const already = await competitionVictoryChestClaimsRepo.getByGameAndPlayer({
      gameId,
      accountId: playerId,
      client: dbClient,
    });
    if (already) return;

    // Always grant gold bonus
    if (payload.goldBonus.amount > 0) {
      await inventoryRepo.upsertInventoryItem({
        playerId,
        itemType: 'coin',
        itemName: 'Gold',
        quantity: payload.goldBonus.amount,
        itemData: { source: 'competition_victory_chest', gameId, competitionDate },
        client: dbClient,
      });
    }

    const reward = payload.reward;
    if (reward.type === 'potion') {
      await inventoryRepo.upsertInventoryItem({
        playerId,
        itemType: 'potion',
        itemName: reward.itemName,
        quantity: reward.quantity,
        itemData: {
          type: 'potion',
          potionTier: reward.potionTier,
          source: 'competition_victory_chest',
          gameId,
          competitionDate,
        },
        client: dbClient,
      });
    } else if (reward.type === 'bonus_progression_run') {
      await playerDailyRunBonusRepo.incrementBonusRuns({
        accountId: playerId,
        date: progressionDate,
        mode: 'progression',
        delta: 1,
        client: dbClient,
      });
    } else if (reward.type === 'bonus_competition_run') {
      await playerDailyRunBonusRepo.incrementBonusRuns({
        accountId: playerId,
        date: competitionDate,
        mode: 'competition',
        delta: 1,
        client: dbClient,
      });
    } else if (reward.type === 'wearable') {
      await inventoryRepo.createInventoryInstances({
        playerId,
        items: [
          {
            wearableSlug: reward.wearableSlug,
            quality: 'excellent',
            durabilityScore: reward.durabilityScore,
            itemData: {
              source: 'competition_victory_chest',
              gameId,
              competitionDate,
              rarity: reward.rarity,
            },
          },
        ],
        client: dbClient,
      });
    }

    await competitionVictoryChestClaimsRepo.insertClaim({
      gameId,
      accountId: playerId,
      competitionDate,
      rewardType: reward.type,
      rewardPayload: payload as unknown as Record<string, unknown>,
      client: dbClient,
    });
  });

  player.idleRoom.victoryChestStatus = 'opened';
  player.idleRoom.victoryChestRewardJson = JSON.stringify(payload);
  room.msg.sendTo(client, 'victory_chest_opened', payload);
}
