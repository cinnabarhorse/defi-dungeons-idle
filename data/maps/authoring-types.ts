// Authoring type definitions for Body + Port Stamps based chunk generation

export type Side = 'N' | 'S' | 'E' | 'W';

export interface AuthoringAsset {
  id?: string;
  assetId?: string;
  x: number;
  y: number;
  sprite: string;
  category: 'floors' | 'walls' | 'special' | 'decor' | string;
  allowOverlap?: boolean;
  rotation?: number;
  flipX?: boolean;
  zIndex?: number;
  positionMode?: 'grid' | 'pixel';
  offsetX?: number;
  offsetY?: number;
  isSpawnPoint?: boolean;
}

export interface EdgeWallHorizontal {
  y: number;
  x0: number;
  x1: number;
}

export interface EdgeWallVertical {
  x: number;
  y0: number;
  y1: number;
}

export interface BodyRecipe {
  id: string;
  size: { width: number; height: number };
  floors: AuthoringAsset[];
  details?: AuthoringAsset[];
}

export interface ChunkPort {
  side: Side;
  centerOffsetTiles: number; // from left/top edge to port center
  widthTiles: number; // opening width
}

export type StampPolicy = 'all' | 'defaultOnly' | 'none';

export interface PortWindow extends Partial<ChunkPort> {
  side: Side;
  centerOffsetTiles: number;
  widthTiles?: number; // optional; if omitted, derived from stamp footprint/orientation
  stampId?: string; // optional override of default stamp
}

export interface PortStamp {
  id: string;
  // Relative assets where (0,0) corresponds to the edge-center anchor
  // First version: rectangular cut in the wall
  wallCutStrategy: 'rectangle';
  // Footprint of the canonical (north-facing) stamp in tiles
  footprint?: { width: number; height: number };
  // Optional: explicit oriented variants that should be used instead of autorotation
  oriented?: Partial<
    Record<
      Side,
      {
        localAssets: AuthoringAsset[];
        footprint?: { width: number; height: number };
      }
    >
  >;
}

export interface ChunkBlueprintVariant {
  name: string; // final chunk name
  ports: PortWindow[];
  stampPolicy?: StampPolicy;
  stampId?: string; // optional override for all ports in this variant
  bodyId?: string; // optional override body for this variant
  // Optional: orientation-specific body overrides for this variant
  bodyByOrientation?: { h?: string; v?: string };
  meta?: {
    role?: 'room' | 'connector' | 'intersection';
    orientation?: 'h' | 'v';
    tags?: string[];
    weight?: number;
    instances?: number; // optional desired instances for this variant (0 = infinite)
  };
  decorations?: AuthoringAsset[];
}

export interface ChunkBlueprint {
  name: string; // blueprint family name
  bodyId: string;
  defaultStampId: string;
  stampPolicy?: StampPolicy; // default when variant doesn't specify
  // Optional: orientation-specific body overrides for this blueprint family
  bodyByOrientation?: { h?: string; v?: string };
  // Optional: desired instances for the entire family (0 = infinite). If set,
  // MapGenerator will treat all variants in this blueprint as a single pool
  // and spawn at most this many total across variants.
  instances?: number;
  variants: ChunkBlueprintVariant[];
}

// Optional: utility type for the generated chunk output (same shape used at runtime)
export interface GeneratedChunkAsset extends AuthoringAsset {}

export interface GeneratedChunkMeta {
  role?: 'room' | 'connector' | 'intersection';
  orientation?: 'h' | 'v';
  ports?: ChunkPort[];
  tags?: string[];
  weight?: number;
  // Blueprint family identity and optional family-wide instance budget
  family?: string;
  familyInstances?: number;
}

export interface GeneratedChunk {
  name: string;
  width: number;
  height: number;
  instances: number;
  type?: 'room' | 'connector' | string;
  assets: GeneratedChunkAsset[];
  meta?: GeneratedChunkMeta;
}
