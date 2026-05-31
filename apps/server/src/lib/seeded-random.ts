/**
 * Seedable Random Number Generator
 *
 * This module provides a deterministic random number generator that can be
 * seeded for reproducible results. Used for simulation testing to ensure
 * the same seed always produces the same sequence of random values.
 *
 * Usage:
 *   import { SeededRandom, setGlobalRandom, resetGlobalRandom } from './seeded-random';
 *
 *   // For tests:
 *   const rng = new SeededRandom(12345);
 *   const value = rng.next(); // Always same value for seed 12345
 *
 *   // To override global Math.random for testing:
 *   setGlobalRandom(12345);
 *   // ... run simulation ...
 *   resetGlobalRandom();
 */

/**
 * Mulberry32 PRNG - fast 32-bit generator with good statistical properties
 * @see https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */
export class SeededRandom {
  private state: number;
  private initialSeed: number;

  constructor(seed: number = Date.now()) {
    this.initialSeed = seed;
    this.state = seed;
  }

  /**
   * Get the next random number in [0, 1)
   */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Get random integer in [min, max] inclusive
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Get random float in [min, max)
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Get random boolean with given probability of true
   */
  nextBoolean(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Shuffle an array in place using Fisher-Yates
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Reset to initial seed
   */
  reset(): void {
    this.state = this.initialSeed;
  }

  /**
   * Get the initial seed (for debugging/logging)
   */
  getSeed(): number {
    return this.initialSeed;
  }
}

// Global random state for overriding Math.random
let originalMathRandom: typeof Math.random | null = null;
let globalSeededRandom: SeededRandom | null = null;

/**
 * Override Math.random with a seeded generator.
 * Call resetGlobalRandom() when done to restore the original.
 */
export function setGlobalRandom(seed: number): SeededRandom {
  if (originalMathRandom === null) {
    originalMathRandom = Math.random;
  }
  globalSeededRandom = new SeededRandom(seed);
  Math.random = () => globalSeededRandom!.next();
  return globalSeededRandom;
}

/**
 * Restore the original Math.random function.
 */
export function resetGlobalRandom(): void {
  if (originalMathRandom !== null) {
    Math.random = originalMathRandom;
    originalMathRandom = null;
    globalSeededRandom = null;
  }
}

/**
 * Get the current global seeded random instance (if set).
 */
export function getGlobalRandom(): SeededRandom | null {
  return globalSeededRandom;
}

/**
 * Run a function with a seeded random, then restore the original.
 * Useful for isolated deterministic tests.
 */
export function withSeed<T>(seed: number, fn: (rng: SeededRandom) => T): T {
  const rng = setGlobalRandom(seed);
  try {
    return fn(rng);
  } finally {
    resetGlobalRandom();
  }
}

/**
 * Compute a simple hash of game state for snapshot comparison.
 * This creates a deterministic string from an object's key properties.
 */
export function hashState(state: Record<string, unknown>): string {
  const sorted = Object.keys(state)
    .sort()
    .map((k) => {
      const v = state[k];
      if (typeof v === 'object' && v !== null) {
        return `${k}:${JSON.stringify(v)}`;
      }
      return `${k}:${String(v)}`;
    })
    .join('|');

  // Simple djb2 hash
  let hash = 5381;
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash) ^ sorted.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
