import type { MapCluster } from '../types/map-editor';
import { DEFAULT_MAP_FILES } from './default-map-files';

type MapChunkResponse = {
  file: string;
  varName?: string;
  chunks: MapCluster[];
};

export type MapChunkSets = Record<string, MapCluster[]>;

// DEFAULT_MAP_FILES now shared from ../data/default-map-files

const chunkCache = new Map<string, MapCluster[]>();

const toErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    if (data && typeof data === 'object' && 'error' in data) {
      return (data as { error?: string }).error || fallback;
    }
  } catch {
    // ignore parse errors and use fallback
  }
  return fallback;
};

export async function loadMapChunks(mapFile: string): Promise<MapCluster[]> {
  const cached = chunkCache.get(mapFile);
  if (cached) return cached;

  const specialEndpoints: Record<string, string> = {
    'generated/dungeon': '/api/maps/generated/dungeon',
    'chunks-staging.ts': '/api/maps/generated/staging',
    'chunks-boss.ts': '/api/maps/generated/boss',
  };

  const endpoint = specialEndpoints[mapFile];
  const url = endpoint
    ? endpoint
    : `/api/maps/${encodeURIComponent(mapFile)}?full=1`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Cache-Control': 'no-cache' },
  });

  if (!response.ok) {
    const message = await toErrorMessage(
      response,
      `Failed to load map chunks from ${mapFile}.`
    );
    throw new Error(message);
  }

  const data = (await response.json()) as
    | MapChunkResponse
    | { chunks: MapCluster[] };
  const chunks = Array.isArray((data as any).chunks)
    ? (data as any).chunks
    : [];
  chunkCache.set(mapFile, chunks);
  return chunks;
}

export function getCachedMapChunks(mapFile: string): MapCluster[] | undefined {
  return chunkCache.get(mapFile);
}

export function clearMapChunkCache(mapFile?: string): void {
  if (!mapFile) {
    chunkCache.clear();
    return;
  }
  chunkCache.delete(mapFile);
}

export async function loadDefaultMapChunks(): Promise<MapChunkSets> {
  const entries = await Promise.all(
    Object.entries(DEFAULT_MAP_FILES).map(async ([key, file]) => {
      try {
        const chunks = await loadMapChunks(file);
        return [key, chunks] as const;
      } catch (error) {
        console.error(error);
        return [key, []] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}

export const DEFAULT_MAP_FILE_LOOKUP = { ...DEFAULT_MAP_FILES };

// Select and load only the needed chunk set for the current tier/phase
type ChunkSetKey = 'dungeon' | 'grass' | 'boss';

export function getChunkSetKeyForDifficulty(
  difficultyTier: string,
  phase?: string
): ChunkSetKey {
  if (phase === 'boss_room') {
    return 'boss';
  }
  const tierId = String(difficultyTier || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  // All gameplay tiers use dungeon chunk set
  return 'dungeon';
}

export async function loadSelectedMapChunks(
  difficultyTier: string,
  phase?: string
): Promise<MapChunkSets> {
  const key = getChunkSetKeyForDifficulty(difficultyTier, phase);
  const file = DEFAULT_MAP_FILES[key];
  try {
    const chunks = await loadMapChunks(file);
    return { [key]: chunks } as MapChunkSets;
  } catch (error) {
    console.error('loadSelectedMapChunks failed', { key, file, error });
    return { [key]: [] } as MapChunkSets;
  }
}
