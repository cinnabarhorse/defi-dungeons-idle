'use client';

import { useEffect, useState } from 'react';
import { mapGotchiLoadError } from '../lib/session-errors';

export interface OwnedGotchiEquipmentRecord {
  id: number;
  name?: string;
  equippedWearables: number[]; // svgIds
}

interface EquipmentResponseDto {
  owner: string;
  aavegotchis: Array<{
    id: string;
    name?: string;
    equippedWearables: string[];
  }>;
}

interface UseGotchiEquipmentResult {
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;
  byId: Record<number, OwnedGotchiEquipmentRecord>;
  list: OwnedGotchiEquipmentRecord[];
}

// Ephemeral in-memory cache
let EQUIP_CACHE: {
  owner?: string;
  byId: Record<number, OwnedGotchiEquipmentRecord>;
  list: OwnedGotchiEquipmentRecord[];
  loaded: boolean;
} = { byId: {}, list: [], loaded: false };

let LOAD_PROMISE: Promise<void> | null = null;

export function clearGotchiEquipmentCache() {
  EQUIP_CACHE = { byId: {}, list: [], loaded: false };
  LOAD_PROMISE = null;
}

export function useGotchiEquipment(
  isConnected: boolean
): UseGotchiEquipmentResult {
  const SERVER_BASE_URL =
    process.env.NEXT_PUBLIC_APP_SERVER_URL || 'http://localhost:1999';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isConnected) return;
      if (EQUIP_CACHE.loaded && EQUIP_CACHE.list.length > 0) {
        // Serve from cache without network
        setTick((x) => x + 1);
        return;
      }
      setIsLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        if (!LOAD_PROMISE) {
          LOAD_PROMISE = (async () => {
            const res = await fetch(`${SERVER_BASE_URL}/api/aavegotchis`, {
              credentials: 'include',
            });
            if (!res.ok) {
              const payload = await res.json().catch(() => null);
              const mapped = mapGotchiLoadError(payload, res.status);
              const loadError = new Error(mapped.message) as Error & {
                code?: string | null;
              };
              loadError.code = mapped.code;
              throw loadError;
            }
            const data: EquipmentResponseDto = await res.json();
            const list: OwnedGotchiEquipmentRecord[] = (
              data.aavegotchis || []
            ).map((g) => ({
              id: parseInt(g.id, 10),
              name: g.name,
              equippedWearables: (g.equippedWearables || [])
                .map((s) => parseInt(s, 10))
                .filter((n) => Number.isFinite(n) && n > 0),
            }));
            const byId: Record<number, OwnedGotchiEquipmentRecord> = {};
            for (const it of list) byId[it.id] = it;
            EQUIP_CACHE = {
              owner: data.owner,
              list,
              byId,
              loaded: true,
            };
          })();
        }
        await LOAD_PROMISE;
        if (!cancelled) setTick((x) => x + 1);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Unknown error');
          setErrorCode(
            typeof e?.code === 'string' && e.code.trim().length > 0
              ? e.code
              : null
          );
        }
        // allow future retries
        LOAD_PROMISE = null;
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  return {
    isLoading,
    error,
    errorCode,
    byId: EQUIP_CACHE.byId,
    list: EQUIP_CACHE.list,
  };
}
