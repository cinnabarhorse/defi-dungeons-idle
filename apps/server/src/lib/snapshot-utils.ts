/**
 * Snapshot Utilities for Simulation Testing
 *
 * This module provides utilities for creating, comparing, and updating
 * simulation state snapshots. Used to ensure deterministic test results
 * and catch unintended state changes.
 *
 * US-005: Introduce snapshot fixtures and safe updates
 */

import * as fs from 'fs';
import * as path from 'path';
import { hashState } from './seeded-random';

const SNAPSHOT_DIR = path.join(process.cwd(), '__snapshots__');
const FIXTURE_DIR = path.join(process.cwd(), '__fixtures__');

export interface SnapshotDiff {
  field: string;
  expected: unknown;
  actual: unknown;
  isSafe: boolean;
  reason?: string;
}

export interface SnapshotResult {
  name: string;
  matched: boolean;
  diffs: SnapshotDiff[];
  expectedHash: string;
  actualHash: string;
  isNewSnapshot: boolean;
}

// Fields that are considered safe to change (don't affect game logic)
const SAFE_DIFF_FIELDS = new Set([
  'timestamp',
  'createdAt',
  'updatedAt',
  'renderTime',
  'frameCount',
  'sessionId',
  'clientVersion',
]);

// Fields that are unsafe to change (affect game logic/balance)
const UNSAFE_DIFF_FIELDS = new Set([
  'playerHp',
  'playerMp',
  'damage',
  'enemyCount',
  'lootDrops',
  'xpGained',
  'goldEarned',
  'itemsCollected',
  'criticalHits',
  'deaths',
  'floor',
  'score',
]);

/**
 * Ensure snapshot and fixture directories exist.
 */
export function ensureDirectories(): void {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  if (!fs.existsSync(FIXTURE_DIR)) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  }
}

/**
 * Get the path for a snapshot file.
 */
function getSnapshotPath(name: string): string {
  return path.join(SNAPSHOT_DIR, `${name}.snap.json`);
}

/**
 * Get the path for a fixture file.
 */
export function getFixturePath(name: string): string {
  return path.join(FIXTURE_DIR, `${name}.fixture.json`);
}

/**
 * Determine if a field diff is safe or unsafe.
 */
function classifyDiff(field: string): { isSafe: boolean; reason: string } {
  if (SAFE_DIFF_FIELDS.has(field)) {
    return { isSafe: true, reason: 'Field is metadata, does not affect game logic' };
  }
  if (UNSAFE_DIFF_FIELDS.has(field)) {
    return { isSafe: false, reason: 'Field affects game balance or logic' };
  }
  // Unknown fields are treated as unsafe by default
  return { isSafe: false, reason: 'Unknown field - requires manual review' };
}

function isUpdateSnapshotEnabled(): boolean {
  return process.argv.includes('--updateSnapshot') || process.env.UPDATE_SNAPSHOT === '1';
}

function isForceSnapshotEnabled(): boolean {
  return process.env.FORCE_SNAPSHOT === '1';
}

/**
 * Compare two state objects and return diffs.
 */
function compareStates(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): SnapshotDiff[] {
  const diffs: SnapshotDiff[] = [];
  const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);

  for (const key of allKeys) {
    const expectedVal = expected[key];
    const actualVal = actual[key];

    if (JSON.stringify(expectedVal) !== JSON.stringify(actualVal)) {
      const { isSafe, reason } = classifyDiff(key);
      diffs.push({
        field: key,
        expected: expectedVal,
        actual: actualVal,
        isSafe,
        reason,
      });
    }
  }

  return diffs;
}

/**
 * Compare actual state against a saved snapshot.
 */
export function compareSnapshot(
  name: string,
  actualState: Record<string, unknown>
): SnapshotResult {
  ensureDirectories();
  const snapshotPath = getSnapshotPath(name);
  const actualHash = hashState(actualState);

  if (!fs.existsSync(snapshotPath)) {
    return {
      name,
      matched: false,
      diffs: [],
      expectedHash: '',
      actualHash,
      isNewSnapshot: true,
    };
  }

  const expectedState = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  const expectedHash = hashState(expectedState);
  const diffs = compareStates(expectedState, actualState);

  return {
    name,
    matched: diffs.length === 0,
    diffs,
    expectedHash,
    actualHash,
    isNewSnapshot: false,
  };
}

/**
 * Save a snapshot (only if safe criteria are met or forced).
 */
export function saveSnapshot(
  name: string,
  state: Record<string, unknown>,
  options: { force?: boolean; dryRun?: boolean } = {}
): { saved: boolean; path: string; reason?: string } {
  ensureDirectories();
  const snapshotPath = getSnapshotPath(name);
  const comparison = compareSnapshot(name, state);

  // New snapshots can always be saved
  if (comparison.isNewSnapshot) {
    if (!options.dryRun) {
      fs.writeFileSync(snapshotPath, JSON.stringify(state, null, 2));
    }
    return { saved: true, path: snapshotPath };
  }

  // Check for unsafe diffs
  const unsafeDiffs = comparison.diffs.filter((d) => !d.isSafe);

  if (unsafeDiffs.length > 0 && !options.force) {
    return {
      saved: false,
      path: snapshotPath,
      reason: `Unsafe diffs detected: ${unsafeDiffs.map((d) => d.field).join(', ')}`,
    };
  }

  if (!options.dryRun) {
    fs.writeFileSync(snapshotPath, JSON.stringify(state, null, 2));
  }
  return { saved: true, path: snapshotPath };
}

/**
 * Load a fixture file.
 */
export function loadFixture<T>(name: string): T | null {
  ensureDirectories();
  const fixturePath = getFixturePath(name);

  if (!fs.existsSync(fixturePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

/**
 * Save a fixture file.
 */
export function saveFixture(name: string, data: unknown): string {
  ensureDirectories();
  const fixturePath = getFixturePath(name);
  fs.writeFileSync(fixturePath, JSON.stringify(data, null, 2));
  return fixturePath;
}

/**
 * Format snapshot result for test output.
 */
export function formatSnapshotReport(result: SnapshotResult): string {
  const lines: string[] = [];

  lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Snapshot: ${result.name}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (result.isNewSnapshot) {
    lines.push(`Status: NEW SNAPSHOT`);
    lines.push(`Hash: ${result.actualHash}`);
    lines.push(`\nThis is a new snapshot. Run with --updateSnapshot to save.`);
  } else if (result.matched) {
    lines.push(`Status: ✅ MATCHED`);
    lines.push(`Hash: ${result.expectedHash}`);
  } else {
    const unsafeDiffs = result.diffs.filter((d) => !d.isSafe);
    const safeDiffs = result.diffs.filter((d) => d.isSafe);

    if (unsafeDiffs.length > 0) {
      lines.push(`Status: ❌ UNSAFE DIFFS DETECTED`);
    } else {
      lines.push(`Status: ⚠️  SAFE DIFFS DETECTED`);
    }

    lines.push(`Expected Hash: ${result.expectedHash}`);
    lines.push(`Actual Hash: ${result.actualHash}`);

    if (unsafeDiffs.length > 0) {
      lines.push(`\n🚨 Unsafe Changes (require review):`);
      for (const diff of unsafeDiffs) {
        lines.push(`  - ${diff.field}: ${JSON.stringify(diff.expected)} → ${JSON.stringify(diff.actual)}`);
        lines.push(`    Reason: ${diff.reason}`);
      }
    }

    if (safeDiffs.length > 0) {
      lines.push(`\n✓ Safe Changes (metadata only):`);
      for (const diff of safeDiffs) {
        lines.push(`  - ${diff.field}: ${JSON.stringify(diff.expected)} → ${JSON.stringify(diff.actual)}`);
      }
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  return lines.join('\n');
}

/**
 * Jest-compatible snapshot assertion.
 * Throws if snapshot doesn't match and has unsafe diffs.
 */
export function assertSnapshot(
  name: string,
  actualState: Record<string, unknown>
): void {
  const result = compareSnapshot(name, actualState);
  const report = formatSnapshotReport(result);
  const shouldUpdate = isUpdateSnapshotEnabled();
  const shouldForce = isForceSnapshotEnabled();

  if (result.isNewSnapshot) {
    if (shouldUpdate || shouldForce) {
      console.warn(report);
      const saveResult = saveSnapshot(name, actualState, { force: shouldForce });
      if (!saveResult.saved) {
        throw new Error(
          `Snapshot update blocked:\n${report}\n` +
            `Reason: ${saveResult.reason ?? 'Unknown error'}`
        );
      }
      return;
    }

    throw new Error(
      `Snapshot missing:\n${report}\n` + `Run with --updateSnapshot to save.`
    );
  }

  if (!result.matched) {
    const unsafeDiffs = result.diffs.filter((d) => !d.isSafe);

    if (shouldUpdate || shouldForce) {
      console.warn(report);
      const saveResult = saveSnapshot(name, actualState, { force: shouldForce });
      if (!saveResult.saved) {
        throw new Error(
          `Snapshot update blocked:\n${report}\n` +
            `Reason: ${saveResult.reason ?? 'Unknown error'}`
        );
      }
      return;
    }

    if (unsafeDiffs.length > 0) {
      throw new Error(
        `Snapshot mismatch with unsafe diffs:\n${report}\n` +
          `To update, fix the code or run with FORCE_SNAPSHOT=1`
      );
    }

    // Safe diffs only - log warning but don't fail
    console.warn(report);
  }
}
