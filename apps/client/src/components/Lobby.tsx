'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Clock,
  Ghost,
  Info,
  Layers,
  Star,
  Swords,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { WalletConnectControl } from './WalletConnectControl';
import { Button } from './ui/Button';
import { CharacterSelector } from './CharacterSelector';
import { CharacterPreview } from './CharacterPreview';
import {
  HeroDetailsView,
  formatAttacksPerSecond,
  getAbilityLabel,
} from './HeroDetailsView';
import type {
  AbilityEntry,
  HeroDetails,
  HeroWeaponSummary,
} from './HeroDetailsView';
import type { HeroWearableSummary } from '../lib/hero-details/wearable-summaries';
import {
  durabilityCapForQuality,
  type QualityTier,
} from '../data/wearable-quality';
import { DifficultySelector } from './DifficultySelector';
import { cn } from '../lib/utils';
import { CHARACTERS } from '../lib/character-registry';
import { getDifficultyTier } from '../data/difficulty-tiers';
import { getServerUrlForRegion } from '../lib/server-regions';
import { fetchDedupe } from '../lib/fetch-dedupe';
import type { EquipmentSlotName } from '../hooks/useEquipment';
import { getCharacterStats } from '../lib/character-registry';
import { itemTypes, type WearableDefinition } from '../data/wearables';
import {
  setGotchiWearables,
  setGotchiWearableAssignments,
} from '../data/characters';
import {
  useGotchiSprites,
  type GotchiSpriteEntry,
} from '../hooks/useGotchiSprites';
import { useSession } from './providers/SessionProvider';
import { usePlayer } from './providers/PlayerProvider';
import { ApplyForAlpha } from './ApplyForAlpha';
import {
  computeProgressionModifiers,
  type ProgressionProfile,
} from '../lib/progression';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/Dialog';
import { Slider } from './ui/Slider';
import {
  RUN_ARCHETYPES_BY_ID,
  RUN_ARCHETYPE_BY_CHARACTER_ID,
  type RunLevelTraitDefinition,
} from '../data/archetypes';
import { formatKillStreakTrait } from '../lib/traits';
import { SplashBackground } from './SplashBackground';
import { ShopDialog } from './shop/shop-dialog';
import { CraftingMenu } from './crafting/crafting-menu';
import { UpgradeTierDialog } from './upgrade-tier/UpgradeTierDialog';
import { LobbyAnnouncementBar } from './LobbyAnnouncementBar';
import type { InventoryItem } from '../types/inventory';
import type {
  DailyRunsExhaustedPayload,
  DailyRunsStatus,
  DailyRunsTier,
} from '../types/daily-runs';
import {
  buildUpgradeTierViewModel,
  getUpgradeTierConfigs,
  resolveUpgradeTierStakeTotal,
} from '../lib/upgrade-tier';
import {
  TRADE_CLOSE_FEE_GOLD,
  TRADE_DIRECTIONS,
  TRADE_EXTEND_FEE_GOLD,
  TRADE_EXTEND_WINDOW_MINUTES,
  TRADE_LEVERAGE_MAX,
  TRADE_LEVERAGE_MIN,
  TRADE_LEVERAGE_QUICK_OPTIONS,
  TRADE_TOKENS,
  formatTradeDirectionLabel,
  normalizeTradeLeverage,
  type TradeDirection,
  type TradeToken,
} from '../lib/trade-config';
import {
  closeRun,
  OPEN_RUNS_REFRESH_EVENT,
  extendRun,
  fetchOpenRuns,
  fetchTradeMarketStats,
  type OpenTradeRunEstimate,
  type TradeMarketStatsResponse,
} from '../lib/daily-quest-trade';
import { resolveLobbyGotchiDerivedStats } from '../lib/hero-details/lobby-gotchi-stats';
import {
  applyWearablePreviewState,
  buildHeroWearableSummaries,
  getWearableQualityPreviewClasses,
} from '../lib/hero-details/wearable-summaries';

const DEV_MODE = process.env.NODE_ENV !== 'production';

export type GameMode = 'competitive' | null;

const SPEED_RUN_MULTIPLIERS = [1, 2, 3, 4, 5, 10, 20, 25, 40, 50];
const PRACTICE_RUN_LEVERAGE_MAX = 40;
const PRACTICE_RUN_LEVERAGE_QUICK_OPTIONS = [1, 2, 5, 10, 20, 40] as const;
const TRADE_TOKEN_ICON_SRC: Record<TradeToken, string> = {
  BTC: '/token-icons/btc.png',
  ETH: '/token-icons/eth.png',
  GHST: '/token-icons/ghst.png',
};
const GOLD_ICON_SRC = '/loot-icons/coin.svg';
const FORGE_ANNOUNCEMENT_MESSAGE = 'Forging Flawless wearables now live!';
const FORGE_ANNOUNCEMENT_LABEL = 'Try it now';

function GoldCoinIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <Image
      src={GOLD_ICON_SRC}
      alt="Gold"
      width={14}
      height={14}
      className={className}
    />
  );
}

function getNextSpeedRunMultiplier(current: number): number {
  const normalized = Math.max(1, Math.floor(current || 1));
  const currentIndex = SPEED_RUN_MULTIPLIERS.indexOf(normalized);
  if (currentIndex === -1) return SPEED_RUN_MULTIPLIERS[0];
  return SPEED_RUN_MULTIPLIERS[(currentIndex + 1) % SPEED_RUN_MULTIPLIERS.length];
}

function resolveWearableIconFor(
  wearable: WearableDefinition | null | undefined
): string | null {
  if (!wearable) return null;
  const rawId = (wearable as any).svgId as number | undefined;
  const numericId = Number.isFinite(rawId) ? (rawId as number) : wearable.id;
  return Number.isFinite(numericId) ? `/wearables/${numericId}.svg` : null;
}

function resolveWeaponIconFor(
  weapon: HeroWeaponSummary | null | undefined
): string | null {
  if (!weapon) return null;
  const numericId = Number((weapon as any).svgId ?? weapon.id);
  return Number.isFinite(numericId) ? `/wearables/${numericId}.svg` : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAbilityEntry(ability: unknown): AbilityEntry | null {
  if (!ability || typeof ability !== 'object') return null;
  const candidate = ability as { id?: unknown; params?: unknown };
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  const params = candidate.params;
  return {
    id: candidate.id,
    params: isRecord(params) ? (params as Record<string, unknown>) : null,
  };
}

function appendAbilities(target: AbilityEntry[], abilities: Iterable<unknown>) {
  for (const ability of abilities) {
    const entry = normalizeAbilityEntry(ability);
    if (entry) {
      target.push(entry);
    }
  }
}

function formatFloat(value: number, maxDecimals = 2): string {
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round(value * factor) / factor;
  if (Number.isInteger(rounded)) {
    return `${rounded}`;
  }
  return rounded.toFixed(Math.min(maxDecimals, 2)).replace(/\.?0+$/, '');
}

function normalizeTradeWholeLeverage(
  value: unknown,
  fallback: number = TRADE_LEVERAGE_MIN
): number {
  return Math.round(normalizeTradeLeverage(value, fallback));
}

function normalizeRunLeverage(value: unknown, max: number): number {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : TRADE_LEVERAGE_MIN;
  const rounded = Math.round(safe);
  return Math.max(TRADE_LEVERAGE_MIN, Math.min(max, rounded));
}

function formatTradeLeverage(value: number): string {
  return `${normalizeTradeWholeLeverage(value)}x`;
}

function formatRunLeverage(value: number, max: number): string {
  return `${normalizeRunLeverage(value, max)}x`;
}

function formatTradeUsdPrice(value: number, token: TradeToken): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const maxDecimals = token === 'GHST' ? 8 : 4;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
}

function formatCountdown(resetAtIso: string | null, nowMs: number): string {
  if (!resetAtIso) {
    return '—';
  }

  const resetAtMs = new Date(resetAtIso).getTime();
  if (!Number.isFinite(resetAtMs)) {
    return '—';
  }

  const diffMs = Math.max(0, resetAtMs - nowMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0 && minutes <= 0) {
    return '<1m';
  }

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatPercentValue(value: number): string {
  const percent = value * 100;
  const abs = Math.abs(percent);
  const decimals = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  return formatFloat(percent, decimals);
}

function formatUsdPrice(value: number, token: TradeToken): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '—';
  }
  const maxDecimals = token === 'GHST' ? 8 : 4;
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  });
}

function formatSignedPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const formatted = `${formatPercentValue(value)}%`;
  if (value > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

function getMarketChangeClassName(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return 'text-gray-400';
  }
  if (value > 0) {
    return 'text-emerald-400';
  }
  if (value < 0) {
    return 'text-rose-400';
  }
  return 'text-gray-200';
}

function formatUpdatedAgo(sampledAtMs: number | null | undefined, nowMs: number): string {
  const sampled = Number(sampledAtMs);
  if (!Number.isFinite(sampled) || sampled <= 0) {
    return 'updated —';
  }
  const ageSeconds = Math.max(0, Math.floor((nowMs - sampled) / 1000));
  if (ageSeconds < 60) {
    return `updated ${ageSeconds}s ago`;
  }
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) {
    return `updated ${ageMinutes}m ago`;
  }
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `updated ${ageHours}h ago`;
  }
  const ageDays = Math.floor(ageHours / 24);
  return `updated ${ageDays}d ago`;
}

function formatCompactCount(
  value: number,
  formatters: {
    oneDecimal: Intl.NumberFormat;
    zeroDecimal: Intl.NumberFormat;
  }
): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const formatter =
    abs < 1000
      ? formatters.zeroDecimal
      : abs < 10_000
        ? formatters.oneDecimal
        : formatters.zeroDecimal;
  const formatted = formatter.format(value);
  return formatted.replace(/K/g, 'k');
}

function isGoldCurrency(item: InventoryItem): boolean {
  const type = String(item.type ?? '').toLowerCase();
  if (type !== 'coin' && type !== 'gold_coin' && type !== 'gold') {
    return false;
  }
  const name = String(item.name ?? '').toLowerCase();
  return name === 'gold' || name === 'gold coin';
}

function formatKillStreakTraitSummary(
  trait: RunLevelTraitDefinition | undefined
): string | null {
  if (!trait) return null;
  if (trait.type === 'none')
    return trait.note ? `Kill streak trait: ${trait.note}` : null;

  // Show the per-unit effect and cap concisely; use the shared formatter for 1 unit
  const sample = formatKillStreakTrait(trait, 1);
  if (!sample) return trait.note ? `Kill streak trait: ${trait.note}` : null;

  const cap = typeof trait.cap === 'number' ? trait.cap : null;
  const capText =
    cap != null && trait.type !== 'hp_regen'
      ? ` (cap ${Math.round(cap * 100)}%)`
      : '';
  return `Kill streak: ${sample.shortLabel} ${sample.valueText}/unit${capText}.`;
}

// Aggregation helpers for preview stacking
const MAX_TONGUE_FARM_BONUS = 0.25;
const DEFAULT_TONGUE_FARM_TAGS = ['lickquidator'];

function aggregateTongueFarm(entries: AbilityEntry[]): {
  bonusChance: number;
  appliesToEnemyTags: string[];
} {
  let total = 0;
  const tagSet = new Set<string>();

  for (const entry of entries) {
    if (!entry || entry.id !== 'tongue-farm') continue;
    const params = entry.params || {};
    const rawBonus = (params as any).bonusChance;
    const sourceCap = (params as any).maxBonus;
    const bonus =
      typeof rawBonus === 'number' && Number.isFinite(rawBonus) && rawBonus > 0
        ? rawBonus
        : 0;
    const capped =
      typeof sourceCap === 'number' &&
      Number.isFinite(sourceCap) &&
      sourceCap >= 0
        ? Math.min(bonus, sourceCap)
        : bonus;
    total += Math.max(0, capped);

    const appliesRaw = (params as any).appliesToEnemyTags;
    const tags =
      Array.isArray(appliesRaw) && appliesRaw.length > 0
        ? appliesRaw.filter((t) => typeof t === 'string' && t.length > 0)
        : DEFAULT_TONGUE_FARM_TAGS;
    for (const t of tags) tagSet.add(t);
  }

  const clamped = Math.max(0, Math.min(MAX_TONGUE_FARM_BONUS, total));
  const tags =
    tagSet.size > 0 ? Array.from(tagSet) : [...DEFAULT_TONGUE_FARM_TAGS];
  return { bonusChance: clamped, appliesToEnemyTags: tags };
}

interface BuildHeroDetailsArgs {
  isCharacterHydrated: boolean;
  selectedCharacterId: string | null;
  selectedCharacterName: string;
  progressionModifiers: ReturnType<typeof computeProgressionModifiers>;
  svgIdToItemTypeId: Map<number, number>;
  gotchiEquipById: Record<number, GotchiSpriteEntry>;
  equippedWearablesWithQuality?: Array<{
    slot: EquipmentSlotName;
    slug: string;
    quality: QualityTier;
    durabilityScore?: number | null;
  }>;
}

function buildHeroDetails({
  isCharacterHydrated,
  selectedCharacterId,
  selectedCharacterName,
  progressionModifiers,
  svgIdToItemTypeId,
  gotchiEquipById,
  equippedWearablesWithQuality,
}: BuildHeroDetailsArgs): HeroDetails | null {
  if (!isCharacterHydrated) return null;
  if (!selectedCharacterId) return null;

  try {
    const fallbackCharacter = CHARACTERS[0];
    const isDynamic = selectedCharacterId?.startsWith('gotchi:') ?? false;
    const selectedCharacter = isDynamic
      ? fallbackCharacter
      : CHARACTERS.find((c) => c.id === selectedCharacterId) ||
        fallbackCharacter;
    const previewId = isDynamic ? selectedCharacterId : selectedCharacter.id;
    const normalizedCharacterId = isDynamic
      ? null
      : selectedCharacter.id.toLowerCase();
    const archetypeId = normalizedCharacterId
      ? (RUN_ARCHETYPE_BY_CHARACTER_ID[normalizedCharacterId] ?? null)
      : null;
    const archetypeDef = archetypeId
      ? RUN_ARCHETYPES_BY_ID[archetypeId]
      : undefined;
    const archetypeName = archetypeDef?.name ?? null;
    const runTraitSummary = archetypeDef
      ? formatKillStreakTraitSummary(archetypeDef.levelTrait)
      : null;
    const baseDescription = isDynamic
      ? 'Your connected Aavegotchi hero. Stats and abilities depend on equipped wearables and allocated traits.'
      : selectedCharacter.info.description;

    const abilityEntries: AbilityEntry[] = [];
    let wearables: HeroWearableSummary[] = [];
    let baseDamageRange = { min: 10, max: 10 };
    let baseAttackSpeed = 1000;
    let baseMaxHealth = 100;
    let attackRange: number | null = isDynamic ? 80 : null;
    let weaponType: string | undefined = isDynamic ? 'melee' : undefined;
    let projectileSpeed: number | null = null;
    let movementSpeed: number | null = null;
    const weapons: HeroWeaponSummary[] = [];

    if (isDynamic) {
      const derivedStats = resolveLobbyGotchiDerivedStats({
        selectedCharacterId,
        svgIdToItemTypeId,
        gotchiEquipById,
        equippedWearablesWithQuality,
      });

      // Populate hero details from derived stats (wearable modifiers applied)
      baseDamageRange = { ...derivedStats.damageRange };
      baseAttackSpeed = derivedStats.attackSpeed ?? baseAttackSpeed;
      baseMaxHealth = derivedStats.maxHealth ?? baseMaxHealth;
      weaponType = derivedStats.weaponType ?? weaponType;
      attackRange =
        (derivedStats.weaponType === 'ranged'
          ? derivedStats.rangedAttackRange
          : derivedStats.meleeAttackRange) ?? attackRange;
      projectileSpeed = derivedStats.projectileSpeed ?? null;
      movementSpeed = derivedStats.movementSpeed ?? null;

      wearables = applyWearablePreviewState(
        buildHeroWearableSummaries(derivedStats),
        equippedWearablesWithQuality
      );

      derivedStats.weapons.forEach((weapon) => {
        weapons.push({
          id: weapon.id,
          svgId: weapon.id,
          name: weapon.name,
          weaponType: weapon.weaponType,
          attackSpeed: weapon.attackSpeed ?? null,
          damageRange: weapon.damageRange
            ? { ...weapon.damageRange }
            : typeof weapon.damage === 'number'
              ? { min: weapon.damage, max: weapon.damage }
              : null,
        });
        appendAbilities(abilityEntries, weapon.abilities);
      });

      appendAbilities(abilityEntries, derivedStats.abilities);
    } else {
      const derivedStats = getCharacterStats(selectedCharacter.id, {
        equippedWearablesWithQuality,
      });
      baseDamageRange = { ...derivedStats.damageRange };
      baseAttackSpeed = derivedStats.attackSpeed ?? baseAttackSpeed;
      baseMaxHealth = derivedStats.maxHealth ?? baseMaxHealth;
      weaponType = derivedStats.weaponType ?? weaponType;
      attackRange =
        (derivedStats.weaponType === 'ranged'
          ? derivedStats.rangedAttackRange
          : derivedStats.meleeAttackRange) ?? attackRange;
      projectileSpeed = derivedStats.projectileSpeed ?? null;
      movementSpeed = derivedStats.movementSpeed ?? null;
      wearables = applyWearablePreviewState(
        buildHeroWearableSummaries(derivedStats),
        equippedWearablesWithQuality
      );

      appendAbilities(abilityEntries, derivedStats.abilities);

      if (
        derivedStats.abilities.length === 0 &&
        Array.isArray(selectedCharacter.info.abilities)
      ) {
        appendAbilities(abilityEntries, selectedCharacter.info.abilities);
      }

      derivedStats.weapons.forEach((weapon) => {
        weapons.push({
          id: weapon.id,
          svgId: weapon.id,
          name: weapon.name,
          weaponType: weapon.weaponType,
          attackSpeed: weapon.attackSpeed ?? null,
          damageRange: weapon.damageRange
            ? { ...weapon.damageRange }
            : typeof weapon.damage === 'number'
              ? { min: weapon.damage, max: weapon.damage }
              : null,
        });
        appendAbilities(abilityEntries, weapon.abilities);
      });
      // Note: derivedStats.abilities already include wearable abilities; avoid double-adding
    }

    // Ensure hero details do not list weapon wearables in the Wearables section
    wearables = wearables.filter((entry) => !entry.wearable.weapon);

    const pm = progressionModifiers;
    const finalDamageRange = {
      min: Math.max(1, Math.round(baseDamageRange.min * pm.damageMultiplier)),
      max: Math.max(1, Math.round(baseDamageRange.max * pm.damageMultiplier)),
    };
    const finalAttackSpeed = Math.max(
      150,
      Math.round(baseAttackSpeed * pm.attackSpeedScalar)
    );
    const finalMaxHealth = Math.max(
      1,
      Math.round(baseMaxHealth * pm.maxHealthMultiplier + pm.maxHealthFlatBonus)
    );

    const abilityMap = new Map<string, AbilityEntry>();
    abilityEntries.forEach((entry) => {
      const existing = abilityMap.get(entry.id);
      if (!existing) {
        abilityMap.set(entry.id, {
          id: entry.id,
          params: entry.params ?? null,
        });
        return;
      }
      if (!existing.params && entry.params) {
        abilityMap.set(entry.id, { id: entry.id, params: entry.params });
      }
    });

    // Post-process: aggregate stacking for Tongue Farm so preview shows total
    if (abilityEntries.some((e) => e.id === 'tongue-farm')) {
      const agg = aggregateTongueFarm(abilityEntries);
      abilityMap.set('tongue-farm', {
        id: 'tongue-farm',
        params: {
          bonusChance: agg.bonusChance,
          appliesToEnemyTags: agg.appliesToEnemyTags,
        },
      });
    }

    const abilities = Array.from(abilityMap.values()).sort((a, b) =>
      getAbilityLabel(a.id).localeCompare(getAbilityLabel(b.id))
    );

    return {
      name: selectedCharacterName,
      description: baseDescription,
      tier: isDynamic ? 'unique' : selectedCharacter.info.tier,
      archetypeName,
      runTraitSummary,
      characterClass: selectedCharacter.info.characterClass,
      previewId,
      isDynamic,
      stats: {
        maxHealth: finalMaxHealth,
        damageRange: finalDamageRange,
        attackSpeedMs: finalAttackSpeed,
        attackRange,
        weaponType,
        projectileSpeed,
        movementSpeed,
      },
      formatted: {
        hp: `${finalMaxHealth}`,
        damage:
          finalDamageRange.min === finalDamageRange.max
            ? `${finalDamageRange.min}`
            : `${finalDamageRange.min}-${finalDamageRange.max}`,
        attackSpeed: formatAttacksPerSecond(finalAttackSpeed),
      },
      wearables,
      abilities,
      weapons,
    } satisfies HeroDetails;
  } catch {
    return null;
  }
}

export interface LobbyProps {
  // Character state
  selectedCharacterId: string | null;
  isCharacterHydrated: boolean;
  onCharacterSelect: (characterId: string) => void;
  onUnlockCharacter: (characterId: string) => Promise<void>;
  unlockedCharacters: string[];
  isDevMode?: boolean;

  // Difficulty state
  selectedDifficultyTier: string;
  onDifficultySelect: (tier: string) => void;
  stakedUsdcBalance: number;

  // Wallet state
  isWalletConnected: boolean;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  ctaDisabledReason?: string | null;
  ctaDisabledReasonLinkHref?: string | null;
  ctaDisabledReasonLinkLabel?: string | null;
  joinInfo?: {
    roomId: string;
    playerCount?: number;
    maxPlayers?: number;
    regionName?: string;
  } | null;
  isDifficultyLocked?: boolean;

  // Game state
  isStarting: boolean;
  gameStarted: boolean;
  error: string | null;
  onStartGame: () => void;
  onError: (error: string | null) => void;
  onStartTreasureRoom?: () => void;

  // Inventory for difficulty selector
  lickTongueCount: number;

  // Daily runs
  dailyRuns: DailyRunsStatus | null;
  dailyRunsLoading?: boolean;
  dailyRunsError?: string | null;
  dailyRunsExhausted?: DailyRunsExhaustedPayload | null;
  onDailyRunsDismiss?: () => void;
  onStakeUsdc?: () => void;

  // Progression
  progressionProfile: ProgressionProfile;
  onAdjustStats?: () => void;

  // Leverage selection
  leverage: number;
  onLeverageChange: (value: number) => void;
  tradeLeverage: number;
  onTradeLeverageChange: (value: number) => void;
  tradeToken: TradeToken;
  onTradeTokenChange: (value: TradeToken) => void;
  tradeDirection: TradeDirection;
  onTradeDirectionChange: (value: TradeDirection) => void;

  // Auto-ascend selection
  autoAscendFloor: number;
  onAutoAscendFloorChange: (value: number) => void;

  // Potion counts
  healthPotionCounts: { tier1: number; tier2: number; tier3: number };
  manaPotionCount: number;

  // Daily Quest callbacks
  onDailyQuestAttune?: (thresholdScore: number | null) => void;

  // Mode selection
  selectedMode: GameMode;
  onModeChange: (mode: GameMode) => void;
  speedRunMultiplier: number;
  onSpeedRunMultiplierChange: (value: number) => void;
}

export function Lobby({
  selectedCharacterId,
  unlockedCharacters,
  isCharacterHydrated,
  onCharacterSelect,
  onUnlockCharacter,
  isDevMode = false,
  selectedDifficultyTier,
  onDifficultySelect,
  stakedUsdcBalance,
  isWalletConnected,
  ctaLabel,
  ctaDisabled,
  ctaDisabledReason,
  ctaDisabledReasonLinkHref,
  ctaDisabledReasonLinkLabel,
  joinInfo,
  isDifficultyLocked,
  isStarting,
  gameStarted,
  error,
  onStartGame,
  onError,
  lickTongueCount,
  dailyRuns,
  dailyRunsLoading = false,
  dailyRunsError = null,
  dailyRunsExhausted = null,
  onDailyRunsDismiss,
  onStakeUsdc,
  progressionProfile,
  onAdjustStats,
  leverage,
  onLeverageChange,
  tradeLeverage,
  onTradeLeverageChange,
  tradeToken,
  onTradeTokenChange,
  tradeDirection,
  onTradeDirectionChange,
  autoAscendFloor,
  onAutoAscendFloorChange,
  healthPotionCounts,
  manaPotionCount,
  onDailyQuestAttune,
  selectedMode,
  onModeChange,
  speedRunMultiplier,
  onSpeedRunMultiplierChange,
}: LobbyProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasValidSession, playerId } = useSession();
  const {
    isAuthorized,
    equipment,
    inventory,
    gotchiSprites: gotchiSpritesContext,
    stakedGhstBalance,
  } = usePlayer();
  const isHeroSelectionEnabled = isAuthorized || isDevMode;
  const regionServerUrl = getServerUrlForRegion();
  const { state: equipmentState, refresh: refreshEquipment } = equipment;
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [characterTab, setCharacterTab] = useState<'characters' | 'gotchis'>(
    'characters'
  );
  const [difficultyDialogOpen, setDifficultyDialogOpen] = useState(false);
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [targetFloorDialogOpen, setTargetFloorDialogOpen] = useState(false);
  const [speedRunDialogOpen, setSpeedRunDialogOpen] = useState(false);
  const [dailyQuestInfoOpen, setDailyQuestInfoOpen] = useState(false);
  const [dailyRunsInfoOpen, setDailyRunsInfoOpen] = useState(false);
  const [upgradeTierOpen, setUpgradeTierOpen] = useState(false);
  const [upgradeTierTargetStakeThreshold, setUpgradeTierTargetStakeThreshold] =
    useState<number | null>(null);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [craftingDialogOpen, setCraftingDialogOpen] = useState(false);
  const [craftingDialogPreferredTab, setCraftingDialogPreferredTab] = useState<
    'craft' | 'forge'
  >('craft');
  const [openRunsDialogOpen, setOpenRunsDialogOpen] = useState(false);
  const [openRuns, setOpenRuns] = useState<OpenTradeRunEstimate[]>([]);
  const [openRunsLoading, setOpenRunsLoading] = useState(false);
  const [openRunsError, setOpenRunsError] = useState<string | null>(null);
  const [openRunsActionPendingRunId, setOpenRunsActionPendingRunId] = useState<
    string | null
  >(null);
  const tradeMarketStatsCacheRef = useRef<
    Partial<Record<TradeToken, TradeMarketStatsResponse>>
  >({});
  const [tradeMarketStatsByToken, setTradeMarketStatsByToken] = useState<
    Partial<Record<TradeToken, TradeMarketStatsResponse>>
  >({});
  const [tradeMarketStatsLoadingToken, setTradeMarketStatsLoadingToken] =
    useState<TradeToken | null>(null);
  const [tradeMarketStatsErrorByToken, setTradeMarketStatsErrorByToken] =
    useState<Partial<Record<TradeToken, string>>>({});

  const selectorPanelRef = useRef<HTMLDivElement>(null);
  const characterRowRef = useRef<HTMLDivElement>(null);
  const difficultyRowRef = useRef<HTMLButtonElement>(null);

  const difficultySelectable = !isDifficultyLocked;

  const forgeAnnouncementHref = useMemo(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('openPanel', 'forge');
    const queryString = nextParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (searchParams.get('openPanel') !== 'forge') {
      return;
    }

    setCraftingDialogPreferredTab('forge');
    setCraftingDialogOpen(true);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('openPanel');
    const nextHref = nextParams.toString()
      ? `${pathname}?${nextParams.toString()}`
      : pathname;
    router.replace(nextHref, { scroll: false });
  }, [pathname, router, searchParams]);

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    []
  );
  const scoreFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );
  const compactFormatters = useMemo(
    () => ({
      oneDecimal: new Intl.NumberFormat(undefined, {
        notation: 'compact',
        compactDisplay: 'short',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
      zeroDecimal: new Intl.NumberFormat(undefined, {
        notation: 'compact',
        compactDisplay: 'short',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    }),
    []
  );
  const goldCoinCount = useMemo(() => {
    return inventory.inventoryItems
      .filter(isGoldCurrency)
      .reduce((total, item) => total + item.quantity, 0);
  }, [inventory.inventoryItems]);

  const formattedStakedUsdc = numberFormatter.format(stakedUsdcBalance);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const dailyRunsResetAt =
    dailyRunsExhausted?.resetAtUtc ?? dailyRuns?.resetAtUtc ?? null;
  const dailyRunsAllowed =
    dailyRuns?.allowedRuns ?? dailyRunsExhausted?.allowedRuns ?? null;
  const dailyRunsRemaining =
    dailyRuns?.remainingRuns ??
    (dailyRunsExhausted && dailyRunsAllowed != null
      ? Math.max(0, dailyRunsAllowed - dailyRunsExhausted.usedRuns)
      : null);
  type StakeCurrencyMode = 'USDC' | 'GHST';
  const [stakeCurrencyMode, setStakeCurrencyMode] = useState<StakeCurrencyMode>('USDC');

  const dailyRunsStakedUsdcGho = useMemo(
    () =>
      resolveUpgradeTierStakeTotal({
        progressionTotalStaked: stakedUsdcBalance,
        dailyRuns: dailyRuns
          ? {
              totalStaked: dailyRuns.totalStaked,
              usdcStaked: dailyRuns.usdcStaked,
              ghoStaked: dailyRuns.ghoStaked,
            }
          : null,
        exhausted: dailyRunsExhausted
          ? {
              totalStaked: dailyRunsExhausted.totalStaked,
              usdcStaked: dailyRunsExhausted.usdcStaked,
              ghoStaked: dailyRunsExhausted.ghoStaked,
            }
          : null,
      }),
    [dailyRuns, dailyRunsExhausted, stakedUsdcBalance]
  );

  const dailyRunsStakedGhst = stakedGhstBalance;

  const dailyRunsStakedForTiers = dailyRunsStakedUsdcGho;
  const dailyRunsTiers = useMemo(() => {
    return [...(dailyRuns?.tiers ?? [])].sort(
      (a, b) => a.usdcStakedGte - b.usdcStakedGte
    );
  }, [dailyRuns?.tiers]);
  const dailyRunsCurrentTier = useMemo(() => {
    if (!dailyRuns) return null;
    return dailyRunsTiers.reduce<DailyRunsTier | null>((acc, tier) => {
      if (dailyRunsStakedForTiers >= tier.usdcStakedGte) {
        return tier;
      }
      return acc;
    }, null);
  }, [dailyRunsStakedForTiers, dailyRunsTiers]);
  const dailyRunsCountdown = useMemo(() => {
    return formatCountdown(dailyRunsResetAt, nowMs);
  }, [dailyRunsResetAt, nowMs]);

  const upgradeTierViewModel = useMemo(() => {
    return buildUpgradeTierViewModel(dailyRunsStakedForTiers);
  }, [dailyRunsStakedForTiers]);
  const isMaxTierReached = upgradeTierViewModel.nextTierNumber == null;
  const upgradeTierConfigs = useMemo(() => getUpgradeTierConfigs(), []);
  const availableUpgradesCountUsdc = useMemo(() => {
    return upgradeTierConfigs.filter(
      (tier) => tier.stakeThreshold > dailyRunsStakedUsdcGho
    ).length;
  }, [upgradeTierConfigs, dailyRunsStakedUsdcGho]);
  const availableUpgradesCountGhst = useMemo(() => {
    return upgradeTierConfigs.filter(
      (tier) => tier.stakeThreshold > dailyRunsStakedGhst
    ).length;
  }, [upgradeTierConfigs, dailyRunsStakedGhst]);
  const availableUpgradesCount =
    availableUpgradesCountUsdc + availableUpgradesCountGhst;
  const canStake = Boolean(onStakeUsdc && hasValidSession && isWalletConnected);
  const stakeDisabledReason = canStake
    ? null
    : onStakeUsdc
      ? 'Connect your wallet to stake.'
      : 'Staking is unavailable right now.';

  const handleUpgradeTierOpenChange = useCallback((open: boolean) => {
    setUpgradeTierOpen(open);
    if (!open) {
      setUpgradeTierTargetStakeThreshold(null);
    }
  }, []);

  useEffect(() => {
    if (!dailyRunsResetAt && openRuns.length === 0) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [dailyRunsResetAt, openRuns.length]);

  useEffect(() => {
    if (!tradeDialogOpen || selectedMode !== 'competitive') return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [tradeDialogOpen, selectedMode]);
  const allocatedStats = progressionProfile.stats;
  const progressionModifiers = useMemo(
    () => computeProgressionModifiers(allocatedStats),
    [allocatedStats]
  );
  const unspentPoints = Math.max(0, progressionProfile.unspentPoints);

  // Ensure equipment state reflects the currently selected hero
  useEffect(() => {
    if (!hasValidSession || !playerId) return;
    // Refresh whenever selection changes so server resolves equipment for that hero
    void refreshEquipment();
  }, [selectedCharacterId, hasValidSession, playerId, refreshEquipment]);

  const equippedOverridesForSelected = useMemo(() => {
    if (!equipmentState) return undefined;
    if (equipmentState.characterId !== selectedCharacterId) return undefined;
    return equipmentState.equipment.map((entry) => ({
      slot: entry.slot,
      slug: entry.slug,
      quality: entry.quality,
      durabilityScore: entry.durabilityScore,
    }));
  }, [equipmentState, selectedCharacterId]);

  // Update cached gotchi wearable assignments when equipment state refreshes for a gotchi
  useEffect(() => {
    if (!equipmentState || !selectedCharacterId) return;
    if (!selectedCharacterId.startsWith('gotchi:')) return;
    if (equipmentState.characterId !== selectedCharacterId) return;
    
    const gotchiId = selectedCharacterId.split(':')[1];
    if (!gotchiId) return;
    
    // Update cached assignments with the merged wearables from equipment state
    const assignments = equipmentState.equippedWearablesWithQuality.map((entry) => ({
      slot: entry.slot as any,
      slug: entry.slug,
    }));
    
    if (assignments.length > 0) {
      setGotchiWearableAssignments(gotchiId, assignments);
      const slugs = assignments.map((a) => a.slug);
      setGotchiWearables(gotchiId, slugs);
    }
  }, [equipmentState, selectedCharacterId]);

  // Build svgId -> itemTypeId lookup once for gotchi equipment
  const svgIdToItemTypeId = useMemo(() => {
    const map = new Map<number, number>();
    try {
      Object.entries(itemTypes).forEach(([idStr, def]) => {
        const idNum = Number(idStr);
        if ((def as any) && Number.isFinite((def as any).svgId)) {
          map.set((def as any).svgId, idNum);
        }
      });
    } catch {}
    return map;
  }, []);

  // Load gotchi equipment so we can render wearables in the summary row
  const { byId: gotchiEquipById } = gotchiSpritesContext;
  const { entries: gotchiEntries } = gotchiSpritesContext;

  const isCompetitiveSelected = selectedMode === 'competitive';
  const isProgressionSelected = selectedMode === null;
  const activeTradeMarketStats = tradeMarketStatsByToken[tradeToken] ?? null;
  const activeTradeMarketStatsError = tradeMarketStatsErrorByToken[tradeToken] ?? null;
  const isActiveTradeMarketStatsLoading =
    tradeMarketStatsLoadingToken === tradeToken && !activeTradeMarketStats;
  const runLeverageMax = isCompetitiveSelected
    ? TRADE_LEVERAGE_MAX
    : PRACTICE_RUN_LEVERAGE_MAX;
  const leverageCardTitle = isCompetitiveSelected ? 'Predict' : 'Leverage';

  const finalCtaLabel = useMemo(() => {
    if (isStarting) return 'Connecting...';
    if (ctaLabel && ctaLabel !== 'Play Now') return ctaLabel;
    if (isCompetitiveSelected) {
      return 'Start Compete Run';
    }
    return 'Start Practice Run';
  }, [
    isStarting,
    ctaLabel,
    isCompetitiveSelected,
  ]);

  const buttonDisabled = isStarting || ctaDisabled;

  const handlePrimaryClick = useCallback(() => {
    onStartGame();
  }, [onStartGame]);

  // Daily quest competition preview
  const [dailyQuestLoading, setDailyQuestLoading] = useState(false);
  const [dailyQuestInfo, setDailyQuestInfo] = useState<{
    thresholdScore: number;
    referenceScore: number;
    remainingAttunements: number | null;
    activeDifficultyId: string | null;
    activeRunId: string | null;
    // Competition mode fields
    mode?: 'competition' | 'legacy';
    hasUnlockedTier?: boolean;
    unlockRequired?: number;
    multiplierStatus?: {
      currentMultiplier: number;
      hoursSinceReset: number;
      minutesUntilNextTier: number | null;
    };
    prizePool?: { usdc: number; ghst: number };
    currentEntry?: {
      rawScore: number;
      finalScore: number;
      timeMultiplier: number;
      gotchiBonusMultiplier: number;
      isRealGotchi: boolean;
      rank: number | null;
    } | null;
  } | null>(null);

  const fetchDailyQuestInfo = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasValidSession || !selectedDifficultyTier || !regionServerUrl) {
        setDailyQuestInfo(null);
        return;
      }

      setDailyQuestLoading(true);
      try {
        const url = new URL('/api/daily-runs/preview', regionServerUrl);
        url.searchParams.set('difficultyId', selectedDifficultyTier);
        const resp = await fetchDedupe(url.toString(), {
          method: 'GET',
          credentials: 'include',
          signal,
        });
        if (!resp.ok) {
          setDailyQuestInfo(null);
          return;
        }
        const data = await resp.json();
        const thresholdScore = Math.max(
          0,
          Math.floor(Number(data?.thresholdScore) || 0)
        );
        const referenceScore = Math.max(
          0,
          Math.floor(Number(data?.referenceScore) || 0)
        );
        const rawRemaining = Number((data as any)?.remainingAttunements);
        const remainingAttunements =
          Number.isFinite(rawRemaining) && rawRemaining >= 0
            ? Math.floor(rawRemaining)
            : null;
        const activeDifficultyId =
          typeof data?.activeDifficultyId === 'string'
            ? data.activeDifficultyId
            : null;
        const activeRunId =
          typeof data?.activeRunId === 'string' ? data.activeRunId : null;

        const info = {
          thresholdScore,
          referenceScore,
          remainingAttunements,
          activeDifficultyId,
          activeRunId,
          // Competition mode fields
          mode: data?.mode as 'competition' | 'legacy' | undefined,
          hasUnlockedTier: data?.hasUnlockedTier ?? true,
          unlockRequired: data?.unlockRequired,
          multiplierStatus: data?.multiplierStatus,
          prizePool: data?.prizePool,
          currentEntry: data?.currentEntry,
        };

        setDailyQuestInfo(info);

        if (onDailyQuestAttune) {
          onDailyQuestAttune(thresholdScore ?? null);
        }
      } catch (error) {
        if ((error as any)?.name !== 'AbortError') {
          setDailyQuestInfo(null);
        }
      } finally {
        if (!signal?.aborted) {
          setDailyQuestLoading(false);
        }
      }
    },
    [
      hasValidSession,
      selectedDifficultyTier,
      regionServerUrl,
      onDailyQuestAttune,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchDailyQuestInfo(controller.signal);
    return () => controller.abort();
  }, [fetchDailyQuestInfo]);

  const refreshOpenRuns = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasValidSession || !regionServerUrl) {
        setOpenRuns([]);
        setOpenRunsError(null);
        setOpenRunsLoading(false);
        return;
      }

      setOpenRunsLoading(true);
      setOpenRunsError(null);
      try {
        const payload = await fetchOpenRuns(regionServerUrl, signal);
        if (signal?.aborted) return;
        const normalizedRuns = payload.runs.map((run) => ({
          ...run,
          riskLeverage: normalizeTradeWholeLeverage(run.riskLeverage),
        }));
        setOpenRuns(normalizedRuns);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        setOpenRunsError(
          error instanceof Error ? error.message : 'Failed to load open runs'
        );
      } finally {
        if (!signal?.aborted) {
          setOpenRunsLoading(false);
        }
      }
    },
    [hasValidSession, regionServerUrl]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshOpenRuns(controller.signal);
    return () => controller.abort();
  }, [playerId, refreshOpenRuns]);

  useEffect(() => {
    const handleOpenRunsRefresh = () => {
      void refreshOpenRuns();
    };

    window.addEventListener(OPEN_RUNS_REFRESH_EVENT, handleOpenRunsRefresh);
    return () => {
      window.removeEventListener(
        OPEN_RUNS_REFRESH_EVENT,
        handleOpenRunsRefresh
      );
    };
  }, [refreshOpenRuns]);

  const handleCloseOpenRun = useCallback(
    async (runId: string) => {
      if (!regionServerUrl) return;

      setOpenRunsActionPendingRunId(runId);
      setOpenRunsError(null);
      try {
        await closeRun(regionServerUrl, { runId });
        await Promise.all([refreshOpenRuns(), inventory.refreshInventory()]);
      } catch (error) {
        setOpenRunsError(
          error instanceof Error ? error.message : 'Failed to close run'
        );
      } finally {
        setOpenRunsActionPendingRunId(null);
      }
    },
    [inventory, refreshOpenRuns, regionServerUrl]
  );

  const handleExtendOpenRun = useCallback(
    async (runId: string) => {
      if (!regionServerUrl) return;

      setOpenRunsActionPendingRunId(runId);
      setOpenRunsError(null);
      try {
        await extendRun(regionServerUrl, { runId });
        await Promise.all([refreshOpenRuns(), inventory.refreshInventory()]);
      } catch (error) {
        setOpenRunsError(
          error instanceof Error ? error.message : 'Failed to extend run'
        );
      } finally {
        setOpenRunsActionPendingRunId(null);
      }
    },
    [inventory, refreshOpenRuns, regionServerUrl]
  );

  const refreshTradeMarketStats = useCallback(
    async (signal?: AbortSignal) => {
      if (
        !hasValidSession ||
        !regionServerUrl ||
        !isCompetitiveSelected ||
        !tradeDialogOpen
      ) {
        setTradeMarketStatsLoadingToken(null);
        return;
      }

      const requestedToken = tradeToken;
      const hasCachedStats = Boolean(
        tradeMarketStatsCacheRef.current[requestedToken]
      );
      if (!hasCachedStats) {
        setTradeMarketStatsLoadingToken(requestedToken);
      }
      setTradeMarketStatsErrorByToken((current) => {
        if (!current[requestedToken]) {
          return current;
        }
        const next = { ...current };
        delete next[requestedToken];
        return next;
      });

      try {
        const payload = await fetchTradeMarketStats(
          regionServerUrl,
          requestedToken,
          signal
        );
        if (signal?.aborted) return;
        tradeMarketStatsCacheRef.current[requestedToken] = payload;
        setTradeMarketStatsByToken((current) => ({
          ...current,
          [requestedToken]: payload,
        }));
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load trade market stats';
        setTradeMarketStatsErrorByToken((current) => ({
          ...current,
          [requestedToken]: message,
        }));
      } finally {
        if (!signal?.aborted) {
          setTradeMarketStatsLoadingToken((current) =>
            current === requestedToken ? null : current
          );
        }
      }
    },
    [
      hasValidSession,
      isCompetitiveSelected,
      regionServerUrl,
      tradeDialogOpen,
      tradeToken,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshTradeMarketStats(controller.signal);
    return () => controller.abort();
  }, [refreshTradeMarketStats]);

  const hasDailyQuestAttunement =
    dailyQuestInfo && typeof dailyQuestInfo.remainingAttunements === 'number'
      ? dailyQuestInfo.remainingAttunements > 0
      : null;

  const hasDailyQuestRunsRemaining =
    dailyQuestInfo && typeof dailyQuestInfo.remainingAttunements === 'number'
      ? dailyQuestInfo.remainingAttunements > 0
      : null;
  const hasCompetitionRunsRemaining =
    !isCompetitiveSelected || hasDailyQuestRunsRemaining !== false;
  const isPrimaryCtaDisabled = buttonDisabled || !hasCompetitionRunsRemaining;

  const handleDevReplenishDailyQuest = useCallback(async () => {
    if (!regionServerUrl || !DEV_MODE) {
      return;
    }

    try {
      const url = new URL('/api/daily-runs/dev-replenish', regionServerUrl);
      const resp = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include',
      });

      if (!resp.ok) {
        throw new Error('Failed to replenish attunements');
      }

      // Refresh the daily quest info to show updated attunements
      await fetchDailyQuestInfo();
    } catch (error) {
      console.error('Failed to replenish daily quest:', error);
    }
  }, [regionServerUrl, fetchDailyQuestInfo]);

  // Bridge handler to satisfy CharacterSelector's async signature while
  // preserving Lobby's simpler prop type for onCharacterSelect
  const handleCharacterSelect = useCallback(
    async (
      characterId: string,
      _options?: { gotchiSpriteUrl?: string | null | undefined }
    ): Promise<void> => {
      await Promise.resolve(onCharacterSelect(characterId));
    },
    [onCharacterSelect]
  );

  const selectedCharacterName = useMemo(() => {
    if (!selectedCharacterId) return 'hero';
    try {
      const isDynamic = selectedCharacterId.startsWith('gotchi:');
      if (isDynamic) {
        const idPart = selectedCharacterId.split(':')[1];
        const idNum = parseInt(idPart || '0', 10);
        const rec = Number.isFinite(idNum) ? gotchiEquipById[idNum] : undefined;
        const name = rec?.name?.trim();
        return name && name.length > 0
          ? name
          : idPart
            ? `Gotchi #${idPart}`
            : 'Gotchi';
      }
      const selectedCharacter =
        CHARACTERS.find((c) => c.id === selectedCharacterId) || CHARACTERS[0];
      return selectedCharacter?.info.name ?? 'hero';
    } catch {
      return 'hero';
    }
  }, [selectedCharacterId, gotchiEquipById]);

  const selectedHeroDetails = useMemo<HeroDetails | null>(
    () =>
      buildHeroDetails({
        isCharacterHydrated,
        selectedCharacterId,
        selectedCharacterName,
        progressionModifiers,
        svgIdToItemTypeId,
        gotchiEquipById,
        equippedWearablesWithQuality: equippedOverridesForSelected,
      }),
    [
      isCharacterHydrated,
      selectedCharacterId,
      selectedCharacterName,
      progressionModifiers,
      svgIdToItemTypeId,
      gotchiEquipById,
      equippedOverridesForSelected,
    ]
  );

  return (
    <SplashBackground>
      {/* Header - thinner, merged */}
      <div className="mt-3 mb-2 max-w-md w-full mx-auto px-4">
        <LobbyAnnouncementBar
          id="forge-launch"
          message={FORGE_ANNOUNCEMENT_MESSAGE}
          linkHref={forgeAnnouncementHref}
          linkLabel={FORGE_ANNOUNCEMENT_LABEL}
        />
        <div className="flex items-center justify-between gap-3 text-white/90">
          <div className="min-w-0 text-left">
            <h1 className="text-3xl md:text-4xl font-hud font-black">
              DeFi Dungeon
            </h1>
            <div className="mt-1 flex items-center justify-start gap-3 text-xs text-gray-300">
              <WalletConnectControl />
              <span className="font-hud font-black">v0.2</span>
            </div>
          </div>
          {onStakeUsdc ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
              }}
              onClick={() => setUpgradeTierOpen(true)}
              className={
                isMaxTierReached
                  ? 'rounded-md font-medium transition-all text-xs py-1.5 px-3 bg-white/10 border border-white/20 text-white hover:bg-white/15 shrink-0'
                  : cn(
                      'relative overflow-hidden rounded-md px-3 py-1.5 shrink-0',
                      'text-xs font-bold text-white',
                      'transition-all duration-200',
                      'active:scale-[0.98]',
                      'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600',
                      'hover:from-amber-500 hover:via-amber-400 hover:to-yellow-500',
                      'shadow-[0_6px_18px_rgba(251,191,36,0.45)] hover:shadow-[0_8px_24px_rgba(251,191,36,0.6)]',
                      'border-2 border-amber-400/50'
                    )
              }
            >
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Upgrades ({availableUpgradesCount})</span>
              </span>
              {!isMaxTierReached && (
                <motion.span
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{
                    x: ['-100%', '100%'],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 1,
                    ease: 'linear',
                  }}
                />
              )}
            </motion.button>
          ) : null}
        </div>
        {allocatedStats && (
          <div className="mt-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-2 text-xs text-gray-300 whitespace-nowrap">
                  <Trophy className="h-4 w-4" />
                  <span className="tabular-nums">
                    {progressionProfile.level}
                  </span>
                </div>
                <div className="rounded-md px-3 py-1.5 flex items-center gap-4 text-xs whitespace-nowrap bg-white/10 backdrop-blur">
                  <div className="flex items-center gap-1">
                    <span>⚡</span>
                    <span className="font-semibold text-white">
                      {allocatedStats.energy}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🗡️</span>
                    <span className="font-semibold text-white">
                      {allocatedStats.aggression}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>❤️</span>
                    <span className="font-semibold text-white">
                      {allocatedStats.spookiness}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>🧠</span>
                    <span className="font-semibold text-white">
                      {allocatedStats.brainSize}
                    </span>
                  </div>
                </div>
                <div className="rounded-md px-3 py-1.5 flex items-center gap-3 text-xs whitespace-nowrap bg-white/10 backdrop-blur">
                  <div className="flex items-center gap-1">
                    <GoldCoinIcon className="w-3.5 h-3.5" />
                    <span className="font-semibold text-white">
                      {formatCompactCount(goldCoinCount, compactFormatters)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>👅</span>
                    <span className="font-semibold text-white">
                      {formatCompactCount(lickTongueCount, compactFormatters)}
                    </span>
                  </div>
                </div>
              </div>
              {typeof onAdjustStats === 'function' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onAdjustStats()}
                  className="ml-auto shrink-0 gap-1.5 h-7 px-3 py-1.5 text-xs"
                  aria-label="Allocate skill points"
                >
                  <Star className="h-4 w-4" />
                  {unspentPoints > 0 ? (
                    <span className="font-semibold tabular-nums">
                      {unspentPoints}
                    </span>
                  ) : null}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-6 max-w-md w-full mx-auto">
        {joinInfo && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-gray-200 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-white font-semibold">
                Joining room {joinInfo.roomId}
              </span>
              {typeof joinInfo.playerCount === 'number' &&
                typeof joinInfo.maxPlayers === 'number' && (
                  <span className="text-xs text-gray-400">
                    {joinInfo.playerCount}/{joinInfo.maxPlayers} players
                  </span>
                )}
            </div>
            {joinInfo.regionName && (
              <div className="text-[11px] text-gray-400 mt-2">
                Region: {joinInfo.regionName}
              </div>
            )}
          </div>
        )}

        {/* Main Panel - Character Selection */}
        <div
          className="rounded-xl bg-white/5 p-2 backdrop-blur"
          aria-labelledby="hero-heading"
        >
          {/* Accessible section label (visually hidden) */}
          <h2 id="hero-heading" className="sr-only">
            Hero
          </h2>
          {/* Character Selection */}
          <div>
            <div
              ref={characterRowRef}
              className={cn(
                'relative rounded-lg p-2',
                isHeroSelectionEnabled
                  ? 'cursor-pointer transition-all duration-200 hover:bg-white/10'
                  : 'cursor-default',
                characterDialogOpen && 'ring-2 ring-purple-500/50'
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (!isHeroSelectionEnabled) {
                  return;
                }
                // Don't toggle if clicking on a button or dialog
                const target = e.target as HTMLElement;
                if (
                  target.closest('button') ||
                  target.closest('[role="dialog"]')
                ) {
                  return;
                }
                setCharacterDialogOpen(true);
              }}
            >
              {isCharacterHydrated ? (
                selectedHeroDetails ? (
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="grid gap-y-2 gap-x-6 items-start flex-1 min-w-0"
                      style={{
                        gridTemplateColumns: `${selectedHeroDetails.isDynamic ? 96 : 80}px 1fr`,
                      }}
                    >
                      <div className="relative rounded-lg grid place-items-center shrink-0">
                        <CharacterPreview
                          characterId={selectedHeroDetails.previewId}
                          size="md"
                          isSelected={true}
                          className="flex-shrink-0"
                          allocatedStats={progressionProfile.stats}
                        />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <h4 className="text-base font-semibold text-gray-100 truncate">
                              {selectedCharacterName}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-gray-200">
                          <span>HP {selectedHeroDetails.formatted.hp}</span>
                          <span className="text-gray-500">•</span>
                          <span>
                            ATK {selectedHeroDetails.formatted.damage}
                          </span>
                          <span className="text-gray-500">•</span>
                          <span>
                            AS {selectedHeroDetails.formatted.attackSpeed}
                          </span>
                        </div>

                        {/* Wearable + weapon loadout row */}
                        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                          {selectedHeroDetails.weapons &&
                            selectedHeroDetails.weapons
                              .slice(0, 2)
                              .map((wep) => {
                                const iconSrc = resolveWeaponIconFor(wep);
                                return (
                                  <div
                                    key={`weapon-${wep.id}`}
                                    className="h-5 w-5 rounded bg-white/10 grid place-items-center shrink-0"
                                  >
                                    {iconSrc ? (
                                      <Image
                                        src={iconSrc}
                                        alt={wep.name}
                                        width={16}
                                        height={16}
                                        className="h-4 w-4 object-contain"
                                      />
                                    ) : (
                                      <span className="text-[7px] text-white/70">
                                        WPN
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                          {selectedHeroDetails.wearables &&
                            selectedHeroDetails.wearables
                              // Background is cosmetic and bloats this row.
                              // We intentionally keep the row one slot shorter to leave room for potions.
                              .filter(
                                (entry) =>
                                  !entry.wearable.slots.includes('background')
                              )
                              .slice(0, 5)
                              .map((entry) => {
                                const iconSrc = resolveWearableIconFor(
                                  entry.wearable
                                );
                                const qualityPreviewClasses =
                                  getWearableQualityPreviewClasses({
                                    quality: entry.quality,
                                    durabilityScore: entry.durabilityScore,
                                  });
                                const qualityTitle =
                                  entry.qualityLabel ??
                                  entry.quality.charAt(0).toUpperCase() +
                                    entry.quality.slice(1);
                                const durabilityTitle =
                                  typeof entry.durabilityScore === 'number'
                                    ? ` • ${entry.durabilityScore}/${durabilityCapForQuality(entry.quality)}`
                                    : '';
                                return (
                                  <div
                                    key={entry.wearable.id}
                                    className="h-5 w-5 rounded grid place-items-center shrink-0 transition-colors"
                                    style={{
                                      backgroundColor:
                                        qualityPreviewClasses.backgroundColor,
                                      border: qualityPreviewClasses.borderColor
                                        ? `1px solid ${qualityPreviewClasses.borderColor}`
                                        : undefined,
                                      boxShadow:
                                        qualityPreviewClasses.boxShadow,
                                    }}
                                    title={`${qualityTitle}${durabilityTitle}`}
                                    aria-label={`${entry.wearable.slug} ${qualityTitle}${durabilityTitle}`}
                                  >
                                    {iconSrc ? (
                                      <Image
                                        src={iconSrc}
                                        alt={entry.wearable.slug}
                                        width={16}
                                        height={16}
                                        className="h-4 w-4 object-contain"
                                      />
                                    ) : (
                                      <span className="text-[7px] text-white/70">
                                        {entry.wearable.slug}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                        </div>
                        {(healthPotionCounts.tier1 > 0 ||
                          healthPotionCounts.tier2 > 0 ||
                          healthPotionCounts.tier3 > 0 ||
                          manaPotionCount > 0) && (
                          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                            {/* Health Potions by Tier */}
                            {healthPotionCounts.tier1 > 0 && (
                              <div className="h-5 rounded bg-red-500/20 border border-red-400/40 px-1 flex items-center gap-0.5 shrink-0">
                                <Image
                                  src="/wearables/126.svg"
                                  alt="Health Potion"
                                  width={12}
                                  height={12}
                                  className="h-3 w-3 object-contain"
                                />
                                <span className="text-[10px] font-bold text-red-200 tabular-nums">
                                  {healthPotionCounts.tier1}
                                </span>
                              </div>
                            )}
                            {healthPotionCounts.tier2 > 0 && (
                              <div className="h-5 rounded bg-rose-500/20 border border-rose-400/40 px-1 flex items-center gap-0.5 shrink-0">
                                <Image
                                  src="/wearables/127.svg"
                                  alt="Greater Healing Potion"
                                  width={12}
                                  height={12}
                                  className="h-3 w-3 object-contain"
                                />
                                <span className="text-[10px] font-bold text-rose-200 tabular-nums">
                                  {healthPotionCounts.tier2}
                                </span>
                              </div>
                            )}
                            {healthPotionCounts.tier3 > 0 && (
                              <div className="h-5 rounded bg-fuchsia-500/20 border border-fuchsia-400/40 px-1 flex items-center gap-0.5 shrink-0">
                                <Image
                                  src="/wearables/129.svg"
                                  alt="Ultra Healing Potion"
                                  width={12}
                                  height={12}
                                  className="h-3 w-3 object-contain"
                                />
                                <span className="text-[10px] font-bold text-fuchsia-200 tabular-nums">
                                  {healthPotionCounts.tier3}
                                </span>
                              </div>
                            )}
                            {manaPotionCount > 0 && (
                              <div className="h-5 rounded bg-blue-500/20 border border-blue-400/40 px-1 flex items-center gap-0.5 shrink-0">
                                <Image
                                  src="/wearables/128.svg"
                                  alt="Mana Potion"
                                  width={12}
                                  height={12}
                                  className="h-3 w-3 object-contain"
                                />
                                <span className="text-[10px] font-bold text-blue-200 tabular-nums">
                                  {manaPotionCount}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center shrink-0">
                      <div
                        className={cn(
                          'transition-transform duration-200 text-gray-400 text-xs',
                          characterDialogOpen ? 'rotate-90' : 'rotate-0'
                        )}
                      >
                        ▶
                      </div>
                    </div>
                  </div>
                ) : selectedCharacterId ? (
                  <div className="text-xs text-gray-400">
                    Loading hero details...
                  </div>
                ) : (
                  <div className="text-center">
                    {isHeroSelectionEnabled ? (
                      <Button
                        type="button"
                        className="w-full rounded-none bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_12px_35px_rgba(99,102,241,0.35)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCharacterDialogOpen(true);
                        }}
                        aria-label="Select hero"
                      >
                        Select a Hero
                      </Button>
                    ) : (
                      <ApplyForAlpha />
                    )}
                  </div>
                )
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-10 h-10 bg-white/20 rounded-full animate-pulse flex-shrink-0" />
                    <div className="space-y-1.5">
                      <div className="h-3 bg-white/20 rounded animate-pulse w-20" />
                      <div className="h-2.5 bg-white/20 rounded animate-pulse w-16" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="h-4 bg-white/20 rounded animate-pulse w-12" />
                    <div className="w-2.5 h-2.5 bg-white/20 rounded animate-pulse" />
                  </div>
                </div>
              )}
            </div>
            {selectedCharacterId && selectedHeroDetails ? (
              <div className="mt-1.5 flex gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 25,
                      }}
                      className="flex-1 text-xs bg-transparent border border-white/30 text-white hover:bg-white/10 backdrop-blur py-1.5 rounded-md transition-colors"
                      aria-label="View stats"
                    >
                      View Stats
                    </motion.button>
                  </DialogTrigger>
                  <HeroDetailsView
                    details={selectedHeroDetails}
                    allocatedStats={progressionProfile.stats}
                  />
                </Dialog>
                <motion.button
                  type="button"
                  data-testid="inventory-button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                  onClick={() => router.push('/me/inventory')}
                  className="flex-1 text-xs bg-transparent border border-white/30 text-white hover:bg-white/10 backdrop-blur py-1.5 rounded-md transition-colors"
                  aria-label="Change gear"
                >
                  Change Gear
                </motion.button>
                <motion.button
                  type="button"
                  data-testid="shop-button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                  onClick={() => setShopDialogOpen(true)}
                  className="flex-1 text-xs bg-transparent border border-white/30 text-white hover:bg-white/10 backdrop-blur py-1.5 rounded-md transition-colors"
                  aria-label="Open shop"
                >
                  🛒 Shop
                </motion.button>
                <motion.button
                  type="button"
                  data-testid="crafting-button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                  onClick={() => {
                    setCraftingDialogPreferredTab('craft');
                    setCraftingDialogOpen(true);
                  }}
                  className="flex-1 text-xs bg-transparent border border-white/30 text-white hover:bg-white/10 backdrop-blur py-1.5 rounded-md transition-colors"
                  aria-label="Open crafting"
                >
                  ⚗️ Craft
                </motion.button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Run Selection & Start Game Card */}
        {(
          <div className="mt-0 rounded-xl bg-gradient-to-br from-white/10 via-white/5 to-white/5 border border-white/20 p-3 backdrop-blur shadow-lg">
            {/* Mode Selection */}
            <div className="mb-4">
              <div className="grid gap-2 mb-3 grid-cols-2">
                <button
                  type="button"
                  data-testid="mode-practice-button"
                  onClick={() => onModeChange(null)}
                  className={cn(
                    'py-3 px-4 rounded-lg border-2 transition-all duration-200 text-left',
                    isProgressionSelected
                      ? 'bg-indigo-600/30 border-indigo-500 ring-2 ring-indigo-400/30'
                      : 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">⚔️</span>
                    <span className="text-sm font-bold text-white">Practice</span>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-tight">
                    Earn XP + loot. Uses daily runs.
                  </p>
                </button>
                <button
                  type="button"
                  data-testid="mode-competitive-button"
                  onClick={() => onModeChange('competitive')}
                  className={cn(
                    'py-3 px-4 rounded-lg border-2 transition-all duration-200 text-left',
                    isCompetitiveSelected
                      ? 'bg-amber-600/30 border-amber-500 ring-2 ring-amber-400/30'
                      : 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🏆</span>
                    <span className="text-sm font-bold text-white">Compete</span>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-tight">
                    Daily Quest rewards. 3 runs per day.
                  </p>
                </button>
              </div>

            </div>

            {/* Primary CTA + Speed Selector */}
            <div className="mb-3 flex items-stretch gap-2">
              <Button
                data-testid="start-run-button"
                className={cn(
                  'flex-1 relative overflow-hidden',
                  'px-6 py-5 md:py-4',
                  'text-lg md:text-base font-black text-white',
                  'transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'active:scale-[0.98]',
                  isCompetitiveSelected
                    ? [
                        'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600',
                        'hover:from-amber-500 hover:via-amber-400 hover:to-yellow-500',
                        'shadow-[0_8px_32px_rgba(251,191,36,0.5)] hover:shadow-[0_12px_40px_rgba(251,191,36,0.6)]',
                        'border-2 border-amber-400/50',
                        'disabled:hover:shadow-[0_8px_32px_rgba(251,191,36,0.5)]',
                      ]
                    : [
                        'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600',
                        'hover:from-purple-500 hover:via-indigo-500 hover:to-blue-500',
                        'shadow-[0_8px_32px_rgba(99,102,241,0.4)] hover:shadow-[0_12px_40px_rgba(99,102,241,0.5)]',
                        'border-2 border-purple-400/50',
                        'disabled:hover:shadow-[0_8px_32px_rgba(99,102,241,0.4)]',
                      ]
                )}
                onClick={handlePrimaryClick}
                disabled={isPrimaryCtaDisabled}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <span className="text-xl">
                    {isCompetitiveSelected ? '🏆' : '⚔️'}
                  </span>
                  <span>{finalCtaLabel}</span>
                  {isCompetitiveSelected && (
                    <span className="text-xs bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 rounded font-bold">
                      Compete
                    </span>
                  )}
                </span>
                {!isPrimaryCtaDisabled && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{
                      x: ['-100%', '100%'],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatDelay: 1,
                      ease: 'linear',
                    }}
                  />
                )}
              </Button>

              <button
                type="button"
                data-testid="speed-open"
                onClick={(e) => {
                  e.stopPropagation();
                  setSpeedRunDialogOpen(true);
                }}
                aria-label="Set speed multiplier"
                className="shrink-0 self-stretch min-w-[76px] rounded-xl bg-white/5 border border-white/10 px-2.5 md:px-3 py-0 flex items-center justify-center backdrop-blur text-white font-semibold text-xs md:text-sm cursor-pointer transition-all duration-200 hover:bg-white/10"
              >
                {speedRunMultiplier}x
              </button>
            </div>

            {/* Difficulty, Leverage & Target Floor */}
            <div className="mb-3 grid grid-cols-3 gap-3">
              {/* Difficulty Selection */}
              <button
                ref={difficultyRowRef}
                type="button"
                data-testid="difficulty-selector-button"
                onClick={(e) => {
                  if (!difficultySelectable) return;
                  e.stopPropagation();
                  setDifficultyDialogOpen(true);
                }}
                disabled={!difficultySelectable}
                className={cn(
                  'rounded-xl bg-white/5 border border-white/10 p-2 backdrop-blur text-left',
                  difficultySelectable
                    ? 'cursor-pointer transition-all duration-200 hover:bg-white/10'
                    : 'cursor-not-allowed opacity-50'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Swords className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">
                      Difficulty
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {(() => {
                    const selectedDifficulty = getDifficultyTier(
                      selectedDifficultyTier
                    );
                    if (!selectedDifficulty)
                      return (
                        <span className="text-xs text-gray-400">None</span>
                      );

                    const getTierIcon = (tierId: string) => {
                      if (tierId.startsWith('normal')) return '⚡';
                      if (
                        tierId.startsWith('nightmare') ||
                        tierId === 'nightmare'
                      )
                        return '👁️';
                      if (tierId.startsWith('hell') || tierId === 'hell')
                        return '🔥';
                      return '⚡';
                    };

                    const getTierColorClass = (tierId: string) => {
                      if (tierId.startsWith('normal')) return 'text-green-400';
                      if (tierId.startsWith('nightmare'))
                        return 'text-purple-400';
                      if (tierId.startsWith('hell') || tierId === 'hell')
                        return 'text-red-400';
                      return 'text-gray-400';
                    };

                    return (
                      <>
                        <span
                          className={cn(
                            'text-sm',
                            getTierColorClass(selectedDifficulty.id)
                          )}
                        >
                          {getTierIcon(selectedDifficulty.id)}
                        </span>
                        <span className="text-xs font-semibold text-gray-400 truncate">
                          {selectedDifficulty.name}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </button>

              {/* Target Floor Selection */}
              <button
                type="button"
                data-testid="target-floor-open"
                onClick={(e) => {
                  e.stopPropagation();
                  setTargetFloorDialogOpen(true);
                }}
                className="rounded-xl bg-white/5 border border-white/10 p-2 backdrop-blur text-left cursor-pointer transition-all duration-200 hover:bg-white/10"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Ghost className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">
                      Floor
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs font-semibold text-gray-400">
                    Floor {autoAscendFloor}
                  </span>
                </div>
              </button>

              {/* Predict/Leverage Selection */}
              <button
                type="button"
                data-testid="trade-open"
                onClick={(e) => {
                  e.stopPropagation();
                  setTradeDialogOpen(true);
                }}
                className="rounded-xl bg-white/5 border border-white/10 p-2 backdrop-blur text-left cursor-pointer transition-all duration-200 hover:bg-white/10"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-gray-100 uppercase tracking-wider">
                      {leverageCardTitle}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs font-semibold text-gray-400">
                    {isCompetitiveSelected ? (
                      <>
                        {tradeToken} {tradeDirection === 'short' ? '📉' : '📈'}{' '}
                        {formatTradeLeverage(tradeLeverage)} +{' '}
                        {formatRunLeverage(leverage, runLeverageMax)}
                      </>
                    ) : (
                      formatRunLeverage(leverage, runLeverageMax)
                    )}
                  </span>
                </div>
              </button>

            </div>

            {/* Daily Quest Section - Only show in Competitive Mode */}
            {dailyQuestInfo && selectedMode === 'competitive' && (
              <div
                className={cn(
                  'mb-4 rounded-xl border p-2.5 backdrop-blur',
                  hasDailyQuestRunsRemaining
                    ? 'bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-500/50'
                    : 'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-500/30'
                )}
              >
                {dailyQuestLoading ? (
                  <div className="text-xs text-amber-200/60">Loading...</div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      {/* Left side - Title and Info */}
                      <div className="flex items-center gap-2">
                        <Trophy className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-amber-100 uppercase tracking-wider whitespace-nowrap">
                          {dailyQuestInfo.mode === 'competition'
                            ? 'Compete'
                            : 'Daily Quest'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDailyQuestInfoOpen(true);
                          }}
                          className="text-amber-300/60 hover:text-amber-300 transition-colors"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        {hasDailyQuestRunsRemaining && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/30 text-amber-200 font-semibold whitespace-nowrap">
                            READY
                          </span>
                        )}
                      </div>

                      {/* Middle - Competition Multiplier or Threshold */}
                      <div className="flex items-center gap-2 text-[10px] flex-1 min-w-0">
                        {dailyQuestInfo.mode === 'competition' &&
                        dailyQuestInfo.multiplierStatus ? (
                          <>
                            <span className="text-amber-100 font-mono font-bold">
                              {dailyQuestInfo.multiplierStatus.currentMultiplier.toFixed(
                                2
                              )}
                              ×
                            </span>
                            <span className="text-amber-200/70 whitespace-nowrap">
                              bonus
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-amber-200/70 whitespace-nowrap">
                              Need:
                            </span>
                            <span className="text-amber-100 font-mono font-semibold">
                              {scoreFormatter.format(
                                dailyQuestInfo.thresholdScore
                              )}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Right side - Attunements and Status */}
                      <div className="flex items-center gap-2">
                        {typeof dailyQuestInfo.remainingAttunements ===
                          'number' && (
                          <div
                            className={cn(
                              'px-1.5 py-0.5 rounded font-mono text-[10px] font-bold whitespace-nowrap',
                              dailyQuestInfo.remainingAttunements > 0
                                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                                : 'bg-gray-500/20 border border-gray-500/30 text-gray-400'
                            )}
                          >
                            {dailyQuestInfo.remainingAttunements} left
                          </div>
                        )}

                        {dailyQuestInfo.currentEntry && (
                          <span className="text-[10px] text-amber-100 font-semibold whitespace-nowrap">
                            #{dailyQuestInfo.currentEntry.rank ?? '?'} •{' '}
                            {scoreFormatter.format(
                              dailyQuestInfo.currentEntry.finalScore
                            )}{' '}
                            {dailyQuestInfo.currentEntry.isRealGotchi
                              ? '(+25% gotchi)'
                              : ''}
                          </span>
                        )}

                        {dailyQuestInfo.mode === 'competition' ? (
                          dailyQuestInfo.hasUnlockedTier === false ? (
                            <span className="text-[10px] text-gray-400 whitespace-nowrap px-2">
                              🔒 Need {dailyQuestInfo.unlockRequired} LT
                            </span>
                          ) : hasDailyQuestRunsRemaining ? null : (
                            <span className="text-[10px] text-gray-400 whitespace-nowrap px-2">
                              Depleted
                            </span>
                          )
                        ) : hasDailyQuestRunsRemaining ? null : (
                          <span className="text-[10px] text-gray-400 whitespace-nowrap px-2">
                            Depleted
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dev Mode: Replenish Button (separate row when depleted) */}
                    {DEV_MODE && dailyQuestInfo.remainingAttunements === 0 && (
                      <div className="flex justify-end mt-2">
                        <Button
                          onClick={handleDevReplenishDailyQuest}
                          size="sm"
                          variant="outline"
                          className={cn(
                            'text-[10px] px-2 py-1 font-mono whitespace-nowrap',
                            'bg-blue-500/10 border border-blue-500/30',
                            'hover:bg-blue-500/20 text-blue-300',
                            'h-auto'
                          )}
                          title="Dev: Replenish daily quest attunements"
                        >
                          🔄 Replenish
                        </Button>
                      </div>
                    )}
                  </>
                )}

              </div>
            )}

            {/* Daily Runs Section */}
            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-white tabular-nums leading-none">
                      {dailyRunsLoading
                        ? '—'
                        : dailyRunsRemaining ?? '—'}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      Runs Left
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDailyRunsInfoOpen(true);
                    }}
                    className="text-white/60 hover:text-white/90 transition-colors"
                    title="Daily runs information"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  {dailyRunsResetAt ? (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/10 border border-white/20">
                      <Clock className="w-3 h-3 text-white/70" />
                      <span className="text-[10px] font-bold text-white/70 uppercase tracking-wide">
                        Reset {dailyRunsCountdown}
                      </span>
                    </div>
                  ) : null}
                </div>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 25,
                  }}
                  onClick={() => setOpenRunsDialogOpen(true)}
                  className="rounded-md px-3 py-1.5 flex items-center gap-2 text-xs whitespace-nowrap bg-white/10 backdrop-blur border border-white/20 hover:bg-white/15 transition-colors"
                  aria-label="Open runs"
                >
                  <Layers className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="font-semibold text-white">Open Runs</span>
                  {openRuns.length > 0 ? (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-100 text-[10px] font-bold tabular-nums grid place-items-center">
                      {openRuns.length}
                    </span>
                  ) : (
                    <span className="text-white/60 tabular-nums">0</span>
                  )}
                </motion.button>
              </div>

              {dailyRunsError ? (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-1.5 text-[11px] text-red-200">
                  Failed to load daily runs: {dailyRunsError}
                </div>
              ) : null}
            </div>

            {/* Status Messages */}
            {ctaDisabledReason && (
              <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-[11px] text-yellow-200 text-center">
                  {ctaDisabledReason}
                  {ctaDisabledReasonLinkHref && ctaDisabledReasonLinkLabel ? (
                    <>
                      {' '}
                      <a
                        href={ctaDisabledReasonLinkHref}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-yellow-100"
                      >
                        {ctaDisabledReasonLinkLabel}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            )}
            {error && (
              <div className="mt-2 p-2.5 bg-red-500/20 border border-red-500/30 rounded-lg backdrop-blur">
                <p className="text-red-300 text-xs mb-1.5">{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onError(null)}
                  className="h-7 text-red-300 hover:text-red-200 text-xs px-2"
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Bottom bar removed - CTA now lives in the Match card */}

        {/* Daily Runs Exhausted Dialog */}
        <Dialog
          open={Boolean(dailyRunsExhausted)}
          onOpenChange={(open) => {
            if (!open) {
              onDailyRunsDismiss?.();
            }
          }}
        >
          <DialogContent style={{ top: '50%', bottom: 'auto' }} className="max-w-md">
            <DialogHeader>
              <DialogTitle className="!text-2xl">Daily runs exhausted</DialogTitle>
              <DialogDescription>
                Your daily run allowance has been used up. Runs reset each day at
                00:00 UTC.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-2 text-sm text-white/80">
              <div className="flex items-center justify-between">
                <span>Runs used</span>
                <span className="text-white">
                  {dailyRunsExhausted?.usedRuns ?? '—'} /{' '}
                  {dailyRunsExhausted?.allowedRuns ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Reset in</span>
                <span className="text-white">{dailyRunsCountdown}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>USDC/GHO staked</span>
                <span className="text-white">
                  {formatFloat(dailyRunsStakedForTiers, 2)} USDC/GHO
                </span>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => {
                  onDailyRunsDismiss?.();
                  onStakeUsdc?.();
                }}
              >
                Stake more USDC/GHO
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDailyRunsDismiss?.()}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Character Dialog */}
        <Dialog
          open={characterDialogOpen}
          onOpenChange={setCharacterDialogOpen}
        >
          <DialogContent style={{ top: '50%', bottom: 'auto' }}>
            <DialogHeader>
              <DialogTitle>Choose your Hero</DialogTitle>
              <DialogDescription className="text-sm text-gray-300 grid grid-cols-[1fr_2fr_1fr] items-center gap-2">
                <div className="flex items-center gap-2">
                  Balance:{' '}
                  <span className="font-semibold text-white">
                    👅 {lickTongueCount}
                  </span>
                </div>
                <div className="flex justify-center">
                  <div className="inline-flex rounded-full bg-black/40 p-1 border border-white/10 backdrop-blur">
                    <button
                      aria-pressed={characterTab === 'characters'}
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full transition-colors',
                        characterTab === 'characters'
                          ? 'bg-purple-600/30 text-white border border-purple-500/30'
                          : 'text-gray-300 hover:text-white'
                      )}
                      onClick={() => setCharacterTab('characters')}
                    >
                      Heroes
                    </button>
                    <button
                      aria-pressed={characterTab === 'gotchis'}
                      className={cn(
                        'ml-1 px-2 py-0.5 text-xs rounded-full transition-colors',
                        characterTab === 'gotchis'
                          ? 'bg-purple-600/30 text-white border border-purple-500/30'
                          : 'text-gray-300 hover:text-white'
                      )}
                      onClick={() => setCharacterTab('gotchis')}
                    >
                      {`Gotchis${isWalletConnected ? ` (${gotchiEntries.length})` : ''}`}
                    </button>
                  </div>
                </div>
                <div></div>
              </DialogDescription>
            </DialogHeader>
            <CharacterSelector
              selectedCharacterId={selectedCharacterId}
              unlockedCharacters={unlockedCharacters}
              lickTongueCount={lickTongueCount}
              onCharacterSelect={async (characterId, options) => {
                await handleCharacterSelect(characterId, options);
                setCharacterDialogOpen(false);
              }}
              onUnlockCharacter={onUnlockCharacter}
              isHydrated={isCharacterHydrated}
              progressionProfile={progressionProfile}
              activeTab={characterTab}
              onTabChange={setCharacterTab}
              serverBaseUrl={regionServerUrl}
            />
          </DialogContent>
        </Dialog>

        {/* Difficulty Dialog */}
        <Dialog
          open={difficultyDialogOpen}
          onOpenChange={setDifficultyDialogOpen}
        >
          <DialogContent style={{ top: '50%', bottom: 'auto' }}>
            <DialogHeader>
              <DialogTitle>Select Difficulty</DialogTitle>
              <DialogDescription className="text-sm text-gray-300">
                USDC/GHO staked:{' '}
                <span className="font-semibold text-white">
                  {formattedStakedUsdc}
                </span>
              </DialogDescription>
            </DialogHeader>
            <DifficultySelector
              selectedTier={selectedDifficultyTier}
              stakedUsdcBalance={stakedUsdcBalance}
              onTierSelect={(tierId) => {
                onDifficultySelect(tierId);
                setDifficultyDialogOpen(false);
              }}
              onUpgradeTier={(stakeThreshold) => {
                setUpgradeTierTargetStakeThreshold(stakeThreshold);
                setUpgradeTierOpen(true);
              }}
              onClose={() => setDifficultyDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>

        {/* Predict/Leverage Dialog */}
        <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
          <DialogContent style={{ top: '50%', bottom: 'auto' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp
                  className={cn(
                    'w-5 h-5',
                    isCompetitiveSelected ? 'text-emerald-400' : 'text-amber-300'
                  )}
                />
                {leverageCardTitle}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {isCompetitiveSelected ? (
                <>
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-wide text-gray-400">
                      Token
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {TRADE_TOKENS.map((token) => {
                        return (
                          <Button
                            key={token}
                            onClick={() => onTradeTokenChange(token)}
                            variant={tradeToken === token ? 'default' : 'outline'}
                            aria-label={`Select ${token} token`}
                            title={token}
                            className={cn(
                              'font-mono text-sm',
                              tradeToken === token && 'bg-blue-600 hover:bg-blue-500'
                            )}
                          >
                            <Image
                              src={TRADE_TOKEN_ICON_SRC[token]}
                              alt={`${token} token`}
                              width={22}
                              height={22}
                              className="h-5 w-5 rounded-sm"
                            />
                            <span className="sr-only">{token}</span>
                          </Button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2">
                      <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          Price
                        </div>
                        <div className="font-mono text-xs text-white">
                          {isActiveTradeMarketStatsLoading
                            ? 'Loading...'
                            : formatUsdPrice(
                                activeTradeMarketStats?.priceUsd ?? NaN,
                                tradeToken
                              )}
                        </div>
                        {activeTradeMarketStats ? (
                          <div
                            className={cn(
                              'text-[10px]',
                              activeTradeMarketStats.stale
                                ? 'text-amber-300'
                                : 'text-gray-500'
                            )}
                          >
                            {formatUpdatedAgo(activeTradeMarketStats.sampledAtMs, nowMs)}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          1h
                        </div>
                        <div
                          className={cn(
                            'font-mono text-xs',
                            getMarketChangeClassName(
                              activeTradeMarketStats?.change1hPct ?? null
                            )
                          )}
                        >
                          {isActiveTradeMarketStatsLoading
                            ? '...'
                            : formatSignedPercent(
                                activeTradeMarketStats?.change1hPct ?? null
                              )}
                        </div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">
                          24h
                        </div>
                        <div
                          className={cn(
                            'font-mono text-xs',
                            getMarketChangeClassName(
                              activeTradeMarketStats?.change24hPct ?? null
                            )
                          )}
                        >
                          {isActiveTradeMarketStatsLoading
                            ? '...'
                            : formatSignedPercent(
                                activeTradeMarketStats?.change24hPct ?? null
                              )}
                        </div>
                      </div>
                    </div>
                    {activeTradeMarketStatsError && !activeTradeMarketStats ? (
                      <p className="text-[11px] text-red-300">
                        {activeTradeMarketStatsError}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs uppercase tracking-wide text-gray-400">
                      Direction & Quick Leverage
                    </span>
                    <div className="grid grid-cols-9 gap-1">
                      {TRADE_DIRECTIONS.map((direction) => (
                        <Button
                          key={direction}
                          onClick={() => onTradeDirectionChange(direction)}
                          variant={
                            tradeDirection === direction ? 'default' : 'outline'
                          }
                          className={cn(
                            'col-span-2 h-8 w-full px-2 font-mono text-xs',
                            tradeDirection === direction &&
                              'bg-violet-600 hover:bg-violet-500'
                          )}
                        >
                          {formatTradeDirectionLabel(direction)}
                        </Button>
                      ))}
                      {TRADE_LEVERAGE_QUICK_OPTIONS.map((val) => (
                        <Button
                          key={val}
                          onClick={() => onTradeLeverageChange(val)}
                          variant={tradeLeverage === val ? 'default' : 'outline'}
                          className={cn(
                            'col-span-1 h-8 w-full px-1.5 font-mono text-xs',
                            tradeLeverage === val &&
                              'bg-emerald-600 hover:bg-emerald-500'
                          )}
                        >
                          {val}x
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-300">Predict Leverage:</span>
                      <span className="text-lg font-mono font-bold text-emerald-400">
                        {formatTradeLeverage(tradeLeverage)}
                      </span>
                    </div>
                    <Slider
                      value={[tradeLeverage]}
                      min={TRADE_LEVERAGE_MIN}
                      max={TRADE_LEVERAGE_MAX}
                      step={1}
                      onValueChange={(vals) => onTradeLeverageChange(vals[0])}
                      className="cursor-pointer"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Added to run leverage for competitive prediction-settlement runs.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    Quick Leverage
                  </span>
                  <div className="grid grid-cols-6 gap-1">
                    {PRACTICE_RUN_LEVERAGE_QUICK_OPTIONS.map((val) => (
                      <Button
                        key={val}
                        onClick={() => onLeverageChange(val)}
                        variant={leverage === val ? 'default' : 'outline'}
                        className={cn(
                          'h-8 w-full px-1.5 font-mono text-xs',
                          leverage === val && 'bg-amber-600 hover:bg-amber-500'
                        )}
                      >
                        {val}x
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className={cn('pt-2 border-t border-white/10')}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">
                    {isCompetitiveSelected ? 'Run Leverage:' : 'Leverage:'}
                  </span>
                  <span className="text-lg font-mono font-bold text-amber-300">
                    {formatRunLeverage(leverage, runLeverageMax)}
                  </span>
                </div>
                <Slider
                  value={[leverage]}
                  min={TRADE_LEVERAGE_MIN}
                  max={isCompetitiveSelected ? TRADE_LEVERAGE_MAX : PRACTICE_RUN_LEVERAGE_MAX}
                  step={1}
                  onValueChange={(vals) => onLeverageChange(vals[0])}
                  className="cursor-pointer"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  {isCompetitiveSelected
                    ? 'Applies to classic in-run risk/reward scaling.'
                    : 'Practice mode uses run leverage only.'}
                </p>
              </div>
              {isCompetitiveSelected ? (
                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Run Length:</span>
                    <span className="text-base font-mono font-bold text-cyan-300">
                      {TRADE_EXTEND_WINDOW_MINUTES}m
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Fixed prediction settlement window.
                  </p>
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button onClick={() => setTradeDialogOpen(false)}>Done</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Open Runs Dialog */}
        <Dialog
          open={openRunsDialogOpen}
          onOpenChange={setOpenRunsDialogOpen}
        >
          <DialogContent
            style={{ top: '50%', bottom: 'auto' }}
            className="max-w-2xl"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  Open Runs
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-mono text-amber-200">
                  <GoldCoinIcon className="w-3.5 h-3.5" />
                  {numberFormatter.format(goldCoinCount)}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {openRunsError ? (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-200">
                  {openRunsError}
                </div>
              ) : null}

              {openRunsLoading ? (
                <div className="text-sm text-gray-400">Loading open runs...</div>
              ) : openRuns.length === 0 ? (
                <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-3 text-sm text-gray-300">
                  No open runs right now.
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
                  {openRuns.map((run) => {
                    const isPending = openRunsActionPendingRunId === run.runId;
                    const hasCloseFeeGold = goldCoinCount >= TRADE_CLOSE_FEE_GOLD;
                    const hasExtendFeeGold = goldCoinCount >= TRADE_EXTEND_FEE_GOLD;
                    const liveChangePct =
                      Number.isFinite(run.entryPriceUsd) &&
                      run.entryPriceUsd > 0 &&
                      Number.isFinite(run.livePriceUsd)
                        ? run.livePriceUsd / run.entryPriceUsd - 1
                        : null;
                    const closeDisabled =
                      isPending || !run.canClose || !hasCloseFeeGold;
                    const extendDisabled =
                      isPending || !run.canExtend || !hasExtendFeeGold;

                    return (
                      <div
                        key={run.runId}
                        className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wider">
                              {run.difficultyId} · {run.competitionDate}
                            </div>
                            <div className="text-sm font-semibold text-white">
                              {run.token} · {formatTradeDirectionLabel(run.direction)} ·{' '}
                              {formatTradeLeverage(run.riskLeverage)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Closes In</div>
                            <div className="text-sm font-mono text-amber-300">
                              {formatCountdown(run.closesAtUtc, nowMs)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded bg-white/5 border border-white/10 px-2 py-1.5">
                            <div className="text-gray-400">Entry</div>
                            <div className="font-mono text-white">
                              ${formatTradeUsdPrice(run.entryPriceUsd, run.token)}
                            </div>
                          </div>
                          <div className="rounded bg-white/5 border border-white/10 px-2 py-1.5">
                            <div className="text-gray-400">Live</div>
                            <div className="font-mono text-white">
                              ${formatTradeUsdPrice(run.livePriceUsd, run.token)}
                            </div>
                            <div
                              className={cn(
                                'mt-0.5 font-mono text-[11px]',
                                getMarketChangeClassName(liveChangePct)
                              )}
                            >
                              {formatSignedPercent(liveChangePct)}
                            </div>
                          </div>
                          <div className="rounded bg-white/5 border border-white/10 px-2 py-1.5">
                            <div className="text-gray-400">Est. Multiplier</div>
                            <div className="font-mono text-emerald-300">
                              {formatFloat(run.estimatedTradeMultiplier, 3)}x
                            </div>
                          </div>
                          <div className="rounded bg-white/5 border border-white/10 px-2 py-1.5">
                            <div className="text-gray-400">Est. Final Score</div>
                            <div className="font-mono text-white">
                              {scoreFormatter.format(run.estimatedFinalScore)}
                            </div>
                          </div>
                        </div>

                        <div className="rounded bg-white/5 border border-white/10 p-2.5 space-y-2">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Button
                              variant="secondary"
                              onClick={() => void handleExtendOpenRun(run.runId)}
                              disabled={extendDisabled}
                              className="w-full"
                            >
                              {isPending ? (
                                'Extending...'
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <span>Extend (-{TRADE_EXTEND_FEE_GOLD}</span>
                                  <GoldCoinIcon className="w-3.5 h-3.5" />
                                  <span>, +{TRADE_EXTEND_WINDOW_MINUTES}m)</span>
                                </span>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => void handleCloseOpenRun(run.runId)}
                              disabled={closeDisabled}
                              className="w-full"
                            >
                              {isPending ? (
                                'Closing...'
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <span>Close (-{TRADE_CLOSE_FEE_GOLD}</span>
                                  <GoldCoinIcon className="w-3.5 h-3.5" />
                                  <span>)</span>
                                </span>
                              )}
                            </Button>
                          </div>

                          {!hasExtendFeeGold || !hasCloseFeeGold ? (
                            <div className="text-[11px] text-amber-300">
                              Not enough Gold for one or more actions.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Target Floor Dialog */}
        <Dialog
          open={targetFloorDialogOpen}
          onOpenChange={setTargetFloorDialogOpen}
        >
          <DialogContent style={{ top: '50%', bottom: 'auto' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Ghost className="w-5 h-5 text-blue-400" />
                Select Target Floor
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-300">
                The boss appears at the end of your target floor. Defeat the
                boss to win!
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-6 gap-2">
                {[
                  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
                  19, 20,
                ].map((floor) => (
                  <Button
                    key={floor}
                    onClick={() => {
                      onAutoAscendFloorChange(floor);
                      setTargetFloorDialogOpen(false);
                    }}
                    variant={autoAscendFloor === floor ? 'default' : 'outline'}
                    className={cn(
                      'font-mono text-sm',
                      autoAscendFloor === floor &&
                        'bg-blue-600 hover:bg-blue-500'
                    )}
                  >
                    {floor}
                  </Button>
                ))}
              </div>
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">Fine Tune:</span>
                  <span className="text-lg font-mono font-bold text-blue-400">
                    Floor {autoAscendFloor}
                  </span>
                </div>
                <Slider
                  value={[autoAscendFloor]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(vals) => onAutoAscendFloorChange(vals[0])}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Speed Run Dialog */}
        <Dialog open={speedRunDialogOpen} onOpenChange={setSpeedRunDialogOpen}>
          <DialogContent style={{ top: '50%', bottom: 'auto' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-300" />
                Select Speed
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-300">
                Higher speed skips more combat and finishes faster.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {SPEED_RUN_MULTIPLIERS.map((value) => (
                  <Button
                    key={value}
                    onClick={() => {
                      onSpeedRunMultiplierChange(value);
                      setSpeedRunDialogOpen(false);
                    }}
                    variant={speedRunMultiplier === value ? 'default' : 'outline'}
                    className={cn(
                      'font-mono text-sm',
                      speedRunMultiplier === value &&
                        'bg-amber-600 hover:bg-amber-500'
                    )}
                  >
                    {value}x
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Daily Runs Info Dialog */}
        <Dialog open={dailyRunsInfoOpen} onOpenChange={setDailyRunsInfoOpen}>
          <DialogContent
            style={{ top: '50%', bottom: 'auto' }}
            className="max-w-md"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Daily Runs
              </DialogTitle>
              <DialogDescription>
                Your daily run allowance is based on your USDC stake. Runs reset
                each day at 00:00 UTC.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              {dailyRunsError ? (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-200">
                  Failed to load daily runs: {dailyRunsError}
                </div>
              ) : (
                <>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">Daily allowance</span>
                      <span className="text-white font-semibold">
                        {dailyRunsRemaining ?? '—'} / {dailyRunsAllowed ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">USDC/GHO staked</span>
                      <span className="text-white font-semibold">
                        {formatFloat(dailyRunsStakedForTiers, 2)} USDC/GHO
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">Reset time</span>
                      <span className="text-white font-semibold">00:00 UTC</span>
                    </div>
                  </div>

                  {dailyRunsTiers.length > 0 ? (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">
                          Daily Run Tiers
                        </span>
                        {dailyRunsCurrentTier ? (
                          <span className="text-xs text-white/60">
                            {dailyRunsCurrentTier.dailyRuns} RUNS/DAY
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2">
                        {dailyRunsTiers.map((tier) => {
                          const isActive =
                            dailyRunsCurrentTier?.usdcStakedGte ===
                            tier.usdcStakedGte;
                          return (
                            <div
                              key={tier.usdcStakedGte}
                              className={cn(
                                'flex items-center justify-between text-sm',
                                isActive
                                  ? 'text-white font-semibold'
                                  : 'text-white/60'
                              )}
                            >
                              <span>
                                {isActive ? (
                                  <strong>${tier.usdcStakedGte}+ USDC/GHO</strong>
                                ) : (
                                  `$${tier.usdcStakedGte}+ USDC/GHO`
                                )}
                              </span>
                              <span>
                                {isActive ? (
                                  <strong>{tier.dailyRuns} runs</strong>
                                ) : (
                                  `${tier.dailyRuns} runs`
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {onStakeUsdc ? (
                    <div className="pt-2">
                      <Button
                        className="w-full"
                        onClick={() => {
                          setDailyRunsInfoOpen(false);
                          setUpgradeTierOpen(true);
                        }}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          <span>Upgrades ({availableUpgradesCount})</span>
                        </span>
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <UpgradeTierDialog
          open={upgradeTierOpen}
          onOpenChange={handleUpgradeTierOpenChange}
          viewModel={upgradeTierViewModel}
          tiers={upgradeTierConfigs}
          canStake={canStake}
          currencyMode={stakeCurrencyMode}
          onCurrencyModeChange={setStakeCurrencyMode}
          disabledReason={stakeDisabledReason}
          ghstStaked={dailyRunsStakedGhst}
          initialSelectedStakeThreshold={upgradeTierTargetStakeThreshold}
        />

        {/* Daily Quest Info Dialog */}
        <Dialog open={dailyQuestInfoOpen} onOpenChange={setDailyQuestInfoOpen}>
          <DialogContent
            style={{ top: '50%', bottom: 'auto' }}
            className="max-w-md"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Daily Quest
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-gray-300">
              <p>
                The Daily Quest is a special challenge that resets every day at
                midnight UTC. You get{' '}
                <strong className="text-white">3 competing runs per day</strong>.
              </p>
              <p>
                Compete runs automatically count toward the Daily Quest.
                Your next run on the selected difficulty becomes eligible for
                bonus currency rewards based on your score.
              </p>
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                <h4 className="text-amber-100 font-semibold mb-2">
                  How it works:
                </h4>
                <ul className="space-y-1.5 text-xs">
                  <li>
                    • Yesterday&apos;s high score for your difficulty is the
                    reference
                  </li>
                  <li>• Real (on-chain) gotchis get +25% final score</li>
                  <li>• Score at least 50% of that to earn rewards</li>
                  <li>
                    • Higher scores earn more currency (up to 100% of max
                    payout)
                  </li>
                  <li>• Attunement is consumed whether you succeed or fail</li>
                </ul>
              </div>
              <p className="text-xs text-gray-400">
                Tip: Choose your difficulty carefully before enabling the Daily
                Quest!
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Shop Dialog */}
        <ShopDialog
          open={shopDialogOpen}
          onOpenChange={setShopDialogOpen}
          serverBaseUrl={regionServerUrl}
          onPurchaseSuccess={() => {
            // Inventory updates automatically via live subscription
            // No manual refresh needed
          }}
        />

        {/* Crafting Menu Dialog */}
        <CraftingMenu
          open={craftingDialogOpen}
          onOpenChange={(nextOpen) => {
            setCraftingDialogOpen(nextOpen);
            if (!nextOpen) {
              setCraftingDialogPreferredTab('craft');
            }
          }}
          serverBaseUrl={regionServerUrl}
          preferredTab={craftingDialogPreferredTab}
          onCraftSuccess={() => {
            // Inventory updates automatically via live subscription
          }}
        />
      </div>
    </SplashBackground>
  );
}
