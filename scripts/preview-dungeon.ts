/*
 * Renders a preview PNG of the dungeon floor bitmap using MapGenerator,
 * without running the game. Useful for iterating on generation.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { MapGenerator } from '../apps/server/src/utils/MapGenerator';
import { GAME_CONFIG } from '../apps/server/src/lib/constants';

// Lightweight PNG encoder (write RGBA to PNG). We use sharp (already dev dep).
import sharp from 'sharp';

function renderPreview(seed: number, difficulty: string, outPath: string) {
  const mg = new MapGenerator(
    seed,
    GAME_CONFIG.MAP_WIDTH,
    GAME_CONFIG.MAP_HEIGHT,
    difficulty
  );
  // Trigger generation to populate floor bitmap via chunks
  mg.generateEntities();

  const tileSize = GAME_CONFIG.TILE_SIZE;
  const widthTiles = GAME_CONFIG.MAP_WIDTH;
  const heightTiles = GAME_CONFIG.MAP_HEIGHT;

  const scale = 2; // pixel multiplier per tile for readability
  const outWidth = widthTiles * scale;
  const outHeight = heightTiles * scale;

  const rgba = Buffer.alloc(outWidth * outHeight * 4);

  let idx = 0;
  for (let ty = 0; ty < heightTiles; ty++) {
    for (let sy = 0; sy < scale; sy++) {
      for (let tx = 0; tx < widthTiles; tx++) {
        const on = mg.hasFloorTile(tx, ty);
        for (let sx = 0; sx < scale; sx++) {
          // Floor: light green; void: dark purple
          const r = on ? 120 : 35;
          const g = on ? 230 : 25;
          const b = on ? 150 : 45;
          rgba[idx++] = r;
          rgba[idx++] = g;
          rgba[idx++] = b;
          rgba[idx++] = 255;
        }
      }
    }
  }

  const png = sharp(rgba, {
    raw: { width: outWidth, height: outHeight, channels: 4 },
  }).png({ compressionLevel: 9 });

  const abs = resolve(process.cwd(), outPath);
  png.toFile(abs).then(() => {
    console.log(`🖼️ Preview saved → ${abs}`);
  });
}

// CLI
const seed = Number(process.argv[2] || Date.now() % 100000);
const diff = String(process.argv[3] || 'nightmare_1');
const out = String(process.argv[4] || `preview-dungeon-${seed}.png`);

renderPreview(seed, diff, out);
