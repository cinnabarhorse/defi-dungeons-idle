'use client';

import { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import {
  cloneProfile,
  computeProgressionModifiers,
  type LevelProgress,
  type ProgressionProfile,
  type StatKey,
} from '../lib/progression';
import { Button } from './ui/Button';

interface ProfilePanelProps {
  profile: ProgressionProfile;
  levelProgress: LevelProgress;
  rebirthCount: number;
  currentMaxLevel: number;
  absoluteMaxLevel: number;
  rebirthCost: number;
  lickTongueCount: number;
  isHydrated: boolean;
  isEditingDisabled?: boolean;
  isRebirthPending?: boolean;
  rebirthError?: string | null;
  onSubmit: (profile: ProgressionProfile) => void;
  onRebirth?: () => void;
  onAddTestXp?: (amount: number) => void;
  onResetToLevelOne?: () => void;
  onDeallocateAll?: () => void;
}

const STAT_LABELS: Record<StatKey, { label: string }> = {
  energy: {
    label: 'Attack Speed',
  },
  aggression: {
    label: 'Damage',
  },
  spookiness: {
    label: 'HP',
  },
  brainSize: {
    label: 'Mana',
  },
};

const DEV_MODE = process.env.NODE_ENV !== 'production';

export function ProfilePanel({
  profile,
  levelProgress,
  rebirthCount,
  currentMaxLevel,
  absoluteMaxLevel,
  rebirthCost,
  lickTongueCount,
  isHydrated,
  isEditingDisabled,
  isRebirthPending,
  rebirthError,
  onSubmit,
  onRebirth,
  onAddTestXp,
  onResetToLevelOne,
  onDeallocateAll,
}: ProfilePanelProps) {
  const [draft, setDraft] = useState<ProgressionProfile>(() =>
    cloneProfile(profile)
  );

  useEffect(() => {
    setDraft(cloneProfile(profile));
  }, [profile]);

  const modifiers = useMemo(
    () => computeProgressionModifiers(draft.stats),
    [draft.stats]
  );

  const hasChanges = useMemo(() => {
    return (
      draft.unspentPoints !== profile.unspentPoints ||
      draft.stats.energy !== profile.stats.energy ||
      draft.stats.aggression !== profile.stats.aggression ||
      draft.stats.spookiness !== profile.stats.spookiness ||
      draft.stats.brainSize !== profile.stats.brainSize ||
      draft.allocationHistory.length !== profile.allocationHistory.length ||
      draft.allocationHistory.some(
        (value, index) => value !== profile.allocationHistory[index]
      )
    );
  }, [draft, profile]);

  const handleAllocate = (stat: StatKey) => {
    if (isEditingDisabled || draft.unspentPoints <= 0) return;
    setDraft((prev) => {
      const next = cloneProfile(prev);
      next.unspentPoints -= 1;
      next.stats[stat] += 1;
      next.allocationHistory.push(stat);
      return next;
    });
  };

  const handleUndo = () => {
    if (isEditingDisabled) return;
    setDraft((prev) => {
      if (prev.allocationHistory.length === 0) return prev;
      const next = cloneProfile(prev);
      const stat = next.allocationHistory.pop();
      if (stat) {
        next.stats[stat] = Math.max(0, next.stats[stat] - 1);
        next.unspentPoints += 1;
      }
      return next;
    });
  };

  const handleReset = () => {
    if (isEditingDisabled) return;
    setDraft(cloneProfile(profile));
  };

  const handleConfirm = () => {
    if (!hasChanges || isEditingDisabled) return;
    onSubmit(cloneProfile(draft));
  };

  const progressPercent = levelProgress.xpForNextLevel
    ? Math.min(100, Math.max(0, levelProgress.progress * 100))
    : 100;

  const cooldownReduction = (1 - modifiers.attackSpeedScalar) * 100;
  const damageIncrease = (modifiers.damageMultiplier - 1) * 100;
  const hpBonusFlat = modifiers.maxHealthFlatBonus;
  // const hpBonusPercent = (modifiers.maxHealthMultiplier - 1) * 100;
  const manaBonus = modifiers.maxManaBonus;
  // const manaRegen = (modifiers.manaRegenMultiplier - 1) * 100;
  // const cooldownRefund = modifiers.cooldownRefundChance * 100;
  const rebirthCapReached = currentMaxLevel >= absoluteMaxLevel;
  const rebirthLevelReady = profile.level >= currentMaxLevel;
  const rebirthCostReady = lickTongueCount >= rebirthCost;
  const canRebirth =
    !rebirthCapReached &&
    rebirthLevelReady &&
    rebirthCostReady &&
    !isEditingDisabled;

  return (
    <div className="bg-black/30 border border-white/10 rounded-2xl p-4 md:p-6 text-white font-hud flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-200" />
          <span>Allocate Points</span>
        </h2>
        <p className="text-sm text-white/70">
          Earn XP from defeating enemies to level up and unlock stat points.
        </p>
      </div>

      {!isHydrated && (
        <div className="text-sm text-white/60">Loading profile…</div>
      )}

      <div className="space-y-4">
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-wide text-white/60">
                Level
              </div>
              <div className="text-4xl font-black">
                {profile.level}
                <span className="ml-2 text-xl font-semibold text-white/60">
                  / {currentMaxLevel}
                </span>
              </div>
            </div>
            <div className="text-right text-sm text-white/70">
              <div className="flex items-center justify-end gap-1">
                <Star className="h-3.5 w-3.5 text-amber-200" />
                <span className="tabular-nums">{draft.unspentPoints}</span>
                <span>Unspent</span>
              </div>
              <div>
                XP {levelProgress.xpIntoLevel.toLocaleString()} /
                {levelProgress.xpForNextLevel
                  ? ` ${levelProgress.xpForNextLevel.toLocaleString()}`
                  : ' MAX'}
              </div>
            </div>
          </div>
          <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-pink-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {isEditingDisabled && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          Stat allocation is disabled while a match is in progress. Finish your
          run to assign points.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(STAT_LABELS) as StatKey[]).map((statKey) => {
          const config = STAT_LABELS[statKey];
          const value = draft.stats[statKey];

          let effectText = '';
          switch (statKey) {
            case 'energy':
              effectText = `Cooldown -${cooldownReduction.toFixed(1)}%`;
              break;
            case 'aggression':
              effectText = `Damage +${damageIncrease.toFixed(1)}%`;
              break;
            case 'spookiness':
              effectText = `HP +${hpBonusFlat.toFixed(0)}`;
              break;
            case 'brainSize':
              effectText = `Mana +${manaBonus.toFixed(0)}`;
              break;
            default:
              effectText = '';
          }

          return (
            <div
              key={statKey}
              className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{config.label}</div>
                </div>
                <div className="text-3xl font-bold">{value}</div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-white/70 flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  {effectText}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isEditingDisabled || draft.unspentPoints <= 0}
                  onClick={() => handleAllocate(statKey)}
                  className="shrink-0"
                >
                  + Stat
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="default"
          disabled={!hasChanges || isEditingDisabled}
          onClick={handleConfirm}
        >
          Save
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (!onRebirth || isEditingDisabled || !canRebirth || isRebirthPending) {
              return;
            }
            onRebirth();
          }}
          disabled={!onRebirth || isEditingDisabled || !canRebirth || isRebirthPending}
          className="whitespace-nowrap"
        >
          {isRebirthPending
            ? 'Rebirthing...'
            : `Rebirth (-${rebirthCost.toLocaleString()} Lick Tongues)`}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (isEditingDisabled) return;
            if (onDeallocateAll) onDeallocateAll();
          }}
          disabled={isEditingDisabled}
        >
          Deallocate All
        </Button>
        <Button
          variant="secondary"
          onClick={handleUndo}
          disabled={isEditingDisabled || draft.allocationHistory.length === 0}
        >
          Undo Last
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          disabled={isEditingDisabled || !hasChanges}
        >
          Reset
        </Button>
        {DEV_MODE && (onResetToLevelOne || onAddTestXp) && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {onResetToLevelOne && (
              <Button
                variant="destructive"
                onClick={onResetToLevelOne}
                className="whitespace-nowrap"
              >
                Reset to Level 1 (dev)
              </Button>
            )}
            {onAddTestXp && (
              <Button
                variant="ghost"
                onClick={() => onAddTestXp(500)}
                className="whitespace-nowrap"
              >
                +500 XP (dev)
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="text-xs text-white/70 rounded-lg border border-white/10 bg-white/5 p-3 space-y-1">
        <div>
          Rebirths: {rebirthCount} | Max Level: {currentMaxLevel} / {absoluteMaxLevel}
        </div>
        <div>
          Lick Tongues: {lickTongueCount.toLocaleString()} / {rebirthCost.toLocaleString()}
        </div>
        <div>
          {rebirthCapReached
            ? `Rebirth cap reached at level ${absoluteMaxLevel}.`
            : !rebirthLevelReady
              ? `Reach level ${currentMaxLevel} to rebirth.`
              : !rebirthCostReady
                ? `Need ${(rebirthCost - lickTongueCount).toLocaleString()} more Lick Tongues.`
                : 'Ready to rebirth: reset progression and unlock +3 max levels forever.'}
        </div>
        {rebirthError ? (
          <div className="text-red-300" role="alert">
            {rebirthError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
