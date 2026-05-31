import type { InventoryItem } from '../types/inventory';
import { getWearableBySlug, getWearableRarity } from '../data/wearables';
import {
  getQualityLabelForWearable,
  getQualityScalar,
  normalizeQualityTier,
} from '../data/wearable-quality';

export type EquipmentSellRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'mythical'
  | 'godlike';

export const EQUIPMENT_SELL_DAILY_CAP = 10000;

export const EQUIPMENT_SELL_PRICE_BY_RARITY: Record<
  EquipmentSellRarity,
  number
> = {
  common: 1,
  uncommon: 3,
  rare: 8,
  legendary: 50,
  mythical: 100,
  godlike: 200,
};

const SELLABLE_TYPES = new Set(['wearable', 'weapon']);

const DENYLIST_TOKENS = new Set(['lick_tongue', 'lick tongue', 'usdc_coin']);

export function isSellableInventoryItem(item: InventoryItem): boolean {
  const type = String(item.type || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  if (!SELLABLE_TYPES.has(type)) {
    return false;
  }
  if (type === 'coin' || type === 'usdc_coin') {
    return false;
  }
  if (
    name === 'gold' ||
    name === 'gold coin' ||
    name === 'usdc coin' ||
    name === 'usdc_coin' ||
    name === 'usdc'
  ) {
    return false;
  }
  for (const token of DENYLIST_TOKENS) {
    if (type.includes(token) || name.includes(token)) {
      return false;
    }
  }
  return true;
}

export function getSellPriceForRarity(
  rarity: EquipmentSellRarity,
  options: { qualityScalar?: number; quantity?: number } = {}
) {
  const base = EQUIPMENT_SELL_PRICE_BY_RARITY[rarity];
  const scalar =
    typeof options.qualityScalar === 'number' && Number.isFinite(options.qualityScalar)
      ? options.qualityScalar
      : 1;
  const quantity =
    typeof options.quantity === 'number' && Number.isFinite(options.quantity)
      ? Math.max(1, Math.floor(options.quantity))
      : 1;
  const rawUnit = base * scalar;
  const unitPrice = Math.max(1, Math.round(rawUnit));
  const totalPrice = unitPrice * quantity;
  return { rarity, unitPrice, totalPrice, qualityScalar: scalar };
}

export function getSellPreview(item: InventoryItem, quantityOverride?: number) {
  if (!isSellableInventoryItem(item)) {
    return null;
  }

  const normalizedType = String(item.type || '').toLowerCase();
  const baseQuantity =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity)
      ? Math.max(1, Math.floor(item.quantity))
      : 1;
  const quantity =
    typeof quantityOverride === 'number' && Number.isFinite(quantityOverride)
      ? Math.max(1, Math.floor(quantityOverride))
      : baseQuantity;

  if (normalizedType === 'wearable') {
    const slug = String(item.wearableSlug || item.name || '').trim();
    const wearable = getWearableBySlug(slug);
    if (!wearable) {
      return null;
    }
    const rarity = getWearableRarity(wearable);
    const quality = normalizeQualityTier(item.quality ?? undefined);
    const scalar = getQualityScalar(quality);
    const pricing = getSellPriceForRarity(rarity, {
      qualityScalar: scalar,
      quantity: 1,
    });
    return {
      ...pricing,
      totalPrice: pricing.unitPrice,
      qualityLabel: getQualityLabelForWearable(quality, slug),
    };
  }

  const slug = String(item.wearableSlug || item.name || '').trim();
  const wearable = getWearableBySlug(slug);
  if (wearable) {
    const rarity = getWearableRarity(wearable);
    return getSellPriceForRarity(rarity, { quantity });
  }

  return null;
}
