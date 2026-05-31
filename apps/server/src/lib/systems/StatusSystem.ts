import type { Room } from 'colyseus';
import type { EnemySchema, GameRoomState, PlayerSchema } from '../../schemas';
import type {
  AggregatedPoison,
  AggregatedSlow,
  AggregatedStun,
} from '../ability-utils';
import type { SlowStackingMode } from '../../data/abilities';
import type { GameRoom } from '../../rooms/GameRoom';
import { ensureServerBroadcaster } from '../messaging';
import { isPlayerDevInvincible } from '../debug';
import { getRiskLeverageMultiplier } from '../trading-game';

interface MovementSlowEntry {
  multiplier: number;
  expiresAt: number;
  sourceKey: string;
  stacking: SlowStackingMode;
  maxStacks?: number;
  durationMs: number;
  minSpeedScalar?: number;
}

const MOVEMENT_SLOW_STORE_KEY = '_movementSlows';
const MAX_SLOW_ENTRIES = 16;
const HAS_SLOW_FLAG = '__hasMovementSlow';
const GLOBAL_MIN_SPEED_SCALAR = 0.25; // minimum movement speed scalar floor
const STUN_STATE_KEY = '__stunState';
const HAS_STUN_FLAG = '__hasActiveStun';
const POISON_STATE_KEY = '__poisonState';
const HAS_POISON_FLAG = '__hasActivePoison';

function getMovementSlowEntries(
  entity: PlayerSchema | EnemySchema,
  createIfMissing: boolean
): MovementSlowEntry[] {
  const bag = (entity as any)[MOVEMENT_SLOW_STORE_KEY];
  if (Array.isArray(bag)) {
    return bag as MovementSlowEntry[];
  }
  if (!createIfMissing) {
    return [];
  }
  const created: MovementSlowEntry[] = [];
  (entity as any)[MOVEMENT_SLOW_STORE_KEY] = created;
  return created;
}

function clampMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function setSlowFlag(
  entity: PlayerSchema | EnemySchema,
  active: boolean
): void {
  if (active) {
    (entity as any)[HAS_SLOW_FLAG] = true;
  } else {
    (entity as any)[HAS_SLOW_FLAG] = false;
  }
}

function getSlowFlag(entity: PlayerSchema | EnemySchema): boolean {
  return Boolean((entity as any)[HAS_SLOW_FLAG]);
}

interface StunState {
  expiresAt: number;
  durationMs: number;
  lastAppliedAt: number;
  sourceKey?: string;
  abilitySourceId?: string;
  lastAttackerId?: string;
}

function getStunState(
  entity: PlayerSchema | EnemySchema,
  createIfMissing: boolean
): StunState | null {
  const bag = (entity as any)[STUN_STATE_KEY] as StunState | undefined;
  if (bag) return bag;
  if (!createIfMissing) return null;
  const created: StunState = {
    expiresAt: 0,
    durationMs: 0,
    lastAppliedAt: 0,
  };
  (entity as any)[STUN_STATE_KEY] = created;
  return created;
}

function setStunFlag(
  entity: PlayerSchema | EnemySchema,
  active: boolean
): void {
  (entity as any)[HAS_STUN_FLAG] = active;
}

function getStunFlag(entity: PlayerSchema | EnemySchema): boolean {
  return Boolean((entity as any)[HAS_STUN_FLAG]);
}

interface PoisonState {
  expiresAt: number;
  durationMs: number;
  nextTickAt: number;
  tickIntervalMs: number;
  damagePerTick: number;
  lastAppliedAt: number;
  sourceKey?: string;
  abilitySourceId?: string;
  lastAttackerId?: string;
}

function getPoisonState(
  entity: PlayerSchema | EnemySchema,
  createIfMissing: boolean
): PoisonState | null {
  const bag = (entity as any)[POISON_STATE_KEY] as PoisonState | undefined;
  if (bag) return bag;
  if (!createIfMissing) return null;
  const created: PoisonState = {
    expiresAt: 0,
    durationMs: 0,
    nextTickAt: 0,
    tickIntervalMs: 0,
    damagePerTick: 0,
    lastAppliedAt: 0,
  };
  (entity as any)[POISON_STATE_KEY] = created;
  return created;
}

function setPoisonFlag(
  entity: PlayerSchema | EnemySchema,
  active: boolean
): void {
  (entity as any)[HAS_POISON_FLAG] = active;
}

function getPoisonFlag(entity: PlayerSchema | EnemySchema): boolean {
  return Boolean((entity as any)[HAS_POISON_FLAG]);
}

function refreshPoisonState(
  entity: PlayerSchema | EnemySchema,
  now: number
): PoisonState | null {
  const state = getPoisonState(entity, false);
  if (!state) {
    setPoisonFlag(entity, false);
    return null;
  }
  if (state.expiresAt > now) {
    setPoisonFlag(entity, true);
    return state;
  }
  delete (entity as any)[POISON_STATE_KEY];
  setPoisonFlag(entity, false);
  return null;
}

export interface MovementSlowApplyResult {
  applied: boolean;
  hadActiveBefore: boolean;
  hasActiveAfter: boolean;
}

export function applyMovementSlow(
  entity: PlayerSchema | EnemySchema,
  slow: AggregatedSlow,
  now: number
): MovementSlowApplyResult {
  pruneMovementSlows(entity, now);
  const store = getMovementSlowEntries(entity, true);
  // Ensure only one active slow entry is kept (coalesce if legacy multiples exist)
  if (store.length > 1) {
    let bestIndex = 0;
    for (let i = 1; i < store.length; i++) {
      const a = store[i];
      const b = store[bestIndex];
      if (!a) continue;
      if (
        a.multiplier < b.multiplier ||
        (a.multiplier === b.multiplier && a.expiresAt > b.expiresAt)
      ) {
        bestIndex = i;
      }
    }
    const chosen = store[bestIndex];
    store.length = 0;
    if (chosen) store.push(chosen);
  }
  const hadActiveBefore = store.length > 0;
  let applied = false;

  const baseMultiplier = clampMultiplier(1 - slow.amount);
  let multiplier = baseMultiplier;
  if (slow.minSpeedScalar !== undefined) {
    multiplier = Math.max(slow.minSpeedScalar, multiplier);
  }
  multiplier = clampMultiplier(multiplier);
  if (slow.minSpeedScalar === undefined) {
    multiplier = Math.max(multiplier, GLOBAL_MIN_SPEED_SCALAR);
  }
  if (!(multiplier < 1)) {
    return {
      applied: false,
      hadActiveBefore,
      hasActiveAfter: hadActiveBefore,
    };
  }

  const expiresAt = now + Math.max(1, Math.floor(slow.durationMs));
  const existingIndex = store.findIndex(
    (entry) => entry.sourceKey === slow.sourceKey
  );
  const existing = existingIndex >= 0 ? store[existingIndex] : undefined;
  let skipNewEntry = false;

  if (existing) {
    if (slow.stacking === 'refresh' || slow.stacking === 'strongest') {
      existing.expiresAt = expiresAt;
      existing.durationMs = slow.durationMs;
      existing.maxStacks = slow.maxStacks;
      existing.stacking = slow.stacking;
      existing.minSpeedScalar =
        slow.minSpeedScalar ?? existing.minSpeedScalar ?? undefined;
      if (slow.stacking === 'strongest') {
        existing.multiplier = Math.min(existing.multiplier, multiplier);
      } else {
        existing.multiplier = multiplier;
      }
      applied = true;
      skipNewEntry = true;
    } else if (slow.stacking === 'extend') {
      const remaining = Math.max(0, existing.expiresAt - now);
      const baseDuration = slow.durationMs;
      const maxDuration =
        slow.maxStacks && slow.maxStacks > 0
          ? slow.maxStacks * baseDuration
          : undefined;
      let newDuration = remaining + baseDuration;
      if (maxDuration !== undefined) {
        newDuration = Math.min(newDuration, maxDuration);
      }
      existing.expiresAt = now + newDuration;
      existing.durationMs = baseDuration;
      existing.maxStacks = slow.maxStacks;
      existing.stacking = slow.stacking;
      existing.multiplier = Math.min(existing.multiplier, multiplier);
      existing.minSpeedScalar =
        slow.minSpeedScalar ?? existing.minSpeedScalar ?? undefined;
      applied = true;
      skipNewEntry = true;
    }
  }

  if (!skipNewEntry) {
    const entry: MovementSlowEntry = {
      multiplier,
      expiresAt,
      sourceKey: slow.sourceKey,
      stacking: slow.stacking,
      maxStacks: slow.maxStacks,
      durationMs: slow.durationMs,
      minSpeedScalar: slow.minSpeedScalar,
    };

    if (existing) {
      // Update in-place and ensure single-entry invariant
      store[existingIndex] = entry;
      store.length = 1;
      applied = true;
    } else {
      // Enforce only one slow active at a time across sources: replace only if stronger
      if (store.length === 0) {
        store.push(entry);
        applied = true;
      } else {
        const current = store[0];
        if (!current || entry.multiplier < current.multiplier) {
          store[0] = entry;
          applied = true;
        } else {
          applied = false; // weaker slow ignored
        }
        // Ensure single-entry invariant
        store.length = Math.min(store.length, 1);
      }
    }
  }

  const hasActiveAfter = getMovementSlowEntries(entity, false).length > 0;
  if (hasActiveAfter) {
    setSlowFlag(entity, true);
  }

  return {
    applied,
    hadActiveBefore,
    hasActiveAfter,
  };
}

export function hasActiveMovementSlow(
  entity: PlayerSchema | EnemySchema,
  now: number
): boolean {
  pruneMovementSlows(entity, now);
  const hasActive = getMovementSlowEntries(entity, false).length > 0;
  return hasActive;
}

export function pruneMovementSlows(
  entity: PlayerSchema | EnemySchema,
  now: number
): void {
  const store = getMovementSlowEntries(entity, false);
  if (store.length === 0) return;
  for (let i = store.length - 1; i >= 0; i--) {
    const entry = store[i];
    if (!entry || entry.expiresAt <= now) {
      store.splice(i, 1);
    }
  }
}

export function getMovementSpeedScalar(
  entity: PlayerSchema | EnemySchema,
  now: number
): number {
  if (isEntityStunned(entity, now)) {
    return 0;
  }
  pruneMovementSlows(entity, now);
  const store = getMovementSlowEntries(entity, false);
  if (store.length === 0) {
    return 1;
  }
  let scalar = 1;
  for (const entry of store) {
    if (!entry) continue;
    scalar = Math.min(scalar, clampMultiplier(entry.multiplier));
  }
  scalar = Math.max(scalar, GLOBAL_MIN_SPEED_SCALAR);
  return clampMultiplier(scalar);
}

function refreshStunState(
  entity: PlayerSchema | EnemySchema,
  now: number
): boolean {
  const state = getStunState(entity, false);
  if (!state) {
    return false;
  }
  if (state.expiresAt > now) {
    return true;
  }
  delete (entity as any)[STUN_STATE_KEY];
  return false;
}

export function isEntityStunned(
  entity: PlayerSchema | EnemySchema,
  now: number
): boolean {
  return refreshStunState(entity, now);
}

export function isEntityPoisoned(
  entity: PlayerSchema | EnemySchema,
  now: number
): boolean {
  return Boolean(refreshPoisonState(entity, now));
}

export function updateStatusSystem(
  room: Room<GameRoomState>,
  now: number
): void {
  const broadcaster = ensureServerBroadcaster(room as any);
  const gameRoomInstance = (room.state.room as GameRoom | undefined) ?? null;
  for (const [, player] of room.state.players) {
    if (!player) continue;
    const isAlive = player.hp > 0;
    const devInvincible = isPlayerDevInvincible(player);
    const hadSlow = getSlowFlag(player);
    pruneMovementSlows(player, now);
    const hasSlow = getMovementSlowEntries(player, false).length > 0;
    setSlowFlag(player, hasSlow);
    if (hadSlow && !hasSlow && player.id) {
      broadcaster.broadcast('status_removed', {
        targetId: player.id,
        type: 'slow',
      });
    }
    const hadStun = getStunFlag(player);
    const hasStun = refreshStunState(player, now);
    if (hadStun && !hasStun && player.id) {
      broadcaster.broadcast('status_removed', {
        targetId: player.id,
        type: 'stun',
      });
    }
    const hadPoison = getPoisonFlag(player);
    const poisonState = refreshPoisonState(player, now);
    const hasPoison = Boolean(poisonState);
    if (
      isAlive &&
      !devInvincible &&
      poisonState &&
      poisonState.damagePerTick > 0 &&
      poisonState.nextTickAt > 0 &&
      poisonState.nextTickAt <= poisonState.expiresAt &&
      now >= poisonState.nextTickAt
    ) {
      const damage = poisonState.damagePerTick;
      const leverage = getRiskLeverageMultiplier(
        player,
        gameRoomInstance?.getLeverageTotal?.() ?? 1
      );
      const adjustedDamage = Math.max(0, Math.round(damage * leverage));
      if (adjustedDamage > 0) {
        player.hp = Math.max(0, player.hp - adjustedDamage);
        if (player.hp <= 0) {
          handlePlayerZeroHp(room, player, 'poison');
        }
      }
      poisonState.nextTickAt = Math.min(
        poisonState.nextTickAt + poisonState.tickIntervalMs,
        poisonState.expiresAt
      );
    }
    if (hadPoison && !hasPoison && player.id) {
      broadcaster.broadcast('status_removed', {
        targetId: player.id,
        type: 'poison',
      });
    }
  }
  for (const [, enemy] of room.state.enemies) {
    if (!enemy) continue;
    const hadSlow = getSlowFlag(enemy);
    pruneMovementSlows(enemy, now);
    const hasSlow = getMovementSlowEntries(enemy, false).length > 0;
    setSlowFlag(enemy, hasSlow);
    if (hadSlow && !hasSlow && enemy.id) {
      broadcaster.broadcast('status_removed', {
        targetId: enemy.id,
        type: 'slow',
      });
    }
    const hadStun = getStunFlag(enemy);
    const hasStun = refreshStunState(enemy, now);
    if (hadStun && !hasStun && enemy.id) {
      broadcaster.broadcast('status_removed', {
        targetId: enemy.id,
        type: 'stun',
      });
    }
    const hadPoison = getPoisonFlag(enemy);
    const poisonState = refreshPoisonState(enemy, now);
    const hasPoison = Boolean(poisonState);
    if (
      poisonState &&
      poisonState.damagePerTick > 0 &&
      poisonState.nextTickAt > 0 &&
      poisonState.nextTickAt <= poisonState.expiresAt &&
      now >= poisonState.nextTickAt
    ) {
      const damage = poisonState.damagePerTick;
      enemy.hp = Math.max(0, enemy.hp - damage);
      if (damage > 0) {
      }
      poisonState.nextTickAt = Math.min(
        poisonState.nextTickAt + poisonState.tickIntervalMs,
        poisonState.expiresAt
      );
    }
    if (hadPoison && !hasPoison && enemy.id) {
      broadcaster.broadcast('status_removed', {
        targetId: enemy.id,
        type: 'poison',
      });
    }
  }
}

export function clearAllMovementSlowsImmediate(
  room: Room<GameRoomState>,
  entity: PlayerSchema | EnemySchema
): void {
  const broadcaster = ensureServerBroadcaster(room as any);
  const store = getMovementSlowEntries(entity, false);
  const hadSlow = getSlowFlag(entity) || store.length > 0;
  if (store.length > 0) {
    store.length = 0;
  }
  setSlowFlag(entity, false);
  const targetId = (entity as any)?.id as string | undefined;
  if (hadSlow && targetId) {
    broadcaster.broadcast('status_removed', { targetId, type: 'slow' });
  }
}

export interface ApplyStunResult {
  applied: boolean;
  hadActiveBefore: boolean;
  hasActiveAfter: boolean;
  expiresAt: number;
}

export interface ApplyPoisonResult {
  applied: boolean;
  hadActiveBefore: boolean;
  hasActiveAfter: boolean;
  expiresAt: number;
}

export function applyPoisonStatus(
  gameRoom: GameRoom | null | undefined,
  entity: PlayerSchema | EnemySchema,
  poison: AggregatedPoison,
  now: number,
  options?: { attackerId?: string }
): ApplyPoisonResult {
  const state =
    getPoisonState(entity, true) ??
    ({
      expiresAt: 0,
      durationMs: 0,
      nextTickAt: 0,
      tickIntervalMs: 0,
      damagePerTick: 0,
      lastAppliedAt: 0,
    } as PoisonState);

  const hadActiveBefore = state.expiresAt > now;
  const durationMs = Math.max(1, Math.floor(poison.durationMs));
  const tickIntervalMs = Math.max(1, Math.floor(poison.tickIntervalMs));
  const damagePerTick = Math.max(0, Math.floor(poison.damagePerTick));

  if (hadActiveBefore) {
    state.expiresAt = now + durationMs;
    if (state.nextTickAt <= now || state.nextTickAt > state.expiresAt) {
      state.nextTickAt = Math.min(now + tickIntervalMs, state.expiresAt);
    }
  } else {
    state.expiresAt = now + durationMs;
    state.nextTickAt = now + tickIntervalMs;
  }
  if (state.nextTickAt <= now) {
    state.nextTickAt = now + tickIntervalMs;
  }
  if (state.nextTickAt > state.expiresAt) {
    state.nextTickAt = state.expiresAt;
  }

  state.durationMs = durationMs;
  state.tickIntervalMs = tickIntervalMs;
  state.damagePerTick = damagePerTick;
  state.lastAppliedAt = now;
  state.sourceKey = poison.sourceKey;
  state.abilitySourceId = poison.abilitySourceId;
  state.lastAttackerId = options?.attackerId;
  (entity as any)[POISON_STATE_KEY] = state;
  setPoisonFlag(entity, true);

  // Telemetry removed

  return {
    applied: true,
    hadActiveBefore,
    hasActiveAfter: true,
    expiresAt: state.expiresAt,
  };
}

export function applyStunStatus(
  gameRoom: GameRoom | null | undefined,
  entity: PlayerSchema | EnemySchema,
  stun: AggregatedStun,
  now: number,
  options?: { attackerId?: string }
): ApplyStunResult {
  const state =
    getStunState(entity, true) ??
    ({
      expiresAt: 0,
      durationMs: 0,
      lastAppliedAt: 0,
    } as StunState);
  const duration = Math.max(1, Math.floor(stun.durationMs));
  const hadActiveBefore = state.expiresAt > now;

  state.expiresAt = now + duration;
  state.durationMs = duration;
  state.lastAppliedAt = now;
  state.sourceKey = stun.sourceKey;
  state.abilitySourceId = stun.abilitySourceId;
  state.lastAttackerId = options?.attackerId;
  (entity as any)[STUN_STATE_KEY] = state;
  setStunFlag(entity, true);

  if ('wallet' in entity) {
    const player = entity as PlayerSchema;
    player.isAutoWalking = false;
    player.currentPath = '';
    player.pathIndex = 0;
    player.targetX = -1;
    player.targetY = -1;
    player.isSprinting = false;
    if (typeof (player as any).repathCount === 'number') {
      (player as any).repathCount = 0;
    }
    if (player.anim !== ('death' as any)) {
      player.anim = 'idle';
    }
    if (gameRoom && typeof gameRoom.cancelPlayerAction === 'function') {
      try {
        gameRoom.cancelPlayerAction(player, 'Stunned');
      } catch {}
    }
  } else {
    const enemy = entity as EnemySchema;
    enemy.isAttacking = false;
    enemy.isCharging = false;
    if (enemy.anim !== ('death' as any)) {
      enemy.anim = 'idle';
      enemy.animUntil = now + duration;
      enemy.postAnim = 'idle' as any;
    }
    enemy.moveTimer = now;
    const resumeAt = now + duration;
    enemy.nextMoveTime = Math.max(enemy.nextMoveTime, resumeAt);
    enemy.targetX = enemy.x;
    enemy.targetY = enemy.y;
  }

  return {
    applied: true,
    hadActiveBefore,
    hasActiveAfter: true,
    expiresAt: state.expiresAt,
  };
}

export function clearStunImmediate(
  room: Room<GameRoomState>,
  entity: PlayerSchema | EnemySchema
): void {
  const broadcaster = ensureServerBroadcaster(room as any);
  const state = getStunState(entity, false);
  const hadStun = Boolean(state) && state!.expiresAt > Date.now();
  if (state) {
    delete (entity as any)[STUN_STATE_KEY];
  }
  setStunFlag(entity, false);
  const targetId = (entity as any)?.id;
  if (hadStun && targetId) {
    broadcaster.broadcast('status_removed', { targetId, type: 'stun' });
  }
}

export function clearPoisonImmediate(
  room: Room<GameRoomState>,
  entity: PlayerSchema | EnemySchema
): void {
  const broadcaster = ensureServerBroadcaster(room as any);
  const state = getPoisonState(entity, false);
  const hadPoison = Boolean(state) && state!.expiresAt > Date.now();
  if (state) {
    delete (entity as any)[POISON_STATE_KEY];
  }
  setPoisonFlag(entity, false);
  const targetId = (entity as any)?.id;
  if (hadPoison && targetId) {
    broadcaster.broadcast('status_removed', { targetId, type: 'poison' });
  }
}

export function handlePlayerZeroHp(
  room: Room<GameRoomState>,
  player: PlayerSchema,
  cause: string
): boolean {
  try {
    clearAllMovementSlowsImmediate(room, player);
    clearPoisonImmediate(room, player);
  } catch {}
  const gameRoomInstance = (room.state.room as GameRoom | undefined) ?? null;
  let alreadyDead = false;
  try {
    const deaths = (gameRoomInstance as any)?.playerDeathsThisRun;
    if (deaths && typeof deaths.has === 'function' && player.id) {
      alreadyDead = Boolean(deaths.has(player.id));
    }
  } catch {}
  const phase = (room.state as any)?.phase;
  const isInGame = phase === 'in_game';
  if (alreadyDead || !isInGame) {
    return false;
  }
  const api = room as unknown as {
    tryAutoHeal?: (p: PlayerSchema) => boolean;
    handlePlayerDeath?: (sessionId: string, cause: string) => void;
  };
  const autoHealed =
    typeof api.tryAutoHeal === 'function' ? api.tryAutoHeal(player) : false;
  if (!autoHealed) {
    if (typeof api.handlePlayerDeath === 'function') {
      try {
        api.handlePlayerDeath(player.id, cause);
      } catch {}
    }
  }
  return autoHealed;
}
