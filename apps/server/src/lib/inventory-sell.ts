import { getWearableBySlug, getWearableRarity } from '../data/wearables';
import {
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
export const EQUIPMENT_SELL_MAX_ITEMS_PER_REQUEST = 500;
export const EQUIPMENT_SELL_RATE_LIMIT_WINDOW_MS = 5000;
export const EQUIPMENT_SELL_RATE_LIMIT_MAX_REQUESTS = 5;

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

export function isSellableEquipmentType(itemType: string): boolean {
  return SELLABLE_TYPES.has(String(itemType || '').toLowerCase());
}

export function isExplicitlyDeniedSellItem(
  itemType: string,
  itemName: string
): boolean {
  const normalizedType = String(itemType || '').toLowerCase().trim();
  const normalizedName = String(itemName || '').toLowerCase().trim();

  if (!normalizedType && !normalizedName) {
    return true;
  }

  if (normalizedType === 'coin' || normalizedType === 'usdc_coin') {
    return true;
  }

  if (
    normalizedName === 'gold' ||
    normalizedName === 'gold coin' ||
    normalizedName === 'usdc coin' ||
    normalizedName === 'usdc_coin' ||
    normalizedName === 'usdc'
  ) {
    return true;
  }

  for (const token of DENYLIST_TOKENS) {
    if (normalizedType.includes(token) || normalizedName.includes(token)) {
      return true;
    }
  }

  return false;
}

export function normalizeEquipmentRarity(
  value: string | null | undefined
): EquipmentSellRarity | null {
  const normalized = String(value || '').toLowerCase().trim();
  switch (normalized) {
    case 'common':
    case 'uncommon':
    case 'rare':
    case 'legendary':
    case 'mythical':
    case 'godlike':
      return normalized;
    case 'epic':
      return 'legendary';
    default:
      return null;
  }
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

export function getSellPriceForWearable(
  wearableSlug: string,
  quality?: string | null
) {
  const wearable = getWearableBySlug(wearableSlug);
  if (!wearable) {
    return null;
  }
  const rarity = getWearableRarity(wearable);
  const normalizedQuality = normalizeQualityTier(quality ?? undefined);
  const scalar = getQualityScalar(normalizedQuality);
  return getSellPriceForRarity(rarity, { qualityScalar: scalar, quantity: 1 });
}
