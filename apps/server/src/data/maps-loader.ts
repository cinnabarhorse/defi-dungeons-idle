import { readMapFileSync, type MapChunk } from '../../../../data/lib/mapFileIO';
import { generateChunksFromBlueprints } from '../../../../scripts/generate-chunks-from-blueprints';
import { DEFAULT_MAP_FILES } from './default-map-files';

const chunkCache = new Map<string, MapChunk[]>();

export function loadMapChunks(mapFile: string): MapChunk[] {
  // In development, always read fresh to reflect editor saves immediately
  const bypassCache = process.env.NODE_ENV !== 'production';
  if (!bypassCache) {
    const cached = chunkCache.get(mapFile);
    if (cached) return cached;
  }

  if (mapFile === 'generated/dungeon') {
    // No sync disk source for generated dungeon
    chunkCache.set(mapFile, []);
    return [];
  }
  const parsed = readMapFileSync(mapFile);
  if (!bypassCache) {
    chunkCache.set(mapFile, parsed.chunks);
  }
  return parsed.chunks;
}

export function loadDefaultMapChunks(): Record<string, MapChunk[]> {
  const entries = Object.entries(DEFAULT_MAP_FILES).map(
    ([key, file]) => [key, loadMapChunks(file)] as const
  );
  return Object.fromEntries(entries);
}

export async function fetchGeneratedDungeonChunks(
  apiBase: string
): Promise<MapChunk[]> {
  const url = `${apiBase.replace(/\/$/, '')}/api/maps/generated/dungeon`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch generated dungeon chunks: ${res.status}`
      );
    }
    const data = (await res.json()) as { chunks?: MapChunk[] };
    if (Array.isArray(data?.chunks) && data.chunks.length > 0) {
      return data.chunks;
    }
    console.warn(
      'fetchGeneratedDungeonChunks: API responded without chunk data, falling back to local generation'
    );
  } catch (error) {
    console.error(
      'fetchGeneratedDungeonChunks: failed to fetch chunks from client API, falling back to local generation',
      error
    );
  }

  try {
    const chunks = generateChunksFromBlueprints() as unknown as MapChunk[];
    console.log(
      `fetchGeneratedDungeonChunks: generated ${chunks.length} chunks locally from blueprints`
    );
    return chunks;
  } catch (fallbackError) {
    console.error(
      'fetchGeneratedDungeonChunks: failed to generate dungeon chunks from blueprints fallback',
      fallbackError
    );
    return [];
  }
}

export function clearMapChunksCache(mapFile?: string): void {
  if (!mapFile) {
    chunkCache.clear();
    return;
  }
  chunkCache.delete(mapFile);
}
