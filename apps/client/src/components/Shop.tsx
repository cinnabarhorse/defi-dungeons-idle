'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import type { InventoryItem } from '../types/inventory';

import { ITEM_COLORS } from '../data/items';

interface ShopItem {
  id: string;
  name: string;
  type: 'coin' | 'potion' | 'weapon' | 'material';
  price: number;
  currency: 'coin';
  color: string;
  description: string;
  inStock: boolean;
}

interface ShopProps {
  isOpen: boolean;
  onClose: () => void;
  inventoryItems: InventoryItem[];
  onPurchase: (item: ShopItem) => void;
}

function getGoldBalance(items: InventoryItem[]): number {
  return items.find((item) => item.type === 'coin')?.quantity || 0;
}

function getInventorySignature(items: InventoryItem[]): string {
  return items.map((item) => `${item.id}:${item.quantity}`).join('|');
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'shop_health_potion',
    name: 'Health Potion',
    type: 'potion',
    price: 1,
    currency: 'coin',
    color: ITEM_COLORS.potion,
    description: 'Restores 50 HP when consumed. Essential for survival!',
    inStock: true,
  },
  // Future items can be added here
  // {
  //   id: 'shop_weapon_upgrade',
  //   name: 'Weapon Upgrade',
  //   type: 'weapon',
  //   price: 5,
  //   currency: 'coin',
  //   color: ITEM_COLORS.weapon,
  //   description: 'Increases weapon damage by 5 points',
  //   inStock: true,
  // },
];

export function Shop({
  isOpen,
  onClose,
  inventoryItems,
  onPurchase,
}: ShopProps) {
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const inventorySignature = getInventorySignature(inventoryItems);
  const [goldCoins, setGoldCoins] = useState(() =>
    getGoldBalance(inventoryItems)
  );

  useEffect(() => {
    if (!isOpen) return;
    setGoldCoins(getGoldBalance(inventoryItems));
  }, [inventorySignature, isOpen, inventoryItems]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key to close shop
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

  const handlePurchase = (item: ShopItem) => {
    if (goldCoins >= item.price) {
      onPurchase(item);
      setGoldCoins((prev) => Math.max(0, prev - item.price));
      setSelectedItem(null);
    }
  };

  const canAfford = (item: ShopItem) => goldCoins >= item.price;

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div className="bg-amber-900/95 backdrop-blur border border-amber-700 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-amber-100">
                🏪 Gotchi Shop
              </h2>
              <p className="text-amber-200 text-sm">
                Trade your hard-earned gold for useful items!
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-amber-400 hover:text-amber-100 p-2"
            >
              ✕
            </Button>
          </div>

          {/* Player's Gold Display */}
          <div className="bg-amber-800/50 rounded-lg p-4 mb-6 border border-amber-600">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded"
                style={{ backgroundColor: ITEM_COLORS.coin }}
              />
              <div>
                <div className="text-amber-100 font-semibold">
                  Your Gold: {goldCoins}
                </div>
                <div className="text-amber-300 text-xs">
                  Spend wisely, adventurer!
                </div>
              </div>
            </div>
          </div>

          {/* Shop Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {SHOP_ITEMS.map((item) => (
              <div
                key={item.id}
                className={`
                  border-2 rounded-lg p-4 cursor-pointer transition-all
                  ${
                    selectedItem?.id === item.id
                      ? 'border-amber-400 bg-amber-800/30'
                      : 'border-amber-700 bg-amber-800/20 hover:border-amber-600'
                  }
                  ${!canAfford(item) ? 'opacity-60' : ''}
                `}
                onClick={() =>
                  setSelectedItem(selectedItem?.id === item.id ? null : item)
                }
              >
                <div className="flex items-start gap-3">
                  {/* Item visual */}
                  <div
                    className="w-12 h-12 rounded flex-shrink-0 border border-amber-600"
                    style={{ backgroundColor: item.color }}
                  />

                  {/* Item info */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-amber-100 font-semibold">
                        {item.name}
                      </h3>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: ITEM_COLORS.coin }}
                        />
                        <span className="text-amber-200 font-bold">
                          {item.price}
                        </span>
                      </div>
                    </div>
                    <p className="text-amber-300 text-sm">{item.description}</p>

                    {!canAfford(item) && (
                      <p className="text-red-400 text-xs mt-2">
                        Insufficient gold!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Purchase Panel */}
          {selectedItem && (
            <div className="bg-amber-800/40 rounded-lg p-4 border border-amber-600">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-amber-100">
                    Purchase {selectedItem.name}?
                  </h3>
                  <p className="text-amber-300 text-sm">
                    Cost: {selectedItem.price} gold
                  </p>
                </div>
                <div
                  className="w-12 h-12 rounded"
                  style={{ backgroundColor: selectedItem.color }}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handlePurchase(selectedItem)}
                  disabled={!canAfford(selectedItem)}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {canAfford(selectedItem) ? 'Buy Now' : 'Not Enough Gold'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedItem(null)}
                  className="border-amber-600 text-amber-300 hover:bg-amber-800/20"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Shop Footer */}
          <div className="mt-6 text-center text-xs text-amber-400">
            <p>💡 Tip: Kill enemies to earn gold coins!</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
