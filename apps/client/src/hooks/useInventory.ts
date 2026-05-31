import { useState, useCallback, useMemo, useEffect } from 'react';
import type { InventoryItem, DroppedItem } from '../types/inventory';
import { getSupabaseBrowserClient } from '../lib/supabase-client';
import {
  getStackKey as getStackKeyShared,
  getWearableKey as getWearableKeyShared,
} from '../lib/inventory-keys';
import { fetchDedupe } from '../lib/fetch-dedupe';

export const QUALITY_ORDER: Record<string, number> = {
  flawless: 0,
  excellent: 1,
  average: 2,
  budget: 3,
  broken: 4,
};

export type DestroyInventoryRequest =
  | {
      kind: 'fungible';
      itemType: string;
      itemName: string;
      quantity: number;
      stackKey?: string;
    }
  | {
      kind: 'wearable';
      inventoryItemId: string;
    };

export interface DestroyedInventoryItemSummary {
  id: string;
  name: string;
  type: InventoryItem['type'];
  quantity: number;
  isWearable: boolean;
}

interface DestroySnapshotEntryFungible {
  kind: 'fungible';
  itemType: string;
  itemName: string;
  quantityRemoved: number;
  prototype: InventoryItem;
}

interface DestroySnapshotEntryWearable {
  kind: 'wearable';
  item: InventoryItem;
}

type DestroySnapshotEntry =
  | DestroySnapshotEntryFungible
  | DestroySnapshotEntryWearable;

// Optimistic removal and undo have been removed for a synchronous flow

function aggregateDestroySummary(
  entries: DestroyedInventoryItemSummary[]
): DestroyedInventoryItemSummary[] {
  const map = new Map<string, DestroyedInventoryItemSummary>();
  entries.forEach((entry) => {
    const existing = map.get(entry.id);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      map.set(entry.id, { ...entry });
    }
  });
  return Array.from(map.values());
}

function normalizeInventory(items: InventoryItem[]): InventoryItem[] {
  const grouped = new Map<string, InventoryItem>();

  items.forEach((raw) => {
    if (!raw) return;
    const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
    if (quantity <= 0) {
      return;
    }

    const normalized: InventoryItem = {
      ...raw,
      id:
        raw.id ||
        raw.inventoryItemId ||
        `${raw.name?.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
      quantity,
    };

    if (normalized.type === 'wearable') {
      const uniqueId =
        normalized.inventoryItemId || normalized.instanceId || normalized.id;
      grouped.set(uniqueId, {
        ...normalized,
        id: uniqueId,
        inventoryItemId: normalized.inventoryItemId ?? uniqueId,
        quantity: 1,
      });
      return;
    }

    const key = [
      normalized.type,
      normalized.name,
      normalized.wearableId ?? '',
    ].join('::');

    const existing = grouped.get(key);
    if (existing) {
      grouped.set(key, {
        ...existing,
        quantity: existing.quantity + normalized.quantity,
      });
    } else {
      grouped.set(key, {
        ...normalized,
        id: normalized.id || key,
      });
    }
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const aWearable = a.type === 'wearable';
    const bWearable = b.type === 'wearable';
    if (aWearable && !bWearable) return -1;
    if (!aWearable && bWearable) return 1;
    if (aWearable && bWearable) {
      const aRank =
        QUALITY_ORDER[a.quality ?? 'average'] ?? QUALITY_ORDER.average;
      const bRank =
        QUALITY_ORDER[b.quality ?? 'average'] ?? QUALITY_ORDER.average;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      const durabilityA = a.durabilityScore ?? 0;
      const durabilityB = b.durabilityScore ?? 0;
      if (durabilityA !== durabilityB) {
        return durabilityB - durabilityA;
      }
      return (a.name || '').localeCompare(b.name || '');
    }
    return (a.name || '').localeCompare(b.name || '');
  });
}

const getWearableKey = getWearableKeyShared;

const getStackKey = getStackKeyShared;

function isWearableItem(item: InventoryItem): boolean {
  return item.type === 'wearable';
}

function stackKeyFromRequest(request: DestroyInventoryRequest): string | null {
  if (request.kind === 'wearable') {
    return request.inventoryItemId;
  }
  if (request.stackKey) {
    return request.stackKey;
  }
  const base = `${request.itemType ?? 'unknown'}::${request.itemName.toLowerCase()}`;
  return base;
}

function applyDestroyRequests(
  items: InventoryItem[],
  requests: DestroyInventoryRequest[]
): {
  next: InventoryItem[];
  snapshot: DestroySnapshotEntry[];
  summary: DestroyedInventoryItemSummary[];
} {
  if (requests.length === 0) {
    return {
      next: items,
      snapshot: [],
      summary: [],
    };
  }

  const next = items.map((item) => ({ ...item }));
  const originalMap = new Map<string, InventoryItem>();
  for (const item of items) {
    originalMap.set(getStackKey(item), item);
  }

  const snapshot: DestroySnapshotEntry[] = [];
  const summary: DestroyedInventoryItemSummary[] = [];

  const removeWearable = (
    request: DestroyInventoryRequest & { kind: 'wearable' }
  ) => {
    const targetId = request.inventoryItemId;
    const index = next.findIndex(
      (candidate) => getWearableKey(candidate) === targetId
    );
    if (index < 0) {
      return;
    }
    const wearableKey = getWearableKey(next[index]);
    const original = originalMap.get(wearableKey);
    const removed = original ? { ...original } : { ...next[index] };
    next.splice(index, 1);
    snapshot.push({
      kind: 'wearable',
      item: removed,
    });
    summary.push({
      id: getWearableKey(removed),
      name: removed.name ?? removed.wearableSlug ?? 'Wearable',
      type: removed.type,
      quantity: 1,
      isWearable: true,
    });
  };

  const removeFungible = (
    request: DestroyInventoryRequest & { kind: 'fungible' }
  ) => {
    if (request.quantity <= 0) {
      return;
    }
    const desiredKey =
      request.stackKey ??
      `${request.itemType}::${request.itemName.toLowerCase()}`;
    const index = next.findIndex((candidate) => {
      if (candidate.type === 'wearable') return false;
      const candidateKey = getStackKey(candidate);
      if (desiredKey) {
        return candidateKey === desiredKey;
      }
      return (
        candidate.type === request.itemType &&
        (candidate.name ?? '').toLowerCase() === request.itemName.toLowerCase()
      );
    });
    if (index < 0) {
      return;
    }
    const current = next[index];
    const original = originalMap.get(getStackKey(current)) ?? current;
    const previousQuantity = Number(current.quantity) || 0;
    if (previousQuantity <= 0) {
      return;
    }
    const removedQuantity = Math.min(
      previousQuantity,
      Math.floor(request.quantity)
    );
    const remaining = previousQuantity - removedQuantity;
    snapshot.push({
      kind: 'fungible',
      itemType: request.itemType,
      itemName: request.itemName,
      quantityRemoved: removedQuantity,
      prototype: { ...original },
    });
    summary.push({
      id: getStackKey(original),
      name: original.name ?? `${request.itemType}`,
      type: original.type,
      quantity: removedQuantity,
      isWearable: false,
    });
    if (remaining <= 0) {
      next.splice(index, 1);
    } else {
      next[index] = {
        ...current,
        quantity: remaining,
      };
    }
  };

  for (const request of requests) {
    if (request.kind === 'wearable') {
      removeWearable(request);
    } else {
      removeFungible(request);
    }
  }

  return {
    next: normalizeInventory(next),
    snapshot,
    summary,
  };
}

function restoreDestroySnapshot(
  items: InventoryItem[],
  snapshot: DestroySnapshotEntry[]
): InventoryItem[] {
  if (snapshot.length === 0) {
    return items;
  }
  const next = items.map((item) => ({ ...item }));

  for (const entry of snapshot) {
    if (entry.kind === 'wearable') {
      const key = getWearableKey(entry.item);
      const existingIndex = next.findIndex(
        (candidate) => getWearableKey(candidate) === key
      );
      if (existingIndex >= 0) {
        // already exists, skip
        continue;
      }
      next.push({ ...entry.item });
      continue;
    }

    const stackKey = getStackKey(entry.prototype);
    const index = next.findIndex(
      (candidate) => getStackKey(candidate) === stackKey
    );
    if (index >= 0) {
      const currentQuantity = Number(next[index].quantity) || 0;
      next[index] = {
        ...next[index],
        quantity: currentQuantity + entry.quantityRemoved,
      };
    } else {
      next.push({
        ...entry.prototype,
        quantity: entry.quantityRemoved,
      });
    }
  }

  return normalizeInventory(next);
}

export function useInventory(
  playerId?: string | null,
  isSessionReady: boolean = true
) {
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventoryItems, setInventoryItemsState] = useState<InventoryItem[]>(
    []
  );
  const [droppedItems, setDroppedItems] = useState<DroppedItem[]>([]);
  const [toastItem, setToastItem] = useState<InventoryItem | null>(null);
  // Pending/undo removed
  const [destroyError, setDestroyError] = useState<string | null>(null);

  const baseUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/$/, ''),
    []
  );

  const inventoryEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/inventory`
      : '/api/player/inventory';
  }, [baseUrl]);
  const destroyEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/inventory/remove`
      : '/api/player/inventory/remove';
  }, [baseUrl]);

  const setInventoryItems = useCallback((items: InventoryItem[]) => {
    const normalized = normalizeInventory(items);
    setInventoryItemsState(normalized);
  }, []);

  // No timer cleanup needed

  const addItemToInventory = useCallback(
    (item: InventoryItem) => {
      setToastItem(item);
      setTimeout(() => setToastItem(null), 3000);
      return inventoryItems;
    },
    [inventoryItems]
  );

  const removeItemFromInventory = useCallback(
    (itemId: string, quantity: number = 1) => {
      if (!itemId || quantity <= 0) {
        return inventoryItems;
      }
      setInventoryItemsState((current) => {
        if (!Array.isArray(current) || current.length === 0) {
          return current;
        }
        const index = current.findIndex((item) => item.id === itemId);
        if (index < 0) {
          return current;
        }
        const item = current[index];
        const nextQuantity = Math.max(0, Math.floor(item.quantity - quantity));
        if (nextQuantity === item.quantity) {
          return current;
        }
        const next = current.slice();
        if (nextQuantity <= 0) {
          next.splice(index, 1);
        } else {
          next[index] = { ...item, quantity: nextQuantity } as InventoryItem;
        }
        return next;
      });
      return inventoryItems;
    },
    [inventoryItems]
  );

  const useItem = useCallback(
    (itemId: string) => {
      return inventoryItems.find((i) => i.id === itemId);
    },
    [inventoryItems]
  );

  const hydrateFromServer = useCallback(async (forceFresh: boolean = false) => {
    if (!isSessionReady) {
      setInventoryItems([]);
      return;
    }

    try {
      const url =
        forceFresh && typeof window !== 'undefined'
          ? `${inventoryEndpoint}${inventoryEndpoint.includes('?') ? '&' : '?'}_t=${Date.now()}`
          : inventoryEndpoint;
      const response = forceFresh
        ? await fetch(url, {
            credentials: 'include',
            cache: 'no-store',
          })
        : await fetchDedupe(url, {
            credentials: 'include',
            cache: 'no-store', // Prevent stale data from cache
          });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      if (!Array.isArray(payload?.inventory)) {
        return;
      }
      setInventoryItems(payload.inventory as InventoryItem[]);
    } catch (error) {
      console.warn('Failed to hydrate inventory from server', error);
    }
  }, [inventoryEndpoint, isSessionReady, setInventoryItems]);

  // finalizeDestroy removed

  const requestDestroy = useCallback(
    async (
      requests: DestroyInventoryRequest[],
      _options: { source?: string | null } = {}
    ): Promise<boolean> => {
      if (!isSessionReady) {
        setDestroyError('You must be signed in to manage your inventory.');
        return false;
      }

      const sanitizedRequests = requests
        .map((request) => {
          if (request.kind === 'wearable') {
            const inventoryItemId = request.inventoryItemId?.trim();
            if (!inventoryItemId) {
              return null;
            }
            return {
              kind: 'wearable',
              inventoryItemId,
            } as DestroyInventoryRequest;
          }

          const quantity = Math.max(
            1,
            Math.floor(Number(request.quantity) || 0)
          );
          if (!quantity) {
            return null;
          }
          const itemType = request.itemType?.trim();
          const itemName = request.itemName?.trim();
          if (!itemType || !itemName) {
            return null;
          }
          return {
            kind: 'fungible' as const,
            itemType,
            itemName,
            quantity,
            stackKey: request.stackKey,
          };
        })
        .filter(Boolean) as DestroyInventoryRequest[];

      if (sanitizedRequests.length === 0) {
        return false;
      }

      try {
        const body =
          sanitizedRequests.length === 1
            ? sanitizedRequests[0]
            : sanitizedRequests;
        const response = await fetch(destroyEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const message =
            (data && (data.message || data.error)) ||
            `Destroy failed (${response.status})`;
          setDestroyError(message);
          await hydrateFromServer().catch(() => undefined);
          return false;
        }
        const payload = await response.json().catch(() => null);
        if (Array.isArray(payload?.inventory)) {
          setInventoryItems(payload.inventory as InventoryItem[]);
        } else {
          await hydrateFromServer().catch(() => undefined);
        }
        setDestroyError(null);
        return true;
      } catch (error) {
        setDestroyError(
          error instanceof Error ? error.message : 'Failed to destroy inventory'
        );
        await hydrateFromServer().catch(() => undefined);
        return false;
      }
    },
    [isSessionReady, destroyEndpoint, hydrateFromServer, setInventoryItems]
  );

  // undo removed

  useEffect(() => {
    if (!isSessionReady) {
      setInventoryItems([]);
      return;
    }
    void hydrateFromServer();
  }, [isSessionReady, hydrateFromServer, setInventoryItems]);

  useEffect(() => {
    if (!playerId || !isSessionReady) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    let refreshTimeout: number | null = null;
    let active = true;

    const scheduleRefresh = () => {
      if (!active) {
        return;
      }
      if (typeof window === 'undefined') {
        void hydrateFromServer();
        return;
      }
      if (refreshTimeout != null) {
        return;
      }
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void hydrateFromServer();
      }, 150);
    };

    const channel = supabase.channel(`player-inventory-${playerId}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'player_inventories',
        filter: `player_id=eq.${playerId}`,
      },
      () => {
        scheduleRefresh();
      }
    );

    try {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          scheduleRefresh();
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn('Supabase inventory channel error');
          scheduleRefresh();
        }
      });
    } catch (error) {
      console.warn('Failed to subscribe to inventory updates', error);
    }

    return () => {
      active = false;
      if (refreshTimeout != null) {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = null;
      }
      channel.unsubscribe().catch(() => {
        // ignore
      });
      supabase.removeChannel(channel);
    };
  }, [playerId, hydrateFromServer, isSessionReady]);

  useEffect(() => {
    if (!playerId || !isSessionReady) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const interval = window.setInterval(() => {
      void hydrateFromServer();
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [playerId, hydrateFromServer, isSessionReady]);

  return useMemo(
    () => ({
      isInventoryOpen,
      setIsInventoryOpen,
      inventoryItems,
      setInventoryItems,
      droppedItems,
      setDroppedItems,
      toastItem,
      setToastItem,
      addItemToInventory,
      removeItemFromInventory,
      useItem,
      requestDestroy,
      destroyError,
      setDestroyError,
      refreshInventory: hydrateFromServer,
    }),
    [
      isInventoryOpen,
      inventoryItems,
      setInventoryItems,
      droppedItems,
      toastItem,
      addItemToInventory,
      removeItemFromInventory,
      useItem,
      requestDestroy,
      destroyError,
      hydrateFromServer,
    ]
  );
}
