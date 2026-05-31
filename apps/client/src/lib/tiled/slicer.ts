import { SliceRequest, SliceResult, SlicedTileAsset, TiledTileset } from './types';

const PNG_MIME_TYPE = 'image/png';

export async function sliceTiles(request: SliceRequest): Promise<SliceResult> {
  const { tilesets, usedTiles, images } = request;

  const assets: SlicedTileAsset[] = [];
  const missingImages = new Set<string>();
  const atlasCache = new Map<number, HTMLImageElement>();
  const tileImageCache = new Map<string, HTMLImageElement>();

  for (let tilesetIndex = 0; tilesetIndex < tilesets.length; tilesetIndex += 1) {
    const tileset = tilesets[tilesetIndex];
    const group = usedTiles.filter((tile) => tile.tilesetIndex === tilesetIndex);
    if (group.length === 0) {
      continue;
    }

    for (const tile of group) {
      const animationFrames = dedupeFrames(tile.animationFrameIds);
      const isAnimated = animationFrames.length > 0;
      const frameIds = isAnimated ? animationFrames : [tile.localTileId];

      const frameSlices: FrameSlice[] = [];
      let encounteredMissingFrame = false;
      let atlasImage = atlasCache.get(tilesetIndex);
      let columns = tileset.columns;

      for (const frameId of frameIds) {
        const frameTile = tileset.tiles[frameId] ?? tileset.tiles[tile.localTileId];
        const frameImageSource = frameTile?.imageSource ?? tile.imageSource;

        if (frameImageSource) {
          const resolved = resolveImageFile(frameImageSource, images);
          if (!resolved) {
            missingImages.add(frameImageSource);
            encounteredMissingFrame = true;
            break;
          }

          let frameImage = tileImageCache.get(resolved.cacheKey);
          if (!frameImage) {
            frameImage = await loadImage(resolved.file);
            tileImageCache.set(resolved.cacheKey, frameImage);
          }

          const width = frameTile?.imageWidth || frameImage.naturalWidth || tile.width || tileset.tileWidth;
          const height = frameTile?.imageHeight || frameImage.naturalHeight || tile.height || tileset.tileHeight;

          frameSlices.push({
            image: frameImage,
            isAtlas: false,
            sx: 0,
            sy: 0,
            sw: width,
            sh: height,
            width,
            height,
          });
          continue;
        }

        if (!tileset.imageSource) {
          missingImages.add(`tileset:${tileset.name}:tile:${frameId}`);
          encounteredMissingFrame = true;
          break;
        }

        if (!atlasImage) {
          const atlasFile = resolveTilesetImage(tileset, images);
          if (!atlasFile) {
            missingImages.add(tileset.imageSource || tileset.name);
            encounteredMissingFrame = true;
            break;
          }
          atlasImage = await loadImage(atlasFile);
          atlasCache.set(tilesetIndex, atlasImage);
          columns = tileset.columns || inferColumns(atlasImage, tileset);
        }

        const atlasColumns = columns || inferColumns(atlasImage, tileset);
        const rect = computeSourceRect(frameId, atlasColumns, tileset);
        frameSlices.push({
          image: atlasImage,
          isAtlas: true,
          sx: rect.sx,
          sy: rect.sy,
          sw: rect.sw,
          sh: rect.sh,
          width: rect.sw,
          height: rect.sh,
        });
      }

      if (encounteredMissingFrame || frameSlices.length === 0) {
        continue;
      }

      const canvasWidth = frameSlices.reduce((total, slice) => total + slice.width, 0);
      const canvasHeight = frameSlices.reduce((maxHeight, slice) => Math.max(maxHeight, slice.height), 0);

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to acquire 2D canvas context during slicing.');
      }

      ctx.imageSmoothingEnabled = false;

      let drawOffsetX = 0;
      frameSlices.forEach((slice) => {
        ctx.drawImage(
          slice.image,
          slice.isAtlas ? slice.sx : 0,
          slice.isAtlas ? slice.sy : 0,
          slice.sw,
          slice.sh,
          drawOffsetX,
          canvasHeight - slice.height,
          slice.sw,
          slice.sh,
        );
        drawOffsetX += slice.width;
      });

      const blob = await canvasToBlob(canvas);
      const { assetId, fileName } = buildIdentifiers(tileset, tilesetIndex, tile.localTileId, isAnimated);
      const primarySlice = frameSlices[0];
      const assetHeight = frameSlices.reduce((max, slice) => Math.max(max, slice.height), primarySlice.height);

      assets.push({
        tilesetIndex,
        localTileId: tile.localTileId,
        assetId,
        fileName,
        blob,
        frameCount: frameSlices.length,
        animated: isAnimated,
        width: tile.width || primarySlice.width,
        height: tile.height || assetHeight,
      });
    }
  }

  return {
    assets,
    missingImages: Array.from(missingImages),
  };
}

interface FrameSlice {
  image: HTMLImageElement;
  isAtlas: boolean;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  width: number;
  height: number;
}

function resolveTilesetImage(tileset: TiledTileset, images: Map<string, File>): File | undefined {
  const normalizedSource = normalizePath(tileset.imageSource);
  if (normalizedSource) {
    const direct = images.get(normalizedSource);
    if (direct) {
      return direct;
    }

    const basename = normalizedSource.split('/').pop();
    if (basename) {
      const byName = images.get(basename);
      if (byName) {
        return byName;
      }
    }
  }

  const fallbackKey = normalizePath(tileset.name) || tileset.name.toLowerCase();
  return images.get(`${fallbackKey}.png`) ?? images.get(`${tileset.name.toLowerCase()}.png`);
}

function resolveImageFile(
  source: string,
  images: Map<string, File>,
): { file: File; cacheKey: string } | undefined {
  const normalizedSource = normalizePath(source);
  if (normalizedSource) {
    const direct = images.get(normalizedSource);
    if (direct) {
      return { file: direct, cacheKey: normalizedSource };
    }

    const basename = normalizedSource.split('/').pop();
    if (basename) {
      const byName = images.get(basename);
      if (byName) {
        return { file: byName, cacheKey: basename.toLowerCase() };
      }
    }
  }

  const plain = source.toLowerCase();
  const fallback = images.get(plain);
  if (fallback) {
    return { file: fallback, cacheKey: plain };
  }

  return undefined;
}

function normalizePath(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function dedupeFrames(frames?: number[]): number[] {
  if (!frames || frames.length === 0) {
    return [];
  }
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const frameId of frames) {
    if (!seen.has(frameId)) {
      seen.add(frameId);
      ordered.push(frameId);
    }
  }
  return ordered;
}

function computeSourceRect(tileId: number, columns: number, tileset: TiledTileset) {
  const column = columns > 0 ? tileId % columns : 0;
  const row = columns > 0 ? Math.floor(tileId / columns) : 0;
  const sx = column * tileset.tileWidth;
  const sy = row * tileset.tileHeight;
  return { sx, sy, sw: tileset.tileWidth, sh: tileset.tileHeight };
}

function inferColumns(image: HTMLImageElement, tileset: TiledTileset): number {
  if (tileset.tileWidth === 0) {
    return 0;
  }
  return Math.max(1, Math.floor(image.naturalWidth / tileset.tileWidth));
}

function buildIdentifiers(
  tileset: TiledTileset,
  tilesetIndex: number,
  localTileId: number,
  animated: boolean,
): { assetId: string; fileName: string } {
  const slug = makeSlug(`${tileset.name || 'tileset'}-${tilesetIndex}`);
  const baseName = `${slug}_${localTileId}${animated ? '_anim' : ''}.png`;
  const fileName = `images/${slug}/${baseName}`;
  const assetId = `tmx_${slug}_${localTileId}`;
  return { assetId, fileName };
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image ${file.name}`));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to convert canvas to Blob.'));
        return;
      }
      resolve(blob);
    }, PNG_MIME_TYPE);
  });
}
