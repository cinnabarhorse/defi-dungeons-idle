import JSZip from 'jszip';
import {
  ExportAssetItem,
  ExportPlacedAsset,
  ExporterInputs,
  ExporterOutput,
  LayerCategoryMapping,
  SlicedTileAsset,
} from './types';

export async function buildZip(inputs: ExporterInputs): Promise<ExporterOutput> {
  const { slices, placements, importName, layerCategories } = inputs;

  const zip = new JSZip();
  const imagesFolder = zip.folder('images');
  if (!imagesFolder) {
    throw new Error('Failed to create images folder in ZIP.');
  }

  for (const slice of slices) {
    const relativePath = slice.fileName.replace(/^images\//, '');
    imagesFolder.file(relativePath, slice.blob);
  }

  const { assets, placedAssets } = buildAssetPayloads({
    slices,
    placements,
    layerCategories,
  });

  const assetsModule = createAssetsModule(assets);
  const placedModule = createPlacedModule(placedAssets);
  const readme = createReadme(importName);

  zip.file('assets.ts', assetsModule);
  zip.file('placed.ts', placedModule);
  zip.file('README.txt', readme);

  const blob = await zip.generateAsync({ type: 'blob' });

  return {
    blob,
    readme,
    assetsModule,
    placedModule,
  };
}

function buildAssetPayloads({
  slices,
  placements,
  layerCategories,
}: {
  slices: SlicedTileAsset[];
  placements: ExporterInputs['placements'];
  layerCategories: LayerCategoryMapping;
}): { assets: ExportAssetItem[]; placedAssets: ExportPlacedAsset[] } {
  const sliceLookup = new Map<string, SlicedTileAsset>();
  for (const slice of slices) {
    sliceLookup.set(buildTileKey(slice.tilesetIndex, slice.localTileId), slice);
  }

  const assetMap = new Map<string, ExportAssetItem>();
  const placedAssets: ExportPlacedAsset[] = [];

  for (const placement of placements) {
    const key = buildTileKey(placement.tilesetIndex, placement.localTileId);
    const slice = sliceLookup.get(key);
    if (!slice) {
      continue;
    }

    const category = resolveCategory(placement.layerName, layerCategories);

    if (!assetMap.has(slice.assetId)) {
      assetMap.set(slice.assetId, {
        id: slice.assetId,
        name: slice.assetId,
        category,
        sprite: slice.fileName,
        width: slice.width,
        height: slice.height,
        frameCount: slice.frameCount > 1 ? slice.frameCount : undefined,
      });
    }

    placedAssets.push({
      id: generateId(),
      assetId: slice.assetId,
      x: placement.x,
      y: placement.y,
      category,
      zIndex: placement.layerIndex,
      flipX: placement.flipX ? true : undefined,
      width: slice.width,
      height: slice.height,
    });
  }

  return {
    assets: Array.from(assetMap.values()),
    placedAssets,
  };
}

function buildTileKey(tilesetIndex: number, localTileId: number): string {
  return `${tilesetIndex}:${localTileId}`;
}

function resolveCategory(layerName: string, overrides: LayerCategoryMapping): string {
  const override = overrides[layerName];
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  const normalized = layerName.toLowerCase();
  if (/(floor|ground|terrain)/.test(normalized)) {
    return 'floors';
  }
  if (/(wall|barrier|rock|block)/.test(normalized)) {
    return 'walls';
  }
  if (/(water|liquid|lava)/.test(normalized)) {
    return 'hazards';
  }
  if (/(prop|decor|furniture)/.test(normalized)) {
    return 'decor';
  }
  return 'special';
}

function createAssetsModule(assets: ExportAssetItem[]): string {
  const lines: string[] = [];
  lines.push(createWarningBanner(), '');
  lines.push(
    `export interface AssetItem {\n  id: string;\n  name: string;\n  category: string;\n  sprite: string;\n  width: number;\n  height: number;\n  frameCount?: number;\n}`,
  );
  lines.push('', 'export const assets: AssetItem[] = [');

  assets.forEach((asset, index) => {
    const optionalFrame = asset.frameCount ? `, frameCount: ${asset.frameCount}` : '';
    const suffix = index === assets.length - 1 ? '' : ',';
    lines.push(
      `  { id: '${asset.id}', name: '${asset.name}', category: '${asset.category}', sprite: '${asset.sprite}', width: ${asset.width}, height: ${asset.height}${optionalFrame} }${suffix}`,
    );
  });

  lines.push('];', '', 'export default assets;');
  lines.push('');
  return lines.join('\n');
}

function createPlacedModule(placed: ExportPlacedAsset[]): string {
  const lines: string[] = [];
  lines.push(createWarningBanner(), '');
  lines.push(
    `export interface PlacedAsset {\n  id: string;\n  assetId: string;\n  x: number;\n  y: number;\n  category: string;\n  zIndex: number;\n  width: number;\n  height: number;\n  flipX?: boolean;\n}`,
  );
  lines.push('', 'export const placedAssets: PlacedAsset[] = [');

  placed.forEach((item, index) => {
    const flipSection = item.flipX ? ', flipX: true' : '';
    const suffix = index === placed.length - 1 ? '' : ',';
    lines.push(
      `  { id: '${item.id}', assetId: '${item.assetId}', x: ${item.x}, y: ${item.y}, category: '${item.category}', zIndex: ${item.zIndex}, width: ${item.width}, height: ${item.height}${flipSection} }${suffix}`,
    );
  });

  lines.push('];', '', 'export default placedAssets;');
  lines.push('');
  return lines.join('\n');
}

function createReadme(importName: string): string {
  const safeName = importName || 'tmx-import';
  return `Gotchiverse Tiled Importer Export\n=================================\n\nFiles in this archive were generated by the Tiled Importer.\n\n1. Copy the images/ directory to apps/client/public/imports/${safeName}/\n2. Place assets.ts and placed.ts under apps/client/src/data/imports/${safeName}/\n3. Update your editor or game bootstrap to reference the new assets.\n\nNotes:\n- Sprites retain their original pixel dimensions from the tileset.\n- Animated sprites use horizontal strips with equal frame duration (150ms).\n- Layer categories were inferred from layer names; adjust as needed.\n`;
}

function createWarningBanner(): string {
  return [
    '// ============================================================================',
    '// ⚠️ AUTO-GENERATED FILE — DO NOT EDIT!',
    `// Generated by the Gotchiverse Tiled Importer on ${new Date().toISOString()}`,
    '// ============================================================================',
  ].join('\n');
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tmx-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}
