import { verifyGotchiOwnershipAtBlock } from './aavegotchi';
import { getTodaySnapshotBlockOrNull } from './gotchi-snapshot';

type GotchiOwnershipAtBlock = Awaited<
  ReturnType<typeof verifyGotchiOwnershipAtBlock>
>;

export interface SnapshotGotchiOwnershipResult extends GotchiOwnershipAtBlock {
  blockNumber: number | null;
  snapshotMissing: boolean;
}

export async function verifyGotchiOwnershipForTodaySnapshot(
  ownerAddress: string,
  gotchiId: string
): Promise<SnapshotGotchiOwnershipResult> {
  const blockNumber = await getTodaySnapshotBlockOrNull();
  if (!blockNumber) {
    return {
      owned: false,
      slugs: [],
      assignments: [],
      blockNumber: null,
      snapshotMissing: true,
    };
  }

  const ownership = await verifyGotchiOwnershipAtBlock(
    ownerAddress,
    gotchiId,
    blockNumber
  );

  return {
    ...ownership,
    blockNumber,
    snapshotMissing: false,
  };
}

export async function assertGotchiOwnershipForTodaySnapshot(
  ownerAddress: string,
  gotchiId: string
) {
  const result = await verifyGotchiOwnershipForTodaySnapshot(
    ownerAddress,
    gotchiId
  );

  if (result.snapshotMissing) {
    throw new Error('Daily gotchi ownership snapshot missing');
  }
  if (!result.owned) {
    throw new Error('Unauthorized: gotchi not owned by session wallet');
  }

  return result;
}
