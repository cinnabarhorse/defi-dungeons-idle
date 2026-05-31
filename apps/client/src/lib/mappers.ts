import type { InventoryItem } from '../types/inventory';
import type { InventoryItemMessage } from '../types/messages';
import { getItemStats, ITEM_COLORS, type ItemStats } from '../data/items';

const DEFAULT_COLOR = '#999999';

function coerceQuality(value: unknown): InventoryItem['quality'] | undefined {
  if (typeof value !== 'string') return undefined;
  const allowed = new Set<NonNullable<InventoryItem['quality']>>([
    'broken',
    'budget',
    'average',
    'excellent',
    'flawless',
  ]);
  return allowed.has(value as any)
    ? (value as InventoryItem['quality'])
    : undefined;
}

function inferType(msg: InventoryItemMessage): InventoryItem['type'] {
  const candidate = typeof msg.type === 'string' ? msg.type : undefined;
  if (
    candidate === 'coin' ||
    candidate === 'potion' ||
    candidate === 'weapon' ||
    candidate === 'material' ||
    candidate === 'wearable'
  ) {
    return candidate;
  }
  if (typeof candidate === 'string') {
    try {
      return getItemStats(candidate).type as InventoryItem['type'];
    } catch {}
  }
  if (typeof msg.itemType === 'string') {
    try {
      return getItemStats(msg.itemType).type as InventoryItem['type'];
    } catch {}
  }
  return 'material';
}

function inferName(msg: InventoryItemMessage): string {
  if (typeof msg.name === 'string' && msg.name.trim().length > 0)
    return msg.name;
  if (typeof msg.itemType === 'string') {
    try {
      return getItemStats(msg.itemType).name;
    } catch {}
  }
  return 'Unknown Item';
}

function inferPotionMeta(
  name: string,
  type: InventoryItem['type'],
  stats: ItemStats | null
): { potionTier?: number; spriteId?: number } {
  if (type !== 'potion') {
    return {
      potionTier:
        typeof stats?.potionTier === 'number' ? stats.potionTier : undefined,
      spriteId: typeof stats?.spriteId === 'number' ? stats.spriteId : undefined,
    };
  }

  if (typeof stats?.potionTier === 'number' || typeof stats?.spriteId === 'number') {
    return {
      potionTier:
        typeof stats?.potionTier === 'number' ? stats.potionTier : undefined,
      spriteId: typeof stats?.spriteId === 'number' ? stats.spriteId : undefined,
    };
  }

  const normalized = name.toLowerCase();
  if (normalized.includes('mana')) {
    return { spriteId: 128 };
  }
  if (normalized.includes('ultra')) {
    return { potionTier: 3, spriteId: 129 };
  }
  if (normalized.includes('greater')) {
    return { potionTier: 2, spriteId: 127 };
  }
  if (normalized.includes('health') || normalized.includes('healing')) {
    return { potionTier: 1, spriteId: 126 };
  }
  return {};
}

function inferColor(msg: InventoryItemMessage): string {
  if (typeof msg.itemType === 'string') {
    try {
      return getItemStats(msg.itemType).color || DEFAULT_COLOR;
    } catch {}
  }
  const t = inferType(msg);
  const color = (ITEM_COLORS as Record<string, string | undefined>)[t];
  return color || DEFAULT_COLOR;
}

function getId(msg: InventoryItemMessage): string {
  const id = msg.id || msg.inventoryItemId || msg.instanceId;
  if (typeof id === 'string' && id.length > 0) return id;
  const base =
    typeof msg.itemType === 'string'
      ? msg.itemType
      : typeof msg.type === 'string'
        ? msg.type
        : 'item';
  return `${base}_${Math.random().toString(36).slice(2, 10)}`;
}

export function mapInventoryMessageToClientItem(
  msg: InventoryItemMessage
): InventoryItem {
  const type = inferType(msg);
  const stats =
    typeof msg.itemType === 'string'
      ? (() => {
          try {
            return getItemStats(msg.itemType!);
          } catch {
            return null;
          }
        })()
      : null;

  const name = inferName(msg);
  const potionMeta = inferPotionMeta(name, type, stats);
  const item: InventoryItem = {
    id: getId(msg),
    inventoryItemId:
      typeof msg.inventoryItemId === 'string' ? msg.inventoryItemId : undefined,
    instanceId: typeof msg.instanceId === 'string' ? msg.instanceId : undefined,
    name,
    type,
    quantity:
      typeof msg.quantity === 'number' &&
      Number.isFinite(msg.quantity) &&
      msg.quantity > 0
        ? Math.floor(msg.quantity)
        : 1,
    color: inferColor(msg),
    description: stats?.description,
    rarity: stats?.rarity as InventoryItem['rarity'] | undefined,
    wearableSlug: msg.wearableSlug ?? undefined,
    quality: coerceQuality(msg.quality),
    spriteId: potionMeta.spriteId,
    potionTier: potionMeta.potionTier,
  };

  return item;
}

export function mapInventoryMessagesToClientItems(
  messages: InventoryItemMessage[] | readonly InventoryItemMessage[] | unknown
): InventoryItem[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) =>
    mapInventoryMessageToClientItem(m as InventoryItemMessage)
  );
}
