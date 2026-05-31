/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Client ChunksHelper Data - Generated from /data/chunksHelper.ts
 * Helper functions for authoring chunks (e.g., floor(), fillRange(), constants).
 *
 * To make changes, edit /data/chunksHelper.ts and run: npm run generate:shared
 */

// Shared helpers for authoring dungeon chunks without repetition.
// Keep this file self-contained so it can be used by scripts and data files.

export const W = 40; // default cell width (tiles)
export const H = 40; // default cell height (tiles)
export const CW = 4; // default corridor width (tiles)

export const DEFAULT_FLOOR_ID = 'grass_tiles_master_cyberkawaii_20';

export function floor(
  x: number,
  y: number,
  id: string = DEFAULT_FLOOR_ID,
  sprite: string = `floors/cyberkawaii/${id}.png`
) {
  return {
    id: `floor_${id}_${x}_${y}`,
    assetId: id,
    x,
    y,
    sprite,
    category: 'floors',
    allowOverlap: false,
  } as const;
}

export function wall(
  x: number,
  y: number,
  id: string,
  sprite: string = `walls/${id}.png`
) {
  return {
    id: `wall_${id}_${x}_${y}`,
    assetId: id,
    x,
    y,
    sprite,
    category: 'walls',
    allowOverlap: false,
  } as const;
}

export function spawn(x: number, y: number, type: string) {
  return {
    id: `enemy_${type}_${x}_${y}`,
    assetId: type,
    x,
    y,
    category: 'enemies',
    isEnemy: true,
    enemyType: type,
  } as const;
}

export function npc(x: number, y: number, characterId: string) {
  return {
    id: `npc_${characterId}_${x}_${y}`,
    assetId: characterId,
    x,
    y,
    category: 'characters',
    isCharacter: true,
  } as const;
}

export function spawnPoint(x: number, y: number) {
  return {
    id: `spawnpoint_${x}_${y}`,
    assetId: 'spawn',
    x,
    y,
    category: 'special',
    isSpawnPoint: true,
  } as const;
}

// Create many floor tiles in a rectangular range (inclusive), with optional steps.
// Example: fillRange(0, 0, W - 1, H - 1) // sparse fill (defaults step=2)
export function fillRange(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts?: { id?: string; stepX?: number; stepY?: number; sprite?: string }
) {
  const id = opts?.id ?? DEFAULT_FLOOR_ID;
  const stepX = Math.max(1, opts?.stepX ?? 2);
  const stepY = Math.max(1, opts?.stepY ?? 2);
  const sprite = opts?.sprite ?? `floors/cyberkawaii/${id}.png`;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const out: any[] = [];
  for (let y = minY; y <= maxY; y += stepY) {
    for (let x = minX; x <= maxX; x += stepX) {
      out.push(floor(x, y, id, sprite));
    }
  }
  return out;
}

export function fillRangeWalls(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: { id: string; stepX?: number; stepY?: number; sprite?: string }
) {
  const id = opts.id;
  const stepX = Math.max(1, opts?.stepX ?? 1);
  const stepY = Math.max(1, opts?.stepY ?? 1);
  const sprite = opts?.sprite ?? `walls/${id}.png`;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const out: any[] = [];
  for (let y = minY; y <= maxY; y += stepY) {
    for (let x = minX; x <= maxX; x += stepX) {
      out.push(wall(x, y, id, sprite));
    }
  }
  return out;
}
