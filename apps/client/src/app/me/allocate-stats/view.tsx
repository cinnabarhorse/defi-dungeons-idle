'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { ProfilePanel } from '../../../components/ProfilePanel';
import { usePlayer } from '../../../components/providers/PlayerProvider';
import { cloneProfile } from '../../../lib/progression';
import { parseAllocateStatsDevLevelOverride } from './dev-overrides';

export default function AllocateStatsClient() {
  const {
    progressionProfile,
    progressionLevelProgress,
    rebirthCount,
    currentMaxLevel,
    absoluteMaxLevel,
    rebirthCost,
    isProgressionHydrated,
    lickTongueCount,
    saveProgressionProfile,
    resetProgressionProfile,
    deallocateAllStats,
    purchaseRebirth,
  } = usePlayer();
  const [isRebirthPending, setIsRebirthPending] = useState(false);
  const [rebirthError, setRebirthError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const isEditingDisabled = useMemo(() => false, []);
  const devLevelOverride = useMemo(() => {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
    return parseAllocateStatsDevLevelOverride(searchParams);
  }, [searchParams]);

  const profileForView = useMemo(() => {
    if (devLevelOverride === null) {
      return progressionProfile;
    }
    const overridden = cloneProfile(progressionProfile);
    overridden.level = devLevelOverride;
    return overridden;
  }, [devLevelOverride, progressionProfile]);

  return (
    <main className="min-h-screen-safe bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white pb-20">
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <header className="mb-6">
          <Link href="/me" className="text-sm text-white/70 hover:text-white">
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-200" />
            <span>Allocate Stats</span>
          </h1>
          {devLevelOverride !== null ? (
            <p className="mt-1 text-xs text-amber-200/90">
              Dev override active: level forced to {devLevelOverride} via
              {' '}
              ?devLevel=99.
            </p>
          ) : null}
        </header>

        <ProfilePanel
          profile={profileForView}
          levelProgress={progressionLevelProgress}
          rebirthCount={rebirthCount}
          currentMaxLevel={currentMaxLevel}
          absoluteMaxLevel={absoluteMaxLevel}
          rebirthCost={rebirthCost}
          lickTongueCount={lickTongueCount}
          isHydrated={isProgressionHydrated}
          isEditingDisabled={isEditingDisabled}
          isRebirthPending={isRebirthPending}
          rebirthError={rebirthError}
          onSubmit={(next) => {
            void (async () => {
              await saveProgressionProfile(next);
            })();
          }}
          onRebirth={() => {
            const confirmed = window.confirm(
              `Spend ${rebirthCost.toLocaleString()} Lick Tongues to rebirth?\n\nThis resets level, XP, and stat allocations to level 1.\nEach rebirth permanently unlocks +3 max levels.\nEquipment, inventory, and unlocks are kept.`
            );
            if (!confirmed) {
              return;
            }
            void (async () => {
              setRebirthError(null);
              setIsRebirthPending(true);
              try {
                await purchaseRebirth();
              } catch (error) {
                setRebirthError(
                  error instanceof Error
                    ? error.message
                    : 'Failed to complete rebirth'
                );
              } finally {
                setIsRebirthPending(false);
              }
            })();
          }}
          onResetToLevelOne={() => {
            void (async () => {
              await resetProgressionProfile();
            })();
          }}
          onDeallocateAll={() => {
            void (async () => {
              await deallocateAllStats();
            })();
          }}
        />
      </div>

      {/* bottom tabs now rendered globally in RootLayout */}
    </main>
  );
}
