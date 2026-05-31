export interface AssetItem {
  id: string;
  name: string;
  category: string;
  sprite?: string;
  isEnemy?: boolean;
  enemyType?: string;
  isCharacter?: boolean;
  isSpawnPoint?: boolean;
  width?: number; // Width in pixels
  height?: number; // Height in pixels
  allowOverlap?: boolean; // Allow this asset to overlap others in the editor
  frameCount?: number; // Number of frames for spritesheet animation (optional)
}

export interface PlacedAsset {
  id: string;
  assetId: string;
  x: number;
  y: number;
  positionMode?: 'grid' | 'pixel'; // Placement interpretation for rendering
  offsetX?: number; // Pixel offset from tile origin when positionMode === 'pixel'
  offsetY?: number; // Pixel offset from tile origin when positionMode === 'pixel'
  sprite?: string;
  isEnemy?: boolean;
  enemyType?: string;
  isCharacter?: boolean;
  isSpawnPoint?: boolean;
  category: string;
  rotation?: number; // 0, 90, 180, 270 degrees
  flipX?: boolean; // Horizontal flip
  width?: number; // Width in pixels
  height?: number; // Height in pixels
  zIndex?: number; // Rendering layer (lower values render first)
  allowOverlap?: boolean; // Allow this placed asset to overlap others in the editor
}

export type MapClusterType = 'none' | 'room' | 'connector';

export interface MapPort {
  side: 'N' | 'S' | 'E' | 'W';
  centerOffsetTiles: number;
  widthTiles: number;
  // Editor-only helper binding; excluded on export
  markerId?: string;
}

export interface MapMeta {
  orientation?: 'h' | 'v';
  ports?: MapPort[];
}

export interface MapCluster {
  name: string;
  width: number;
  height: number;
  instances: number;
  type?: MapClusterType;
  assets: PlacedAsset[];
  meta?: MapMeta;
}

export interface AssetCategory {
  name: string;
  assets: AssetItem[];
}

export type AssetCategories = Record<string, AssetCategory>;

import { ENEMY_TYPES } from '../data/enemies';

// Enemy types available for placement - dynamically generated from enemies data
export type EnemyType = keyof typeof ENEMY_TYPES | 'random';
