import { DIFFICULTY_TIER_SEQUENCE, DIFFICULTY_TIERS } from '../data/difficulty-tiers';
import { GAME_CONFIG } from '../data/game-config';

export interface UpgradeTierViewModel {
  totalStaked: number;
  currentTierNumber: number;
  currentDifficultyId: string;
  currentDifficultyName: string;
  currentStakeThreshold: number;
  currentRunsPerDay: number;
  chestsEnabled: boolean;
  chestUnlockStakeAmount: number | null;
  nextTierNumber: number | null;
  nextDifficultyId: string | null;
  nextDifficultyName: string | null;
  nextStakeThreshold: number | null;
  nextRunsPerDay: number | null;
  progressCurrent: number;
  progressTarget: number;
  progressRatio: number;
  stakeDeltaToNext: number;
}

export interface UpgradeTierConfig {
  tierNumber: number;
  difficultyId: string;
  difficultyName: string;
  stakeThreshold: number;
  runsPerDay: number;
}

export interface UpgradeTierStakeSnapshot {
  totalStaked?: number | null;
  usdcStaked?: number | null;
  ghoStaked?: number | null;
}

interface ResolveUpgradeTierStakeTotalInput {
  progressionTotalStaked?: number | null;
  dailyRuns?: UpgradeTierStakeSnapshot | null;
  exhausted?: UpgradeTierStakeSnapshot | null;
}

const CHEST_UNLOCK_STAKE_THRESHOLD = 1;

function normalizeStakeAmount(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function resolveStakeFromSnapshot(
  snapshot: UpgradeTierStakeSnapshot | null | undefined
): number | null {
  if (!snapshot) return null;
  const total = normalizeStakeAmount(snapshot.totalStaked);
  if (total != null) return total;

  const usdc = normalizeStakeAmount(snapshot.usdcStaked);
  const gho = normalizeStakeAmount(snapshot.ghoStaked);
  if (usdc == null && gho == null) return null;
  return (usdc ?? 0) + (gho ?? 0);
}

export function resolveUpgradeTierStakeTotal({
  progressionTotalStaked,
  dailyRuns,
  exhausted,
}: ResolveUpgradeTierStakeTotalInput): number {
  const progression = normalizeStakeAmount(progressionTotalStaked);
  const fromDailyRuns = resolveStakeFromSnapshot(dailyRuns);
  const fromExhausted = resolveStakeFromSnapshot(exhausted);
  const candidates = [progression, fromDailyRuns, fromExhausted].filter(
    (value): value is number => value != null
  );
  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
}

export function getChestUnlockStakeAmount(
  totalStakedInput: number
): number | null {
  const totalStaked = Math.max(0, Math.floor(totalStakedInput || 0));
  if (totalStaked >= CHEST_UNLOCK_STAKE_THRESHOLD) return null;
  return CHEST_UNLOCK_STAKE_THRESHOLD;
}

function resolveRunsPerDay(
  tiers: Array<{ usdcStakedGte: number; dailyRuns: number }>,
  stakeThreshold: number
): number {
  const sorted = [...tiers].sort((a, b) => a.usdcStakedGte - b.usdcStakedGte);
  const exact = sorted.find((tier) => tier.usdcStakedGte === stakeThreshold);
  if (exact) return exact.dailyRuns;
  const fallback = sorted.reduce<{ usdcStakedGte: number; dailyRuns: number } | null>(
    (acc, tier) => {
      if (tier.usdcStakedGte <= stakeThreshold) return tier;
      return acc;
    },
    null
  );
  return fallback?.dailyRuns ?? 0;
}

export function getUpgradeTierConfigs(): UpgradeTierConfig[] {
  const dailyRunsTiers = GAME_CONFIG.dailyRuns.tiers;
  const baseTiers = DIFFICULTY_TIER_SEQUENCE.map((tierId) => {
    const difficulty = DIFFICULTY_TIERS[tierId];
    return {
      tierNumber: 0,
      difficultyId: difficulty.id,
      difficultyName: difficulty.name,
      stakeThreshold: difficulty.usdcStakedRequired,
      runsPerDay: resolveRunsPerDay(dailyRunsTiers, difficulty.usdcStakedRequired),
    };
  });

  const tiers = [...baseTiers];
  if (
    CHEST_UNLOCK_STAKE_THRESHOLD > 0 &&
    !tiers.some((tier) => tier.stakeThreshold === CHEST_UNLOCK_STAKE_THRESHOLD)
  ) {
    const baseDifficulty = DIFFICULTY_TIERS[DIFFICULTY_TIER_SEQUENCE[0]];
    tiers.push({
      tierNumber: 0,
      difficultyId: baseDifficulty.id,
      difficultyName: baseDifficulty.name,
      stakeThreshold: CHEST_UNLOCK_STAKE_THRESHOLD,
      runsPerDay: resolveRunsPerDay(dailyRunsTiers, CHEST_UNLOCK_STAKE_THRESHOLD),
    });
  }

  return tiers
    .sort((a, b) => a.stakeThreshold - b.stakeThreshold)
    .map((tier, index) => ({
      ...tier,
      tierNumber: index + 1,
    }));
}

export function buildUpgradeTierViewModel(
  totalStakedInput: number
): UpgradeTierViewModel {
  const totalStaked = Math.max(0, Math.floor(totalStakedInput || 0));
  const tiers = getUpgradeTierConfigs();
  const fallbackTier = tiers[0];
  const currentTier =
    tiers.reduce<UpgradeTierConfig | null>((acc, tier) => {
      if (totalStaked >= tier.stakeThreshold) return tier;
      return acc;
    }, null) ?? fallbackTier;
  const nextTier =
    tiers.find((tier) => tier.stakeThreshold > totalStaked) ?? null;
  const progressTarget = nextTier?.stakeThreshold ?? currentTier.stakeThreshold;
  const progressCurrent = nextTier
    ? Math.min(totalStaked, progressTarget)
    : progressTarget;
  const progressRatio =
    progressTarget > 0
      ? Math.min(1, Math.max(0, progressCurrent / progressTarget))
      : 1;
  const chestUnlockStakeAmount = getChestUnlockStakeAmount(totalStaked);

  return {
    totalStaked,
    currentTierNumber: currentTier?.tierNumber ?? 1,
    currentDifficultyId: currentTier?.difficultyId ?? 'normal',
    currentDifficultyName: currentTier?.difficultyName ?? 'Normal',
    currentStakeThreshold: currentTier?.stakeThreshold ?? 0,
    currentRunsPerDay: currentTier?.runsPerDay ?? 0,
    chestsEnabled: totalStaked >= CHEST_UNLOCK_STAKE_THRESHOLD,
    chestUnlockStakeAmount,
    nextTierNumber: nextTier?.tierNumber ?? null,
    nextDifficultyId: nextTier?.difficultyId ?? null,
    nextDifficultyName: nextTier?.difficultyName ?? null,
    nextStakeThreshold: nextTier?.stakeThreshold ?? null,
    nextRunsPerDay: nextTier?.runsPerDay ?? null,
    progressCurrent,
    progressTarget,
    progressRatio,
    stakeDeltaToNext: nextTier
      ? Math.max(0, nextTier.stakeThreshold - totalStaked)
      : 0,
  };
}
