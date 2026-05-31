'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/Accordion';
import { TopupForm } from '../topup/topup-form';
import { TopupHistoryDialog } from '../topup/topup-history-dialog';
import { cn } from '../../lib/utils';
import { normalizeTierId } from '../../data/difficulty-tiers';
import type { UpgradeTierConfig, UpgradeTierViewModel } from '../../lib/upgrade-tier';
import { buildStakeQueryState } from '../../lib/topup/query';

export type UpgradeStakeCurrencyMode = 'USDC' | 'GHST';

export interface UpgradeTierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewModel: UpgradeTierViewModel;
  tiers: UpgradeTierConfig[];
  canStake: boolean;
  currencyMode: UpgradeStakeCurrencyMode;
  onCurrencyModeChange: (mode: UpgradeStakeCurrencyMode) => void;
  disabledReason?: string | null;
  ghstStaked?: number;
  initialSelectedStakeThreshold?: number | null;
}

export function UpgradeTierDialog({
  open,
  onOpenChange,
  viewModel,
  tiers,
  canStake,
  currencyMode,
  onCurrencyModeChange,
  disabledReason,
  ghstStaked = 0,
  initialSelectedStakeThreshold = null,
}: UpgradeTierDialogProps) {
  const [showTopupForm, setShowTopupForm] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
  const [topupFormNonce, setTopupFormNonce] = useState(0);
  const [selectedTierNumber, setSelectedTierNumber] = useState<number | null>(
    null
  );

  const isGhstMode = currencyMode === 'GHST';
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );
  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.stakeThreshold - b.stakeThreshold),
    [tiers]
  );
  const tierByNumber = useMemo(() => {
    return new Map(sortedTiers.map((tier) => [tier.tierNumber, tier]));
  }, [sortedTiers]);
  const tierNumberByStakeThreshold = useMemo(() => {
    const map = new Map<number, number>();
    sortedTiers.forEach((tier) => {
      map.set(tier.stakeThreshold, tier.tierNumber);
    });
    return map;
  }, [sortedTiers]);
  const ghstTierLabels = useMemo(() => {
    const positive = sortedTiers.filter((tier) => tier.stakeThreshold > 0);
    const map = new Map<number, string>();
    map.set(0, 'No GHST Staked');
    positive.forEach((tier, index) => {
      map.set(
        tier.stakeThreshold,
        `Tier ${index + 1} (${formatter.format(tier.stakeThreshold)} GHST)`
      );
    });
    return { map };
  }, [sortedTiers, formatter]);
  const normalizedGhstStaked = Number.isFinite(ghstStaked) ? ghstStaked : 0;
  const ghstTierStatus = useMemo(() => {
    if (sortedTiers.length === 0) {
      return {
        current: null,
        next: null,
        currentNumber: null,
        nextNumber: null,
      };
    }

    

    const current =
      sortedTiers.reduce<UpgradeTierConfig | null>((acc, tier) => {
        if (normalizedGhstStaked >= tier.stakeThreshold) return tier;
        return acc;
      }, null) ?? sortedTiers[0];
    const next =
      sortedTiers.find((tier) => tier.stakeThreshold > normalizedGhstStaked) ??
      null;
    return {
      current,
      next,
      currentNumber: current?.tierNumber ?? null,
      nextNumber: next?.tierNumber ?? null,
    };
  }, [sortedTiers, normalizedGhstStaked]);
  const effectiveCurrentTierNumber = isGhstMode
    ? ghstTierStatus.currentNumber ?? viewModel.currentTierNumber
    : viewModel.currentTierNumber;
  const effectiveNextTierNumber = isGhstMode
    ? ghstTierStatus.nextNumber ?? null
    : viewModel.nextTierNumber ?? null;
  const resolvedInitialTierNumber = useMemo(() => {
    if (initialSelectedStakeThreshold == null) return null;
    return tierNumberByStakeThreshold.get(initialSelectedStakeThreshold) ?? null;
  }, [initialSelectedStakeThreshold, tierNumberByStakeThreshold]);

  useEffect(() => {
    if (!open) {
      setShowTopupForm(false);
      setTopupAmount(null);
      setSelectedTierNumber(null);
      return;
    }
    setSelectedTierNumber(
      resolvedInitialTierNumber ??
        effectiveNextTierNumber ??
        effectiveCurrentTierNumber
    );
  }, [
    open,
    resolvedInitialTierNumber,
    effectiveNextTierNumber,
    effectiveCurrentTierNumber,
  ]);

  const resolvedSelectedTier = useMemo(() => {
    if (selectedTierNumber != null) {
      return tierByNumber.get(selectedTierNumber) ?? null;
    }
    if (effectiveNextTierNumber != null) {
      return tierByNumber.get(effectiveNextTierNumber) ?? null;
    }
    return tierByNumber.get(effectiveCurrentTierNumber) ?? null;
  }, [
    selectedTierNumber,
    tierByNumber,
    effectiveNextTierNumber,
    effectiveCurrentTierNumber,
  ]);

  const selectedTier = resolvedSelectedTier ?? sortedTiers[0];
  const isSelectedNext =
    selectedTier?.tierNumber === effectiveNextTierNumber;
  const selectedStakeThreshold = selectedTier?.stakeThreshold ?? 0;
  const selectedRunsPerDay =
    selectedTier?.runsPerDay ?? viewModel.currentRunsPerDay;
  const selectedDifficultyId =
    selectedTier?.difficultyId ?? viewModel.currentDifficultyId;
  const selectedDifficultyName =
    selectedTier?.difficultyName ?? viewModel.currentDifficultyName ?? 'Normal';
  const totalStaked =
    typeof viewModel.totalStaked === 'number'
      ? viewModel.totalStaked
      : viewModel.progressCurrent;
  const selectedStakeBaseline = isGhstMode
    ? normalizedGhstStaked
    : totalStaked;
  const selectedProgressTarget = selectedStakeThreshold;
  const selectedProgressCurrent =
    selectedProgressTarget > 0
      ? Math.min(selectedStakeBaseline, selectedProgressTarget)
      : selectedProgressTarget;
  const selectedProgressRatio =
    selectedProgressTarget > 0
      ? Math.min(1, Math.max(0, selectedProgressCurrent / selectedProgressTarget))
      : 1;
  const progressLabel =
    selectedProgressTarget > 0
      ? `${formatter.format(selectedProgressCurrent)} / ${formatter.format(
          selectedProgressTarget
        )}`
      : 'Free';
  const selectedStakeDelta = Math.max(
    0,
    selectedStakeThreshold - selectedStakeBaseline
  );
  const canTriggerStakeDelta = canStake && selectedStakeDelta > 0;
  const tierDisplayCurrencyLabel = isGhstMode ? 'GHST' : 'USDC/GHO';
  const stakeCurrencyLabel = isGhstMode ? 'GHST' : 'USDC/GHO';
  const chestAccessCurrencyLabel = 'USDC/GHO';
  const stakeAmountForTopup = selectedStakeDelta;

  const nextTierLabel =
    selectedStakeThreshold > 0
      ? formatStakeRequirement(
          selectedStakeThreshold,
          formatter,
          tierDisplayCurrencyLabel
        )
      : 'Free';

  const nextChestsEnabled = selectedStakeThreshold >= 1;
  const usdcRewardsEnabled = totalStaked >= 1;
  const selectedUsdcRewardsEnabled = selectedStakeThreshold >= 1;

  const showRunsPerDayPerk =
    typeof selectedRunsPerDay === 'number' &&
    selectedRunsPerDay !== viewModel.currentRunsPerDay;
  const showDifficultyPerk =
    Boolean(selectedDifficultyId) &&
    selectedDifficultyId !== viewModel.currentDifficultyId;

  const stakeLabel =
    selectedStakeDelta > 0
      ? isGhstMode
        ? `Stake ${formatter.format(selectedStakeDelta)} ${stakeCurrencyLabel}`
        : `Stake +${formatter.format(selectedStakeDelta)} ${stakeCurrencyLabel}`
      : 'Already unlocked';
  const displayCurrentTier = isGhstMode
    ? ghstTierStatus.current ?? null
    : tierByNumber.get(viewModel.currentTierNumber) ?? null;
  const availableUpgradesCountUsdc = useMemo(() => {
    if (sortedTiers.length === 0) return 0;
    return sortedTiers.filter((tier) => tier.stakeThreshold > totalStaked)
      .length;
  }, [sortedTiers, totalStaked]);
  const availableUpgradesCountGhst = useMemo(() => {
    if (sortedTiers.length === 0) return 0;
    return sortedTiers.filter(
      (tier) => tier.stakeThreshold > normalizedGhstStaked
    ).length;
  }, [sortedTiers, normalizedGhstStaked]);
  const displayCurrentTierNumber =
    displayCurrentTier?.tierNumber ?? viewModel.currentTierNumber;
  const displayCurrentDifficultyId =
    displayCurrentTier?.difficultyId ?? viewModel.currentDifficultyId;
  const displayCurrentDifficultyName =
    displayCurrentTier?.difficultyName ?? viewModel.currentDifficultyName;
  const displayCurrentStakeThreshold = isGhstMode
    ? displayCurrentTier?.stakeThreshold ?? 0
    : viewModel.currentStakeThreshold;
  const currentTierTone = getTierTone(displayCurrentDifficultyId);
  const currentGhstRewardsLabel =
    displayCurrentStakeThreshold >= 1
      ? `$GHST Rewards for ${displayCurrentDifficultyName ?? 'Normal'} Difficulty`
      : 'No $GHST Rewards';
  const currentGhstTierLabel =
    ghstTierLabels.map.get(displayCurrentStakeThreshold) ?? 'No GHST Staked';
  const useNeutralCurrentTierTone = !isGhstMode && !usdcRewardsEnabled;
  const currentTierToneForCard = useNeutralCurrentTierTone
    ? FALLBACK_TIER_TONE
    : currentTierTone;
  const currentDifficultyTextClass = isGhstMode
    ? 'text-white/70'
    : currentTierToneForCard.text;
  const nextTierTone = getTierTone(selectedDifficultyId);

  const syncUrlForCurrencyMode = useCallback(
    (mode: UpgradeStakeCurrencyMode) => {
      if (typeof window === 'undefined') return;

      const query = buildStakeQueryState({
        mode,
        selectedStakeThreshold,
        normalizedGhstStaked,
        totalStaked,
      });
      const url = new URL(window.location.href);
      url.searchParams.set('token', query.token);
      if (query.amount) {
        url.searchParams.set('amount', query.amount);
      } else {
        url.searchParams.delete('amount');
      }
      window.history.replaceState(window.history.state, '', url.toString());
    },
    [
      normalizedGhstStaked,
      totalStaked,
      selectedStakeThreshold,
    ]
  );

  const handleOpenTopup = (amount: number) => {
    syncUrlForCurrencyMode(currencyMode);
    setTopupAmount(amount);
    setShowTopupForm(true);
    setTopupFormNonce((current) => current + 1);
  };

  useEffect(() => {
    if (!open) return;
    syncUrlForCurrencyMode(currencyMode);
  }, [open, currencyMode, syncUrlForCurrencyMode]);

  const handleCurrencyTabChange = useCallback(
    (mode: UpgradeStakeCurrencyMode) => {
      syncUrlForCurrencyMode(mode);
      if (mode === currencyMode) return;
      onCurrencyModeChange(mode);
    },
    [
      currencyMode,
      onCurrencyModeChange,
      syncUrlForCurrencyMode,
    ]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ top: '50%', bottom: 'auto' }}
        className="max-w-xl"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3">
          <div className="space-y-2">
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-emerald-300" />
              Upgrades
            </DialogTitle>

            <div
              className="inline-flex rounded-md border border-white/10 bg-black/30 p-1"
              role="tablist"
              aria-label="Stake currency"
            >
              <button
                type="button"
                role="tab"
                aria-selected={currencyMode === 'USDC'}
                onClick={() => handleCurrencyTabChange('USDC')}
                className={cn(
                  'px-3 py-1 text-xs rounded-sm transition',
                  currencyMode === 'USDC'
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white'
                )}
              >
                USDC/GHO ({availableUpgradesCountUsdc})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={currencyMode === 'GHST'}
                onClick={() => handleCurrencyTabChange('GHST')}
                className={cn(
                  'px-3 py-1 text-xs rounded-sm transition',
                  currencyMode === 'GHST'
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white'
                )}
              >
                GHST ({availableUpgradesCountGhst})
              </button>
            </div>
          </div>

          <TopupHistoryDialog />
        </DialogHeader>

        <div className="space-y-4 text-sm text-white/80">
          <section
            className={cn(
              'rounded-lg border p-4',
              isGhstMode
                ? 'border-white/10 bg-white/5'
                : currentTierToneForCard.border,
              isGhstMode ? '' : currentTierToneForCard.bg
            )}
            data-testid="current-tier"
          >
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Current
            </p>
            <div className="text-base font-semibold text-white">
              {isGhstMode ? (
                <span className="font-semibold text-white">
                  {currentGhstTierLabel}
                </span>
              ) : (
                <>
                  Tier {displayCurrentTierNumber} (
                  <span
                    className={cn('font-semibold', currentDifficultyTextClass)}
                  >
                    {displayCurrentDifficultyName}
                  </span>
                  ){' '}
                  {formatStakeRequirement(
                    displayCurrentStakeThreshold,
                    formatter,
                    tierDisplayCurrencyLabel
                  )}
                </>
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs text-white/70">
              {isGhstMode ? (
                <>
                  <div>{currentGhstRewardsLabel}</div>
                </>
              ) : (
                <>
                  <div>
                    Runs/day: {viewModel.currentRunsPerDay} —{' '}
                    <span className={currentTierTone.text}>
                      {formatDifficultyUnlockLabel(
                        displayCurrentDifficultyName
                      )}
                    </span>
                  </div>
                  <div>Chests: {viewModel.chestsEnabled ? 'On' : 'Off'}</div>
                  <div>USDC Rewards: {usdcRewardsEnabled ? 'On' : 'Off'}</div>
                </>
              )}
            </div>
          </section>

          <section
            className={cn(
              'rounded-lg border p-4',
              nextTierTone.border,
              nextTierTone.bg
            )}
            data-testid="next-tier"
          >
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              {isSelectedNext ? 'Next upgrade' : 'Tier details'}
            </p>
            <div className="text-base font-semibold text-white">
              {selectedTier ? (
                isGhstMode ? (
                  <span className="font-semibold text-white">
                    {ghstTierLabels.map.get(selectedStakeThreshold) ??
                      'No GHST Staked'}
                  </span>
                ) : (
                  <>
                    Tier {selectedTier.tierNumber} (
                    <span className={cn('font-semibold', nextTierTone.text)}>
                      {selectedDifficultyName}
                    </span>
                    ){' '}
                    {nextTierLabel}
                  </>
                )
              ) : (
                'Max tier reached'
              )}
            </div>

            <div className="mt-3 space-y-2" data-testid="progress">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>Progress: {progressLabel}</span>
                <span>{Math.round(selectedProgressRatio * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn('h-full', nextTierTone.progress)}
                  style={{ width: `${selectedProgressRatio * 100}%` }}
                />
              </div>
            </div>

            {selectedTier ? (
              <div className="mt-3 space-y-2 text-xs">
                <p className="font-semibold text-white">You will get:</p>
                <ul className="space-y-1">
                  {isGhstMode ? (
                    <PerkItem tone={nextTierTone}>
                      $GHST Rewards for {selectedDifficultyName} Difficulty
                    </PerkItem>
                  ) : (
                    <>
                      {showRunsPerDayPerk ? (
                        <PerkItem tone={nextTierTone}>
                          Runs/day: {selectedRunsPerDay}
                        </PerkItem>
                      ) : null}
                      {showDifficultyPerk ? (
                        <PerkItem tone={nextTierTone}>
                          {formatDifficultyUnlockLabel(selectedDifficultyName)}
                        </PerkItem>
                      ) : null}
                      <PerkItem tone={nextTierTone}>
                        Chests: {nextChestsEnabled ? 'On' : 'Off'}
                      </PerkItem>
                      <PerkItem tone={nextTierTone}>
                        USDC Rewards: {selectedUsdcRewardsEnabled ? 'On' : 'Off'}
                      </PerkItem>
                    </>
                  )}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/60">
                You&apos;re already at the highest tier.
              </p>
            )}

            <div className="mt-4 space-y-2">
              <Button
                type="button"
                className="w-full"
                onClick={() => handleOpenTopup(stakeAmountForTopup)}
                disabled={!canTriggerStakeDelta}
                data-testid="stake-delta-cta"
              >
                {stakeLabel}
              </Button>
              {!canStake && disabledReason ? (
                <p className="text-[11px] text-amber-200">{disabledReason}</p>
              ) : null}
            </div>

            <div
              className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs"
              data-testid="view-all-tiers"
            >
              <div
                className={cn(
                  'grid gap-2 text-[10px] text-white/60 uppercase tracking-wide',
                  isGhstMode ? 'grid-cols-3' : 'grid-cols-4'
                )}
              >
                <span>Stake</span>
                {isGhstMode ? (
                  <>
                    <span>Difficulty</span>
                    <span>Reward</span>
                  </>
                ) : (
                  <>
                    <span>Runs/day</span>
                    <span>Difficulty</span>
                    <span>Chests</span>
                  </>
                )}
              </div>
              <div className="mt-2 grid gap-2 max-h-44 overflow-y-auto pr-1">
                {sortedTiers.map((tier) => {
                  const isCurrent = tier.tierNumber === effectiveCurrentTierNumber;
                  const isNext = tier.tierNumber === effectiveNextTierNumber;
                  const isSelected = tier.tierNumber === selectedTier?.tierNumber;
                  const tierTone = getTierTone(tier.difficultyId);
                  const ghstRewardLabel =
                    tier.stakeThreshold >= 1 ? '$GHST Rewards' : 'No $GHST Rewards';
                  return (
                    <button
                      type="button"
                      key={tier.tierNumber}
                      onClick={() => setSelectedTierNumber(tier.tierNumber)}
                      className={cn(
                        'grid gap-2 items-center text-left rounded-md px-2 py-1.5 transition',
                        isGhstMode ? 'grid-cols-3' : 'grid-cols-4',
                        isSelected
                          ? 'bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-400/40'
                          : isCurrent
                            ? 'text-white font-semibold'
                            : isNext
                              ? 'text-emerald-200 font-semibold'
                              : 'text-white/70 hover:bg-white/5'
                      )}
                    >
                      <span>
                        {isGhstMode
                          ? ghstTierLabels.map.get(tier.stakeThreshold) ??
                            'No GHST Staked'
                          : formatStakeRequirement(
                              tier.stakeThreshold,
                              formatter,
                              tierDisplayCurrencyLabel
                            )}
                        {isNext ? ' (Next)' : ''}
                      </span>
                      {isGhstMode ? (
                        <>
                          <span className={cn('font-medium', tierTone.text)}>
                            {tier.difficultyName}
                          </span>
                          <span>{ghstRewardLabel}</span>
                        </>
                      ) : (
                        <>
                          <span>{tier.runsPerDay}</span>
                          <span className={cn('font-medium', tierTone.text)}>
                            {tier.difficultyName}
                          </span>
                          <span>{tier.stakeThreshold >= 1 ? 'On' : 'Off'}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {showTopupForm && canStake ? (
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <TopupForm
                key={`${currencyMode}-${topupFormNonce}-${topupAmount ?? stakeAmountForTopup}`}
                initialToken={isGhstMode ? 'GHST' : 'USDC'}
                initialAmount={topupAmount ?? stakeAmountForTopup}
                showHistoryTrigger={false}
              />
            </div>
          ) : showTopupForm ? (
            <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-white/70">
              {disabledReason ?? 'Staking is unavailable right now.'}
            </div>
          ) : null}

          <Accordion
            type="single"
            collapsible
            className="w-full"
            data-testid="details"
          >
            <AccordionItem value="details">
              <AccordionTrigger>Details</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-xs text-white/70">
                  <p>Lock {stakeCurrencyLabel} for 30 days per stake.</p>
                  <p>
                    Each deposit has its own unlock time; staking again does not
                    reset or extend existing lockups.
                  </p>
                  <p>
                    Earliest withdrawal depends on each deposit&apos;s unlock time.
                    Check your top-up history for exact dates.
                  </p>
                  <p>
                    Withdrawing reduces your total stake immediately, which can
                    lower runs/day, difficulty eligibility, and chest access.
                  </p>
                  <p>
                    Rewards scale with runs/day and difficulty eligibility; chest
                    access unlocks at 1+ {chestAccessCurrencyLabel} staked.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TierTone = {
  text: string;
  border: string;
  bg: string;
  progress: string;
};

const TIER_TONE_MAP: Record<string, TierTone> = {
  normal: {
    text: 'text-green-400',
    border: 'border-green-400/30',
    bg: 'bg-green-400/10',
    progress: 'bg-green-400',
  },
  nightmare: {
    text: 'text-purple-400',
    border: 'border-purple-400/30',
    bg: 'bg-purple-400/10',
    progress: 'bg-purple-400',
  },
  hell: {
    text: 'text-red-400',
    border: 'border-red-400/30',
    bg: 'bg-red-400/10',
    progress: 'bg-red-400',
  },
};

const FALLBACK_TIER_TONE: TierTone = {
  text: 'text-white/70',
  border: 'border-white/10',
  bg: 'bg-white/5',
  progress: 'bg-white/30',
};

function getTierTone(tierId?: string | null): TierTone {
  const normalized = normalizeTierId(tierId ?? '');
  return TIER_TONE_MAP[normalized] ?? FALLBACK_TIER_TONE;
}

function PerkItem({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: TierTone;
}) {
  return (
    <li className="flex items-center gap-2 text-white/80">
      <Check className={cn('h-3.5 w-3.5', tone?.text ?? 'text-emerald-300')} />
      <span>{children}</span>
    </li>
  );
}

function formatStakeRequirement(
  value: number,
  formatter: Intl.NumberFormat,
  currencyLabel: string
): string {
  if (value <= 0) return 'Free';
  return `${formatter.format(value)} ${currencyLabel}`;
}

function formatDifficultyUnlockLabel(name?: string | null): string {
  const label = name?.trim() || 'Normal';
  const normalized = label.toLowerCase();
  if (normalized === 'nightmare' || normalized === 'hell') {
    return `${label} Difficulty Unlocked`;
  }
  return `Difficulty: ${label}`;
}
