/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Server Wearable Quality Data - Generated from /data/wearable-quality.ts
 * This file defines wearable quality labels and overrides shared by client and server.
 *
 * To make changes, edit /data/wearable-quality.ts and run: npm run generate:shared
 */

import { getWearableById, getWearableBySlug } from './wearables';

export type QualityTier =
  | 'broken'
  | 'budget'
  | 'average'
  | 'excellent'
  | 'flawless';

export const QUALITY_DEFAULT_LABELS: Record<QualityTier, string> = {
  broken: 'Broken',
  budget: 'Cheap',
  average: 'Fine',
  excellent: 'Excellent',
  flawless: 'Flawless',
};

export const WEARABLE_QUALITY_OVERRIDES: Record<
  string,
  Partial<Record<QualityTier, string>>
> = {
  'jamaican-flag': {
    broken: 'Torn',
  },
  'baable-gum': {
    broken: 'Popped',
  },
};

export const WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES: Record<
  string,
  Partial<Record<QualityTier, string>>
> = {
  'basic-hat': {
    broken: 'Torn',
  },
  'fancy-hat': {
    broken: 'Torn',
  },
  't-shirt': {
    broken: 'Ripped',
  },
  'fancy-shirt': {
    broken: 'Torn',
  },
  flag: {
    broken: 'Torn',
  },
  pants: {
    broken: 'Ripped',
  },
  dress: {
    broken: 'Ripped',
  },
  'fancy-suit': {
    broken: 'Ripped',
  },
  'heavy-armor': {
    broken: 'Cracked',
  },
  robe: {
    broken: 'Ripped',
  },

  athletic: {
    broken: 'Ripped',
  },
  helmet: {
    broken: 'Cracked',
  },
};

export const QUALITY_SCALARS: Record<QualityTier, number> = {
  broken: 0.5,
  budget: 0.66,
  average: 1,
  excellent: 1.5,
  flawless: 2,
};

export const MAX_WEARABLE_DURABILITY = 1000;

export const MAX_DURABILITY_BY_QUALITY: Record<QualityTier, number> = {
  broken: 250,
  budget: 500,
  average: 700,
  excellent: 900,
  flawless: MAX_WEARABLE_DURABILITY,
};

export const REPAIR_COST_MULTIPLIER_BY_QUALITY: Record<QualityTier, number> = {
  broken: 0.5,
  budget: 0.75,
  average: 1,
  excellent: 1.5,
  flawless: 2,
};

export const DEFAULT_QUALITY_TIER: QualityTier = 'average';

export function normalizeQualityTier(
  value: string | QualityTier | null | undefined
): QualityTier {
  const normalizedValue =
    typeof value === 'string' ? value.trim().toLowerCase() : value;

  switch (normalizedValue) {
    case 'broken':
    case 'budget':
    case 'average':
    case 'excellent':
    case 'flawless':
      return normalizedValue;
    default:
      return DEFAULT_QUALITY_TIER;
  }
}

export function getQualityLabelForWearable(
  quality: QualityTier,
  wearableSlugOrId?: string | number
): string {
  const defaultLabel = QUALITY_DEFAULT_LABELS[quality] ?? quality;

  if (!wearableSlugOrId) {
    return defaultLabel;
  }

  let slug: string | undefined;
  let wearable:
    | ReturnType<typeof getWearableById>
    | ReturnType<typeof getWearableBySlug>
    | undefined;

  if (typeof wearableSlugOrId === 'string') {
    slug = wearableSlugOrId;
    wearable = getWearableBySlug(slug);
  } else if (typeof wearableSlugOrId === 'number') {
    wearable = getWearableById(wearableSlugOrId);
    slug = wearable?.slug;
  }

  if (slug) {
    const overrides = WEARABLE_QUALITY_OVERRIDES[slug];
    if (overrides && overrides[quality]) {
      return overrides[quality] as string;
    }
  }

  const itemType = wearable?.itemType;

  if (itemType) {
    const itemTypeOverrides = WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES[itemType];
    if (itemTypeOverrides && itemTypeOverrides[quality]) {
      return itemTypeOverrides[quality] as string;
    }
  }

  return defaultLabel;
}

export function getQualityScalar(quality: QualityTier): number {
  const value = QUALITY_SCALARS[quality];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 1;
}

export function durabilityCapForQuality(
  quality: QualityTier | string | null | undefined
): number {
  const normalized = normalizeQualityTier(
    quality as QualityTier | null | undefined
  );
  return MAX_DURABILITY_BY_QUALITY[normalized] ?? MAX_WEARABLE_DURABILITY;
}

export function isBrokenDurability(
  durabilityScore: number | null | undefined
): boolean {
  return Number.isFinite(durabilityScore) && Number(durabilityScore) <= 0;
}

export function durabilityLossForRun(maxDepthReached: number): number {
  const depth = Number.isFinite(maxDepthReached)
    ? Math.max(1, Math.floor(maxDepthReached))
    : 1;
  return Math.max(1, Math.ceil(depth / 10));
}

export function getRepairCostForDurability(input: {
  quality: QualityTier | string | null | undefined;
  durabilityScore: number | null | undefined;
}): number {
  const quality = normalizeQualityTier(
    input.quality as QualityTier | null | undefined
  );
  const cap = durabilityCapForQuality(quality);
  const current = Number.isFinite(input.durabilityScore)
    ? Math.max(0, Math.floor(Number(input.durabilityScore)))
    : 0;
  const missing = Math.max(0, cap - current);
  if (missing <= 0) {
    return 0;
  }
  const multiplier = REPAIR_COST_MULTIPLIER_BY_QUALITY[quality] ?? 1;
  return Math.ceil((missing * multiplier) / 10);
}
