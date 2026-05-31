import type { InventoryItem } from '../../../types/inventory';
import type { EquipmentState } from '../../../hooks/useEquipment';
import {
  durabilityCapForQuality,
  isBrokenDurability,
  normalizeQualityTier,
  QUALITY_DEFAULT_LABELS,
  type QualityTier,
} from '../../../data/wearable-quality';

const QUALITY_ORDER: Record<QualityTier, number> = {
  flawless: 0,
  excellent: 1,
  average: 2,
  budget: 3,
  broken: 4,
};

export interface WearableInstanceSummary {
  id: string;
  quality: QualityTier;
  qualityLabel: string;
  currentDurability: number;
  maxDurability: number;
  isBroken: boolean;
}

export function buildWearableInstanceSummaries(
  items: InventoryItem[]
): WearableInstanceSummary[] {
  return items
    .filter((item) => item.type === 'wearable')
    .slice()
    .sort((a, b) => {
      const qualityA = normalizeQualityTier(a.quality);
      const qualityB = normalizeQualityTier(b.quality);
      if (QUALITY_ORDER[qualityA] !== QUALITY_ORDER[qualityB]) {
        return QUALITY_ORDER[qualityA] - QUALITY_ORDER[qualityB];
      }
      const durabilityA = Number(a.durabilityScore) || 0;
      const durabilityB = Number(b.durabilityScore) || 0;
      if (durabilityA !== durabilityB) {
        return durabilityB - durabilityA;
      }
      return String(a.inventoryItemId ?? a.id).localeCompare(
        String(b.inventoryItemId ?? b.id)
      );
    })
    .map((item) => {
      const quality = normalizeQualityTier(item.quality);
      const currentDurability = Math.max(
        0,
        Math.floor(Number(item.durabilityScore) || 0)
      );
      const maxDurability = durabilityCapForQuality(quality);
      return {
        id: String(item.inventoryItemId ?? item.id),
        quality,
        qualityLabel: QUALITY_DEFAULT_LABELS[quality],
        currentDurability,
        maxDurability,
        isBroken: isBrokenDurability(currentDurability),
      };
    });
}

export function shouldShowNftEquipmentChip(input: {
  characterId: string | null;
  assignment:
    | Pick<EquipmentState['equipment'][number], 'source'>
    | null
    | undefined;
}): boolean {
  if (!input.characterId?.startsWith('gotchi:')) {
    return false;
  }
  return input.assignment?.source === 'base';
}
