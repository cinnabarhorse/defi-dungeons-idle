import { BASE_LEVEL_CAP, LEVEL_CAP } from '@gotchiverse/progression';

export const REBIRTH_COST_LICK_TONGUES = 1000;
export const ABSOLUTE_PLAYER_LEVEL_CAP = LEVEL_CAP;
export const BASE_PLAYER_LEVEL_CAP = BASE_LEVEL_CAP;
export const LEVELS_PER_REBIRTH = 3;
export const MAX_REBIRTH_COUNT = Math.ceil(
  (ABSOLUTE_PLAYER_LEVEL_CAP - BASE_PLAYER_LEVEL_CAP) / LEVELS_PER_REBIRTH
);

export function sanitizeRebirthCount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_REBIRTH_COUNT, Math.floor(numeric)));
}

export function getUnlockedMaxLevel(rebirthCount: number): number {
  return Math.min(
    ABSOLUTE_PLAYER_LEVEL_CAP,
    BASE_PLAYER_LEVEL_CAP +
      sanitizeRebirthCount(rebirthCount) * LEVELS_PER_REBIRTH
  );
}

export function isRebirthCapReached(rebirthCount: number): boolean {
  return getUnlockedMaxLevel(rebirthCount) >= ABSOLUTE_PLAYER_LEVEL_CAP;
}
