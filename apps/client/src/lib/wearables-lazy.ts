/**
 * Lazy-loaded wearables data to reduce initial bundle size and memory usage
 */

import type { ItemTypes } from '../data/wearables';

// Cache for loaded wearable chunks
const wearableChunks = new Map<string, Record<number, ItemTypes>>();

// Define chunk boundaries (split the large wearables file into smaller chunks)
const CHUNK_SIZE = 100; // 100 items per chunk

export async function getWearableChunk(
  startId: number
): Promise<Record<number, ItemTypes>> {
  const chunkKey = `chunk_${Math.floor(startId / CHUNK_SIZE)}`;

  if (wearableChunks.has(chunkKey)) {
    return wearableChunks.get(chunkKey)!;
  }

  // Dynamically import the full wearables data only when needed
  const { itemTypes } = await import('../data/wearables');

  // Extract the chunk
  const chunk: Record<number, ItemTypes> = {};
  const chunkStart = Math.floor(startId / CHUNK_SIZE) * CHUNK_SIZE;
  const chunkEnd = chunkStart + CHUNK_SIZE;

  for (let id = chunkStart; id < chunkEnd; id++) {
    if (itemTypes[id]) {
      chunk[id] = itemTypes[id];
    }
  }

  wearableChunks.set(chunkKey, chunk);
  return chunk;
}

export async function getWearableById(
  id: number
): Promise<ItemTypes | undefined> {
  const chunk = await getWearableChunk(id);
  return chunk[id];
}

export async function getWearablesByIds(
  ids: number[]
): Promise<Record<number, ItemTypes>> {
  const result: Record<number, ItemTypes> = {};
  const chunkPromises = new Set<Promise<Record<number, ItemTypes>>>();

  // Group IDs by chunk and load only necessary chunks
  for (const id of ids) {
    chunkPromises.add(getWearableChunk(id));
  }

  const chunks = await Promise.all(chunkPromises);

  // Collect requested items from all loaded chunks
  for (const id of ids) {
    for (const chunk of chunks) {
      if (chunk[id]) {
        result[id] = chunk[id];
        break;
      }
    }
  }

  return result;
}

// Clear cache when needed (useful for memory management)
export function clearWearableCache(): void {
  wearableChunks.clear();
}
