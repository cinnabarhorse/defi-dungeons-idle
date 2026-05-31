'use client';

import type { InventoryItem } from '../types/inventory';

export interface ItemThumbProps {
  item: InventoryItem;
  size?: 'xs' | 'sm' | 'md';
}

function sizeToClass(size: 'xs' | 'sm' | 'md'): string {
  if (size === 'xs') return 'w-7 h-7'; // ~28px, about 2/3 of 40px
  if (size === 'sm') return 'w-10 h-10'; // 40px
  return 'w-16 h-16'; // 64px
}

export function ItemThumb({ item, size = 'md' }: ItemThumbProps) {
  const sizeClass = sizeToClass(size);

  // USDC special case when provided by item
  const usdcAmount = (item as any)?.usdcAmount;
  const isUsdc =
    item.type === 'coin' &&
    typeof usdcAmount === 'number' &&
    Number.isFinite(usdcAmount);
  if (isUsdc) {
    const cl = sizeClass;
    return (
      <img
        src="/loot-icons/usdc.svg"
        alt={`USDC $${usdcAmount.toFixed(2)}`}
        className={`${cl} object-contain bg-gray-700/50 rounded border border-white/30`}
      />
    );
  }

  // Wearable sprite
  if (item.type === 'wearable' && item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt={item.name}
        className={`${sizeClass} object-contain bg-gray-700/50 rounded border border-white/30`}
      />
    );
  }

  if (item.spriteId) {
    return (
      <img
        src={`/wearables/${item.spriteId}.svg`}
        alt={item.name}
        className={`${sizeClass} object-contain bg-gray-700/50 rounded border border-white/30`}
      />
    );
  }

  // GHST token special-case
  if (item.type === 'coin' && item.name === 'GHST') {
    return (
      <img
        src="/sprites/coins/ghst.gif"
        alt="GHST Token"
        className={`${sizeClass} object-contain bg-gray-700/50 rounded border border-white/30`}
      />
    );
  }

  // Fallback colored square
  return (
    <div
      className={`${sizeClass} rounded flex-shrink-0 border border-white/30`}
      style={{ backgroundColor: item.color }}
    />
  );
}
