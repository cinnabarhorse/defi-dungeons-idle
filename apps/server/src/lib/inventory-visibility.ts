import type { PlayerInventoryRecord } from './db/types';
import { normalizeQualityTier } from '../data/wearable-quality';

export type EquippedSummary = {
  idSet: Set<string>;
  countBySlug: Map<string, number>;
};

function getLegacyHidePriority(row: PlayerInventoryRecord): number {
  switch (normalizeQualityTier(row.quality)) {
    case 'broken':
      return 0;
    case 'budget':
      return 1;
    case 'average':
      return 2;
    case 'excellent':
      return 3;
    case 'flawless':
      return 4;
    default:
      return 2;
  }
}

function compareLegacyHideCandidates(
  a: PlayerInventoryRecord,
  b: PlayerInventoryRecord
): number {
  const priorityA = getLegacyHidePriority(a);
  const priorityB = getLegacyHidePriority(b);
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  const durabilityA = Number(a.durabilityScore) || 0;
  const durabilityB = Number(b.durabilityScore) || 0;
  if (durabilityA !== durabilityB) {
    return durabilityA - durabilityB;
  }

  const createdA = Date.parse(a.createdAt ?? '');
  const createdB = Date.parse(b.createdAt ?? '');
  if (Number.isFinite(createdA) && Number.isFinite(createdB)) {
    return createdA - createdB;
  }

  return String(a.id).localeCompare(String(b.id));
}

export function filterInventoryRecordsForResponse(
  records: PlayerInventoryRecord[],
  equippedSummary: EquippedSummary
): PlayerInventoryRecord[] {
  const nonWearables: PlayerInventoryRecord[] = [];
  const rowsBySlug = new Map<string, PlayerInventoryRecord[]>();

  for (const row of records) {
    const isWearable = String(row.itemType || '').toLowerCase() === 'wearable';
    if (!isWearable) {
      nonWearables.push(row);
      continue;
    }

    const slug = String(row.wearableSlug || row.itemName || '').trim();
    if (!slug) {
      if (!equippedSummary.idSet.has(row.id)) {
        nonWearables.push(row);
      }
      continue;
    }

    const list = rowsBySlug.get(slug);
    if (list) {
      list.push(row);
    } else {
      rowsBySlug.set(slug, [row]);
    }
  }

  const wearableVisibleRows: PlayerInventoryRecord[] = [];
  for (const [slug, rows] of rowsBySlug.entries()) {
    const notExplicitlyEquipped = rows.filter(
      (r) => !equippedSummary.idSet.has(r.id)
    );
    const explicitEquippedCount = rows.length - notExplicitlyEquipped.length;
    const totalEquippedForSlug = equippedSummary.countBySlug.get(slug) ?? 0;
    const legacyEquippedCount = Math.max(
      0,
      totalEquippedForSlug - explicitEquippedCount
    );
    const toDrop = Math.min(legacyEquippedCount, notExplicitlyEquipped.length);
    const hideIds = new Set(
      [...notExplicitlyEquipped]
        .sort(compareLegacyHideCandidates)
        .slice(0, toDrop)
        .map((row) => row.id)
    );
    const visible = notExplicitlyEquipped.filter((row) => !hideIds.has(row.id));
    wearableVisibleRows.push(...visible);
  }

  return [...nonWearables, ...wearableVisibleRows];
}
