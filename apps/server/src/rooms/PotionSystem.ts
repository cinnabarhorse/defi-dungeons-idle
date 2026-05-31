import type { Client } from 'colyseus';
import type { GameRoom } from './GameRoom';
import { PlayerSchema } from '../schemas';
import {
  computeHealthPotionHeal,
  computeManaPotionRestore,
  getHealthPotionTier,
  isHealthPotionItem,
  selectOptimalPotion,
  type AvailablePotionsByTier,
} from '../lib/potion-utils';

function decrementInventoryItemQuantity(item: any): void {
  if (!item) return;
  const currentQuantity = Math.max(0, Number(item.quantity) || 0);
  const nextQuantity = Math.max(0, currentQuantity - 1);
  item.quantity = nextQuantity;
}

export function handleHealPlayer(
  room: GameRoom,
  client: Client,
  data: { healAmount: number }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  if (player.hp <= 0) return;

  // Validate heal amount (prevent cheating). Clamp to our potion cap.
  const maxHealAmount = computeHealthPotionHeal(player.maxHp);
  const healAmount = Math.min(
    Math.max(0, Math.floor(Number(data.healAmount) || 0)),
    maxHealAmount
  );

  // Calculate new HP (don't exceed max HP)
  const oldHp = player.hp;
  player.hp = Math.min(player.hp + healAmount, player.maxHp);
  const actualHealed = player.hp - oldHp;

  console.log(
    `Player ${player.id} healed for ${actualHealed} HP (${oldHp} -> ${player.hp})`
  );

  // Broadcast healing effect to all clients (including the healer)
  room.msg.broadcast('player_healed', {
    playerId: client.sessionId,
    healAmount: actualHealed,
    currentHp: player.hp,
    maxHp: player.maxHp,
  });
}

export function handleUseManaPotion(room: GameRoom, client: Client) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  if (player.hp <= 0) return;

  if (player.maxMana <= 0) {
    return;
  }

  if (player.mana >= player.maxMana) {
    return;
  }

  const inventory = (room as any).playerInventories.get(client.sessionId);
  if (!inventory || inventory.length === 0) {
    return;
  }

  const potion = inventory.find((item: any) => {
    if (!item) return false;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return false;
    const type = String(item.type ?? item.itemType ?? '').toLowerCase();
    if (type !== 'potion') return false;
    const name = String(item.name ?? item.itemType ?? '').toLowerCase();
    return name.includes('mana');
  });

  if (!potion) {
    return;
  }

  const previousMana = Math.max(0, Number(player.mana) || 0);
  const restoreAmount = computeManaPotionRestore(player.maxMana);
  const nextMana = Math.min(player.maxMana, previousMana + restoreAmount);
  const restored = nextMana - previousMana;
  if (restored <= 0) {
    return;
  }

  player.mana = nextMana;

  void room.applyInventoryDelta(client.sessionId, potion, -1, {
    auditSource: 'potion_manual_mana',
  });
  if (player.idleRoom) {
    player.idleRoom.persistentManaPotionsUsed += 1;
  }

  room.msg.broadcast('player_mana_restored', {
    playerId: client.sessionId,
    manaAmount: restored,
    currentMana: player.mana,
    maxMana: player.maxMana,
  });
}

export function handleUseHealthPotion(room: GameRoom, client: Client) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  if (player.hp <= 0) return;

  // Already at full HP
  if (player.hp >= player.maxHp) {
    return;
  }

  const inventory = (room as any).playerInventories.get(client.sessionId);
  if (!inventory || inventory.length === 0) {
    return;
  }

  // Find all health potions in inventory
  const healthPotions = inventory.filter((item: any) => {
    if (!item) return false;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return false;
    return isHealthPotionItem(item);
  });

  if (healthPotions.length === 0) {
    return;
  }

  function getPotionTier(item: any) {
    return getHealthPotionTier(item) ?? 1;
  }

  // For manual use: select the HIGHEST tier available (best potion first)
  // Sort by tier descending (highest first)
  healthPotions.sort((a: any, b: any) => getPotionTier(b) - getPotionTier(a));

  const potion = healthPotions[0];
  const tier = getPotionTier(potion);
  const healAmount = computeHealthPotionHeal(player.maxHp, tier);
  const previousHp = Math.max(0, player.hp);
  const nextHp = Math.min(player.maxHp, previousHp + Math.floor(healAmount));
  const actualHealed = Math.max(0, nextHp - previousHp);

  if (actualHealed <= 0) {
    return;
  }

  player.hp = nextHp;

  void room.applyInventoryDelta(client.sessionId, potion, -1, {
    auditSource: `potion_manual_health:tier_${tier}`,
  });
  if (player.idleRoom) {
    player.idleRoom.persistentHealthPotionsUsed += 1;
  }

  room.msg.broadcast('player_healed', {
    playerId: client.sessionId,
    healAmount: actualHealed,
    currentHp: player.hp,
    maxHp: player.maxHp,
    source: 'potion',
    potionTier: tier,
  });
}

/**
 * Try to auto-heal a player who is at or below 0 HP.
 *
 * IMPORTANT: This function consumes exactly 1 potion per damage instance.
 * Uses smart selection to pick the optimal tier:
 * - Lowest tier that saves the player (if any)
 * - Highest available tier otherwise (best chance, but may still die)
 *
 * @returns true if a potion was consumed (regardless of whether player survives)
 */
export function tryAutoHeal(room: GameRoom, player: PlayerSchema): boolean {
  if (!player || player.isBot || player.hp > 0) {
    return false;
  }

  const sessionId = player.id;
  if (!sessionId) {
    return false;
  }

  const inventory = (room as any).playerInventories.get(sessionId);
  if (!inventory || inventory.length === 0) {
    return false;
  }

  // Find all health potions and group by tier
  const healthPotions = inventory.filter((item: any) => {
    if (!item) return false;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return false;
    return isHealthPotionItem(item);
  });

  if (healthPotions.length === 0) {
    return false;
  }

  // Build available potions by tier for smart selection
  const availablePotions: AvailablePotionsByTier = {};
  for (const potion of healthPotions) {
    const tier = getHealthPotionTier(potion) ?? 1;
    const quantity = Number(potion.quantity) || 0;
    availablePotions[tier] = (availablePotions[tier] || 0) + quantity;
  }

  // Use smart selection to pick optimal tier
  const selectedTier = selectOptimalPotion(player.hp, player.maxHp, availablePotions);
  
  if (selectedTier === null) {
    return false;
  }

  // Find a potion of the selected tier
  const potion = healthPotions.find((item: any) => {
    const tier = getHealthPotionTier(item) ?? 1;
    return tier === selectedTier;
  });

  if (!potion) {
    return false;
  }

  // Calculate heal amount based on selected tier
  const healAmount = computeHealthPotionHeal(player.maxHp, selectedTier);

  // Apply heal (can still be negative if damage was severe)
  // HP is currently <= 0, add heal amount
  const previousHp = player.hp; // Could be negative
  const nextHp = Math.min(player.maxHp, previousHp + Math.floor(healAmount));

  // Consume exactly 1 potion regardless of outcome
  void room.applyInventoryDelta(sessionId, potion, -1, {
    auditSource: `potion_auto_heal:tier_${selectedTier}`,
  });

  const actualHealed = Math.floor(healAmount);

  // Update HP
  player.hp = nextHp;

  room.msg.broadcast('player_healed', {
    playerId: sessionId,
    healAmount: actualHealed,
    currentHp: player.hp,
    maxHp: player.maxHp,
    source: 'auto_heal',
    potionTier: selectedTier,
  });

  // Return true - we consumed a potion
  // Caller should check if player.hp > 0 to determine if player survived
  return true;
}

export function tryAutoRestoreMana(room: GameRoom, player: PlayerSchema): boolean {
  if (!player || player.isBot) {
    return false;
  }
  if (player.maxMana <= 0) {
    return false;
  }
  if (player.mana > 0) {
    return false;
  }

  const sessionId = player.id;
  if (!sessionId) {
    return false;
  }

  const inventory = (room as any).playerInventories.get(sessionId);
  if (!inventory || inventory.length === 0) {
    return false;
  }

  const potion = inventory.find((item: any) => {
    if (!item) return false;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return false;
    const type = String(
      item.type ?? (item as any).itemType ?? ''
    ).toLowerCase();
    if (type !== 'potion') return false;
    const name = String(
      (item as any).name ?? (item as any).itemType ?? ''
    ).toLowerCase();
    return name.includes('mana');
  });

  if (!potion) {
    return false;
  }

  const previousMana = Math.max(0, Number(player.mana) || 0);
  const restoreAmount = computeManaPotionRestore(player.maxMana);
  const nextMana = Math.min(player.maxMana, previousMana + restoreAmount);
  const restored = nextMana - previousMana;
  if (restored <= 0) {
    return false;
  }

  player.mana = nextMana;

  void room.applyInventoryDelta(sessionId, potion, -1, {
    auditSource: 'potion_auto_mana',
  });

  room.msg.broadcast('player_mana_restored', {
    playerId: sessionId,
    manaAmount: restored,
    currentMana: player.mana,
    maxMana: player.maxMana,
    source: 'auto_mana',
  });

  return true;
}



