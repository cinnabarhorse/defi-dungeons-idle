import { isTierEligible, normalizeTierId } from '../data/difficulty-tiers';
import type { TopupRecord } from '../types/topup';

/**
 * Sum the amount of USDC/GHO staked from deposits
 */
export function calculateStakedUsdc(deposits: TopupRecord[]): number {
  return deposits
    .filter(
      (deposit) =>
        (deposit.token === 'USDC' || deposit.token === 'GHO') &&
        deposit.status === 'credited' &&
        !deposit.withdrawn
    )
    .reduce((total, deposit) => total + deposit.amount, 0);
}

/**
 * Get or create player's difficulty progress from the in-memory cache
 */
export interface DifficultyProgress {
  selectedTier: string;
  stakedUsdcBalance: number;
  lastUpdated: number;
}

let inMemoryDifficultyProgress: DifficultyProgress = {
  selectedTier: 'normal',
  stakedUsdcBalance: 0,
  lastUpdated: Date.now(),
};

export function getDifficultyProgress(): DifficultyProgress {
  return { ...inMemoryDifficultyProgress };
}

export function saveDifficultyProgress(progress: DifficultyProgress): void {
  inMemoryDifficultyProgress = {
    ...progress,
    lastUpdated: Date.now(),
  };
}

export function updateDifficultyProgress(
  deposits: TopupRecord[],
  selectedTier?: string
): DifficultyProgress {
  const currentStakedUsdc = calculateStakedUsdc(deposits);
  const progress = getDifficultyProgress();

  const normalizedSelected = normalizeTierId(
    selectedTier ?? progress.selectedTier
  );

  const updatedProgress: DifficultyProgress = {
    ...progress,
    stakedUsdcBalance: currentStakedUsdc,
  };

  updatedProgress.selectedTier = isTierEligible(
    normalizedSelected,
    currentStakedUsdc
  )
    ? normalizedSelected
    : 'normal';

  saveDifficultyProgress(updatedProgress);
  return updatedProgress;
}
