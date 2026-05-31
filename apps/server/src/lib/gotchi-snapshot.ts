import { gotchiSnapshotsRepo } from './db';
import type { DailyGotchiOwnershipSnapshotRecord } from './db/types';

const inFlightSnapshotCaptures = new Map<
  string,
  Promise<DailyGotchiOwnershipSnapshotRecord | null>
>();

export function getTodayUtcDateString(nowMs: number = Date.now()): string {
  const now = new Date(nowMs);
  return now.toISOString().slice(0, 10);
}

export async function getSnapshotForDateOrCapture(
  snapshotDate: string
): Promise<DailyGotchiOwnershipSnapshotRecord | null> {
  const existing = await gotchiSnapshotsRepo.getByDate(snapshotDate);
  if (existing) {
    return existing;
  }

  const inFlight = inFlightSnapshotCaptures.get(snapshotDate);
  if (inFlight) {
    return inFlight;
  }

  const capturePromise = (async () => {
    try {
      console.warn('[gotchi-snapshot] Missing daily snapshot, capturing on demand', {
        snapshotDate,
      });

      const { captureDailyGotchiSnapshot } = await import(
        '../jobs/capture-daily-gotchi-snapshot'
      );
      const result = await captureDailyGotchiSnapshot({ date: snapshotDate });
      const captured = await gotchiSnapshotsRepo.getByDate(snapshotDate);

      if (captured) {
        return captured;
      }

      return {
        snapshotDate: result.date,
        blockNumber: result.blockNumber,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn('[gotchi-snapshot] On-demand snapshot capture failed', {
        snapshotDate,
        error: error instanceof Error ? error.message : String(error),
      });

      const fallback = await gotchiSnapshotsRepo.getLatestOnOrBeforeDate(
        snapshotDate
      );
      if (fallback && fallback.snapshotDate !== snapshotDate) {
        console.warn(
          '[gotchi-snapshot] Falling back to the latest prior snapshot',
          {
            requestedSnapshotDate: snapshotDate,
            fallbackSnapshotDate: fallback.snapshotDate,
            fallbackBlockNumber: fallback.blockNumber,
          }
        );
      }
      return fallback;
    } finally {
      inFlightSnapshotCaptures.delete(snapshotDate);
    }
  })();

  inFlightSnapshotCaptures.set(snapshotDate, capturePromise);
  return capturePromise;
}

export async function getTodaySnapshotOrCapture(nowMs: number = Date.now()) {
  const date = getTodayUtcDateString(nowMs);
  return getSnapshotForDateOrCapture(date);
}

export async function getTodaySnapshotBlockOrNull(nowMs: number = Date.now()) {
  const snapshot = await getTodaySnapshotOrCapture(nowMs);
  if (!snapshot) {
    return null;
  }
  return snapshot.blockNumber;
}
