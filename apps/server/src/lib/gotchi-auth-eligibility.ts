import { hasAnyGotchiAtBlock } from './aavegotchi';
import { verifyWalletOwnsAnyAavegotchi } from './auth/gotchi-ownership';
import { getTodaySnapshotOrCapture, getTodayUtcDateString } from './gotchi-snapshot';

export function buildSnapshotMissingError(date: string) {
  return {
    error: 'Daily gotchi ownership snapshot missing',
    code: 'SNAPSHOT_MISSING',
    date,
  };
}

export function buildSnapshotVerificationUnavailableError(date: string) {
  return {
    error: 'Unable to verify gotchi ownership at snapshot block',
    code: 'SNAPSHOT_VERIFICATION_UNAVAILABLE',
    date,
  };
}

export interface WalletPlayEligibility {
  canPlayToday: boolean;
  code: string | null;
  error: string | null;
  snapshotDate: string;
  blockNumber: number | null;
  acquiredAfterSnapshot: boolean;
  resetAtUtc: string | null;
}

function getNextUtcMidnightIso(date: string): string | null {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(nextDate.getTime())) {
    return null;
  }
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString();
}

type WalletEligibilityAllowed = {
  ok: true;
  snapshotDate: string;
  blockNumber: number;
};

type WalletEligibilityRejected = {
  ok: false;
  status: 403 | 503;
  body: Record<string, unknown>;
  snapshotDate: string;
  blockNumber: number | null;
};

export type WalletEligibilityResult =
  | WalletEligibilityAllowed
  | WalletEligibilityRejected;

export async function evaluateWalletEligibilityAtTodaySnapshot(
  walletAddress: string
): Promise<WalletEligibilityResult> {
  const snapshotDate = getTodayUtcDateString();
  const snapshot = await getTodaySnapshotOrCapture();

  if (!snapshot) {
    return {
      ok: false,
      status: 503,
      body: buildSnapshotMissingError(snapshotDate),
      snapshotDate,
      blockNumber: null,
    };
  }

  let hasAnyGotchi = false;
  try {
    hasAnyGotchi = await hasAnyGotchiAtBlock(walletAddress, snapshot.blockNumber);
  } catch (error) {
    console.warn('[gotchi-auth] snapshot verification unavailable', {
      walletAddress,
      snapshotDate,
      blockNumber: snapshot.blockNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      status: 503,
      body: buildSnapshotVerificationUnavailableError(snapshotDate),
      snapshotDate,
      blockNumber: snapshot.blockNumber,
    };
  }

  if (!hasAnyGotchi) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'Wallet is not eligible for today',
        code: 'WALLET_NOT_ELIGIBLE',
        date: snapshotDate,
        blockNumber: snapshot.blockNumber,
      },
      snapshotDate,
      blockNumber: snapshot.blockNumber,
    };
  }

  return {
    ok: true,
    snapshotDate,
    blockNumber: snapshot.blockNumber,
  };
}

export async function getWalletPlayEligibilityAtTodaySnapshot(
  walletAddress: string
): Promise<WalletPlayEligibility> {
  try {
    const result = await evaluateWalletEligibilityAtTodaySnapshot(walletAddress);
    if (result.ok) {
      return {
        canPlayToday: true,
        code: null,
        error: null,
        snapshotDate: result.snapshotDate,
        blockNumber: result.blockNumber,
        acquiredAfterSnapshot: false,
        resetAtUtc: null,
      };
    }

    let acquiredAfterSnapshot = false;
    if (result.body.code === 'WALLET_NOT_ELIGIBLE') {
      try {
        const currentOwnership = await verifyWalletOwnsAnyAavegotchi(walletAddress);
        acquiredAfterSnapshot =
          currentOwnership.owned === true && currentOwnership.unavailable === false;
      } catch (error) {
        console.warn('[gotchi-auth] failed to verify live ownership fallback', {
          walletAddress,
          snapshotDate: result.snapshotDate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      canPlayToday: false,
      code:
        typeof result.body.code === 'string' && result.body.code.trim().length > 0
          ? result.body.code
          : null,
      error:
        typeof result.body.error === 'string' && result.body.error.trim().length > 0
          ? result.body.error
          : null,
      snapshotDate: result.snapshotDate,
      blockNumber: result.blockNumber,
      acquiredAfterSnapshot,
      resetAtUtc: acquiredAfterSnapshot
        ? getNextUtcMidnightIso(result.snapshotDate)
        : null,
    };
  } catch (error) {
    const snapshotDate = getTodayUtcDateString();
    console.warn('[gotchi-auth] failed to resolve play eligibility', {
      walletAddress,
      snapshotDate,
      error: error instanceof Error ? error.message : String(error),
    });
    const unavailable = buildSnapshotVerificationUnavailableError(snapshotDate);
    return {
      canPlayToday: false,
      code: unavailable.code,
      error: unavailable.error,
      snapshotDate,
      blockNumber: null,
      acquiredAfterSnapshot: false,
      resetAtUtc: null,
    };
  }
}

export async function assertWalletCanPlayTodaySnapshot(walletAddress: string) {
  const eligibility = await getWalletPlayEligibilityAtTodaySnapshot(walletAddress);
  if (!eligibility.canPlayToday) {
    throw new Error(eligibility.error || 'Not authorized to play today');
  }
  return eligibility;
}
