'use client';

import { Lock, Zap, Eye, Flame } from 'lucide-react';
import {
  DIFFICULTY_TIER_SEQUENCE,
  getDifficultyTier,
  isTierEligible,
  normalizeTierId,
} from '../data/difficulty-tiers';
import { cn } from '../lib/utils';

interface DifficultySelectorProps {
  selectedTier: string;
  stakedUsdcBalance: number;
  onTierSelect: (tierId: string) => void;
  onUpgradeTier?: (stakeThreshold: number) => void;
  onClose?: () => void;
  className?: string;
}

// Tier icons based on difficulty category
const getTierIcon = (tierId: string) => {
  const normalized = normalizeTierId(tierId);
  if (normalized === 'normal') return <Zap className="w-5 h-5" />;
  if (normalized === 'nightmare') return <Eye className="w-5 h-5" />;
  if (normalized === 'hell') return <Flame className="w-5 h-5" />;
  return <Zap className="w-5 h-5" />;
};

// Tier colors based on difficulty category
const getTierColor = (tierId: string) => {
  const normalized = normalizeTierId(tierId);
  if (normalized === 'normal')
    return 'text-green-400 border-green-400/30 bg-green-400/10';
  if (normalized === 'nightmare')
    return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
  if (normalized === 'hell')
    return 'text-red-400 border-red-400/30 bg-red-400/10';
  return 'text-gray-400 border-gray-400/30 bg-gray-400/10';
};

export function DifficultySelector({
  selectedTier,
  onTierSelect,
  stakedUsdcBalance,
  onUpgradeTier,
  onClose,
  className,
}: DifficultySelectorProps) {
  // Normalize the selected tier and unlocked tiers for comparison
  const normalizedSelected = normalizeTierId(selectedTier);
  const requirementFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Difficulty Tiers Grid - Now only 3 tiers */}
      <div className="grid grid-cols-1 gap-3">
        {DIFFICULTY_TIER_SEQUENCE.map((tierId) => {
          const tier = getDifficultyTier(tierId);
          if (!tier) return null;

          const isAccessible = isTierEligible(tierId, stakedUsdcBalance);
          const isSelected = normalizedSelected === tierId;
          const tierColors = getTierColor(tierId);
          const formattedRequirement = requirementFormatter.format(
            tier.usdcStakedRequired
          );

          return (
            <div key={tierId} className="relative">
              <button
                type="button"
                data-testid={`difficulty-tier-${tierId}`}
                onClick={() => {
                  if (isAccessible) onTierSelect(tierId);
                }}
                disabled={!isAccessible}
                className={cn(
                  'w-full relative p-4 border rounded-lg text-left transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  isSelected
                    ? `${tierColors} ring-2 ring-current`
                    : isAccessible
                      ? `${tierColors} hover:brightness-110`
                      : 'text-gray-500 border-gray-600 bg-gray-800/50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="shrink-0">{getTierIcon(tierId)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{tier.name}</span>
                      {isAccessible ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/30">
                          {tier.usdcStakedRequired > 0 ? 'Accessible' : 'Free'}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/30">
                          Requires {formattedRequirement} USDC/GHO staked
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/60 mt-1 line-clamp-1">
                      {tier.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="w-3 h-3 bg-current rounded-full animate-pulse shrink-0" />
                  )}
                </div>
              </button>

              {!isAccessible && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/70 p-3">
                  <div className="px-4 py-2 rounded-md text-sm font-semibold border text-gray-300 border-gray-600 flex flex-row items-center gap-2">
                    <Lock className="w-5 h-5" />
                    {`Requires ${formattedRequirement} USDC/GHO staked`}
                  </div>
                  {onUpgradeTier ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose?.();
                        onUpgradeTier(tier.usdcStakedRequired);
                      }}
                      className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-4"
                    >
                      Upgrade to unlock
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Tier Info */}
      {normalizedSelected && getDifficultyTier(normalizedSelected) && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-lg text-white">
              {getDifficultyTier(normalizedSelected)!.name}
            </h4>
            <div className="flex items-center gap-2">
              {getTierIcon(normalizedSelected)}
            </div>
          </div>
          <p className="text-sm text-gray-300 mb-3">
            {getDifficultyTier(normalizedSelected)!.description}
          </p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-white/50">Enemy HP:</span>{' '}
              <span className="text-red-400 font-bold">
                {getDifficultyTier(normalizedSelected)!.enemyHealthMultiplier}x
              </span>
            </div>
            <div>
              <span className="text-white/50">XP Bonus:</span>{' '}
              <span className="text-purple-400 font-bold">
                {getDifficultyTier(normalizedSelected)!.xpMultiplier}x
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
