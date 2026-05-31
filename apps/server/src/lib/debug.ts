import { GameRoom } from 'src/rooms/GameRoom';
import { GAME_CONFIG } from './constants';
import { EntitySchema, PlayerSchema } from 'src/schemas';
import {
  getRandomItemType,
  generateItemData,
  getAllItemCategories,
} from 'src/data/items';

// Utility function to generate random positions
export function generateRandomPosition(padding: number = 100): {
  x: number;
  y: number;
} {
  const x = padding + Math.random() * (GAME_CONFIG.WORLD_WIDTH - 2 * padding);
  const y = padding + Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 2 * padding);
  return { x, y };
}

// Utility function to generate positions in a circle pattern
export function spawnTestItems(room: GameRoom) {
  console.log('🎁 Spawning test items in clumps for vacuum testing...');

  // Get all available item categories dynamically from items.ts
  const itemCategories = getAllItemCategories();
  const numClumps = 5; // Reduced from 20 to 5 clumps for better performance
  const itemsPerClump = 20; // Reduced from 50 to 20 items per clump

  for (let clump = 0; clump < numClumps; clump++) {
    // Random clump center position using utility
    const clumpCenter = generateRandomPosition(200);

    for (let i = 0; i < itemsPerClump; i++) {
      // Random position within clump (50px radius)
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 50;
      const x = clumpCenter.x + Math.cos(angle) * distance;
      const y = clumpCenter.y + Math.sin(angle) * distance;

      // Get random item category and then random item type from that category
      const randomCategory =
        itemCategories[Math.floor(Math.random() * itemCategories.length)];
      const randomItemType = getRandomItemType(randomCategory);

      // Generate item data using centralized system
      const itemData = generateItemData(randomItemType);

      // Create test item entity
      const testItem = new EntitySchema();
      testItem.id = `test_${clump}_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      testItem.kind = 'collectible';
      testItem.x = x;
      testItem.y = y;
      testItem.state = JSON.stringify(itemData);

      // Add to game state
      room.state.entities.set(testItem.id, testItem);
    }
  }

  console.log(
    `✅ Spawned ${numClumps * itemsPerClump} test items in ${numClumps} clumps (reduced count for better performance)`
  );
}


// Function to clear test items
export function clearTestItems(room: GameRoom): number {
  let removedCount = 0;
  for (const [itemId, entity] of room.state.entities) {
    if (entity.kind === 'collectible' && itemId.startsWith('test_')) {
      if (room.state.entities.has(itemId)) {
        room.state.entities.delete(itemId);
      }
      removedCount++;
    }
  }
  console.log(`🧹 Cleared ${removedCount} test items`);
  return removedCount;
}

// Function to spawn RektDoggos in a circle pattern

/**
 * Dev-only helper: determines whether a given player should be treated as
 * invincible to all incoming damage.
 *
 * - Only ever returns true when NODE_ENV !== 'production'
 * - Backed by the PlayerSchema.devInvincible flag, toggled via debug messages
 */
export function isPlayerDevInvincible(
  player: PlayerSchema | null | undefined
): boolean {
  if (!player) return false;
  // Hard guard: never allow client-toggled invincibility in production
  if (process.env.NODE_ENV === 'production') return false;
  try {
    return Boolean((player as any).devInvincible);
  } catch {
    return false;
  }
}

// Centralized debug command handler
export function setupDebugHandlers(room: GameRoom) {
  // Dev-only guard: skip registering debug handlers in production
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(
    `🔧 Debug handlers initialized. Production mode: ${isProduction}`
  );

  // Debug command to spawn test items for vacuum testing
  room.onMessage('spawnTestItems', (client) => {
    if (isProduction) return;
    console.log(
      `🎁 Debug command: Spawning test items for vacuum testing from client ${client.sessionId}`
    );
    spawnTestItems(room);
  });

  // Debug command to clear test items
  room.onMessage('clearTestItems', (client) => {
    if (isProduction) return;
    const removedCount = clearTestItems(room);
    console.log(
      `🧹 Cleared ${removedCount} test items from client ${client.sessionId}`
    );
  });

  // Debug command: toggle per-player dev invincibility
  room.onMessage(
    'debug_toggle_invincibility',
    (client, data: { enabled?: boolean } | null | undefined) => {
      if (isProduction) return;
      const player = room.state.players.get(client.sessionId);
      if (!player) {
        console.warn(
          `⚠️ debug_toggle_invincibility: player not found for session ${client.sessionId}`
        );
        return;
      }

      const current = (player as any).devInvincible === true;
      const next =
        typeof data?.enabled === 'boolean' ? Boolean(data.enabled) : !current;

      (player as any).devInvincible = next;

      console.log(
        `🛡️ Debug: Player ${client.sessionId} invincibility set to ${next}`
      );
    }
  );

  // Debug command: force Idle Mode victory chest (dev-only)
  room.onMessage('debug_idle_force_victory_chest', (client) => {
    if (isProduction) return;
    const player = room.state.players.get(client.sessionId);
    if (!player) return;

    const gameId = String(room.getCurrentGameId() ?? `debug-${Date.now()}`);
    player.dailyQuestActive = true;
    player.idleRoom.runStatus = 'victory';
    player.idleRoom.victoryChestStatus = 'available';
    player.idleRoom.victoryChestGameId = gameId;
    player.idleRoom.victoryChestRewardJson = '';

    console.log(`🏁 Debug: Forced victory chest for ${client.sessionId}`, {
      gameId,
    });
  });

  // Debug command: force teaser chest (locked) for end-of-run flow testing
  room.onMessage('debug_idle_force_victory_chest_teaser', (client) => {
    if (isProduction) return;
    const player = room.state.players.get(client.sessionId);
    if (!player) return;

    const gameId = String(room.getCurrentGameId() ?? `debug-${Date.now()}`);
    player.dailyQuestActive = true;
    player.idleRoom.runStatus = 'victory';
    player.idleRoom.victoryChestStatus = 'teaser';
    player.idleRoom.victoryChestGameId = gameId;
    player.idleRoom.victoryChestRewardJson = '';

    console.log(`🧪 Debug: Forced teaser victory chest for ${client.sessionId}`);
  });

  // Debug command: force Idle Mode defeat (dev-only)
  room.onMessage('debug_idle_force_death', (client) => {
    if (isProduction) return;
    const player = room.state.players.get(client.sessionId);
    if (!player) return;

    player.hp = 0;
    player.idleRoom.runStatus = 'dead';
    player.idleRoom.lastKillingEnemyName = 'Debug Override';
    player.idleRoom.lastKillingEnemyDamage = Math.max(player.maxHp, 1);
    player.idleRoom.lastKillingEnemyHpRemaining = 0;
    player.idleRoom.lastKillingEnemyHpMax = 0;
    player.idleRoom.lastKillingPlayerHpRemaining = 0;
    room.handlePlayerDeath(client.sessionId, 'debug_force_death');

    console.log(`💀 Debug: Forced death for ${client.sessionId}`);
  });
}
