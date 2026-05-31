/**
 * Tests for Snapshot Utilities
 *
 * US-005: Introduce snapshot fixtures and safe updates
 * - Approved snapshot diff updates only when safe criteria are met
 * - Unsafe diffs must fail the run and log the reason
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertSnapshot,
  compareSnapshot,
  saveSnapshot,
  loadFixture,
  saveFixture,
  formatSnapshotReport,
  ensureDirectories,
  getFixturePath,
} from '../snapshot-utils';

const TEST_SNAPSHOT_NAME = 'test-snapshot-unit';
const TEST_FIXTURE_NAME = 'test-fixture-unit';
const SNAPSHOT_DIR = path.join(process.cwd(), '__snapshots__');
const FIXTURE_DIR = path.join(process.cwd(), '__fixtures__');

function cleanupTestFiles(): void {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${TEST_SNAPSHOT_NAME}.snap.json`);
  const fixturePath = path.join(FIXTURE_DIR, `${TEST_FIXTURE_NAME}.fixture.json`);

  if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath);
  }
  if (fs.existsSync(fixturePath)) {
    fs.unlinkSync(fixturePath);
  }
}

describe('Snapshot Utilities', () => {
  beforeEach(() => {
    ensureDirectories();
    cleanupTestFiles();
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  describe('compareSnapshot', () => {
    it('returns isNewSnapshot=true for non-existent snapshot', () => {
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, { value: 1 });

      expect(result.isNewSnapshot).toBe(true);
      expect(result.matched).toBe(false);
      expect(result.diffs).toEqual([]);
    });

    it('returns matched=true when states are identical', () => {
      const state = { playerHp: 100, floor: 5 };
      saveSnapshot(TEST_SNAPSHOT_NAME, state);

      const result = compareSnapshot(TEST_SNAPSHOT_NAME, state);

      expect(result.matched).toBe(true);
      expect(result.diffs).toEqual([]);
      expect(result.isNewSnapshot).toBe(false);
    });

    it('detects diffs when states differ', () => {
      const original = { playerHp: 100, floor: 5 };
      saveSnapshot(TEST_SNAPSHOT_NAME, original);

      const modified = { playerHp: 90, floor: 5 };
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, modified);

      expect(result.matched).toBe(false);
      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].field).toBe('playerHp');
      expect(result.diffs[0].expected).toBe(100);
      expect(result.diffs[0].actual).toBe(90);
    });
  });

  describe('safe vs unsafe diffs', () => {
    it('classifies timestamp changes as safe', () => {
      const original = { timestamp: 1000, playerHp: 100 };
      saveSnapshot(TEST_SNAPSHOT_NAME, original);

      const modified = { timestamp: 2000, playerHp: 100 };
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, modified);

      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].field).toBe('timestamp');
      expect(result.diffs[0].isSafe).toBe(true);
    });

    it('classifies playerHp changes as unsafe', () => {
      const original = { playerHp: 100 };
      saveSnapshot(TEST_SNAPSHOT_NAME, original);

      const modified = { playerHp: 50 };
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, modified);

      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].isSafe).toBe(false);
      expect(result.diffs[0].reason).toContain('game balance');
    });

    it('classifies damage changes as unsafe', () => {
      const original = { damage: 25, timestamp: 1000 };
      saveSnapshot(TEST_SNAPSHOT_NAME, original);

      const modified = { damage: 30, timestamp: 2000 };
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, modified);

      const unsafeDiffs = result.diffs.filter((d) => !d.isSafe);
      const safeDiffs = result.diffs.filter((d) => d.isSafe);

      expect(unsafeDiffs.length).toBe(1);
      expect(unsafeDiffs[0].field).toBe('damage');
      expect(safeDiffs.length).toBe(1);
      expect(safeDiffs[0].field).toBe('timestamp');
    });
  });

  describe('saveSnapshot', () => {
    it('saves new snapshots', () => {
      const state = { value: 42 };
      const result = saveSnapshot(TEST_SNAPSHOT_NAME, state);

      expect(result.saved).toBe(true);
      expect(fs.existsSync(result.path)).toBe(true);
    });

    it('refuses to save with unsafe diffs unless forced', () => {
      const original = { playerHp: 100 };
      saveSnapshot(TEST_SNAPSHOT_NAME, original);

      const modified = { playerHp: 50 };
      const result = saveSnapshot(TEST_SNAPSHOT_NAME, modified);

      expect(result.saved).toBe(false);
      expect(result.reason).toContain('Unsafe diffs');
      expect(result.reason).toContain('playerHp');
    });

    it('saves with force=true even with unsafe diffs', () => {
      const original = { playerHp: 100 };
      saveSnapshot(TEST_SNAPSHOT_NAME, original);

      const modified = { playerHp: 50 };
      const result = saveSnapshot(TEST_SNAPSHOT_NAME, modified, { force: true });

      expect(result.saved).toBe(true);
    });

    it('supports dry run mode', () => {
      const state = { value: 42 };
      const snapshotPath = path.join(SNAPSHOT_DIR, `${TEST_SNAPSHOT_NAME}.snap.json`);

      // First ensure no file exists
      if (fs.existsSync(snapshotPath)) {
        fs.unlinkSync(snapshotPath);
      }

      const result = saveSnapshot(TEST_SNAPSHOT_NAME, state, { dryRun: true });

      expect(result.saved).toBe(true);
      expect(fs.existsSync(snapshotPath)).toBe(false);
    });
  });

  describe('formatSnapshotReport', () => {
    it('formats new snapshot report', () => {
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, { value: 1 });
      const report = formatSnapshotReport(result);

      expect(report).toContain('NEW SNAPSHOT');
      expect(report).toContain('--updateSnapshot');
    });

    it('formats matched snapshot report', () => {
      saveSnapshot(TEST_SNAPSHOT_NAME, { value: 1 });
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, { value: 1 });
      const report = formatSnapshotReport(result);

      expect(report).toContain('MATCHED');
    });

    it('formats unsafe diff report', () => {
      saveSnapshot(TEST_SNAPSHOT_NAME, { playerHp: 100 });
      const result = compareSnapshot(TEST_SNAPSHOT_NAME, { playerHp: 50 });
      const report = formatSnapshotReport(result);

      expect(report).toContain('UNSAFE DIFFS');
      expect(report).toContain('playerHp');
      expect(report).toContain('100');
      expect(report).toContain('50');
    });
  });

  describe('assertSnapshot', () => {
    it('logs snapshot diff report for safe diffs', () => {
      saveSnapshot(TEST_SNAPSHOT_NAME, { timestamp: 1000, playerHp: 100 });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      assertSnapshot(TEST_SNAPSHOT_NAME, { timestamp: 2000, playerHp: 100 });

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('throws when snapshot is missing and update flags are not enabled', () => {
      const previousUpdateSnapshot = process.env.UPDATE_SNAPSHOT;
      const previousForceSnapshot = process.env.FORCE_SNAPSHOT;
      delete process.env.UPDATE_SNAPSHOT;
      delete process.env.FORCE_SNAPSHOT;

      expect(() => assertSnapshot(TEST_SNAPSHOT_NAME, { value: 1 })).toThrow(
        /Snapshot missing/
      );

      if (previousUpdateSnapshot === undefined) {
        delete process.env.UPDATE_SNAPSHOT;
      } else {
        process.env.UPDATE_SNAPSHOT = previousUpdateSnapshot;
      }
      if (previousForceSnapshot === undefined) {
        delete process.env.FORCE_SNAPSHOT;
      } else {
        process.env.FORCE_SNAPSHOT = previousForceSnapshot;
      }
    });

    it('saves a missing snapshot when UPDATE_SNAPSHOT=1 is set', () => {
      const previousUpdateSnapshot = process.env.UPDATE_SNAPSHOT;
      process.env.UPDATE_SNAPSHOT = '1';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      // Should not throw; should create the snapshot file
      expect(() => assertSnapshot(TEST_SNAPSHOT_NAME, { value: 123 })).not.toThrow();

      const snapshotPath = path.join(SNAPSHOT_DIR, `${TEST_SNAPSHOT_NAME}.snap.json`);
      expect(fs.existsSync(snapshotPath)).toBe(true);

      warnSpy.mockRestore();
      if (previousUpdateSnapshot === undefined) {
        delete process.env.UPDATE_SNAPSHOT;
      } else {
        process.env.UPDATE_SNAPSHOT = previousUpdateSnapshot;
      }
    });

    it('throws on unsafe diffs when not forced', () => {
      const previousUpdateSnapshot = process.env.UPDATE_SNAPSHOT;
      const previousForceSnapshot = process.env.FORCE_SNAPSHOT;
      delete process.env.UPDATE_SNAPSHOT;
      delete process.env.FORCE_SNAPSHOT;

      saveSnapshot(TEST_SNAPSHOT_NAME, { playerHp: 100 });
      expect(() => assertSnapshot(TEST_SNAPSHOT_NAME, { playerHp: 50 })).toThrow(
        /unsafe diffs/i
      );

      if (previousUpdateSnapshot === undefined) {
        delete process.env.UPDATE_SNAPSHOT;
      } else {
        process.env.UPDATE_SNAPSHOT = previousUpdateSnapshot;
      }
      if (previousForceSnapshot === undefined) {
        delete process.env.FORCE_SNAPSHOT;
      } else {
        process.env.FORCE_SNAPSHOT = previousForceSnapshot;
      }
    });
  });

  describe('fixtures', () => {
    it('saves and loads fixtures', () => {
      const fixture = {
        enemies: [{ id: 1, name: 'Slime' }],
        player: { hp: 100 },
      };

      saveFixture(TEST_FIXTURE_NAME, fixture);
      const loaded = loadFixture(TEST_FIXTURE_NAME);

      expect(loaded).toEqual(fixture);
    });

    it('returns null for non-existent fixture', () => {
      const loaded = loadFixture('non-existent-fixture');
      expect(loaded).toBeNull();
    });
  });
});

describe('Snapshot Safety Criteria', () => {
  beforeEach(() => {
    ensureDirectories();
    cleanupTestFiles();
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  it('Example: approved snapshot diff updates only when safe criteria are met', () => {
    // Create initial snapshot with game state
    const initialState = {
      timestamp: 1000,
      sessionId: 'abc123',
      playerHp: 100,
      floor: 5,
      score: 1000,
    };
    saveSnapshot(TEST_SNAPSHOT_NAME, initialState);

    // Attempt update with only safe changes (metadata)
    const safeUpdate = {
      timestamp: 2000, // Safe: just metadata
      sessionId: 'xyz789', // Safe: just metadata
      playerHp: 100, // Unchanged
      floor: 5, // Unchanged
      score: 1000, // Unchanged
    };

    const safeResult = compareSnapshot(TEST_SNAPSHOT_NAME, safeUpdate);
    const safeDiffs = safeResult.diffs.filter((d) => d.isSafe);
    const unsafeDiffs = safeResult.diffs.filter((d) => !d.isSafe);

    // Only safe diffs should be present
    expect(safeDiffs.length).toBe(2);
    expect(unsafeDiffs.length).toBe(0);

    // Safe updates should succeed
    const saveResult = saveSnapshot(TEST_SNAPSHOT_NAME, safeUpdate);
    expect(saveResult.saved).toBe(true);
  });

  it('Negative case: unsafe diffs must fail the run and log the reason', () => {
    // Create initial snapshot
    const initialState = {
      playerHp: 100,
      damage: 25,
      xpGained: 50,
    };
    saveSnapshot(TEST_SNAPSHOT_NAME, initialState);

    // Attempt update with unsafe changes
    const unsafeUpdate = {
      playerHp: 50, // Unsafe: affects game balance
      damage: 30, // Unsafe: affects game balance
      xpGained: 100, // Unsafe: affects game balance
    };

    const result = compareSnapshot(TEST_SNAPSHOT_NAME, unsafeUpdate);
    const unsafeDiffs = result.diffs.filter((d) => !d.isSafe);

    // All diffs should be unsafe
    expect(unsafeDiffs.length).toBe(3);

    // Each unsafe diff should have a reason
    for (const diff of unsafeDiffs) {
      expect(diff.reason).toBeDefined();
      expect(diff.reason!.length).toBeGreaterThan(0);
    }

    // Save should fail without force
    const saveResult = saveSnapshot(TEST_SNAPSHOT_NAME, unsafeUpdate);
    expect(saveResult.saved).toBe(false);
    expect(saveResult.reason).toContain('Unsafe diffs');

    // Report should include the reason
    const report = formatSnapshotReport(result);
    expect(report).toContain('UNSAFE DIFFS');
    expect(report).toContain('playerHp');
    expect(report).toContain('damage');
    expect(report).toContain('xpGained');
  });
});
