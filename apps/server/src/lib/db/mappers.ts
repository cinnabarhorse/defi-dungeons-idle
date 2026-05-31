import {
  createDefaultProfile,
  sanitizeProfile,
  type ProgressionProfile,
  type StatKey,
} from '@gotchiverse/progression';
import type { PlayerProgressionRecord, PlayerInventoryRecord } from './types';
import { getWearableBySlug } from '../../data/wearables';
import { ITEM_TYPES } from '../../data/items';

export type InventoryItemPayload = {
  id?: string;
  inventoryItemId?: string;
  instanceId?: string;
  itemType?: string;
  type?: string;
  name?: string;
  quantity?: number;
  wearableSlug?: string;
  quality?: 'broken' | 'budget' | 'average' | 'excellent' | 'flawless' | string;
  qualityScore?: number | null;
  durabilityScore?: number | null;
  [key: string]: any;
};

export function progressionRecordToProfile(
  record: PlayerProgressionRecord | null
): ProgressionProfile {
  const profile = createDefaultProfile();
  if (!record) {
    return profile;
  }

  profile.level = Math.max(1, Number(record.level) || 1);
  profile.totalXp = Math.max(0, Number(record.totalXp) || 0);
  profile.unspentPoints = Math.max(0, Number(record.unspentPoints) || 0);

  if (record.statAllocations && typeof record.statAllocations === 'object') {
    const stats = record.statAllocations as Record<string, unknown>;
    (Object.keys(profile.stats) as StatKey[]).forEach((key) => {
      const value = stats[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        profile.stats[key] = Math.max(0, Math.floor(value));
      }
    });
  }

  if (Array.isArray(record.allocationHistory)) {
    const validHistory = (record.allocationHistory as unknown[]).filter(
      (entry): entry is StatKey =>
        entry === 'energy' ||
        entry === 'aggression' ||
        entry === 'spookiness' ||
        entry === 'brainSize'
    );
    profile.allocationHistory = validHistory;
  }

  if (record.lastSyncedAt) {
    const ts = Date.parse(record.lastSyncedAt);
    if (!Number.isNaN(ts)) {
      profile.lastSyncedAt = ts;
    }
  }

  return sanitizeProfile(profile);
}

export function inventoryRecordToItem(
  record: PlayerInventoryRecord
): InventoryItemPayload {
  const itemData =
    record.itemData && typeof record.itemData === 'object'
      ? (record.itemData as InventoryItemPayload)
      : {};

  const itemType = String(record.itemType ?? '').toLowerCase();
  const isWearable = itemType === 'wearable';
  const fallbackId =
    (isWearable ? record.id : null) || `${record.itemType}:${record.itemName}`;

  // Normalize core fields
  // Always trust DB quantity for non-wearables; itemData.quantity is metadata only.
  const dbQuantity = Number(record.quantity) || 0;
  const normalized: InventoryItemPayload = {
    ...itemData,
    id: (itemData.id as string) || fallbackId,
    inventoryItemId: record.id,
    itemType: record.itemType,
    type: itemData.type || record.itemType,
    name: itemData.name || record.itemName,
    quantity: dbQuantity,
  };

  if (isWearable) {
    normalized.instanceId =
      typeof itemData.instanceId === 'string'
        ? itemData.instanceId
        : record.instanceId;
    normalized.wearableSlug =
      (typeof itemData.wearableSlug === 'string'
        ? itemData.wearableSlug
        : null) ||
      record.wearableSlug ||
      record.itemName;
    normalized.quality =
      (typeof itemData.quality === 'string' ? itemData.quality : null) ||
      record.quality ||
      'average';
    normalized.qualityScore =
      typeof record.qualityScore === 'number'
        ? record.qualityScore
        : (normalized.qualityScore ?? null);
    normalized.durabilityScore =
      typeof record.durabilityScore === 'number'
        ? record.durabilityScore
        : (normalized.durabilityScore ?? null);
    normalized.quantity = 1;

    // Set imageUrl for wearables if not already present
    if (!normalized.imageUrl && normalized.wearableSlug) {
      const wearable = getWearableBySlug(normalized.wearableSlug);
      if (wearable && typeof wearable.svgId === 'number') {
        normalized.imageUrl = `/wearables/${wearable.svgId}.svg`;
      }
    }
  } else {
    normalized.quality = undefined;
    normalized.qualityScore = undefined;
    normalized.durabilityScore = undefined;
    normalized.instanceId = undefined;
    normalized.wearableSlug = undefined;

    // Set spriteId for non-wearable items from ITEM_TYPES if not already present
    const itemKey =
      String(record.itemType ?? '').toLowerCase().replace(/\s+/g, '_') ||
      String(record.itemName ?? '').toLowerCase().replace(/\s+/g, '_');
    const itemDef = ITEM_TYPES[itemKey];
    if (itemDef) {
      if (normalized.spriteId == null && typeof itemDef.spriteId === 'number') {
        normalized.spriteId = itemDef.spriteId;
      }
      if (
        normalized.potionTier == null &&
        typeof itemDef.potionTier === 'number'
      ) {
        normalized.potionTier = itemDef.potionTier;
      }
    }
  }

  return normalized;
}

export function sanitizeInventoryItems(
  items: InventoryItemPayload[]
): InventoryItemPayload[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const rawQuantity = Number(item.quantity);
      const quantity = Number.isFinite(rawQuantity)
        ? Math.max(0, Math.floor(rawQuantity))
        : 0;
      const type = String(
        item.type ?? item.itemType ?? 'unknown'
      ).toLowerCase();
      const name = String(item.name ?? item.id ?? 'item');
      const normalizedId =
        typeof item.id === 'string' && item.id.length > 0
          ? item.id
          : type === 'wearable' && typeof item.inventoryItemId === 'string'
            ? item.inventoryItemId
            : `${type}:${name}`;
      const wearableQuantity = type === 'wearable' ? 1 : quantity;

      return {
        ...item,
        id: normalizedId,
        type,
        itemType: item.itemType ?? type,
        name,
        quantity: wearableQuantity,
      };
    })
    .filter((item) => item.quantity > 0);
}

export function getLickTongueCount(items: InventoryItemPayload[]) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) {
      return total;
    }

    const type = String(item.itemType ?? item.type ?? '').toLowerCase();
    const name = String(item.name ?? '').trim();

    if (type === 'material' && name === 'Lick Tongue') {
      return total + quantity;
    }

    const haystack = `${item.id ?? ''} ${name}`.toLowerCase();
    if (haystack.includes('lick_tongue') || haystack.includes('lick tongue')) {
      return total + quantity;
    }

    return total;
  }, 0);
}

export function getHealthPotionCount(items: InventoryItemPayload[]) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity) || 0;
    const type = String(item.itemType ?? item.type ?? '').toLowerCase();
    const name = String(item.name ?? '').toLowerCase();
    const isHealthPotionType =
      type === 'potion' ||
      type === 'health_potion' ||
      type === 'greater_health_potion' ||
      type === 'ultra_health_potion' ||
      type.endsWith('_health_potion');
    const isHealthPotionName =
      name.includes('health') || name.includes('healing');
    const hasHealthTier = Number(item.potionTier) > 0;
    if ((isHealthPotionType || isHealthPotionName || hasHealthTier) && quantity > 0) {
      return total + quantity;
    }
    return total;
  }, 0);
}

export function getManaPotionCount(items: InventoryItemPayload[]) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity) || 0;
    const type = String(item.itemType ?? item.type ?? '').toLowerCase();
    const name = String(item.name ?? '').toLowerCase();
    if (type === 'potion' && name.includes('mana')) {
      return total + quantity;
    }
    return total;
  }, 0);
}
