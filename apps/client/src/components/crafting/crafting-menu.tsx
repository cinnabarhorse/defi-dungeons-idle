'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Dices, Info, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { usePlayer } from '../providers/PlayerProvider';
import {
  buildForgeCandidateSummaries,
  formatForgeCandidateTitle,
  getForgeSuccessRateExplanation,
  isGotchiCharacterId,
} from '../../lib/forge';
import { getWearableBySlug } from '../../data/wearables';

interface PotionTier {
  tier: number;
  name: string;
  description: string;
  healPercent: string;
  iconUrl: string;
  color: string;
}

const POTION_TIERS: PotionTier[] = [
  {
    tier: 1,
    name: 'Health Potion',
    description: '10% max HP, min 50 HP',
    healPercent: '10%',
    iconUrl: '/wearables/126.svg',
    color: 'from-red-600/20 to-red-500/10',
  },
  {
    tier: 2,
    name: 'Greater Healing Potion',
    description: '25% max HP',
    healPercent: '25%',
    iconUrl: '/wearables/127.svg',
    color: 'from-rose-600/20 to-rose-500/10',
  },
  {
    tier: 3,
    name: 'Ultra Healing Potion',
    description: '50% max HP',
    healPercent: '50%',
    iconUrl: '/wearables/129.svg',
    color: 'from-fuchsia-600/20 to-fuchsia-500/10',
  },
];

interface CraftingRecipe {
  inputTier: number;
  outputTier: number;
  inputCount: number;
  outputCount: number;
}

const CRAFTING_RECIPES: CraftingRecipe[] = [
  { inputTier: 1, outputTier: 2, inputCount: 3, outputCount: 1 },
  { inputTier: 2, outputTier: 3, inputCount: 3, outputCount: 1 },
];
const GOLD_ICON_SRC = '/loot-icons/coin.svg';
const LICK_TONGUE_ICON_SRC = '/wearables/378.svg';

function getForgeWearableIconSrc(slug: string): string | null {
  const numericId = Number(getWearableBySlug(slug)?.svgId);
  return Number.isFinite(numericId) ? `/wearables/${numericId}.svg` : null;
}

function formatForgeWearableName(slug: string): string {
  const name = getWearableBySlug(slug)?.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim();
  }
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatForgeSourceQualityLabel(sourceQuality: string | null): string {
  if (!sourceQuality) {
    return 'source';
  }
  return sourceQuality.charAt(0).toUpperCase() + sourceQuality.slice(1);
}

function formatLickTongueLabel(count: number): string {
  return count === 1 ? 'Lick Tongue' : 'Lick Tongues';
}

interface CraftingMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverBaseUrl: string;
  onCraftSuccess?: () => void;
  preferredTab?: 'craft' | 'forge';
}

interface ForgeResultState {
  outcome: 'success' | 'failure';
  wearableSlug: string;
  goldSpent: number;
  successChancePct: number | null;
  lickTonguesSpent: number;
  usedLickTongueBypass: boolean;
  sourceQuality: string | null;
}

export function CraftingMenu({
  open,
  onOpenChange,
  serverBaseUrl,
  onCraftSuccess,
  preferredTab = 'craft',
}: CraftingMenuProps) {
  const {
    inventory,
    equipment,
    effectivePreferences,
    arePreferencesHydrated,
    gotchiSprites,
    lickTongueCount,
    refreshProgression,
  } = usePlayer();
  const { refreshInventory, inventoryItems } = inventory;
  const [crafting, setCrafting] = useState(false);
  const [forgingSlug, setForgingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forgeResult, setForgeResult] = useState<ForgeResultState | null>(null);
  const [forgeCelebrationTick, setForgeCelebrationTick] = useState(0);
  const [isForgeCelebrating, setIsForgeCelebrating] = useState(false);
  const [activeTab, setActiveTab] = useState<'craft' | 'forge'>('craft');
  const [openRateInfoSlug, setOpenRateInfoSlug] = useState<string | null>(null);
  const [isForgeHowItWorksOpen, setIsForgeHowItWorksOpen] = useState(false);
  const [craftCounts, setCraftCounts] = useState<Record<number, number>>({
    1: 1,
    2: 1,
  });

  const selectedCharacterId = useMemo(() => {
    if (arePreferencesHydrated) {
      return effectivePreferences.selectedCharacterId ?? null;
    }
    return equipment.state?.characterId ?? null;
  }, [
    arePreferencesHydrated,
    effectivePreferences.selectedCharacterId,
    equipment.state?.characterId,
  ]);

  const selectedGotchiId = useMemo(() => {
    if (!isGotchiCharacterId(selectedCharacterId)) {
      return null;
    }
    const idPart = selectedCharacterId?.split(':')[1] || '';
    const idNum = Number.parseInt(idPart, 10);
    return Number.isFinite(idNum) ? idNum : null;
  }, [selectedCharacterId]);

  const selectedGotchiEntry = useMemo(() => {
    if (!selectedGotchiId) {
      return null;
    }
    return gotchiSprites.byId[selectedGotchiId] ?? null;
  }, [gotchiSprites.byId, selectedGotchiId]);

  const goldCount = useMemo(() => {
    const goldItem = inventoryItems.find(
      (item) =>
        item.type === 'coin' &&
        String(item.name ?? '').trim().toLowerCase() === 'gold'
    );
    return Math.max(0, Number(goldItem?.quantity) || 0);
  }, [inventoryItems]);

  const equippedInventoryItemIds = useMemo(
    () =>
      new Set(
        (equipment.state?.equippedInventoryItemIds ?? [])
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0
          )
      ),
    [equipment.state?.equippedInventoryItemIds]
  );

  const forgeCandidates = useMemo(
    () =>
      buildForgeCandidateSummaries({
        gotchiEntry: selectedGotchiEntry,
        inventoryItems,
        equippedInventoryItemIds,
        lickTongueCount,
      }),
    [
      selectedGotchiEntry,
      inventoryItems,
      equippedInventoryItemIds,
      lickTongueCount,
    ]
  );

  const successfulForgeResult =
    forgeResult?.outcome === 'success' ? forgeResult : null;
  const successfulForgeWearableName = useMemo(
    () =>
      successfulForgeResult
        ? formatForgeWearableName(successfulForgeResult.wearableSlug)
        : null,
    [successfulForgeResult]
  );
  const successfulForgeWearableIconSrc = useMemo(
    () =>
      successfulForgeResult
        ? getForgeWearableIconSrc(successfulForgeResult.wearableSlug)
        : null,
    [successfulForgeResult]
  );

  useEffect(() => {
    if (forgeCelebrationTick === 0) {
      return;
    }

    setIsForgeCelebrating(true);
    const timeoutId = window.setTimeout(() => {
      setIsForgeCelebrating(false);
    }, 550);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [forgeCelebrationTick]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveTab(preferredTab);
  }, [open, preferredTab]);

  const getPotionCount = useCallback(
    (tier: number): number => {
      const potionNames: Record<number, string[]> = {
        1: ['Health Potion', 'health_potion'],
        2: ['Greater Healing Potion', 'greater_health_potion'],
        3: ['Ultra Healing Potion', 'ultra_health_potion'],
      };

      const names = potionNames[tier] || [];
      let count = 0;

      for (const item of inventoryItems) {
        if (item.type !== 'potion') continue;
        const itemName = item.name?.toLowerCase() || '';
        const itemType = (item as any).itemType?.toLowerCase() || '';
        const isHealthPotion =
          itemName.includes('health') || itemName.includes('healing');
        if (!isHealthPotion) continue;

        const itemTier = (item as any).potionTier;
        if (itemTier === tier) {
          count += item.quantity || 0;
          continue;
        }

        for (const name of names) {
          if (
            itemName === name.toLowerCase() ||
            itemType === name.toLowerCase()
          ) {
            count += item.quantity || 0;
            break;
          }
        }
      }

      return count;
    },
    [inventoryItems]
  );

  const potionCounts = {
    1: getPotionCount(1),
    2: getPotionCount(2),
    3: getPotionCount(3),
  };

  const getMaxCraftable = (recipe: CraftingRecipe): number => {
    const available = potionCounts[recipe.inputTier as 1 | 2 | 3];
    return Math.floor(available / recipe.inputCount);
  };

  const canCraft = useCallback(
    (recipe: CraftingRecipe, count: number = 1): boolean => {
      return (
        potionCounts[recipe.inputTier as 1 | 2 | 3] >=
        recipe.inputCount * count
      );
    },
    [potionCounts]
  );

  const handleCraft = useCallback(
    async (fromTier: number, count: number) => {
      if (!serverBaseUrl) {
        setError('Not connected to server');
        return;
      }

      const recipe = CRAFTING_RECIPES.find((r) => r.inputTier === fromTier);
      if (!recipe) {
        setError('Invalid recipe');
        return;
      }

      if (!canCraft(recipe, count)) {
        setError('Insufficient materials');
        return;
      }

      setCrafting(true);
      setError(null);
      setSuccess(null);
      setForgeResult(null);

      try {
        const response = await fetch(`${serverBaseUrl}/api/crafting/craft`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fromTier, count }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Crafting failed');
        }

        const inputTierInfo = POTION_TIERS.find((t) => t.tier === fromTier);
        const outputTierInfo = POTION_TIERS.find(
          (t) => t.tier === recipe.outputTier
        );

        const totalInput = recipe.inputCount * count;
        const totalOutput = recipe.outputCount * count;

        setSuccess(
          `Crafted ${totalOutput}x ${outputTierInfo?.name || `T${recipe.outputTier}`} from ${totalInput}x ${inputTierInfo?.name || `T${fromTier}`}!`
        );

        void refreshInventory(true);

        if (onCraftSuccess) {
          onCraftSuccess();
        }

        setTimeout(() => {
          setSuccess(null);
        }, 3000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Crafting failed';
        setError(message);
      } finally {
        setCrafting(false);
      }
    },
    [serverBaseUrl, onCraftSuccess, refreshInventory, canCraft]
  );

  const handleForge = useCallback(
    async (wearableSlug: string) => {
      if (!serverBaseUrl) {
        setError('Not connected to server');
        return;
      }

      setForgingSlug(wearableSlug);
      setError(null);
      setSuccess(null);
      setForgeResult(null);
      setOpenRateInfoSlug(null);
      setIsForgeHowItWorksOpen(false);

      try {
        const response = await fetch(`${serverBaseUrl}/api/player/inventory/forge`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ wearableSlug }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof data?.message === 'string'
              ? data.message
              : typeof data?.error === 'string'
                ? data.error
                : 'Forge failed'
          );
        }

        const nextForgeResult: ForgeResultState = {
          outcome: data?.outcome === 'success' ? 'success' : 'failure',
          wearableSlug,
          goldSpent: Math.max(0, Number(data?.goldSpent) || 0),
          successChancePct: Number.isFinite(Number(data?.successChancePct))
            ? Math.max(0, Number(data?.successChancePct) || 0)
            : null,
          lickTonguesSpent: Math.max(0, Number(data?.lickTonguesSpent) || 0),
          usedLickTongueBypass: Boolean(data?.usedLickTongueBypass),
          sourceQuality:
            typeof data?.sourceQuality === 'string' ? data.sourceQuality : null,
        };

        setForgeResult(nextForgeResult);
        if (nextForgeResult.outcome === 'success') {
          setForgeCelebrationTick((current) => current + 1);
        }

        await Promise.all([
          refreshInventory(true),
          equipment.refresh(),
          refreshProgression(),
        ]);

        if (onCraftSuccess) {
          onCraftSuccess();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Forge failed';
        setError(message);
      } finally {
        setForgingSlug(null);
      }
    },
    [
      serverBaseUrl,
      refreshInventory,
      equipment,
      onCraftSuccess,
      refreshProgression,
    ]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-lg ${
          isForgeCelebrating
            ? 'ring-1 ring-emerald-300/40 shadow-[0_0_45px_rgba(74,222,128,0.18)]'
            : ''
        }`}
        style={{ top: '50%', bottom: 'auto' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">⚗️</span>
            Craft & Forge
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-300">
            Combine potions or forge Flawless wearables for your selected gotchi
          </DialogDescription>
        </DialogHeader>

        <motion.div
          data-testid="crafting-menu-shell"
          data-forge-celebrating={isForgeCelebrating ? 'true' : 'false'}
          animate={
            isForgeCelebrating
              ? { x: [0, -10, 10, -7, 7, -3, 3, 0] }
              : { x: 0 }
          }
          transition={{
            duration: isForgeCelebrating ? 0.45 : 0,
            ease: 'easeInOut',
          }}
        >
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex">
          <Button
            type="button"
            variant={activeTab === 'craft' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveTab('craft');
              setError(null);
              setForgeResult(null);
              setOpenRateInfoSlug(null);
              setIsForgeHowItWorksOpen(false);
            }}
          >
            Potions
          </Button>
          <Button
            type="button"
            variant={activeTab === 'forge' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveTab('forge');
              setError(null);
              setSuccess(null);
              setOpenRateInfoSlug(null);
              setIsForgeHowItWorksOpen(false);
            }}
          >
            Flawless Wearables
          </Button>
        </div>

        {activeTab === 'craft' ? (
          <>
            <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Your Potions
              </div>
              <div className="grid grid-cols-3 gap-2">
                {POTION_TIERS.map((tier) => (
                  <div
                    key={tier.tier}
                    className={`rounded-lg border border-white/10 bg-gradient-to-br p-2 ${tier.color}`}
                  >
                    <div className="flex items-center gap-2">
                      <Image
                        src={tier.iconUrl}
                        alt={tier.name}
                        width={24}
                        height={24}
                        className="h-6 w-6 object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] text-gray-400">
                          T{tier.tier}
                        </div>
                        <div className="text-lg font-bold tabular-nums text-white">
                          {potionCounts[tier.tier as 1 | 2 | 3]}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {CRAFTING_RECIPES.map((recipe) => {
                const inputTier = POTION_TIERS.find(
                  (t) => t.tier === recipe.inputTier
                )!;
                const outputTier = POTION_TIERS.find(
                  (t) => t.tier === recipe.outputTier
                )!;
                const craftCount = craftCounts[recipe.inputTier] || 1;
                const maxCraftable = getMaxCraftable(recipe);
                const hasEnough = canCraft(recipe, craftCount);
                const inputCount = potionCounts[recipe.inputTier as 1 | 2 | 3];

                const updateCount = (newCount: number) => {
                  const clamped = Math.max(
                    1,
                    Math.min(newCount, Math.max(1, maxCraftable))
                  );
                  setCraftCounts((prev) => ({
                    ...prev,
                    [recipe.inputTier]: clamped,
                  }));
                };

                return (
                  <motion.div
                    key={`${recipe.inputTier}-${recipe.outputTier}`}
                    className={`rounded-lg border p-3 transition-colors ${
                      maxCraftable >= 1
                        ? 'border-white/20 bg-white/5 hover:bg-white/10'
                        : 'border-white/10 bg-white/[0.02] opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-1 items-center gap-2">
                        <Image
                          src={inputTier.iconUrl}
                          alt={inputTier.name}
                          width={32}
                          height={32}
                          className="h-8 w-8 object-contain"
                        />
                        <div>
                          <div className="text-xs text-gray-400">Input</div>
                          <div className="text-sm font-semibold text-white">
                            {recipe.inputCount * craftCount}x T{recipe.inputTier}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            ({inputCount} available)
                          </div>
                        </div>
                      </div>

                      <div className="text-xl text-gray-500">→</div>

                      <div className="flex flex-1 items-center gap-2">
                        <Image
                          src={outputTier.iconUrl}
                          alt={outputTier.name}
                          width={32}
                          height={32}
                          className="h-8 w-8 object-contain"
                        />
                        <div>
                          <div className="text-xs text-gray-400">Output</div>
                          <div className="text-sm font-semibold text-white">
                            {recipe.outputCount * craftCount}x T{recipe.outputTier}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            {outputTier.healPercent} HP
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCount(craftCount - 1)}
                          disabled={craftCount <= 1 || crafting}
                          className="h-6 w-6 rounded bg-white/10 text-sm font-bold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {craftCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCount(craftCount + 1)}
                          disabled={craftCount >= maxCraftable || crafting}
                          className="h-6 w-6 rounded bg-white/10 text-sm font-bold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCount(maxCraftable)}
                          disabled={maxCraftable < 1 || crafting}
                          className="ml-1 h-6 rounded bg-white/10 px-2 text-[10px] font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Max
                        </button>
                      </div>

                      <Button
                        onClick={() => handleCraft(recipe.inputTier, craftCount)}
                        disabled={!hasEnough || crafting}
                        className={`px-4 ${
                          hasEnough
                            ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500'
                            : 'cursor-not-allowed bg-gray-600'
                        }`}
                      >
                        {crafting ? '...' : 'Craft'}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-4 text-center text-xs text-gray-500">
              Higher tier potions restore more HP per use.
            </div>

            {error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            ) : null}
            {success ? (
              <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-sm text-green-300">{success}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {error ? (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            ) : null}

            {successfulForgeResult ? (
              <motion.div
                data-testid="forge-success-celebration"
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="relative mb-4 overflow-hidden rounded-2xl border border-emerald-300/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.22),rgba(14,165,233,0.16),rgba(250,204,21,0.14))] p-4 text-white shadow-[0_0_40px_rgba(16,185,129,0.18)]"
              >
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-300/20 blur-3xl" />
                <div className="absolute left-12 top-0 h-24 w-24 rounded-full bg-emerald-200/10 blur-3xl" />
                <div
                  data-testid="forge-success-layout"
                  className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-50">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      FLAWLESS!
                    </div>
                    <div className="mt-3 text-xl font-semibold leading-tight text-emerald-50 sm:text-2xl">
                      {successfulForgeWearableName} ascends to Flawless.
                    </div>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/90">
                      The forge cracked open on a{' '}
                      {successfulForgeResult.successChancePct ?? '?'}% roll and
                      came back glowing. Your{' '}
                      {formatForgeSourceQualityLabel(
                        successfulForgeResult.sourceQuality
                      )}{' '}
                      copy burned bright, and the reward landed perfect.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-50/95">
                      {successfulForgeResult.successChancePct !== null ? (
                        <span className="rounded-full border border-white/15 bg-black/15 px-3 py-1">
                          {successfulForgeResult.successChancePct}% hit
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    data-testid="forge-success-icon"
                    className="flex h-14 w-14 shrink-0 self-start items-center justify-center rounded-2xl border border-white/15 bg-black/15 sm:h-16 sm:w-16 sm:self-auto"
                  >
                    {successfulForgeWearableIconSrc ? (
                      <Image
                        src={successfulForgeWearableIconSrc}
                        alt={successfulForgeWearableName ?? 'Forged wearable'}
                        width={44}
                        height={44}
                        className="h-11 w-11 object-contain"
                      />
                    ) : (
                      <Sparkles className="h-8 w-8 text-emerald-100" />
                    )}
                  </div>
                </div>
              </motion.div>
            ) : forgeResult ? (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                Forge failed: the{' '}
                {formatForgeSourceQualityLabel(forgeResult.sourceQuality)} copy
                was consumed and {forgeResult.lickTonguesSpent}{' '}
                {formatLickTongueLabel(forgeResult.lickTonguesSpent)} were
                spent.
              </div>
            ) : null}

            {!isGotchiCharacterId(selectedCharacterId) ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                Only real Aavegotchis can Forge. Only real Aavegotchis can equip
                Flawless wearables.
              </div>
            ) : gotchiSprites.isLoading && !selectedGotchiEntry ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                Loading selected gotchi wearables...
              </div>
            ) : forgeCandidates.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                No forgeable NFT wearables found on the selected gotchi.
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  data-testid="forge-balance-summary"
                  className="rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-white">
                      <span className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2">
                        <Image
                          src={GOLD_ICON_SRC}
                          alt="Gold"
                          width={18}
                          height={18}
                          className="h-4.5 w-4.5 object-contain"
                        />
                        <span className="text-sm font-semibold tabular-nums">
                          {goldCount}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2">
                        <Image
                          src={LICK_TONGUE_ICON_SRC}
                          alt="Lick Tongue"
                          width={18}
                          height={18}
                          className="h-4.5 w-4.5 object-contain"
                        />
                        <span className="text-sm font-semibold tabular-nums">
                          {lickTongueCount}
                        </span>
                      </span>
                    </div>
                    <div className="relative self-start">
                      <button
                        type="button"
                        aria-label="How flawless forging works"
                        className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                        onClick={() =>
                          setIsForgeHowItWorksOpen((current) => !current)
                        }
                      >
                        <Info className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>How it works</span>
                      </button>
                      {isForgeHowItWorksOpen ? (
                        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-white/10 bg-[#161c2c] p-3 text-xs leading-5 text-white/80 shadow-xl sm:w-80">
                          <p>
                            Flawless wearables can be forged using the NFT
                            version + a copy, which gets consumed.
                          </p>
                          <p className="mt-2">
                            They can only be equipped on real onchain
                            Aavegotchis.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {forgeCandidates.map((candidate) => {
                  const hasGold = goldCount >= candidate.goldCost;
                  const hasLickTonguesForForge =
                    lickTongueCount >= candidate.lickTongueCost;
                  const disabled = forgingSlug !== null || !candidate.canForge || !hasGold;
                  const wearableIconSrc = getForgeWearableIconSrc(
                    candidate.wearableSlug
                  );

                  return (
                    <motion.div
                      key={candidate.wearableSlug}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-white/10 bg-white/5 p-4"
                    >
                      <div
                        data-testid={`forge-candidate-layout-${candidate.wearableSlug}`}
                        className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10">
                            {wearableIconSrc ? (
                              <Image
                                src={wearableIconSrc}
                                alt={candidate.wearableName}
                                width={36}
                                height={36}
                                className="h-9 w-9 object-contain"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded bg-white/10" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">
                              {formatForgeCandidateTitle(
                                candidate.wearableName,
                                candidate.ownedCount
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-white/60">
                              <span className="rounded bg-white/10 px-2 py-1">
                                {candidate.rarity}
                              </span>
                              {candidate.sourceQuality ? (
                                <span className="rounded bg-white/10 px-2 py-1">
                                  {candidate.sourceQuality}
                                </span>
                              ) : null}
                              {candidate.successChancePct !== null ? (
                                <div className="relative">
                                  <span className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2 py-1">
                                    <Dices className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{candidate.successChancePct}%</span>
                                    <button
                                      type="button"
                                      aria-label={`Show forge rate breakdown for ${candidate.wearableName}`}
                                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white/70 transition hover:text-white"
                                      onClick={() =>
                                        setOpenRateInfoSlug((current) =>
                                          current === candidate.wearableSlug
                                            ? null
                                            : candidate.wearableSlug
                                        )
                                      }
                                    >
                                      <Info className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                  {openRateInfoSlug === candidate.wearableSlug ? (
                                    <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-lg border border-white/10 bg-[#161c2c] p-3 text-[11px] normal-case tracking-normal text-white/80 shadow-xl">
                                      {getForgeSuccessRateExplanation(candidate)}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {!candidate.sourceQuality ? (
                              <div className="mt-1 text-xs text-amber-300">
                                No copy found in inventory.
                              </div>
                            ) : null}
                            {!hasGold ? (
                              <div className="mt-1 text-xs text-amber-300">
                                Not enough Gold to forge this wearable.
                              </div>
                            ) : null}
                            {candidate.sourceQuality &&
                            !hasLickTonguesForForge ? (
                              <div className="mt-1 text-xs text-amber-300">
                                Not enough Lick Tongues to forge this wearable.
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div
                          data-testid={`forge-candidate-action-${candidate.wearableSlug}`}
                          className="flex w-full shrink-0 flex-col items-stretch gap-2 md:w-auto md:items-end"
                        >
                          <Button
                            type="button"
                            onClick={() => void handleForge(candidate.wearableSlug)}
                            disabled={disabled}
                            aria-label={`Roll for ${candidate.goldCost} Gold and ${candidate.lickTongueCost} Lick Tongues using a ${candidate.sourceQuality ?? 'source'} copy`}
                            className="w-full min-w-0 px-3 py-2 md:min-w-[180px]"
                          >
                            {forgingSlug === candidate.wearableSlug ? (
                              'Rolling...'
                            ) : (
                              <span className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-left leading-none sm:flex-nowrap">
                                <span className="font-semibold">Roll</span>
                                <span className="inline-flex items-center gap-1.5">
                                  <Image
                                    src={GOLD_ICON_SRC}
                                    alt="Gold"
                                    width={14}
                                    height={14}
                                    className="h-3.5 w-3.5 object-contain"
                                  />
                                  <span className="tabular-nums">
                                    {candidate.goldCost}
                                  </span>
                                </span>
                                <span className="inline-flex items-center gap-1.5 opacity-85">
                                  <Image
                                    src={LICK_TONGUE_ICON_SRC}
                                    alt="Lick Tongue"
                                    width={14}
                                    height={14}
                                    className="h-3.5 w-3.5 object-contain"
                                  />
                                  <span className="tabular-nums">
                                    {candidate.lickTongueCost}
                                  </span>
                                </span>
                              </span>
                            )}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
