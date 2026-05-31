import { GAME_CONFIG } from './constants';
import type { EnemySchema } from '../schemas';

type NumberLike = number | string | null | undefined;

export interface EnemyDifficultyConfig {
  enabled: boolean;
  tickIntervalMs: number;
  damagePerMinute: number;
  hpPerMinute: number;
  speedPerMinute: number;
  maxDamageMultiplier: number;
  maxHpMultiplier: number;
  maxSpeedMultiplier: number;
  rescaleBatchSize: number;
  rescaleBatchDelayMs: number;
}

export interface EnemyDifficultyMultipliers {
  damageMultiplier: number;
  hpMultiplier: number;
  speedMultiplier: number;
}

type EnemyDifficultyState = {
  enemyDifficultyLevel?: number;
  players?: { size?: number };
};

const DEFAULT_CONFIG: EnemyDifficultyConfig = {
  enabled: true,
  tickIntervalMs: 60_000,
  damagePerMinute: 0.08,
  hpPerMinute: 0.1,
  speedPerMinute: 0.06,
  maxDamageMultiplier: 4,
  maxHpMultiplier: 6,
  maxSpeedMultiplier: 1.75,
  rescaleBatchSize: 35,
  rescaleBatchDelayMs: 75,
};

function toFiniteNumber(value: NumberLike, fallback: number): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

export function getEnemyDifficultyConfig(): EnemyDifficultyConfig {
  const raw = (GAME_CONFIG as any)?.enemyDifficultyMeter ?? {};
  return {
    enabled: Boolean(raw.enabled ?? DEFAULT_CONFIG.enabled),
    tickIntervalMs: Math.max(
      1000,
      Math.floor(
        toFiniteNumber(raw.tickIntervalMs, DEFAULT_CONFIG.tickIntervalMs)
      )
    ),
    damagePerMinute: Math.max(
      0,
      toFiniteNumber(raw.damagePerMinute, DEFAULT_CONFIG.damagePerMinute)
    ),
    hpPerMinute: Math.max(
      0,
      toFiniteNumber(raw.hpPerMinute, DEFAULT_CONFIG.hpPerMinute)
    ),
    speedPerMinute: Math.max(
      0,
      toFiniteNumber(raw.speedPerMinute, DEFAULT_CONFIG.speedPerMinute)
    ),
    maxDamageMultiplier: Math.max(
      1,
      toFiniteNumber(
        raw.maxDamageMultiplier,
        DEFAULT_CONFIG.maxDamageMultiplier
      )
    ),
    maxHpMultiplier: Math.max(
      1,
      toFiniteNumber(raw.maxHpMultiplier, DEFAULT_CONFIG.maxHpMultiplier)
    ),
    maxSpeedMultiplier: Math.max(
      1,
      toFiniteNumber(raw.maxSpeedMultiplier, DEFAULT_CONFIG.maxSpeedMultiplier)
    ),
    rescaleBatchSize: Math.max(
      1,
      Math.floor(
        toFiniteNumber(raw.rescaleBatchSize, DEFAULT_CONFIG.rescaleBatchSize)
      )
    ),
    rescaleBatchDelayMs: Math.max(
      0,
      Math.floor(
        toFiniteNumber(
          raw.rescaleBatchDelayMs,
          DEFAULT_CONFIG.rescaleBatchDelayMs
        )
      )
    ),
  };
}

export function getEnemyDifficultyMultipliers(
  level: number
): EnemyDifficultyMultipliers {
  const config = getEnemyDifficultyConfig();
  const sanitizedLevel = Math.max(0, Math.floor(level ?? 0));
  const damageMultiplier = Math.min(
    config.maxDamageMultiplier,
    1 + sanitizedLevel * config.damagePerMinute
  );
  const hpMultiplier = Math.min(
    config.maxHpMultiplier,
    1 + sanitizedLevel * config.hpPerMinute
  );
  const speedMultiplier = Math.min(
    config.maxSpeedMultiplier,
    1 + sanitizedLevel * config.speedPerMinute
  );
  return {
    damageMultiplier,
    hpMultiplier,
    speedMultiplier,
  };
}

export function getRoomEnemyDifficultyMultipliers(
  state: EnemyDifficultyState
): EnemyDifficultyMultipliers {
  const base = getEnemyDifficultyMultipliers(state.enemyDifficultyLevel ?? 0);
  const config = getEnemyDifficultyConfig();

  // Derive party size from state; default to 1 when unknown
  const rawSize = (state as any)?.players?.size;
  const playerCount =
    typeof rawSize === 'number' && Number.isFinite(rawSize) ? rawSize : 1;
  const maxPlayers = Math.max(
    1,
    Number((GAME_CONFIG as any)?.MAX_PLAYERS) || 3
  );
  const partySize = Math.max(1, Math.min(maxPlayers, playerCount));

  // Global multiplier per player (linear). Defaults to factor = partySize.
  // If future tuning is needed, consider adding GAME_CONFIG.enemyPartyScaling.
  const damageFactor = partySize;
  const hpFactor = partySize;

  return {
    damageMultiplier: Math.min(
      config.maxDamageMultiplier,
      base.damageMultiplier * damageFactor
    ),
    hpMultiplier: Math.min(
      config.maxHpMultiplier,
      base.hpMultiplier * hpFactor
    ),
    // Do NOT scale movement speed with party size by default to avoid runaway kiting difficulty.
    speedMultiplier: base.speedMultiplier,
  };
}

export function snapshotEnemyDifficultyBase(
  enemy: EnemySchema,
  multipliers: EnemyDifficultyMultipliers
): void {
  const hpMul = Math.max(1e-6, Number(multipliers.hpMultiplier) || 1);
  const dmgMul = Math.max(1e-6, Number(multipliers.damageMultiplier) || 1);
  const spdMul = Math.max(1e-6, Number(multipliers.speedMultiplier) || 1);
  const currentMaxHp = Math.max(1, Number(enemy.maxHp) || 1);
  const currentDamage = Math.max(0, Number(enemy.damage) || 0);
  const currentSpeed = Math.max(0, Number((enemy as any).speed) || 0);

  const baseMaxHp = currentMaxHp / hpMul;
  const baseDamage = currentDamage / dmgMul;
  const baseSpeed = currentSpeed / spdMul;

  (enemy as any)._tierScaledMaxHpBase = baseMaxHp;
  (enemy as any)._tierScaledDamageBase = baseDamage;
  (enemy as any)._tierScaledSpeedBase = baseSpeed;
}
