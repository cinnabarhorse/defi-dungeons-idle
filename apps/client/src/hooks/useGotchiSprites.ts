'use client';

import { useEffect, useState } from 'react';
import { getAppServerBaseUrl } from '../lib/server-url';
import { mapGotchiLoadError } from '../lib/session-errors';

interface SpriteMeta {
  id: number;
  url: string; // Supabase absolute or server-relative path
  hash: string;
}

interface SpritesResponse {
  wallet: string;
  sprites: SpriteMeta[];
}

interface AavegotchisResponse {
  owner: string;
  aavegotchis: Array<{ id: string } & Record<string, any>>;
}

export interface GotchiSpriteEntry {
  id: number;
  name?: string;
  equippedWearables?: number[]; // svgIds
  url: string; // absolute server URL (empty string until resolved)
  hash: string; // empty string until resolved
}

// Ephemeral in-memory cache (clears on full page refresh)
let GOTCHI_CACHE: { base: string; entries: GotchiSpriteEntry[] } | null = null;
let LOAD_PROMISE: Promise<GotchiSpriteEntry[]> | null = null;
let LOAD_PROMISE_BASE: string | null = null;
// Refresh counter to force refetch when cache is cleared
let REFRESH_COUNTER = 0;
// Callbacks to notify hooks when cache is cleared
const REFRESH_CALLBACKS = new Set<() => void>();

export function clearGotchiSpritesCache() {
  GOTCHI_CACHE = null;
  LOAD_PROMISE = null;
  LOAD_PROMISE_BASE = null;
  REFRESH_COUNTER++;
  // Notify all active hooks to refresh
  REFRESH_CALLBACKS.forEach((cb) => cb());
}

export function useGotchiSprites(
  isConnected: boolean,
  serverBaseUrl?: string
) {
  const base = (serverBaseUrl || getAppServerBaseUrl()).trim();
  const SERVER_BASE_URL = base.length
    ? base.replace(/\/$/, '')
    : getAppServerBaseUrl().replace(/\/$/, '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [entries, setEntries] = useState<GotchiSpriteEntry[]>([]);
  // Track refresh counter to force refetch when cache is cleared
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Register callback to be notified when cache is cleared
    const refreshCallback = () => {
      setRefreshTrigger((prev) => prev + 1);
    };
    REFRESH_CALLBACKS.add(refreshCallback);
    return () => {
      REFRESH_CALLBACKS.delete(refreshCallback);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isConnected) return;
      // Serve from in-memory cache if available
      if (GOTCHI_CACHE?.base === SERVER_BASE_URL && GOTCHI_CACHE.entries.length) {
        setEntries(GOTCHI_CACHE.entries);
        return;
      }
      setIsLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        // Deduplicate concurrent loads
        if (!LOAD_PROMISE || LOAD_PROMISE_BASE !== SERVER_BASE_URL) {
          LOAD_PROMISE_BASE = SERVER_BASE_URL;
          LOAD_PROMISE = (async () => {
            // Fetch owned gotchi IDs and any existing sprites in parallel (no generation)
            const [aaveRes, spritesRes] = await Promise.all([
              fetch(`${SERVER_BASE_URL}/api/aavegotchis`, {
                credentials: 'include',
              }),
              fetch(`${SERVER_BASE_URL}/api/gotchis`, {
                credentials: 'include',
              }),
            ]);

            if (!aaveRes.ok) {
              const payload = await aaveRes.json().catch(() => null);
              const mapped = mapGotchiLoadError(payload, aaveRes.status);
              const loadError = new Error(mapped.message) as Error & {
                code?: string | null;
              };
              loadError.code = mapped.code;
              throw loadError;
            }

            if (!spritesRes.ok) {
              const payload = await spritesRes.json().catch(() => null);
              const mapped = mapGotchiLoadError(payload, spritesRes.status);
              const loadError = new Error(mapped.message) as Error & {
                code?: string | null;
              };
              loadError.code = mapped.code;
              throw loadError;
            }

            const aaveData: AavegotchisResponse = await aaveRes.json();
            const spritesData: SpritesResponse = await spritesRes.json();

            const existingById = new Map<number, SpriteMeta>();
            for (const s of spritesData.sprites || []) {
              existingById.set(Number(s.id), s);
            }

            const list: GotchiSpriteEntry[] = (aaveData.aavegotchis || [])
              .map((raw) => {
                const idNum = Number(raw.id);
                const existing = existingById.get(idNum);
                const equippedWearables = (raw.equippedWearables || [])
                  .map((s: string) => parseInt(s, 10))
                  .filter((n: number) => Number.isFinite(n) && n > 0);

                const baseEntry: GotchiSpriteEntry = {
                  id: idNum,
                  name: raw.name,
                  equippedWearables,
                  url: '',
                  hash: '',
                };

                if (
                  existing &&
                  typeof existing.url === 'string' &&
                  existing.url.length > 0
                ) {
                  const abs = /^https?:\/\//i.test(existing.url)
                    ? existing.url
                    : `${SERVER_BASE_URL}${existing.url.startsWith('/') ? '' : '/'}${existing.url}`;
                  baseEntry.url = abs;
                  baseEntry.hash = existing.hash;
                }
                return baseEntry;
              })
              // ensure stable ordering by id
              .sort((a, b) => a.id - b.id);

            return list;
          })();
        }

        const list = await LOAD_PROMISE;
        GOTCHI_CACHE = { base: SERVER_BASE_URL, entries: list };
        if (!cancelled) setEntries(list);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Unknown error');
          setErrorCode(
            typeof e?.code === 'string' && e.code.trim().length > 0
              ? e.code
              : null
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
        // Allow subsequent loads if this one failed
        if (!GOTCHI_CACHE?.entries?.length) {
          LOAD_PROMISE = null;
          LOAD_PROMISE_BASE = null;
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [SERVER_BASE_URL, isConnected, refreshTrigger]);

  return { isLoading, error, errorCode, entries };
}

export function useApplyGotchiToCharacter(
  isConnected: boolean,
  targetCharacterId: string,
  serverBaseUrl?: string
) {
  const base = (serverBaseUrl || getAppServerBaseUrl()).trim();
  const SERVER_BASE_URL = base.length
    ? base.replace(/\/$/, '')
    : getAppServerBaseUrl().replace(/\/$/, '');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isConnected) return;
      setIsLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        const generateRes = await fetch(`${SERVER_BASE_URL}/api/gotchis/generate`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!generateRes.ok) {
          const payload = await generateRes.json().catch(() => null);
          const mapped = mapGotchiLoadError(payload, generateRes.status);
          const loadError = new Error(mapped.message) as Error & {
            code?: string | null;
          };
          loadError.code = mapped.code;
          throw loadError;
        }
        const res = await fetch(`${SERVER_BASE_URL}/api/gotchis`, {
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
        const data: SpritesResponse = await res.json();
        if (!data.sprites?.length)
          throw new Error('No Aavegotchis found for this wallet.');
        const meta = data.sprites[0];
        const abs =
          typeof meta.url === 'string' && meta.url.length > 0
            ? /^https?:\/\//i.test(meta.url)
              ? meta.url
              : `${SERVER_BASE_URL}${meta.url.startsWith('/') ? '' : '/'}${meta.url}`
            : '';
        if (!cancelled && abs) setUrl(abs);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Unknown error');
          setErrorCode(
            typeof e?.code === 'string' && e.code.trim().length > 0
              ? e.code
              : null
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [SERVER_BASE_URL, isConnected]);

  return { objectUrl: url, isLoading, error, errorCode };
}
