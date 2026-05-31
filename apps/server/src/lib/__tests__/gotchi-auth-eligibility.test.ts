jest.mock('../aavegotchi', () => ({
  hasAnyGotchiAtBlock: jest.fn(),
}));

jest.mock('../auth/gotchi-ownership', () => ({
  verifyWalletOwnsAnyAavegotchi: jest.fn(),
}));

jest.mock('../gotchi-snapshot', () => ({
  getTodayUtcDateString: jest.fn(() => '2026-02-18'),
  getTodaySnapshotOrCapture: jest.fn(),
}));

import { hasAnyGotchiAtBlock } from '../aavegotchi';
import { verifyWalletOwnsAnyAavegotchi } from '../auth/gotchi-ownership';
import { getTodaySnapshotOrCapture } from '../gotchi-snapshot';
import {
  assertWalletCanPlayTodaySnapshot,
  buildSnapshotMissingError,
  buildSnapshotVerificationUnavailableError,
  evaluateWalletEligibilityAtTodaySnapshot,
  getWalletPlayEligibilityAtTodaySnapshot,
} from '../gotchi-auth-eligibility';

describe('gotchi auth eligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue(null);
    (verifyWalletOwnsAnyAavegotchi as jest.Mock).mockResolvedValue({
      owned: false,
      unavailable: false,
      source: 'subgraph',
      reason: 'subgraph_not_owned',
    });
  });

  it('returns snapshot-missing rejection when daily snapshot is absent', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue(null);

    const result = await evaluateWalletEligibilityAtTodaySnapshot('0xabc');

    expect(result).toEqual({
      ok: false,
      status: 503,
      body: buildSnapshotMissingError('2026-02-18'),
      snapshotDate: '2026-02-18',
      blockNumber: null,
    });
    expect(hasAnyGotchiAtBlock).not.toHaveBeenCalled();
  });

  it('returns wallet-ineligible rejection when wallet owns zero gotchis at snapshot block', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (hasAnyGotchiAtBlock as jest.Mock).mockResolvedValue(false);

    const result = await evaluateWalletEligibilityAtTodaySnapshot('0xabc');

    expect(result).toEqual({
      ok: false,
      status: 403,
      body: {
        error: 'Wallet is not eligible for today',
        code: 'WALLET_NOT_ELIGIBLE',
        date: '2026-02-18',
        blockNumber: 789,
      },
      snapshotDate: '2026-02-18',
      blockNumber: 789,
    });
  });

  it('returns unavailable rejection when ownership verification fails at snapshot block', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (hasAnyGotchiAtBlock as jest.Mock).mockRejectedValue(
      new Error('subgraph down')
    );

    const result = await evaluateWalletEligibilityAtTodaySnapshot('0xabc');

    expect(result).toEqual({
      ok: false,
      status: 503,
      body: buildSnapshotVerificationUnavailableError('2026-02-18'),
      snapshotDate: '2026-02-18',
      blockNumber: 789,
    });
  });

  it('returns eligible when wallet has at least one gotchi at snapshot block', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (hasAnyGotchiAtBlock as jest.Mock).mockResolvedValue(true);

    const result = await evaluateWalletEligibilityAtTodaySnapshot('0xabc');

    expect(result).toEqual({
      ok: true,
      snapshotDate: '2026-02-18',
      blockNumber: 789,
    });
  });

  it('maps ineligible wallets to play-disabled state without throwing', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (hasAnyGotchiAtBlock as jest.Mock).mockResolvedValue(false);

    const result = await getWalletPlayEligibilityAtTodaySnapshot('0xabc');

    expect(result).toEqual({
      canPlayToday: false,
      code: 'WALLET_NOT_ELIGIBLE',
      error: 'Wallet is not eligible for today',
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      acquiredAfterSnapshot: false,
      resetAtUtc: null,
    });
  });

  it('marks wallets as post-snapshot owners when they own a gotchi now but not at the snapshot block', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (hasAnyGotchiAtBlock as jest.Mock).mockResolvedValue(false);
    (verifyWalletOwnsAnyAavegotchi as jest.Mock).mockResolvedValue({
      owned: true,
      unavailable: false,
      source: 'subgraph',
      reason: 'subgraph_owned',
    });

    const result = await getWalletPlayEligibilityAtTodaySnapshot('0xabc');

    expect(result.canPlayToday).toBe(false);
    expect(result.code).toBe('WALLET_NOT_ELIGIBLE');
    expect(result.acquiredAfterSnapshot).toBe(true);
    expect(result.resetAtUtc).toBe('2026-02-19T00:00:00.000Z');
  });

  it('assert helper rejects when wallet cannot play today', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 789,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });
    (hasAnyGotchiAtBlock as jest.Mock).mockResolvedValue(false);

    await expect(
      assertWalletCanPlayTodaySnapshot('0xabc')
    ).rejects.toThrow('Wallet is not eligible for today');
  });

  it('falls back to unavailable play state on unexpected eligibility errors', async () => {
    (getTodaySnapshotOrCapture as jest.Mock).mockRejectedValue(
      new Error('db unavailable')
    );

    const result = await getWalletPlayEligibilityAtTodaySnapshot('0xabc');

    expect(result).toEqual({
      canPlayToday: false,
      code: 'SNAPSHOT_VERIFICATION_UNAVAILABLE',
      error: 'Unable to verify gotchi ownership at snapshot block',
      snapshotDate: '2026-02-18',
      blockNumber: null,
      acquiredAfterSnapshot: false,
      resetAtUtc: null,
    });
  });
});
