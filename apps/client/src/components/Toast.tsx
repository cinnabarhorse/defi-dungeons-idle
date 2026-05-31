'use client';

import { useState, useEffect } from 'react';
import type { InventoryItem } from '../types/inventory';
import { formatWearableDisplayName } from '../lib/wearable-utils';

type ToastType =
  | 'pickup'
  | 'auto_heal'
  | 'portal_guardian_spawn'
  | 'portals_opened'
  | 'treasure_chest'
  | 'error'
  | 'success'
  | 'info';

interface NotificationData {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  item: InventoryItem | null;
  notification: NotificationData | null;
  onClose: () => void;
  onViewInventory?: () => void;
  // When true, render suitable for stacked container (no fixed centering)
  inline?: boolean;
  // Optional override for how long the toast stays visible
  durationMs?: number;
}

interface ToastConfig {
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
  iconColor: string;
  message: string;
  quantityFormat: (quantity: number) => string;
  showViewButton: boolean;
  duration: number;
}

const TOAST_CONFIGS: Record<ToastType, ToastConfig> = {
  pickup: {
    bgColor: 'bg-green-600/95',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-100',
    icon: '✓',
    iconColor: 'text-green-200',
    message: 'Item picked up!',
    quantityFormat: (quantity: number) => `+${quantity}`,
    showViewButton: true,
    duration: 5000,
  },
  auto_heal: {
    bgColor: 'bg-red-600/95',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-100',
    icon: '🚑',
    iconColor: 'text-red-200',
    message: 'Emergency healing activated!',
    quantityFormat: (quantity: number) => `+${quantity} HP`,
    showViewButton: false,
    duration: 4000,
  },
  portal_guardian_spawn: {
    bgColor: 'bg-purple-600/95',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-100',
    icon: '👑',
    iconColor: 'text-purple-200',
    message: 'A Portal Guardian has appeared!',
    quantityFormat: (quantity: number) => '',
    showViewButton: false,
    duration: 6000,
  },
  portals_opened: {
    bgColor: 'bg-blue-600/95',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-100',
    icon: '🌀',
    iconColor: 'text-blue-200',
    message: 'The Portals have opened!',
    quantityFormat: (quantity: number) => '',
    showViewButton: false,
    duration: 5000,
  },
  treasure_chest: {
    bgColor: 'bg-amber-600/95',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-100',
    icon: '💰',
    iconColor: 'text-amber-200',
    message: 'Treasure chest opened!',
    quantityFormat: (quantity: number) => '',
    showViewButton: false,
    duration: 5000,
  },
  error: {
    bgColor: 'bg-red-600/95',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-100',
    icon: '⚠️',
    iconColor: 'text-red-200',
    message: 'Error',
    quantityFormat: (quantity: number) => '',
    showViewButton: false,
    duration: 4000,
  },
  success: {
    bgColor: 'bg-green-600/95',
    borderColor: 'border-green-500/30',
    textColor: 'text-green-100',
    icon: '✅',
    iconColor: 'text-green-200',
    message: 'Success',
    quantityFormat: (quantity: number) => '',
    showViewButton: false,
    duration: 4000,
  },
  info: {
    bgColor: 'bg-blue-600/95',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-100',
    icon: 'ℹ️',
    iconColor: 'text-blue-200',
    message: 'Info',
    quantityFormat: (quantity: number) => '',
    showViewButton: false,
    duration: 5000,
  },
};

export function Toast({
  item,
  notification,
  onClose,
  onViewInventory,
  inline = false,
  durationMs,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Determine toast type based on item properties or notification type
  const getToastType = (): ToastType => {
    if (notification) return notification.type;
    if (item?.name === 'Auto-Heal') return 'auto_heal';
    return 'pickup';
  };

  const toastType = getToastType();
  const config = TOAST_CONFIGS[toastType];

  useEffect(() => {
    if (item || notification) {
      setIsVisible(true);

      // Use dynamic duration from config
      const timer = setTimeout(
        () => {
          setIsVisible(false);
          setTimeout(onClose, 300); // Wait for fade out animation
        },
        typeof durationMs === 'number' ? durationMs : config.duration
      );

      return () => clearTimeout(timer);
    }
  }, [item, notification, onClose, durationMs, config.duration]);

  const handleViewInventory = () => {
    if (onViewInventory) {
      onViewInventory();
    }
    // Close the toast immediately when button is clicked
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!item && !notification) return null;

  return (
    <div
      className={
        inline
          ? `
        relative z-[60] transition-all duration-300 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        `
          : `
        fixed top-20 left-1/2 transform -translate-x-1/2 z-[60]
        transition-all duration-300 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}
        `
      }
    >
      <div
        className={`${config.bgColor} backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-lg border ${config.borderColor}`}
      >
        <div className="flex items-center gap-3">
          {/* Visual element */}
          {notification ? (
            // For notifications, show the icon from config
            <div
              className={`w-16 h-16 rounded flex-shrink-0 border border-white/30 bg-purple-700/50 flex items-center justify-center`}
            >
              <span className={`text-3xl ${config.iconColor}`}>
                {config.icon}
              </span>
            </div>
          ) : item ? (
            // For items, show the item visual
            <>
              {(() => {
                const usdcAmount = (item as any)?.usdcAmount;
                const isUsdc =
                  item.type === 'coin' &&
                  typeof usdcAmount === 'number' &&
                  Number.isFinite(usdcAmount);
                if (isUsdc) {
                  let sizeClass = 'w-16 h-16';
                  if (usdcAmount <= 0.1) sizeClass = 'w-12 h-12';
                  else if (usdcAmount <= 0.5) sizeClass = 'w-16 h-16';
                  else sizeClass = 'w-20 h-20';
                  return (
                    <img
                      src="/loot-icons/usdc.svg"
                      alt={`USDC $${usdcAmount.toFixed(2)}`}
                      className={`${sizeClass} object-contain bg-gray-700/50 rounded border border-white/30`}
                    />
                  );
                }
                if (item.type === 'wearable' && item.imageUrl) {
                  return (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-16 h-16 object-contain bg-gray-700/50 rounded border border-white/30"
                      onError={(e) => {
                        console.log(
                          `❌ Failed to load wearable image in toast: ${item.imageUrl}`
                        );
                        // Replace with colored square on error
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'w-16 h-16 rounded flex-shrink-0 border border-white/30';
                          fallback.style.backgroundColor = item.color;
                          parent.appendChild(fallback);
                        }
                      }}
                      onLoad={() => {
                        console.log(
                          `✅ Successfully loaded wearable image in toast: ${item.imageUrl}`
                        );
                      }}
                    />
                  );
                }
                if (item.spriteId) {
                  return (
                    <img
                      src={`/wearables/${item.spriteId}.svg`}
                      alt={item.name}
                      className="w-16 h-16 object-contain bg-gray-700/50 rounded border border-white/30"
                      onLoad={() =>
                        console.log(
                          `✅ Sprite ${item.spriteId} loaded in toast`
                        )
                      }
                      onError={(e) => {
                        console.error(
                          `❌ Failed to load sprite ${item.spriteId} in toast:`,
                          e
                        );
                        // Replace with colored square on error
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'w-16 h-16 rounded flex-shrink-0 border border-white/30';
                          fallback.style.backgroundColor = item.color;
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  );
                }
                if (item.type === 'coin' && item.name === 'GHST') {
                  return (
                    <img
                      src="/sprites/coins/ghst.gif"
                      alt="GHST Token"
                      className="w-16 h-16 object-contain bg-gray-700/50 rounded border border-white/30"
                      onLoad={() => console.log('✅ GHST GIF loaded in toast')}
                      onError={(e) => {
                        console.error(
                          '❌ Failed to load GHST GIF in toast:',
                          e
                        );
                        console.log('Item details:', {
                          type: item.type,
                          name: item.name,
                        });
                      }}
                    />
                  );
                }
                return (
                  <div
                    className="w-16 h-16 rounded flex-shrink-0 border border-white/30"
                    style={{ backgroundColor: item.color }}
                  />
                );
              })()}
            </>
          ) : null}

          {/* Content info */}
          <div className="flex flex-col flex-1">
            {notification ? (
              // For notifications, show the message
              <span className="font-semibold">{notification.message}</span>
            ) : item ? (
              // For items, show item details
              <>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {(() => {
                      const amount = (item as any)?.usdcAmount;
                      if (
                        item.type === 'coin' &&
                        typeof amount === 'number' &&
                        Number.isFinite(amount)
                      ) {
                        const formatted = amount.toFixed(2);
                        return `+$${formatted} USDC`;
                      }
                      return config.quantityFormat(item.quantity);
                    })()}
                  </span>
                  <span>
                    {(() => {
                      const amount = (item as any)?.usdcAmount;
                      if (
                        item.type === 'coin' &&
                        typeof amount === 'number' &&
                        Number.isFinite(amount)
                      ) {
                        return 'USDC';
                      }
                      return item.type === 'wearable'
                        ? formatWearableDisplayName({
                            quality: item.quality,
                            wearableId: item.wearableId,
                            wearableSlug: item.wearableSlug,
                            fallbackName: item.name,
                          })
                        : item.name;
                    })()}
                  </span>
                </div>
                <span className={`text-xs opacity-80 ${config.textColor}`}>
                  {config.message}
                </span>
              </>
            ) : null}
          </div>

          {/* View Inventory Button */}
          {onViewInventory && config.showViewButton && (
            <button
              onClick={handleViewInventory}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors duration-200 border border-white/30 hover:border-white/50"
            >
              View
            </button>
          )}

          {/* Icon */}
          <div className={`text-xl ${config.iconColor}`}>{config.icon}</div>
        </div>
      </div>
    </div>
  );
}
