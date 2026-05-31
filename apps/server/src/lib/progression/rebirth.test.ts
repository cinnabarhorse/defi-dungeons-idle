/// <reference types="jest" />

import {
  ABSOLUTE_PLAYER_LEVEL_CAP,
  BASE_PLAYER_LEVEL_CAP,
  getUnlockedMaxLevel,
  isRebirthCapReached,
  LEVELS_PER_REBIRTH,
  MAX_REBIRTH_COUNT,
  sanitizeRebirthCount,
} from './rebirth';

describe('rebirth progression helpers', () => {
  test('sanitizeRebirthCount clamps invalid and out-of-range values', () => {
    expect(sanitizeRebirthCount(undefined)).toBe(0);
    expect(sanitizeRebirthCount('abc')).toBe(0);
    expect(sanitizeRebirthCount(-5)).toBe(0);
    expect(sanitizeRebirthCount(3.7)).toBe(3);
    expect(sanitizeRebirthCount(1_000)).toBe(MAX_REBIRTH_COUNT);
  });

  test('getUnlockedMaxLevel starts at base cap and increases by three per rebirth', () => {
    expect(getUnlockedMaxLevel(0)).toBe(BASE_PLAYER_LEVEL_CAP);
    expect(getUnlockedMaxLevel(1)).toBe(
      BASE_PLAYER_LEVEL_CAP + LEVELS_PER_REBIRTH
    );
    expect(getUnlockedMaxLevel(MAX_REBIRTH_COUNT)).toBe(
      ABSOLUTE_PLAYER_LEVEL_CAP
    );
    expect(getUnlockedMaxLevel(9_999)).toBe(ABSOLUTE_PLAYER_LEVEL_CAP);
  });

  test('isRebirthCapReached is true only at absolute cap', () => {
    expect(isRebirthCapReached(0)).toBe(false);
    expect(isRebirthCapReached(MAX_REBIRTH_COUNT - 1)).toBe(false);
    expect(isRebirthCapReached(MAX_REBIRTH_COUNT)).toBe(true);
    expect(isRebirthCapReached(9_999)).toBe(true);
  });
});
