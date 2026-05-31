/**
 * Deterministic Simulation Tests
 *
 * These tests verify that the simulation harness produces identical results
 * with the same seed, enabling reproducible test runs.
 *
 * US-004: Build deterministic simulation harness
 * - Same seed produces identical state hash on repeated runs
 * - Random seed changes should cause a failing diff
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  SeededRandom,
  setGlobalRandom,
  resetGlobalRandom,
  getGlobalRandom,
  withSeed,
  hashState,
} from '../seeded-random';

describe('SeededRandom', () => {
  describe('deterministic sequence', () => {
    it('produces identical sequence for same seed', () => {
      const seed = 12345;
      const rng1 = new SeededRandom(seed);
      const rng2 = new SeededRandom(seed);

      const seq1 = Array.from({ length: 100 }, () => rng1.next());
      const seq2 = Array.from({ length: 100 }, () => rng2.next());

      expect(seq1).toEqual(seq2);
    });

    it('produces different sequence for different seeds', () => {
      const rng1 = new SeededRandom(12345);
      const rng2 = new SeededRandom(54321);

      const seq1 = Array.from({ length: 10 }, () => rng1.next());
      const seq2 = Array.from({ length: 10 }, () => rng2.next());

      expect(seq1).not.toEqual(seq2);
    });

    it('resets to initial seed correctly', () => {
      const seed = 12345;
      const rng = new SeededRandom(seed);

      const first = Array.from({ length: 10 }, () => rng.next());
      rng.reset();
      const afterReset = Array.from({ length: 10 }, () => rng.next());

      expect(first).toEqual(afterReset);
    });
  });

  describe('utility methods', () => {
    let rng: SeededRandom;

    beforeEach(() => {
      rng = new SeededRandom(42);
    });

    it('nextInt returns integers in range', () => {
      for (let i = 0; i < 100; i++) {
        const val = rng.nextInt(1, 10);
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(10);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('nextFloat returns floats in range', () => {
      for (let i = 0; i < 100; i++) {
        const val = rng.nextFloat(0.5, 2.5);
        expect(val).toBeGreaterThanOrEqual(0.5);
        expect(val).toBeLessThan(2.5);
      }
    });

    it('pick selects from array deterministically', () => {
      const items = ['a', 'b', 'c', 'd'];
      const rng1 = new SeededRandom(999);
      const rng2 = new SeededRandom(999);

      const picks1 = Array.from({ length: 20 }, () => rng1.pick(items));
      const picks2 = Array.from({ length: 20 }, () => rng2.pick(items));

      expect(picks1).toEqual(picks2);
    });

    it('pick returns undefined for empty array', () => {
      const rng = new SeededRandom(123);
      expect(rng.pick([])).toBeUndefined();
    });

    it('shuffle is deterministic', () => {
      const items1 = [1, 2, 3, 4, 5];
      const items2 = [1, 2, 3, 4, 5];
      const rng1 = new SeededRandom(777);
      const rng2 = new SeededRandom(777);

      rng1.shuffle(items1);
      rng2.shuffle(items2);

      expect(items1).toEqual(items2);
    });
  });
});

describe('Global Random Override', () => {
  afterEach(() => {
    resetGlobalRandom();
  });

  it('getGlobalRandom reflects whether the override is active', () => {
    expect(getGlobalRandom()).toBeNull();

    const rng = setGlobalRandom(123);
    expect(getGlobalRandom()).toBe(rng);

    resetGlobalRandom();
    expect(getGlobalRandom()).toBeNull();
  });

  it('setGlobalRandom overrides Math.random', () => {
    const originalRandom = Math.random;

    setGlobalRandom(12345);
    expect(Math.random).not.toBe(originalRandom);

    const seededValue = Math.random();
    resetGlobalRandom();
    expect(Math.random).toBe(originalRandom);

    // Verify determinism
    setGlobalRandom(12345);
    expect(Math.random()).toBe(seededValue);
  });

  it('resetGlobalRandom is safe to call even when not set (idempotent)', () => {
    const originalRandom = Math.random;

    resetGlobalRandom();
    expect(Math.random).toBe(originalRandom);

    setGlobalRandom(42);
    expect(Math.random).not.toBe(originalRandom);

    resetGlobalRandom();
    resetGlobalRandom();
    expect(Math.random).toBe(originalRandom);
  });

  it('withSeed runs function with deterministic random', () => {
    const result1 = withSeed(99999, () => {
      return Array.from({ length: 5 }, () => Math.random());
    });

    const result2 = withSeed(99999, () => {
      return Array.from({ length: 5 }, () => Math.random());
    });

    expect(result1).toEqual(result2);
  });

  it('withSeed always restores Math.random even if the callback throws', () => {
    const originalRandom = Math.random;

    expect(() =>
      withSeed(123, () => {
        expect(Math.random).not.toBe(originalRandom);
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(Math.random).toBe(originalRandom);
  });
});

describe('State Hashing', () => {
  it('same state produces same hash', () => {
    const state = {
      playerHp: 100,
      enemyCount: 3,
      floor: 5,
      items: ['sword', 'shield'],
    };

    const hash1 = hashState(state);
    const hash2 = hashState(state);

    expect(hash1).toBe(hash2);
  });

  it('is stable regardless of top-level key insertion order', () => {
    const state1 = {
      playerHp: 100,
      floor: 5,
      meta: { runId: 'abc', difficulty: 'normal' },
    };

    const state2 = {
      meta: { runId: 'abc', difficulty: 'normal' },
      floor: 5,
      playerHp: 100,
    };

    expect(hashState(state1)).toBe(hashState(state2));
  });

  it('different state produces different hash', () => {
    const state1 = { playerHp: 100, floor: 5 };
    const state2 = { playerHp: 99, floor: 5 };

    expect(hashState(state1)).not.toBe(hashState(state2));
  });
});

describe('Simulation Determinism', () => {
  /**
   * This test simulates a game scenario using seeded random and verifies
   * that running the same simulation twice produces identical results.
   */
  it('same seed produces identical state hash on repeated runs', () => {
    const FIXED_SEED = 12345;

    function simulateEncounter(rng: SeededRandom) {
      // Simulate encounter generation (mimics EncounterManager)
      const encounterType = rng.nextFloat(0, 1) < 0.2 ? 'treasure' : 'combat';

      let totalDamage = 0;
      let enemyCount = 0;
      let treasureValue = 0;

      if (encounterType === 'combat') {
        // Generate 1-5 enemies
        enemyCount = rng.nextInt(1, 5);

        // Simulate combat rounds
        for (let round = 0; round < 10; round++) {
          // Player attacks
          const playerDamage = rng.nextInt(10, 50);
          totalDamage += playerDamage;

          // Critical hit check
          if (rng.nextBoolean(0.15)) {
            totalDamage += Math.floor(playerDamage * 0.5);
          }
        }
      } else {
        // Treasure encounter
        treasureValue = rng.nextInt(100, 500);
      }

      return {
        encounterType,
        enemyCount,
        totalDamage,
        treasureValue,
      };
    }

    // Run 1: First simulation with seed
    const run1Results: ReturnType<typeof simulateEncounter>[] = [];
    withSeed(FIXED_SEED, (rng) => {
      for (let i = 0; i < 10; i++) {
        run1Results.push(simulateEncounter(rng));
      }
    });
    const run1Hash = hashState({
      results: run1Results,
    });

    // Run 2: Second simulation with same seed
    const run2Results: ReturnType<typeof simulateEncounter>[] = [];
    withSeed(FIXED_SEED, (rng) => {
      for (let i = 0; i < 10; i++) {
        run2Results.push(simulateEncounter(rng));
      }
    });
    const run2Hash = hashState({
      results: run2Results,
    });

    // Invariant: Same seed -> same results
    expect(run1Results).toEqual(run2Results);
    expect(run1Hash).toBe(run2Hash);
  });

  it('random seed changes cause failing diff', () => {
    const SEED_A = 12345;
    const SEED_B = 54321; // Different seed

    const resultsA = withSeed(SEED_A, (rng) => {
      return Array.from({ length: 10 }, () => ({
        value: rng.nextInt(0, 100),
        flag: rng.nextBoolean(),
      }));
    });

    const resultsB = withSeed(SEED_B, (rng) => {
      return Array.from({ length: 10 }, () => ({
        value: rng.nextInt(0, 100),
        flag: rng.nextBoolean(),
      }));
    });

    // Different seeds should produce different results
    expect(resultsA).not.toEqual(resultsB);
    expect(hashState({ results: resultsA })).not.toBe(
      hashState({ results: resultsB })
    );
  });
});
