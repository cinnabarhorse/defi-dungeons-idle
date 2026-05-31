import { PlayerSchema, IdleLootSchema, IdleRoomSchema } from '../schemas';
import { EncounterManager } from '../lib/idle-systems/EncounterManager';

import { computeBaseDamageForCharacter } from '../lib/combat-utils';
import {
  computePlayerDamageWithCrit,
  applyPlayerLifeSteal,
} from '../lib/ability-handlers';
import {
  aggregateGoldFarm,
  aggregatePotionFarm,
  aggregateTongueFarm,
  getPlayerCleave,
  getPlayerStun,
  getPlayerThorns,
  getEnemyPoison,
} from '../lib/ability-utils';
import { WEAPON_DEFINITIONS } from '../data/weapons';
import { getWearableBySlug } from '../data/wearables';
import {
  rollEnemyDrop,
  rollBossDrops,
  maybeRollLickTongueDrop,
  type DroppedItemData,
  type EnemyDropContext,
} from '../data/loot-table';
import { generateItemData, getItemStats, ITEM_TYPES } from '../data/items';
// Old daily-runs import removed - using competition system now
import type { GameRoom } from './GameRoom';
import { Client } from 'colyseus';
import {
  competitionTradeRunsRepo,
  depositsRepo,
  inventoryRepo,
  playerDailyRunBonusRepo,
  playerDailyRunsRepo,
} from '../lib/db';
import { queueScoreDelta, ensurePlayerScoreState } from './XpScoreSystem';
import { GAME_CONFIG } from '../lib/constants';
import {
  calculateTimeMultiplier,
  getCompetitionDate,
  getCompetitionTier,
} from '../lib/daily-quest-competition';
import { submitToCompetitionLeaderboard } from './DailyQuestSystem';
import { sampleTwapUsd } from '../lib/price-oracle';
import {
  buildFungibleDeltaInput,
  persistInventory,
  recordKill,
} from './SharedGame';
import {
  getDailyRunAllowance,
  getDailyRunsConfig,
  getDailyRunsDate,
  getDailyRunsResetAt,
} from '../lib/daily-runs';
import {
  getHealthPotionCount,
  getManaPotionCount,
  getLickTongueCount,
} from '../lib/db/mappers';
import { deserializeStoredWearable } from '../lib/equipment-service';
import type { InventoryItemPayload } from '../lib/db/mappers';
import { SPELLS_BY_ID } from '../data/spells';
import {
  computeHealthPotionHeal,
  getHealthPotionTier,
  isHealthPotionItem,
} from '../lib/potion-utils';
import { shouldSkipEntryFee } from '../lib/dev-mode';
import {
  getTradeCloseAtIso,
  getRewardLeverageMultiplier,
  getRiskLeverageMultiplier,
  isTradingSettlementCompetitionRun,
  normalizeTradeDirection,
  normalizeTradeLeverage,
  normalizeTradeToken,
} from '../lib/trading-game';

// Idle mode regen multipliers - converts per-second values to per-turn amounts
// In the tick-based mode, regen ticks every 500ms with fractional accumulation
// In idle mode, we apply regen once per player action with these multipliers
const IDLE_HP_REGEN_MULTIPLIER = 25;
const IDLE_MANA_REGEN_MULTIPLIER = 25;
const DEFAULT_MANA_REGEN_PER_SECOND = 0.25;
const MAX_ENEMY_GAUGE_GAIN_PER_TICK = 200;
const MAX_BOSS_GAUGE_GAIN_PER_TICK = 100;
const REAL_GOTCHI_FINAL_SCORE_MULTIPLIER = 1.25;

function recordIdleKill(room: GameRoom, sessionId: string) {
  recordKill(room, sessionId);
  // @ts-ignore - access private property for metrics
  if (typeof (room as any).persistGameMetrics === 'function') {
    // @ts-ignore - access private property for metrics
    room.persistGameMetrics({ totalEnemyKillsDelta: 1 });
  }
}

function notifyIdlePlayerDeath(
  room: GameRoom,
  sessionId: string,
  cause: string
) {
  const handler = (room as unknown as { handlePlayerDeath?: unknown })
    .handlePlayerDeath;
  if (typeof handler !== 'function') return;
  handler.call(room, sessionId, cause);
}

const MAX_ENEMY_ACTIONS_PER_TICK = 1;

/**
 * Get reward configuration for a player's current mode
 * @param player - Player schema to determine mode from
 * @returns Reward configuration object for the player's mode
 */
export function getModeRewardConfig(player: PlayerSchema) {
  const isCompetition = player.dailyQuestActive === true;
  const mode = isCompetition ? 'competition' : 'progression';
  return (GAME_CONFIG as any).modeRewards?.[mode] ?? {
    earnXp: true,
    earnGold: true,
    earnLickTongue: true,
    earnWearables: true,
    earnPotions: false,
  };
}

function getIdleCombatLeverage(room: GameRoom, player: PlayerSchema): number {
  return getRiskLeverageMultiplier(
    player,
    Number(room.state.leverageTotal) || 1
  );
}

function getIdleRewardLeverage(room: GameRoom, player: PlayerSchema): number {
  return getRewardLeverageMultiplier(
    player,
    Number(room.state.leverageTotal) || 1
  );
}

function resolveTradeRunGotchiBonus(player: PlayerSchema): {
  gotchiBonusMultiplier: number;
  isRealGotchi: boolean;
} {
  const hasDynamicGotchiId =
    typeof player.characterId === 'string' &&
    /^gotchi:(\d{1,32})$/i.test(player.characterId.trim());
  const isRealGotchi = player.usesRealGotchi === true && hasDynamicGotchiId;

  return {
    gotchiBonusMultiplier: isRealGotchi
      ? REAL_GOTCHI_FINAL_SCORE_MULTIPLIER
      : 1,
    isRealGotchi,
  };
}


interface IdleAutoHealResult {
  potionUsed: boolean;
  healAmount: number;
  potionTiersUsed: number[];
  runPotionsUsed: number;
  persistentPotionsUsed: number;
  persistentPotionConsumed: boolean;
}

function recordPotionUse(
  result: IdleAutoHealResult,
  options: {
    tier: number;
    healAmount: number;
    source: 'run' | 'persistent';
    persistentPotionConsumed?: boolean;
  }
): void {
  result.potionUsed = true;
  result.healAmount += options.healAmount;
  result.potionTiersUsed.push(options.tier);
  if (options.source === 'run') {
    result.runPotionsUsed += 1;
  } else {
    result.persistentPotionsUsed += 1;
    if (options.persistentPotionConsumed) {
      result.persistentPotionConsumed = true;
    }
  }
}

function formatPotionTierLabel(tiers: number[]): string {
  const uniqueTiers = Array.from(new Set(tiers)).sort((a, b) => a - b);
  if (uniqueTiers.length === 0) return '';
  return ` (T${uniqueTiers.join(' + T')})`;
}

function getPotionUseLabel(result: IdleAutoHealResult): {
  potionLabel: string;
  tierLabel: string;
} {
  const totalPotions = result.runPotionsUsed + result.persistentPotionsUsed;
  const potionLabel = totalPotions > 1 ? 'HP Potions' : 'HP Potion';
  const tierLabel = formatPotionTierLabel(result.potionTiersUsed);
  return { potionLabel, tierLabel };
}

function logIdleAutoHealFailure(
  room: GameRoom,
  player: PlayerSchema,
  reason: string,
  details: Record<string, unknown>
) {
  console.warn('[IdleMode] Auto-heal failed', {
    reason,
    playerId: player.id,
    sessionId: player.id,
    roomId: room.state.id,
    hp: player.hp,
    maxHp: player.maxHp,
    healthPotionCount: player.healthPotionCount,
    runHealthPotionsCollected: player.idleRoom.runHealthPotionsCollected,
    runHealthPotionsByTier: {
      tier1: player.idleRoom.runHealthPotionsCollectedTier1,
      tier2: player.idleRoom.runHealthPotionsCollectedTier2,
      tier3: player.idleRoom.runHealthPotionsCollectedTier3,
    },
    ...details,
  });
}

function consumeFallbackPotionFromCount(
  room: GameRoom,
  player: PlayerSchema,
  result: IdleAutoHealResult
): IdleAutoHealResult {
  if (player.healthPotionCount <= 0) return result;

  const selectedTier = 1;
  const healAmount = computeHealthPotionHeal(player.maxHp, selectedTier);
  player.hp = Math.min(player.maxHp, player.hp + healAmount);
  player.healthPotionCount = Math.max(0, player.healthPotionCount - 1);
  player.idleRoom.persistentHealthPotionsUsed += 1;
  player.idleRoom.persistentHealthPotionsUsedTier1 += 1;

  console.warn('[IdleMode] Auto-heal fallback used (inventory missing)', {
    playerId: player.id,
    remainingPotions: player.healthPotionCount,
  });

  recordPotionUse(result, {
    tier: selectedTier,
    healAmount,
    source: 'persistent',
    persistentPotionConsumed: false,
  });
  return result;
}

/**
 * Try to auto-heal an idle mode player who is at or below 0 HP.
 *
 * IMPORTANT: Consumes at most one potion per tier per damage instance.
 * Uses run-collected potions first for each tier (lost on death anyway),
 * then falls back to persistent inventory for missing tiers.
 * Continues through tiers even if HP is positive, stopping at max HP.
 *
 * @returns Object with potion usage details for logging purposes
 */
function tryIdleAutoHeal(
  room: GameRoom,
  player: PlayerSchema
): IdleAutoHealResult {
  const result = {
    potionUsed: false,
    healAmount: 0,
    potionTiersUsed: [],
    runPotionsUsed: 0,
    persistentPotionsUsed: 0,
    persistentPotionConsumed: false,
  };

  if (player.hp > 0) {
    return result;
  }

  console.warn('[IdleMode] Auto-heal attempt', {
    playerId: player.id,
    roomId: room.state.id,
    hp: player.hp,
    maxHp: player.maxHp,
    healthPotionCount: player.healthPotionCount,
    runHealthPotionsCollected: player.idleRoom.runHealthPotionsCollected,
  });

  const runPotions = player.idleRoom.runHealthPotionsCollected;
  const runPotionsByTier = {
    tier1: Number(player.idleRoom.runHealthPotionsCollectedTier1) || 0,
    tier2: Number(player.idleRoom.runHealthPotionsCollectedTier2) || 0,
    tier3: Number(player.idleRoom.runHealthPotionsCollectedTier3) || 0,
  };
  const runTierTotal =
    runPotionsByTier.tier1 +
    runPotionsByTier.tier2 +
    runPotionsByTier.tier3;
  if (runPotions > 0 && runTierTotal === 0) {
    const inferred = { tier1: 0, tier2: 0, tier3: 0 };
    player.idleRoom.lootsCollected.forEach((loot: any) => {
      const type = String(loot?.type ?? '').toLowerCase();
      if (type !== 'potion') return;
      const name = String(loot?.name ?? '').toLowerCase();
      if (!name.includes('health') && !name.includes('healing')) return;
      const qty = Number(loot?.quantity) || 0;
      if (qty <= 0) return;
      if (name.includes('ultra')) {
        inferred.tier3 += qty;
        return;
      }
      if (name.includes('greater')) {
        inferred.tier2 += qty;
        return;
      }
      inferred.tier1 += qty;
    });
    const inferredTotal =
      inferred.tier1 + inferred.tier2 + inferred.tier3;
    if (inferredTotal > 0) {
      runPotionsByTier.tier1 = inferred.tier1;
      runPotionsByTier.tier2 = inferred.tier2;
      runPotionsByTier.tier3 = inferred.tier3;
    } else {
      runPotionsByTier.tier1 = runPotions;
    }
  }

  const runAvailableByTier: Record<number, number> = {
    1: Math.max(0, runPotionsByTier.tier1),
    2: Math.max(0, runPotionsByTier.tier2),
    3: Math.max(0, runPotionsByTier.tier3),
  };

  const persistentPotions = player.healthPotionCount;
  const persistentAvailableByTier: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
  };
  const persistentPotionByTier: Record<number, any | null> = {
    1: null,
    2: null,
    3: null,
  };
  let fallbackAvailable = false;

  if (persistentPotions <= 0) {
    logIdleAutoHealFailure(room, player, 'no_persistent_potions', {
      inventorySize: (room as any).playerInventories.get(player.id)?.length ?? 0,
    });
  } else {
    const inventory = (room as any).playerInventories.get(player.id);
    if (!inventory || inventory.length === 0) {
      logIdleAutoHealFailure(room, player, 'missing_or_empty_inventory', {
        inventorySize: inventory?.length ?? 0,
      });
      fallbackAvailable = true;
    } else {
      const healthPotions = inventory.filter((item: any) => {
        if (!item) return false;
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return false;
        return isHealthPotionItem(item);
      });

      if (healthPotions.length === 0) {
        logIdleAutoHealFailure(room, player, 'no_health_potions_in_inventory', {
          inventorySize: inventory.length,
          inventoryTypes: Array.from(
            new Set(
              inventory.map((item: any) =>
                String(item?.type ?? item?.itemType ?? 'unknown').toLowerCase()
              )
            )
          ),
          inventoryNames: Array.from(
            new Set(
              inventory.map((item: any) =>
                String(item?.name ?? item?.itemType ?? 'unknown').toLowerCase()
              )
            )
          ).slice(0, 10),
        });
        fallbackAvailable = true;
      } else {
        for (const potion of healthPotions) {
          const tier = getHealthPotionTier(potion) ?? 1;
          const quantity = Number(potion.quantity) || 0;
          if (quantity <= 0) continue;
          persistentAvailableByTier[tier] =
            (persistentAvailableByTier[tier] || 0) + quantity;
          if (!persistentPotionByTier[tier]) {
            persistentPotionByTier[tier] = potion;
          }
        }
      }
    }
  }

  function consumeRunPotion(tier: number) {
    const healAmount = computeHealthPotionHeal(player.maxHp, tier);
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    player.idleRoom.runHealthPotionsCollected = Math.max(
      0,
      player.idleRoom.runHealthPotionsCollected - 1
    );
    player.idleRoom.runHealthPotionsUsed += 1;
    if (tier === 3) {
      player.idleRoom.runHealthPotionsCollectedTier3 -= 1;
      player.idleRoom.runHealthPotionsUsedTier3 += 1;
    } else if (tier === 2) {
      player.idleRoom.runHealthPotionsCollectedTier2 -= 1;
      player.idleRoom.runHealthPotionsUsedTier2 += 1;
    } else {
      player.idleRoom.runHealthPotionsCollectedTier1 -= 1;
      player.idleRoom.runHealthPotionsUsedTier1 += 1;
    }
    runAvailableByTier[tier] = Math.max(0, runAvailableByTier[tier] - 1);
    recordPotionUse(result, { tier, healAmount, source: 'run' });
  }

  function consumePersistentPotion(tier: number) {
    const potion = persistentPotionByTier[tier];
    if (!potion) return;
    const healAmount = computeHealthPotionHeal(player.maxHp, tier);
    player.hp = Math.min(player.maxHp, player.hp + healAmount);

    void room.applyInventoryDelta(player.id, potion, -1, {
      auditSource: `idle_auto_heal:tier_${tier}`,
    });
    player.healthPotionCount = Math.max(0, player.healthPotionCount - 1);
    player.idleRoom.persistentHealthPotionsUsed += 1;
    if (tier === 3) player.idleRoom.persistentHealthPotionsUsedTier3 += 1;
    else if (tier === 2)
      player.idleRoom.persistentHealthPotionsUsedTier2 += 1;
    else player.idleRoom.persistentHealthPotionsUsedTier1 += 1;

    recordPotionUse(result, {
      tier,
      healAmount,
      source: 'persistent',
      persistentPotionConsumed: true,
    });
  }

  const tiersToCheck = [1, 2, 3];
  for (const tier of tiersToCheck) {
    if (player.hp >= player.maxHp) break;
    if (runAvailableByTier[tier] > 0) {
      consumeRunPotion(tier);
      continue;
    }
    if (persistentAvailableByTier[tier] > 0) {
      consumePersistentPotion(tier);
      continue;
    }
    if (tier === 1 && fallbackAvailable) {
      consumeFallbackPotionFromCount(room, player, result);
      fallbackAvailable = false;
    }
  }

  return result;
}

/**
 * Apply HP regeneration after a player action in idle mode.
 * Uses the same hpRegen stat as the tick-based mode but scaled for turn-based play.
 * Poison blocks HP regeneration (matches PlayerRegenSystem behavior).
 */
function applyIdleHpRegen(
  player: PlayerSchema,
  derived: Record<string, any>
): void {
  if (player.hp <= 0 || player.hp >= player.maxHp) return;

  // Check if player is poisoned - poison blocks HP regeneration
  const isPoisoned = player.idleRoom?.playerPoisonTurnsRemaining > 0;
  if (isPoisoned) return;

  // Get hpRegen from equipment modifiers (same source as PlayerRegenSystem)
  const equipmentHpRegen = derived?.equipment?.modifiers?.hpRegen?.add || 0;
  const baseRegen = Math.max(0, Number(equipmentHpRegen) || 0);

  if (baseRegen <= 0) return;

  const regenAmount = Math.floor(baseRegen * IDLE_HP_REGEN_MULTIPLIER);
  if (regenAmount <= 0) return;

  const oldHp = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + regenAmount);
  const actualRegen = player.hp - oldHp;
  if (actualRegen > 0) {
    logAction(player, `💚 Regenerated ${actualRegen} HP.`);
  }
}

/**
 * Apply mana regeneration after a player action in idle mode.
 * Uses the same baseManaRegenPerSecond as the tick-based mode but scaled for turn-based play.
 */
function applyIdleManaRegen(player: PlayerSchema): void {
  if (player.hp <= 0) return;
  if (player.maxMana <= 0) return;
  if (player.mana >= player.maxMana) return;

  const rawBaseRegen = Number((player as any).baseManaRegenPerSecond);
  const baseRegenPerSecond = Number.isFinite(rawBaseRegen)
    ? Math.max(0, rawBaseRegen)
    : DEFAULT_MANA_REGEN_PER_SECOND;

  if (baseRegenPerSecond <= 0) return;

  const regenAmount = Math.floor(
    baseRegenPerSecond * IDLE_MANA_REGEN_MULTIPLIER
  );
  if (regenAmount <= 0) return;

  player.mana = Math.min(player.maxMana, player.mana + regenAmount);
}

export function processIdleTick(room: GameRoom, now: number) {
  const lastTick = room.lastIdleTick ?? 0;
  const speedRunMultiplier = Math.max(
    1,
    Math.floor(
      Array.from(room.state.players.values()).some(
        (player) =>
          player.idleRoom.speedRun &&
          (player.idleRoom.speedRunMultiplier || 1) > 1
      )
        ? Math.max(
            ...Array.from(room.state.players.values()).map((player) =>
              player.idleRoom.speedRun
                ? Math.max(1, Math.floor(player.idleRoom.speedRunMultiplier || 1))
                : 1
            )
          )
        : 1
    )
  );
  const tickIntervalMs = Math.max(50, Math.floor(1000 / speedRunMultiplier));

  if (now - lastTick < tickIntervalMs) return;
  room.lastIdleTick = now;

  for (const [sessionId, player] of room.state.players) {
    const encounter = player.idleRoom.encounter;
    const derived = JSON.parse(player.derivedStats || '{}');
    const playerSpeedMs = derived.attackSpeed || 1000; // Default to 1s delay
    // Convert ms delay to gauge increment: (1000ms / delay) * 100 points
    const playerSpeed = Math.round((1000 / Math.max(1, playerSpeedMs)) * 100);
    encounter.playerAttackSpeed = playerSpeed;

    // Reset action log for this tick while active.
    // Preserve terminal messages (death/victory) in state so the client
    // can read them even if a tick update was missed.
    if (player.idleRoom.runStatus === 'active') {
      encounter.lastActionLog = '';
    }

    // Auto-Next Room (if complete and auto-exploring)
    if (encounter.isCompleted && player.isAutoExploring) {
      void processNextRoom(room, player); // async, but we don't block the tick
      continue;
    }

    // Auto-Interact (Non-Combat)
    if (
      encounter.type !== 'combat' &&
      !encounter.isCompleted &&
      (player.isAutoExploring ||
        encounter.type === 'treasure' ||
        encounter.type === 'portal')
    ) {
      encounter.progressCurrent = encounter.progressMax;
      encounter.isCompleted = true;
      if (encounter.type === 'treasure') {
        encounter.lastActionLog = `You opened ${encounter.name}.`;
        rollTreasureReward(room, player);
      } else {
        encounter.lastActionLog = `You interacted with ${encounter.name}.`;
      }

      // Apply HP and mana regen when interacting with non-combat encounters
      applyIdleHpRegen(player, derived);
      applyIdleManaRegen(player);

      continue;
    }

    // Skip if combat over
    if (encounter.isCompleted) continue;

    if (encounter.type === 'combat') {
      // Combat logic with Action Gauges

      // Skip combat processing if player is dead
      if (player.idleRoom.runStatus !== 'active') continue;

      // Increment Gauges (every 1s tick)
      encounter.playerActionGauge += playerSpeed;
      for (const enemy of encounter.enemies) {
        if (!enemy.isDead) {
          const maxGaugeGain =
            enemy.classification === 'boss'
              ? MAX_BOSS_GAUGE_GAIN_PER_TICK
              : MAX_ENEMY_GAUGE_GAIN_PER_TICK;
          const gaugeGain = Math.min(
            enemy.attackSpeed,
            maxGaugeGain
          );
          enemy.actionGauge += gaugeGain;
        }
      }

      // --- POISON TICK: Process poison damage at start of each combat tick ---
      if (player.idleRoom.playerPoisonTurnsRemaining > 0 && player.hp > 0) {
        const poisonDamage = player.idleRoom.playerPoisonDamagePerTurn;
        // Apply leverage to poison damage (same as enemy attacks)
        const leverage = getIdleCombatLeverage(room, player);
        const adjustedPoisonDamage = Math.max(
          0,
          Math.round(poisonDamage * leverage)
        );

        player.hp = Math.max(0, player.hp - adjustedPoisonDamage);
        player.idleRoom.playerPoisonTurnsRemaining -= 1;

        if (player.idleRoom.playerPoisonTurnsRemaining > 0) {
          logAction(
            player,
            `☠️ Poison deals ${adjustedPoisonDamage} damage! (${player.idleRoom.playerPoisonTurnsRemaining} turn${player.idleRoom.playerPoisonTurnsRemaining > 1 ? 's' : ''} left)`
          );
        } else {
          logAction(
            player,
            `☠️ Poison deals ${adjustedPoisonDamage} damage! The poison wears off.`
          );
        }

        // Check for death by poison - but try to use potions first!
        // Per-tier limit: consume at most one potion per tier per damage instance
        if (player.hp <= 0) {
          const healResult = tryIdleAutoHeal(room, player);

          console.warn('[IdleMode] Auto-heal result (poison)', {
            playerId: player.id,
            roomId: room.state.id,
            hp: player.hp,
            potionUsed: healResult.potionUsed,
            healAmount: healResult.healAmount,
            potionTiersUsed: healResult.potionTiersUsed,
            runPotionsUsed: healResult.runPotionsUsed,
            persistentPotionsUsed: healResult.persistentPotionsUsed,
            persistentPotionConsumed: healResult.persistentPotionConsumed,
          });

          if (healResult.potionUsed) {
            const { potionLabel, tierLabel } = getPotionUseLabel(healResult);
          const outcomeLabel =
            player.hp > 0
              ? 'used to survive poison'
              : "wasn't enough to survive poison";
            logAction(
              player,
              `☠️ CRITICAL! ${potionLabel}${tierLabel} ${outcomeLabel}! Recovered ${healResult.healAmount} HP.`
            );
          }

          // After potion use attempt, check if still dead
          if (player.hp <= 0) {
            player.hp = 0; // Clamp to 0
            logIdlePotionDeathSnapshot(room, player);
            logAction(player, `You succumbed to poison. LOOT LOST!`);
            logIdlePotionSummary(player, 'defeat');
            // Loot is NOT removed here because it was never added to inventory.
            // Loot is only granted on successful run completion.
            player.idleRoom.lastKillingEnemyName = 'Poison';
            player.idleRoom.lastKillingEnemyHpRemaining = -1;
            player.idleRoom.lastKillingEnemyHpMax = -1;
            player.idleRoom.lastKillingEnemyDamage = adjustedPoisonDamage;
            player.idleRoom.lastKillingPlayerHpRemaining = player.hp;
            player.idleRoom.runStatus = 'dead';
            notifyIdlePlayerDeath(room, sessionId, 'poison');
            continue; // Skip rest of combat processing for this player
          }
        }
      }

      // Enable manual turn UI if player gauge ready
      if (encounter.playerActionGauge >= 100) {
        encounter.isPlayerTurn = true;
      } else {
        encounter.isPlayerTurn = false;
      }

      // --- NEW INTERLEAVED ACTION PROCESSING ---
      // Process up to 10 total actions per tick to prevent infinite loops
      let totalActionsInTick = 0;
      const maxActionsInTick = 10;
      const enemyActionsThisTick = new Map<string, number>();
      while (totalActionsInTick < maxActionsInTick && !encounter.isCompleted) {
        // Find who is ready to act (priority to highest gauge)
        const readyEnemies = encounter.enemies.filter(
          (e) =>
            !e.isDead &&
            e.actionGauge >= 100 &&
            (enemyActionsThisTick.get(e.id) ?? 0) < MAX_ENEMY_ACTIONS_PER_TICK
        );

        const playerReady = encounter.playerActionGauge >= 100;

        if (!playerReady && readyEnemies.length === 0) break;

        // Decide who goes next: whoever has the highest relative gauge
        let maxEnemyGauge = 0;
        let bestEnemy = null;
        for (const e of readyEnemies) {
          if (e.actionGauge > maxEnemyGauge) {
            maxEnemyGauge = e.actionGauge;
            bestEnemy = e;
          }
        }

        if (playerReady && encounter.playerActionGauge >= maxEnemyGauge) {
          if (!player.isAutoExploring) {
            // Manual mode: break and wait for client message
            break;
          }

          // --- PLAYER STUN CHECK: Skip turn if stunned ---
          if (encounter.playerStunTurnsRemaining > 0) {
            encounter.playerStunTurnsRemaining -= 1;
            // Deduct Gauge (player uses their turn being stunned)
            encounter.playerActionGauge = Math.max(
              0,
              encounter.playerActionGauge - 100
            );
            if (encounter.playerActionGauge < 100)
              encounter.isPlayerTurn = false;

            // Tick cooldowns even when stunned
            onPlayerTurnComplete(player);

            if (encounter.playerStunTurnsRemaining > 0) {
              logAction(
                player,
                `⚡ You are stunned! (${encounter.playerStunTurnsRemaining} turn${encounter.playerStunTurnsRemaining > 1 ? 's' : ''} left)`
              );
            } else {
              logAction(player, `You shake off the stun and recover!`);
            }
            totalActionsInTick++;
            continue;
          }

          // Player Acts (Auto)
          const grenadeSlug = getEquippedGrenadeSlug(player);
          const grenadeReady =
            player.idleRoom.grenadeCooldownRemaining <= 0 && grenadeSlug;

          // Check if this is a healing-only grenade and player is at full HP
          let shouldUseGrenade = grenadeReady;
          if (grenadeReady && grenadeSlug) {
            const grenadeDef = WEAPON_DEFINITIONS[grenadeSlug]?.grenade;
            const isHealingOnly =
              (grenadeDef?.healingSplash?.healAmount ?? 0) > 0 &&
              !(
                (grenadeDef?.damageCenter ?? 0) > 0 ||
                (grenadeDef?.damageEdge ?? 0) > 0
              );
            // Don't use healing grenade if at full HP - wait for when it's needed
            if (isHealingOnly && player.hp >= player.maxHp) {
              shouldUseGrenade = false;
            }
          }

          if (shouldUseGrenade) {
            processGrenade(room, sessionId, player);
          } else {
            processPlayerAttack(room, sessionId, player);
          }
          // Deduct Gauge
          encounter.playerActionGauge = Math.max(
            0,
            encounter.playerActionGauge - 100
          );
          if (encounter.playerActionGauge < 100) encounter.isPlayerTurn = false;

          // Tick cooldowns after player action
          onPlayerTurnComplete(player);

          // Apply HP and mana regen after player action
          applyIdleHpRegen(player, derived);
          applyIdleManaRegen(player);
        } else if (bestEnemy) {
          // Best Enemy Acts
          enemyActionsThisTick.set(
            bestEnemy.id,
            (enemyActionsThisTick.get(bestEnemy.id) ?? 0) + 1
          );
          processEnemyAttack(room, player, [bestEnemy]);
        } else {
          break;
        }

        totalActionsInTick++;
        if (player.hp <= 0) break;
      }
    }
  }
}

export async function processNextRoom(room: GameRoom, player: PlayerSchema) {
  if (player.idleRoom.runStatus !== 'active') return;
  if (player.idleRoom.isTransitioning) {
    if (player.idleRoom.encounter.isCompleted) {
      player.idleRoom.isTransitioning = false;
      return;
    }
    player.idleRoom.isTransitioning = false;
  }
  player.idleRoom.isTransitioning = true;

  try {
    // Note: Cooldowns are now decremented per turn via onPlayerTurnComplete()
    // instead of per room, so 1 turn = 1 second of cooldown

    // Check if boss was just killed - this triggers victory
    // Must verify: 1) encounter is completed, 2) boss exists, 3) boss is dead
    // 4) We're on the target floor (boss on non-target floors should not trigger victory)
    const encounter = player.idleRoom.encounter;
    const currentFloor = Math.ceil(player.idleRoom.depth / 10);
    const isTargetFloor = currentFloor === player.autoAscendFloor;
    const encounterHasBoss = encounter.enemies.some((e) => e.id === 'boss');
    const bossIsDead = encounter.enemies.some((e) => e.id === 'boss' && e.isDead);
    const justKilledBoss =
      encounter.isCompleted &&
      isTargetFloor &&
      bossIsDead;

    if (encounterHasBoss && encounter.isCompleted) {
      console.log('[processNextRoom] Boss encounter completed', {
        sessionId: player.id,
        currentFloor,
        targetFloor: player.autoAscendFloor,
        isTargetFloor,
        bossIsDead,
        willTriggerVictory: justKilledBoss,
        depth: player.idleRoom.depth,
      });
    }

  if (justKilledBoss) {
    room.bossKilled = true;

    // Update floorReached for idle runs so run score calculation is correct
    const idleFloor = Math.ceil(player.idleRoom.depth / 10);
    if (idleFloor > 0) {
      room.markFloorReached(idleFloor);
    }

    // VICTORY: Boss killed = run complete
    player.idleRoom.runStatus = 'victory';
    logAction(player, 'You defeated the boss! Victory!');

    logIdlePotionSummary(player, 'victory');

    const playerId = room.getPlayerIdForSession(player.id);
    const victoryNowMs = Date.now();
    const capturedTimeMultiplier = calculateTimeMultiplier({ nowMs: victoryNowMs });
    // Capture once at victory and persist this exact value for settlement.
    player.idleRoom.competitionMultiplier = capturedTimeMultiplier;

    // Competition Victory Chest (server authoritative)
    // Only available for competition runs, and only unlocks when the player has >= 1 USDC/GHO staked.
    // If not staked, show a teaser chest UI (client-side) but do not allow opening.
    const victoryGameId = String((room as any).currentGameId ?? '');
    if (player.dailyQuestActive && victoryGameId) {
      let canOpenChest = false;
      try {
        if (playerId) {
          const stakedBalances = await depositsRepo.getStakedUnlockBalances(
            playerId
          );
          canOpenChest = Number(stakedBalances?.total || 0) >= 1;
        }
      } catch (error) {
        console.error('[IdleMode Victory] Failed to fetch staked balances for chest gate', {
          playerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      player.idleRoom.victoryChestStatus = canOpenChest ? 'available' : 'teaser';
      // Keep the game id even in teaser mode so the chest can be unlocked post-stake.
      player.idleRoom.victoryChestGameId = victoryGameId;
      player.idleRoom.victoryChestRewardJson = '';
    } else {
      player.idleRoom.victoryChestStatus = 'none';
      player.idleRoom.victoryChestGameId = '';
      player.idleRoom.victoryChestRewardJson = '';
    }

    await room.settleEquippedWearableDurability(player.id, 'victory');

    // Competition score handling at victory:
    // - Trading settlement mode: create unsettled trade run and defer leaderboard write.
    // - Legacy mode: immediate leaderboard submission.
    if (playerId && room.bossKilled && player.dailyQuestActive) {
      const submitLegacyLeaderboardScore = async () => {
        console.log(
          '[IdleMode Victory] Submitting final score to competition leaderboard',
          {
            playerId,
            sessionId: player.id,
            rawScore: player.score,
            competitionMultiplier: capturedTimeMultiplier,
          }
        );

        const result = await submitToCompetitionLeaderboard(
          room,
          playerId,
          player.id,
          player.score
        );

        if (result.submitted) {
          console.log('[IdleMode Victory] Competition submission completed', {
            playerId,
            tier: result.tier,
            rawScore: player.score,
            finalScore: result.finalScore,
            timeMultiplier: result.timeMultiplier,
            gotchiBonusMultiplier: result.gotchiBonusMultiplier ?? 1,
            isRealGotchi: result.isRealGotchi === true,
            rank: result.rank,
          });

          const client = room.getClientBySessionId(player.id);
          if (client) {
            room.msg.sendTo(client, 'daily_quest:leaderboard_update', {
              tier: result.tier ?? '',
              rawScore: player.score,
              finalScore: result.finalScore,
              timeMultiplier: result.timeMultiplier,
              gotchiBonusMultiplier: result.gotchiBonusMultiplier ?? 1,
              isRealGotchi: result.isRealGotchi === true,
              rank: result.rank,
            });
          }
        } else if (result.error) {
          console.log('[IdleMode Victory] Competition submission skipped', {
            playerId,
            reason: result.error,
          });
        }
      };

      if (isTradingSettlementCompetitionRun(player)) {
        const tier = getCompetitionTier(room.state.difficultyTier);
        const runId = String((room as any).currentGameId ?? '');
        if (!tier || !runId) {
          console.warn(
            '[IdleMode Victory] Trading settlement prerequisites missing; falling back to legacy submit',
            {
              playerId,
              tier,
              runId,
            }
          );
          await submitLegacyLeaderboardScore();
        } else {
          try {
            const competitionDate = getCompetitionDate({ nowMs: victoryNowMs });
            const baseScore = Math.max(0, Math.floor(player.score));
            const token = normalizeTradeToken(player.tradeToken, 'BTC');
            const direction = normalizeTradeDirection(
              player.tradeDirection,
              'long'
            );
            const riskLeverage = normalizeTradeLeverage(player.tradeLeverage, 1);
            const { gotchiBonusMultiplier, isRealGotchi } =
              resolveTradeRunGotchiBonus(player);
            const entryQuote = await sampleTwapUsd(token, 60_000, victoryNowMs);
            const closeAtIso = getTradeCloseAtIso(victoryNowMs);

            await competitionTradeRunsRepo.createUnsettledTradeRun({
              competitionDate,
              difficultyId: tier,
              accountId: playerId,
              runId,
              baseScore,
              timeMultiplier: capturedTimeMultiplier,
              token,
              direction,
              riskLeverage,
              entryPriceUsd: entryQuote.priceUsd,
              entrySampledAt: new Date(entryQuote.sampledAtMs).toISOString(),
              closeAt: closeAtIso,
              oracleMeta: {
                ...entryQuote.oracleMeta,
                kind: 'entry_twap_60s',
                stale: entryQuote.stale,
                gotchiBonusMultiplier,
                isRealGotchi,
              },
            });

            console.log('[IdleMode Victory] Trade run captured as unsettled', {
              playerId,
              tier,
              runId,
              competitionDate,
              baseScore,
              timeMultiplier: capturedTimeMultiplier,
              token,
              direction,
              riskLeverage,
              entryPriceUsd: entryQuote.priceUsd,
            });

            const client = room.getClientBySessionId(player.id);
            if (client) {
              const estimatedTradeMultiplier = 1;
              const estimatedFinalScore = Math.round(
                baseScore *
                  capturedTimeMultiplier *
                  estimatedTradeMultiplier *
                  gotchiBonusMultiplier
              );
              room.msg.sendTo(client, 'daily_quest:leaderboard_update', {
                tier,
                rawScore: baseScore,
                finalScore: estimatedFinalScore,
                timeMultiplier: capturedTimeMultiplier,
                gotchiBonusMultiplier,
                isRealGotchi,
                rank: null,
                status: 'unsettled',
                runId,
                token,
                direction,
                riskLeverage,
                tradeMultiplier: estimatedTradeMultiplier,
                estimatedTradeMultiplier,
                estimatedFinalScore,
                entryPriceUsd: entryQuote.priceUsd,
                livePriceUsd: entryQuote.priceUsd,
                priceStale: entryQuote.stale,
                closesAtUtc: closeAtIso,
              });
            }
          } catch (error) {
            console.error(
              '[IdleMode Victory] Failed to create unsettled trade run; falling back to legacy submit',
              {
                playerId,
                error: error instanceof Error ? error.message : String(error),
              }
            );
            await submitLegacyLeaderboardScore();
          }
        }
      } else {
        await submitLegacyLeaderboardScore();
      }
    }

    // Grant all collected loot to inventory on victory
    // BATCH UPDATE: Apply all deltas to a local copy, then persist once
    // This avoids race conditions from parallel applyInventoryDelta calls
    // @ts-ignore - access private property
    const currentInventory: InventoryItemPayload[] = [
      ...((room as any).playerInventories.get(player.id) || []),
    ];

    // Build a map of items to add (keyed by type::name for non-wearables)
    const deltaMap = new Map<
      string,
      { item: InventoryItemPayload; delta: number }
    >();
    const wearablesToAdd: InventoryItemPayload[] = [];
    const rewardConfig = getModeRewardConfig(player);

    // Process non-potion loot from lootsCollected
    for (const loot of player.idleRoom.lootsCollected) {
      if (!loot) continue;

      const itemType = String(loot.type || '').toLowerCase();
      const itemName = String(loot.name || '').toLowerCase();
      const isPotion = itemType === 'potion';
      if (isPotion) continue; // Potions handled separately below

      const isWearable = itemType === 'wearable';
      const isGold = itemType === 'coin' && (itemName === 'gold' || itemName === 'gold coin');
      const isLickTongue = itemType === 'material' && itemName.includes('lick tongue');

      // Filter based on mode reward configuration
      if (isWearable && !rewardConfig.earnWearables) {
        continue; // Skip wearables if not allowed
      }
      if (isGold && !rewardConfig.earnGold) {
        continue; // Skip gold if not allowed
      }
      if (isLickTongue && !rewardConfig.earnLickTongue) {
        continue; // Skip lick tongue if not allowed
      }
      // Skip other materials/items that aren't gold or lick tongue (not in reward config)
      if (!isWearable && !isGold && !isLickTongue) {
        continue; // Only persist configured reward types
      }

      if (isWearable) {
        // Wearables are individual items, add directly
        wearablesToAdd.push({
          type: loot.type,
          itemType: loot.type,
          name: loot.name,
          quantity: 1,
          wearableSlug: loot.wearableSlug,
          quality: loot.quality,
          durabilityScore:
            typeof loot.durabilityScore === 'number'
              ? loot.durabilityScore
              : undefined,
          rarity: loot.rarity,
          color: loot.color,
        } as any);
      } else {
        // Non-wearables: accumulate by key
        // Use lowercased values for the key to group items correctly
        const key = `${itemType}::${itemName}`;
        const existing = deltaMap.get(key);
        if (existing) {
          existing.delta += loot.quantity;
        } else {
          // Use original casing for name when storing in item object
          // This ensures database persistence uses correct case (e.g., "Gold" not "gold")
          deltaMap.set(key, {
            item: {
              type: loot.type,
              itemType: loot.type,
              name: loot.name, // Use original casing from loot object
              quantity: loot.quantity,
              wearableSlug: loot.wearableSlug,
              quality: loot.quality,
              rarity: loot.rarity,
              color: loot.color,
            } as any,
            delta: loot.quantity,
          });
        }
      }
    }

    // Add remaining run-collected potions (only if allowed by mode config)
    const runTierCounts = {
      tier1: player.idleRoom.runHealthPotionsCollectedTier1,
      tier2: player.idleRoom.runHealthPotionsCollectedTier2,
      tier3: player.idleRoom.runHealthPotionsCollectedTier3,
    };
    if (
      rewardConfig.earnPotions &&
      (runTierCounts.tier1 > 0 ||
      runTierCounts.tier2 > 0 ||
      runTierCounts.tier3 > 0)
    ) {
      console.warn('[IdleMode Victory] Granting run potions', {
        playerId,
        roomId: room.state.id,
        runTierCounts,
        runHealthPotionsCollected: player.idleRoom.runHealthPotionsCollected,
        runManaPotionsCollected: player.idleRoom.runManaPotionsCollected,
      });
      const tierConfig = [
        { tier: 1, itemType: 'health_potion', name: 'Health Potion' },
        {
          tier: 2,
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
        },
        {
          tier: 3,
          itemType: 'ultra_health_potion',
          name: 'Ultra Healing Potion',
        },
      ];
      for (const config of tierConfig) {
        const qty =
          config.tier === 3
            ? runTierCounts.tier3
            : config.tier === 2
              ? runTierCounts.tier2
              : runTierCounts.tier1;
        if (qty <= 0) continue;
        const key = `potion::${config.name.toLowerCase()}`;
        const existing = deltaMap.get(key);
        if (existing) {
          existing.delta += qty;
        } else {
          deltaMap.set(key, {
            item: {
              type: 'potion',
              itemType: config.itemType,
              name: config.name,
              quantity: qty,
              potionTier: config.tier,
            } as any,
            delta: qty,
          });
        }
      }
    }

    if (rewardConfig.earnPotions && player.idleRoom.runManaPotionsCollected > 0) {
      const key = 'potion::mana potion';
      const existing = deltaMap.get(key);
      if (existing) {
        existing.delta += player.idleRoom.runManaPotionsCollected;
      } else {
        deltaMap.set(key, {
          item: {
            type: 'potion',
            itemType: 'potion',
            name: 'Mana Potion',
            quantity: player.idleRoom.runManaPotionsCollected,
          } as any,
          delta: player.idleRoom.runManaPotionsCollected,
        });
      }
    }

    // Apply deltas to inventory copy
    const updatedInventory = [...currentInventory];

    // Add wearables (each is unique)
    for (const wearable of wearablesToAdd) {
      updatedInventory.push(wearable);
    }

    // Apply non-wearable deltas
    for (const [key, { item, delta }] of deltaMap) {
      const itemType = String(item.type || '').toLowerCase();
      const itemName = String(item.name || '').toLowerCase();

      // Find existing item by key
      const existingIndex = updatedInventory.findIndex((inv) => {
        const invType = String(inv.type ?? inv.itemType ?? '').toLowerCase();
        const invName = String(inv.name ?? '').toLowerCase();
        return `${invType}::${invName}` === key;
      });

      if (existingIndex >= 0) {
        // Update existing quantity
        const current = Number(updatedInventory[existingIndex].quantity) || 0;
        updatedInventory[existingIndex] = {
          ...updatedInventory[existingIndex],
          quantity: current + delta,
        };
      } else {
        // Add new item
        updatedInventory.push({
          ...item,
          quantity: delta,
        });
      }
    }

    const previousInventory =
      // @ts-ignore - access private property
      (room as any).playerInventories.get(player.id) ?? [];

    // Persist the updated inventory
    // @ts-ignore - access private property
    room.playerInventories.set(player.id, updatedInventory);

    // Update player potion counts
    player.healthPotionCount = getHealthPotionCount(updatedInventory);
    player.manaPotionCount = getManaPotionCount(updatedInventory);
    player.lickTongueCount = getLickTongueCount(updatedInventory);

    try {
      const deltaInput = buildFungibleDeltaInput(
        previousInventory,
        updatedInventory
      );
      await persistInventory(room as any, player.id, deltaInput);
      if (wearablesToAdd.length > 0) {
        const wearableInputs = wearablesToAdd.flatMap((wearable) => {
          if (!wearable.wearableSlug) {
            return [];
          }
          const wearableQuality =
            typeof wearable.quality === 'string' ? wearable.quality : 'average';
          return [
            {
              wearableSlug: wearable.wearableSlug,
              quality: wearableQuality,
              qualityScore:
                typeof wearable.qualityScore === 'number'
                  ? wearable.qualityScore
                  : null,
              durabilityScore:
                typeof wearable.durabilityScore === 'number'
                  ? wearable.durabilityScore
                  : undefined,
              itemData: {
                ...wearable,
                quantity: 1,
              },
            },
          ];
        });
        if (playerId && wearableInputs.length > 0) {
          await inventoryRepo.createInventoryInstances({
            playerId,
            items: wearableInputs,
          });
        }
      }
      console.log('[IdleMode Victory] Loot granted to inventory', {
        playerId,
        itemCount: wearablesToAdd.length + deltaMap.size,
        remainingHpPotions: player.idleRoom.runHealthPotionsCollected,
        remainingMpPotions: player.idleRoom.runManaPotionsCollected,
        newHealthPotionCount: player.healthPotionCount,
        newManaPotionCount: player.manaPotionCount,
      });
    } catch (err) {
      console.error('[IdleMode Victory] Failed to persist inventory', {
        playerId,
        error: err,
      });
    }

    // IMPORTANT:
    // Do NOT immediately disconnect on victory when a Victory Chest is available.
    // The chest open request is a Colyseus message and requires the socket alive.
    const client = room.getClientBySessionId(player.id);
    const shouldKeepSocketForVictoryChest =
      player.dailyQuestActive === true &&
      (player.idleRoom.victoryChestStatus === 'available' ||
        player.idleRoom.victoryChestStatus === 'teaser');

    if (client && !shouldKeepSocketForVictoryChest) {
      // Delay leave slightly to ensure the 'victory' state patch reaches the client
      // before the connection is closed.
      setTimeout(() => {
        try {
          client.leave();
        } catch {
          // ignore
        }
      }, 250);
    }

    return;
  }

    // Not a boss kill - proceed to next room
    // Update Elite spawned flag based on previous room
    if (
      player.idleRoom.encounter.enemies.some((e) => e.classification === 'elite')
    ) {
      player.idleRoom.eliteSpawnedThisFloor = true;
    }

  // Calculate next depth (always descending deeper)
  let nextDepth = player.idleRoom.depth + 1;

  // Portal: Jump to start of next floor (unless it's the target floor where boss awaits)
  if (player.idleRoom.encounter.type === 'portal') {
    const currentFloor = Math.ceil(player.idleRoom.depth / 10);
    if (currentFloor !== player.autoAscendFloor) {
      nextDepth = currentFloor * 10 + 1;
    }
  }

  // Reset elite spawned flag if we just entered a NEW floor
  const oldFloor = Math.ceil(player.idleRoom.depth / 10);
  const nextFloor = Math.ceil(nextDepth / 10);
  const roomInFloor = nextDepth % 10 || 10;
  if (nextFloor !== oldFloor) {
    player.idleRoom.eliteSpawnedThisFloor = false;
  }

  // Difficulty scaling: Total rooms visited increments difficulty every 10 rooms
  player.idleRoom.roomsVisited += 1;
  player.idleRoom.difficultyFloor = Math.ceil(
    player.idleRoom.roomsVisited / 10
  );

  player.idleRoom.depth = nextDepth;
  if (nextDepth > player.idleRoom.maxDepthReached) {
    const previousMax = player.idleRoom.maxDepthReached;
    player.idleRoom.maxDepthReached = nextDepth;
    const newFloorReached = Math.ceil(nextDepth / 10);
    const previousFloor = Math.ceil(previousMax / 10);
    if (newFloorReached > previousFloor) {
      console.log('[processNextRoom] Player reached new max depth', {
        sessionId: player.id,
        previousMax,
        newMax: nextDepth,
        previousFloor,
        newFloor: newFloorReached,
      });
    }
  }
  player.idleRoom.encounter = EncounterManager.generateEncounter(
    nextDepth,
    room.state.difficultyTier,
    player.idleRoom.difficultyFloor,
    player.autoAscendFloor,
    player.idleRoom.eliteSpawnedThisFloor
  );

  // CRITICAL: Verify boss only appears on target floor, room 10
  const hasBoss = player.idleRoom.encounter.enemies.some((e) => e.id === 'boss');
  if (hasBoss) {
    const isTargetFloor = nextFloor === player.autoAscendFloor;
    const isRoom10 = roomInFloor === 10;
    if (!isTargetFloor || !isRoom10) {
      console.error('[processNextRoom] ERROR: Boss spawned on wrong floor/room!', {
        sessionId: player.id,
        depth: nextDepth,
        floor: nextFloor,
        targetFloor: player.autoAscendFloor,
        roomInFloor,
        isTargetFloor,
        isRoom10,
      });
    }
  }

  // Log when entering a new floor or when generating boss encounters
  if (nextFloor !== oldFloor || hasBoss) {
    console.log('[processNextRoom] Generated encounter', {
      sessionId: player.id,
      depth: nextDepth,
      floor: nextFloor,
      targetFloor: player.autoAscendFloor,
      encounterType: player.idleRoom.encounter.type,
      hasBoss,
      roomInFloor,
      isTargetFloor: nextFloor === player.autoAscendFloor,
    });
  }

  // Check if we just generated an Elite encounter and set the flag
  if (
    player.idleRoom.encounter.enemies.some((e) => e.classification === 'elite')
  ) {
    player.idleRoom.eliteSpawnedThisFloor = true;
  }

  player.idleRoom.roomId = `floor_${Math.ceil(nextDepth / 10)}_room_${
    nextDepth % 10 || 10
  }`;

    // Initialize player attack range
    const derived = JSON.parse(player.derivedStats || '{}');
    const playerSpeedMs = derived.attackSpeed || 1000;
    player.idleRoom.encounter.playerAttackSpeed = Math.round(
      (1000 / Math.max(1, playerSpeedMs)) * 100
    );
    player.idleRoom.encounter.playerAttackRange =
      derived.weaponType === 'ranged'
        ? derived.rangedAttackRange || 200
        : derived.meleeAttackRange || 32;

    player.idleRoom.encounter.isPlayerTurn = true;
    const firstEnemy = player.idleRoom.encounter.enemies[0];
    const iconPrefix = firstEnemy ? `::enemy:${firstEnemy.imageId}:: ` : '';
    player.idleRoom.encounter.lastActionLog = `${iconPrefix}You enter Room ${nextDepth}.`;

    // Apply HP and mana regen when entering a new room
    applyIdleHpRegen(player, derived);
    applyIdleManaRegen(player);
  } finally {
    player.idleRoom.isTransitioning = false;
  }
}

export function endPlayerTurn(player: PlayerSchema) {
  player.idleRoom.encounter.isPlayerTurn = false;
}

/**
 * Called after each player turn to decrement cooldowns.
 * 1 turn = 1 second of cooldown for grenades and spells.
 */
export function onPlayerTurnComplete(player: PlayerSchema) {
  // Decrement grenade cooldown
  if (player.idleRoom.grenadeCooldownRemaining > 0) {
    player.idleRoom.grenadeCooldownRemaining -= 1;
  }

  // Decrement spell cooldowns
  const expiredSpells: string[] = [];
  for (const [spellId, cooldown] of player.idleRoom.spellCooldowns) {
    if (cooldown > 1) {
      player.idleRoom.spellCooldowns.set(spellId, cooldown - 1);
    } else {
      // Will be 0 after decrement, mark for deletion
      expiredSpells.push(spellId);
    }
  }
  for (const spellId of expiredSpells) {
    player.idleRoom.spellCooldowns.delete(spellId);
  }
}

export function getEquippedGrenadeSlug(player: PlayerSchema): string | null {
  try {
    const rawWearables: unknown[] = JSON.parse(
      player.equippedWearables || '[]'
    );
    for (const raw of rawWearables) {
      const parsed = deserializeStoredWearable(raw);
      if (parsed) {
        const weaponDef = WEAPON_DEFINITIONS[parsed.slug];
        if (weaponDef?.weaponType === 'grenades') {
          return parsed.slug;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function processGrenade(
  room: GameRoom,
  sessionId: string,
  player: PlayerSchema
) {
  const grenadeSlug = getEquippedGrenadeSlug(player);
  if (!grenadeSlug) return;

  const encounter = player.idleRoom.encounter;
  const derived = JSON.parse(player.derivedStats || '{}');

  // Get grenade definition to check if it's a healing or damage grenade
  let grenadeDef: any = null;
  try {
    grenadeDef = WEAPON_DEFINITIONS[grenadeSlug]?.grenade;
  } catch {
    // Ignore - will use default behavior
  }

  // Check if this is a pure healing grenade (has healing splash, no damage)
  const hasHealingSplash = grenadeDef?.healingSplash?.healAmount > 0;
  const hasDamage =
    (grenadeDef?.damageCenter ?? 0) > 0 || (grenadeDef?.damageEdge ?? 0) > 0;
  const isHealingOnly = hasHealingSplash && !hasDamage;

  // Apply damage only if the grenade deals damage
  if (!isHealingOnly) {
    const baseDamage = computeBaseDamageForCharacter(
      player.characterId,
      20,
      derived
    );

    // Apply Critical Strike to Grenade
    const { damage: finalGrenadeDamage, isCrit } = computePlayerDamageWithCrit(
      player,
      baseDamage,
      'grenades' as any,
      grenadeSlug,
      derived
    );

    const aoeMultiplier = 1.5;
    const damageToApply = Math.round(finalGrenadeDamage * aoeMultiplier);

    let hits = 0;
    for (const enemy of encounter.enemies) {
      if (!enemy.isDead) {
        enemy.hp = Math.max(0, enemy.hp - damageToApply);
        if (enemy.hp <= 0) {
          enemy.isDead = true;
          const leverage = getIdleRewardLeverage(room, player);
          const scoreAmount = Math.round(enemy.xpReward * leverage);
          player.score += scoreAmount;
          // Sync score to leaderboard system
          queueScoreDelta(room, sessionId, scoreAmount);

          // Award permanent XP (multiplied by leverage if enabled)
          const xpMultiplierEnabled =
            (GAME_CONFIG as any).leverage?.xpMultiplierEnabled ?? true;
          const xpAmount = xpMultiplierEnabled
            ? Math.round(enemy.xpReward * leverage)
            : enemy.xpReward;
          room.awardXpToPlayer(sessionId, xpAmount, {
            enemyId: enemy.id,
            enemyType: enemy.imageId,
            attackType: 'grenades',
            classification: enemy.classification,
          });

          // Track kill count (idle-specific tracking for summary display)
          const killKey = `${enemy.imageId}|${enemy.name}`;
          const currentCount = player.idleRoom.killCount.get(killKey) || 0;
          player.idleRoom.killCount.set(killKey, currentCount + 1);
          recordIdleKill(room, sessionId);

          // Roll for loot
          rollLootForEnemy(room, player, enemy);
        }
        hits++;
      }
    }

    let logMsg = isCrit ? `CRITICAL STRIKE! ` : `BOOM! `;
    logMsg += `Grenade deals ${damageToApply} damage to ${hits} enemies!`;
    logAction(player, logMsg);
  }

  // Apply Stun from grenade abilities (e.g., coconut, basketball)
  const stunSources = getPlayerStun(
    player.characterId,
    'grenades',
    grenadeSlug,
    derived
  );
  if (stunSources.length > 0) {
    for (const enemy of encounter.enemies) {
      if (enemy.isDead) continue;
      for (const stun of stunSources) {
        // Roll for stun chance
        if (stun.chance < 1 && Math.random() >= stun.chance) continue;
        // Convert ms duration to turns (1 turn ≈ 1 second of idle action)
        const stunTurns = Math.ceil(stun.durationMs / 1000);
        // Apply stun (refresh if already stunned with longer duration)
        if (stunTurns > enemy.stunTurnsRemaining) {
          enemy.stunTurnsRemaining = stunTurns;
          logAction(
            player,
            `⚡ STUNNED! ::enemy:${enemy.imageId}:: ${enemy.name} is stunned for ${stunTurns} turn${stunTurns > 1 ? 's' : ''}!`
          );
          break; // Successfully applied stun, stop trying other sources
        }
        // If stun wasn't applied (target already more stunned), try next source
      }
    }
  }

  // Apply Healing Splash (e.g., milkshake) - heals the player
  if (hasHealingSplash) {
    const healAmount = Math.max(
      0,
      Math.round(grenadeDef.healingSplash.healAmount)
    );
    // Get wearable info for the log message
    const wearable = getWearableBySlug(grenadeSlug);
    const itemName = wearable?.name || grenadeSlug;
    const svgId = wearable?.svgId || '';
    const iconMarker = svgId ? `::wearable:${svgId}:: ` : '';

    if (healAmount > 0 && player.hp > 0 && player.hp < player.maxHp) {
      const oldHp = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);
      const actualHeal = player.hp - oldHp;
      if (actualHeal > 0) {
        logAction(
          player,
          `${iconMarker}${itemName} healed for ${actualHeal} HP!`
        );
      }
    }
    // Note: Healing-only grenades skip usage at full HP (checked in combat loop)
  }

  // 1 encounter = 1 second of cooldown
  // Map existing weapon definitions to encounter-based cooldown
  let cooldownEncounters = 3; // default
  if (grenadeDef && typeof grenadeDef.cooldownMs === 'number') {
    cooldownEncounters = Math.ceil(grenadeDef.cooldownMs / 1000);
  }

  player.idleRoom.grenadeCooldownRemaining = cooldownEncounters;

  updateEncounterProgress(room, player);
}

export function rollTreasureReward(room: GameRoom, player: PlayerSchema) {
  const random = Math.random();
  const itemType = random < 0.5 ? 'health_potion' : 'mana_potion';
  const drop = generateItemData(itemType) as DroppedItemData;

  // Treasure chests are extra rewarding: 1-5 potions
  drop.quantity = Math.floor(Math.random() * 5) + 1;

  addLootToEncounter(room, player, drop);
}

export function rollLootForEnemy(
  room: GameRoom,
  player: PlayerSchema,
  enemy: any
) {
  const rewardConfig = getModeRewardConfig(player);
  const derived = JSON.parse(player.derivedStats || '{}');
  const abilities = Array.isArray(derived?.abilities) ? derived.abilities : undefined;
  const enemyTags = Array.isArray(enemy?.tags) ? enemy.tags : undefined;
  const potionFarm = aggregatePotionFarm(abilities);
  const goldFarm = aggregateGoldFarm(abilities);
  const tongueFarm = aggregateTongueFarm(abilities, enemyTags);
  const context: EnemyDropContext = {
    enemyType: enemy.imageId,
    classification: enemy.classification as any,
    difficultyTierId: room.state.difficultyTier,
    dailyQuestActive: player.dailyQuestActive,
    // Pass reward config to control boss drops
    earnLickTongue: rewardConfig.earnLickTongue,
    killStreakPotionCoinFindBonus:
      typeof (player as any).killStreakPotionCoinFindBonus === 'number'
        ? (player as any).killStreakPotionCoinFindBonus
        : 0,
    potionFarm,
    goldFarm,
  };

  if (rewardConfig.earnLickTongue) {
    const shouldDropTongue = maybeRollLickTongueDrop(
      enemyTags,
      () => tongueFarm
    );
    if (shouldDropTongue) {
      const lickTongueItem = generateItemData('lick_tongue') as DroppedItemData;
      addLootToEncounter(room, player, lickTongueItem);
    }
  }

  if (enemy.classification === 'boss') {
    const drops = rollBossDrops(context);
    // Filter drops based on mode reward configuration
    for (const drop of drops) {
      const itemType = String(drop.type || '').toLowerCase();
      const itemName = String(drop.name || '').toLowerCase();
      const isWearable = itemType === 'wearable';
      const isGold = itemType === 'coin' && (itemName === 'gold' || itemName === 'gold coin');
      const isLickTongue = itemType === 'material' && itemName.includes('lick tongue');

      // Filter based on reward config
      if (isWearable && !rewardConfig.earnWearables) {
        continue; // Skip wearables if not allowed
      }
      if (isGold && !rewardConfig.earnGold) {
        continue; // Skip gold if not allowed
      }
      if (isLickTongue && !rewardConfig.earnLickTongue) {
        continue; // Skip lick tongue if not allowed
      }

      addLootToEncounter(room, player, drop);
    }
  } else {
    const drop = rollEnemyDrop(context);
    if (drop) {
      // Filter regular enemy drops too
      const itemType = String(drop.type || '').toLowerCase();
      const itemName = String(drop.name || '').toLowerCase();
      const isWearable = itemType === 'wearable';
      const isGold = itemType === 'coin' && (itemName === 'gold' || itemName === 'gold coin');
      const isLickTongue = itemType === 'material' && itemName.includes('lick tongue');

      if (isWearable && !rewardConfig.earnWearables) {
        return; // Skip if not allowed
      }
      if (isGold && !rewardConfig.earnGold) {
        return; // Skip if not allowed
      }
      if (isLickTongue && !rewardConfig.earnLickTongue) {
        return; // Skip if not allowed
      }

      addLootToEncounter(room, player, drop);
    }
  }
}

export function addLootToEncounter(
  room: GameRoom,
  player: PlayerSchema,
  drop: DroppedItemData
) {
  const loot = new IdleLootSchema();
  loot.type = drop.type;
  loot.name = drop.name;
  loot.quantity = drop.quantity;
  loot.rarity = drop.rarity || '';
  loot.color = drop.color || '';
  // Always use drop.wearableSlug for consistency with inventory storage
  // Using drop.wearableId would cause mismatch when removing on death
  loot.wearableSlug =
    drop.type === 'wearable' || drop.type === 'weapon'
      ? String(drop.wearableSlug || '')
      : drop.wearableSlug || '';
  loot.quality = drop.quality || '';
  loot.durabilityScore =
    typeof drop.durabilityScore === 'number'
      ? Math.max(0, Math.floor(drop.durabilityScore))
      : 0;
  player.idleRoom.encounter.loots.push(loot);

  const qtyPrefix = drop.quantity > 1 ? `${drop.quantity}x ` : '';
  player.idleRoom.encounter.lastActionLog += ` Found ${qtyPrefix}${drop.name}!`;

  // POTIONS: Immediately credit to run counters for instant use during the run.
  // These are lost on death but can be used immediately.
  // If player wins, remaining run potions are granted to inventory.
  const itemType = String(drop.type || '').toLowerCase();
  const itemName = String(drop.name || '').toLowerCase();
  const isHealthPotion =
    itemType === 'potion' &&
    (itemName.includes('health') || itemName.includes('healing'));
  const isManaPotion = itemType === 'potion' && itemName.includes('mana');

  if (isHealthPotion) {
    const tier =
      Number((drop as any).potionTier) ||
      (itemName.includes('ultra') ? 3 : itemName.includes('greater') ? 2 : 1);
    player.idleRoom.runHealthPotionsCollected += drop.quantity;
    if (tier === 3) {
      player.idleRoom.runHealthPotionsCollectedTier3 += drop.quantity;
    } else if (tier === 2) {
      player.idleRoom.runHealthPotionsCollectedTier2 += drop.quantity;
    } else {
      player.idleRoom.runHealthPotionsCollectedTier1 += drop.quantity;
    }
    // Track in lootsCollected for summary display
    const collected = new IdleLootSchema();
    collected.type = drop.type;
    collected.name = drop.name;
    collected.quantity = drop.quantity;
    collected.rarity = drop.rarity || '';
    collected.color = drop.color || '';
    collected.wearableSlug = loot.wearableSlug;
    collected.quality = loot.quality;
    collected.durabilityScore = loot.durabilityScore;
    player.idleRoom.lootsCollected.push(collected);
    return;
  }

  if (isManaPotion) {
    player.idleRoom.runManaPotionsCollected += drop.quantity;
    // Track in lootsCollected for summary display
    const collected = new IdleLootSchema();
    collected.type = drop.type;
    collected.name = drop.name;
    collected.quantity = drop.quantity;
    collected.rarity = drop.rarity || '';
    collected.color = drop.color || '';
    collected.wearableSlug = loot.wearableSlug;
    collected.quality = loot.quality;
    collected.durabilityScore = loot.durabilityScore;
    player.idleRoom.lootsCollected.push(collected);
    return;
  }

  // NON-POTION LOOT: Track for summary but defer inventory grant until victory
  const collected = new IdleLootSchema();
  collected.type = drop.type;
  collected.name = drop.name;
  collected.quantity = drop.quantity;
  collected.rarity = drop.rarity || '';
  collected.color = drop.color || '';
  collected.wearableSlug = loot.wearableSlug;
  collected.quality = loot.quality;
  collected.durabilityScore = loot.durabilityScore;
  player.idleRoom.lootsCollected.push(collected);

  // NOTE: Non-potion loot is NOT added to inventory here.
  // It is only granted on successful run completion (victory) to prevent
  // exploits and simplify the death flow (no need to remove on death).
}

export function processPlayerAttack(
  room: GameRoom,
  sessionId: string,
  player: PlayerSchema
) {
  const encounter = player.idleRoom.encounter;

  // Check Range
  if (encounter.distance > encounter.playerAttackRange) {
    // Auto-move closer if attacking and out of range
    encounter.distance = Math.max(
      0,
      encounter.distance - 60 // Move 60px closer
    );
    logAction(player, `Too far! Moving closer... (${encounter.distance}px)`);
    return;
  }

  const derived = JSON.parse(player.derivedStats || '{}');
  const activeWeaponSlug = derived.activeWeaponSlug || '';
  const weaponType = (derived.weaponType as 'melee' | 'ranged') || 'melee';

  const baseDamage = computeBaseDamageForCharacter(
    player.characterId,
    10,
    derived
  );

  // Apply Critical Strike
  const { damage: critDamage, isCrit } = computePlayerDamageWithCrit(
    player,
    baseDamage,
    weaponType,
    activeWeaponSlug,
    derived
  );

  const cleave = getPlayerCleave(
    player.characterId,
    weaponType,
    activeWeaponSlug,
    derived
  );

  // Find all potential targets (alive enemies)
  const aliveEnemies = encounter.enemies.filter((e) => !e.isDead);
  if (aliveEnemies.length === 0) return;

  // Determine targets
  const targetEnemies: any[] = [];
  let mainTarget = encounter.enemies[encounter.targetIndex];

  // Auto-target next alive if current invalid
  if (!mainTarget || mainTarget.isDead) {
    const nextIndex = encounter.enemies.findIndex((e) => !e.isDead);
    if (nextIndex !== -1) {
      encounter.targetIndex = nextIndex;
      mainTarget = encounter.enemies[nextIndex];
    }
  }

  if (!mainTarget) return;

  if (cleave.enabled) {
    const maxTargets = cleave.maxTargets || 3;
    targetEnemies.push(mainTarget);
    // Add others
    for (const e of aliveEnemies) {
      if (e !== mainTarget && targetEnemies.length < maxTargets) {
        targetEnemies.push(e);
      }
    }
  } else {
    targetEnemies.push(mainTarget);
  }

  let totalDealt = 0;
  const logMsg = isCrit ? `CRITICAL STRIKE! ` : ``;

  const cleaveMultipliers = [1, 0.8, 0.5];
  targetEnemies.forEach((target, index) => {
    const multiplier = cleaveMultipliers[index] ?? 0.5;
    const dmg = Math.round(critDamage * multiplier);
    const prevHp = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    const actualDealt = prevHp - target.hp;
    totalDealt += actualDealt;

    if (target.hp <= 0) {
      target.isDead = true;
      const leverage = getIdleRewardLeverage(room, player);
      const scoreAmount = Math.round(target.xpReward * leverage);
      player.score += scoreAmount;
      // Sync score to leaderboard system
      queueScoreDelta(room, sessionId, scoreAmount);

      // Award permanent XP (multiplied by leverage if enabled)
      const xpMultiplierEnabled =
        (GAME_CONFIG as any).leverage?.xpMultiplierEnabled ?? true;
      const xpAmount = xpMultiplierEnabled
        ? Math.round(target.xpReward * leverage)
        : target.xpReward;
      room.awardXpToPlayer(sessionId, xpAmount, {
        enemyId: target.id,
        enemyType: target.imageId,
        attackType: weaponType,
        classification: target.classification,
      });

      // Track kill count
      const killKey = `${target.imageId}|${target.name}`;
      const currentCount = player.idleRoom.killCount.get(killKey) || 0;
      player.idleRoom.killCount.set(killKey, currentCount + 1);
      recordIdleKill(room, sessionId);

      // Roll for loot
      rollLootForEnemy(room, player, target);
    }
  });

  if (targetEnemies.length > 1) {
    const firstTarget = targetEnemies[0];
    const iconPrefix = firstTarget ? `::enemy:${firstTarget.imageId}:: ` : '';
    logAction(
      player,
      logMsg +
        `${iconPrefix}You cleave through ${targetEnemies.length} enemies for ${totalDealt} total damage!`
    );
  } else {
    logAction(
      player,
      logMsg +
        `You hit ::enemy:${mainTarget.imageId}:: ${mainTarget.name} for ${totalDealt} damage.`
    );
  }

  // Apply Life Steal (Melee only)
  if (weaponType === 'melee') {
    const healed = applyPlayerLifeSteal(
      room as any,
      player,
      totalDealt,
      weaponType,
      activeWeaponSlug,
      derived
    );
    if (healed > 0) {
      logAction(player, `Healed for ${healed} HP!`);
    }
  }

  // Apply Stun (from weapon abilities like hammers)
  const stunSources = getPlayerStun(
    player.characterId,
    weaponType,
    activeWeaponSlug,
    derived
  );
  if (stunSources.length > 0) {
    for (const target of targetEnemies) {
      if (target.isDead) continue;
      for (const stun of stunSources) {
        // Roll for stun chance
        if (stun.chance < 1 && Math.random() >= stun.chance) continue;
        // Convert ms duration to turns (1 turn ≈ 1 second of idle action)
        const stunTurns = Math.ceil(stun.durationMs / 1000);
        // Apply stun (refresh if already stunned with longer duration)
        if (stunTurns > target.stunTurnsRemaining) {
          target.stunTurnsRemaining = stunTurns;
          logAction(
            player,
            `⚡ STUNNED! ::enemy:${target.imageId}:: ${target.name} is stunned for ${stunTurns} turn${stunTurns > 1 ? 's' : ''}!`
          );
          break; // Successfully applied stun, stop trying other sources
        }
        // If stun wasn't applied (target already more stunned), try next source
      }
    }
  }

  updateEncounterProgress(room, player);
}

export function logAction(player: PlayerSchema, message: string) {
  const encounter = player.idleRoom.encounter;
  if (encounter.lastActionLog) {
    encounter.lastActionLog += '\n' + message;
  } else {
    encounter.lastActionLog = message;
  }
}

interface PotionTierCounts {
  tier1: number;
  tier2: number;
  tier3: number;
}

interface InventoryPotionTierSnapshot {
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  totalFromItems: number | null;
  totalCount: number;
  source: 'inventory' | 'missing' | 'no_health_potions';
}

function getRunHealthPotionsRemaining(player: PlayerSchema): PotionTierCounts {
  return {
    tier1: Math.max(0, Number(player.idleRoom.runHealthPotionsCollectedTier1) || 0),
    tier2: Math.max(0, Number(player.idleRoom.runHealthPotionsCollectedTier2) || 0),
    tier3: Math.max(0, Number(player.idleRoom.runHealthPotionsCollectedTier3) || 0),
  };
}

function getInventoryHealthPotionsRemainingByTier(
  room: GameRoom,
  player: PlayerSchema
): InventoryPotionTierSnapshot {
  const totalCount = Math.max(0, Number(player.healthPotionCount) || 0);
  const inventory = (room as any).playerInventories?.get(player.id);
  if (!inventory || inventory.length === 0) {
    return {
      tier1: null,
      tier2: null,
      tier3: null,
      totalFromItems: null,
      totalCount,
      source: 'missing',
    };
  }

  const healthPotions = inventory.filter((item: any) => {
    if (!item) return false;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return false;
    return isHealthPotionItem(item);
  });

  if (healthPotions.length === 0) {
    return {
      tier1: null,
      tier2: null,
      tier3: null,
      totalFromItems: 0,
      totalCount,
      source: 'no_health_potions',
    };
  }

  const counts: PotionTierCounts = { tier1: 0, tier2: 0, tier3: 0 };
  for (const potion of healthPotions) {
    const tier = getHealthPotionTier(potion) ?? 1;
    const quantity = Math.max(0, Number(potion.quantity) || 0);
    if (quantity <= 0) continue;
    if (tier === 3) counts.tier3 += quantity;
    else if (tier === 2) counts.tier2 += quantity;
    else counts.tier1 += quantity;
  }

  return {
    tier1: counts.tier1,
    tier2: counts.tier2,
    tier3: counts.tier3,
    totalFromItems: counts.tier1 + counts.tier2 + counts.tier3,
    totalCount,
    source: 'inventory',
  };
}

function formatPotionTierCount(value: number | null): string {
  if (value === null) return '?';
  return `${value}`;
}

function formatInventoryTierNote(snapshot: InventoryPotionTierSnapshot): string {
  if (snapshot.source === 'inventory') {
    if (
      snapshot.totalFromItems !== null &&
      snapshot.totalFromItems !== snapshot.totalCount
    ) {
      return ` (inventory total ${snapshot.totalFromItems}, counter ${snapshot.totalCount})`;
    }
    return '';
  }
  if (snapshot.source === 'missing') {
    return ` (inventory missing; total ${snapshot.totalCount})`;
  }
  return ` (no health potions in inventory; total ${snapshot.totalCount})`;
}

function logIdlePotionDeathSnapshot(room: GameRoom, player: PlayerSchema): void {
  const runRemaining = getRunHealthPotionsRemaining(player);
  const inventoryRemaining = getInventoryHealthPotionsRemainingByTier(room, player);
  const inventoryLabel = `Inventory T1 ${formatPotionTierCount(
    inventoryRemaining.tier1
  )} • T2 ${formatPotionTierCount(
    inventoryRemaining.tier2
  )} • T3 ${formatPotionTierCount(inventoryRemaining.tier3)}${formatInventoryTierNote(
    inventoryRemaining
  )}`;

  logAction(
    player,
    `Death potion check: Run T1 ${runRemaining.tier1} • T2 ${runRemaining.tier2} • T3 ${runRemaining.tier3} | ${inventoryLabel}`
  );
}

function logIdlePotionSummary(
  player: PlayerSchema,
  outcome: 'victory' | 'defeat'
) {
  const runHealthUsed = {
    tier1: Number(player.idleRoom.runHealthPotionsUsedTier1) || 0,
    tier2: Number(player.idleRoom.runHealthPotionsUsedTier2) || 0,
    tier3: Number(player.idleRoom.runHealthPotionsUsedTier3) || 0,
  };
  const persistentHealthUsed = {
    tier1: Number(player.idleRoom.persistentHealthPotionsUsedTier1) || 0,
    tier2: Number(player.idleRoom.persistentHealthPotionsUsedTier2) || 0,
    tier3: Number(player.idleRoom.persistentHealthPotionsUsedTier3) || 0,
  };
  const runHealthUsedTotal =
    runHealthUsed.tier1 + runHealthUsed.tier2 + runHealthUsed.tier3;
  const persistentHealthUsedTotal =
    persistentHealthUsed.tier1 +
    persistentHealthUsed.tier2 +
    persistentHealthUsed.tier3;
  const runHealthRemaining = {
    tier1: Number(player.idleRoom.runHealthPotionsCollectedTier1) || 0,
    tier2: Number(player.idleRoom.runHealthPotionsCollectedTier2) || 0,
    tier3: Number(player.idleRoom.runHealthPotionsCollectedTier3) || 0,
  };
  const runHealthRemainingTotal =
    runHealthRemaining.tier1 +
    runHealthRemaining.tier2 +
    runHealthRemaining.tier3;
  const runManaUsed = Number(player.idleRoom.runManaPotionsUsed) || 0;
  const persistentManaUsed =
    Number(player.idleRoom.persistentManaPotionsUsed) || 0;
  const runManaRemaining =
    Number(player.idleRoom.runManaPotionsCollected) || 0;

  logAction(player, `Run summary (${outcome === 'victory' ? 'Victory' : 'Defeat'})`);
  logAction(
    player,
    `Run potions used: T1 ${runHealthUsed.tier1} • T2 ${runHealthUsed.tier2} • T3 ${runHealthUsed.tier3} (Total ${runHealthUsedTotal})`
  );
  logAction(
    player,
    `Inventory potions used: T1 ${persistentHealthUsed.tier1} • T2 ${persistentHealthUsed.tier2} • T3 ${persistentHealthUsed.tier3} (Total ${persistentHealthUsedTotal})`
  );
  logAction(
    player,
    `${
      outcome === 'victory'
        ? 'Run potions remaining'
        : 'Run potions remaining (lost)'
    }: T1 ${runHealthRemaining.tier1} • T2 ${runHealthRemaining.tier2} • T3 ${runHealthRemaining.tier3} (Total ${runHealthRemainingTotal})`
  );
  logAction(
    player,
    `Run mana potions: used ${runManaUsed} • remaining ${runManaRemaining}`
  );
  logAction(
    player,
    `Inventory mana potions used: ${persistentManaUsed}`
  );
  logAction(
    player,
    `Inventory potions left: HP ${player.healthPotionCount} • MP ${player.manaPotionCount}`
  );
}

export function processEnemyAttack(
  room: GameRoom,
  player: PlayerSchema,
  attackers_list: any[]
) {
  const encounter = player.idleRoom.encounter;
  let adjustedDamage = 0;
  let attackersCount = 0;
  let closersCount = 0;
  const attackingEnemies: any[] = []; // Track which enemies actually attacked
  const attackEntries: Array<{ enemy: any; rawDamage: number }> = [];
  const sessionId = player.id;

  for (const enemy of attackers_list) {
    if (enemy.isDead) continue;

    // Deduct Gauge
    enemy.actionGauge = Math.max(0, enemy.actionGauge - 100);

    // --- STUN CHECK: Skip turn if stunned ---
    if (enemy.stunTurnsRemaining > 0) {
      enemy.stunTurnsRemaining -= 1;
      if (enemy.stunTurnsRemaining > 0) {
        logAction(
          player,
          `⚡ ::enemy:${enemy.imageId}:: ${enemy.name} is stunned! (${enemy.stunTurnsRemaining} turn${enemy.stunTurnsRemaining > 1 ? 's' : ''} left)`
        );
      } else {
        logAction(
          player,
          `::enemy:${enemy.imageId}:: ${enemy.name} recovers from stun!`
        );
      }
      continue; // Skip this enemy's action
    }

    // --- BOSS SPECIAL ABILITY: BLOODLUST CHARGE ---
    if (
      enemy.classification === 'boss' ||
      enemy.imageId === 'portal_guardian'
    ) {
      if (enemy.specialState === 'charging') {
        // Execute Charge!
        const chargeMult = 2.5;
        const damage = Math.round(enemy.atk * chargeMult);

        // Close distance instantly
        encounter.distance = Math.max(0, enemy.attackRange - 10);

        attackEntries.push({ enemy, rawDamage: damage });
        attackersCount++;
        attackingEnemies.push(enemy); // Boss attacked with charge

        enemy.specialState = 'idle';
        enemy.specialCooldown = 4; // 4 actions cooldown
        logAction(
          player,
          `BLOODLUST! ::enemy:${enemy.imageId}:: ${enemy.name} charges instantly and hits you for ${damage} damage!`
        );

        // 40% chance to stun the player for 2 turns
        const BOSS_CHARGE_STUN_CHANCE = 0.4;
        const BOSS_CHARGE_STUN_TURNS = 2;
        if (Math.random() < BOSS_CHARGE_STUN_CHANCE) {
          if (BOSS_CHARGE_STUN_TURNS > encounter.playerStunTurnsRemaining) {
            encounter.playerStunTurnsRemaining = BOSS_CHARGE_STUN_TURNS;
            logAction(
              player,
              `⚡ You are STUNNED by the impact for ${BOSS_CHARGE_STUN_TURNS} turns!`
            );
          }
        }

        continue;
      } else if (enemy.specialCooldown <= 0 && enemy.specialState === 'idle') {
        // Start Charging
        enemy.specialState = 'charging';
        logAction(
          player,
          `::enemy:${enemy.imageId}:: ${enemy.name} is charging up a BLOODLUST ATTACK!`
        );
        // Boss doesn't attack this turn while charging
        continue;
      } else if (enemy.specialCooldown > 0) {
        enemy.specialCooldown -= 1;
      }
    }

    if (encounter.distance > enemy.attackRange) {
      // Move closer
      encounter.distance = Math.max(0, encounter.distance - enemy.moveSpeed);
      closersCount++;

      // If enemy reached the player, attack immediately!
      if (encounter.distance <= enemy.attackRange) {
        attackEntries.push({ enemy, rawDamage: enemy.atk });
        attackersCount++;
        attackingEnemies.push(enemy); // Enemy reached and attacked
      }
    } else {
      // In range, attack
      attackEntries.push({ enemy, rawDamage: enemy.atk });
      attackersCount++;
      attackingEnemies.push(enemy); // Enemy was in range and attacked
    }
  }

  if (attackersCount > 0) {
    // Apply Leverage to enemy damage
    const damageLeverage = getIdleCombatLeverage(room, player);
    const rewardLeverage = getIdleRewardLeverage(room, player);
    const adjustedEntries = attackEntries.map((entry) => ({
      ...entry,
      adjustedDamage: Math.max(
        0,
        Math.round(entry.rawDamage * damageLeverage)
      ),
    }));
    adjustedDamage = adjustedEntries.reduce(
      (sum, entry) => sum + entry.adjustedDamage,
      0
    );
    const previousHp = Math.max(0, player.hp);

    player.hp -= adjustedDamage;
    const actualTaken = Math.max(
      0,
      Math.min(previousHp, adjustedDamage)
    );

    const derived = JSON.parse(player.derivedStats || '{}');
    const { percent: thornsPercent } = getPlayerThorns(
      player.characterId,
      derived,
      'melee'
    );

    if (thornsPercent > 0 && actualTaken > 0 && adjustedDamage > 0) {
      const shareScale =
        adjustedDamage > 0 ? actualTaken / adjustedDamage : 0;
      let reflectedTotal = 0;
      let reflectedKills = 0;

      for (const entry of adjustedEntries) {
        const enemy = entry.enemy;
        if (!enemy || enemy.isDead) continue;
        const takenShare = Math.round(entry.adjustedDamage * shareScale);
        if (takenShare <= 0) continue;
        const reflectDamage = Math.max(
          0,
          Math.round(takenShare * thornsPercent)
        );
        if (reflectDamage <= 0) continue;

        const prevHp = enemy.hp;
        enemy.hp = Math.max(0, enemy.hp - reflectDamage);
        const actualReflected = prevHp - enemy.hp;
        reflectedTotal += actualReflected;

        if (enemy.hp <= 0) {
          enemy.isDead = true;
          reflectedKills += 1;
          if (sessionId) {
            const scoreAmount = Math.round(enemy.xpReward * rewardLeverage);
            player.score += scoreAmount;
            queueScoreDelta(room, sessionId, scoreAmount);

            const xpMultiplierEnabled =
              (GAME_CONFIG as any).leverage?.xpMultiplierEnabled ?? true;
            const xpAmount = xpMultiplierEnabled
              ? Math.round(enemy.xpReward * rewardLeverage)
              : enemy.xpReward;
            room.awardXpToPlayer(sessionId, xpAmount, {
              enemyId: enemy.id,
              enemyType: enemy.imageId,
              attackType: 'thorns',
              classification: enemy.classification,
            });

            const killKey = `${enemy.imageId}|${enemy.name}`;
            const currentCount = player.idleRoom.killCount.get(killKey) || 0;
            player.idleRoom.killCount.set(killKey, currentCount + 1);
            recordIdleKill(room, sessionId);

            rollLootForEnemy(room, player, enemy);
          }
        }
      }

      if (reflectedKills > 0) {
        updateEncounterProgress(room, player);
      }

      if (reflectedTotal > 0) {
        const killSuffix =
          reflectedKills > 0
            ? ` (${reflectedKills} defeated)`
            : '';
        logAction(
          player,
          `Thorns reflects ${reflectedTotal} damage to attackers${killSuffix}.`
        );
      }
    }

    // --- POTION AUTO-USE ---
    // Per-tier limit: consume at most one potion per tier per damage instance
    // Uses run-collected potions first for each tier, then persistent inventory
    if (player.hp <= 0) {
      const healResult = tryIdleAutoHeal(room, player);

      console.warn('[IdleMode] Auto-heal result (enemy)', {
        playerId: player.id,
        roomId: room.state.id,
        hp: player.hp,
        potionUsed: healResult.potionUsed,
        healAmount: healResult.healAmount,
        potionTiersUsed: healResult.potionTiersUsed,
        runPotionsUsed: healResult.runPotionsUsed,
        persistentPotionsUsed: healResult.persistentPotionsUsed,
        persistentPotionConsumed: healResult.persistentPotionConsumed,
      });

      if (healResult.potionUsed) {
        const { potionLabel, tierLabel } = getPotionUseLabel(healResult);
        const outcomeLabel =
          player.hp > 0 ? 'used to survive' : "wasn't enough to survive";
        logAction(
          player,
          `CRITICAL! ${potionLabel}${tierLabel} ${outcomeLabel}! Recovered ${healResult.healAmount} HP.`
        );
      } else {
        logAction(player, `CRITICAL! No HP potion available to survive.`);
      }
    }

    player.hp = Math.max(0, player.hp);

    const reachedMsg = closersCount > 0 ? 'reached you and ' : '';

    // If we already set a specific log for bloodlust, don't overwrite it here
    // unless it's a combined attack with minions
    if (!encounter.lastActionLog.includes('BLOODLUST')) {
      const firstAttacker = attackingEnemies[0] ?? attackers_list[0];
      const iconPrefix = firstAttacker
        ? `::enemy:${firstAttacker.imageId}:: `
        : '';
      logAction(
        player,
        attackersCount > 1
          ? `${iconPrefix}${attackersCount} enemies ${reachedMsg}hit you for ${adjustedDamage} damage! (L: ${damageLeverage.toFixed(1)}x)`
          : `${iconPrefix}${firstAttacker?.name || encounter.name} ${reachedMsg}hits you for ${adjustedDamage} damage. (L: ${damageLeverage.toFixed(1)}x)`
      );
    } else if (attackersCount > 1) {
      logAction(player, `Minions also hit for extra damage!`);
    }
  } else if (closersCount > 0) {
    logAction(
      player,
      `The mob closes in... Distance: ${encounter.distance}px.`
    );
  }

  // --- POISON APPLICATION: Apply poison from enemies that actually attacked ---
  if (attackingEnemies.length > 0 && player.hp > 0) {
    for (const enemy of attackingEnemies) {
      if (enemy.isDead) continue;
      // Get poison abilities for this enemy type (melee attacks)
      const poisonSources = getEnemyPoison(enemy.imageId, 'melee');
      for (const poison of poisonSources) {
        // Roll for poison chance
        if (poison.chance < 1 && Math.random() >= poison.chance) continue;
        // Convert ms duration to turns (1 turn ≈ 1 second)
        const poisonTurns = Math.ceil(poison.durationMs / 1000);
        // Calculate damage per turn (damagePerTick is already calculated from damagePerSecond)
        const damagePerTurn = poison.damagePerTick;
        // Apply poison - refresh duration if already poisoned (don't stack damage)
        const hadPoisonBefore = player.idleRoom.playerPoisonTurnsRemaining > 0;
        player.idleRoom.playerPoisonTurnsRemaining = poisonTurns;
        player.idleRoom.playerPoisonDamagePerTurn = damagePerTurn;
        if (!hadPoisonBefore) {
          logAction(
            player,
            `☠️ ::enemy:${enemy.imageId}:: ${enemy.name} POISONED you! (${poisonTurns} turns, ${damagePerTurn} dmg/turn)`
          );
        } else {
          logAction(
            player,
            `☠️ Poison refreshed! (${poisonTurns} turns remaining)`
          );
        }
        break; // Only apply one poison per attack cycle
      }
    }
  }

  if (player.hp <= 0) {
    if (player.idleRoom.runStatus !== 'dead') {
      logIdlePotionDeathSnapshot(room, player);
    }
    logAction(player, `You were defeated. LOOT LOST!`);
    if (player.idleRoom.runStatus !== 'dead') {
      logIdlePotionSummary(player, 'defeat');
    }
    // Loot is NOT removed here because it was never added to inventory.
    // Loot is only granted on successful run completion.
    const killer = attackingEnemies[0];
    player.idleRoom.lastKillingEnemyName =
      killer?.name || encounter.name || 'Unknown';
    player.idleRoom.lastKillingEnemyHpRemaining = Math.max(
      0,
      Math.floor(killer?.hp ?? 0)
    );
    player.idleRoom.lastKillingEnemyHpMax = Math.max(
      0,
      Math.floor(killer?.maxHp ?? 0)
    );
    player.idleRoom.lastKillingEnemyDamage = adjustedDamage;
    player.idleRoom.lastKillingPlayerHpRemaining = player.hp;
    if (player.idleRoom.runStatus !== 'dead') {
      player.idleRoom.runStatus = 'dead';
      notifyIdlePlayerDeath(room, sessionId, 'enemy_attack');
    }
  }
}

export function updateEncounterProgress(room: GameRoom, player: PlayerSchema) {
  const encounter = player.idleRoom.encounter;
  const aliveEnemies = encounter.enemies.filter((e) => !e.isDead);
  const currentTotalHp = aliveEnemies.reduce((sum, e) => sum + e.hp, 0);

  encounter.progressCurrent = currentTotalHp;

  // Update encounter name if only one enemy left
  if (aliveEnemies.length === 1 && encounter.type === 'combat') {
    encounter.name = aliveEnemies[0].name;
  }

  if (currentTotalHp <= 0) {
    encounter.isCompleted = true;
    // Check for Boss Victory (Floor 10 Boss)
    if (encounter.enemies.some((e) => e.id === 'boss')) {
      logAction(
        player,
        `Victory! Boss ::enemy:${encounter.imageId}:: Defeated!`
      );
    } else {
      logAction(player, `Encounter cleared!`);
    }
  }
}

// --- Handler Functions ---

export function toggleAutoExplore(
  room: GameRoom,
  client: Client,
  data: { enabled: boolean }
) {
  const player = room.state.players.get(client.sessionId);
  if (player) player.isAutoExploring = !!data.enabled;
}

export function setSpeedRun(
  room: GameRoom,
  client: Client,
  data: { enabled: boolean; multiplier?: number }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  const shouldEnable = !!data.enabled;
  player.idleRoom.speedRun = shouldEnable;
  if (typeof data.multiplier === 'number' && Number.isFinite(data.multiplier)) {
    player.idleRoom.speedRunMultiplier = Math.max(
      1,
      Math.floor(data.multiplier)
    );
  }

  if (shouldEnable) {
    player.isAutoExploring = true;
    player.idleRoom.playerPoisonTurnsRemaining = 0;
    player.idleRoom.playerPoisonDamagePerTurn = 0;
    player.idleRoom.encounter.playerStunTurnsRemaining = 0;
    player.idleRoom.encounter.lastActionLog = 'Speed run enabled.';
  } else {
    player.idleRoom.encounter.lastActionLog = 'Speed run disabled.';
  }
}

export async function restartRun(room: GameRoom, client: Client) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  await room.settleEquippedWearableDurability(client.sessionId, 'restart');

  const shouldSpeedRun = player.idleRoom.speedRun;
  const speedRunMultiplier = player.idleRoom.speedRunMultiplier;

  const playerId = room.getPlayerIdForSession(client.sessionId);
  if (!playerId) {
    console.error(
      '[restartRun] Could not resolve playerId for session',
      client.sessionId
    );
    return;
  }

  const shouldEnforceRuns = !shouldSkipEntryFee(player);
  if (shouldEnforceRuns && !player.dailyQuestActive) {
    try {
      const config = getDailyRunsConfig();
      if (config.enabled) {
        const date = getDailyRunsDate();
        const stakedBalances =
          await depositsRepo.getStakedUnlockBalances(playerId);
        const baseAllowedRuns = getDailyRunAllowance({
          usdcStaked: stakedBalances.total,
          tiers: config.tiers,
        });
        const bonusRunsRaw = await playerDailyRunBonusRepo.getBonusRuns({
          accountId: playerId,
          date,
          mode: 'progression',
        });
        const bonusRuns = Number.isFinite(bonusRunsRaw)
          ? Math.max(0, Math.floor(bonusRunsRaw))
          : 0;
        const allowedRuns = Math.max(0, Math.floor(baseAllowedRuns) + bonusRuns);
        const result = await playerDailyRunsRepo.consumeDailyRun({
          accountId: playerId,
          date,
          allowedRuns,
        });
        if (!result.success) {
          const resetAtUtc = getDailyRunsResetAt();
          const resetLabel = new Date(resetAtUtc).toUTCString();
          player.idleRoom.encounter.lastActionLog = `Daily runs exhausted. Resets at ${resetLabel}.`;
          return;
        }
      }
    } catch (error: any) {
      console.error('[restartRun] Error consuming daily run', error);
      player.idleRoom.encounter.lastActionLog = `Error: ${
        error?.message || 'Failed to consume daily run'
      }`;
      return;
    }
  }

  await room.advanceDurabilityRunOrdinal(client.sessionId);

  // Reset run state
  player.hp = player.maxHp;
  player.score = 0;
  // Reset the score state used by leaderboard system
  const scoreState = ensurePlayerScoreState(room, playerId);
  scoreState.score = 0;
  scoreState.eligible = true;
  // Clear persisted flag so this new run's score can be recorded
  // @ts-ignore - access private property
  room.persistedScorePlayerIds.delete(playerId);
  player.idleRoom = new IdleRoomSchema();
  player.idleRoom.speedRun = shouldSpeedRun;
  player.idleRoom.speedRunMultiplier = speedRunMultiplier;
  player.idleRoom.runStatus = 'active';
  player.idleRoom.depth = 1;
  player.idleRoom.maxDepthReached = 1;
  player.idleRoom.competitionMultiplier = calculateTimeMultiplier();
  player.idleRoom.encounter = EncounterManager.generateEncounter(
    1,
    room.state.difficultyTier,
    1,
    player.autoAscendFloor,
    false,
    false
  );

  // Initialize player attack range
  const derived = JSON.parse(player.derivedStats || '{}');
  const playerSpeedMs = derived.attackSpeed || 1000;
  player.idleRoom.encounter.playerAttackSpeed = Math.round(
    (1000 / Math.max(1, playerSpeedMs)) * 100
  );
  player.idleRoom.encounter.playerAttackRange =
    derived.weaponType === 'ranged'
      ? derived.rangedAttackRange || 200
      : derived.meleeAttackRange || 32;

  player.idleRoom.encounter.isPlayerTurn = true;
  player.idleRoom.encounter.lastActionLog = 'A new run begins.';

  // Competition scores are automatically submitted on boss kill
  // Attunement was already recorded when player first joined with dailyQuestActive=true
}

export function handleKite(room: GameRoom, client: Client) {
  const player = room.state.players.get(client.sessionId);
  if (
    !player ||
    !player.idleRoom.encounter.isPlayerTurn ||
    player.idleRoom.encounter.isCompleted
  )
    return;

  const encounter = player.idleRoom.encounter;
  const kiteDistance = 80; // Pixels per move
  encounter.distance += kiteDistance;
  logAction(player, `You moved away! Distance: ${encounter.distance}px.`);
  // Kiting deducts gauge
  encounter.playerActionGauge = Math.max(0, encounter.playerActionGauge - 100);
  if (encounter.playerActionGauge < 100) encounter.isPlayerTurn = false;

  // Tick cooldowns after player action
  onPlayerTurnComplete(player);

  // Apply HP and mana regen after player action
  const derived = JSON.parse(player.derivedStats || '{}');
  applyIdleHpRegen(player, derived);
  applyIdleManaRegen(player);
}

export function handleCombatAction(
  room: GameRoom,
  client: Client,
  data: { action: string }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  const encounter = player.idleRoom.encounter;
  if (
    encounter.isCompleted ||
    !encounter.isPlayerTurn ||
    encounter.type !== 'combat'
  ) {
    return; // Not your turn or not combat
  }

  // --- PLAYER STUN CHECK: Skip turn if stunned ---
  if (encounter.playerStunTurnsRemaining > 0) {
    encounter.playerStunTurnsRemaining -= 1;
    // Deduct Gauge (player uses their turn being stunned)
    encounter.playerActionGauge = Math.max(
      0,
      encounter.playerActionGauge - 100
    );
    if (encounter.playerActionGauge < 100) encounter.isPlayerTurn = false;

    // Tick cooldowns even when stunned
    onPlayerTurnComplete(player);

    if (encounter.playerStunTurnsRemaining > 0) {
      logAction(
        player,
        `⚡ You are stunned! (${encounter.playerStunTurnsRemaining} turn${encounter.playerStunTurnsRemaining > 1 ? 's' : ''} left)`
      );
    } else {
      logAction(player, `You shake off the stun and recover!`);
    }
    return; // Cannot act while stunned
  }

  if (data.action === 'attack') {
    processPlayerAttack(room, client.sessionId, player);
    // Manual attack deducts gauge
    encounter.playerActionGauge = Math.max(
      0,
      encounter.playerActionGauge - 100
    );
    if (encounter.playerActionGauge < 100) encounter.isPlayerTurn = false;

    // Tick cooldowns after player action
    onPlayerTurnComplete(player);

    // Apply HP and mana regen after player action
    const derived = JSON.parse(player.derivedStats || '{}');
    applyIdleHpRegen(player, derived);
    applyIdleManaRegen(player);
  }
}

export function setTarget(
  room: GameRoom,
  client: Client,
  data: { index: number }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;
  const encounter = player.idleRoom.encounter;
  if (data.index >= 0 && data.index < encounter.enemies.length) {
    const enemy = encounter.enemies[data.index];
    if (enemy && !enemy.isDead) {
      encounter.targetIndex = data.index;
    }
  }
}

/**
 * Handle spell casting in idle mode.
 * Implements spell effects directly for idle enemies (different from tick-based play).
 */
export function handleCastSpell(
  room: GameRoom,
  client: Client,
  data: { spellId: string }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  const encounter = player.idleRoom.encounter;

  // Validation checks
  if (encounter.type !== 'combat') {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'not_combat',
    });
    return;
  }

  if (!encounter.isPlayerTurn) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'not_player_turn',
    });
    return;
  }

  if (encounter.isCompleted) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'encounter_completed',
    });
    return;
  }

  // Check if player is stunned
  if (encounter.playerStunTurnsRemaining > 0) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'player_stunned',
    });
    return;
  }

  // Get the spell definition
  const spell = SPELLS_BY_ID[data.spellId];
  if (!spell || spell.enabled === false) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'spell_disabled',
    });
    return;
  }

  // Parse derived stats early for weapon validation and damage calculation
  const derived = JSON.parse(player.derivedStats || '{}');

  // Validate weapon category if spell requires specific weapon types
  if (spell.allowedWeaponTypes && spell.allowedWeaponTypes.length > 0) {
    const playerWeaponCategory = derived.weaponCategory;
    if (
      !playerWeaponCategory ||
      !spell.allowedWeaponTypes.includes(playerWeaponCategory)
    ) {
      client.send('spell_cast_result', {
        ok: false,
        spellId: data.spellId,
        reason: 'wrong_weapon_type',
      });
      return;
    }
  }

  // Check cooldown (stored in idleRoom.spellCooldowns)
  const cooldownRemaining =
    player.idleRoom.spellCooldowns?.get(data.spellId) || 0;
  if (cooldownRemaining > 0) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'on_cooldown',
    });
    return;
  }

  // Check mana
  if (player.mana < spell.manaCost) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'insufficient_mana',
    });
    return;
  }

  // Find the target enemy
  const targetEnemy = encounter.enemies[encounter.targetIndex];
  if (!targetEnemy || targetEnemy.isDead) {
    client.send('spell_cast_result', {
      ok: false,
      spellId: data.spellId,
      reason: 'no_target',
    });
    return;
  }

  // Deduct mana
  player.mana = Math.max(0, player.mana - spell.manaCost);

  // Calculate base damage using derived stats (already parsed above)
  const baseDamage = computeBaseDamageForCharacter(
    player.characterId,
    10,
    derived
  );

  // Add spell bonus damage if defined
  const spellBonusDamage = spell.damage || 0;
  const totalSpellDamage = baseDamage + spellBonusDamage;

  // Apply spell effects based on type
  let totalDamageDealt = 0;
  const affectedEnemyIds: string[] = []; // Use IDs to avoid duplicate name issues

  if (spell.effects.kind === 'freeze') {
    // Freezing Attack: damage + slow effect (reduce enemy action gauge)
    const prevHp = targetEnemy.hp;
    targetEnemy.hp = Math.max(0, targetEnemy.hp - totalSpellDamage);
    const damageDealt = prevHp - targetEnemy.hp;
    totalDamageDealt = damageDealt;
    affectedEnemyIds.push(targetEnemy.id);

    // Apply slow effect: reduce enemy action gauge and slow their speed for next turn
    targetEnemy.actionGauge = Math.max(0, targetEnemy.actionGauge - 50);

    if (targetEnemy.hp <= 0) {
      targetEnemy.isDead = true;
      const leverage = getIdleRewardLeverage(room, player);
      const scoreAmount = Math.round(targetEnemy.xpReward * leverage);
      player.score += scoreAmount;
      queueScoreDelta(room, client.sessionId, scoreAmount);

      // Award permanent XP (multiplied by leverage if enabled)
      const xpMultiplierEnabled =
        (GAME_CONFIG as any).leverage?.xpMultiplierEnabled ?? true;
      const xpAmount = xpMultiplierEnabled
        ? Math.round(targetEnemy.xpReward * leverage)
        : targetEnemy.xpReward;
      room.awardXpToPlayer(client.sessionId, xpAmount, {
        enemyId: targetEnemy.id,
        enemyType: targetEnemy.imageId,
        attackType: 'ranged',
        classification: targetEnemy.classification,
      });

      // Track kill count (for summary display)
      const killKey = `${targetEnemy.imageId}|${targetEnemy.name}`;
      const currentCount = player.idleRoom.killCount.get(killKey) || 0;
      player.idleRoom.killCount.set(killKey, currentCount + 1);
      recordIdleKill(room, client.sessionId);
      recordIdleKill(room, client.sessionId);

      // Roll for loot
      rollLootForEnemy(room, player, targetEnemy);
    }

    logAction(
      player,
      `❄️ Freezing Attack hits ::enemy:${targetEnemy.imageId}:: ${targetEnemy.name} for ${damageDealt} damage and slows them!`
    );
  } else if (spell.effects.kind === 'bounce') {
    // Bounce Attack: damage bounces to multiple enemies
    const bounceEffect = spell.effects;
    const aliveEnemies = encounter.enemies.filter((e) => !e.isDead);
    const maxTargets = Math.min(
      bounceEffect.maxTargets || 4,
      aliveEnemies.length
    );

    // Start with main target
    let currentDamage = totalSpellDamage;
    const targetsHit: { name: string; damage: number }[] = [];

    // Hit main target first
    const prevHp = targetEnemy.hp;
    targetEnemy.hp = Math.max(0, targetEnemy.hp - currentDamage);
    const damageDealt = prevHp - targetEnemy.hp;
    totalDamageDealt += damageDealt;
    targetsHit.push({ name: targetEnemy.name, damage: damageDealt });
    affectedEnemyIds.push(targetEnemy.id);

    if (targetEnemy.hp <= 0) {
      targetEnemy.isDead = true;
      const leverage = getIdleRewardLeverage(room, player);
      const scoreAmount = Math.round(targetEnemy.xpReward * leverage);
      player.score += scoreAmount;
      queueScoreDelta(room, client.sessionId, scoreAmount);

      // Award permanent XP (multiplied by leverage if enabled)
      const xpMultiplierEnabled =
        (GAME_CONFIG as any).leverage?.xpMultiplierEnabled ?? true;
      const xpAmount = xpMultiplierEnabled
        ? Math.round(targetEnemy.xpReward * leverage)
        : targetEnemy.xpReward;
      room.awardXpToPlayer(client.sessionId, xpAmount, {
        enemyId: targetEnemy.id,
        enemyType: targetEnemy.imageId,
        attackType: 'ranged',
        classification: targetEnemy.classification,
      });

      // Track kill count (for summary display)
      const killKey = `${targetEnemy.imageId}|${targetEnemy.name}`;
      const currentCount = player.idleRoom.killCount.get(killKey) || 0;
      player.idleRoom.killCount.set(killKey, currentCount + 1);

      // Roll for loot
      rollLootForEnemy(room, player, targetEnemy);
    }

    // Bounce to other targets with damage falloff
    const falloff = bounceEffect.falloffPerHop || 0.2;
    for (let i = 1; i < maxTargets; i++) {
      const nextTarget = aliveEnemies.find(
        (e) => !e.isDead && !affectedEnemyIds.includes(e.id)
      );
      if (!nextTarget) break;

      // Apply damage falloff
      currentDamage = Math.round(currentDamage * (1 - falloff));
      if (currentDamage <= 0) break;

      const prevHpNext = nextTarget.hp;
      nextTarget.hp = Math.max(0, nextTarget.hp - currentDamage);
      const dmgDealt = prevHpNext - nextTarget.hp;
      totalDamageDealt += dmgDealt;
      targetsHit.push({ name: nextTarget.name, damage: dmgDealt });
      affectedEnemyIds.push(nextTarget.id);

      if (nextTarget.hp <= 0) {
        nextTarget.isDead = true;
        const leverage = getIdleRewardLeverage(room, player);
        const scoreAmount = Math.round(nextTarget.xpReward * leverage);
        player.score += scoreAmount;
        queueScoreDelta(room, client.sessionId, scoreAmount);

        // Award permanent XP (multiplied by leverage if enabled)
        const xpMultiplierEnabled =
          (GAME_CONFIG as any).leverage?.xpMultiplierEnabled ?? true;
        const xpAmount = xpMultiplierEnabled
          ? Math.round(nextTarget.xpReward * leverage)
          : nextTarget.xpReward;
        room.awardXpToPlayer(client.sessionId, xpAmount, {
          enemyId: nextTarget.id,
          enemyType: nextTarget.imageId,
          attackType: 'ranged',
          classification: nextTarget.classification,
        });

        // Track kill count (for summary display)
        const killKey = `${nextTarget.imageId}|${nextTarget.name}`;
        const currentCount = player.idleRoom.killCount.get(killKey) || 0;
        player.idleRoom.killCount.set(killKey, currentCount + 1);
        recordIdleKill(room, client.sessionId);

        // Roll for loot
        rollLootForEnemy(room, player, nextTarget);
      }
    }

    const hitSummary = targetsHit
      .map((t) => `${t.name} (${t.damage})`)
      .join(' → ');
    logAction(player, `⚡ Bounce Attack: ${hitSummary}`);
  }

  // Apply cooldown (convert ms to turns, minimum 1 turn)
  const cooldownTurns = Math.max(1, Math.ceil((spell.cooldownMs || 0) / 1000));
  player.idleRoom.spellCooldowns.set(data.spellId, cooldownTurns);

  // Deduct action gauge (spells cost a turn)
  encounter.playerActionGauge = Math.max(0, encounter.playerActionGauge - 100);
  if (encounter.playerActionGauge < 100) {
    encounter.isPlayerTurn = false;
  }

  // Tick cooldowns after player action
  onPlayerTurnComplete(player);

  // Check if encounter is now complete (all enemies dead)
  const remainingEnemies = encounter.enemies.filter((e) => !e.isDead);
  if (remainingEnemies.length === 0) {
    encounter.isCompleted = true;
    // Check for Boss Victory
    if (encounter.enemies.some((e) => e.id === 'boss')) {
      logAction(
        player,
        `Victory! Boss ::enemy:${encounter.imageId}:: Defeated!`
      );
    } else {
      logAction(player, `🎉 Room cleared!`);
    }
  }

  // Apply regen after player action
  applyIdleHpRegen(player, derived);
  applyIdleManaRegen(player);

  client.send('spell_cast_result', {
    ok: true,
    spellId: data.spellId,
    damage: totalDamageDealt,
    targetsHit: affectedEnemyIds.length,
  });
}
