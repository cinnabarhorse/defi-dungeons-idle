import { type WearableSlot } from '../data/wearables';

interface WearableLike {
  slots?: WearableSlot[] | undefined;
}

export function getPrimarySlot(
  wearable: WearableLike | null | undefined
): WearableSlot {
  const slots = Array.isArray(wearable?.slots) ? wearable!.slots : [];
  for (const slot of slots) {
    if (slot !== 'none') {
      return slot;
    }
  }
  return 'none';
}

import {
  getQualityLabelForWearable,
  type QualityTier,
} from '../data/wearable-quality';
import { itemTypes } from '../data/wearables';

/**
 * Resolve wearable name from the wearables database using wearableId
 */
export function getWearableName(
  wearableId: number | undefined,
  fallbackName?: string
): string {
  if (wearableId && itemTypes[wearableId]) {
    return itemTypes[wearableId].name;
  }

  return fallbackName || 'Unknown Wearable';
}

/**
 * Get wearable data from the wearables database
 */
export function getWearableData(wearableId: number | undefined) {
  if (wearableId && itemTypes[wearableId]) {
    return itemTypes[wearableId];
  }

  return null;
}

export function formatWearableDisplayName(args: {
  quality?: QualityTier;
  wearableId?: number;
  wearableSlug?: string;
  fallbackName?: string;
}): string {
  const base = getWearableName(args.wearableId, args.fallbackName);
  if (!args.quality) {
    return base;
  }
  const label = getQualityLabelForWearable(
    args.quality,
    args.wearableSlug ?? args.wearableId
  );
  return `${label} ${base}`;
}
