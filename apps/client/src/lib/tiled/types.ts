export interface TiledMapInfo {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  infinite: boolean;
}

export interface TiledTilesetTile {
  id: number;
  animation?: Array<{ tileId: number; duration: number }>;
  imageSource?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface TiledTileset {
  firstGid: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  imageSource: string;
  imageWidth?: number;
  imageHeight?: number;
  tiles: Record<number, TiledTilesetTile>;
}

export interface TiledLayer {
  id: number;
  name: string;
  width: number;
  height: number;
  index: number;
  // Only tile layers are supported in v1; other layer types are ignored.
  type: 'tilelayer';
}

export interface TilePlacement {
  layerId: number;
  layerName: string;
  layerIndex: number;
  x: number;
  y: number;
  globalTileId: number;
  localTileId: number;
  tilesetIndex: number;
  flipX: boolean;
  flipY: boolean;
  flipDiagonal: boolean;
}

export interface UsedTileRef {
  tilesetIndex: number;
  localTileId: number;
  globalTileId: number;
  animationFrameIds?: number[];
  imageSource?: string;
  width: number;
  height: number;
}

export interface TiledParseSummary {
  totalPlacements: number;
  distinctTiles: number;
  animatedTiles: number;
  layerCount: number;
}

export interface TiledParseResult {
  map: TiledMapInfo;
  tilesets: TiledTileset[];
  layers: TiledLayer[];
  placements: TilePlacement[];
  usedTiles: UsedTileRef[];
  summary: TiledParseSummary;
  errors: string[];
  warnings: string[];
}

export interface SliceRequest {
  tilesets: TiledTileset[];
  usedTiles: UsedTileRef[];
  images: Map<string, File>;
  targetTileSize: number;
}

export interface SlicedTileAsset {
  tilesetIndex: number;
  localTileId: number;
  assetId: string;
  fileName: string;
  blob: Blob;
  frameCount: number;
  animated: boolean;
  width: number;
  height: number;
}

export interface SliceResult {
  assets: SlicedTileAsset[];
  missingImages: string[];
}

export interface LayerCategoryMapping {
  [layerName: string]: string;
}

export interface ExportAssetItem {
  id: string;
  name: string;
  category: string;
  sprite: string;
  width: number;
  height: number;
  frameCount?: number;
}

export interface ExportPlacedAsset {
  id: string;
  assetId: string;
  x: number;
  y: number;
  category: string;
  zIndex: number;
  flipX?: boolean;
  width: number;
  height: number;
}

export interface ExporterInputs {
  importName: string;
  targetTileSize: number;
  slices: SlicedTileAsset[];
  placements: TilePlacement[];
  tilesets: TiledTileset[];
  layerCategories: LayerCategoryMapping;
}

export interface ExporterOutput {
  blob: Blob;
  readme: string;
  assetsModule: string;
  placedModule: string;
}
