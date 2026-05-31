'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import type { InventoryItem } from '../types/inventory';
import { getWearableName } from '../lib/wearable-utils';
import { durabilityCapForQuality } from '../data/wearable-quality';

interface InventoryProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  onUseItem?: (itemId: string) => void;
}

const ITEM_COLORS = {
  coin: '#FFD700', // Gold
  potion: '#FF69B4', // Hot Pink
  weapon: '#8A2BE2', // Blue Violet
  material: '#32CD32', // Lime Green
  wearable: '#9370DB', // Medium Purple
};

const ITEM_NAMES = {
  coin: 'Gold',
  potion: 'Health Potion',
  weapon: 'Enchanted Weapon',
  material: 'Crafting Material',
  wearable: 'Wearable Item',
};

export function Inventory({
  isOpen,
  onClose,
  items,
  onUseItem,
}: InventoryProps) {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not the modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key to close inventory
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => document.removeEventListener('keydown', handleEscapeKey);
    }
  }, [isOpen, onClose]);

  // Grid size (8x6 = 48 slots)
  const GRID_COLS = 8;
  const GRID_ROWS = 6;
  const TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

  // Create a grid with items placed in slots
  const createInventoryGrid = () => {
    const grid: (InventoryItem | null)[] = new Array(TOTAL_SLOTS).fill(null);

    items.forEach((item, index) => {
      if (index < TOTAL_SLOTS) {
        grid[index] = item;
      }
    });

    return grid;
  };

  const inventoryGrid = createInventoryGrid();

  const handleSlotClick = (item: InventoryItem | null) => {
    if (item) {
      setSelectedItem(selectedItem?.id === item.id ? null : item);
    }
  };

  const handleUseItem = (item: InventoryItem) => {
    if (onUseItem) {
      onUseItem(item.id);
    }
    setSelectedItem(null);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <div
        data-testid="inventory-panel"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div className="bg-gray-900/95 backdrop-blur border border-gray-700 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">My Inventory</h2>
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2"
            >
              ✕
            </Button>
          </div>

          <div className="grid grid-cols-8 gap-2 mb-6">
            {inventoryGrid.map((item, index) => (
              <div
                key={item?.id ?? index}
                className={`
                  aspect-square border-2 rounded-lg flex items-center justify-center cursor-pointer transition-all
                  ${
                    item
                      ? 'border-gray-600 bg-gray-800 hover:border-gray-500'
                      : 'border-gray-700 bg-gray-800/50'
                  }
                  ${selectedItem?.id === item?.id ? 'border-blue-500 bg-blue-900/30' : ''}
                `}
                onClick={() => handleSlotClick(item)}
              >
                {item && (
                  <div className="relative w-full h-full flex items-center justify-center">
                    {/* Quality badge removed for wearable items in in-game inventory grid */}
                    {/* Item visual */}
                    {item.type === 'wearable' && item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-16 h-16 object-contain bg-gray-700 rounded"
                        onError={(e) => {
                          console.log(
                            `❌ Failed to load wearable image: ${item.imageUrl}`
                          );
                          // Replace with colored square on error
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-16 h-16 rounded';
                            fallback.style.backgroundColor =
                              ITEM_COLORS[item.type];
                            parent.appendChild(fallback);
                          }
                        }}
                        onLoad={() => {
                          console.log(
                            `✅ Successfully loaded wearable image: ${item.imageUrl}`
                          );
                        }}
                      />
                    ) : item.spriteId ? (
                      <img
                        src={`/wearables/${item.spriteId}.svg`}
                        alt={item.name}
                        className="w-16 h-16 object-contain bg-gray-700 rounded"
                        onLoad={() =>
                          console.log(
                            `✅ Sprite ${item.spriteId} loaded in inventory grid`
                          )
                        }
                        onError={(e) => {
                          console.error(
                            `❌ Failed to load sprite ${item.spriteId} in inventory grid:`,
                            e
                          );
                          // Replace with colored square on error
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-16 h-16 rounded';
                            fallback.style.backgroundColor =
                              ITEM_COLORS[item.type];
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : item.type === 'coin' &&
                      (item.name === 'USDC Coin' ||
                        typeof item.usdcAmount === 'number') ? (
                      <img
                        src="/loot-icons/usdc.svg"
                        alt="USDC Token"
                        className="w-16 h-16 object-contain bg-gray-700 rounded"
                        onLoad={() =>
                          console.log('✅ USDC SVG loaded in inventory grid')
                        }
                        onError={(e) => {
                          console.error(
                            '❌ Failed to load USDC SVG in inventory grid:',
                            e
                          );
                          // Replace with colored square on error
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-16 h-16 rounded';
                            fallback.style.backgroundColor =
                              ITEM_COLORS[item.type];
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : item.type === 'coin' && item.name === 'GHST' ? (
                      <img
                        src="/sprites/coins/ghst.gif"
                        alt="GHST Token"
                        className="w-16 h-16 object-contain bg-gray-700 rounded"
                        onLoad={() =>
                          console.log('✅ GHST GIF loaded in inventory grid')
                        }
                        onError={(e) => {
                          console.error(
                            '❌ Failed to load GHST GIF in inventory grid:',
                            e
                          );
                          // Replace with colored square on error
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'w-16 h-16 rounded';
                            fallback.style.backgroundColor =
                              ITEM_COLORS[item.type];
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded"
                        style={{
                          backgroundColor: ITEM_COLORS[item.type],
                        }}
                      />
                    )}
                    {/* Quantity badge */}
                    {item.quantity > 1 && (
                      <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                        {item.quantity > 9999 ? '9999+' : item.quantity}
                      </div>
                    )}
                    {/* Removed on-icon durability overlay */}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Item details panel */}
          {selectedItem && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 mr-4">
                  <h3 className="text-lg font-semibold text-white">
                    {selectedItem.type === 'wearable'
                      ? getWearableName(
                          selectedItem.wearableId,
                          selectedItem.name
                        )
                      : selectedItem.name || ITEM_NAMES[selectedItem.type]}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Quantity: {selectedItem.quantity}
                  </p>
                  {selectedItem.type === 'wearable' &&
                    typeof selectedItem.durabilityScore === 'number' && (
                      (() => {
                        const durabilityCap = durabilityCapForQuality(
                          selectedItem.quality
                        );
                        return (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-300">
                          <span>DUR:</span>
                          <span className="tabular-nums">
                            {Math.round(selectedItem.durabilityScore)} /{' '}
                            {durabilityCap}
                          </span>
                        </div>
                      </div>
                        );
                      })()
                    )}
                  {selectedItem.slot && (
                    <p className="text-blue-400 text-sm">
                      Slot: {selectedItem.slot}
                    </p>
                  )}
                  {selectedItem.rarity && (
                    <p
                      className={`text-sm font-medium ${
                        selectedItem.rarity === 'legendary'
                          ? 'text-orange-400'
                          : selectedItem.rarity === 'epic'
                            ? 'text-purple-400'
                            : selectedItem.rarity === 'rare'
                              ? 'text-blue-400'
                              : selectedItem.rarity === 'uncommon'
                                ? 'text-green-400'
                                : 'text-gray-400'
                      }`}
                    >
                      {selectedItem.rarity.charAt(0).toUpperCase() +
                        selectedItem.rarity.slice(1)}
                    </p>
                  )}
                  {selectedItem.description && (
                    <p className="text-gray-300 text-sm mt-2">
                      {selectedItem.description}
                    </p>
                  )}
                  {selectedItem.type === 'wearable' &&
                    selectedItem.imageUrl && (
                      <p className="text-yellow-400 text-xs mt-1">
                        Debug: {selectedItem.imageUrl}
                      </p>
                    )}
                  {selectedItem.stats && (
                    <div className="mt-2">
                      <p className="text-gray-400 text-xs mb-1">Stats:</p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        {selectedItem.stats.AGG !== 0 && (
                          <span
                            className={
                              selectedItem.stats.AGG! > 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            AGG: {selectedItem.stats.AGG! > 0 ? '+' : ''}
                            {selectedItem.stats.AGG}
                          </span>
                        )}
                        {selectedItem.stats.NRG !== 0 && (
                          <span
                            className={
                              selectedItem.stats.NRG! > 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            NRG: {selectedItem.stats.NRG! > 0 ? '+' : ''}
                            {selectedItem.stats.NRG}
                          </span>
                        )}
                        {selectedItem.stats.SPK !== 0 && (
                          <span
                            className={
                              selectedItem.stats.SPK! > 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            SPK: {selectedItem.stats.SPK! > 0 ? '+' : ''}
                            {selectedItem.stats.SPK}
                          </span>
                        )}
                        {selectedItem.stats.BRN !== 0 && (
                          <span
                            className={
                              selectedItem.stats.BRN! > 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            BRN: {selectedItem.stats.BRN! > 0 ? '+' : ''}
                            {selectedItem.stats.BRN}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {selectedItem.type === 'wearable' && selectedItem.imageUrl ? (
                    <img
                      src={selectedItem.imageUrl}
                      alt={selectedItem.name}
                      className="w-24 h-24 object-contain bg-gray-700 rounded"
                      onError={(e) => {
                        console.log(
                          `❌ Failed to load large wearable image: ${selectedItem.imageUrl}`
                        );
                        // Replace with colored square on error
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'w-24 h-24 rounded flex-shrink-0';
                          fallback.style.backgroundColor =
                            ITEM_COLORS[selectedItem.type];
                          parent.appendChild(fallback);
                        }
                      }}
                      onLoad={() => {
                        console.log(
                          `✅ Successfully loaded large wearable image: ${selectedItem.imageUrl}`
                        );
                      }}
                    />
                  ) : selectedItem.spriteId ? (
                    <img
                      src={`/wearables/${selectedItem.spriteId}.svg`}
                      alt={selectedItem.name}
                      className="w-24 h-24 object-contain bg-gray-700 rounded"
                      onLoad={() =>
                        console.log(
                          `✅ Sprite ${selectedItem.spriteId} loaded in inventory detail`
                        )
                      }
                      onError={(e) => {
                        console.error(
                          `❌ Failed to load sprite ${selectedItem.spriteId} in inventory detail:`,
                          e
                        );
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'w-24 h-24 rounded flex-shrink-0';
                          fallback.style.backgroundColor =
                            ITEM_COLORS[selectedItem.type];
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : selectedItem.type === 'coin' &&
                    (selectedItem.name === 'USDC Coin' ||
                      typeof selectedItem.usdcAmount === 'number') ? (
                    <img
                      src="/loot-icons/usdc.svg"
                      alt="USDC Token"
                      className="w-24 h-24 object-contain bg-gray-700 rounded"
                      onLoad={() =>
                        console.log('✅ USDC SVG loaded in inventory detail')
                      }
                      onError={(e) => {
                        console.error(
                          '❌ Failed to load USDC SVG in inventory detail:',
                          e
                        );
                        // Replace with colored square on error
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'w-24 h-24 rounded flex-shrink-0';
                          fallback.style.backgroundColor =
                            ITEM_COLORS[selectedItem.type];
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : selectedItem.type === 'coin' &&
                    selectedItem.name === 'GHST' ? (
                    <img
                      src="/sprites/coins/ghst.gif"
                      alt="GHST Token"
                      className="w-24 h-24 object-contain bg-gray-700 rounded"
                      onLoad={() =>
                        console.log('✅ GHST GIF loaded in inventory detail')
                      }
                      onError={(e) => {
                        console.error(
                          '❌ Failed to load GHST GIF in inventory detail:',
                          e
                        );
                        // Replace with colored square on error
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'w-24 h-24 rounded flex-shrink-0';
                          fallback.style.backgroundColor =
                            ITEM_COLORS[selectedItem.type];
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="w-24 h-24 rounded flex-shrink-0"
                      style={{
                        backgroundColor: ITEM_COLORS[selectedItem.type],
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {selectedItem.type === 'potion' && (
                  <Button
                    onClick={() => handleUseItem(selectedItem)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Use Item
                  </Button>
                )}
                {selectedItem.type === 'weapon' && (
                  <Button
                    onClick={() => handleUseItem(selectedItem)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    Equip
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setSelectedItem(null)}
                  className="border-gray-600 text-gray-300"
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Inventory stats */}
          <div className="mt-4 flex justify-between text-sm text-gray-400">
            <span>
              {items.length} / {TOTAL_SLOTS} slots used
            </span>
            <span>
              {items.reduce((total, item) => total + item.quantity, 0)} total
              items
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
