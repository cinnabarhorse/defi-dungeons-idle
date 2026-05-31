import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { GAME_CONFIG } from '../data/game-config';

type CliOptions = {
  chunkSet: string;
  tileSize: number;
  maxWidth: number;
  outImage: string;
  outTs: string;
  skipInvalid: boolean;
};

type FloorAsset = {
  assetId: string;
  sprite: string;
  chunkName: string;
};

type SpriteEntry = {
  spritePath: string;
  absolutePath: string;
  assetIds: string[];
  buffer: Buffer;
  type: 'single' | 'quad' | 'grid';
  grid?: { widthTiles: number; heightTiles: number };
};

type Placement = {
  index: number;
  col: number;
  row: number;
  sprite: SpriteEntry;
  source: { left: number; top: number; width: number; height: number };
};

type AssetPlacement = {
  sprite: SpriteEntry;
  type: 'single' | 'quad' | 'grid';
  indices: number[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(ROOT, 'apps/client/public');
const ENV_SPRITE_ROOT = path.resolve(PUBLIC_DIR, 'sprites/env');

const KNOWN_CHUNK_SETS = new Set([
  'dungeon',
  'grass',
  'staging',
  'boss',
  'cyberkawaii',
  // Special value meaning: load via scripts/generate-chunks-from-blueprints
  'generated',
]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  // Support comma-separated chunk sets, merging all floor assets
  const chunkSets = String(options.chunkSet)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allChunks: any[] = [];
  for (const setName of chunkSets) {
    const chunkSetPath = await resolveChunkSetPath(setName);
    const loaded = await loadChunks(chunkSetPath);
    allChunks.push(...loaded);
  }

  const floorAssets = collectFloorAssets(allChunks);
  if (floorAssets.length === 0) {
    console.warn('No floor assets found in selected chunk set. Nothing to do.');
    return;
  }

  const { sprites, skippedAssets, warnings } = await prepareSprites(
    floorAssets,
    options.tileSize,
    options.skipInvalid
  );

  if (sprites.length === 0) {
    console.warn('All floor assets were skipped. Aborting.');
    warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));
    return;
  }

  const { placements, assetPlacements, cols, rows } = layoutSprites(
    sprites,
    options.tileSize,
    options.maxWidth
  );

  const imagePath = path.resolve(ROOT, options.outImage);
  await fs.mkdir(path.dirname(imagePath), { recursive: true });

  await buildAtlas(placements, cols, rows, options.tileSize, imagePath);

  const tsPath = path.resolve(ROOT, options.outTs);
  await fs.mkdir(path.dirname(tsPath), { recursive: true });

  await writeMapping(tsPath, imagePath, options.tileSize, assetPlacements);

  logSummary({
    options,
    sprites,
    skippedAssets,
    warnings,
    cols,
    rows,
    placements,
  });
}

function parseArgs(argv: string[]): CliOptions {
  const defaults: CliOptions = {
    chunkSet: 'dungeon',
    tileSize: GAME_CONFIG.TILE_SIZE,
    maxWidth: 2048,
    outImage: 'apps/client/public/sprites/tiles/floors.png',
    outTs: 'apps/client/src/data/floor-tileset.ts',
    skipInvalid: false,
  };

  const options: CliOptions = { ...defaults };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    switch (arg) {
      case '--chunk-set': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --chunk-set');
        }
        options.chunkSet = value;
        break;
      }
      case '--tile-size': {
        const value = parseInt(argv[++i] ?? '', 10);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('Invalid --tile-size value');
        }
        options.tileSize = value;
        break;
      }
      case '--max-width': {
        const value = parseInt(argv[++i] ?? '', 10);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error('Invalid --max-width value');
        }
        options.maxWidth = value;
        break;
      }
      case '--out-image': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --out-image');
        }
        options.outImage = value;
        break;
      }
      case '--out-ts': {
        const value = argv[++i];
        if (!value) {
          throw new Error('Missing value for --out-ts');
        }
        options.outTs = value;
        break;
      }
      case '--skip-invalid': {
        options.skipInvalid = true;
        break;
      }
      default: {
        if (arg.startsWith('--')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
      }
    }
  }

  if (options.maxWidth < options.tileSize) {
    throw new Error('--max-width must be >= --tile-size');
  }

  return options;
}

function printHelp() {
  console.log(
    `Generate a compact floor atlas and mapping.\n\n` +
      `Flags:\n` +
      `  --chunk-set <name>    dungeon | grass | staging | boss | cyberkawaii | custom:<path>\n` +
      `  --tile-size <px>      Base tile size in pixels (default ${GAME_CONFIG.TILE_SIZE})\n` +
      `  --max-width <px>      Maximum atlas width in pixels (default 2048)\n` +
      `  --out-image <path>    Output PNG path\n` +
      `  --out-ts <path>       Output TypeScript path\n` +
      `  --skip-invalid        Skip sprites that are not ${GAME_CONFIG.TILE_SIZE}px or ${GAME_CONFIG.TILE_SIZE * 2}px multiples\n`
  );
}

async function resolveChunkSetPath(chunkSet: string): Promise<string> {
  if (chunkSet.startsWith('custom:')) {
    const rawPath = chunkSet.slice('custom:'.length).trim();
    if (!rawPath) {
      throw new Error('Missing path for custom chunk set. Use custom:<path>');
    }
    const resolved = path.isAbsolute(rawPath)
      ? rawPath
      : path.resolve(ROOT, rawPath);
    await assertFileExists(resolved, 'Custom chunk set');
    return resolved;
  }

  if (!KNOWN_CHUNK_SETS.has(chunkSet)) {
    throw new Error(`Unknown chunk set "${chunkSet}"`);
  }

  if (chunkSet === 'generated') {
    // Sentinel path to indicate blueprint-based generation
    return 'GENERATED_FROM_BLUEPRINTS';
  }

  // Maintain backwards compatibility for legacy on-disk chunk sets
  const resolved = path.resolve(ROOT, 'data', 'maps', `chunks-${chunkSet}.ts`);
  try {
    await assertFileExists(resolved, `Chunk set ${chunkSet}`);
    return resolved;
  } catch (err) {
    // If dungeon file is missing, fall back to generated-from-blueprints
    if (chunkSet === 'dungeon') {
      return 'GENERATED_FROM_BLUEPRINTS';
    }
    throw err;
  }
}

async function assertFileExists(filePath: string, label: string) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`${label} file not found: ${filePath}`);
  }
}

type ChunkModule = {
  CHUNKS?: Array<{
    name?: string;
    assets?: Array<{
      assetId?: string;
      sprite?: string;
      category?: string;
    }>;
  }>;
  default?: {
    CHUNKS?: Array<{
      name?: string;
      assets?: Array<{
        assetId?: string;
        sprite?: string;
        category?: string;
      }>;
    }>;
  };
};

async function loadChunks(chunkSetPath: string) {
  if (chunkSetPath === 'GENERATED_FROM_BLUEPRINTS') {
    const generatorPath = pathToFileURL(
      path.resolve(ROOT, 'scripts/generate-chunks-from-blueprints.ts')
    ).href;
    const mod = await import(generatorPath as any);
    if (typeof mod.generateChunksFromBlueprints !== 'function') {
      throw new Error('generateChunksFromBlueprints not found');
    }
    const chunks = await mod.generateChunksFromBlueprints();
    if (!Array.isArray(chunks)) {
      throw new Error('Blueprint generator did not return an array of chunks');
    }
    return chunks;
  }

  const module: ChunkModule = await import(pathToFileURL(chunkSetPath).href);
  const chunks = module.CHUNKS ?? module.default?.CHUNKS;
  if (!chunks) {
    throw new Error(`Chunk set file did not export CHUNKS: ${chunkSetPath}`);
  }
  return chunks;
}

function collectFloorAssets(
  chunks: Array<{ name?: string; assets?: any[] }>
): FloorAsset[] {
  const assets: FloorAsset[] = [];
  for (const chunk of chunks) {
    if (!chunk.assets) continue;
    for (const asset of chunk.assets) {
      if (!asset || asset.category !== 'floors') continue;
      if (!asset.assetId || !asset.sprite) continue;
      assets.push({
        assetId: String(asset.assetId),
        sprite: String(asset.sprite),
        chunkName: String(chunk.name ?? 'unknown'),
      });
    }
  }
  return assets;
}

async function prepareSprites(
  floorAssets: FloorAsset[],
  tileSize: number,
  skipInvalid: boolean
) {
  const spriteMap = new Map<
    string,
    { assetIds: Set<string>; chunks: Set<string> }
  >();
  const assetToSprite = new Map<string, string>();
  const skippedAssets: string[] = [];
  const warnings: string[] = [];

  for (const asset of floorAssets) {
    const normalizedSprite = asset.sprite.replace(/\\/g, '/');
    const absoluteSpritePath = path.resolve(ENV_SPRITE_ROOT, normalizedSprite);
    const entry = spriteMap.get(absoluteSpritePath) ?? {
      assetIds: new Set<string>(),
      chunks: new Set<string>(),
    };
    entry.assetIds.add(asset.assetId);
    entry.chunks.add(asset.chunkName);
    spriteMap.set(absoluteSpritePath, entry);

    const existingSprite = assetToSprite.get(asset.assetId);
    if (existingSprite && existingSprite !== absoluteSpritePath) {
      warnings.push(
        `Asset ${asset.assetId} referenced multiple sprite files (keeping first: ${existingSprite}).`
      );
      continue;
    }
    assetToSprite.set(asset.assetId, absoluteSpritePath);
  }

  const sprites: SpriteEntry[] = [];

  for (const [absolutePath, meta] of spriteMap.entries()) {
    const relativeSprite = path.relative(ENV_SPRITE_ROOT, absolutePath);
    try {
      await fs.access(absolutePath);
    } catch {
      warnings.push(`Missing sprite file for ${relativeSprite}`);
      meta.assetIds.forEach((assetId) => skippedAssets.push(assetId));
      continue;
    }

    const buffer = await fs.readFile(absolutePath);
    const image = sharp(buffer);
    const info = await image.metadata();
    const width = info.width ?? 0;
    const height = info.height ?? 0;

    if (width === tileSize && height === tileSize) {
      sprites.push({
        spritePath: relativeSprite,
        absolutePath,
        assetIds: Array.from(meta.assetIds).sort(),
        buffer,
        type: 'single',
      });
      continue;
    }

    if (width === tileSize * 2 && height === tileSize * 2) {
      sprites.push({
        spritePath: relativeSprite,
        absolutePath,
        assetIds: Array.from(meta.assetIds).sort(),
        buffer,
        type: 'quad',
      });
      continue;
    }

    // Generic NxN grid support (whole image is a grid of tileSize tiles)
    if (width % tileSize === 0 && height % tileSize === 0) {
      const wTiles = Math.max(1, Math.floor(width / tileSize));
      const hTiles = Math.max(1, Math.floor(height / tileSize));
      sprites.push({
        spritePath: relativeSprite,
        absolutePath,
        assetIds: Array.from(meta.assetIds).sort(),
        buffer,
        type: 'grid',
        grid: { widthTiles: wTiles, heightTiles: hTiles },
      });
      continue;
    }

    const dimensionMessage = `${width}x${height}`;
    const message = `Unsupported sprite dimensions ${dimensionMessage} for ${relativeSprite}`;
    if (skipInvalid) {
      warnings.push(`${message} (skipped)`);
      meta.assetIds.forEach((assetId) => skippedAssets.push(assetId));
      continue;
    }
    throw new Error(message);
  }

  sprites.sort((a, b) => {
    const aKey = `${a.assetIds[0]}::${a.spritePath}`;
    const bKey = `${b.assetIds[0]}::${b.spritePath}`;
    return aKey.localeCompare(bKey);
  });

  return { sprites, skippedAssets, warnings };
}

function layoutSprites(
  sprites: SpriteEntry[],
  tileSize: number,
  maxWidth: number
) {
  const cols = Math.max(1, Math.floor(maxWidth / tileSize));
  const occupied = new Set<number>();
  const placements: Placement[] = [];
  const assetPlacements: AssetPlacement[] = [];
  let maxIndexUsed = -1;

  const occupy = (index: number) => {
    occupied.add(index);
    if (index > maxIndexUsed) {
      maxIndexUsed = index;
    }
  };

  const indexToCoord = (index: number) => ({
    col: index % cols,
    row: Math.floor(index / cols),
  });

  const findSpace = (widthTiles: number, heightTiles: number) => {
    let index = 0;
    while (true) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      if (col + widthTiles <= cols) {
        let fits = true;
        for (let dy = 0; dy < heightTiles && fits; dy += 1) {
          for (let dx = 0; dx < widthTiles; dx += 1) {
            const cellIndex = (row + dy) * cols + (col + dx);
            if (occupied.has(cellIndex)) {
              fits = false;
              break;
            }
          }
        }
        if (fits) {
          return index;
        }
      }
      index += 1;
      if (index > 1_000_000) {
        throw new Error('Unable to place tiles within reasonable bounds.');
      }
    }
  };

  for (const sprite of sprites) {
    if (sprite.type === 'single') {
      const index = findSpace(1, 1);
      occupy(index);
      const { col, row } = indexToCoord(index);
      placements.push({
        index,
        col,
        row,
        sprite,
        source: { left: 0, top: 0, width: tileSize, height: tileSize },
      });
      assetPlacements.push({
        sprite,
        type: 'single',
        indices: [index],
      });
      continue;
    }

    if (sprite.type === 'quad') {
      const index = findSpace(2, 2);
      const indices = [index, index + 1, index + cols, index + cols + 1];
      indices.forEach(occupy);
      const { col, row } = indexToCoord(index);
      placements.push(
        {
          index: indices[0],
          col,
          row,
          sprite,
          source: { left: 0, top: 0, width: tileSize, height: tileSize },
        },
        {
          index: indices[1],
          col: col + 1,
          row,
          sprite,
          source: { left: tileSize, top: 0, width: tileSize, height: tileSize },
        },
        {
          index: indices[2],
          col,
          row: row + 1,
          sprite,
          source: { left: 0, top: tileSize, width: tileSize, height: tileSize },
        },
        {
          index: indices[3],
          col: col + 1,
          row: row + 1,
          sprite,
          source: {
            left: tileSize,
            top: tileSize,
            width: tileSize,
            height: tileSize,
          },
        }
      );
      assetPlacements.push({
        sprite,
        type: 'quad',
        indices,
      });
      continue;
    }

    // Generic grid NxN placement
    if (sprite.type === 'grid' && sprite.grid) {
      const wTiles = sprite.grid.widthTiles;
      const hTiles = sprite.grid.heightTiles;
      const index = findSpace(wTiles, hTiles);
      const { col, row } = indexToCoord(index);
      for (let dy = 0; dy < hTiles; dy++) {
        for (let dx = 0; dx < wTiles; dx++) {
          const cellIndex = (row + dy) * cols + (col + dx);
          occupy(cellIndex);
          placements.push({
            index: cellIndex,
            col: col + dx,
            row: row + dy,
            sprite,
            source: {
              left: dx * tileSize,
              top: dy * tileSize,
              width: tileSize,
              height: tileSize,
            },
          });
        }
      }
      const indices: number[] = [];
      for (let dy = 0; dy < hTiles; dy++) {
        for (let dx = 0; dx < wTiles; dx++) {
          const cellIndex = (row + dy) * cols + (col + dx);
          indices.push(cellIndex);
        }
      }
      assetPlacements.push({ sprite, type: 'grid', indices });
      continue;
    }
  }

  const rows = maxIndexUsed >= 0 ? Math.floor(maxIndexUsed / cols) + 1 : 0;

  return { placements, assetPlacements, cols, rows };
}

async function buildAtlas(
  placements: Placement[],
  cols: number,
  rows: number,
  tileSize: number,
  outputPath: string
) {
  if (placements.length === 0) {
    return;
  }

  const widthPx = cols * tileSize;
  const heightPx = Math.max(rows * tileSize, tileSize);

  const atlas = sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const compositeInputs: sharp.OverlayOptions[] = [];

  for (const placement of placements) {
    const tileBuffer = await sharp(placement.sprite.buffer)
      .extract(placement.source)
      .ensureAlpha()
      .toBuffer();

    compositeInputs.push({
      input: tileBuffer,
      left: placement.col * tileSize,
      top: placement.row * tileSize,
    });
  }

  await atlas.composite(compositeInputs).png().toFile(outputPath);
}

async function writeMapping(
  tsPath: string,
  imagePath: string,
  tileSize: number,
  assetPlacements: AssetPlacement[]
) {
  const singleMap: Record<string, number> = {};
  const multiMap: Record<
    string,
    {
      topLeft: number;
      topRight: number;
      bottomLeft: number;
      bottomRight: number;
    }
  > = {};
  const gridMap: Record<
    string,
    { widthTiles: number; heightTiles: number; indices: number[] }
  > = {};

  for (const placement of assetPlacements) {
    if (placement.type === 'single') {
      for (const assetId of placement.sprite.assetIds) {
        singleMap[assetId] = placement.indices[0];
      }
      continue;
    }

    const [topLeft, topRight, bottomLeft, bottomRight] = placement.indices;
    if (placement.type === 'quad') {
      for (const assetId of placement.sprite.assetIds) {
        multiMap[assetId] = { topLeft, topRight, bottomLeft, bottomRight };
      }
    } else if (placement.type === 'grid' && placement.sprite.grid) {
      const wTiles = placement.sprite.grid.widthTiles;
      const hTiles = placement.sprite.grid.heightTiles;
      for (const assetId of placement.sprite.assetIds) {
        gridMap[assetId] = {
          widthTiles: wTiles,
          heightTiles: hTiles,
          indices: placement.indices.slice(),
        };
      }
    }
  }

  const sortedSingles = Object.entries(singleMap).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const sortedMulti = Object.entries(multiMap).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  const sortedGrid = Object.entries(gridMap).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const imagePathRelative = normalizePublicPath(imagePath);
  const imageKey =
    path.basename(imagePathRelative, path.extname(imagePathRelative)) ||
    'floors';

  const lines: string[] = [];
  lines.push('// AUTO-GENERATED FILE — DO NOT EDIT.');
  lines.push('// Run `pnpm run generate:floors` to regenerate.');
  lines.push('');
  lines.push(`export const FLOOR_TILESET = {`);
  lines.push(`  imageKey: '${imageKey}',`);
  lines.push(`  imagePath: '${imagePathRelative}',`);
  lines.push(`  tileSize: ${tileSize},`);
  lines.push(`  tiles: {`);
  for (const [assetId, index] of sortedSingles) {
    lines.push(`    '${assetId}': ${index},`);
  }
  lines.push('  } as Record<string, number>,');
  lines.push('  multiTile: {');
  for (const [assetId, indices] of sortedMulti) {
    lines.push(
      `    '${assetId}': { topLeft: ${indices.topLeft}, topRight: ${indices.topRight}, bottomLeft: ${indices.bottomLeft}, bottomRight: ${indices.bottomRight} },`
    );
  }
  lines.push(
    '  } as Record<string, { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number }>,'
  );
  lines.push('  gridTile: {');
  for (const [assetId, entry] of sortedGrid) {
    lines.push(
      `    '${assetId}': { widthTiles: ${entry.widthTiles}, heightTiles: ${entry.heightTiles}, indices: [${entry.indices.join(', ')}] },`
    );
  }
  lines.push(
    '  } as Record<string, { widthTiles: number; heightTiles: number; indices: number[] }>,'
  );
  lines.push('} as const;');
  lines.push('');
  lines.push('export type FloorTileId = keyof typeof FLOOR_TILESET.tiles;');
  lines.push('');
  lines.push(
    'export function getTileIndex(assetId: string): number | undefined {'
  );
  lines.push('  return FLOOR_TILESET.tiles[assetId];');
  lines.push('}');
  lines.push('');
  lines.push('export function getMultiTileIndices(assetId: string) {');
  lines.push('  const entry = FLOOR_TILESET.multiTile[assetId];');
  lines.push('  if (!entry) return undefined;');
  lines.push('  return {');
  lines.push('    tl: entry.topLeft,');
  lines.push('    tr: entry.topRight,');
  lines.push('    bl: entry.bottomLeft,');
  lines.push('    br: entry.bottomRight,');
  lines.push('  };');
  lines.push('}');
  lines.push('');
  lines.push('export type MultiTileId = keyof typeof FLOOR_TILESET.multiTile;');

  const content = `${lines.join('\n')}\n`;
  await fs.writeFile(tsPath, content, 'utf8');
}

function normalizePublicPath(imagePath: string) {
  const relative = path
    .relative(PUBLIC_DIR, imagePath)
    .split(path.sep)
    .join('/');
  if (!relative || relative.startsWith('..')) {
    return imagePath.split(path.sep).join('/');
  }
  const segments = relative.split('/').filter(Boolean);
  return `/${segments.join('/')}`;
}

function logSummary({
  options,
  sprites,
  skippedAssets,
  warnings,
  cols,
  rows,
  placements,
}: {
  options: CliOptions;
  sprites: SpriteEntry[];
  skippedAssets: string[];
  warnings: string[];
  cols: number;
  rows: number;
  placements: Placement[];
}) {
  const quadCount = sprites.filter((sprite) => sprite.type === 'quad').length;
  const singleCount = sprites.length - quadCount;

  const atlasPath = path.relative(ROOT, path.resolve(ROOT, options.outImage));
  const mappingPath = path.relative(ROOT, path.resolve(ROOT, options.outTs));

  console.log(
    `Generated ${placements.length} tiles (${singleCount} singles, ${quadCount} quads)`
  );
  console.log(
    `Atlas size: ${cols * options.tileSize}×${Math.max(rows, 1) * options.tileSize}`
  );
  console.log(`Image: ${atlasPath}`);
  console.log(`Mapping: ${mappingPath}`);

  if (skippedAssets.length > 0) {
    console.warn(`Skipped ${skippedAssets.length} assets (check warnings).`);
  }

  warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
