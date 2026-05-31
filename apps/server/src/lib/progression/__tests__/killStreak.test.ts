/* eslint-disable @typescript-eslint/no-var-requires */

describe('killStreak', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    jest.resetModules();

    // Avoid reassigning `process.env` (can behave differently across Node versions).
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      process.env[key] = value;
    }
  });

  describe('getKillStreakUnitDeltaForClassification', () => {
    test('maps common classifications and handles empty values', () => {
      const {
        getKillStreakUnitDeltaForClassification,
        STREAK_UNIT_TRASH,
        STREAK_UNIT_ELITE,
        STREAK_UNIT_BOSS,
      } = require('../killStreak');

      expect(getKillStreakUnitDeltaForClassification(undefined)).toBe(
        STREAK_UNIT_TRASH
      );
      expect(getKillStreakUnitDeltaForClassification(null)).toBe(
        STREAK_UNIT_TRASH
      );
      expect(getKillStreakUnitDeltaForClassification('')).toBe(
        STREAK_UNIT_TRASH
      );
      expect(getKillStreakUnitDeltaForClassification('  ')).toBe(
        STREAK_UNIT_TRASH
      );

      expect(getKillStreakUnitDeltaForClassification('elite')).toBe(
        STREAK_UNIT_ELITE
      );
      expect(getKillStreakUnitDeltaForClassification('Champion')).toBe(
        STREAK_UNIT_ELITE
      );
      expect(getKillStreakUnitDeltaForClassification('boss')).toBe(
        STREAK_UNIT_BOSS
      );

      // Unknown strings fall back to trash.
      expect(getKillStreakUnitDeltaForClassification('minion')).toBe(
        STREAK_UNIT_TRASH
      );
    });
  });

  describe('applyKillStreakIncrement', () => {
    test('caps units at STREAK_UNIT_CAP and still updates timestamps', () => {
      process.env.STREAK_UNIT_CAP = '5';

      const {
        createKillStreakProfile,
        applyKillStreakIncrement,
        STREAK_UNIT_CAP,
      } = require('../killStreak');

      const start = 1000;
      const now = 2000;
      const profile = createKillStreakProfile('enchanter', start);

      const result = applyKillStreakIncrement(profile, 999, now);

      expect(STREAK_UNIT_CAP).toBe(5);
      expect(result.profile.units).toBe(5);
      expect(result.deltaUnits).toBe(5);
      expect(result.profile.lastKillAt).toBe(now);
      expect(result.profile.updatedAt).toBe(now);

      // Ensure the input profile was not mutated.
      expect(profile.units).toBe(0);
      expect(profile.updatedAt).toBe(start);
    });

    test('no-op increments return a clone and do not change lastKillAt', () => {
      const {
        createKillStreakProfile,
        applyKillStreakIncrement,
      } = require('../killStreak');

      const start = 1000;
      const now = 2000;
      const profile = createKillStreakProfile('enchanter', start);

      const result = applyKillStreakIncrement(profile, 0, now);

      expect(result.deltaUnits).toBe(0);
      expect(result.profile.units).toBe(0);
      expect(result.profile.lastKillAt).toBe(0);
      expect(result.profile.updatedAt).toBe(now);
      expect(result.profile).not.toBe(profile);
    });
  });

  describe('applyKillStreakDecay', () => {
    test('does not decay during grace window, then decays after grace elapses', () => {
      process.env.STREAK_DECAY_GRACE_MS = '1000';
      process.env.STREAK_DECAY_RATE_UNITS_PER_SEC = '2';

      const {
        createKillStreakProfile,
        applyKillStreakIncrement,
        applyKillStreakDecay,
      } = require('../killStreak');

      const profile0 = createKillStreakProfile('enchanter', 0);
      const { profile: profile1 } = applyKillStreakIncrement(profile0, 10, 1000);

      // Within grace window: no decay
      const withinGrace = applyKillStreakDecay(profile1, 1500);
      expect(withinGrace.deltaUnits).toBe(0);
      expect(withinGrace.profile.units).toBe(profile1.units);

      // After grace: decay starts at max(updatedAt, lastKillAt + grace)
      // lastKillAt=1000, graceUntil=2000, decayStart=2000
      // now=3000 => elapsed=1000ms => unitsToDecay=2
      const afterGrace = applyKillStreakDecay(profile1, 3000);
      expect(afterGrace.deltaUnits).toBeCloseTo(-2, 5);
      expect(afterGrace.profile.units).toBeCloseTo(8, 5);
      expect(afterGrace.profile.updatedAt).toBe(3000);

      // Ensure original wasn't mutated.
      expect(profile1.units).toBe(10);
    });
  });
});
