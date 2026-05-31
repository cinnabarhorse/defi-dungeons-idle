import {
  TiledLayer,
  TiledMapInfo,
  TiledParseResult,
  TiledTileset,
  TiledTilesetTile,
  TilePlacement,
  UsedTileRef,
} from './types';

// Bit flags documented in Tiled: https://doc.mapeditor.org/en/stable/reference/tmx-map-format/#tile-flipping
const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const GID_MASK = ~(FLIPPED_HORIZONTALLY_FLAG | FLIPPED_VERTICALLY_FLAG | FLIPPED_DIAGONALLY_FLAG);

const CSV_VALUE_PATTERN = /[^0-9\-,]+/g;

interface TilesetLookupEntry {
  tileset: TiledTileset;
  endGid: number;
  index: number;
}

export function parseTmx(xmlText: string): TiledParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseErrors = Array.from(doc.getElementsByTagName('parsererror'));
  if (parseErrors.length > 0) {
    return {
      map: {
        width: 0,
        height: 0,
        tileWidth: 0,
        tileHeight: 0,
        infinite: false,
      },
      tilesets: [],
      layers: [],
      placements: [],
      usedTiles: [],
      summary: {
        totalPlacements: 0,
        distinctTiles: 0,
        animatedTiles: 0,
        layerCount: 0,
      },
      errors: ['Unable to parse TMX file: malformed XML'],
      warnings: [],
    };
  }

  const mapElement = doc.querySelector('map');
  if (!mapElement) {
    return {
      map: {
        width: 0,
        height: 0,
        tileWidth: 0,
        tileHeight: 0,
        infinite: false,
      },
      tilesets: [],
      layers: [],
      placements: [],
      usedTiles: [],
      summary: {
        totalPlacements: 0,
        distinctTiles: 0,
        animatedTiles: 0,
        layerCount: 0,
      },
      errors: ['TMX file is missing <map> root element'],
      warnings: [],
    };
  }

  const map: TiledMapInfo = {
    width: Number(mapElement.getAttribute('width') ?? '0'),
    height: Number(mapElement.getAttribute('height') ?? '0'),
    tileWidth: Number(mapElement.getAttribute('tilewidth') ?? '0'),
    tileHeight: Number(mapElement.getAttribute('tileheight') ?? '0'),
    infinite: mapElement.getAttribute('infinite') === '1',
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  const tilesets = parseTilesets(mapElement, warnings);
  if (tilesets.length === 0) {
    errors.push('TMX file does not define any usable <tileset>.');
  }

  const tilesetLookup = buildTilesetLookup(tilesets);

  const { layers, placements, usedTiles } = parseLayers(mapElement, map, tilesetLookup, warnings);

  const summary = {
    totalPlacements: placements.length,
    distinctTiles: usedTiles.length,
    animatedTiles: usedTiles.filter((item) => (item.animationFrameIds?.length ?? 0) > 0).length,
    layerCount: layers.length,
  };

  return {
    map,
    tilesets,
    layers,
    placements,
    usedTiles,
    summary,
    errors,
    warnings,
  };
}

function parseTilesets(mapElement: Element, warnings: string[]): TiledTileset[] {
  const tilesetElements = Array.from(mapElement.getElementsByTagName('tileset'));
  const tilesets: TiledTileset[] = [];

  tilesetElements.forEach((tilesetElement, index) => {
    const sourceAttr = tilesetElement.getAttribute('source');
    if (sourceAttr) {
      warnings.push(`External TSX tileset "${sourceAttr}" is not supported in v1.`);
      return;
    }

    const firstGid = Number(tilesetElement.getAttribute('firstgid') ?? '0');
    const name = tilesetElement.getAttribute('name') ?? `tileset_${index}`;
    const tileWidth = Number(tilesetElement.getAttribute('tilewidth') ?? '0');
    const tileHeight = Number(tilesetElement.getAttribute('tileheight') ?? '0');
    const tileCountAttr = tilesetElement.getAttribute('tilecount');
    const tileCountRaw = tileCountAttr ? Number(tileCountAttr) : 0;

    const directImageElement = Array.from(tilesetElement.children).find(
      (child) => child.tagName.toLowerCase() === 'image',
    );
    const imageSource = directImageElement?.getAttribute('source') ?? '';
    const imageWidth = directImageElement ? Number(directImageElement.getAttribute('width') ?? '0') : undefined;
    const imageHeight = directImageElement
      ? Number(directImageElement.getAttribute('height') ?? '0')
      : undefined;

    const fallbackTileCount = imageWidth && imageHeight && tileWidth && tileHeight
      ? Math.floor(imageWidth / tileWidth) * Math.floor(imageHeight / tileHeight)
      : 0;
    const tileCount = tileCountRaw || fallbackTileCount;

    const columnsAttr = tilesetElement.getAttribute('columns');
    const columns = columnsAttr
      ? Number(columnsAttr)
      : imageWidth && tileWidth
      ? Math.max(1, Math.floor(imageWidth / tileWidth))
      : tileCount > 0
      ? Math.max(1, Math.floor(tileCount))
      : 0;

    const tileElements = Array.from(tilesetElement.getElementsByTagName('tile'));
    const tiles: Record<number, TiledTilesetTile> = {};

    tileElements.forEach((tileElement) => {
      const id = Number(tileElement.getAttribute('id') ?? '0');
      const tileInfo: TiledTilesetTile = { id };

      const directTileImage = Array.from(tileElement.children).find(
        (child) => child.tagName.toLowerCase() === 'image',
      );
      if (directTileImage) {
        tileInfo.imageSource = directTileImage.getAttribute('source') ?? '';
        tileInfo.imageWidth = Number(directTileImage.getAttribute('width') ?? '0');
        tileInfo.imageHeight = Number(directTileImage.getAttribute('height') ?? '0');
      }

      const widthAttr = tileElement.getAttribute('width');
      const heightAttr = tileElement.getAttribute('height');
      if (widthAttr) {
        tileInfo.imageWidth = Number(widthAttr);
      }
      if (heightAttr) {
        tileInfo.imageHeight = Number(heightAttr);
      }

      const animationElement = tileElement.querySelector('animation');
      if (animationElement) {
        const frames = Array.from(animationElement.getElementsByTagName('frame')).map((frameElement) => ({
          tileId: Number(frameElement.getAttribute('tileid') ?? '0'),
          duration: Number(frameElement.getAttribute('duration') ?? '0'),
        }));
        tileInfo.animation = frames;
      }

      tiles[id] = tileInfo;
    });

    tilesets.push({
      firstGid,
      name,
      tileWidth,
      tileHeight,
      tileCount,
      columns,
      imageSource,
      imageWidth,
      imageHeight,
      tiles,
    });
  });

  return tilesets.sort((a, b) => a.firstGid - b.firstGid);
}

function buildTilesetLookup(tilesets: TiledTileset[]): TilesetLookupEntry[] {
  return tilesets.map((tileset, index) => {
    const endGid = tileset.firstGid + tileset.tileCount;
    return { tileset, endGid, index };
  });
}

function parseLayers(
  mapElement: Element,
  map: TiledMapInfo,
  tilesetLookup: TilesetLookupEntry[],
  warnings: string[],
): { layers: TiledLayer[]; placements: TilePlacement[]; usedTiles: UsedTileRef[] } {
  const layerElements = Array.from(mapElement.getElementsByTagName('layer'));
  const layers: TiledLayer[] = [];
  const placements: TilePlacement[] = [];
  const usedTileMap = new Map<string, UsedTileRef>();

  layerElements.forEach((layerElement, layerIndex) => {
    const type = (layerElement.getAttribute('type') ?? 'tilelayer') as 'tilelayer';
    if (type !== 'tilelayer') {
      warnings.push(`Layer "${layerElement.getAttribute('name') ?? 'unknown'}" skipped: only tile layers supported in v1.`);
      return;
    }

    const layer: TiledLayer = {
      id: Number(layerElement.getAttribute('id') ?? String(layerIndex + 1)),
      name: layerElement.getAttribute('name') ?? `Layer ${layerIndex + 1}`,
      width: Number(layerElement.getAttribute('width') ?? String(map.width)),
      height: Number(layerElement.getAttribute('height') ?? String(map.height)),
      index: layerIndex,
      type,
    };

    const dataElement = layerElement.getElementsByTagName('data')[0];
    if (!dataElement) {
      warnings.push(`Layer "${layer.name}" has no <data> element and was skipped.`);
      return;
    }

    const encoding = dataElement.getAttribute('encoding');
    if (encoding && encoding !== 'csv') {
      warnings.push(`Layer "${layer.name}" uses unsupported encoding "${encoding}". Only CSV is supported in v1.`);
      return;
    }

    layers.push(layer);

    if (map.infinite) {
      const chunkElements = Array.from(dataElement.getElementsByTagName('chunk'));
      chunkElements.forEach((chunkElement) => {
        const chunkX = Number(chunkElement.getAttribute('x') ?? '0');
        const chunkY = Number(chunkElement.getAttribute('y') ?? '0');
        const chunkWidth = Number(chunkElement.getAttribute('width') ?? String(layer.width));
        const chunkHeight = Number(chunkElement.getAttribute('height') ?? String(layer.height));
        const chunkValues = parseCsv(chunkElement.textContent ?? '');
        processTileValues({
          values: chunkValues,
          offsetX: chunkX,
          offsetY: chunkY,
          width: chunkWidth,
          layer,
          tilesetLookup,
          placements,
          usedTileMap,
        });
      });
    } else {
      const values = parseCsv(dataElement.textContent ?? '');
      processTileValues({
        values,
        offsetX: Number(layerElement.getAttribute('startx') ?? '0'),
        offsetY: Number(layerElement.getAttribute('starty') ?? '0'),
        width: layer.width,
        layer,
        tilesetLookup,
        placements,
        usedTileMap,
      });
    }
  });

  const usedTiles = Array.from(usedTileMap.values()).sort((a, b) => {
    if (a.tilesetIndex === b.tilesetIndex) {
      return a.localTileId - b.localTileId;
    }
    return a.tilesetIndex - b.tilesetIndex;
  });

  return { layers, placements, usedTiles };
}

function parseCsv(text: string): number[] {
  if (!text) {
    return [];
  }

  const cleaned = text
    .replace(CSV_VALUE_PATTERN, '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return cleaned.map((value) => Number(value));
}

interface ProcessTileValuesArgs {
  values: number[];
  offsetX: number;
  offsetY: number;
  width: number;
  layer: TiledLayer;
  tilesetLookup: TilesetLookupEntry[];
  placements: TilePlacement[];
  usedTileMap: Map<string, UsedTileRef>;
}

function processTileValues({
  values,
  offsetX,
  offsetY,
  width,
  layer,
  tilesetLookup,
  placements,
  usedTileMap,
}: ProcessTileValuesArgs) {
  values.forEach((rawGid, index) => {
    if (!rawGid) {
      return;
    }

    const flipX = (rawGid & FLIPPED_HORIZONTALLY_FLAG) !== 0;
    const flipY = (rawGid & FLIPPED_VERTICALLY_FLAG) !== 0;
    const flipDiagonal = (rawGid & FLIPPED_DIAGONALLY_FLAG) !== 0;
    const gid = rawGid & GID_MASK;

    if (!gid) {
      return;
    }

    const lookup = findTilesetForGid(gid, tilesetLookup);
    if (!lookup) {
      return;
    }

    const localTileId = gid - lookup.tileset.firstGid;
    const animation = lookup.tileset.tiles[localTileId]?.animation;
    const key = `${lookup.index}:${localTileId}`;

    if (!usedTileMap.has(key)) {
      const tileDef = lookup.tileset.tiles[localTileId];
      usedTileMap.set(key, {
        tilesetIndex: lookup.index,
        localTileId,
        globalTileId: gid,
        animationFrameIds: animation?.map((frame) => frame.tileId),
        imageSource: tileDef?.imageSource,
        width: tileDef?.imageWidth ?? lookup.tileset.tileWidth,
        height: tileDef?.imageHeight ?? lookup.tileset.tileHeight,
      });
    }

    const tileIndex = index;
    const tileX = offsetX + (tileIndex % width);
    const tileY = offsetY + Math.floor(tileIndex / width);

    placements.push({
      layerId: layer.id,
      layerName: layer.name,
      layerIndex: layer.index,
      x: tileX,
      y: tileY,
      globalTileId: gid,
      localTileId,
      tilesetIndex: lookup.index,
      flipX,
      flipY,
      flipDiagonal,
    });
  });
}

function findTilesetForGid(gid: number, lookup: TilesetLookupEntry[]): TilesetLookupEntry | undefined {
  for (let index = lookup.length - 1; index >= 0; index -= 1) {
    const entry = lookup[index];
    if (gid >= entry.tileset.firstGid && gid < entry.endGid) {
      return entry;
    }
  }
  return undefined;
}
