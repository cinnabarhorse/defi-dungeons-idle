'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '../../components/ui/Button';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Grid as GridIcon,
  Magnet,
  Undo2,
  Redo2,
  Eraser,
  PaintBucket,
  Download,
  Upload,
  Search,
  Maximize,
  Minimize,
  ArrowRightLeft,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/Dialog';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '../../components/ui/Command';
import { useQueryState } from 'nuqs';
import {
  AssetItem,
  PlacedAsset,
  MapCluster,
  MapClusterType,
  MapPort,
  MapMeta,
} from '../../types/map-editor';
import { ASSET_CATEGORIES } from '../../data/map-editor-assets';
import { OBSTACLE_CONFIGS } from '../../data/obstacles';
import { drawAnimatedFrame } from '../../lib/animated-sprites';
import { AuthorTemplatesPanel } from './AuthorTemplatesPanel';

const isOverlayAssetId = (assetId?: string): boolean => {
  if (!assetId) {
    return false;
  }

  return OBSTACLE_CONFIGS[assetId]?.renderLayer === 'overlay';
};

const doesAssetItemAllowOverlap = (
  asset: AssetItem | null | undefined
): boolean => {
  if (!asset) {
    return false;
  }

  return asset.allowOverlap ?? isOverlayAssetId(asset.id);
};

const doesPlacedAssetAllowOverlap = (
  asset: PlacedAsset | null | undefined
): boolean => {
  if (!asset) {
    return false;
  }

  return asset.allowOverlap ?? isOverlayAssetId(asset.assetId);
};

type CanvasMousePosition = {
  gridX: number;
  gridY: number;
  pixelX: number;
  pixelY: number;
  offsetX: number;
  offsetY: number;
};

type PlacementKey = Pick<
  CanvasMousePosition,
  'gridX' | 'gridY' | 'offsetX' | 'offsetY'
>;

type PaletteAsset = {
  asset: AssetItem;
  categoryKey: string;
  categoryName: string;
  index: number;
};

type PaletteResult = PaletteAsset & {
  matchScore: number;
};

type MapFileOption = {
  file: string;
  title: string;
  chunkCount?: number;
};

type MapChunkSummary = {
  name: string;
  width: number;
  height: number;
  type?: string;
};

async function parseJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    let message = fallbackError;
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object' && 'error' in data) {
        const maybeError = (data as { error?: string }).error;
        if (maybeError) message = maybeError;
      }
    } catch {
      // ignore parse errors and use fallback message
    }
    throw new Error(message);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Failed to parse response JSON.');
  }
}

const isGameplayCriticalAsset = (
  asset: AssetItem | null | undefined
): boolean => {
  if (!asset) {
    return false;
  }

  if (asset.category === 'floors') return true;
  if (asset.isEnemy || asset.category === 'enemies') return true;
  if (asset.isSpawnPoint || asset.category === 'spawn') return true;
  if (asset.isCharacter || asset.category === 'characters') return true;

  return false;
};

// Helper function to get z-index based on asset category
const getAssetZIndex = (category: string, assetId?: string): number => {
  if (assetId && isOverlayAssetId(assetId)) {
    return 1; // Above floors but below regular entities
  }

  switch (category) {
    case 'floors':
      return 0; // Bottom layer
    case 'nature':
      return 10; // Trees, rocks, etc.
    case 'structures':
      return 20; // Walls, buildings
    case 'special':
      return 30; // Special objects
    case 'enemies':
      return 40; // Enemies
    case 'spawn':
      return 45; // Spawn points - above enemies but below characters
    case 'characters':
      return 50; // Characters on top
    default:
      return 25; // Default middle layer
  }
};

// Parse either strict JSON or a JS-style object literal (unquoted keys, single quotes, trailing commas, comments)
function stripJsLikeWrapper(input: string): string {
  const withoutBom = input.replace(/^\uFEFF/, '');
  // Drop any import lines entirely
  const withoutImports = withoutBom.replace(
    /^[\t ]*import\s+[^\n;]+;?[\t ]*$/gm,
    ''
  );
  // Remove leading export assignments or variable declarations assigning the chunk
  const withoutLeadingExportOrAssign = withoutImports.replace(
    /^\s*(export\s+default|module\.exports\s*=|(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*)/,
    ''
  );
  const withoutTrailingSemicolon = withoutLeadingExportOrAssign.replace(
    /;?\s*$/,
    ''
  );
  // Remove block comments
  const withoutBlockComments = withoutTrailingSemicolon.replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );
  // Remove line comments (but keep protocol in URLs)
  const withoutLineComments = withoutBlockComments.replace(
    /(^|[^:])\/\/.*$/gm,
    '$1'
  );
  return withoutLineComments.trim();
}

function parseJsonOrObjectLiteral<T>(input: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    // fallthrough
  }

  const sanitized = stripJsLikeWrapper(input);
  try {
    // Evaluate as an expression; constrained to this function scope
    // eslint-disable-next-line no-new-func
    const parsed = new Function('"use strict"; return (' + sanitized + ')')();
    return parsed as T;
  } catch (err) {
    throw err;
  }
}

// Attempt to transform TS chunk text with floor()/wall() calls into a JS-style
// object literal by replacing those calls with plain objects. This lets us reuse
// parseJsonOrObjectLiteral to handle mixed inputs (functions + object entries).
function transformTsFunctionsToObjects(input: string): string {
  // Expand ...fillRange(...) into inline object literals
  const expandRanges = (text: string): string => {
    const rangeRe =
      /\.\.\.fillRange\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*\{\s*id:\s*'([^']+)'(?:\s*,\s*stepX:\s*(\d+))?(?:\s*,\s*stepY:\s*(\d+))?(?:\s*,\s*sprite:\s*'([^']+)')?\s*,?\s*\}\s*\)/g;
    const rangeWallsRe =
      /\.\.\.fillRangeWalls\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*\{\s*id:\s*'([^']+)'(?:\s*,\s*stepX:\s*(\d+))?(?:\s*,\s*stepY:\s*(\d+))?(?:\s*,\s*sprite:\s*'([^']+)')?\s*,?\s*\}\s*\)/g;

    const expand = (
      _m: string,
      x0s: string,
      y0s: string,
      x1s: string,
      y1s: string,
      id: string,
      stepXs?: string,
      stepYs?: string,
      sprite?: string,
      isWall?: boolean
    ): string => {
      const x0 = Number(x0s);
      const y0 = Number(y0s);
      const x1 = Number(x1s);
      const y1 = Number(y1s);
      const stepX = Math.max(1, Number(stepXs || '1'));
      const stepY = Math.max(1, Number(stepYs || '1'));
      const minX = Math.min(x0, x1);
      const maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1);
      const maxY = Math.max(y0, y1);
      const out: string[] = [];
      for (let y = minY; y <= maxY; y += stepY) {
        for (let x = minX; x <= maxX; x += stepX) {
          const s =
            sprite ||
            (isWall ? `walls/${id}.png` : `floors/cyberkawaii/${id}.png`);
          const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
          out.push(
            `({ id: '${isWall ? 'wall' : 'floor'}_${safeId}_${x}_${y}', assetId: '${id}', x: ${x}, y: ${y}, sprite: '${s}', category: '${
              isWall ? 'walls' : 'floors'
            }', allowOverlap: false })`
          );
        }
      }
      return out.join(', ');
    };

    let next = text.replace(rangeRe, (m, a, b, c, d, e, f, g, h) =>
      expand(m, a, b, c, d, e, f, g, h, false)
    );
    next = next.replace(rangeWallsRe, (m, a, b, c, d, e, f, g, h) =>
      expand(m, a, b, c, d, e, f, g, h, true)
    );
    return next;
  };

  const afterRanges = expandRanges(input);

  const withFloors = afterRanges.replace(
    /floor\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\s*,?\s*\)/g,
    (_m, x, y, id, sprite) => {
      const s = sprite || `floors/cyberkawaii/${id}.png`;
      const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
      return `({ id: 'floor_${safeId}_${x}_${y}', assetId: '${id}', x: ${x}, y: ${y}, sprite: '${s}', category: 'floors', allowOverlap: false })`;
    }
  );
  const withWalls = withFloors.replace(
    /wall\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\s*,?\s*\)/g,
    (_m, x, y, id, sprite) => {
      const s = sprite || `walls/${id}.png`;
      const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
      return `({ id: 'wall_${safeId}_${x}_${y}', assetId: '${id}', x: ${x}, y: ${y}, sprite: '${s}', category: 'walls', allowOverlap: false })`;
    }
  );
  return withWalls;
}

// Generate TS code (floor()/wall() and object literals for others) for current state
function generateTsFromState(params: {
  name: string;
  width: number;
  height: number;
  instances: number;
  type: string;
  assets: PlacedAsset[];
  meta?: MapMeta;
}): string {
  const { name, width, height, instances, type, assets, meta } = params;

  const lines: string[] = [];
  const indent = '  ';

  // Prefer deterministic ordering: floors (by y,x,id), walls (by y,x,id), then others
  const floors = assets.filter((a) => a.category === 'floors');
  const walls = assets.filter((a) => a.category === 'walls');
  const others = assets.filter(
    (a) => a.category !== 'floors' && a.category !== 'walls'
  );

  floors.sort(
    (a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId)
  );
  walls.sort(
    (a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId)
  );

  for (const a of floors) {
    const inferred = `floors/cyberkawaii/${a.assetId}.png`;
    const spriteArg =
      a.sprite && a.sprite !== inferred ? `, '${a.sprite}'` : '';
    lines.push(
      `${indent.repeat(3)}floor(${a.x}, ${a.y}, '${a.assetId}'${spriteArg}),`
    );
  }

  for (const a of walls) {
    const inferred = `walls/${a.assetId}.png`;
    const spriteArg =
      a.sprite && a.sprite !== inferred ? `, '${a.sprite}'` : '';
    lines.push(
      `${indent.repeat(3)}wall(${a.x}, ${a.y}, '${a.assetId}'${spriteArg}),`
    );
  }

  for (const a of others) {
    // Minimal object literal; keep important fields
    const fields: string[] = [];
    if (a.id) fields.push(`id: '${a.id}'`);
    fields.push(`assetId: '${a.assetId}'`);
    fields.push(`x: ${a.x}`);
    fields.push(`y: ${a.y}`);
    if (a.sprite) fields.push(`sprite: '${a.sprite}'`);
    if (a.isEnemy) fields.push(`isEnemy: true`);
    if (a.enemyType) fields.push(`enemyType: '${a.enemyType}'`);
    if (a.isCharacter) fields.push(`isCharacter: true`);
    if (a.isSpawnPoint) fields.push(`isSpawnPoint: true`);
    if (typeof a.rotation === 'number' && a.rotation !== 0)
      fields.push(`rotation: ${a.rotation}`);
    if (a.flipX) fields.push(`flipX: true`);
    fields.push(`category: '${a.category}'`);
    if (typeof a.allowOverlap === 'boolean')
      fields.push(`allowOverlap: ${a.allowOverlap}`);
    lines.push(`${indent.repeat(3)}{ ${fields.join(', ')} },`);
  }

  const metaLines: string[] = [];
  if (meta && (meta.orientation || (meta.ports && meta.ports.length > 0))) {
    metaLines.push(`${indent}meta: {`);
    if (meta.orientation) {
      metaLines.push(`${indent.repeat(2)}orientation: '${meta.orientation}',`);
    }
    if (Array.isArray(meta.ports) && meta.ports.length > 0) {
      metaLines.push(`${indent.repeat(2)}ports: [`);
      for (const p of meta.ports) {
        metaLines.push(
          `${indent.repeat(3)}{ side: '${p.side}', centerOffsetTiles: ${Math.max(
            0,
            Math.floor(p.centerOffsetTiles || 0)
          )}, widthTiles: ${Math.max(1, Math.floor(p.widthTiles || 1))} },`
        );
      }
      metaLines.push(`${indent.repeat(2)}],`);
    }
    metaLines.push(`${indent}},`);
  }

  const chunk = [
    `{`,
    `${indent}name: '${name || 'unnamed'}',`,
    `${indent}width: ${Math.max(1, width)},`,
    `${indent}height: ${Math.max(1, height)},`,
    `${indent}instances: ${Math.max(0, instances || 0)},`,
    `${indent}type: '${type || 'room'}',`,
    ...metaLines,
    `${indent}assets: [`,
    ...lines,
    `${indent}]`,
    `}`,
  ].join('\n');

  return chunk;
}

interface TooltipButtonProps {
  label: string;
  children: React.ReactNode;
}

function TooltipButton({ label, children }: TooltipButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 rounded bg-gray-900 px-2 py-1 text-xs text-white shadow font-mono"
        >
          {label}
          <Tooltip.Arrow className="fill-gray-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// Helper function to get occupied cells for an asset
const getOccupiedCells = (
  asset: PlacedAsset,
  cellSize: number
): Array<{ x: number; y: number }> => {
  const cells: Array<{ x: number; y: number }> = [];
  const width = asset.isCharacter ? cellSize * 2 : asset.width || cellSize;
  const height = asset.isCharacter ? cellSize * 2 : asset.height || cellSize;

  // Calculate how many cells this asset occupies
  const cellsWide = Math.ceil(width / cellSize);
  const cellsHigh = Math.ceil(height / cellSize);

  // Account for rotation
  const isRotated = asset.rotation === 90 || asset.rotation === 270;
  const effectiveWidth = isRotated ? cellsHigh : cellsWide;
  const effectiveHeight = isRotated ? cellsWide : cellsHigh;

  for (let dy = 0; dy < effectiveHeight; dy++) {
    for (let dx = 0; dx < effectiveWidth; dx++) {
      cells.push({ x: asset.x + dx, y: asset.y + dy });
    }
  }

  return cells;
};

// Helper function to check if placement would cause collision
const checkCollision = (
  x: number,
  y: number,
  selectedAsset: AssetItem,
  placedAssets: PlacedAsset[],
  imageDimensions: Map<string, { width: number; height: number }>,
  cellSize: number,
  rotation: number = 0,
  mapWidth: number,
  mapHeight: number
): boolean => {
  const selectedAllowsOverlap = doesAssetItemAllowOverlap(selectedAsset);

  const dimensions = selectedAsset.sprite
    ? imageDimensions.get(selectedAsset.sprite)
    : undefined;

  const width = selectedAsset.isCharacter
    ? cellSize * 2
    : dimensions?.width || cellSize;
  const height = selectedAsset.isCharacter
    ? cellSize * 2
    : dimensions?.height || cellSize;

  // Calculate cells that would be occupied
  const cellsWide = Math.ceil(width / cellSize);
  const cellsHigh = Math.ceil(height / cellSize);

  // Account for rotation
  const isRotated = rotation === 90 || rotation === 270;
  const effectiveWidth = isRotated ? cellsHigh : cellsWide;
  const effectiveHeight = isRotated ? cellsWide : cellsHigh;

  // Check if object would extend beyond map boundaries
  if (x + effectiveWidth > mapWidth || y + effectiveHeight > mapHeight) {
    return true; // Would go outside map bounds
  }

  if (selectedAllowsOverlap) {
    return false;
  }

  // Check each cell that would be occupied
  for (let dy = 0; dy < effectiveHeight; dy++) {
    for (let dx = 0; dx < effectiveWidth; dx++) {
      const checkX = x + dx;
      const checkY = y + dy;

      // Check if any placed asset occupies this cell
      for (const asset of placedAssets) {
        // Skip floors - they can be placed under other objects
        if (asset.category === 'floors') continue;

        if (doesPlacedAssetAllowOverlap(asset)) continue;

        const occupiedCells = getOccupiedCells(asset, cellSize);
        if (
          occupiedCells.some((cell) => cell.x === checkX && cell.y === checkY)
        ) {
          return true; // Collision detected
        }
      }
    }
  }

  return false;
};

export default function MapEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapWidth, setMapWidth] = useState(20);
  const [mapHeight, setMapHeight] = useState(20);
  const [mapType, setMapType] = useState<MapClusterType>('none');
  const [mapOrientation, setMapOrientation] =
    useState<MapMeta['orientation']>();
  const [ports, setPorts] = useState<MapPort[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);
  const [placedAssets, setPlacedAssets] = useState<PlacedAsset[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('floors');
  const [mapName, setMapName] = useState('');
  const [mapInstances, setMapInstances] = useState(0);
  const [availableMapFiles, setAvailableMapFiles] = useState<MapFileOption[]>(
    []
  );
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [selectedMapFile, setSelectedMapFile] = useState<string | null>(null);
  const [availableChunks, setAvailableChunks] = useState<MapChunkSummary[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [selectedChunkName, setSelectedChunkName] = useState<string | null>(
    null
  );
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [isSavingToFile, setIsSavingToFile] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportedJson, setExportedJson] = useState('');
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [replaceFromAssetId, setReplaceFromAssetId] = useState<string>('');
  const [replaceToAssetId, setReplaceToAssetId] = useState<string>('');
  const [cellSize, setCellSize] = useState(32);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedImages, setLoadedImages] = useState<
    Map<string, HTMLImageElement>
  >(new Map());
  const [imageDimensions, setImageDimensions] = useState<
    Map<string, { width: number; height: number }>
  >(new Map());
  const [animatedSpriteMeta, setAnimatedSpriteMeta] = useState<
    Map<
      string,
      {
        frameWidth: number;
        frameHeight: number;
        frameCount: number;
        fps: number;
        orientation: 'horizontal' | 'vertical';
      }
    >
  >(new Map());
  const [mousePosition, setMousePosition] =
    useState<CanvasMousePosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPlacedPosition, setLastPlacedPosition] =
    useState<PlacementKey | null>(null);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [isOptionKeyPressed, setIsOptionKeyPressed] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [paletteSearchValue, setPaletteSearchValue] = useState('');
  const [highlightedAssetId, setHighlightedAssetId] = useState<string | null>(
    null
  );
  const [assetSearchQuery, setAssetSearchQuery] = useQueryState('assetSearch', {
    history: 'replace',
  });
  const [selectedAssetSlug, setSelectedAssetSlug] = useQueryState('asset', {
    history: 'replace',
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const lastFillMapCall = useRef<number>(0);
  const assetPreviewCanvasRefs = useRef<Map<string, Set<HTMLCanvasElement>>>(
    new Map()
  );
  const assetListContainerRef = useRef<HTMLDivElement>(null);
  const highlightedAssetTimeoutRef = useRef<number | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Selection & clipboard
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{
    gridX: number;
    gridY: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    gridX: number;
    gridY: number;
  } | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    new Set()
  );
  const [copyBuffer, setCopyBuffer] = useState<{
    assets: PlacedAsset[];
    minX: number;
    minY: number;
    width: number;
    height: number;
  } | null>(null);

  // Selection tool toggle and group move state
  const [isSelectionToolActive, setIsSelectionToolActive] = useState(false);
  const [selectionPendingStart, setSelectionPendingStart] = useState<{
    gridX: number;
    gridY: number;
  } | null>(null);
  const [isSelectionFrozen, setIsSelectionFrozen] = useState(false);
  const [selectionFrozenBounds, setSelectionFrozenBounds] = useState<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const [isMovingGroup, setIsMovingGroup] = useState(false);
  const [movingGroupPreviewTopLeft, setMovingGroupPreviewTopLeft] = useState<{
    gridX: number;
    gridY: number;
  } | null>(null);
  const [movingGroupIsValid, setMovingGroupIsValid] = useState(true);
  const movingGroupRef = useRef<{
    ids: Set<string>;
    assets: PlacedAsset[];
    minX: number;
    minY: number;
    width: number;
    height: number;
    anchorOffsetX: number; // in cells
    anchorOffsetY: number; // in cells
  } | null>(null);

  const applyChunkSummaries = useCallback((chunks: MapChunkSummary[]) => {
    setAvailableChunks(chunks);
    setSelectedChunkName((prev) =>
      prev && chunks.some((chunk) => chunk.name === prev) ? prev : null
    );
  }, []);

  const fetchMapFiles = useCallback(
    async (signal?: AbortSignal): Promise<MapFileOption[]> => {
      const response = await fetch('/api/maps', { signal });
      const data = await parseJsonResponse<{ files?: MapFileOption[] }>(
        response,
        'Failed to load map files.'
      );
      return data.files ?? [];
    },
    []
  );

  const fetchChunksForFile = useCallback(
    async (_file: string, signal?: AbortSignal): Promise<MapChunkSummary[]> => {
      const endpoint = `/api/maps/${encodeURIComponent(_file)}?full=1`;
      const response = await fetch(endpoint, { signal });
      const data = await parseJsonResponse<{
        file?: string;
        varName?: string;
        chunks: MapCluster[];
      }>(response, `Failed to load map chunks from ${_file}.`);
      return (data.chunks || []).map((c) => ({
        name: c.name,
        width: c.width,
        height: c.height,
        type: c.type,
      }));
    },
    []
  );

  const refreshChunksForCurrentFile = useCallback(async () => {
    if (!selectedMapFile) return;
    setChunksLoading(true);
    try {
      const chunks = await fetchChunksForFile(selectedMapFile);
      applyChunkSummaries(chunks);
      setChunksError(null);
    } catch (error) {
      console.error(error);
      setChunksError(
        error instanceof Error ? error.message : 'Failed to load chunks.'
      );
    } finally {
      setChunksLoading(false);
    }
  }, [selectedMapFile, fetchChunksForFile, applyChunkSummaries]);

  React.useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    setMapsLoading(true);
    setMapsError(null);
    setAvailableMapFiles([]);

    void fetchMapFiles(controller.signal)
      .then((files) => {
        if (!isActive) return;
        setAvailableMapFiles(files);
        const preferred =
          files.find((f) => f.file === 'chunks-staging.ts') ||
          files.find((f) => f.file === 'chunks.ts') ||
          files[0];
        setSelectedMapFile(preferred?.file ?? null);
      })
      .catch((error) => {
        if (!isActive) return;
        console.error(error);
        setMapsError(
          error instanceof Error ? error.message : 'Failed to load map files.'
        );
      })
      .finally(() => {
        if (isActive) setMapsLoading(false);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [fetchMapFiles]);

  React.useEffect(() => {
    if (!selectedMapFile) {
      setAvailableChunks([]);
      setSelectedChunkName(null);
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    setChunksLoading(true);
    setChunksError(null);
    setAvailableChunks([]);

    void fetchChunksForFile(selectedMapFile, controller.signal)
      .then((chunks) => {
        if (!isActive) return;
        applyChunkSummaries(chunks);
      })
      .catch((error) => {
        if (!isActive) return;
        console.error(error);
        setChunksError(
          error instanceof Error ? error.message : 'Failed to load chunks.'
        );
        setAvailableChunks([]);
        setSelectedChunkName(null);
      })
      .finally(() => {
        if (isActive) setChunksLoading(false);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [selectedMapFile, fetchChunksForFile, applyChunkSummaries]);

  // Fullscreen helpers
  const getIsFullscreen = useCallback((): boolean => {
    const doc: any = document as any;
    return !!(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.msFullscreenElement
    );
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current as any;
    const doc: any = document as any;
    if (!getIsFullscreen()) {
      if (!el) return;
      const req =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit =
        document.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.msExitFullscreen;
      if (exit) exit.call(document);
    }
  }, [getIsFullscreen]);

  React.useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(getIsFullscreen());
      // Clear selection and cancel group move on fullscreen changes (e.g., Esc)
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setIsMovingGroup(false);
      setMovingGroupPreviewTopLeft(null);
      movingGroupRef.current = null;
    };
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange as any);
    document.addEventListener('msfullscreenchange', handleChange as any);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleChange as any
      );
      document.removeEventListener('msfullscreenchange', handleChange as any);
    };
  }, [getIsFullscreen]);

  // Moving existing assets
  const [movingAssetId, setMovingAssetId] = useState<string | null>(null);
  const [isMovingAsset, setIsMovingAsset] = useState(false);
  const [movingPreview, setMovingPreview] = useState<PlacementKey | null>(null);
  const movingAssetRef = useRef<PlacedAsset | null>(null);
  const movingGrabOffsetPxRef = useRef<{ x: number; y: number } | null>(null);

  const createAssetPreviewRef = useCallback((sprite?: string) => {
    let previousCanvas: HTMLCanvasElement | null = null;

    return (canvas: HTMLCanvasElement | null) => {
      if (!sprite) {
        previousCanvas = canvas;
        return;
      }

      const canvasMap = assetPreviewCanvasRefs.current;

      if (previousCanvas && (!canvas || previousCanvas !== canvas)) {
        const canvases = canvasMap.get(sprite);
        if (canvases) {
          canvases.delete(previousCanvas);
          if (canvases.size === 0) {
            canvasMap.delete(sprite);
          }
        }
      }

      if (canvas) {
        let canvases = canvasMap.get(sprite);
        if (!canvases) {
          canvases = new Set<HTMLCanvasElement>();
          canvasMap.set(sprite, canvases);
        }

        canvases.add(canvas);

        const rect = canvas.getBoundingClientRect();
        const width = rect.width || 32;
        const height = rect.height || 32;
        if (canvas.width !== width) {
          canvas.width = width;
        }
        if (canvas.height !== height) {
          canvas.height = height;
        }
      }

      previousCanvas = canvas;
    };
  }, []);

  const flattenedAssets = React.useMemo<PaletteAsset[]>(() => {
    const entries: PaletteAsset[] = [];
    Object.entries(ASSET_CATEGORIES).forEach(([key, category]) => {
      category.assets.forEach((asset) => {
        const ensuredAsset = asset.category
          ? asset
          : { ...asset, category: key };
        entries.push({
          asset: ensuredAsset,
          categoryKey: key,
          categoryName: category.name,
          index: entries.length,
        });
      });
    });
    return entries;
  }, []);

  React.useEffect(() => {
    const slug = selectedAssetSlug ?? '';
    if (!slug) {
      return;
    }

    const entry = flattenedAssets.find((item) => item.asset.id === slug);
    if (entry) {
      if (selectedAsset?.id !== entry.asset.id) {
        setSelectedAsset({
          ...entry.asset,
          category: entry.asset.category ?? entry.categoryKey,
        });
        setCurrentRotation(0);
      }
    } else {
      void setSelectedAssetSlug(null);
    }
  }, [
    flattenedAssets,
    selectedAssetSlug,
    setSelectedAssetSlug,
    setCurrentRotation,
    setSelectedAsset,
    setSelectedCategory,
    selectedAsset,
    selectedCategory,
  ]);

  const searchResults = React.useMemo<PaletteResult[]>(() => {
    const normalizedQuery = debouncedSearch.trim().toLowerCase();

    const results = flattenedAssets
      .map((entry) => {
        if (!normalizedQuery) {
          return { ...entry, matchScore: entry.index };
        }

        const { asset } = entry;
        let bestScore = Number.POSITIVE_INFINITY;

        const evaluateField = (
          value: string | undefined,
          baseWeight: number
        ) => {
          if (!value) return;
          const lowerValue = value.toLowerCase();
          if (lowerValue === normalizedQuery) {
            bestScore = Math.min(bestScore, baseWeight);
            return;
          }
          if (lowerValue.startsWith(normalizedQuery)) {
            bestScore = Math.min(bestScore, baseWeight + 0.1);
            return;
          }
          const index = lowerValue.indexOf(normalizedQuery);
          if (index !== -1) {
            const score = baseWeight + 1 + index / 100;
            bestScore = Math.min(bestScore, score);
          }
        };

        evaluateField(asset.name, 0);
        evaluateField(asset.id, 1);
        evaluateField(asset.sprite, 2);
        if (asset.isEnemy && asset.enemyType) {
          evaluateField(asset.enemyType, 1.5);
        }

        if (bestScore === Number.POSITIVE_INFINITY) {
          return null;
        }

        return { ...entry, matchScore: bestScore };
      })
      .filter((value): value is PaletteResult => value !== null);

    results.sort((a, b) => {
      if (normalizedQuery) {
        if (a.matchScore !== b.matchScore) {
          return a.matchScore - b.matchScore;
        }
      } else if (a.index !== b.index) {
        return a.index - b.index;
      }

      if (a.categoryName !== b.categoryName) {
        return a.categoryName.localeCompare(b.categoryName);
      }

      if (a.asset.name !== b.asset.name) {
        return a.asset.name.localeCompare(b.asset.name);
      }

      return a.asset.id.localeCompare(b.asset.id);
    });

    return results;
  }, [flattenedAssets, debouncedSearch]);

  const groupedResults = React.useMemo(
    () =>
      Array.from(
        searchResults
          .reduce((map, result) => {
            const existing = map.get(result.categoryKey);
            if (existing) {
              existing.items.push(result);
            } else {
              map.set(result.categoryKey, {
                categoryName: result.categoryName,
                items: [result],
              });
            }
            return map;
          }, new Map<string, { categoryName: string; items: PaletteResult[] }>())
          .entries()
      ).map(([categoryKey, info]) => ({
        categoryKey,
        categoryName: info.categoryName,
        items: info.items,
      })),
    [searchResults]
  );

  const handlePaletteSelect = useCallback(
    (result: PaletteResult) => {
      setIsCommandPaletteOpen(false);
      setPaletteSearchValue('');
      setDebouncedSearch('');
      void setAssetSearchQuery(null);

      setSelectedCategory(result.categoryKey);
      setSelectedAsset({
        ...result.asset,
        category: result.asset.category ?? result.categoryKey,
      });
      setCurrentRotation(0);

      if ((selectedAssetSlug ?? '') !== result.asset.id) {
        void setSelectedAssetSlug(result.asset.id);
      }

      setHighlightedAssetId(result.asset.id);
      if (highlightedAssetTimeoutRef.current) {
        window.clearTimeout(highlightedAssetTimeoutRef.current);
      }
      highlightedAssetTimeoutRef.current = window.setTimeout(() => {
        setHighlightedAssetId(null);
      }, 1200);
    },
    [
      highlightedAssetTimeoutRef,
      setAssetSearchQuery,
      setCurrentRotation,
      setSelectedAsset,
      setSelectedCategory,
      setDebouncedSearch,
      setHighlightedAssetId,
      setIsCommandPaletteOpen,
      setPaletteSearchValue,
      selectedAssetSlug,
      setSelectedAssetSlug,
    ]
  );

  React.useEffect(() => {
    const current = (assetSearchQuery ?? '').toString();
    setPaletteSearchValue(current);
    setDebouncedSearch(current.trim());
  }, [assetSearchQuery, setDebouncedSearch, setPaletteSearchValue]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = paletteSearchValue.trim();
      setDebouncedSearch(next);

      const currentQuery = assetSearchQuery ?? '';
      if (next === currentQuery) {
        if (next === '' && assetSearchQuery !== null) {
          void setAssetSearchQuery(null);
        }
        return;
      }

      void setAssetSearchQuery(next.length > 0 ? next : null);
    }, 150);

    return () => window.clearTimeout(handle);
  }, [
    paletteSearchValue,
    assetSearchQuery,
    setAssetSearchQuery,
    setDebouncedSearch,
  ]);

  React.useEffect(() => {
    const handlePaletteShortcut = (event: KeyboardEvent) => {
      if (
        (event.key === 'k' || event.key === 'K') &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    document.addEventListener('keydown', handlePaletteShortcut);
    return () => document.removeEventListener('keydown', handlePaletteShortcut);
  }, [setIsCommandPaletteOpen]);

  React.useEffect(() => {
    return () => {
      if (highlightedAssetTimeoutRef.current) {
        window.clearTimeout(highlightedAssetTimeoutRef.current);
      }
    };
  }, []);

  const historyRef = useRef<PlacedAsset[][]>([[]]);
  const historyIndexRef = useRef(0);
  const [historyIndex, setHistoryIndex] = useState(0);

  const cloneAssets = useCallback(
    (assets: PlacedAsset[]) => assets.map((asset) => ({ ...asset })),
    []
  );

  const areAssetListsEqual = useCallback(
    (a: PlacedAsset[], b: PlacedAsset[]) => {
      if (a.length !== b.length) {
        return false;
      }

      const sortById = (list: PlacedAsset[]) =>
        [...list].sort((assetA, assetB) => {
          const idA = assetA.id ?? '';
          const idB = assetB.id ?? '';

          if (idA < idB) return -1;
          if (idA > idB) return 1;
          return 0;
        });

      const sortedA = sortById(a);
      const sortedB = sortById(b);

      return sortedA.every((asset, index) => {
        const other = sortedB[index];
        if (!other) {
          return false;
        }

        return (
          asset.id === other.id &&
          asset.assetId === other.assetId &&
          asset.x === other.x &&
          asset.y === other.y &&
          asset.sprite === other.sprite &&
          true &&
          asset.isEnemy === other.isEnemy &&
          asset.enemyType === other.enemyType &&
          asset.isCharacter === other.isCharacter &&
          asset.isSpawnPoint === other.isSpawnPoint &&
          asset.category === other.category &&
          (asset.rotation ?? 0) === (other.rotation ?? 0) &&
          (asset.flipX ?? false) === (other.flipX ?? false) &&
          (asset.width ?? 0) === (other.width ?? 0) &&
          (asset.height ?? 0) === (other.height ?? 0) &&
          (asset.positionMode ?? 'grid') === (other.positionMode ?? 'grid') &&
          (asset.offsetX ?? 0) === (other.offsetX ?? 0) &&
          (asset.offsetY ?? 0) === (other.offsetY ?? 0) &&
          (asset.zIndex ?? 0) === (other.zIndex ?? 0)
        );
      });
    },
    []
  );

  const pushHistory = useCallback(
    (assets: PlacedAsset[]) => {
      const snapshot = cloneAssets(assets);
      const historyUntilCurrent = historyRef.current.slice(
        0,
        historyIndexRef.current + 1
      );
      const lastSnapshot = historyUntilCurrent[historyUntilCurrent.length - 1];

      if (lastSnapshot && areAssetListsEqual(lastSnapshot, assets)) {
        return;
      }

      historyRef.current = historyUntilCurrent;
      historyRef.current.push(snapshot);
      historyIndexRef.current = historyRef.current.length - 1;
      setHistoryIndex(historyIndexRef.current);
    },
    [areAssetListsEqual, cloneAssets]
  );

  const updatePlacedAssets = useCallback(
    (updater: React.SetStateAction<PlacedAsset[]>) => {
      setPlacedAssets((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: PlacedAsset[]) => PlacedAsset[])(prev)
            : updater;

        if (next === prev || areAssetListsEqual(prev, next)) {
          return prev;
        }

        pushHistory(next);
        return next;
      });
    },
    [areAssetListsEqual, pushHistory]
  );

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      return;
    }

    historyIndexRef.current -= 1;
    const snapshot = cloneAssets(
      historyRef.current[historyIndexRef.current] || []
    );
    historyRef.current[historyIndexRef.current] = snapshot;
    setHistoryIndex(historyIndexRef.current);
    setPlacedAssets(snapshot);
    setLastPlacedPosition(null);
  }, [cloneAssets]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }

    historyIndexRef.current += 1;
    const snapshot = cloneAssets(
      historyRef.current[historyIndexRef.current] || []
    );
    historyRef.current[historyIndexRef.current] = snapshot;
    setHistoryIndex(historyIndexRef.current);
    setPlacedAssets(snapshot);
    setLastPlacedPosition(null);
  }, [cloneAssets]);

  const getCanvasCoordinates = useCallback(
    (
      event: React.MouseEvent<HTMLCanvasElement>
    ): CanvasMousePosition | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const pixelX = event.clientX - rect.left;
      const pixelY = event.clientY - rect.top;
      const gridX = Math.floor(pixelX / cellSize);
      const gridY = Math.floor(pixelY / cellSize);
      const offsetX = pixelX - gridX * cellSize;
      const offsetY = pixelY - gridY * cellSize;

      return { gridX, gridY, pixelX, pixelY, offsetX, offsetY };
    },
    [cellSize]
  );

  // Helper: determine if a placed asset is gameplay critical
  const isPlacedAssetGameplayCritical = useCallback(
    (asset: PlacedAsset | null | undefined): boolean => {
      if (!asset) return false;
      if (asset.category === 'floors') return true;
      if (asset.isEnemy || asset.category === 'enemies') return true;
      if (asset.isSpawnPoint || asset.category === 'spawn') return true;
      if (asset.isCharacter || asset.category === 'characters') return true;
      return false;
    },
    []
  );

  // Hit-test all assets at a pixel/grid position
  const getAssetsAtPosition = useCallback(
    (params: {
      clickGridX: number;
      clickGridY: number;
      clickPixelX: number;
      clickPixelY: number;
    }): PlacedAsset[] => {
      const { clickGridX, clickGridY, clickPixelX, clickPixelY } = params;

      return placedAssets.filter((asset) => {
        const dimensions = asset.sprite
          ? imageDimensions.get(asset.sprite)
          : undefined;
        const width = dimensions?.width || cellSize;
        const height = dimensions?.height || cellSize;
        const cellsWide = Math.ceil(width / cellSize);
        const cellsHigh = Math.ceil(height / cellSize);

        const isRotated = asset.rotation === 90 || asset.rotation === 270;
        const effectiveWidth = isRotated ? cellsHigh : cellsWide;
        const effectiveHeight = isRotated ? cellsWide : cellsHigh;

        const displayWidthPx = isRotated ? height : width;
        const displayHeightPx = isRotated ? width : height;

        const pixelOffsetX = asset.offsetX ?? 0;
        const pixelOffsetY = asset.offsetY ?? 0;
        const basePixelX = asset.x * cellSize + pixelOffsetX;
        const basePixelY = asset.y * cellSize + pixelOffsetY;

        const shouldUsePixelHitTest = doesPlacedAssetAllowOverlap(asset);

        if (shouldUsePixelHitTest) {
          return (
            clickPixelX >= basePixelX &&
            clickPixelX < basePixelX + displayWidthPx &&
            clickPixelY >= basePixelY &&
            clickPixelY < basePixelY + displayHeightPx
          );
        }

        return (
          clickGridX >= asset.x &&
          clickGridX < asset.x + effectiveWidth &&
          clickGridY >= asset.y &&
          clickGridY < asset.y + effectiveHeight
        );
      });
    },
    [placedAssets, imageDimensions, cellSize]
  );

  const getNormalizedSelectionRect = useCallback(
    (
      a: { gridX: number; gridY: number },
      b: { gridX: number; gridY: number }
    ) => {
      const minX = Math.min(a.gridX, b.gridX);
      const minY = Math.min(a.gridY, b.gridY);
      const maxX = Math.max(a.gridX, b.gridX);
      const maxY = Math.max(a.gridY, b.gridY);
      return { minX, minY, maxX, maxY };
    },
    []
  );

  const getAssetsInSelectionRect = useCallback(
    (
      rect: null | { minX: number; minY: number; maxX: number; maxY: number }
    ): PlacedAsset[] => {
      if (!rect) return [];
      const { minX, minY, maxX, maxY } = rect;
      return placedAssets.filter((asset) => {
        // Floors and others can be larger than 1x1
        const dimensions = asset.sprite
          ? imageDimensions.get(asset.sprite)
          : undefined;
        const width = asset.isCharacter
          ? cellSize * 2
          : dimensions?.width || cellSize;
        const height = asset.isCharacter
          ? cellSize * 2
          : dimensions?.height || cellSize;
        const cellsWide = Math.ceil(width / cellSize);
        const cellsHigh = Math.ceil(height / cellSize);

        const isRotated = asset.rotation === 90 || asset.rotation === 270;
        const effectiveWidth = isRotated ? cellsHigh : cellsWide;
        const effectiveHeight = isRotated ? cellsWide : cellsHigh;

        const left = asset.x;
        const top = asset.y;
        const right = asset.x + effectiveWidth - 1;
        const bottom = asset.y + effectiveHeight - 1;

        const intersects = !(
          right < minX ||
          left > maxX ||
          bottom < minY ||
          top > maxY
        );
        return intersects;
      });
    },
    [placedAssets, imageDimensions, cellSize]
  );

  // Get top-most asset according to render z-index
  const getTopMostAssetAtPosition = useCallback(
    (params: {
      clickGridX: number;
      clickGridY: number;
      clickPixelX: number;
      clickPixelY: number;
    }): PlacedAsset | null => {
      const assetsAtPosition = getAssetsAtPosition(params);
      if (assetsAtPosition.length === 0) return null;

      // Compute zIndex for each and pick the last after sorting ascending
      const withZ = assetsAtPosition.map((a) => ({
        asset: a,
        z: a.zIndex ?? getAssetZIndex(a.category, a.assetId),
      }));
      withZ.sort((a, b) => a.z - b.z);
      return withZ[withZ.length - 1]?.asset ?? null;
    },
    [getAssetsAtPosition]
  );

  // Remove the top-most asset at the given position
  const removeTopMostAssetAtPosition = useCallback(
    (params: {
      gridX: number;
      gridY: number;
      pixelX: number;
      pixelY: number;
    }) => {
      const { gridX, gridY, pixelX, pixelY } = params;

      const withinCanvas =
        pixelX >= 0 &&
        pixelY >= 0 &&
        pixelX < mapWidth * cellSize &&
        pixelY < mapHeight * cellSize;
      if (!withinCanvas) return;

      const topAsset = getTopMostAssetAtPosition({
        clickGridX: gridX,
        clickGridY: gridY,
        clickPixelX: pixelX,
        clickPixelY: pixelY,
      });

      if (topAsset) {
        updatePlacedAssets((prev) => {
          const filtered = prev.filter((asset) => asset.id !== topAsset.id);
          if (filtered.length === prev.length) return prev;
          return filtered;
        });
      }
    },
    [
      mapWidth,
      mapHeight,
      cellSize,
      getTopMostAssetAtPosition,
      updatePlacedAssets,
    ]
  );

  const placeAssetAt = useCallback(
    ({ gridX, gridY, offsetX, offsetY }: PlacementKey) => {
      if (!selectedAsset || gridX < 0 || gridY < 0) return;

      const selectedAllowsOverlap = doesAssetItemAllowOverlap(selectedAsset);

      const dimensions = selectedAsset.sprite
        ? imageDimensions.get(selectedAsset.sprite)
        : undefined;

      const width = selectedAsset.isCharacter
        ? cellSize * 2
        : dimensions?.width || cellSize;
      const height = selectedAsset.isCharacter
        ? cellSize * 2
        : dimensions?.height || cellSize;
      const cellsWide = Math.ceil(width / cellSize);
      const cellsHigh = Math.ceil(height / cellSize);

      const isRotated = currentRotation === 90 || currentRotation === 270;
      const effectiveWidth = isRotated ? cellsHigh : cellsWide;
      const effectiveHeight = isRotated ? cellsWide : cellsHigh;

      if (
        gridX + effectiveWidth > mapWidth ||
        gridY + effectiveHeight > mapHeight
      )
        return;

      const normalizedOffsetX = Math.round(offsetX);
      const normalizedOffsetY = Math.round(offsetY);
      const clampedOffsetX = Math.min(
        cellSize - 1,
        Math.max(0, normalizedOffsetX)
      );
      const clampedOffsetY = Math.min(
        cellSize - 1,
        Math.max(0, normalizedOffsetY)
      );

      const shouldUsePixelPlacement =
        !snapToGrid &&
        selectedAllowsOverlap &&
        !isGameplayCriticalAsset(selectedAsset);

      const placementOffsetX = shouldUsePixelPlacement ? clampedOffsetX : 0;
      const placementOffsetY = shouldUsePixelPlacement ? clampedOffsetY : 0;

      if (
        lastPlacedPosition &&
        lastPlacedPosition.gridX === gridX &&
        lastPlacedPosition.gridY === gridY &&
        lastPlacedPosition.offsetX === placementOffsetX &&
        lastPlacedPosition.offsetY === placementOffsetY
      ) {
        return;
      }

      if (selectedAsset.category !== 'floors') {
        const hasCollision = checkCollision(
          gridX,
          gridY,
          selectedAsset,
          placedAssets,
          imageDimensions,
          cellSize,
          currentRotation,
          mapWidth,
          mapHeight
        );

        if (hasCollision) {
          return;
        }
      }

      const newAssetId = `${selectedAsset.id}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const newAsset: PlacedAsset = {
        id: newAssetId,
        assetId: selectedAsset.id,
        x: gridX,
        y: gridY,
        sprite: selectedAsset.sprite,
        isEnemy: selectedAsset.isEnemy,
        enemyType: selectedAsset.enemyType,
        isCharacter: selectedAsset.isCharacter,
        isSpawnPoint:
          selectedAsset.isSpawnPoint || selectedAsset.id === 'player_spawn',
        category: selectedAsset.category,
        rotation: currentRotation,
        flipX: isOptionKeyPressed,
        width: dimensions?.width,
        height: dimensions?.height,
        zIndex: getAssetZIndex(selectedAsset.category, selectedAsset.id),
        allowOverlap: selectedAllowsOverlap,
        positionMode: shouldUsePixelPlacement ? 'pixel' : undefined,
        offsetX: shouldUsePixelPlacement ? placementOffsetX : undefined,
        offsetY: shouldUsePixelPlacement ? placementOffsetY : undefined,
      };

      updatePlacedAssets((prev) => {
        const occupiedCells = new Set<string>();

        for (let dy = 0; dy < effectiveHeight; dy++) {
          for (let dx = 0; dx < effectiveWidth; dx++) {
            occupiedCells.add(`${gridX + dx},${gridY + dy}`);
          }
        }

        const filteredAssets = prev.filter((asset) => {
          if (selectedAllowsOverlap) {
            return true;
          }

          if (selectedAsset.category === 'floors') {
            if (asset.category !== 'floors') {
              return true;
            }

            if (doesPlacedAssetAllowOverlap(asset)) {
              return true;
            }

            const assetCells = getOccupiedCells(asset, cellSize);
            return !assetCells.some((cell) =>
              occupiedCells.has(`${cell.x},${cell.y}`)
            );
          }

          if (asset.category === 'floors') {
            return true;
          }

          if (doesPlacedAssetAllowOverlap(asset)) {
            return true;
          }

          const assetCells = getOccupiedCells(asset, cellSize);
          return !assetCells.some((cell) =>
            occupiedCells.has(`${cell.x},${cell.y}`)
          );
        });

        return [...filteredAssets, newAsset];
      });

      setLastPlacedPosition({
        gridX,
        gridY,
        offsetX: placementOffsetX,
        offsetY: placementOffsetY,
      });
    },
    [
      selectedAsset,
      mapWidth,
      mapHeight,
      lastPlacedPosition,
      currentRotation,
      isOptionKeyPressed,
      imageDimensions,
      placedAssets,
      cellSize,
      snapToGrid,
      updatePlacedAssets,
    ]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoordinates(event);
      if (!coords) return;

      const { gridX, gridY, pixelX, pixelY, offsetX, offsetY } = coords;
      const withinBounds =
        pixelX >= 0 &&
        pixelY >= 0 &&
        pixelX < mapWidth * cellSize &&
        pixelY < mapHeight * cellSize &&
        gridX >= 0 &&
        gridY >= 0 &&
        gridX < mapWidth &&
        gridY < mapHeight;

      if (!withinBounds) return;

      // Start marquee selection when the marquee tool is active (no hotkey needed)
      if (isSelectionToolActive) {
        // Start marquee selection without any modifier keys
        event.preventDefault();
        event.stopPropagation();
        setIsSelecting(true);
        setIsSelectionFrozen(false);
        setSelectionFrozenBounds(null);
        const start = { gridX, gridY };
        setSelectionStart(start);
        setSelectionEnd(start);
        setSelectionPendingStart(start);
        return;
      }

      // Right mouse button: start delete-drag and delete immediately
      if (event.button === 2) {
        if (isSelectionToolActive) return; // disable delete in marquee mode
        removeTopMostAssetAtPosition({ gridX, gridY, pixelX, pixelY });
        return;
      }

      // If placing an overlay/allowOverlap asset, prioritize placement over selecting/moving
      if (
        !isSelectionToolActive &&
        selectedAsset &&
        doesAssetItemAllowOverlap(selectedAsset)
      ) {
        setIsDragging(true);
        setLastPlacedPosition(null);
        placeAssetAt({ gridX, gridY, offsetX, offsetY });
        return;
      }

      // If clicking on a selected asset, start group move
      if (selectedAssetIds.size > 0) {
        const topForGroup = getTopMostAssetAtPosition({
          clickGridX: gridX,
          clickGridY: gridY,
          clickPixelX: pixelX,
          clickPixelY: pixelY,
        });
        if (topForGroup && selectedAssetIds.has(topForGroup.id)) {
          const groupAssets = placedAssets.filter((a) =>
            selectedAssetIds.has(a.id)
          );
          if (groupAssets.length > 0) {
            let minGX = Number.POSITIVE_INFINITY;
            let minGY = Number.POSITIVE_INFINITY;
            let maxGX = Number.NEGATIVE_INFINITY;
            let maxGY = Number.NEGATIVE_INFINITY;
            groupAssets.forEach((a) => {
              const dimensions = a.sprite
                ? imageDimensions.get(a.sprite)
                : undefined;
              const widthPx = a.isCharacter
                ? cellSize * 2
                : dimensions?.width || cellSize;
              const heightPx = a.isCharacter
                ? cellSize * 2
                : dimensions?.height || cellSize;
              const cellsWide = Math.ceil(widthPx / cellSize);
              const cellsHigh = Math.ceil(heightPx / cellSize);
              const rotated =
                (a.rotation ?? 0) === 90 || (a.rotation ?? 0) === 270;
              const effW = rotated ? cellsHigh : cellsWide;
              const effH = rotated ? cellsWide : cellsHigh;
              minGX = Math.min(minGX, a.x);
              minGY = Math.min(minGY, a.y);
              maxGX = Math.max(maxGX, a.x + effW - 1);
              maxGY = Math.max(maxGY, a.y + effH - 1);
            });
            const widthCells = Math.max(1, maxGX - minGX + 1);
            const heightCells = Math.max(1, maxGY - minGY + 1);
            const anchorOffsetX = gridX - minGX;
            const anchorOffsetY = gridY - minGY;
            movingGroupRef.current = {
              ids: new Set(selectedAssetIds),
              assets: groupAssets.map((a) => ({ ...a })),
              minX: minGX,
              minY: minGY,
              width: widthCells,
              height: heightCells,
              anchorOffsetX,
              anchorOffsetY,
            };
            setIsDragging(true);
            setIsMovingGroup(true);
            const topLeftX = Math.min(
              Math.max(0, gridX - anchorOffsetX),
              Math.max(0, mapWidth - widthCells)
            );
            const topLeftY = Math.min(
              Math.max(0, gridY - anchorOffsetY),
              Math.max(0, mapHeight - heightCells)
            );
            setMovingGroupPreviewTopLeft({ gridX: topLeftX, gridY: topLeftY });
            setMovingGroupIsValid(true);
            setLastPlacedPosition(null);
            return;
          }
        }
      }

      // If placing a floor, prioritize placement over moving any existing asset (disabled in marquee mode)
      if (
        !isSelectionToolActive &&
        selectedAsset &&
        selectedAsset.category === 'floors'
      ) {
        setIsDragging(true);
        setLastPlacedPosition(null);
        placeAssetAt({ gridX, gridY, offsetX, offsetY });
        return;
      }

      // Try to start moving the top-most asset first (single asset move)
      let topAsset = getTopMostAssetAtPosition({
        clickGridX: gridX,
        clickGridY: gridY,
        clickPixelX: pixelX,
        clickPixelY: pixelY,
      });

      // If we're placing a non-floor asset, ignore floors when deciding to start a move
      if (
        topAsset &&
        topAsset.category === 'floors' &&
        selectedAsset &&
        selectedAsset.category !== 'floors'
      ) {
        topAsset = null;
      }

      if (!isSelectionToolActive && topAsset) {
        setIsDragging(true);
        setIsMovingAsset(true);
        setMovingAssetId(topAsset.id);
        movingAssetRef.current = topAsset;
        // Initialize preview at the asset's current placement (no jump)
        setMovingPreview({
          gridX: topAsset.x,
          gridY: topAsset.y,
          offsetX: topAsset.offsetX ?? 0,
          offsetY: topAsset.offsetY ?? 0,
        });
        // Record where inside the asset the user grabbed it (pixel offset from asset origin)
        {
          const basePixelX = topAsset.x * cellSize + (topAsset.offsetX ?? 0);
          const basePixelY = topAsset.y * cellSize + (topAsset.offsetY ?? 0);
          movingGrabOffsetPxRef.current = {
            x: pixelX - basePixelX,
            y: pixelY - basePixelY,
          };
        }
        setLastPlacedPosition(null);
        return;
      }

      // Otherwise place a new selected asset if one is chosen (disabled in marquee mode)
      if (!isSelectionToolActive && selectedAsset) {
        setIsDragging(true);
        setLastPlacedPosition(null);
        placeAssetAt({ gridX, gridY, offsetX, offsetY });
      }
    },
    [
      selectedAsset,
      getCanvasCoordinates,
      mapWidth,
      mapHeight,
      cellSize,
      placeAssetAt,
      getTopMostAssetAtPosition,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (isSelecting) {
      // Freeze current selection rectangle; if no drag, freeze around current selection set
      setIsSelecting(false);
      setIsSelectionFrozen(true);
      let bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
      } | null = null;
      if (selectionStart && selectionEnd) {
        const noDrag =
          selectionStart.gridX === selectionEnd.gridX &&
          selectionStart.gridY === selectionEnd.gridY;
        if (noDrag && selectedAssetIds.size > 0) {
          // Compute bounds from selected assets
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          placedAssets
            .filter((a) => selectedAssetIds.has(a.id))
            .forEach((a) => {
              const dimensions = a.sprite
                ? imageDimensions.get(a.sprite)
                : undefined;
              const widthPx = a.isCharacter
                ? cellSize * 2
                : dimensions?.width || cellSize;
              const heightPx = a.isCharacter
                ? cellSize * 2
                : dimensions?.height || cellSize;
              const cellsWide = Math.ceil(widthPx / cellSize);
              const cellsHigh = Math.ceil(heightPx / cellSize);
              const rotated =
                (a.rotation ?? 0) === 90 || (a.rotation ?? 0) === 270;
              const effW = rotated ? cellsHigh : cellsWide;
              const effH = rotated ? cellsWide : cellsHigh;
              minX = Math.min(minX, a.x);
              minY = Math.min(minY, a.y);
              maxX = Math.max(maxX, a.x + effW - 1);
              maxY = Math.max(maxY, a.y + effH - 1);
            });
          if (minX !== Number.POSITIVE_INFINITY) {
            bounds = { minX, minY, maxX, maxY };
          }
        } else {
          bounds = getNormalizedSelectionRect(selectionStart, selectionEnd);
        }
      }
      if (bounds) {
        setSelectionFrozenBounds(bounds);
        const assets = getAssetsInSelectionRect(bounds);
        setSelectedAssetIds(new Set(assets.map((a) => a.id)));
      }
      return;
    }
    if (isMovingGroup && movingGroupRef.current && movingGroupPreviewTopLeft) {
      const { ids, assets, minX } = movingGroupRef.current;
      const topLeft = movingGroupPreviewTopLeft;
      // Validate again before applying
      let canPlace = true;
      const others = placedAssets.filter((a) => !ids.has(a.id));
      for (const src of assets) {
        const toItem = {
          id: src.assetId,
          category: src.category,
          sprite: src.sprite,
          isEnemy: src.isEnemy,
          enemyType: src.enemyType,
          isCharacter: src.isCharacter,
          isSpawnPoint: src.isSpawnPoint,
          allowOverlap: src.allowOverlap,
        } as AssetItem;
        const nextX = topLeft.gridX + (src.x - minX);
        const nextY = topLeft.gridY + (src.y - movingGroupRef.current.minY);
        if (src.category !== 'floors') {
          const collide = checkCollision(
            nextX,
            nextY,
            toItem,
            others,
            imageDimensions,
            cellSize,
            src.rotation ?? 0,
            mapWidth,
            mapHeight
          );
          if (collide) {
            canPlace = false;
            break;
          }
        }
      }

      if (canPlace) {
        updatePlacedAssets((prev) => {
          // Compute target cells occupied by moved floors and non-floors
          const floorTargets = new Set<string>();
          const nonFloorTargets = new Set<string>();
          const moved = assets.map((src) => {
            const nextX =
              topLeft.gridX + (src.x - movingGroupRef.current!.minX);
            const nextY =
              topLeft.gridY + (src.y - movingGroupRef.current!.minY);
            const movedAsset: PlacedAsset = { ...src, x: nextX, y: nextY };
            if (!(movedAsset.allowOverlap ?? false)) {
              const cells = getOccupiedCells(movedAsset, cellSize);
              const target =
                movedAsset.category === 'floors'
                  ? floorTargets
                  : nonFloorTargets;
              cells.forEach((c) => target.add(`${c.x},${c.y}`));
            }
            return movedAsset;
          });

          const filtered = prev.filter((a) => {
            if (ids.has(a.id)) return false; // remove originals
            if (a.category === 'floors') {
              if (doesPlacedAssetAllowOverlap(a)) return true;
              const cells = getOccupiedCells(a, cellSize);
              return !cells.some((c) => floorTargets.has(`${c.x},${c.y}`));
            }
            if (doesPlacedAssetAllowOverlap(a)) return true;
            const cells = getOccupiedCells(a, cellSize);
            return !cells.some((c) => nonFloorTargets.has(`${c.x},${c.y}`));
          });

          const result = [...filtered, ...moved].map((a) => ({
            ...a,
            zIndex: a.zIndex ?? getAssetZIndex(a.category, a.assetId),
          }));
          result.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
          return result;
        });
      }

      // Reset moving group state
      setIsDragging(false);
      setIsMovingGroup(false);
      setMovingGroupPreviewTopLeft(null);
      movingGroupRef.current = null;
      setLastPlacedPosition(null);
      return;
    }
    if (
      isMovingAsset &&
      movingAssetId &&
      movingPreview &&
      movingAssetRef.current
    ) {
      const moving = movingAssetRef.current;

      const allowsOverlap = doesPlacedAssetAllowOverlap(moving);
      const gameplayCritical = isPlacedAssetGameplayCritical(moving);
      const shouldUsePixelPlacement =
        !snapToGrid && allowsOverlap && !gameplayCritical;

      const nextGridX = movingPreview.gridX;
      const nextGridY = movingPreview.gridY;
      const nextOffsetX = shouldUsePixelPlacement
        ? Math.min(cellSize - 1, Math.max(0, Math.round(movingPreview.offsetX)))
        : 0;
      const nextOffsetY = shouldUsePixelPlacement
        ? Math.min(cellSize - 1, Math.max(0, Math.round(movingPreview.offsetY)))
        : 0;

      // Validate collisions and bounds (skip for floors)
      let canPlace = true;
      if (moving.category !== 'floors') {
        const movingAsItem = {
          id: moving.assetId,
          category: moving.category,
          sprite: moving.sprite,
          isEnemy: moving.isEnemy,
          enemyType: moving.enemyType,
          isCharacter: moving.isCharacter,
          isSpawnPoint: moving.isSpawnPoint,
          allowOverlap: moving.allowOverlap,
        } as AssetItem;

        const others = placedAssets.filter((a) => a.id !== moving.id);
        canPlace = !checkCollision(
          nextGridX,
          nextGridY,
          movingAsItem,
          others,
          imageDimensions,
          cellSize,
          moving.rotation ?? 0,
          mapWidth,
          mapHeight
        );
      }

      if (canPlace) {
        updatePlacedAssets((prev) =>
          prev.map((a) =>
            a.id === moving.id
              ? {
                  ...a,
                  x: nextGridX,
                  y: nextGridY,
                  positionMode: shouldUsePixelPlacement ? 'pixel' : undefined,
                  offsetX: shouldUsePixelPlacement ? nextOffsetX : undefined,
                  offsetY: shouldUsePixelPlacement ? nextOffsetY : undefined,
                }
              : a
          )
        );
      }
    }

    setIsDragging(false);
    setIsMovingAsset(false);
    setMovingAssetId(null);
    setMovingPreview(null);
    movingAssetRef.current = null;
    movingGrabOffsetPxRef.current = null;
    setLastPlacedPosition(null);
  }, [
    isMovingAsset,
    movingAssetId,
    movingPreview,
    placedAssets,
    imageDimensions,
    cellSize,
    snapToGrid,
    isPlacedAssetGameplayCritical,
    mapWidth,
    mapHeight,
    updatePlacedAssets,
  ]);

  const handleAssetRightClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const coords = getCanvasCoordinates(event);
      if (!coords) return;
      if (isSelectionToolActive) return; // disable delete while marquee tool is active
      removeTopMostAssetAtPosition({
        gridX: coords.gridX,
        gridY: coords.gridY,
        pixelX: coords.pixelX,
        pixelY: coords.pixelY,
      });
    },
    [getCanvasCoordinates, removeTopMostAssetAtPosition, isSelectionToolActive]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoordinates(event);
      if (!coords) return;

      const { gridX, gridY, pixelX, pixelY, offsetX, offsetY } = coords;
      const withinBounds =
        pixelX >= 0 &&
        pixelY >= 0 &&
        pixelX < mapWidth * cellSize &&
        pixelY < mapHeight * cellSize &&
        gridX >= 0 &&
        gridY >= 0 &&
        gridX < mapWidth &&
        gridY < mapHeight;

      if (withinBounds) {
        setMousePosition(coords);
        // If marquee tool is active, prevent any single-tile place/erase flows from other listeners
        if (isSelectionToolActive) {
          event.preventDefault();
          event.stopPropagation();
        }

        // Update marquee selection while dragging
        if (isSelectionToolActive && isSelecting && selectionStart) {
          // Prevent default to avoid any native selection behavior
          event.preventDefault();
          const rect = getNormalizedSelectionRect(selectionStart, {
            gridX,
            gridY,
          });
          setSelectionEnd({ gridX, gridY });
          const assets = getAssetsInSelectionRect(rect);
          setSelectedAssetIds(new Set(assets.map((a) => a.id)));
          return;
        }

        // If selection is frozen and we click (without dragging), keep showing frozen box until next drag

        // While holding the right mouse button, delete as we move
        if ((event.buttons & 2) === 2) {
          removeTopMostAssetAtPosition({ gridX, gridY, pixelX, pixelY });
          return;
        }

        if (isDragging) {
          if (isMovingGroup && movingGroupRef.current) {
            const snap = movingGroupRef.current;
            const widthCells = snap.width;
            const heightCells = snap.height;
            const nextTopLeftX = Math.min(
              Math.max(0, gridX - snap.anchorOffsetX),
              Math.max(0, mapWidth - widthCells)
            );
            const nextTopLeftY = Math.min(
              Math.max(0, gridY - snap.anchorOffsetY),
              Math.max(0, mapHeight - heightCells)
            );

            // Validate placement
            let canPlace = true;
            const others = placedAssets.filter((a) => !snap.ids.has(a.id));
            for (const src of snap.assets) {
              const toItem = {
                id: src.assetId,
                category: src.category,
                sprite: src.sprite,
                isEnemy: src.isEnemy,
                enemyType: src.enemyType,
                isCharacter: src.isCharacter,
                isSpawnPoint: src.isSpawnPoint,
                allowOverlap: src.allowOverlap,
              } as AssetItem;
              const nx = nextTopLeftX + (src.x - snap.minX);
              const ny = nextTopLeftY + (src.y - snap.minY);
              if (src.category !== 'floors') {
                const collide = checkCollision(
                  nx,
                  ny,
                  toItem,
                  others,
                  imageDimensions,
                  cellSize,
                  src.rotation ?? 0,
                  mapWidth,
                  mapHeight
                );
                if (collide) {
                  canPlace = false;
                  break;
                }
              }
            }

            setMovingGroupPreviewTopLeft({
              gridX: nextTopLeftX,
              gridY: nextTopLeftY,
            });
            setMovingGroupIsValid(canPlace);
            return;
          }
          if (isMovingAsset && movingAssetRef.current) {
            // Anchor the asset origin to the grab offset relative to the mouse
            const grab = movingGrabOffsetPxRef.current || { x: 0, y: 0 };
            const originPixelX = pixelX - grab.x;
            const originPixelY = pixelY - grab.y;

            const moving = movingAssetRef.current;
            const allowsOverlap = doesPlacedAssetAllowOverlap(moving);
            const gameplayCritical = isPlacedAssetGameplayCritical(moving);
            const placementAllowsPixel =
              !snapToGrid && allowsOverlap && !gameplayCritical;

            const nextGridX = Math.floor(originPixelX / cellSize);
            const nextGridY = Math.floor(originPixelY / cellSize);
            const nextOffsetX = placementAllowsPixel
              ? Math.min(
                  cellSize - 1,
                  Math.max(0, Math.round(originPixelX - nextGridX * cellSize))
                )
              : 0;
            const nextOffsetY = placementAllowsPixel
              ? Math.min(
                  cellSize - 1,
                  Math.max(0, Math.round(originPixelY - nextGridY * cellSize))
                )
              : 0;

            setMovingPreview({
              gridX: nextGridX,
              gridY: nextGridY,
              offsetX: nextOffsetX,
              offsetY: nextOffsetY,
            });
          } else {
            placeAssetAt({ gridX, gridY, offsetX, offsetY });
          }
        }
      } else {
        setMousePosition(null);
      }
    },
    [
      getCanvasCoordinates,
      mapWidth,
      mapHeight,
      cellSize,
      isDragging,
      placeAssetAt,
      isMovingAsset,
      isPlacedAssetGameplayCritical,
      removeTopMostAssetAtPosition,
    ]
  );

  const handleMouseLeave = useCallback(() => {
    setMousePosition(null);
    setIsDragging(false);
    setLastPlacedPosition(null);
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;

      for (let x = 0; x <= mapWidth; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellSize, 0);
        ctx.lineTo(x * cellSize, mapHeight * cellSize);
        ctx.stroke();
      }

      for (let y = 0; y <= mapHeight; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellSize);
        ctx.lineTo(mapWidth * cellSize, y * cellSize);
        ctx.stroke();
      }
    }

    // Draw placed assets sorted by z-index (lowest first)
    const sortedAssets = placedAssets
      .map((asset) => ({
        ...asset,
        zIndex: asset.zIndex ?? getAssetZIndex(asset.category, asset.assetId),
      }))
      .sort((a, b) => a.zIndex - b.zIndex);

    const nowMs = Date.now();
    sortedAssets.forEach((asset) => {
      // Hide the original while moving
      if (movingAssetId && asset.id === movingAssetId) {
        return;
      }
      if (isMovingGroup && selectedAssetIds.has(asset.id)) {
        return;
      }
      const baseTileX = asset.x * cellSize;
      const baseTileY = asset.y * cellSize;
      const pixelOffsetX = asset.offsetX ?? 0;
      const pixelOffsetY = asset.offsetY ?? 0;
      const originX = baseTileX + pixelOffsetX;
      const originY = baseTileY + pixelOffsetY;

      if (asset.isCharacter) {
        // Draw character sprite
        const spriteImage = loadedImages.get(asset.sprite || '');

        if (spriteImage) {
          ctx.save();

          // Apply transformations
          const characterSize = cellSize * 2;
          const centerX = originX + characterSize / 2;
          const centerY = originY + characterSize / 2;

          ctx.translate(centerX, centerY);

          // Apply rotation
          if (asset.rotation) {
            ctx.rotate((asset.rotation * Math.PI) / 180);
          }

          // Apply horizontal flip
          if (asset.flipX) {
            ctx.scale(-1, 1);
          }

          ctx.translate(-centerX, -centerY);

          ctx.drawImage(
            spriteImage,
            originX + 1,
            originY + 1,
            characterSize - 2,
            characterSize - 2
          );

          ctx.restore();

          // Add character border
          if (showGrid) {
            ctx.strokeStyle = '#9333ea';
            ctx.lineWidth = 2;
            const characterSize = cellSize * 2;
            ctx.strokeRect(
              originX + 1,
              originY + 1,
              characterSize - 2,
              characterSize - 2
            );
          }
        } else {
          // Fallback for characters
          ctx.fillStyle = '#9333ea';
          const characterSize = cellSize * 2;
          ctx.fillRect(
            originX + 1,
            originY + 1,
            characterSize - 2,
            characterSize - 2
          );

          // Draw character label
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
          ctx.fillText('CHAR', originX + 4, originY + (cellSize * 2) / 2);
        }
      } else if (asset.isEnemy) {
        // Draw enemy placeholder
        ctx.fillStyle = asset.enemyType === 'random' ? '#ff6b6b' : '#ff8c42';
        ctx.fillRect(originX + 2, originY + 2, cellSize - 4, cellSize - 4);

        // Draw enemy type label with white background for visibility
        const label =
          asset.enemyType === 'random'
            ? 'RND'
            : asset.enemyType?.substring(0, 3).toUpperCase() || 'ENM';

        ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
        const textWidth = ctx.measureText(label).width;

        // White background for text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(originX + 2, originY + cellSize - 16, textWidth + 4, 12);

        // Black text
        ctx.fillStyle = '#000';
        ctx.fillText(label, originX + 4, originY + cellSize - 6);
      } else if (asset.isSpawnPoint) {
        // Draw spawn point placeholder
        ctx.fillStyle = '#00ff00'; // Bright green for spawn points
        ctx.fillRect(originX + 2, originY + 2, cellSize - 4, cellSize - 4);

        // Draw spawn point icon (star shape)
        ctx.fillStyle = '#fff';
        const centerX = originX + cellSize / 2;
        const centerY = originY + cellSize / 2;
        const starSize = cellSize / 4;

        // Draw a simple star shape
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * starSize;
          const y = centerY + Math.sin(angle) * starSize;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw spawn point label with white background for visibility
        ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
        const label = 'SPAWN';
        const textWidth = ctx.measureText(label).width;

        // White background for text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(originX + 2, originY + cellSize - 16, textWidth + 4, 12);

        // Black text
        ctx.fillStyle = '#000';
        ctx.fillText(label, originX + 4, originY + cellSize - 6);
      } else if (asset.sprite) {
        const spriteImage = loadedImages.get(asset.sprite);
        const dimensions = imageDimensions.get(asset.sprite);
        let animMeta = animatedSpriteMeta.get(asset.sprite);
        // No fallback inference; rely solely on provided frameCount metadata

        if (spriteImage && dimensions) {
          ctx.save();

          // Calculate actual display dimensions based on the image's actual size
          const actualWidth = dimensions.width || cellSize;
          const actualHeight = dimensions.height || cellSize;

          // Apply transformations
          const centerX = originX + actualWidth / 2;
          const centerY = originY + actualHeight / 2;

          ctx.translate(centerX, centerY);

          // Apply rotation
          if (asset.rotation) {
            ctx.rotate((asset.rotation * Math.PI) / 180);
          }

          // Apply horizontal flip
          if (asset.flipX) {
            ctx.scale(-1, 1);
          }

          ctx.translate(-centerX, -centerY);

          // Draw the sprite at its actual size
          // Add 0.5px overlap to prevent white lines between tiles
          const overlap = 0.5;
          if (animMeta && animMeta.frameCount > 1) {
            drawAnimatedFrame(
              ctx,
              spriteImage,
              animMeta,
              originX,
              originY,
              actualWidth,
              actualHeight,
              nowMs,
              overlap
            );
          } else {
            ctx.drawImage(
              spriteImage,
              originX - overlap,
              originY - overlap,
              actualWidth + overlap * 2,
              actualHeight + overlap * 2
            );
          }

          ctx.restore();

          // Optional: Add a subtle border for better visibility
          if (showGrid) {
            ctx.strokeStyle = '#00000020';
            ctx.lineWidth = 1;
            ctx.strokeRect(originX, originY, actualWidth, actualHeight);
          }

          // Overlay port width area and side label for port markers
          if (asset.assetId === 'port_marker') {
            const matched = ports.find((p) => p.markerId === asset.id);
            if (matched && matched.side) {
              const label = matched.side;
              const color =
                label === 'N'
                  ? '#06b6d4'
                  : label === 'E'
                    ? '#22c55e'
                    : label === 'S'
                      ? '#ef4444'
                      : '#f59e0b'; // W

              // Draw highlight sized to widthTiles (tiles)
              const thicknessTiles = Math.max(
                1,
                Math.floor(matched.widthTiles || 1)
              );
              const centerX = originX + cellSize / 2;
              const centerY = originY + cellSize / 2;
              const rectW =
                label === 'N' || label === 'S'
                  ? thicknessTiles * cellSize
                  : cellSize;
              const rectH =
                label === 'N' || label === 'S'
                  ? cellSize
                  : thicknessTiles * cellSize;
              const rectX = Math.round(centerX - rectW / 2);
              const rectY = Math.round(centerY - rectH / 2);
              ctx.save();
              ctx.globalAlpha = 0.25;
              ctx.fillStyle = color;
              ctx.fillRect(rectX, rectY, rectW, rectH);
              ctx.globalAlpha = 1;
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.strokeRect(rectX + 0.5, rectY + 0.5, rectW - 1, rectH - 1);

              // Side label badge
              const boxW = 18;
              const boxH = 14;
              const boxX = rectX + rectW - boxW - 2;
              const boxY = rectY + 2;
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.9;
              ctx.fillRect(boxX, boxY, boxW, boxH);
              ctx.globalAlpha = 1;
              ctx.fillStyle = '#fff';
              ctx.font = `${Math.max(10, Math.floor(cellSize / 3))}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2);
              ctx.restore();
            }
          }
        } else {
          // Fallback to colored rectangle if image not loaded yet
          ctx.fillStyle = getAssetColor(asset.assetId);
          ctx.fillRect(originX + 1, originY + 1, cellSize - 2, cellSize - 2);

          // Draw loading indicator
          ctx.fillStyle = '#666';
          ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
          ctx.fillText(
            '...',
            originX + cellSize / 2 - 6,
            originY + cellSize / 2
          );

          // Even if sprite isn't loaded, render overlay for port markers
          if (asset.assetId === 'port_marker') {
            const matched = ports.find((p) => p.markerId === asset.id);
            if (matched && matched.side) {
              const label = matched.side;
              const color =
                label === 'N'
                  ? '#06b6d4'
                  : label === 'E'
                    ? '#22c55e'
                    : label === 'S'
                      ? '#ef4444'
                      : '#f59e0b';
              const thicknessTiles = Math.max(
                1,
                Math.floor(matched.widthTiles || 1)
              );
              const centerX = originX + cellSize / 2;
              const centerY = originY + cellSize / 2;
              const rectW =
                label === 'N' || label === 'S'
                  ? thicknessTiles * cellSize
                  : cellSize;
              const rectH =
                label === 'N' || label === 'S'
                  ? cellSize
                  : thicknessTiles * cellSize;
              const rectX = Math.round(centerX - rectW / 2);
              const rectY = Math.round(centerY - rectH / 2);
              ctx.save();
              ctx.globalAlpha = 0.25;
              ctx.fillStyle = color;
              ctx.fillRect(rectX, rectY, rectW, rectH);
              ctx.globalAlpha = 1;
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.strokeRect(rectX + 0.5, rectY + 0.5, rectW - 1, rectH - 1);
              const boxW = 18;
              const boxH = 14;
              const boxX = rectX + rectW - boxW - 2;
              const boxY = rectY + 2;
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.9;
              ctx.fillRect(boxX, boxY, boxW, boxH);
              ctx.globalAlpha = 1;
              ctx.fillStyle = '#fff';
              ctx.font = `${Math.max(10, Math.floor(cellSize / 3))}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2);
              ctx.restore();
            }
          }
        }
      }
    });

    // Selection highlight for selected assets
    if (selectedAssetIds.size > 0) {
      sortedAssets.forEach((asset) => {
        if (!selectedAssetIds.has(asset.id)) return;
        const baseTileX = asset.x * cellSize;
        const baseTileY = asset.y * cellSize;
        const pixelOffsetX = asset.offsetX ?? 0;
        const pixelOffsetY = asset.offsetY ?? 0;
        const originX = baseTileX + pixelOffsetX;
        const originY = baseTileY + pixelOffsetY;

        const dimensions = asset.sprite
          ? imageDimensions.get(asset.sprite)
          : undefined;
        const actualWidth = asset.isCharacter
          ? cellSize * 2
          : dimensions?.width || cellSize;
        const actualHeight = asset.isCharacter
          ? cellSize * 2
          : dimensions?.height || cellSize;

        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          originX + 0.5,
          originY + 0.5,
          actualWidth - 1,
          actualHeight - 1
        );
        ctx.restore();
      });
    }

    // Draw moving preview if any
    if (
      isMovingAsset &&
      movingAssetId &&
      movingPreview &&
      movingAssetRef.current
    ) {
      const moving = movingAssetRef.current;
      const previewGridX = movingPreview.gridX;
      const previewGridY = movingPreview.gridY;
      const allowsOverlap = doesPlacedAssetAllowOverlap(moving);
      const gameplayCritical = isPlacedAssetGameplayCritical(moving);
      const placementAllowsPixel =
        !snapToGrid && allowsOverlap && !gameplayCritical;
      const clampedMouseOffsetX = Math.min(
        cellSize - 1,
        Math.max(0, movingPreview.offsetX)
      );
      const clampedMouseOffsetY = Math.min(
        cellSize - 1,
        Math.max(0, movingPreview.offsetY)
      );
      const previewOffsetX = placementAllowsPixel ? clampedMouseOffsetX : 0;
      const previewOffsetY = placementAllowsPixel ? clampedMouseOffsetY : 0;
      const previewOriginX = previewGridX * cellSize + previewOffsetX;
      const previewOriginY = previewGridY * cellSize + previewOffsetY;

      // Validate placement for border color (skip for floors)
      let isValidPlacement = true;
      if (moving.category !== 'floors') {
        const movingAsItem = {
          id: moving.assetId,
          category: moving.category,
          sprite: moving.sprite,
          isEnemy: moving.isEnemy,
          enemyType: moving.enemyType,
          isCharacter: moving.isCharacter,
          isSpawnPoint: moving.isSpawnPoint,
          allowOverlap: moving.allowOverlap,
        } as AssetItem;
        const others = placedAssets.filter((a) => a.id !== moving.id);
        isValidPlacement = !checkCollision(
          previewGridX,
          previewGridY,
          movingAsItem,
          others,
          imageDimensions,
          cellSize,
          moving.rotation ?? 0,
          mapWidth,
          mapHeight
        );
      }

      ctx.save();
      ctx.globalAlpha = isValidPlacement ? 0.7 : 0.4;

      if (moving.isCharacter) {
        const spriteImage = loadedImages.get(moving.sprite || '');
        if (spriteImage) {
          ctx.save();
          const characterSize = cellSize * 2;
          const centerX = previewOriginX + characterSize / 2;
          const centerY = previewOriginY + characterSize / 2;
          ctx.translate(centerX, centerY);
          if (moving.rotation) ctx.rotate((moving.rotation * Math.PI) / 180);
          if (moving.flipX) ctx.scale(-1, 1);
          ctx.translate(-centerX, -centerY);
          ctx.drawImage(
            spriteImage,
            previewOriginX + 1,
            previewOriginY + 1,
            characterSize - 2,
            characterSize - 2
          );
          ctx.restore();
        } else {
          const characterSize = cellSize * 2;
          ctx.fillStyle = '#9333ea';
          ctx.fillRect(
            previewOriginX + 1,
            previewOriginY + 1,
            characterSize - 2,
            characterSize - 2
          );
        }
        if (showGrid) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = isValidPlacement ? '#9333ea' : '#ef4444';
          ctx.lineWidth = 2;
          const characterSize = cellSize * 2;
          ctx.strokeRect(
            previewOriginX + 1,
            previewOriginY + 1,
            characterSize - 2,
            characterSize - 2
          );
        }
      } else if (moving.isEnemy) {
        ctx.fillStyle = moving.enemyType === 'random' ? '#ff6b6b' : '#ff8c42';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + 2,
          cellSize - 4,
          cellSize - 4
        );
        ctx.globalAlpha = 1;
        const label =
          moving.enemyType === 'random'
            ? 'RND'
            : moving.enemyType?.substring(0, 3).toUpperCase() || 'ENM';
        ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + cellSize - 16,
          textWidth + 4,
          12
        );
        ctx.fillStyle = '#000';
        ctx.fillText(label, previewOriginX + 4, previewOriginY + cellSize - 6);
      } else if (moving.isSpawnPoint) {
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + 2,
          cellSize - 4,
          cellSize - 4
        );
        ctx.fillStyle = '#fff';
        const centerX = previewOriginX + cellSize / 2;
        const centerY = previewOriginY + cellSize / 2;
        const starSize = cellSize / 4;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * starSize;
          const y = centerY + Math.sin(angle) * starSize;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        const label = 'SPAWN';
        ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + cellSize - 16,
          textWidth + 4,
          12
        );
        ctx.fillStyle = '#000';
        ctx.fillText(label, previewOriginX + 4, previewOriginY + cellSize - 6);
      } else if (moving.sprite) {
        const spriteImage = loadedImages.get(moving.sprite);
        const dimensions = imageDimensions.get(moving.sprite);
        const animMeta = animatedSpriteMeta.get(moving.sprite);
        if (spriteImage && dimensions) {
          ctx.save();
          const actualWidth = dimensions.width || cellSize;
          const actualHeight = dimensions.height || cellSize;
          const centerX = previewOriginX + actualWidth / 2;
          const centerY = previewOriginY + actualHeight / 2;
          ctx.translate(centerX, centerY);
          if (moving.rotation) ctx.rotate((moving.rotation * Math.PI) / 180);
          if (moving.flipX) ctx.scale(-1, 1);
          ctx.translate(-centerX, -centerY);
          if (animMeta && animMeta.frameCount > 1) {
            drawAnimatedFrame(
              ctx,
              spriteImage,
              animMeta,
              previewOriginX,
              previewOriginY,
              actualWidth,
              actualHeight,
              nowMs
            );
          } else {
            ctx.drawImage(
              spriteImage,
              previewOriginX,
              previewOriginY,
              actualWidth,
              actualHeight
            );
          }
          ctx.restore();
          if (showGrid) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = isValidPlacement ? '#4ade80' : '#ef4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(
              previewOriginX,
              previewOriginY,
              actualWidth,
              actualHeight
            );
          }
        } else {
          ctx.fillStyle = getAssetColor(moving.assetId);
          ctx.fillRect(
            previewOriginX + 1,
            previewOriginY + 1,
            cellSize - 2,
            cellSize - 2
          );
        }
      }

      ctx.restore();
    }

    // Draw cursor preview (hidden while moving an existing asset or when marquee tool is active)
    if (
      mousePosition &&
      selectedAsset &&
      !isMovingAsset &&
      !isSelectionToolActive
    ) {
      ctx.save();

      // Check if placement would be valid
      const isValidPlacement =
        selectedAsset.category === 'floors' ||
        !checkCollision(
          mousePosition.gridX,
          mousePosition.gridY,
          selectedAsset,
          placedAssets,
          imageDimensions,
          cellSize,
          currentRotation,
          mapWidth,
          mapHeight
        );

      const placementAllowsPixel =
        !snapToGrid &&
        doesAssetItemAllowOverlap(selectedAsset) &&
        !isGameplayCriticalAsset(selectedAsset);

      const clampedMouseOffsetX = Math.min(
        cellSize - 1,
        Math.max(0, mousePosition.offsetX)
      );
      const clampedMouseOffsetY = Math.min(
        cellSize - 1,
        Math.max(0, mousePosition.offsetY)
      );

      const previewOffsetX = placementAllowsPixel ? clampedMouseOffsetX : 0;
      const previewOffsetY = placementAllowsPixel ? clampedMouseOffsetY : 0;
      const previewOriginX = mousePosition.gridX * cellSize + previewOffsetX;
      const previewOriginY = mousePosition.gridY * cellSize + previewOffsetY;

      ctx.globalAlpha = isValidPlacement ? 0.7 : 0.4; // More transparent if invalid

      if (selectedAsset.isCharacter) {
        // Draw character preview
        const spriteImage = loadedImages.get(selectedAsset.sprite || '');

        if (spriteImage) {
          ctx.save();

          // Apply transformations for preview
          const characterSize = cellSize * 2;
          const centerX = previewOriginX + characterSize / 2;
          const centerY = previewOriginY + characterSize / 2;

          ctx.translate(centerX, centerY);

          // Apply rotation
          if (currentRotation) {
            ctx.rotate((currentRotation * Math.PI) / 180);
          }

          // Apply horizontal flip for preview
          if (isOptionKeyPressed) {
            ctx.scale(-1, 1);
          }

          ctx.translate(-centerX, -centerY);

          ctx.drawImage(
            spriteImage,
            previewOriginX + 1,
            previewOriginY + 1,
            characterSize - 2,
            characterSize - 2
          );

          ctx.restore();
        } else {
          ctx.fillStyle = '#9333ea'; // Purple for characters
          const characterSize = cellSize * 2;
          ctx.fillRect(
            previewOriginX + 1,
            previewOriginY + 1,
            characterSize - 2,
            characterSize - 2
          );
        }

        // Add character border
        if (showGrid) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = isValidPlacement ? '#9333ea' : '#ef4444'; // Purple if valid, red if invalid
          ctx.lineWidth = 2;
          const characterSize = cellSize * 2;
          ctx.strokeRect(
            previewOriginX + 1,
            previewOriginY + 1,
            characterSize - 2,
            characterSize - 2
          );
        }
      } else if (selectedAsset.isEnemy) {
        // Draw enemy preview
        ctx.fillStyle =
          selectedAsset.enemyType === 'random' ? '#ff6b6b' : '#ff8c42';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + 2,
          cellSize - 4,
          cellSize - 4
        );

        // Draw enemy type label
        ctx.globalAlpha = 1;
        const label =
          selectedAsset.enemyType === 'random'
            ? 'RND'
            : selectedAsset.enemyType?.substring(0, 3).toUpperCase() || 'ENM';

        ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
        const textWidth = ctx.measureText(label).width;

        // White background for text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + cellSize - 16,
          textWidth + 4,
          12
        );

        // Black text
        ctx.fillStyle = '#000';
        ctx.fillText(label, previewOriginX + 4, previewOriginY + cellSize - 6);
      } else if (selectedAsset.isSpawnPoint) {
        // Draw spawn point preview
        ctx.fillStyle = '#00ff00'; // Bright green for spawn points
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + 2,
          cellSize - 4,
          cellSize - 4
        );

        // Draw spawn point icon (star shape) for preview
        ctx.fillStyle = '#fff';
        const centerX = previewOriginX + cellSize / 2;
        const centerY = previewOriginY + cellSize / 2;
        const starSize = cellSize / 4;

        // Draw a simple star shape
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * starSize;
          const y = centerY + Math.sin(angle) * starSize;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        // Draw spawn point label
        ctx.globalAlpha = 1;
        const label = 'SPAWN';
        ctx.font = `${Math.max(8, cellSize / 4)}px Arial`;
        const textWidth = ctx.measureText(label).width;

        // White background for text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(
          previewOriginX + 2,
          previewOriginY + cellSize - 16,
          textWidth + 4,
          12
        );

        // Black text
        ctx.fillStyle = '#000';
        ctx.fillText(label, previewOriginX + 4, previewOriginY + cellSize - 6);
      } else if (selectedAsset.sprite) {
        const spriteImage = loadedImages.get(selectedAsset.sprite);
        const dimensions = imageDimensions.get(selectedAsset.sprite);
        let animMeta = animatedSpriteMeta.get(selectedAsset.sprite);
        // No fallback inference; rely solely on provided frameCount metadata

        if (spriteImage && dimensions) {
          ctx.save();

          // Calculate actual display dimensions based on the image's actual size
          const actualWidth = dimensions.width || cellSize;
          const actualHeight = dimensions.height || cellSize;

          // Apply transformations for preview
          const centerX = previewOriginX + actualWidth / 2;
          const centerY = previewOriginY + actualHeight / 2;

          ctx.translate(centerX, centerY);

          // Apply rotation
          if (currentRotation) {
            ctx.rotate((currentRotation * Math.PI) / 180);
          }

          // Apply horizontal flip for preview
          if (isOptionKeyPressed) {
            ctx.scale(-1, 1);
          }

          ctx.translate(-centerX, -centerY);

          // Draw sprite preview at actual size
          if (animMeta && animMeta.frameCount > 1) {
            drawAnimatedFrame(
              ctx,
              spriteImage,
              animMeta,
              previewOriginX,
              previewOriginY,
              actualWidth,
              actualHeight,
              nowMs
            );
          } else {
            ctx.drawImage(
              spriteImage,
              previewOriginX,
              previewOriginY,
              actualWidth,
              actualHeight
            );
          }

          ctx.restore();

          // Draw border around the actual size
          if (showGrid) {
            ctx.strokeStyle = isValidPlacement ? '#4ade80' : '#ef4444'; // Green if valid, red if invalid
            ctx.lineWidth = 2;
            ctx.strokeRect(
              previewOriginX,
              previewOriginY,
              actualWidth,
              actualHeight
            );
          }
        } else {
          // Fallback preview
          ctx.fillStyle = getAssetColor(selectedAsset.id);
          ctx.fillRect(
            previewOriginX + 1,
            previewOriginY + 1,
            cellSize - 2,
            cellSize - 2
          );
        }
      }

      ctx.restore();
    }

    // Draw marquee selection rectangle
    if (
      isSelectionToolActive &&
      isSelecting &&
      selectionStart &&
      selectionEnd
    ) {
      const rect = getNormalizedSelectionRect(selectionStart, selectionEnd);
      const x = rect.minX * cellSize;
      const y = rect.minY * cellSize;
      const w = (rect.maxX - rect.minX + 1) * cellSize;
      const h = (rect.maxY - rect.minY + 1) * cellSize;
      ctx.save();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();
    }

    // Draw moving group preview as a bounding rectangle
    if (isMovingGroup && movingGroupRef.current && movingGroupPreviewTopLeft) {
      const snap = movingGroupRef.current;
      const x = movingGroupPreviewTopLeft.gridX * cellSize;
      const y = movingGroupPreviewTopLeft.gridY * cellSize;
      const w = snap.width * cellSize;
      const h = snap.height * cellSize;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = movingGroupIsValid
        ? 'rgba(34,197,94,0.18)'
        : 'rgba(239,68,68,0.18)';
      ctx.strokeStyle = movingGroupIsValid ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();
    }
  }, [
    mapWidth,
    mapHeight,
    placedAssets,
    cellSize,
    loadedImages,
    imageDimensions,
    mousePosition,
    selectedAsset,
    currentRotation,
    isOptionKeyPressed,
    showGrid,
    snapToGrid,
    isMovingAsset,
    movingAssetId,
    movingPreview,
    isPlacedAssetGameplayCritical,
    ports,
    selectedAssetIds,
    isSelecting,
    selectionStart,
    selectionEnd,
    getNormalizedSelectionRect,
    isMovingGroup,
    movingGroupPreviewTopLeft,
    movingGroupIsValid,
  ]);

  const getAssetColor = (assetId: string): string => {
    if (assetId.includes('grass')) return '#90EE90';
    if (assetId.includes('wall')) return '#8B4513';
    if (assetId.includes('tree')) return '#228B22';
    if (assetId.includes('rock')) return '#696969';
    if (assetId.includes('crystal')) return '#9370DB';
    if (assetId.includes('flower')) return '#FFB6C1';
    if (assetId.includes('earth')) return '#8B4513';
    if (assetId.includes('floor')) return '#D2B48C';
    return '#CCCCCC';
  };

  // Preload sprite images (use frameCount from assets to compute per-frame size)
  React.useEffect(() => {
    const imageMap = new Map<string, HTMLImageElement>();
    const dimensionsMap = new Map<string, { width: number; height: number }>();
    const animatedMeta = new Map<
      string,
      {
        frameWidth: number;
        frameHeight: number;
        frameCount: number;
        fps: number;
        orientation: 'horizontal' | 'vertical';
      }
    >();
    const loadPromises: Promise<void>[] = [];

    // Get all unique sprites from all categories
    const spriteInfoByName = new Map<
      string,
      { name: string; isCharacter: boolean }
    >();
    Object.values(ASSET_CATEGORIES).forEach((category) => {
      category.assets.forEach((asset) => {
        if (asset.sprite) {
          const existing = spriteInfoByName.get(asset.sprite);
          if (!existing) {
            spriteInfoByName.set(asset.sprite, {
              name: asset.sprite,
              isCharacter: !!asset.isCharacter,
            });
          }
        }
      });
    });

    // Load each sprite
    spriteInfoByName.forEach((spriteInfo) => {
      const promise = new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          if (spriteInfo.isCharacter) {
            // Extract first frame from character sprite sheet (idle_down frame 0)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = 100;
              canvas.height = 100;
              // Draw first frame (0,0) from the sprite sheet
              ctx.drawImage(img, 0, 0, 100, 100, 0, 0, 100, 100);

              // Trim transparent margins to reduce padding around the sprite
              const imageData = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
              );
              const { data, width, height } = imageData;
              let minX = width;
              let minY = height;
              let maxX = -1;
              let maxY = -1;
              const alphaThreshold = 8; // ignore near-transparent pixels
              for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                  const idx = (y * width + x) * 4 + 3;
                  const a = data[idx];
                  if (a > alphaThreshold) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                  }
                }
              }

              // If no opaque pixels found, fall back to full frame
              if (maxX < minX || maxY < minY) {
                minX = 0;
                minY = 0;
                maxX = width - 1;
                maxY = height - 1;
              }

              // Add a small padding and clamp
              const pad = 4;
              const sx = Math.max(0, minX - pad);
              const sy = Math.max(0, minY - pad);
              const sw = Math.min(width - sx, maxX - minX + 1 + pad * 2);
              const sh = Math.min(height - sy, maxY - minY + 1 + pad * 2);

              const trimmed = document.createElement('canvas');
              const tctx = trimmed.getContext('2d');
              if (tctx) {
                trimmed.width = sw;
                trimmed.height = sh;
                // Copy from the first-frame canvas instead of the full sheet
                tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
              }

              // Create a new image from the trimmed frame
              const frameImg = new Image();
              frameImg.onload = () => {
                imageMap.set(spriteInfo.name, frameImg);
                dimensionsMap.set(spriteInfo.name, {
                  width: sw,
                  height: sh,
                });
                resolve();
              };
              frameImg.src = trimmed.toDataURL();
            } else {
              resolve();
            }
          } else {
            imageMap.set(spriteInfo.name, img);
            const assetDef = Object.values(ASSET_CATEGORIES)
              .flatMap((c) => c.assets)
              .find((a) => a.sprite === spriteInfo.name);
            const frameCount = (assetDef as any)?.frameCount;
            const fps = 8;

            if (frameCount && frameCount > 1) {
              const totalW = img.naturalWidth;
              const totalH = img.naturalHeight;
              const orientation: 'horizontal' | 'vertical' =
                totalW >= totalH ? 'horizontal' : 'vertical';
              const frameWidth =
                orientation === 'horizontal'
                  ? Math.floor(totalW / frameCount)
                  : totalW;
              const frameHeight =
                orientation === 'horizontal'
                  ? totalH
                  : Math.floor(totalH / frameCount);

              dimensionsMap.set(spriteInfo.name, {
                width: frameWidth,
                height: frameHeight,
              });
              animatedMeta.set(spriteInfo.name, {
                frameWidth,
                frameHeight,
                frameCount,
                fps,
                orientation,
              });
            } else {
              dimensionsMap.set(spriteInfo.name, {
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }
            resolve();
          }
        };
        img.onerror = () => {
          console.warn(`Failed to load sprite: ${spriteInfo.name}`);
          resolve(); // Continue even if some sprites fail
        };
        // Use different folder based on sprite type
        img.src = spriteInfo.isCharacter
          ? `/sprites/character/${String(spriteInfo.name).toLowerCase()}`
          : `/sprites/env/${spriteInfo.name}`;
      });
      loadPromises.push(promise);
    });

    Promise.all(loadPromises).then(() => {
      setLoadedImages(imageMap);
      setImageDimensions(dimensionsMap);
      setAnimatedSpriteMeta(animatedMeta);
    });
  }, []);

  // Global mouse up handler to stop dragging even outside canvas
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setLastPlacedPosition(null);
      // End any active move even if mouseup occurs outside the canvas
      setIsMovingAsset(false);
      setMovingAssetId(null);
      setMovingPreview(null);
      movingAssetRef.current = null;
      movingGrabOffsetPxRef.current = null;
      // Also end marquee/group selection drags
      setIsSelecting(false);
      setIsMovingGroup(false);
      setMovingGroupPreviewTopLeft(null);
      movingGroupRef.current = null;
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  React.useEffect(() => {
    drawCanvas();
  }, [drawCanvas, animatedSpriteMeta]);

  // Animate canvas when we have any inferred animated metadata
  React.useEffect(() => {
    if (animatedSpriteMeta.size === 0) return;

    let rafId = 0;
    const tick = () => {
      drawCanvas();

      // Also update asset preview canvases
      const now = Date.now();
      assetPreviewCanvasRefs.current.forEach((canvases, assetSprite) => {
        const img = loadedImages.get(assetSprite);
        const meta = animatedSpriteMeta.get(assetSprite);
        if (!img || !meta) return;

        canvases.forEach((canvas) => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          if (canvas.width === 0 || canvas.height === 0) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width && rect.height) {
              canvas.width = rect.width;
              canvas.height = rect.height;
            }
          }

          // Preserve pixel-art crispness and aspect ratio for previews
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const containerW = canvas.width;
          const containerH = canvas.height;
          const scale = Math.min(
            containerW / Math.max(1, meta.frameWidth),
            containerH / Math.max(1, meta.frameHeight)
          );
          const destW = Math.round(meta.frameWidth * scale);
          const destH = Math.round(meta.frameHeight * scale);
          const dx = Math.floor((containerW - destW) / 2);
          const dy = Math.floor((containerH - destH) / 2);

          drawAnimatedFrame(ctx, img, meta, dx, dy, destW, destH, now);
        });
      });

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    drawCanvas,
    placedAssets,
    selectedAsset,
    loadedImages,
    animatedSpriteMeta,
  ]);

  const buildCurrentChunk = useCallback((): MapCluster => {
    const meta: MapMeta | undefined = (() => {
      const metaValue: MapMeta = {};
      if (mapOrientation) metaValue.orientation = mapOrientation;
      if (ports.length > 0)
        metaValue.ports = ports.map(
          ({ side, centerOffsetTiles, widthTiles }) => ({
            side,
            centerOffsetTiles,
            widthTiles,
          })
        );
      return Object.keys(metaValue).length > 0 ? metaValue : undefined;
    })();

    return {
      name: mapName || 'Untitled Map',
      width: mapWidth,
      height: mapHeight,
      instances: mapInstances,
      type: mapType,
      meta,
      assets: placedAssets.map((asset) => ({
        id: asset.id,
        assetId: asset.assetId,
        x: asset.x,
        y: asset.y,
        sprite: asset.sprite,
        isEnemy: asset.isEnemy,
        enemyType: asset.enemyType,
        isCharacter: asset.isCharacter,
        isSpawnPoint: asset.isSpawnPoint,
        category: asset.category,
        positionMode:
          asset.positionMode === 'pixel'
            ? 'pixel'
            : asset.positionMode === 'grid'
              ? 'grid'
              : undefined,
        offsetX:
          asset.positionMode === 'pixel' ? (asset.offsetX ?? 0) : undefined,
        offsetY:
          asset.positionMode === 'pixel' ? (asset.offsetY ?? 0) : undefined,
        allowOverlap:
          asset.allowOverlap ??
          (asset.assetId ? isOverlayAssetId(asset.assetId) : undefined),
      })),
    };
  }, [
    mapName,
    mapWidth,
    mapHeight,
    mapInstances,
    mapType,
    mapOrientation,
    ports,
    placedAssets,
  ]);

  const exportMap = useCallback(() => {
    if (mapType === 'none') {
      alert('Please select a Type (room or connector) before exporting.');
      return;
    }

    const config = buildCurrentChunk();
    setExportedJson(JSON.stringify(config, null, 2));
    setShowExportDialog(true);
  }, [buildCurrentChunk, mapType]);

  const importMap = useCallback(
    (jsonString: string) => {
      try {
        let text = jsonString;
        // Always attempt to expand TS helpers/functions into object literals first
        if (
          /\b(floor|wall|fillRangeWalls|fillRange)\s*\(/.test(text) ||
          /\.\.\.fillRange/.test(text)
        ) {
          text = transformTsFunctionsToObjects(text);
        }
        const parsed = parseJsonOrObjectLiteral<any>(text);

        // Accept either a full chunk or just an assets array
        const config: MapCluster = Array.isArray(parsed)
          ? {
              name: mapName || 'Imported Map',
              width: mapWidth,
              height: mapHeight,
              instances: mapInstances,
              type: mapType as MapClusterType,
              assets: parsed,
              meta: undefined,
            }
          : (parsed as MapCluster);

        setMapName(config.name);
        setMapWidth(config.width);
        setMapHeight(config.height);
        setMapInstances(config.instances ?? 0);
        setMapType((config.type as MapClusterType) || 'none');
        setMapOrientation(config.meta?.orientation);
        setPorts(
          Array.isArray(config.meta?.ports)
            ? (config.meta!.ports as MapPort[])
            : []
        );

        const editorAssets: PlacedAsset[] = (config.assets || []).map(
          (asset: any): PlacedAsset => {
            const positionMode: 'pixel' | undefined =
              asset.positionMode === 'pixel' ? 'pixel' : undefined;

            return {
              ...asset,
              positionMode,
              offsetX:
                positionMode === 'pixel' ? (asset.offsetX ?? 0) : undefined,
              offsetY:
                positionMode === 'pixel' ? (asset.offsetY ?? 0) : undefined,
              allowOverlap:
                asset.allowOverlap ??
                (asset.assetId ? isOverlayAssetId(asset.assetId) : undefined),
              zIndex: getAssetZIndex(asset.category, asset.assetId),
            } as PlacedAsset;
          }
        );

        updatePlacedAssets(editorAssets);
        setSelectedChunkName(null);
      } catch (error) {
        console.error('Import error:', error);
        alert('Invalid JSON/TS chunk or object literal');
      }
    },
    [updatePlacedAssets, mapName, mapWidth, mapHeight, mapInstances, mapType]
  );

  const loadChunkFromFile = useCallback(
    async (file: string, chunkName: string) => {
      setIsLoadingChunk(true);
      setChunksError(null);
      try {
        const response = await fetch(
          `/api/maps/${encodeURIComponent(file)}/chunk?name=${encodeURIComponent(chunkName)}`
        );
        const data = await parseJsonResponse<{ chunk: MapCluster }>(
          response,
          `Failed to load chunk "${chunkName}".`
        );
        importMap(JSON.stringify(data.chunk));
        setSelectedChunkName(data.chunk.name);
        if (selectedMapFile !== file) {
          setSelectedMapFile(file);
        }
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error ? error.message : 'Failed to load chunk.';
        setChunksError(message);
        alert(message);
      } finally {
        setIsLoadingChunk(false);
      }
    },
    [importMap, selectedMapFile]
  );

  const handleSaveToFile = useCallback(async () => {
    if (!selectedMapFile) {
      alert('Select a map file before saving.');
      return;
    }

    if (!mapName.trim()) {
      alert('Provide a chunk name before saving.');
      return;
    }

    if (mapType === 'none') {
      alert('Please select a Type (room or connector) before saving.');
      return;
    }

    const chunk = buildCurrentChunk();
    const payload: {
      chunk: MapCluster;
      previousName?: string;
    } = { chunk };

    if (selectedChunkName && selectedChunkName !== chunk.name) {
      payload.previousName = selectedChunkName;
    }

    setIsSavingToFile(true);
    try {
      const response = await fetch(
        `/api/maps/${encodeURIComponent(selectedMapFile)}/chunk`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await parseJsonResponse<{
        ok?: boolean;
        error?: string;
        updated?: boolean;
      }>(response, 'Failed to save chunk.');

      if (!data.ok) {
        alert(data.error || 'Failed to save chunk.');
        return;
      }

      alert('Chunk saved to file!');
      setSelectedChunkName(chunk.name);
      await refreshChunksForCurrentFile();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to save chunk.');
    } finally {
      setIsSavingToFile(false);
    }
  }, [
    selectedMapFile,
    mapName,
    mapType,
    buildCurrentChunk,
    selectedChunkName,
    refreshChunksForCurrentFile,
  ]);

  const clearMap = useCallback(() => {
    updatePlacedAssets((prev) => (prev.length ? [] : prev));
    setLastPlacedPosition(null);
  }, [updatePlacedAssets]);

  const fillMap = useCallback(() => {
    if (!selectedAsset) {
      alert('Please select an asset first!');
      return;
    }

    const selectedAllowsOverlap = doesAssetItemAllowOverlap(selectedAsset);

    // Prevent rapid successive calls
    const now = Date.now();
    if (now - lastFillMapCall.current < 500) {
      return;
    }
    lastFillMapCall.current = now;

    const newAssets: PlacedAsset[] = [];

    // Get dimensions for the selected asset
    const dimensions = selectedAsset.sprite
      ? imageDimensions.get(selectedAsset.sprite)
      : undefined;

    const width = selectedAsset.isCharacter
      ? cellSize * 2
      : dimensions?.width || cellSize;
    const height = selectedAsset.isCharacter
      ? cellSize * 2
      : dimensions?.height || cellSize;
    const cellsWide = Math.ceil(width / cellSize);
    const cellsHigh = Math.ceil(height / cellSize);

    // Account for rotation
    const isRotated = currentRotation === 90 || currentRotation === 270;
    const effectiveWidth = isRotated ? cellsHigh : cellsWide;
    const effectiveHeight = isRotated ? cellsWide : cellsHigh;

    // Try to place assets at each position
    for (let y = 0; y < mapHeight; y += effectiveHeight) {
      for (let x = 0; x < mapWidth; x += effectiveWidth) {
        // Check if asset would fit within map boundaries
        if (x + effectiveWidth > mapWidth || y + effectiveHeight > mapHeight) {
          continue;
        }

        // Skip collision check for floors since they can be placed under other objects
        if (selectedAsset.category !== 'floors') {
          // Check for collisions with existing objects
          if (
            checkCollision(
              x,
              y,
              selectedAsset,
              [...placedAssets, ...newAssets],
              imageDimensions,
              cellSize,
              currentRotation,
              mapWidth,
              mapHeight
            )
          ) {
            continue; // Skip this position due to collision
          }
        }

        const newAsset: PlacedAsset = {
          id: `fill_${selectedAsset.id}_${x}_${y}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          assetId: selectedAsset.id,
          x,
          y,
          sprite: selectedAsset.sprite,
          isEnemy: selectedAsset.isEnemy,
          enemyType: selectedAsset.enemyType,
          isCharacter: selectedAsset.isCharacter,
          isSpawnPoint:
            selectedAsset.isSpawnPoint || selectedAsset.id === 'player_spawn',
          rotation: currentRotation,
          flipX: isOptionKeyPressed,
          category: selectedAsset.category,
          width: dimensions?.width,
          height: dimensions?.height,
          zIndex: getAssetZIndex(selectedAsset.category, selectedAsset.id),
          allowOverlap: selectedAllowsOverlap,
        };
        newAssets.push(newAsset);
      }
    }

    if (newAssets.length > 0) {
      updatePlacedAssets((prev) => {
        // Create a set of all cells that will be occupied by new assets
        const occupiedCells = new Set<string>();

        newAssets.forEach((asset) => {
          const assetCells = getOccupiedCells(asset, cellSize);
          assetCells.forEach((cell) => {
            occupiedCells.add(`${cell.x},${cell.y}`);
          });
        });

        // Filter existing assets - only replace floors when placing floors
        const filteredAssets = prev.filter((asset) => {
          if (selectedAllowsOverlap) {
            return true;
          }

          // If placing floors, only remove existing floor tiles in those cells
          if (selectedAsset.category === 'floors') {
            // If the existing asset is not a floor, keep it
            if (asset.category !== 'floors') {
              return true;
            }

            if (doesPlacedAssetAllowOverlap(asset)) {
              return true;
            }

            // If it's a floor, only keep it if it doesn't overlap with new assets
            const assetCells = getOccupiedCells(asset, cellSize);
            return !assetCells.some((cell) =>
              occupiedCells.has(`${cell.x},${cell.y}`)
            );
          }

          // For non-floor items, preserve floors but remove conflicting non-floors
          const isExistingFloor = asset.category === 'floors';

          if (isExistingFloor) {
            return true; // Keep floors under non-floor objects
          }

          if (doesPlacedAssetAllowOverlap(asset)) {
            return true;
          }

          // Remove non-floor items that occupy any of our target cells
          const assetCells = getOccupiedCells(asset, cellSize);
          return !assetCells.some((cell) =>
            occupiedCells.has(`${cell.x},${cell.y}`)
          );
        });

        // Combine filtered assets with new assets and sort by z-index
        const allAssets = [...filteredAssets, ...newAssets];
        const sortedAssets = allAssets.sort(
          (a, b) => (a.zIndex || 0) - (b.zIndex || 0)
        );

        return areAssetListsEqual(prev, sortedAssets) ? prev : sortedAssets;
      });
    } else {
      alert('No valid positions found to fill with this asset.');
    }
  }, [
    selectedAsset,
    mapWidth,
    mapHeight,
    placedAssets,
    currentRotation,
    isOptionKeyPressed,
    imageDimensions,
    cellSize,
    updatePlacedAssets,
    areAssetListsEqual,
  ]);

  // Fill only empty cells with the selected floor tile (does not replace existing floors)
  const fillEmptyFloors = useCallback(() => {
    if (!selectedAsset || selectedAsset.category !== 'floors') {
      alert('Please select a floor asset first!');
      return;
    }

    // Prevent rapid successive calls
    const now = Date.now();
    if (now - lastFillMapCall.current < 500) {
      return;
    }
    lastFillMapCall.current = now;

    const newAssets: PlacedAsset[] = [];

    // Dimensions for selected floor asset
    const dimensions = selectedAsset.sprite
      ? imageDimensions.get(selectedAsset.sprite)
      : undefined;

    const width = dimensions?.width || cellSize;
    const height = dimensions?.height || cellSize;
    const cellsWide = Math.ceil(width / cellSize);
    const cellsHigh = Math.ceil(height / cellSize);

    const isRotated = currentRotation === 90 || currentRotation === 270;
    const effectiveWidth = isRotated ? cellsHigh : cellsWide;
    const effectiveHeight = isRotated ? cellsWide : cellsHigh;

    // Precompute existing floor assets for faster checks
    const existingFloors = placedAssets.filter((a) => a.category === 'floors');

    for (let y = 0; y < mapHeight; y += effectiveHeight) {
      for (let x = 0; x < mapWidth; x += effectiveWidth) {
        if (x + effectiveWidth > mapWidth || y + effectiveHeight > mapHeight) {
          continue;
        }

        // Candidate cells that would be covered by this placement
        const candidate: PlacedAsset = {
          id: 'candidate',
          assetId: selectedAsset.id,
          x,
          y,
          sprite: selectedAsset.sprite,
          isEnemy: false,
          isCharacter: false,
          isSpawnPoint: false,
          category: 'floors',
          rotation: currentRotation,
          flipX: false,
          width: dimensions?.width,
          height: dimensions?.height,
          zIndex: getAssetZIndex('floors', selectedAsset.id),
          allowOverlap: doesAssetItemAllowOverlap(selectedAsset),
        };
        const candidateCells = getOccupiedCells(candidate, cellSize);

        // If any candidate cell already has a floor tile, skip this placement
        let hasExistingFloor = false;
        for (const floor of existingFloors) {
          const floorCells = getOccupiedCells(floor, cellSize);
          if (
            candidateCells.some((c) =>
              floorCells.some((f) => f.x === c.x && f.y === c.y)
            )
          ) {
            hasExistingFloor = true;
            break;
          }
        }
        if (hasExistingFloor) continue;

        const newAsset: PlacedAsset = {
          id: `fill_empty_${selectedAsset.id}_${x}_${y}_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          assetId: selectedAsset.id,
          x,
          y,
          sprite: selectedAsset.sprite,
          isEnemy: false,
          enemyType: undefined,
          isCharacter: false,
          isSpawnPoint: false,
          rotation: currentRotation,
          flipX: isOptionKeyPressed,
          category: 'floors',
          width: dimensions?.width,
          height: dimensions?.height,
          zIndex: getAssetZIndex('floors', selectedAsset.id),
          allowOverlap: doesAssetItemAllowOverlap(selectedAsset),
        };

        newAssets.push(newAsset);
      }
    }

    if (newAssets.length > 0) {
      updatePlacedAssets((prev) => {
        const allAssets = [...prev, ...newAssets];
        const sortedAssets = allAssets.sort(
          (a, b) => (a.zIndex || 0) - (b.zIndex || 0)
        );
        return areAssetListsEqual(prev, sortedAssets) ? prev : sortedAssets;
      });
    } else {
      alert('No empty tiles found to fill with this floor.');
    }
  }, [
    selectedAsset,
    mapWidth,
    mapHeight,
    placedAssets,
    currentRotation,
    isOptionKeyPressed,
    imageDimensions,
    cellSize,
    updatePlacedAssets,
    areAssetListsEqual,
  ]);

  // Replace All (any asset → any asset)
  const openReplaceDialog = useCallback(() => {
    const allAssets = flattenedAssets.map((e) => e.asset);
    const defaultFrom = selectedAsset
      ? selectedAsset.id
      : allAssets[0]?.id || '';
    const defaultTo =
      allAssets.find((a) => a.id !== defaultFrom)?.id || defaultFrom;
    setReplaceFromAssetId(defaultFrom);
    setReplaceToAssetId(defaultTo);
    setShowReplaceDialog(true);
  }, [selectedAsset, flattenedAssets]);

  const replaceAllAssets = useCallback(() => {
    const fromId = replaceFromAssetId;
    const toId = replaceToAssetId;
    if (!fromId || !toId || fromId === toId) {
      setShowReplaceDialog(false);
      return;
    }

    // Resolve target asset definition across all categories
    const toEntry = flattenedAssets.find((e) => e.asset.id === toId);
    const toAsset = toEntry?.asset;
    const toCategory = (toAsset?.category ?? toEntry?.categoryKey) || 'special';
    const toAssetWithCategory = toAsset
      ? ({ ...toAsset, category: toCategory } as AssetItem)
      : undefined;
    const allowOverlap = doesAssetItemAllowOverlap(toAssetWithCategory);
    const toSprite = toAsset?.sprite;
    const dims = toSprite ? imageDimensions.get(toSprite) : undefined;

    updatePlacedAssets((prev) => {
      const matched = prev.filter((a) => a.assetId === fromId);
      if (matched.length === 0) return prev;

      let working = prev.filter((a) => a.assetId !== fromId);

      for (const m of matched) {
        const replacement: PlacedAsset = {
          id: `repl_${toId}_${m.x}_${m.y}_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          assetId: toId,
          x: m.x,
          y: m.y,
          sprite: toSprite,
          isEnemy: !!toAsset?.isEnemy,
          enemyType: toAsset?.enemyType,
          isCharacter: !!toAsset?.isCharacter,
          isSpawnPoint: !!(toAsset?.isSpawnPoint || toAsset?.id === 'player_spawn'),
          category: toCategory,
          rotation: m.rotation ?? 0,
          flipX: m.flipX ?? false,
          width: dims?.width,
          height: dims?.height,
          zIndex: getAssetZIndex(toCategory, toId),
          allowOverlap,
          positionMode: m.positionMode === 'pixel' ? 'pixel' : undefined,
          offsetX:
            m.positionMode === 'pixel'
              ? Math.max(0, Math.min(cellSize - 1, m.offsetX ?? 0))
              : undefined,
          offsetY:
            m.positionMode === 'pixel'
              ? Math.max(0, Math.min(cellSize - 1, m.offsetY ?? 0))
              : undefined,
        };

        // Bounds check: if replacement would exceed map bounds, keep original
        const newCells = getOccupiedCells(replacement, cellSize);
        const outOfBounds = newCells.some(
          (c) => c.x < 0 || c.y < 0 || c.x >= mapWidth || c.y >= mapHeight
        );
        if (outOfBounds) {
          working.push(m);
          continue;
        }

        if (!allowOverlap) {
          // Remove conflicting assets. Keep floors under non-floor replacements.
          working = working.filter((asset) => {
            if (asset.id === m.id) return false;

            const isExistingFloor = asset.category === 'floors';
            const isReplacementFloor = replacement.category === 'floors';
            if (isExistingFloor && !isReplacementFloor) {
              return true;
            }

            if (doesPlacedAssetAllowOverlap(asset)) {
              return true;
            }

            const cells = getOccupiedCells(asset, cellSize);
            const overlaps = cells.some((c) =>
              newCells.some((nc) => nc.x === c.x && nc.y === c.y)
            );

            // If both are floors, only remove overlapping floors
            if (isExistingFloor && isReplacementFloor) {
              return !overlaps;
            }

            // For non-floor conflicts, remove overlapping non-overlap assets
            return !overlaps;
          });
        }

        working.push(replacement);
      }

      // Ensure z-index ordering
      const sorted = working
        .map((a) => ({
          ...a,
          zIndex: a.zIndex ?? getAssetZIndex(a.category, a.assetId),
        }))
        .sort((a, b) => a.zIndex - b.zIndex);

      return sorted;
    });

    setShowReplaceDialog(false);
  }, [
    replaceFromAssetId,
    replaceToAssetId,
    flattenedAssets,
    imageDimensions,
    cellSize,
    updatePlacedAssets,
    mapWidth,
    mapHeight,
  ]);

  // Keyboard event handlers for rotation functionality and shortcuts
  React.useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select')
        return true;
      const contentEditable = (node as HTMLElement).isContentEditable;
      return !!contentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Disable editor hotkeys while the command palette is open
      if (isCommandPaletteOpen) {
        return;
      }

      // Ignore hotkeys when typing in editable elements
      if (isEditableTarget(event.target)) {
        return;
      }

      // Copy selection
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        if (selectedAssetIds.size > 0) {
          const selected = placedAssets.filter((a) =>
            selectedAssetIds.has(a.id)
          );
          if (selected.length > 0) {
            let minX = Number.POSITIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            selected.forEach((asset) => {
              const dimensions = asset.sprite
                ? imageDimensions.get(asset.sprite)
                : undefined;
              const width = asset.isCharacter
                ? cellSize * 2
                : dimensions?.width || cellSize;
              const height = asset.isCharacter
                ? cellSize * 2
                : dimensions?.height || cellSize;
              const cellsWide = Math.ceil(width / cellSize);
              const cellsHigh = Math.ceil(height / cellSize);
              const isRotated = asset.rotation === 90 || asset.rotation === 270;
              const effW = isRotated ? cellsHigh : cellsWide;
              const effH = isRotated ? cellsWide : cellsHigh;
              minX = Math.min(minX, asset.x);
              minY = Math.min(minY, asset.y);
              maxX = Math.max(maxX, asset.x + effW - 1);
              maxY = Math.max(maxY, asset.y + effH - 1);
            });
            const width = Math.max(1, maxX - minX + 1);
            const height = Math.max(1, maxY - minY + 1);
            setCopyBuffer({
              assets: selected.map((a) => ({ ...a })),
              minX,
              minY,
              width,
              height,
            });
          }
        }
        return;
      }

      // Paste at mouse position or top-left
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (!copyBuffer) return;

        const targetGridX = mousePosition
          ? Math.min(
              Math.max(0, mousePosition.gridX),
              Math.max(0, mapWidth - copyBuffer.width)
            )
          : 0;
        const targetGridY = mousePosition
          ? Math.min(
              Math.max(0, mousePosition.gridY),
              Math.max(0, mapHeight - copyBuffer.height)
            )
          : 0;

        const newAssets: PlacedAsset[] = [];
        for (const src of copyBuffer.assets) {
          const dx = src.x - copyBuffer.minX;
          const dy = src.y - copyBuffer.minY;
          const nextX = targetGridX + dx;
          const nextY = targetGridY + dy;

          // Compute effective size for bounds check
          const widthPx = src.isCharacter
            ? cellSize * 2
            : src.width ||
              (src.sprite
                ? imageDimensions.get(src.sprite)?.width
                : undefined) ||
              cellSize;
          const heightPx = src.isCharacter
            ? cellSize * 2
            : src.height ||
              (src.sprite
                ? imageDimensions.get(src.sprite)?.height
                : undefined) ||
              cellSize;
          const cellsWide = Math.ceil(widthPx / cellSize);
          const cellsHigh = Math.ceil(heightPx / cellSize);
          const isRot =
            (src.rotation ?? 0) === 90 || (src.rotation ?? 0) === 270;
          const effW = isRot ? cellsHigh : cellsWide;
          const effH = isRot ? cellsWide : cellsHigh;

          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX + effW > mapWidth ||
            nextY + effH > mapHeight
          ) {
            continue; // skip out-of-bounds
          }

          const id = `paste_${src.assetId}_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 6)}`;

          newAssets.push({
            ...src,
            id,
            x: nextX,
            y: nextY,
          });
        }

        if (newAssets.length > 0) {
          updatePlacedAssets((prev) => {
            // Build occupied cells sets for filtering
            const floorTargetCells = new Set<string>();
            const nonFloorTargetCells = new Set<string>();
            for (const a of newAssets) {
              const cells = getOccupiedCells(a, cellSize);
              const target =
                a.category === 'floors'
                  ? floorTargetCells
                  : nonFloorTargetCells;
              if (!(a.allowOverlap ?? false)) {
                cells.forEach((c) => target.add(`${c.x},${c.y}`));
              }
            }

            const filtered = prev.filter((asset) => {
              // Keep floors under non-floor pastes; remove only if also pasting floors over them
              if (asset.category === 'floors') {
                if (doesPlacedAssetAllowOverlap(asset)) return true;
                const cells = getOccupiedCells(asset, cellSize);
                return !cells.some((c) =>
                  floorTargetCells.has(`${c.x},${c.y}`)
                );
              }

              // Non-floors: remove if a non-overlap pasted non-floor conflicts
              if (doesPlacedAssetAllowOverlap(asset)) return true;
              const cells = getOccupiedCells(asset, cellSize);
              return !cells.some((c) =>
                nonFloorTargetCells.has(`${c.x},${c.y}`)
              );
            });

            const combined = [...filtered, ...newAssets].map((a) => ({
              ...a,
              zIndex: a.zIndex ?? getAssetZIndex(a.category, a.assetId),
            }));
            combined.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            return combined;
          });
          // Select newly pasted assets
          setSelectedAssetIds(new Set(newAssets.map((a) => a.id)));
        }
        return;
      }

      // Cut selection: copy then delete (Cmd/Ctrl+X)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        // Reuse copy logic
        if (selectedAssetIds.size > 0) {
          const selected = placedAssets.filter((a) =>
            selectedAssetIds.has(a.id)
          );
          if (selected.length > 0) {
            let minX = Number.POSITIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            selected.forEach((asset) => {
              const dimensions = asset.sprite
                ? imageDimensions.get(asset.sprite)
                : undefined;
              const width = asset.isCharacter
                ? cellSize * 2
                : dimensions?.width || cellSize;
              const height = asset.isCharacter
                ? cellSize * 2
                : dimensions?.height || cellSize;
              const cellsWide = Math.ceil(width / cellSize);
              const cellsHigh = Math.ceil(height / cellSize);
              const isRotated = asset.rotation === 90 || asset.rotation === 270;
              const effW = isRotated ? cellsHigh : cellsWide;
              const effH = isRotated ? cellsWide : cellsHigh;
              minX = Math.min(minX, asset.x);
              minY = Math.min(minY, asset.y);
              maxX = Math.max(maxX, asset.x + effW - 1);
              maxY = Math.max(maxY, asset.y + effH - 1);
            });
            const width = Math.max(1, maxX - minX + 1);
            const height = Math.max(1, maxY - minY + 1);
            setCopyBuffer({
              assets: selected.map((a) => ({ ...a })),
              minX,
              minY,
              width,
              height,
            });

            // Delete selected assets from the map
            updatePlacedAssets((prev) =>
              prev.filter((a) => !selectedAssetIds.has(a.id))
            );
            // Keep the selection set (now empty on canvas) to allow immediate paste; alternatively clear:
            setSelectedAssetIds(new Set());
            // Clear frozen/focus box if any
            setIsSelectionFrozen(false);
            setSelectionFrozenBounds(null);
          }
        }
        return;
      }

      // Undo / Redo
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey
      ) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (
        ((event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === 'z') ||
        (event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'y')
      ) {
        event.preventDefault();
        handleRedo();
        return;
      }

      // Deselect all (Cmd/Ctrl+Shift+A)
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        setSelectedAssetIds(new Set());
        setIsSelecting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }

      // Toggle marquee tool with M (and clear selection when turning off)
      if (
        event.key.toLowerCase() === 'm' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setIsSelectionToolActive((prev) => {
          const next = !prev;
          setIsSelecting(false);
          setSelectionStart(null);
          setSelectionEnd(null);
          if (!next) {
            setSelectedAssetIds(new Set());
            setIsMovingGroup(false);
            setMovingGroupPreviewTopLeft(null);
            movingGroupRef.current = null;
          }
          return next;
        });
        return;
      }

      // Handle rotation with Shift key
      if (event.shiftKey && event.type === 'keydown') {
        event.preventDefault(); // Prevent browser shortcuts
        setCurrentRotation((prev) => (prev + 90) % 360);
      }

      // Handle flip with Option/Alt key
      if (event.altKey) {
        event.preventDefault();
        setIsOptionKeyPressed(true);
      }

      // Handle clear map with C key
      if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        clearMap();
      }

      // Handle fill map with F key
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        fillMap();
      }

      // Delete selected assets
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedAssetIds.size > 0) {
          event.preventDefault();
          updatePlacedAssets((prev) =>
            prev.filter((a) => !selectedAssetIds.has(a.id))
          );
          setSelectedAssetIds(new Set());
        }
      }

      // Do not use Escape (reserved by fullscreen); add deselect combo below instead
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      // Reset flip when Option/Alt key is released
      if (!event.altKey) {
        setIsOptionKeyPressed(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [clearMap, fillMap, isCommandPaletteOpen]);

  const downloadJson = useCallback(() => {
    const blob = new Blob([exportedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapName || 'map'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportedJson, mapName]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyRef.current.length - 1;

  const sidebarControls: Array<{
    key: string;
    label: string;
    aria: string;
    onClick: () => void;
    icon: React.ReactNode;
    variant?:
      | 'default'
      | 'destructive'
      | 'outline'
      | 'secondary'
      | 'ghost'
      | 'link';
    disabled?: boolean;
    className?: string;
  }> = [
    {
      key: 'marquee',
      label: isSelectionToolActive ? 'Exit Marquee' : 'Marquee Select',
      aria: isSelectionToolActive ? 'Exit Marquee' : 'Marquee Select',
      onClick: () => {
        setIsSelectionToolActive((prev) => {
          const next = !prev;
          // Always stop an in-progress selection drag
          setIsSelecting(false);
          setSelectionStart(null);
          setSelectionEnd(null);
          // When exiting marquee mode, clear any existing selection/groups
          if (!next) {
            setSelectedAssetIds(new Set());
            setIsMovingGroup(false);
            setMovingGroupPreviewTopLeft(null);
            movingGroupRef.current = null;
          }
          return next;
        });
      },
      icon: <GridIcon className="h-4 w-4" />,
      variant: 'outline',
      className: isSelectionToolActive ? '' : 'opacity-50',
    },
    {
      key: 'fullscreen',
      label: isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen',
      aria: isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen',
      onClick: toggleFullscreen,
      icon: isFullscreen ? (
        <Minimize className="h-4 w-4" />
      ) : (
        <Maximize className="h-4 w-4" />
      ),
      variant: 'outline',
    },
    {
      key: 'grid',
      label: showGrid ? 'Hide Grid' : 'Show Grid',
      aria: showGrid ? 'Hide Grid' : 'Show Grid',
      onClick: () => setShowGrid(!showGrid),
      icon: <GridIcon className="h-4 w-4" />,
      variant: 'outline',
      className: showGrid ? '' : 'opacity-50',
    },
    {
      key: 'snap',
      label: snapToGrid ? 'Turn Snap Off' : 'Turn Snap On',
      aria: snapToGrid ? 'Turn Snap Off' : 'Turn Snap On',
      onClick: () => setSnapToGrid((prev) => !prev),
      icon: <Magnet className="h-4 w-4" />,
      variant: 'outline',
      className: snapToGrid ? '' : 'opacity-50',
    },
    {
      key: 'undo',
      label: 'Undo',
      aria: 'Undo',
      onClick: handleUndo,
      icon: <Undo2 className="h-4 w-4" />,
      variant: 'outline',
      disabled: !canUndo,
    },
    {
      key: 'redo',
      label: 'Redo',
      aria: 'Redo',
      onClick: handleRedo,
      icon: <Redo2 className="h-4 w-4" />,
      variant: 'outline',
      disabled: !canRedo,
    },
    {
      key: 'clear',
      label: 'Clear Map',
      aria: 'Clear Map',
      onClick: clearMap,
      icon: <Eraser className="h-4 w-4" />,
      variant: 'outline',
    },
    {
      key: 'fill-empty',
      label: 'Fill Empty',
      aria: 'Fill Empty',
      onClick: fillEmptyFloors,
      icon: <PaintBucket className="h-4 w-4" />,
      variant: 'outline',
      disabled:
        isSelectionToolActive ||
        !(selectedAsset && selectedAsset.category === 'floors'),
    },
    {
      key: 'fill',
      label: 'Fill Map',
      aria: 'Fill Map',
      onClick: fillMap,
      icon: <PaintBucket className="h-4 w-4" />,
      variant: 'outline',
      disabled: isSelectionToolActive || !selectedAsset,
    },
    {
      key: 'replace',
      label: 'Replace All',
      aria: 'Replace All',
      onClick: openReplaceDialog,
      icon: <ArrowRightLeft className="h-4 w-4" />,
      variant: 'outline',
      disabled: false,
    },
    {
      key: 'export',
      label: 'Export JSON',
      aria: 'Export JSON',
      onClick: exportMap,
      icon: <Download className="h-4 w-4" />,
      disabled: mapType === 'none',
    },
    {
      key: 'import',
      label: 'Import JSON',
      aria: 'Import JSON',
      onClick: () => setShowImportDialog(true),
      icon: <Upload className="h-4 w-4" />,
      variant: 'outline',
    },
  ];

  return (
    <>
      <CommandDialog
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
      >
        <CommandInput
          value={paletteSearchValue}
          onValueChange={setPaletteSearchValue}
          placeholder="Search assets by name, id, or sprite..."
        />
        <CommandList>
          <CommandEmpty>No assets found.</CommandEmpty>
          {groupedResults.map((group, index) => (
            <React.Fragment key={group.categoryKey}>
              <CommandGroup heading={group.categoryName}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.asset.id}
                    value={`${item.asset.id} ${item.asset.name}`}
                    onSelect={() => handlePaletteSelect(item)}
                  >
                    <div className="flex w-full items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white">
                        {item.asset.isEnemy ? (
                          <div
                            className={`flex h-full w-full items-center justify-center text-xs font-bold ${
                              item.asset.enemyType === 'random'
                                ? 'bg-red-400 text-white'
                                : 'bg-orange-400 text-white'
                            }`}
                          >
                            {item.asset.enemyType === 'random'
                              ? 'R'
                              : item.asset.enemyType?.charAt(0).toUpperCase()}
                          </div>
                        ) : item.asset.isSpawnPoint ? (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold bg-green-500 text-white">
                            ★
                          </div>
                        ) : item.asset.sprite ? (
                          item.asset.isCharacter &&
                          loadedImages.get(item.asset.sprite) ? (
                            <img
                              src={loadedImages.get(item.asset.sprite)!.src}
                              alt={item.asset.name}
                              className="h-full w-full object-contain"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : animatedSpriteMeta.has(item.asset.sprite) ? (
                            <canvas
                              ref={createAssetPreviewRef(item.asset.sprite)}
                              className="h-full w-full"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : (
                            <img
                              src={
                                item.asset.isCharacter
                                  ? `/sprites/character/${String(item.asset.sprite).toLowerCase()}`
                                  : `/sprites/env/${item.asset.sprite}`
                              }
                              alt={item.asset.name}
                              className="h-full w-full object-cover"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          )
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center text-xs font-bold"
                            style={{
                              backgroundColor: getAssetColor(item.asset.id),
                            }}
                          >
                            {item.asset.id.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <span className="truncate text-sm font-medium text-black">
                          {item.asset.name}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="truncate">{item.asset.id}</span>
                          {item.asset.isEnemy && item.asset.enemyType && (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-orange-700">
                              Enemy: {item.asset.enemyType}
                            </span>
                          )}
                          {item.asset.isCharacter && (
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                              Character
                            </span>
                          )}
                          {item.asset.isSpawnPoint && (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700">
                              Spawn
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-gray-600">
                        {group.categoryName}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {index < groupedResults.length - 1 && <CommandSeparator />}
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
      <div
        ref={containerRef}
        className="flex h-screen bg-gray-50 text-black font-mono"
        style={
          {
            color: '#000',
            '--foreground': '0 0% 0%',
            '--background': '0 0% 100%',
            '--card': '0 0% 100%',
            '--card-foreground': '0 0% 0%',
            '--primary': '0 0% 9%',
            '--primary-foreground': '0 0% 98%',
            '--secondary': '0 0% 96.1%',
            '--secondary-foreground': '0 0% 9%',
            '--muted': '0 0% 96.1%',
            '--muted-foreground': '0 0% 45.1%',
            '--accent': '0 0% 96.1%',
            '--accent-foreground': '0 0% 9%',
            '--border': '0 0% 89.8%',
            '--input': '0 0% 89.8%',
          } as React.CSSProperties
        }
      >
        {/* Asset Selector Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto text-black">
          <div className="p-4">
            <h2 className="text-xl font-bold mb-4 text-black">Map Editor</h2>

            <details className="mb-6 rounded-md border border-gray-200 bg-white">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-black">
                Author Templates
              </summary>
              <div className="px-3 pb-3 pt-0">
                <AuthorTemplatesPanel
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  setMapWidth={setMapWidth}
                  setMapHeight={setMapHeight}
                  setMapType={setMapType}
                  setMapOrientation={setMapOrientation}
                  placedAssets={placedAssets}
                  updatePlacedAssets={updatePlacedAssets}
                  setPorts={setPorts}
                  onPreviewRegenerated={refreshChunksForCurrentFile}
                />
              </div>
            </details>

            {/* Map Controls */}
            <details
              className="mb-6 rounded-md border border-gray-200 bg-white"
              open
            >
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-black">
                Map Information
              </summary>
              <div className="space-y-4 px-3 pb-3 pt-0">
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">
                    Chunk Name
                  </label>
                  <input
                    type="text"
                    value={mapName}
                    onChange={(e) => setMapName(e.target.value)}
                    placeholder="Enter chunk name..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-black">
                    Type
                  </label>
                  <select
                    value={mapType}
                    onChange={(e) =>
                      setMapType(e.target.value as MapClusterType)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                  >
                    <option value="none">none</option>
                    <option value="room">room</option>
                    <option value="connector">connector</option>
                  </select>
                </div>

                <div className="flex items-end gap-4 flex-nowrap overflow-x-auto">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium mb-1">
                      Width
                    </label>
                    <input
                      type="number"
                      value={mapWidth}
                      onChange={(e) =>
                        setMapWidth(
                          Math.max(
                            5,
                            Math.min(200, parseInt(e.target.value) || 5)
                          )
                        )
                      }
                      min={5}
                      max={200}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium mb-1">
                      Height
                    </label>
                    <input
                      type="number"
                      value={mapHeight}
                      onChange={(e) =>
                        setMapHeight(
                          Math.max(
                            5,
                            Math.min(200, parseInt(e.target.value) || 5)
                          )
                        )
                      }
                      min={5}
                      max={200}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium mb-1 text-black">
                      Instances
                    </label>
                    <input
                      type="number"
                      value={mapInstances}
                      onChange={(e) =>
                        setMapInstances(
                          Math.max(0, parseInt(e.target.value) || 0)
                        )
                      }
                      min={0}
                      max={100}
                      placeholder="0 = infinite"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  0 = infinite instances, ≥1 = limited instances
                </p>

                {/* Connector Orientation (for connectors) */}
                {mapType === 'connector' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-black">
                      Connector Orientation
                    </label>
                    <select
                      value={mapOrientation || ''}
                      onChange={(e) =>
                        setMapOrientation(
                          (e.target.value as MapMeta['orientation']) ||
                            undefined
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    >
                      <option value="">auto (infer from name)</option>
                      <option value="h">horizontal</option>
                      <option value="v">vertical</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-600">
                      Optional. Used by generator when the name doesn&apos;t
                      include &quot;horizontal/vertical&quot;.
                    </p>
                  </div>
                )}

                {/* Ports Editor */}
                <div className="rounded-md border border-gray-200">
                  <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-black">
                      Ports
                    </span>
                    <button
                      className="text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                      onClick={() => {
                        const defaultSide: MapPort['side'] = 'N';
                        const centerDefault = Math.round(mapWidth / 2);
                        setPorts((prev) => [
                          ...prev,
                          {
                            side: defaultSide,
                            centerOffsetTiles: centerDefault,
                            widthTiles: 4,
                          },
                        ]);
                      }}
                    >
                      + Add Port
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {ports.length === 0 ? (
                      <p className="text-xs text-gray-600">
                        No ports. Rooms without matching neighbor ports may not
                        connect.
                      </p>
                    ) : (
                      ports.map((port, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-12 gap-2 items-end"
                        >
                          <div className="col-span-4">
                            <label className="block text-xs mb-1 text-black">
                              Side
                            </label>
                            <select
                              value={(port.side || 'N') as MapPort['side']}
                              onChange={(e) => {
                                const side = e.target.value as MapPort['side'];
                                setPorts((prev) =>
                                  prev.map((p, i) =>
                                    i === index
                                      ? {
                                          ...p,
                                          side,
                                          centerOffsetTiles:
                                            side === 'N' || side === 'S'
                                              ? Math.round(mapWidth / 2)
                                              : Math.round(mapHeight / 2),
                                        }
                                      : p
                                  )
                                );
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                            >
                              <option value="N">N</option>
                              <option value="E">E</option>
                              <option value="S">S</option>
                              <option value="W">W</option>
                            </select>
                          </div>
                          <div className="col-span-4">
                            <label className="block text-xs mb-1 text-black">
                              Center Offset (tiles)
                            </label>
                            <input
                              type="number"
                              value={port.centerOffsetTiles}
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  parseInt(e.target.value) || 0
                                );
                                setPorts((prev) =>
                                  prev.map((p, i) =>
                                    i === index
                                      ? { ...p, centerOffsetTiles: val }
                                      : p
                                  )
                                );
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs mb-1 text-black">
                              Width (tiles)
                            </label>
                            <input
                              type="number"
                              value={port.widthTiles}
                              onChange={(e) => {
                                const val = Math.max(
                                  1,
                                  parseInt(e.target.value) || 1
                                );
                                setPorts((prev) =>
                                  prev.map((p, i) =>
                                    i === index ? { ...p, widthTiles: val } : p
                                  )
                                );
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <button
                              aria-label="Remove Port"
                              className="text-xs rounded border border-gray-300 px-2 py-2 hover:bg-gray-50"
                              onClick={() =>
                                setPorts((prev) =>
                                  prev.filter((_, i) => i !== index)
                                )
                              }
                            >
                              ✕
                            </button>
                          </div>
                          <div className="col-span-12 flex items-center justify-between">
                            {(() => {
                              const hasMarker = !!port.markerId;
                              const marker = placedAssets.find(
                                (a) => a.id === port.markerId
                              );
                              const doneMsg = `Center set${marker ? ` from marker at (${marker.x},${marker.y})` : ''} — side ${port.side}, width ${port.widthTiles}, offset ${port.centerOffsetTiles}`;
                              return (
                                <div
                                  className={`text-[11px] ${hasMarker ? 'text-green-700' : 'text-gray-600'}`}
                                >
                                  {hasMarker
                                    ? doneMsg
                                    : "Place a 'Port Marker (editor)' tile on the edge and click to set center automatically."}
                                </div>
                              );
                            })()}
                            <button
                              className="text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                              onClick={() => {
                                const markers = placedAssets.filter(
                                  (a) => a.assetId === 'port_marker'
                                );
                                if (markers.length === 0) {
                                  alert(
                                    'Place a Port Marker on the map first.'
                                  );
                                  return;
                                }
                                // Prefer markers on the relevant edge; otherwise fall back to first
                                const onEdge = markers.filter((m) => {
                                  if (port.side === 'N') return m.y === 0;
                                  if (port.side === 'S')
                                    return m.y === mapHeight - 1;
                                  if (port.side === 'W') return m.x === 0;
                                  if (port.side === 'E')
                                    return m.x === mapWidth - 1;
                                  return false;
                                });
                                const chosen = onEdge[0] || markers[0];
                                const nextOffset =
                                  port.side === 'N' || port.side === 'S'
                                    ? chosen.x
                                    : chosen.y;
                                setPorts((prev) =>
                                  prev.map((p, i) =>
                                    i === index
                                      ? {
                                          ...p,
                                          centerOffsetTiles: nextOffset,
                                          markerId: chosen.id,
                                        }
                                      : p
                                  )
                                );
                              }}
                            >
                              {port.markerId
                                ? 'Update from Port Marker'
                                : 'Set from Port Marker'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                    <p className="text-[11px] text-gray-500">
                      Tip: Only one port per side is used for connection. Extra
                      ports on the same side are ignored by the generator.
                    </p>
                  </div>
                </div>

                {/* Canvas controls moved to main viewport header */}
              </div>
            </details>

            {/* Category Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Asset Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(ASSET_CATEGORIES).map(([key, category]) => (
                  <option key={key} value={key}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Asset List */}
            <div ref={assetListContainerRef} className="space-y-2">
              <Button
                variant="outline"
                onClick={() => setIsCommandPaletteOpen(true)}
                className="flex w-full items-center justify-between gap-2 border-gray-300 bg-white text-sm font-normal text-gray-600 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  Search assets...
                </span>
                <span className="text-xs text-gray-400">⌘K</span>
              </Button>

              <div className="grid grid-cols-4 gap-2 mt-4">
                {ASSET_CATEGORIES[
                  selectedCategory as keyof typeof ASSET_CATEGORIES
                ]?.assets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => {
                      setSelectedAsset({
                        ...asset,
                        category: selectedCategory,
                      });
                      setCurrentRotation(0);
                      if ((selectedAssetSlug ?? '') !== asset.id) {
                        void setSelectedAssetSlug(asset.id);
                      }
                    }}
                    data-asset-id={asset.id}
                    className={`group rounded-lg border transition-colors ${
                      selectedAsset?.id === asset.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }${
                      highlightedAssetId === asset.id
                        ? ' ring-2 ring-blue-300 ring-offset-1 ring-offset-white'
                        : ''
                    }`}
                    style={{ color: '#000' }}
                  >
                    <div className="flex items-center justify-center aspect-square overflow-hidden rounded">
                      {asset.isEnemy ? (
                        <div
                          className={`w-full h-full flex items-center justify-center text-xs font-bold ${
                            asset.enemyType === 'random'
                              ? 'bg-red-400 text-white'
                              : 'bg-orange-400 text-white'
                          }`}
                        >
                          {asset.enemyType === 'random'
                            ? 'R'
                            : asset.enemyType?.charAt(0).toUpperCase()}
                        </div>
                      ) : asset.isSpawnPoint ? (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-green-500 text-white">
                          ★
                        </div>
                      ) : asset.sprite ? (
                        asset.isCharacter && loadedImages.get(asset.sprite) ? (
                          <img
                            src={loadedImages.get(asset.sprite)!.src}
                            alt={asset.name}
                            className="w-full h-full object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : animatedSpriteMeta.has(asset.sprite) ? (
                          <canvas
                            ref={createAssetPreviewRef(asset.sprite)}
                            className="w-full h-full"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ) : (
                          <img
                            src={
                              asset.isCharacter
                                ? `/sprites/character/${String(asset.sprite).toLowerCase()}`
                                : `/sprites/env/${asset.sprite}`
                            }
                            alt={asset.name}
                            className="w-full h-full object-cover"
                            style={{ imageRendering: 'pixelated' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: getAssetColor(asset.id) }}
                        >
                          {asset.id.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Map Canvas */}
        <div className="flex-1 min-w-0 p-4 overflow-hidden">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
            <div className="mb-4">
              <Tooltip.Provider delayDuration={200} skipDelayDuration={150}>
                <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:gap-2 md:overflow-x-auto">
                  {sidebarControls.map((ctrl) => (
                    <TooltipButton key={ctrl.key} label={ctrl.label}>
                      <Button
                        aria-label={ctrl.aria}
                        onClick={ctrl.onClick}
                        variant={ctrl.variant || 'default'}
                        size="icon"
                        disabled={ctrl.disabled}
                        className={ctrl.className + '!font-mono'}
                      >
                        {ctrl.icon}
                      </Button>
                    </TooltipButton>
                  ))}
                </div>
              </Tooltip.Provider>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <div className="border border-gray-300 inline-block">
                <canvas
                  ref={canvasRef}
                  width={mapWidth * cellSize}
                  height={mapHeight * cellSize}
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onContextMenu={handleAssetRightClick}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className={
                    isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
                  }
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Export Dialog */}
        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
          <DialogContent className="max-w-2xl font-mono">
            <DialogHeader>
              <DialogTitle>Export Map Configuration</DialogTitle>
            </DialogHeader>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                JSON Configuration
              </label>
              <textarea
                value={exportedJson}
                onChange={(e) => setExportedJson(e.target.value)}
                className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm bg-white text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Map JSON will appear here..."
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void handleSaveToFile()}
                disabled={!selectedMapFile || !mapName.trim() || isSavingToFile}
              >
                {isSavingToFile ? 'Saving...' : 'Save to file'}
              </Button>
              <Button onClick={downloadJson}>Download JSON</Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(exportedJson);
                  alert('JSON copied to clipboard!');
                }}
              >
                Copy to Clipboard
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    const ts = generateTsFromState({
                      name: mapName || 'Untitled Map',
                      width: mapWidth,
                      height: mapHeight,
                      instances: mapInstances,
                      type: mapType,
                      assets: placedAssets,
                      meta: (() => {
                        const m: MapMeta = {};
                        if (mapOrientation) m.orientation = mapOrientation;
                        if (ports.length > 0)
                          m.ports = ports.map(
                            ({ side, centerOffsetTiles, widthTiles }) => ({
                              side,
                              centerOffsetTiles,
                              widthTiles,
                            })
                          );
                        return Object.keys(m).length > 0 ? m : undefined;
                      })(),
                    });
                    navigator.clipboard.writeText(ts);
                    alert('TS chunk copied to clipboard!');
                  } catch (e) {
                    console.error(e);
                    alert('Failed to generate TS output');
                  }
                }}
              >
                Copy TS (floor/wall)
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Replace Assets Dialog */}
        <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
          <DialogContent className="max-w-md font-mono">
            <DialogHeader>
              <DialogTitle>Replace Assets</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-black">
                  Replace from
                </label>
                <select
                  value={replaceFromAssetId}
                  onChange={(e) => setReplaceFromAssetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {flattenedAssets.map((entry) => (
                    <option key={entry.asset.id} value={entry.asset.id}>
                      {entry.asset.name} ({entry.asset.id}) —{' '}
                      {entry.categoryName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-black">
                  Replace with
                </label>
                <select
                  value={replaceToAssetId}
                  onChange={(e) => setReplaceToAssetId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                >
                  {flattenedAssets.map((entry) => (
                    <option key={entry.asset.id} value={entry.asset.id}>
                      {entry.asset.name} ({entry.asset.id}) —{' '}
                      {entry.categoryName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>Replace all matching placed assets across the map.</span>
                <span>
                  {replaceFromAssetId === replaceToAssetId &&
                    'Choose different assets'}
                </span>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={replaceAllAssets}
                  disabled={
                    !replaceFromAssetId ||
                    !replaceToAssetId ||
                    replaceFromAssetId === replaceToAssetId
                  }
                >
                  Replace All
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowReplaceDialog(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent className="max-w-2xl font-mono">
            <DialogHeader>
              <DialogTitle>Import Map Configuration</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div
                className="flex flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 hover:border-gray-400"
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = (reader.result as string) || '';
                    setImportText(text);
                  };
                  reader.readAsText(file);
                }}
              >
                <p className="mb-2">Drag & drop a JSON file here</p>
                <div className="flex items-center gap-2">
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept="application/json,.json,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = (reader.result as string) || '';
                        setImportText(text);
                      };
                      reader.readAsText(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => importFileInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Paste JSON (optional)
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm bg-white text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste map JSON here..."
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    if (!importText.trim()) {
                      alert('Please provide JSON via file or paste.');
                      return;
                    }
                    importMap(importText);
                    setShowImportDialog(false);
                    setImportText('');
                  }}
                >
                  Import
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
