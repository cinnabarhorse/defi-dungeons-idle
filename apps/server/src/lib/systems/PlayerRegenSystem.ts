import type { Room } from 'colyseus';
import type { GameRoomState, PlayerSchema } from '../../schemas';
import { getCharacterStats } from '../../data/characters';
import { isEntityPoisoned } from './StatusSystem';

const PLAYER_REGEN_INTERVAL_MS = 500; // match aura tick cadence
const DEFAULT_MANA_REGEN_PER_SECOND = 0.25;

interface RegenRuntimeState {
  hpNextAt: number;
  manaNextAt: number;
  manaCarry: number;
  hpCarry: number;
}

function ensureRegenState(player: PlayerSchema): RegenRuntimeState {
  const anyP = player as any;
  if (!anyP._regenState) {
    const legacyNextAt = Number(anyP._regenNextAt) || 0;
    anyP._regenState = {
      hpNextAt: legacyNextAt,
      manaNextAt: 0,
      manaCarry: 0,
      hpCarry: 0,
    };
    delete anyP._regenNextAt;
  }
  const state = anyP._regenState as RegenRuntimeState;
  if (!Number.isFinite(state.hpNextAt)) state.hpNextAt = 0;
  if (!Number.isFinite(state.manaNextAt)) state.manaNextAt = 0;
  if (!Number.isFinite(state.manaCarry)) state.manaCarry = 0;
  if (!Number.isFinite(state.hpCarry)) state.hpCarry = 0;
  return state;
}

function parseDerivedStats(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getHpRegenPerSecond(stats: {
  equipment?: { modifiers?: Record<string, unknown> };
  hpRegen?: number;
}): number {
  const mod = (stats?.equipment as any)?.modifiers?.hpRegen as
    | {
        add?: number;
        multiply?: number;
        min?: number;
        max?: number;
      }
    | undefined;
  const base = Number((stats as any)?.hpRegen) || 0;
  if (mod) {
    const add = Number((mod as any).add || 0);
    const mul = Number((mod as any).multiply || 1);
    let value = base * mul + add;
    if (typeof (mod as any).min === 'number')
      value = Math.max(value, (mod as any).min);
    if (typeof (mod as any).max === 'number')
      value = Math.min(value, (mod as any).max);
    return Math.max(0, value);
  }
  return Math.max(0, base);
}

export function updatePlayerRegen(room: Room<GameRoomState>, now: number) {
  for (const [, player] of room.state.players) {
    if (!player) continue;

    const regenState = ensureRegenState(player);
    const isAlive = player.hp > 0;
    const isPoisoned = isAlive ? isEntityPoisoned(player, now) : false;

    if (isAlive && player.hp < player.maxHp) {
      const derived = parseDerivedStats((player as any).derivedStats);
      const stats = derived ?? getCharacterStats(player.characterId);
      const basePerSecond = getHpRegenPerSecond(stats as any);
      const streakBonus = Math.max(
        0,
        Number((player as any).killStreakHpRegenPerSecondBonus || 0)
      );
      const perSecond = Math.max(0, basePerSecond + streakBonus);
      if (perSecond > 0 && now >= regenState.hpNextAt && !isPoisoned) {
        const intervalSeconds = PLAYER_REGEN_INTERVAL_MS / 1000;
        regenState.hpCarry += perSecond * intervalSeconds;
        const whole = Math.floor(regenState.hpCarry);
        if (whole >= 1) {
          const clamped = Math.min(player.maxHp, player.hp + whole);
          const applied = clamped - player.hp;
          player.hp = clamped;
          regenState.hpCarry = Math.max(0, regenState.hpCarry - applied);
        }
        regenState.hpNextAt = now + PLAYER_REGEN_INTERVAL_MS;
      }
    }

    if (!isAlive) {
      regenState.manaCarry = 0;
      continue;
    }

    if (player.maxMana <= 0) {
      regenState.manaCarry = 0;
      continue;
    }

    if (player.mana >= player.maxMana) {
      regenState.manaCarry = 0;
      continue;
    }

    const rawBaseRegen = Number((player as any).baseManaRegenPerSecond);
    const baseRegenPerSecond = Number.isFinite(rawBaseRegen)
      ? Math.max(0, rawBaseRegen)
      : DEFAULT_MANA_REGEN_PER_SECOND;
    const rawKillStreakMultiplier = Number(
      (player as any).killStreakManaRegenMultiplier
    );
    const killStreakMultiplier = Number.isFinite(rawKillStreakMultiplier)
      ? Math.max(0, rawKillStreakMultiplier)
      : 1;
    const manaPerSecond = baseRegenPerSecond * killStreakMultiplier;
    if (manaPerSecond <= 0) {
      regenState.manaCarry = 0;
      continue;
    }
    if (now < regenState.manaNextAt) {
      continue;
    }

    const intervalSeconds = PLAYER_REGEN_INTERVAL_MS / 1000;
    regenState.manaCarry += manaPerSecond * intervalSeconds;
    const whole = Math.floor(regenState.manaCarry);
    if (whole >= 1) {
      const clamped = Math.min(player.maxMana, player.mana + whole);
      const applied = clamped - player.mana;
      player.mana = clamped;
      regenState.manaCarry = Math.max(0, regenState.manaCarry - applied);
    }
    regenState.manaNextAt = now + PLAYER_REGEN_INTERVAL_MS;
  }
}
