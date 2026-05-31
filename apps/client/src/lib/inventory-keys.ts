import type { InventoryItem } from '../types/inventory';
import { normalizeQualityTier } from '../data/wearable-quality';

export function getWearableKey(item: InventoryItem): string {
  return (
    (item as any).inventoryItemId ||
    (item as any).instanceId ||
    item.id ||
    `${item.name || 'wearable'}_${(item as any).wearableId ?? ''}`
  );
}

export function getFungibleStackKey(item: InventoryItem): string {
  const wearablePart =
    typeof (item as any).wearableId === 'number'
      ? `::${(item as any).wearableId}`
      : '';
  return `${item.type ?? 'unknown'}::${(item.name ?? '').toLowerCase()}${wearablePart}`;
}

export function getStackKey(item: InventoryItem): string {
  if (item.type === 'wearable') return getWearableKey(item);
  return getFungibleStackKey(item);
}

export function getInventorySelectionKey(item: InventoryItem): string {
  return getStackKey(item);
}

// Client-only grouping key for stacking identical wearable tiles
export function getWearableStackKey(item: InventoryItem): string | null {
  if (item.type !== 'wearable') return null;
  const slug = (item as any).wearableSlug as string | undefined;
  const id = (item as any).wearableId as number | undefined;
  const quality = normalizeQualityTier((item as any).quality);
  if (slug && slug.length > 0) return `wearable::${slug}::${quality}`;
  if (typeof id === 'number') return `wearable-id::${id}::${quality}`;
  return null;
}
