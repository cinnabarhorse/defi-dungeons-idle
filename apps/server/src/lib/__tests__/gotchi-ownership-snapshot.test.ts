jest.mock('../gotchi-snapshot', () => ({
  getTodaySnapshotBlockOrNull: jest.fn(),
}));

jest.mock('../aavegotchi', () => ({
  verifyGotchiOwnershipAtBlock: jest.fn(),
}));

import { verifyGotchiOwnershipAtBlock } from '../aavegotchi';
import { getTodaySnapshotBlockOrNull } from '../gotchi-snapshot';
import {
  assertGotchiOwnershipForTodaySnapshot,
  verifyGotchiOwnershipForTodaySnapshot,
} from '../gotchi-ownership-snapshot';

describe('gotchi ownership snapshot helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns snapshotMissing when no daily snapshot block exists', async () => {
    (getTodaySnapshotBlockOrNull as jest.Mock).mockResolvedValue(null);

    const result = await verifyGotchiOwnershipForTodaySnapshot('0xabc', '6741');

    expect(result).toEqual({
      owned: false,
      slugs: [],
      assignments: [],
      blockNumber: null,
      snapshotMissing: true,
    });
    expect(verifyGotchiOwnershipAtBlock).not.toHaveBeenCalled();
  });

  it('assert helper rejects join when gotchi is not owned at snapshot block', async () => {
    (getTodaySnapshotBlockOrNull as jest.Mock).mockResolvedValue(1234);
    (verifyGotchiOwnershipAtBlock as jest.Mock).mockResolvedValue({
      owned: false,
      slugs: [],
      assignments: [],
    });

    await expect(
      assertGotchiOwnershipForTodaySnapshot('0xabc', '6741')
    ).rejects.toThrow('Unauthorized: gotchi not owned by session wallet');
  });

  it('assert helper accepts join when gotchi is owned at snapshot block', async () => {
    (getTodaySnapshotBlockOrNull as jest.Mock).mockResolvedValue(1234);
    (verifyGotchiOwnershipAtBlock as jest.Mock).mockResolvedValue({
      owned: true,
      slugs: ['basic-gentleman-hat'],
      assignments: [{ slot: 'head', slug: 'basic-gentleman-hat' }],
    });

    const result = await assertGotchiOwnershipForTodaySnapshot('0xabc', '6741');

    expect(result).toEqual({
      owned: true,
      slugs: ['basic-gentleman-hat'],
      assignments: [{ slot: 'head', slug: 'basic-gentleman-hat' }],
      blockNumber: 1234,
      snapshotMissing: false,
    });
  });
});
