/*
 * Render a PNG of the procedurally generated dungeon using actual chunk sprites
 * (as seen in-game), without launching the client.
 *
 * Usage:
 *   pnpm tsx scripts/render-dungeon-png.ts [seed] [difficulty] [outPath] [scale]
 * Example:
 *   pnpm tsx scripts/render-dungeon-png.ts 12345 nightmare_1 preview-dungeon-12345.png 1
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { MapGenerator } from '../apps/server/src/utils/MapGenerator';
import { GAME_CONFIG } from '../apps/server/src/lib/constants';
import { generateChunksFromBlueprints } from './generate-chunks-from-blueprints';

type ChunkAsset = {
  assetId?: string;
  sprite?: string;
  category?: string;
  x: number;
  y: number;
  zIndex?: number;
  allowOverlap?: boolean;
};

type ChunkDef = {
  name: string;
  width: number;
  height: number;
  assets: ChunkAsset[];
};

const ENV_SPRITE_ROOT = path.resolve(
  process.cwd(),
  'apps/client/public/sprites/env'
);

function layerOrder(category?: string, zIndex?: number): number {
  if (typeof zIndex === 'number') return zIndex; // explicit overrides
  switch (category) {
    case 'floors':
      return 10;
    case 'decor':
      return 20;
    case 'walls':
      return 30;
    case 'special':
      return 40;
    default:
      return 25; // middle layer
  }
}

async function render(
  seed: number,
  difficulty: string,
  outPath: string,
  scale: number
) {
  // 1) Generate layout from MapGenerator
  const mg = new MapGenerator(
    seed,
    GAME_CONFIG.MAP_WIDTH,
    GAME_CONFIG.MAP_HEIGHT,
    difficulty
  );
  const result: any = mg.generateEntities();
  const layout: Array<{ x: number; y: number; chunkName: string }> =
    result.chunkLayout || [];

  // 2) Load generated chunks directly from blueprints
  const generated = generateChunksFromBlueprints() as any[];
  const chunkIndex = new Map<string, ChunkDef>();
  for (const c of generated) {
    chunkIndex.set(c.name, c as ChunkDef);
  }

  const tileSize = GAME_CONFIG.TILE_SIZE;
  if (!tileSize || tileSize <= 0)
    throw new Error('Invalid GAME_CONFIG.TILE_SIZE');

  // Compute world dimensions in tiles
  if (layout.length === 0)
    throw new Error('MapGenerator returned empty chunk layout');
  const anyChunk = chunkIndex.get(layout[0].chunkName);
  if (!anyChunk) throw new Error(`Missing chunk def: ${layout[0].chunkName}`);
  const cellW = anyChunk.width;
  const cellH = anyChunk.height;

  // layout.x/y are grid cells; compute world tiles
  const maxCellX = Math.max(...layout.map((c) => c.x));
  const maxCellY = Math.max(...layout.map((c) => c.y));
  const worldTilesW = (maxCellX + 1) * cellW;
  const worldTilesH = (maxCellY + 1) * cellH;

  // Auto-downscale if pixel count is huge to avoid sharp limits
  const PIXEL_LIMIT = 100_000_000; // ~100M pixels
  let outScale = Math.max(0.1, Number(scale) || 1);
  let widthPx = Math.max(1, Math.floor(worldTilesW * tileSize * outScale));
  let heightPx = Math.max(1, Math.floor(worldTilesH * tileSize * outScale));
  let totalPixels = widthPx * heightPx;
  if (totalPixels > PIXEL_LIMIT) {
    const factor = Math.sqrt(PIXEL_LIMIT / totalPixels);
    outScale = outScale * factor;
    widthPx = Math.max(1, Math.floor(worldTilesW * tileSize * outScale));
    heightPx = Math.max(1, Math.floor(worldTilesH * tileSize * outScale));
    totalPixels = widthPx * heightPx;
    console.log(
      `ℹ️  Large map; auto-scaling to ${outScale.toFixed(3)}x (${widthPx}×${heightPx}) to stay under ${PIXEL_LIMIT.toLocaleString()} pixels.`
    );
  }

  const base = sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  type Overlay = sharp.OverlayOptions & { _order: number };
  const composites: Overlay[] = [];

  // Cache scaled sprite buffers
  const scaledCache = new Map<string, Buffer>();
  const existsCache = new Map<string, boolean>();
  const tilePx = Math.max(1, Math.round(tileSize * outScale));
  const missingSprites = new Set<string>();

  // Optional fallbacks for known non-gameplay markers
  const SPRITE_FALLBACKS = new Map<string, string>([
    ['special/PORT_MARKER.png', 'special/SIGN_ARROW.png'],
  ]);

  for (const cell of layout) {
    const def = chunkIndex.get(cell.chunkName);
    if (!def) continue;
    const originX = cell.x * cellW;
    const originY = cell.y * cellH;

    const sorted = [...def.assets].sort(
      (a, b) =>
        layerOrder(a.category, a.zIndex) - layerOrder(b.category, b.zIndex)
    );

    for (const a of sorted) {
      if (!a.sprite) continue; // non-visual markers
      const relSprite = SPRITE_FALLBACKS.get(a.sprite) || a.sprite;
      const spritePath = path.resolve(ENV_SPRITE_ROOT, relSprite);
      const leftPx = Math.round((originX + a.x) * tileSize * outScale);
      const topPx = Math.round((originY + a.y) * tileSize * outScale);

      // Ensure sprite exists (cache result)
      let exists = existsCache.get(spritePath);
      if (exists === undefined) {
        try {
          await fs.access(spritePath);
          exists = true;
        } catch {
          exists = false;
        }
        existsCache.set(spritePath, exists);
      }
      if (!exists) {
        missingSprites.add(relSprite);
        continue; // skip missing sprite
      }

      const cacheKey = `${spritePath}::${tilePx}`;
      let buf = scaledCache.get(cacheKey);
      if (!buf) {
        buf = await sharp(spritePath)
          .resize(tilePx, tilePx, { kernel: 'nearest' })
          .ensureAlpha()
          .toBuffer();
        scaledCache.set(cacheKey, buf);
      }
      composites.push({
        input: buf,
        left: leftPx,
        top: topPx,
        _order: layerOrder(a.category, a.zIndex),
      } as Overlay);
    }
  }

  // Sort by layer order just in case
  composites.sort((a, b) => a._order - b._order);

  await base
    .composite(composites)
    .png()
    .toFile(path.resolve(process.cwd(), outPath));
  console.log(`🖼️ Render saved → ${outPath} (${widthPx}×${heightPx})`);
  if (missingSprites.size > 0) {
    const examples = Array.from(missingSprites).slice(0, 5).join(', ');
    console.warn(
      `⚠️  Missing ${missingSprites.size} sprite(s). Examples: ${examples}`
    );
  }
}

const seed = Number(process.argv[2] || Date.now() % 100000);
const diff = String(process.argv[3] || 'nightmare_1');
const out = String(process.argv[4] || `preview-dungeon-sprites-${seed}.png`);
const scale = Number(process.argv[5] || 1);

render(seed, diff, out, scale).catch((err) => {
  console.error(err);
  process.exit(1);
});
