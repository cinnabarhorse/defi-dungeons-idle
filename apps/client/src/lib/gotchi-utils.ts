import { getWearableById } from '../data/wearables';
import type { WearableSlot } from '../data/wearables';
import type { EquipmentSlotName } from '../hooks/useEquipment';

// Canonical slot order for mapping Aavegotchi SVG ids -> slots
export const GOTCHI_SLOT_BY_INDEX: WearableSlot[] = [
  'body',
  'face',
  'eyes',
  'head',
  'handLeft',
  'handRight',
  'pet',
  'background',
];

// Build an EquipmentSlot map from a gotchi's equipped SVG ids
export function buildGotchiSlotMapFromSvgIds(
  equippedSvgIds: number[] | undefined,
  svgIdToItemTypeId: Map<number, number>
): Partial<Record<EquipmentSlotName, string>> {
  const result: Partial<Record<EquipmentSlotName, string>> = {};
  if (!Array.isArray(equippedSvgIds) || equippedSvgIds.length === 0) {
    return result;
  }
  equippedSvgIds.forEach((svgId, index) => {
    const slot = GOTCHI_SLOT_BY_INDEX[index] as EquipmentSlotName | undefined;
    if (!slot) return;
    const itemTypeId = svgIdToItemTypeId.get(svgId);
    if (!itemTypeId) return;
    const def = getWearableById(itemTypeId);
    if (!def) return;
    result[slot] = def.slug;
  });
  return result;
}
