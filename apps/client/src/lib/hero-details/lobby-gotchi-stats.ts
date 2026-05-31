import {
  getCharacterStats,
  type CharacterDerivedStats,
} from '../character-registry';
import { getGotchiWearableAssignments } from '../../data/characters';
import type { EquipmentSlotName } from '../../hooks/useEquipment';
import type { QualityTier } from '../../data/wearable-quality';
import type { GotchiSpriteEntry } from '../../hooks/useGotchiSprites';
import { buildGotchiSlotMapFromSvgIds } from '../gotchi-utils';

export interface LobbyGotchiWearableEntry {
  slug: string;
  slot: EquipmentSlotName;
  quality: QualityTier;
}

interface ResolveLobbyGotchiDerivedStatsArgs {
  selectedCharacterId: string;
  svgIdToItemTypeId: Map<number, number>;
  gotchiEquipById: Record<number, GotchiSpriteEntry>;
  equippedWearablesWithQuality?: LobbyGotchiWearableEntry[];
}

function buildSlotMapFromAssignments(
  assignments: Array<{ slot: string; slug: string }> | undefined
): Partial<Record<EquipmentSlotName, string>> {
  const slotMap: Partial<Record<EquipmentSlotName, string>> = {};
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return slotMap;
  }

  for (const entry of assignments) {
    if (!entry || typeof entry.slug !== 'string' || !entry.slug) continue;
    const slot = entry.slot;
    if (
      slot === 'head' ||
      slot === 'body' ||
      slot === 'face' ||
      slot === 'eyes' ||
      slot === 'handLeft' ||
      slot === 'handRight' ||
      slot === 'pet' ||
      slot === 'background'
    ) {
      slotMap[slot] = entry.slug;
    }
  }

  return slotMap;
}

export function resolveLobbyGotchiDerivedStats({
  selectedCharacterId,
  svgIdToItemTypeId,
  gotchiEquipById,
  equippedWearablesWithQuality,
}: ResolveLobbyGotchiDerivedStatsArgs): CharacterDerivedStats {
  if (!selectedCharacterId.startsWith('gotchi:')) {
    return getCharacterStats(selectedCharacterId);
  }

  if (
    Array.isArray(equippedWearablesWithQuality) &&
    equippedWearablesWithQuality.length > 0
  ) {
    return getCharacterStats(selectedCharacterId, {
      equippedWearablesWithQuality,
    });
  }

  const gotchiId = selectedCharacterId.split(':')[1] ?? '';
  const cachedSlotMap = buildSlotMapFromAssignments(
    gotchiId ? getGotchiWearableAssignments(gotchiId) : undefined
  );
  if (Object.keys(cachedSlotMap).length > 0) {
    return getCharacterStats(selectedCharacterId, {
      equippedWearables: cachedSlotMap,
    });
  }

  const gotchiIdNum = Number.parseInt(gotchiId, 10);
  const record = Number.isFinite(gotchiIdNum)
    ? gotchiEquipById[gotchiIdNum]
    : undefined;
  const slotMap = buildGotchiSlotMapFromSvgIds(
    (record?.equippedWearables || []) as number[],
    svgIdToItemTypeId
  );

  return Object.keys(slotMap).length > 0
    ? getCharacterStats(selectedCharacterId, {
        equippedWearables: slotMap,
      })
    : getCharacterStats(selectedCharacterId);
}
