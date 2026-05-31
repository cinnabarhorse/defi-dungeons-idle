import type { InventoryItem } from '../types/inventory';
import type { GotchiSpriteEntry } from '../hooks/useGotchiSprites';
import {
  itemTypes,
  getWearableBySlug,
  getWearableRarity,
  slugifyWearableName,
} from '../data/wearables';
import { GAME_CONFIG } from '../data/game-config';
import { normalizeQualityTier, type QualityTier } from '../data/wearable-quality';

type ForgeRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'mythical'
  | 'godlike';

const SVG_ID_TO_WEARABLE_SLUG = new Map<number, string>();

Object.values(itemTypes).forEach((item) => {
  if (
    item &&
    typeof item.svgId === 'number' &&
    Number.isFinite(item.svgId) &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0
  ) {
    const wearable = getWearableBySlug(slugifyWearableName(item.name));
    if (wearable?.slug) {
      SVG_ID_TO_WEARABLE_SLUG.set(item.svgId, wearable.slug);
    }
  }
});

export interface ForgeCandidateSummary {
  wearableSlug: string;
  wearableName: string;
  rarity: ForgeRarity;
  baseSuccessChancePct: number;
  sourceQualityMultiplier: number | null;
  successChancePct: number | null;
  goldCost: number;
  lickTongueCost: number;
  ownedCount: number;
  excellentCount: number;
  sourceQuality: QualityTier | null;
  requiresLickTongues: boolean;
  canForge: boolean;
}

function getForgeSourceQualityMultiplier(
  quality: QualityTier | null | undefined
): number {
  if (!quality) {
    return 0;
  }
  const value =
    GAME_CONFIG.wearableForge?.successChanceMultiplierBySourceQuality?.[quality];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return quality === 'excellent' ? 1 : 0.5;
}

function formatForgeMultiplier(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatForgeQualityName(quality: QualityTier): string {
  return quality.charAt(0).toUpperCase() + quality.slice(1);
}

function getForgeSourcePriority(quality: QualityTier): number {
  switch (quality) {
    case 'excellent':
      return 5;
    case 'flawless':
      return 4;
    case 'average':
      return 3;
    case 'budget':
      return 2;
    case 'broken':
    default:
      return 1;
  }
}

function getForgeInventoryItemId(item: Pick<InventoryItem, 'inventoryItemId' | 'id'>) {
  if (typeof item.inventoryItemId === 'string' && item.inventoryItemId.trim()) {
    return item.inventoryItemId.trim();
  }
  if (typeof item.id === 'string' && item.id.trim()) {
    return item.id.trim();
  }
  return null;
}

function compareForgeSourceItems(a: InventoryItem, b: InventoryItem): number {
  const qualityA = normalizeQualityTier(a.quality);
  const qualityB = normalizeQualityTier(b.quality);
  const priorityA = getForgeSourcePriority(qualityA);
  const priorityB = getForgeSourcePriority(qualityB);
  if (priorityA !== priorityB) {
    return priorityB - priorityA;
  }
  const durabilityA = Number(a.durabilityScore) || 0;
  const durabilityB = Number(b.durabilityScore) || 0;
  if (durabilityA !== durabilityB) {
    return durabilityB - durabilityA;
  }
  return String(getForgeInventoryItemId(a) ?? '').localeCompare(
    String(getForgeInventoryItemId(b) ?? '')
  );
}

export function isGotchiCharacterId(
  characterId: string | null | undefined
): boolean {
  return typeof characterId === 'string' && /^gotchi:\d{1,32}$/i.test(characterId);
}

export function isFlawlessWearableRestrictedForCharacter(
  characterId: string | null | undefined,
  quality: string | null | undefined
): boolean {
  return (
    !isGotchiCharacterId(characterId) &&
    normalizeQualityTier(quality) === 'flawless'
  );
}

export function buildForgeCandidateSummaries(input: {
  gotchiEntry: Pick<GotchiSpriteEntry, 'equippedWearables'> | null | undefined;
  inventoryItems: InventoryItem[];
  equippedInventoryItemIds?: Iterable<string> | null;
  lickTongueCount?: number | null;
}): ForgeCandidateSummary[] {
  const rawWearables = Array.isArray(input.gotchiEntry?.equippedWearables)
    ? input.gotchiEntry?.equippedWearables
    : [];
  const uniqueSlugs: string[] = [];
  const seen = new Set<string>();
  const equippedInventoryItemIds = new Set(
    Array.from(input.equippedInventoryItemIds ?? []).filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    )
  );
  const lickTongueCount = Math.max(
    0,
    Math.floor(Number(input.lickTongueCount) || 0)
  );

  for (const svgId of rawWearables) {
    const slug = SVG_ID_TO_WEARABLE_SLUG.get(Number(svgId));
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    uniqueSlugs.push(slug);
  }

  const excellentCounts = new Map<string, number>();
  const ownedCounts = new Map<string, number>();
  const availableBySlug = new Map<string, InventoryItem[]>();
  for (const item of input.inventoryItems) {
    if (
      item.type !== 'wearable' ||
      typeof item.wearableSlug !== 'string' ||
      !item.wearableSlug
    ) {
      continue;
    }
    const inventoryItemId = getForgeInventoryItemId(item);
    if (inventoryItemId && equippedInventoryItemIds.has(inventoryItemId)) {
      continue;
    }
    if (normalizeQualityTier(item.quality) !== 'flawless') {
      ownedCounts.set(
        item.wearableSlug,
        (ownedCounts.get(item.wearableSlug) ?? 0) + 1
      );
    }
    const existing = availableBySlug.get(item.wearableSlug);
    if (existing) {
      existing.push(item);
    } else {
      availableBySlug.set(item.wearableSlug, [item]);
    }
    if (normalizeQualityTier(item.quality) !== 'excellent') {
      continue;
    }
    excellentCounts.set(
      item.wearableSlug,
      (excellentCounts.get(item.wearableSlug) ?? 0) + 1
    );
  }

  const candidates = uniqueSlugs
    .map((slug) => {
      const wearable = getWearableBySlug(slug);
      if (!wearable) {
        return null;
      }
      const rarity = getWearableRarity(wearable) as ForgeRarity;
      const baseSuccessChancePct =
        GAME_CONFIG.wearableForge?.successChancePctByRarity?.[rarity] ?? 0;
      const goldCost =
        GAME_CONFIG.wearableForge?.goldCostByRarity?.[rarity] ?? 0;
      const lickTongueCost = Math.max(
        1,
        Math.floor(GAME_CONFIG.wearableForge?.lickTongueCostByRarity?.[rarity] ?? 1)
      );
      const sourceItems = [...(availableBySlug.get(slug) ?? [])].sort(
        compareForgeSourceItems
      );
      const hasOnlyFlawlessSources =
        sourceItems.length > 0 &&
        sourceItems.every(
          (item) => normalizeQualityTier(item.quality) === 'flawless'
        );
      const sourceItem =
        sourceItems.find(
          (item) => normalizeQualityTier(item.quality) !== 'flawless'
        ) ?? null;
      const sourceQuality = sourceItem
        ? normalizeQualityTier(sourceItem.quality)
        : null;
      const requiresLickTongues = true;
      const successChancePct =
        sourceQuality === null
          ? null
          : Math.max(
              1,
              Math.min(
                100,
                Math.round(
                  baseSuccessChancePct *
                    getForgeSourceQualityMultiplier(sourceQuality)
                )
              )
            );
      const excellentCount = excellentCounts.get(slug) ?? 0;
      const ownedCount = ownedCounts.get(slug) ?? 0;

      const candidate = {
        wearableSlug: slug,
        wearableName: wearable.name ?? slug,
        rarity,
        baseSuccessChancePct,
        sourceQualityMultiplier:
          sourceQuality !== null
            ? getForgeSourceQualityMultiplier(sourceQuality)
            : null,
        successChancePct,
        goldCost,
        lickTongueCost,
        ownedCount,
        excellentCount,
        sourceQuality,
        requiresLickTongues,
        canForge:
          sourceQuality !== null &&
          lickTongueCount >= lickTongueCost,
      };
      return hasOnlyFlawlessSources ? null : candidate;
    })
    .filter((candidate): candidate is ForgeCandidateSummary => Boolean(candidate));

  const forgeable: ForgeCandidateSummary[] = [];
  const unavailable: ForgeCandidateSummary[] = [];
  for (const candidate of candidates) {
    if (candidate.canForge) {
      forgeable.push(candidate);
    } else {
      unavailable.push(candidate);
    }
  }

  return [...forgeable, ...unavailable];
}

export function getForgeSuccessRateExplanation(
  candidate: Pick<
    ForgeCandidateSummary,
    'rarity' | 'baseSuccessChancePct' | 'sourceQuality' | 'sourceQualityMultiplier' | 'successChancePct'
  >
): string {
  if (
    candidate.sourceQuality === null ||
    candidate.sourceQualityMultiplier === null ||
    candidate.successChancePct === null
  ) {
    return 'Need an owned source copy to calculate the forge rate.';
  }

  const qualityLabel = formatForgeQualityName(candidate.sourceQuality);
  return `Base ${candidate.rarity} rate ${candidate.baseSuccessChancePct}%. ${qualityLabel} source copies use a ${formatForgeMultiplier(candidate.sourceQualityMultiplier)}x multiplier. Final forge rate ${candidate.successChancePct}%.`;
}

export function formatForgeCandidateTitle(
  name: string,
  ownedCount: number
): string {
  const normalizedName = String(name || '').trim() || 'Wearable';
  const normalizedCount = Math.max(0, Math.floor(Number(ownedCount) || 0));
  return normalizedCount > 0
    ? `${normalizedName} (${normalizedCount})`
    : normalizedName;
}
