'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useSession } from '../providers/SessionProvider';
import { usePlayer } from '../providers/PlayerProvider';
import { getStackKey, getWearableStackKey } from '../../lib/inventory-keys';
import {
  EQUIPMENT_SELL_DAILY_CAP,
  getSellPreview,
  isSellableInventoryItem,
} from '../../lib/inventory-sell';
import { normalizeQualityTier } from '../../data/wearable-quality';
import type { InventoryItem } from '../../types/inventory';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  iconUrl: string;
  spriteId: number;
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'Restores 50 HP when consumed',
    price: 5,
    currency: 'Gold',
    iconUrl: '/wearables/126.svg',
    spriteId: 126,
  },
  {
    id: 'mana_potion',
    name: 'Mana Potion',
    description: 'Restores 30 MP when consumed',
    price: 5,
    currency: 'Gold',
    iconUrl: '/wearables/128.svg',
    spriteId: 127,
  },
];

const SELL_RARITY_OPTIONS = [
  'all',
  'common',
  'uncommon',
  'rare',
  'legendary',
  'mythical',
  'godlike',
] as const;

const SELL_QUALITY_OPTIONS = [
  'all',
  'broken',
  'budget',
  'average',
  'excellent',
  'flawless',
] as const;

interface ShopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverBaseUrl: string;
  onPurchaseSuccess?: () => void;
}

interface SellCapResponse {
  dailyCap: number;
  soldToday: number;
  remainingToday: number;
  resetsAtUtc: string;
}

export function ShopDialog({
  open,
  onOpenChange,
  serverBaseUrl,
  onPurchaseSuccess,
}: ShopDialogProps) {
  const { hasValidSession } = useSession();
  const { inventory } = usePlayer();
  const { refreshInventory } = inventory;
  const [purchasing, setPurchasing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);
  const [sellSuccess, setSellSuccess] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [cart, setCart] = useState<Record<string, number>>({
    health_potion: 0,
    mana_potion: 0,
  });
  const [selectedSellItems, setSelectedSellItems] = useState<
    Record<string, number>
  >({});
  const [sellCap, setSellCap] = useState<SellCapResponse | null>(null);
  const [sellCapError, setSellCapError] = useState<string | null>(null);
  const [sellCapLoading, setSellCapLoading] = useState(false);
  const [sellRarityFilter, setSellRarityFilter] =
    useState<(typeof SELL_RARITY_OPTIONS)[number]>('all');
  const [sellQualityFilter, setSellQualityFilter] =
    useState<(typeof SELL_QUALITY_OPTIONS)[number]>('all');

  // Get gold balance from inventory
  // Include refreshKey to force recalculation when inventory updates
  const goldBalance = useMemo(
    () =>
      inventory.inventoryItems.find(
        (item) =>
          item.type === 'coin' &&
          (item.name === 'Gold' || item.name === 'gold')
      )?.quantity || 0,
    [inventory.inventoryItems, refreshKey]
  );

  // Get owned potion counts
  const getOwnedCount = useCallback(
    (itemName: string) => {
      const item = inventory.inventoryItems.find(
        (invItem) =>
          invItem.type === 'potion' &&
          invItem.name === itemName
      );
      return item?.quantity || 0;
    },
    [inventory.inventoryItems]
  );

  const cartTotal = useMemo(() => {
    return SHOP_ITEMS.reduce((total, item) => {
      const quantity = cart[item.id] || 0;
      return total + item.price * quantity;
    }, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  }, [cart]);

  const sellableItems = useMemo(
    () =>
      inventory.inventoryItems.filter((item) => isSellableInventoryItem(item)),
    [inventory.inventoryItems, refreshKey]
  );

  const sellableGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; items: InventoryItem[]; representative: InventoryItem }
    >();
    sellableItems.forEach((item) => {
      const key =
        item.type === 'wearable'
          ? getWearableStackKey(item) ?? getStackKey(item)
          : getStackKey(item);
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, {
          key,
          items: [item],
          representative: item,
        });
      }
    });
    return Array.from(groups.values());
  }, [sellableItems]);

  const filteredSellableGroups = useMemo(() => {
    return sellableGroups.filter((group) => {
      const preview = getSellPreview(group.representative, 1);
      if (!preview) {
        return false;
      }
      if (sellRarityFilter !== 'all' && preview.rarity !== sellRarityFilter) {
        return false;
      }
      if (sellQualityFilter !== 'all') {
        if (group.representative.type !== 'wearable') {
          return false;
        }
        const quality = normalizeQualityTier(group.representative.quality);
        if (quality !== sellQualityFilter) {
          return false;
        }
      }
      return true;
    });
  }, [sellQualityFilter, sellRarityFilter, sellableGroups]);

  const selectableSellGroups = useMemo(
    () =>
      filteredSellableGroups.filter((group) =>
        Boolean(getSellPreview(group.representative, 1))
      ),
    [filteredSellableGroups]
  );

  const isAllSellableSelected = useMemo(() => {
    if (selectableSellGroups.length === 0) {
      return false;
    }
    return selectableSellGroups.every(
      (group) => (selectedSellItems[group.key] || 0) > 0
    );
  }, [selectableSellGroups, selectedSellItems]);

  const sellSelection = useMemo(() => {
    return filteredSellableGroups
      .map((group) => {
        const selectedQuantity = selectedSellItems[group.key];
        if (!selectedQuantity) {
          return null;
        }
        const preview = getSellPreview(group.representative, selectedQuantity);
        if (!preview) {
          return null;
        }
        return {
          group,
          selectedQuantity,
          preview,
        };
      })
      .filter(Boolean) as Array<{
      group: {
        key: string;
        items: InventoryItem[];
        representative: InventoryItem;
      };
      selectedQuantity: number;
      preview: ReturnType<typeof getSellPreview>;
    }>;
  }, [filteredSellableGroups, selectedSellItems]);

  const sellTotal = useMemo(() => {
    return sellSelection.reduce((sum, entry) => {
      if (!entry?.preview) return sum;
      if (entry.group.representative.type === 'wearable') {
        return sum + entry.preview.unitPrice * entry.selectedQuantity;
      }
      return sum + entry.preview.totalPrice;
    }, 0);
  }, [sellSelection]);

  const sellSelectionCount = useMemo(() => {
    return sellSelection.reduce((sum, entry) => sum + entry.selectedQuantity, 0);
  }, [sellSelection]);

  const getMaxAffordable = useCallback(
    (item: ShopItem) => {
      // Calculate how much gold we have after accounting for other items in cart
      const otherItemsCost = SHOP_ITEMS.reduce((total, otherItem) => {
        if (otherItem.id === item.id) return total;
        const quantity = cart[otherItem.id] || 0;
        return total + otherItem.price * quantity;
      }, 0);
      const availableGold = goldBalance - otherItemsCost;
      return Math.max(0, Math.floor(availableGold / item.price));
    },
    [goldBalance, cart]
  );

  const handleSetMax = useCallback(
    (item: ShopItem) => {
      const max = getMaxAffordable(item);
      setCart((prev) => ({ ...prev, [item.id]: max }));
    },
    [getMaxAffordable]
  );

  const handleQuantityChange = useCallback((itemId: string, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setCart((prev) => ({ ...prev, [itemId]: num }));
    }
  }, []);

  const handleClearCart = useCallback(() => {
    setCart({
      health_potion: 0,
      mana_potion: 0,
    });
    setError(null);
    setSuccess(null);
  }, []);

  const clearSellSelection = useCallback(() => {
    setSelectedSellItems({});
    setSellError(null);
    setSellSuccess(null);
  }, []);

  const sellCapEndpoint = useMemo(() => {
    if (!serverBaseUrl) {
      return '/api/economy/equipment-sell-cap';
    }
    return `${serverBaseUrl}/api/economy/equipment-sell-cap`;
  }, [serverBaseUrl]);

  const sellEndpoint = useMemo(() => {
    if (!serverBaseUrl) {
      return '/api/player/inventory/sell';
    }
    return `${serverBaseUrl}/api/player/inventory/sell`;
  }, [serverBaseUrl]);

  const fetchSellCap = useCallback(async () => {
    if (!sellCapEndpoint) {
      return;
    }
    setSellCapLoading(true);
    setSellCapError(null);
    try {
      const response = await fetch(sellCapEndpoint, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load sell cap');
      }
      const data = (await response.json()) as SellCapResponse;
      setSellCap(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load sell cap';
      setSellCapError(message);
    } finally {
      setSellCapLoading(false);
    }
  }, [sellCapEndpoint]);

  const handleToggleSellItem = useCallback(
    (group: {
      key: string;
      items: InventoryItem[];
      representative: InventoryItem;
    }) => {
      const maxQuantity =
        group.representative.type === 'wearable'
          ? Math.max(1, group.items.length)
          : Math.max(1, Math.floor(group.representative.quantity || 1));
    setSelectedSellItems((prev) => {
      const existing = prev[group.key];
      if (existing) {
        const next = { ...prev };
        delete next[group.key];
        return next;
      }
      return { ...prev, [group.key]: Math.max(1, maxQuantity > 0 ? 1 : 0) };
    });
    },
    []
  );

  const handleSellQuantityChange = useCallback(
    (
      group: { key: string; items: InventoryItem[]; representative: InventoryItem },
      value: string
    ) => {
      const maxQuantity =
        group.representative.type === 'wearable'
          ? Math.max(1, group.items.length)
          : Math.max(1, Math.floor(group.representative.quantity || 1));
      const parsed = Math.floor(Number(value) || 0);
      if (!parsed) {
        return;
      }
      const nextQuantity = Math.max(1, Math.min(maxQuantity, parsed));
      setSelectedSellItems((prev) => ({
        ...prev,
        [group.key]: nextQuantity,
      }));
    },
    []
  );

  const handleSelectAllSellable = useCallback(
    function handleSelectAllSellable() {
      setSelectedSellItems(() => {
        const nextSelection: Record<string, number> = {};
        selectableSellGroups.forEach((group) => {
          const maxQuantity =
            group.representative.type === 'wearable'
              ? Math.max(1, group.items.length)
              : Math.max(1, Math.floor(group.representative.quantity || 1));
          nextSelection[group.key] = maxQuantity;
        });
        return nextSelection;
      });
      setSellError(null);
      setSellSuccess(null);
    },
    [selectableSellGroups]
  );

  const handleCheckout = useCallback(async () => {
    if (!hasValidSession || !serverBaseUrl) {
      setError('Not connected to server');
      return;
    }

    if (cartItemCount === 0) {
      setError('Cart is empty');
      return;
    }

    if (goldBalance < cartTotal) {
      setError(
        `Insufficient Gold. Need ${cartTotal}, have ${goldBalance}.`
      );
      return;
    }

    setPurchasing(true);
    setError(null);
    setSuccess(null);

    try {
      // Build purchases array from cart
      const purchases = SHOP_ITEMS.filter((item) => cart[item.id] > 0).map(
        (item) => ({
          itemId: item.id,
          quantity: cart[item.id],
        })
      );

      const response = await fetch(`${serverBaseUrl}/api/shop/purchase`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purchases,
        }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Purchase failed');
      }

      // Build success message
      const itemsSummary = SHOP_ITEMS.filter((item) => cart[item.id] > 0)
        .map((item) => `${cart[item.id]}x ${item.name}`)
        .join(', ');
      setSuccess(
        `Purchased ${itemsSummary} for ${cartTotal} Gold!`
      );

      // Clear cart after successful purchase
      handleClearCart();

      // Refresh inventory to show updated gold balance and items
      // Force multiple refreshes to ensure we get the updated data
      // The database transaction might take a moment to be visible
      const doRefresh = async () => {
        // Immediate refresh
        await refreshInventory(true);
        // Refresh again after a short delay to catch any timing issues
        setTimeout(async () => {
          await refreshInventory(true);
          // Force a re-render to ensure UI updates
          setRefreshKey((k) => k + 1);
        }, 500);
      };
      await doRefresh();

      // Notify parent of success
      if (onPurchaseSuccess) {
        onPurchaseSuccess();
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      setError(message);
    } finally {
      setPurchasing(false);
    }
  }, [
    hasValidSession,
    serverBaseUrl,
    goldBalance,
    cart,
    cartTotal,
    cartItemCount,
    onPurchaseSuccess,
    handleClearCart,
    refreshInventory,
  ]);

  const handleSellSelected = useCallback(async () => {
    if (!hasValidSession || !serverBaseUrl) {
      setSellError('Not connected to server');
      return;
    }
    if (sellSelectionCount === 0) {
      setSellError('No items selected');
      return;
    }

    if (sellCap?.remainingToday === 0) {
      setSellError('Sold out for today. Resets at 00:00 UTC.');
      return;
    }

    setSelling(true);
    setSellError(null);
    setSellSuccess(null);

    try {
      const maxItemsPerRequest = 500;
      const sales: Array<
        | { inventoryItemId: string }
        | { itemType: string; itemName: string; quantity: number }
      > = [];
      sellSelection.forEach((entry) => {
        const representative = entry.group.representative;
        if (representative.type === 'wearable') {
          entry.group.items
            .slice(0, entry.selectedQuantity)
            .forEach((item) => {
              sales.push({
                inventoryItemId: item.inventoryItemId || item.id || '',
              });
            });
          return;
        }
        sales.push({
          itemType: representative.type,
          itemName: representative.name,
          quantity: entry.selectedQuantity,
        });
      });

      let totalPayout = 0;
      let latestCap = sellCap;
      for (let i = 0; i < sales.length; i += maxItemsPerRequest) {
        const batch = sales.slice(i, i + maxItemsPerRequest);
        const response = await fetch(sellEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(
            `Server returned non-JSON response: ${text.substring(0, 100)}`
          );
        }

        const data = await response.json();
        if (!response.ok) {
          const detail = data?.detail?.resetsAtUtc
            ? ` Resets at ${new Date(data.detail.resetsAtUtc).toUTCString()}.`
            : '';
          throw new Error(data.message || data.error || `Sell failed.${detail}`);
        }

        totalPayout += Number(data.payout || 0);
        if (data?.remainingToday !== undefined) {
          latestCap = {
            dailyCap: data.dailyCap,
            soldToday: data.soldToday,
            remainingToday: data.remainingToday,
            resetsAtUtc: data.resetsAtUtc,
          };
        }
      }

      setSellSuccess(`Sold for ${totalPayout} Gold`);
      clearSellSelection();
      if (latestCap) {
        setSellCap(latestCap);
      } else {
        await fetchSellCap();
      }

      const doRefresh = async () => {
        await refreshInventory(true);
        setTimeout(async () => {
          await refreshInventory(true);
          setRefreshKey((k) => k + 1);
        }, 500);
      };
      await doRefresh();
      setTimeout(() => {
        setSellSuccess(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sell failed';
      setSellError(message);
    } finally {
      setSelling(false);
    }
  }, [
    clearSellSelection,
    fetchSellCap,
    hasValidSession,
    refreshInventory,
    sellCap?.remainingToday,
    sellEndpoint,
    sellSelection,
    sellSelectionCount,
    sellCap,
    serverBaseUrl,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (activeTab !== 'sell') {
      return;
    }
    void fetchSellCap();
  }, [activeTab, fetchSellCap, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg overflow-hidden [&>div:first-child]:px-4 [&>div:first-child]:pt-4 [&>div:first-child]:pb-3 [&>div:last-child]:px-4 [&>div:last-child]:pt-3 [&>div:last-child]:pb-4"
        style={{ top: '50%', bottom: 'auto' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛒</span>
              <span>Portal Mage Shop</span>
            </div>
            <div className="flex items-center gap-2 text-amber-100">
              <img
                src="/loot-icons/coin.svg"
                alt="Gold"
                className="w-4 h-4"
              />
              <span className="text-base font-semibold">{goldBalance}</span>
            </div>
          </DialogTitle>
          <DialogDescription className="hidden">
            Purchase potions or sell gear for Gold
          </DialogDescription>
        </DialogHeader>

        <div className="mb-2 flex gap-2">
          <Button
            variant={activeTab === 'buy' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('buy')}
            className="flex-1"
          >
            Buy
          </Button>
          <Button
            variant={activeTab === 'sell' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('sell')}
            className="flex-1"
          >
            Sell
          </Button>
        </div>

        {activeTab === 'buy' ? (
          <>
            {/* Shop Items */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {SHOP_ITEMS.map((item) => {
                const quantity = cart[item.id] || 0;
                const maxAffordable = getMaxAffordable(item);
                const ownedCount = getOwnedCount(item.name);

                return (
                  <motion.div
                    key={item.id}
                    className="p-2.5 rounded-lg bg-white/5 border border-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={item.iconUrl}
                        alt={item.name}
                        className="w-10 h-10 object-contain flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-semibold text-white">
                              {item.name}
                            </h3>
                            <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                              Owned: {ownedCount}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <img
                              src="/loot-icons/coin.svg"
                              alt="Gold"
                              className="w-3.5 h-3.5"
                            />
                            <span className="text-xs font-semibold text-amber-300">
                              {item.price}
                            </span>
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <label className="text-[10px] text-gray-400">Qty:</label>
                          <input
                            type="number"
                            min="0"
                            max={maxAffordable}
                            value={quantity}
                            onChange={(e) =>
                              handleQuantityChange(item.id, e.target.value)
                            }
                            className="w-14 px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-white text-center"
                            disabled={purchasing}
                          />
                          <Button
                            onClick={() => handleSetMax(item)}
                            disabled={maxAffordable <= 0 || purchasing}
                            variant="outline"
                            size="sm"
                            className="text-[10px] h-6 px-1.5"
                          >
                            Max
                          </Button>
                          {quantity > 0 && (
                            <div className="flex items-center gap-0.5 ml-auto">
                              <img
                                src="/loot-icons/coin.svg"
                                alt="Gold"
                                className="w-3 h-3"
                              />
                              <span className="text-xs font-bold text-amber-300">
                                {item.price * quantity}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Cart Summary */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-300">
                  Cart Total:
                </span>
                <div className="flex items-center gap-2">
                  <img
                    src="/loot-icons/coin.svg"
                    alt="Gold"
                    className="w-5 h-5"
                  />
                  <span className="text-xl font-bold text-amber-300">
                    {cartTotal}
                  </span>
                  <span className="text-sm text-gray-400">
                    ({cartItemCount} item{cartItemCount !== 1 ? 's' : ''})
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleClearCart}
                  disabled={cartItemCount === 0 || purchasing}
                  variant="outline"
                  className="flex-1"
                >
                  Clear Cart
                </Button>
                <Button
                  onClick={handleCheckout}
                  disabled={
                    cartItemCount === 0 || purchasing || goldBalance < cartTotal
                  }
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
                >
                  {purchasing ? 'Processing...' : 'Buy Now'}
                </Button>
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
            {success && (
              <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <p className="text-sm text-green-300">{success}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Select
                value={sellRarityFilter}
                onValueChange={(value) =>
                  setSellRarityFilter(value as typeof sellRarityFilter)
                }
              >
                <SelectTrigger className="h-8 w-[140px] bg-white/5 text-xs text-white">
                  <SelectValue placeholder="Rarity" />
                </SelectTrigger>
                <SelectContent>
                  {SELL_RARITY_OPTIONS.map((rarity) => (
                    <SelectItem key={rarity} value={rarity}>
                      {rarity === 'all' ? 'All rarity' : rarity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sellQualityFilter}
                onValueChange={(value) =>
                  setSellQualityFilter(value as typeof sellQualityFilter)
                }
              >
                <SelectTrigger className="h-8 w-[140px] bg-white/5 text-xs text-white">
                  <SelectValue placeholder="Quality" />
                </SelectTrigger>
                <SelectContent>
                  {SELL_QUALITY_OPTIONS.map((quality) => (
                    <SelectItem key={quality} value={quality}>
                      {quality === 'all' ? 'All quality' : quality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSelectAllSellable}
                disabled={
                  selling ||
                  sellCap?.remainingToday === 0 ||
                  selectableSellGroups.length === 0 ||
                  isAllSellableSelected
                }
                variant="outline"
                size="sm"
                className="h-8 text-xs"
              >
                Select All
              </Button>
            </div>
            <div className="mb-3 text-xs text-gray-300">
              {sellCapLoading ? (
                <span>Loading daily cap...</span>
              ) : sellCap ? (
                <span>
                  Daily sell cap (global): {sellCap.dailyCap} Gold — Remaining
                  today: {sellCap.remainingToday}
                </span>
              ) : (
                <span>
                  Daily sell cap (global): {EQUIPMENT_SELL_DAILY_CAP} Gold
                </span>
              )}
              {sellCapError && (
                <span className="ml-2 text-red-300">{sellCapError}</span>
              )}
            </div>

            {sellCap?.remainingToday === 0 && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                Sold out for today. Resets at 00:00 UTC.
              </div>
            )}

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2">
              {filteredSellableGroups.length === 0 && (
                <div className="text-sm text-gray-400">
                  No sellable equipment in your inventory.
                </div>
              )}
              {filteredSellableGroups.map((group) => {
                const item = group.representative;
                const selectedQuantity = selectedSellItems[group.key] || 0;
                const preview = getSellPreview(
                  item,
                  selectedQuantity || undefined
                );
                const unitPrice = preview?.unitPrice ?? 0;
                const totalPrice =
                  selectedQuantity > 0
                    ? item.type === 'wearable'
                      ? unitPrice * selectedQuantity
                      : preview?.totalPrice ?? 0
                    : 0;
                const maxQuantity =
                  item.type === 'wearable'
                    ? Math.max(1, group.items.length)
                    : Math.max(1, Math.floor(item.quantity || 1));
                return (
                  <motion.div
                    key={group.key}
                    className="p-2.5 rounded-lg bg-white/5 border border-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedQuantity > 0}
                        onChange={() => handleToggleSellItem(group)}
                        className="h-4 w-4 accent-amber-400"
                        disabled={
                          selling ||
                          sellCap?.remainingToday === 0 ||
                          !preview
                        }
                      />
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-10 h-10 object-contain flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-semibold text-white">
                              {item.name}
                            </h3>
                            {preview?.rarity && (
                              <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                {preview.rarity}
                              </span>
                            )}
                            {preview &&
                              'qualityLabel' in preview &&
                              preview.qualityLabel && (
                              <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                {preview.qualityLabel}
                              </span>
                            )}
                            {maxQuantity > 1 && (
                              <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                x{maxQuantity}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <img
                              src="/loot-icons/coin.svg"
                              alt="Gold"
                              className="w-3.5 h-3.5"
                            />
                            <span className="text-xs font-semibold text-amber-300">
                              {preview ? unitPrice : '—'}
                            </span>
                          </div>
                        </div>

                        {preview && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <label className="text-[10px] text-gray-400">
                              Qty:
                            </label>
                            <div className="flex items-center gap-1">
                              <Button
                                onClick={() =>
                                  handleSellQuantityChange(
                                    group,
                                    String(Math.max(1, selectedQuantity - 1))
                                  )
                                }
                                disabled={
                                  selling ||
                                  sellCap?.remainingToday === 0 ||
                                  selectedQuantity <= 1
                                }
                                variant="outline"
                                size="sm"
                                className="h-6 w-6 px-0 text-xs"
                              >
                                -
                              </Button>
                              <input
                                type="number"
                                min="1"
                                max={maxQuantity}
                                value={selectedQuantity || 1}
                                onChange={(e) =>
                                  handleSellQuantityChange(
                                    group,
                                    e.target.value
                                  )
                                }
                                className="w-14 px-1.5 py-0.5 text-xs bg-white/10 border border-white/20 rounded text-white text-center"
                                disabled={selling || sellCap?.remainingToday === 0}
                              />
                              <Button
                                onClick={() =>
                                  handleSellQuantityChange(
                                    group,
                                    String(Math.min(maxQuantity, (selectedQuantity || 1) + 1))
                                  )
                                }
                                disabled={
                                  selling ||
                                  sellCap?.remainingToday === 0 ||
                                  selectedQuantity >= maxQuantity
                                }
                                variant="outline"
                                size="sm"
                                className="h-6 w-6 px-0 text-xs"
                              >
                                +
                              </Button>
                            </div>
                            <span className="text-[10px] text-gray-500">
                              / {maxQuantity}
                            </span>
                            {selectedQuantity > 0 && (
                              <div className="flex items-center gap-0.5 ml-auto">
                                <img
                                  src="/loot-icons/coin.svg"
                                  alt="Gold"
                                  className="w-3 h-3"
                                />
                                <span className="text-xs font-bold text-amber-300">
                                  {totalPrice}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {!preview && (
                          <div className="mt-1 text-[10px] text-red-300">
                            Pricing unavailable for this item.
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-300">
                  Sell Total:
                </span>
                <div className="flex items-center gap-2">
                  <img
                    src="/loot-icons/coin.svg"
                    alt="Gold"
                    className="w-5 h-5"
                  />
                  <span className="text-xl font-bold text-amber-300">
                    {sellTotal}
                  </span>
                  <span className="text-sm text-gray-400">
                    ({sellSelectionCount} item
                    {sellSelectionCount !== 1 ? 's' : ''})
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={clearSellSelection}
                  disabled={sellSelectionCount === 0 || selling}
                  variant="outline"
                  className="flex-1"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={handleSellSelected}
                  disabled={
                    sellSelectionCount === 0 ||
                    selling ||
                    sellCap?.remainingToday === 0 ||
                    (sellCap?.remainingToday !== undefined &&
                      sellTotal > sellCap.remainingToday)
                  }
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-lime-600 hover:from-emerald-500 hover:to-lime-500"
                >
                  {selling ? 'Processing...' : 'Sell Selected'}
                </Button>
              </div>
            </div>

            {sellError && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-300">{sellError}</p>
              </div>
            )}
            {sellSuccess && (
              <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <p className="text-sm text-green-300">{sellSuccess}</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
