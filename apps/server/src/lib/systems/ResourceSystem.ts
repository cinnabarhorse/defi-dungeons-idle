import type { Room } from 'colyseus';
import { GameRoomState, EntitySchema } from '../../schemas';
import { getResourceConfig } from '../resource-config';
import { ensureServerBroadcaster } from '../messaging';

export function performResourceHarvest(
  room: Room<GameRoomState>,
  playerId: string,
  resourceId: string,
  resourceType: string
): boolean {
  const broadcaster = ensureServerBroadcaster(room as any);
  const config = getResourceConfig(resourceType);
  if (!config) {
    console.warn(`❌ Unknown resource type: ${resourceType}`);
    return false;
  }

  const player = room.state.players.get(playerId);
  if (!player) return false;

  // Find the resource entity
  const resourceEntity = room.state.entities.get(resourceId);
  if (!resourceEntity || resourceEntity.kind !== 'obstacle') {
    console.warn(
      `${config.emoji} ${config.type} ${resourceId} not found or not an obstacle`
    );
    return false;
  }

  // Parse resource state
  const resourceState = JSON.parse(resourceEntity.state || '{}');
  if (resourceState.type !== config.type) {
    console.warn(
      `${config.emoji} Entity ${resourceId} is not a ${config.type}`
    );
    return false;
  }

  // Check if player is close enough to the resource
  const distance = Math.sqrt(
    Math.pow(player.x - resourceEntity.x, 2) +
      Math.pow(player.y - resourceEntity.y, 2)
  );
  if (distance > config.harvestRange) {
    console.log(
      `Player ${player.name} too far from ${config.type} ${resourceId} (distance: ${distance})`
    );
    return false;
  }

  // Server-side validation: prevent cheating by limiting harvest rate
  const now = Date.now();
  const lastHarvestTime = player.lastAttackTime || 0;
  if (now - lastHarvestTime < config.harvestInterval) {
    console.log(
      `Player ${player.name} ${config.actionVerb} too fast, ignoring ${config.actionVerb} request`
    );
    return false;
  }

  // Update player's last attack time to prevent spam
  player.lastAttackTime = now;

  // Reset resource health if it's been too long since last harvest (10 seconds)
  const harvestTimeout = 10000; // 10 seconds
  if (now - resourceState[config.lastHarvestField] > harvestTimeout) {
    resourceState.health = config.defaultHealth;
    resourceState[config.harvestedByField] = null;
  }

  // Ensure only the same player can continue harvesting a resource
  if (
    resourceState[config.harvestedByField] &&
    resourceState[config.harvestedByField] !== playerId
  ) {
    console.log(
      `${config.emoji} ${config.type} ${resourceId} is being ${config.actionVerb} by another player`
    );
    return false;
  }

  // Set the harvesting player and update harvest time
  resourceState[config.harvestedByField] = playerId;
  resourceState[config.lastHarvestField] = now;
  resourceState.health = (resourceState.health || config.defaultHealth) - 1;

  console.log(
    `${config.emoji} Player ${player.name} ${config.actionVerb} ${config.type} ${resourceId}, health: ${resourceState.health}/${config.defaultHealth}`
  );

  // Update resource state
  resourceEntity.state = JSON.stringify(resourceState);

  // Broadcast harvest feedback to all clients
  if (config.type === 'tree') {
    broadcaster.broadcast('tree_chopped', {
      treeId: resourceId,
      health: resourceState.health,
      maxHealth: config.defaultHealth,
    });
  } else if (config.type === 'stone') {
    broadcaster.broadcast('stone_chopped', {
      stoneId: resourceId,
      health: resourceState.health,
      maxHealth: config.defaultHealth,
    });
  } else {
    broadcaster.broadcast(config.harvestMessage, {
      [`${config.type}Id`]: resourceId,
      health: resourceState.health,
      maxHealth: config.defaultHealth,
    } as Record<string, unknown>);
  }

  // If resource is fully harvested, replace it with collectible drops
  if (resourceState.health <= 0) {
    console.log(
      `${config.emoji} ${config.type} ${resourceId} has been ${config.actionVerb}!`
    );

    // Remove the resource entity (defensive has-check to avoid MapSchema warning)
    if (room.state.entities.has(resourceId)) {
      room.state.entities.delete(resourceId);
    }

    // Create collectible at resource position
    const collectibleEntity = new EntitySchema();
    collectibleEntity.id = `${config.collectibleMaterial}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;
    collectibleEntity.kind = 'collectible';
    collectibleEntity.x = resourceEntity.x;
    collectibleEntity.y = resourceEntity.y;
    collectibleEntity.state = JSON.stringify({
      type: 'material',
      material: config.collectibleMaterial,
      quantity: 1,
      description: config.collectibleDescription,
    });

    room.state.entities.set(collectibleEntity.id, collectibleEntity);

    console.log(
      `${config.emoji} Created ${config.collectibleMaterial} collectible ${collectibleEntity.id} at ${config.type} location`
    );

    // Notify all clients that resource was destroyed
    if (config.type === 'tree') {
      broadcaster.broadcast('tree_cut_down', {
        treeId: resourceId,
        woodId: collectibleEntity.id,
        choppedBy: player.name ?? 'Unknown',
      });
    } else if (config.type === 'stone') {
      broadcaster.broadcast('stone_broken', {
        stoneId: resourceId,
        stoneDropId: collectibleEntity.id,
        brokenBy: player.name ?? 'Unknown',
      });
    } else {
      broadcaster.broadcast(config.destroyMessage, {
        [`${config.type}Id`]: resourceId,
        dropId: collectibleEntity.id,
        destroyedBy: player.name ?? 'Unknown',
      } as Record<string, unknown>);
    }
  }

  return true;
}
