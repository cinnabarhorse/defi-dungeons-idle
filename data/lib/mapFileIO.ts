import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface MapChunkPort {
  side: 'N' | 'S' | 'E' | 'W';
  centerOffsetTiles: number;
  widthTiles: number;
  [key: string]: unknown;
}

export interface MapChunkMeta {
  orientation?: 'h' | 'v';
  ports?: MapChunkPort[];
  [key: string]: unknown;
}

export interface MapChunkAsset {
  id?: string;
  assetId: string;
  x: number;
  y: number;
  sprite?: string;
  category: string;
  [key: string]: unknown;
}

export interface MapChunk {
  name: string;
  width: number;
  height: number;
  instances: number;
  type?: string;
  meta?: MapChunkMeta;
  assets: MapChunkAsset[];
  [key: string]: unknown;
}

const MAPS_SUBPATH = ['data', 'maps'];
const DEFAULT_EXPORT_IDENTIFIER = 'CHUNKS';

let cachedWorkspaceRoot: string | null = null;
let cachedMapsDir: string | null = null;

export interface MapFileSummary {
  file: string;
  title: string;
  chunkCount?: number;
}

export interface ParsedMapFile {
  file: string;
  filePath: string;
  exportIdentifier?: string;
  chunks: MapChunk[];
  order: string[];
}

export interface PersistOptions {
  file: string;
  exportIdentifier?: string;
  chunks: MapChunk[];
  order?: string[];
}

export class MapFileError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const tryPaths = (dir: string): string[] => {
  const paths: string[] = [];
  let current = dir;
  // Walk up to the filesystem root so deeply nested cwd values (e.g. Next route workers)
  // still discover the shared data/maps directory.
  while (true) {
    paths.push(path.join(current, ...MAPS_SUBPATH));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return paths;
};

const resolveMapsDirectory = (): string => {
  if (cachedMapsDir) return cachedMapsDir;

  const explicitRoot =
    process.env.GOTCHIVERSE_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT;
  const candidates: string[] = [];

  if (explicitRoot) {
    candidates.push(path.resolve(explicitRoot, ...MAPS_SUBPATH));
  }

  for (const candidate of tryPaths(process.cwd())) {
    candidates.push(candidate);
  }

  // Prefer a maps directory that contains authoring folders like bodies/
  const existing = candidates.filter((c) => existsSync(c));
  if (existing.length > 0) {
    const preferred = existing.find((c) => existsSync(path.join(c, 'bodies')));
    const chosen = preferred || existing[0];
    cachedMapsDir = chosen;
    cachedWorkspaceRoot = path.dirname(path.dirname(chosen));
    return chosen;
  }

  throw new Error(
    `Unable to locate data/maps directory from ${process.cwd()}. Tried: ${candidates.join(', ')}`
  );
};

export const getWorkspaceRoot = (): string => {
  // Validate cached value still points to a maps dir with authoring folders
  if (cachedWorkspaceRoot) {
    const mapsDir = path.resolve(cachedWorkspaceRoot, ...MAPS_SUBPATH);
    const looksValid =
      existsSync(mapsDir) && existsSync(path.join(mapsDir, 'bodies'));
    if (looksValid) return cachedWorkspaceRoot;
    cachedWorkspaceRoot = null;
    cachedMapsDir = null;
  }
  const mapsDir = resolveMapsDirectory();
  cachedWorkspaceRoot = path.dirname(path.dirname(mapsDir));
  return cachedWorkspaceRoot;
};

const sanitizeFileName = (file: string): string => {
  const decoded = decodeURIComponent(file);
  if (!decoded.endsWith('.ts')) {
    throw new MapFileError(400, 'Only .ts map files are supported.');
  }
  if (
    decoded.includes('..') ||
    decoded.includes('/') ||
    decoded.includes('\\')
  ) {
    throw new MapFileError(400, 'Invalid map file path.');
  }
  return decoded;
};

const deriveTitleFromFile = (file: string): string => {
  const base = file.replace(/\.ts$/i, '');
  const withoutPrefix = base.replace(/^chunks[-_]?/i, '');
  const parts = (withoutPrefix || base)
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
  return parts.join(' ') || base;
};

const stripJsLikeWrapper = (input: string): string => {
  const withoutBom = input.replace(/^\uFEFF/, '');
  const withoutImports = withoutBom.replace(
    /^[\t ]*import\s+[^\n;]+;?[\t ]*$/gm,
    ''
  );
  const withoutLeadingExportOrAssign = withoutImports.replace(
    /^\s*(export\s+default|module\.exports\s*=|(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*)/,
    ''
  );
  const withoutAnyExportAssign = withoutLeadingExportOrAssign.replace(
    /\bexport\s+(?:const|let|var)\s+\w+\s*=\s*/g,
    ''
  );
  const withoutTrailingSemicolon = withoutAnyExportAssign.replace(/;?\s*$/, '');
  const withoutBlockComments = withoutTrailingSemicolon.replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );
  const withoutLineComments = withoutBlockComments.replace(
    /(^|[^:])\/\/.*$/gm,
    '$1'
  );
  return withoutLineComments.trim();
};

const transformTsFunctionsToObjects = (input: string): string => {
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
          const spritePath =
            sprite ||
            (isWall ? `walls/${id}.png` : `floors/cyberkawaii/${id}.png`);
          const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
          out.push(
            `({ id: '${isWall ? 'wall' : 'floor'}_${safeId}_${x}_${y}', assetId: '${id}', x: ${x}, y: ${y}, sprite: '${spritePath}', category: '${
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
      const spritePath = sprite || `floors/cyberkawaii/${id}.png`;
      const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
      return `({ id: 'floor_${safeId}_${x}_${y}', assetId: '${id}', x: ${x}, y: ${y}, sprite: '${spritePath}', category: 'floors', allowOverlap: false })`;
    }
  );

  const withWalls = withFloors.replace(
    /wall\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\s*,?\s*\)/g,
    (_m, x, y, id, sprite) => {
      const spritePath = sprite || `walls/${id}.png`;
      const safeId = String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
      return `({ id: 'wall_${safeId}_${x}_${y}', assetId: '${id}', x: ${x}, y: ${y}, sprite: '${spritePath}', category: 'walls', allowOverlap: false })`;
    }
  );

  return withWalls;
};

const parseJsonOrObjectLiteral = <T>(input: string): T => {
  try {
    return JSON.parse(input) as T;
  } catch {
    // fall through to tolerant parser
  }

  const sanitized = stripJsLikeWrapper(input);

  try {
    // eslint-disable-next-line no-new-func
    const parsed = new Function('"use strict"; return (' + sanitized + ')')();
    return parsed as T;
  } catch (error) {
    throw new MapFileError(
      400,
      `Unable to parse map file: ${(error as Error).message}`
    );
  }
};

const detectExportIdentifier = (source: string): string | undefined => {
  const exportConst = source.match(
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/
  );
  if (exportConst) return exportConst[1];
  const defaultAssign = source.match(/export\s+default\s+([A-Za-z0-9_]+)/);
  if (defaultAssign) return defaultAssign[1];
  return undefined;
};

const parseSourceToChunks = (
  source: string,
  sanitized: string,
  filePath: string
): ParsedMapFile => {
  const exportIdentifier =
    detectExportIdentifier(source) || DEFAULT_EXPORT_IDENTIFIER;
  const transformed = transformTsFunctionsToObjects(source);
  const parsed = parseJsonOrObjectLiteral<unknown>(transformed);

  if (!Array.isArray(parsed)) {
    throw new MapFileError(400, 'Map file must export an array of chunks.');
  }

  const chunks = parsed.map(normalizeChunk);
  const order = chunks.map((chunk) => chunk.name);

  return {
    exportIdentifier,
    chunks,
    order,
    filePath,
    file: sanitized,
  };
};

const toPlainObject = (
  value: Record<string, unknown> | undefined
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  if (!value) return result;
  for (const key of Object.keys(value)) {
    result[key] = (value as Record<string, unknown>)[key];
  }
  return result;
};

const normalizePort = (port: any): MapChunkPort => {
  if (!port || typeof port !== 'object') {
    throw new MapFileError(400, 'Invalid port entry in chunk meta.');
  }
  return {
    side: port.side,
    centerOffsetTiles: Number(port.centerOffsetTiles ?? 0),
    widthTiles: Number(port.widthTiles ?? 0),
  } as MapChunkPort;
};

const normalizeMeta = (meta: any): MapChunkMeta | undefined => {
  if (!meta || typeof meta !== 'object') return undefined;
  const cleanMeta: MapChunkMeta = {};
  if (meta.orientation) cleanMeta.orientation = meta.orientation;
  if (Array.isArray(meta.ports)) {
    cleanMeta.ports = meta.ports.map(normalizePort);
  }
  return Object.keys(cleanMeta).length > 0 ? cleanMeta : undefined;
};

const normalizePlacedAsset = (asset: any): MapChunkAsset => {
  if (!asset || typeof asset !== 'object') {
    throw new MapFileError(
      400,
      'Encountered invalid asset entry while parsing chunk.'
    );
  }
  const copy = toPlainObject(asset);
  if (copy.x !== undefined) copy.x = Number(copy.x);
  if (copy.y !== undefined) copy.y = Number(copy.y);
  if (copy.rotation !== undefined) copy.rotation = Number(copy.rotation);
  if (copy.width !== undefined) copy.width = Number(copy.width);
  if (copy.height !== undefined) copy.height = Number(copy.height);
  if (copy.offsetX !== undefined) copy.offsetX = Number(copy.offsetX);
  if (copy.offsetY !== undefined) copy.offsetY = Number(copy.offsetY);
  if (copy.zIndex !== undefined) copy.zIndex = Number(copy.zIndex);
  if (copy.allowOverlap !== undefined)
    copy.allowOverlap = Boolean(copy.allowOverlap);
  if (copy.isEnemy !== undefined) copy.isEnemy = Boolean(copy.isEnemy);
  if (copy.isCharacter !== undefined)
    copy.isCharacter = Boolean(copy.isCharacter);
  if (copy.isSpawnPoint !== undefined)
    copy.isSpawnPoint = Boolean(copy.isSpawnPoint);
  // Auto-heal enemy metadata when authoring omitted flags
  try {
    const category = String(copy.category || '');
    if (category === 'enemies') {
      if (copy.isEnemy === undefined) copy.isEnemy = true;
      if (!copy.enemyType && typeof copy.assetId === 'string') {
        copy.enemyType = copy.assetId;
      }
    }
  } catch {
    // ignore
  }
  return copy as unknown as MapChunkAsset;
};

const normalizeChunk = (chunk: any): MapChunk => {
  if (!chunk || typeof chunk !== 'object') {
    throw new MapFileError(400, 'Map file must export chunk objects.');
  }

  if (typeof chunk.name !== 'string' || chunk.name.trim() === '') {
    throw new MapFileError(400, 'All chunks must include a string name.');
  }

  const name = chunk.name;
  const width = Number(chunk.width ?? 0);
  const height = Number(chunk.height ?? 0);
  const instances = Number(chunk.instances ?? 0);
  const type = chunk.type ? String(chunk.type) : undefined;
  const meta = normalizeMeta(chunk.meta);
  const assetsSource = Array.isArray(chunk.assets) ? chunk.assets : [];
  const assets = assetsSource.map(normalizePlacedAsset);

  return {
    name,
    width,
    height,
    instances,
    type,
    meta,
    assets,
  } as MapChunk;
};

const indentBlock = (text: string, spaces: number): string => {
  const pad = ' '.repeat(Math.max(0, spaces));
  return text
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
};

const toSerializableMeta = (
  meta: MapChunkMeta | undefined
): MapChunkMeta | undefined => {
  if (!meta) return undefined;
  if (!meta.orientation && (!meta.ports || meta.ports.length === 0)) {
    return undefined;
  }
  const clean: MapChunkMeta = {};
  if (meta.orientation) clean.orientation = meta.orientation;
  if (meta.ports && meta.ports.length > 0) {
    clean.ports = meta.ports.map((port) => ({
      side: port.side,
      centerOffsetTiles: port.centerOffsetTiles,
      widthTiles: port.widthTiles,
    }));
  }
  return clean;
};

const toSerializableAsset = (asset: MapChunkAsset): Record<string, unknown> => {
  const ordered: Record<string, unknown> = {};
  if (asset.id) ordered.id = asset.id;
  ordered.assetId = asset.assetId;
  ordered.x = asset.x;
  ordered.y = asset.y;
  if (asset.sprite) ordered.sprite = asset.sprite;
  if (asset.positionMode) ordered.positionMode = asset.positionMode;
  if (typeof asset.offsetX === 'number') ordered.offsetX = asset.offsetX;
  if (typeof asset.offsetY === 'number') ordered.offsetY = asset.offsetY;
  if (asset.isEnemy) ordered.isEnemy = true;
  if (asset.enemyType) ordered.enemyType = asset.enemyType;
  if (asset.isCharacter) ordered.isCharacter = true;
  if (asset.isSpawnPoint) ordered.isSpawnPoint = true;
  ordered.category = asset.category;
  if (typeof asset.rotation === 'number') ordered.rotation = asset.rotation;
  if (asset.flipX) ordered.flipX = true;
  if (typeof asset.width === 'number') ordered.width = asset.width;
  if (typeof asset.height === 'number') ordered.height = asset.height;
  if (typeof asset.zIndex === 'number') ordered.zIndex = asset.zIndex;
  if (typeof asset.allowOverlap === 'boolean')
    ordered.allowOverlap = asset.allowOverlap;
  return ordered;
};

const toSerializableChunk = (chunk: MapChunk): Record<string, unknown> => {
  const ordered: Record<string, unknown> = {};
  ordered.name = chunk.name;
  ordered.width = chunk.width;
  ordered.height = chunk.height;
  ordered.instances = chunk.instances;
  if (chunk.type) ordered.type = chunk.type;
  const meta = toSerializableMeta(chunk.meta);
  if (meta) ordered.meta = meta;
  ordered.assets = chunk.assets.map(toSerializableAsset);
  return ordered;
};

export const listMapFiles = async (): Promise<MapFileSummary[]> => {
  const mapsDir = resolveMapsDirectory();
  const entries = await fs.readdir(mapsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const summaries: MapFileSummary[] = files.map((file) => ({
    file,
    title: deriveTitleFromFile(file),
  }));

  return summaries;
};

export const readMapFile = async (file: string): Promise<ParsedMapFile> => {
  const sanitized = sanitizeFileName(file);
  const mapsDir = resolveMapsDirectory();

  const filePath = path.join(mapsDir, sanitized);

  if (process.env.DEBUG_MAP_FILES === '1') {
    console.log('mapsDir', mapsDir);
    console.log('filePath', filePath);
  }

  let source: string;
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MapFileError(404, `Map file ${sanitized} not found.`);
    }
    throw error;
  }

  return parseSourceToChunks(source, sanitized, filePath);
};

export const normalizeChunkInput = (chunk: unknown): MapChunk =>
  normalizeChunk(chunk);

export const readMapFileSync = (file: string): ParsedMapFile => {
  const sanitized = sanitizeFileName(file);
  const mapsDir = resolveMapsDirectory();
  const filePath = path.join(mapsDir, sanitized);

  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MapFileError(404, `Map file ${sanitized} not found.`);
    }
    throw error;
  }

  return parseSourceToChunks(source, sanitized, filePath);
};

export const persistMapFile = async ({
  file,
  exportIdentifier,
  chunks,
  order,
}: PersistOptions): Promise<void> => {
  const sanitized = sanitizeFileName(file);
  const mapsDir = resolveMapsDirectory();
  const filePath = path.join(mapsDir, sanitized);

  const existingOrder =
    order && order.length > 0 ? order : chunks.map((c) => c.name);

  const orderSet = new Set(existingOrder);
  const orderedNames: string[] = [];
  for (const name of existingOrder) {
    if (orderSet.has(name) && chunks.some((chunk) => chunk.name === name)) {
      orderedNames.push(name);
    }
  }
  const remaining = chunks
    .map((chunk) => chunk.name)
    .filter((name) => !orderedNames.includes(name))
    .sort((a, b) => a.localeCompare(b));

  const finalNames = [...orderedNames, ...remaining];
  const chunkByName = new Map(chunks.map((chunk) => [chunk.name, chunk]));
  const orderedChunks = finalNames
    .map((name) => chunkByName.get(name))
    .filter((chunk): chunk is MapChunk => Boolean(chunk));

  const serializedChunks = orderedChunks.map((chunk) =>
    indentBlock(JSON.stringify(toSerializableChunk(chunk), null, 2), 2)
  );

  const exportName = exportIdentifier || DEFAULT_EXPORT_IDENTIFIER;
  const content = `export const ${exportName} = [\n${serializedChunks.join(',\n')}\n];\n`;

  await fs.writeFile(filePath, content, 'utf8');
};
