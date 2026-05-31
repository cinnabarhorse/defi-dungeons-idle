// Type-only import to avoid runtime dependency during preview rendering
import type { EntitySchema as EntitySchemaType } from '../schemas';
import { EntitySchema } from '../schemas';
import { GAME_CONFIG } from '../lib/constants';
import { createEnemySpawn } from '../data/enemies';
import { EntityKind } from '../types';
import { OBSTACLE_CONFIGS } from '../data/obstacles';
import { itemTypes, slugifyWearableName } from '../data/wearables';

// Import server-local inventory types (generated from client)
import type { InventoryItem } from '../types';
import { loadDefaultMapChunks } from 'src/data/maps-loader';

// Server-specific item state interface using client types
export interface ItemState {
  type: InventoryItem['type'];
  name: string;
  quantity: number;
  rarity: InventoryItem['rarity'];
  // Optional wearable-specific properties
  wearableId?: number;
  wearableSlug?: string;
  slot?: string;
  quality?: 'broken' | 'budget' | 'average' | 'excellent' | 'flawless';
  qualityScore?: number;
  durabilityScore?: number;
  stats?: {
    AGG?: number;
    NRG?: number;
    SPK?: number;
    BRN?: number;
  };
  // For items with custom sprites
  spriteId?: number;
}

// Chunk asset interface
export interface ChunkAsset {
  id: string;
  assetId: string;
  x: number;
  y: number;
  sprite?: string;
  category: string;
  isEnemy?: boolean;
  enemyType?: string;
  isCharacter?: boolean;
  isSpawnPoint?: boolean;
  rotation?: number;
  flipX?: boolean;
  width?: number;
  height?: number;
  zIndex?: number;
  // Optional pixel-precise placement from the map editor
  positionMode?: 'grid' | 'pixel';
  offsetX?: number;
  offsetY?: number;
}

// Chunk interface
export interface Chunk {
  name: string;
  width: number;
  height: number;
  instances: number;
  // Optional priority for placement and selection order (default: 'low')
  priority?: 'high' | 'low';
  // Dungeon-only metadata (optional)
  type?: 'room' | 'connector' | string;
  assets: ChunkAsset[];
  // Optional metadata for dungeon generation
  meta?: {
    role?: 'room' | 'connector' | 'intersection';
    orientation?: 'h' | 'v';
    ports?: Array<ChunkPort>;
    weight?: number;
    tags?: string[];
    family?: string;
    familyInstances?: number;
  };
}

// Port description to align corridors between neighboring cells
export interface ChunkPort {
  side: 'N' | 'S' | 'E' | 'W';
  centerOffsetTiles: number; // from left/top edge to port center, in tiles
  widthTiles: number; // opening width in tiles
}

export interface MapTile {
  x: number;
  y: number;
  solid: boolean;
  type: 'grass' | 'stone' | 'water' | 'tree';
}

// Lazy runtime import for EntitySchema; falls back to a stub when unavailable (e.g., preview script)
let EntitySchemaInstance: { new (): any };
try {
  EntitySchemaInstance = EntitySchema;
} catch (_) {
  EntitySchemaInstance = class {
    id = '';
    kind: any;
    x = 0;
    y = 0;
    state = '';
  } as any;
}

type ChunkSets = {
  dungeon: Chunk[];
  grass: Chunk[];
  staging?: Chunk[];
};

const WEARABLE_QUALITY_THRESHOLDS = [
  { quality: 'broken', threshold: 0.1 },
  { quality: 'budget', threshold: 0.4 },
  { quality: 'average', threshold: 0.8 },
  { quality: 'excellent', threshold: 1 },
] as const;

type WearableQuality =
  | (typeof WEARABLE_QUALITY_THRESHOLDS)[number]['quality']
  | 'flawless';

const WEARABLE_DURABILITY_BOUNDS: Record<WearableQuality, [number, number]> = {
  broken: [50, 250],
  budget: [250, 500],
  average: [450, 700],
  excellent: [650, 900],
  flawless: [900, 1000],
};

export class MapGenerator {
  private seed: number;
  private width: number;
  private height: number;
  private spawnPoints: Array<{ x: number; y: number }> = [];
  private tiles: MapTile[][];
  private worldWidth: number;
  private worldHeight: number;
  private selectedChunks: Chunk[];
  // Tiles that have explicit floor from chunk assets (world tile coordinates)
  private floorBitmap: Uint8Array;
  private floorBitmapWidth: number;
  private floorBitmapHeight: number;
  private readonly DEFAULT_CORRIDOR_WIDTH_TILES = 4;
  private chunkSets: ChunkSets;
  // Base cell dimensions (in tiles) for dungeon chunk placement; used to
  // center smaller chunks (e.g., 24x24) within a larger grid cell (e.g., 40x40)
  private baseCellWidthTiles: number | null = null;
  private baseCellHeightTiles: number | null = null;

  constructor(
    seed: number,
    width = GAME_CONFIG.MAP_WIDTH,
    height = GAME_CONFIG.MAP_HEIGHT,
    difficultyTier: string = 'normal',
    chunkSets?: ChunkSets
  ) {
    this.seed = seed;
    this.width = width;
    this.height = height;
    this.worldWidth = GAME_CONFIG.WORLD_WIDTH;
    this.worldHeight = GAME_CONFIG.WORLD_HEIGHT;
    this.tiles = [];
    this.chunkSets = chunkSets || MapGenerator.getDefaultChunkSets();
    this.selectedChunks = this.selectChunkSetByDifficulty(difficultyTier);
    this.floorBitmapWidth = this.width;
    this.floorBitmapHeight = this.height;
    this.floorBitmap = new Uint8Array(
      this.floorBitmapWidth * this.floorBitmapHeight
    );
  }

  private static getDefaultChunkSets(): ChunkSets {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires

      const sets = loadDefaultMapChunks() as Record<string, Chunk[]>;
      return {
        dungeon: (sets.dungeon as Chunk[]) || [],
        grass: (sets.grass as Chunk[]) || [],
        staging: (sets.staging as Chunk[]) || [],
      };
    } catch {
      return { dungeon: [], grass: [] } as ChunkSets;
    }
  }

  /**
   * Returns the pixel dimensions of a single chunk for the current selection.
   * Assumes a uniform cell size of GAME_CONFIG.TILE_SIZE.
   */
  getChunkPixelSize(): { widthPx: number; heightPx: number } {
    const cellSize = GAME_CONFIG.TILE_SIZE;
    const first =
      this.selectedChunks?.find((chunk) => chunk.type !== 'stamp') ||
      this.selectedChunks?.[0];
    if (!first) {
      // Fallback to a sane default if chunks are unavailable
      return { widthPx: 20 * cellSize, heightPx: 20 * cellSize };
    }
    return {
      widthPx: first.width * cellSize,
      heightPx: first.height * cellSize,
    };
  }

  /** Return a copy of the recorded floor tiles (keys: "tx,ty"). Note: O(n) scan. */
  getFloorTiles(): Set<string> {
    const result = new Set<string>();
    for (let ty = 0; ty < this.floorBitmapHeight; ty++) {
      for (let tx = 0; tx < this.floorBitmapWidth; tx++) {
        const idx = this.getFloorIndex(tx, ty);
        if (this.floorBitmap[idx] === 1) result.add(`${tx},${ty}`);
      }
    }
    return result;
  }

  private getFloorIndex(tx: number, ty: number): number {
    return ty * this.floorBitmapWidth + tx;
  }

  private setFloorTileAt(tx: number, ty: number): void {
    if (
      tx < 0 ||
      ty < 0 ||
      tx >= this.floorBitmapWidth ||
      ty >= this.floorBitmapHeight
    ) {
      return;
    }
    this.floorBitmap[this.getFloorIndex(tx, ty)] = 1;
  }

  /** Set all floor tiles within an inclusive rectangle in tile coordinates. */
  private setFloorRect(
    txStart: number,
    tyStart: number,
    txEnd: number,
    tyEnd: number
  ): void {
    const minTx = Math.max(0, Math.min(txStart, txEnd));
    const maxTx = Math.min(this.floorBitmapWidth - 1, Math.max(txStart, txEnd));
    const minTy = Math.max(0, Math.min(tyStart, tyEnd));
    const maxTy = Math.min(
      this.floorBitmapHeight - 1,
      Math.max(tyStart, tyEnd)
    );

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        this.setFloorTileAt(tx, ty);
      }
    }
  }

  public hasFloorTile(tx: number, ty: number): boolean {
    if (
      tx < 0 ||
      ty < 0 ||
      tx >= this.floorBitmapWidth ||
      ty >= this.floorBitmapHeight
    ) {
      return false;
    }
    return this.floorBitmap[this.getFloorIndex(tx, ty)] === 1;
  }

  public isPixelOnFloor(x: number, y: number): boolean {
    const tile = GAME_CONFIG.TILE_SIZE;
    const tx = Math.floor(x / tile);
    const ty = Math.floor(y / tile);
    return this.hasFloorTile(tx, ty);
  }

  private selectChunkSetByDifficulty(difficultyTier: string): Chunk[] {
    // Normalize tier id - support both legacy (normal_1) and new (normal) formats
    const tierId = String(difficultyTier || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');

    // Determine tier category
    let tierCategory = 'normal';
    if (tierId.startsWith('nightmare')) tierCategory = 'nightmare';
    else if (tierId.startsWith('hell') || tierId === 'beyond_hell') tierCategory = 'hell';
    else if (tierId.startsWith('normal')) tierCategory = 'normal';

    // All tiers use dungeon chunks
    const chunks = this.chunkSets.dungeon || [];

    console.log(
      `🗺️ MapGenerator: Selected "Dungeon Chunks" for difficulty "${tierCategory}" (${chunks.length} chunks available)`
    );

    return chunks;
  }

  private seededRandom(): number {
    // Simple seeded random number generator
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  getTile(x: number, y: number): MapTile | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.tiles[y][x];
  }

  isSolid(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile ? tile.solid : true; // Out of bounds is solid
  }

  private addEntities(
    entityName: string,
    kind: EntityKind,
    entities: EntitySchemaType[],
    x: number,
    y: number,
    state: any
  ) {
    const entity = new EntitySchemaInstance();
    entity.id = entityName;
    entity.kind = kind;
    entity.x = x;
    entity.y = y;
    entity.state = JSON.stringify(state);
    entities.push(entity);
  }

  private addItemEntity(
    entityName: string,
    entities: EntitySchemaType[],
    x: number,
    y: number,
    itemState: ItemState
  ) {
    const entity = new EntitySchemaInstance();
    entity.id = entityName;
    entity.kind = EntityKind.COLLECTIBLE;
    entity.x = x;
    entity.y = y;
    entity.state = JSON.stringify(itemState);
    entities.push(entity);
  }

  generateEntities(): {
    entities: EntitySchemaType[];
    enemySpawns: Array<{ x: number; y: number; type: string; stats: any }>;
    npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }>;
    chunkLayout: Array<{ x: number; y: number; chunkName: string }>;
  } {
    const entities: EntitySchemaType[] = [];
    const enemySpawns: Array<{
      x: number;
      y: number;
      type: string;
      stats: any;
    }> = [];
    const npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }> = [];
    const chunkLayout: Array<{ x: number; y: number; chunkName: string }> = [];

    // Use full chunk loading approach - floors are rendered client-side, other assets become entities
    if (this.isDungeonChunkSet()) {
      console.log('rendering dungeon chunks');

      this.generateFromDungeonChunks(
        entities,
        enemySpawns,
        npcSpawns,
        chunkLayout
      );
    } else {
      this.generateFromChunks(entities, enemySpawns, npcSpawns, chunkLayout);
    }

    // Enforce authored player spawn points presence
    if (this.getSpawnPoints().length === 0) {
      throw new Error(
        'MapGenerator: No authored player spawn points found (isSpawnPoint). This should never happen.'
      );
    }

    return { entities, enemySpawns, npcSpawns, chunkLayout };
  }

  generateFromChunks(
    entities: EntitySchemaType[],
    enemySpawns: Array<{ x: number; y: number; type: string; stats: any }>,
    npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }>,
    chunkLayout: Array<{ x: number; y: number; chunkName: string }>
  ) {
    console.log('🧩 MapGenerator: Generating world from chunks...');

    // Reset spawn points for new generation
    this.spawnPoints = [];

    if (!this.selectedChunks || this.selectedChunks.length === 0) {
      console.warn('⚠️ No chunks available, please check your chunks data.');
      return;
    }

    console.log(
      `📦 Found ${this.selectedChunks.length} chunk types to process`
    );

    // Debug: Log all chunks and their instance counts
    this.selectedChunks.forEach((chunk, index) => {
      const hasSpawnPoint = chunk.assets.some((asset) => asset.isSpawnPoint);
      console.log(
        `   ${index + 1}. "${chunk.name}" - instances: ${chunk.instances}${hasSpawnPoint ? ' 🎯 HAS SPAWN POINT' : ''}`
      );
    });

    // Global chunk placement tracking to prevent overlaps
    const globalPlacedChunks: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      name: string;
    }> = [];

    // Separate chunks into infinite and limited instances
    const infiniteChunksAll = this.selectedChunks.filter(
      (chunk) => chunk.instances === 0
    );
    const limitedChunksAll = this.selectedChunks.filter(
      (chunk) => chunk.instances > 0
    );

    // Helper to split by optional priority (default low)
    const isHigh = (c: Chunk) => (c.priority || 'low') === 'high';

    const limitedHigh = limitedChunksAll.filter(isHigh);
    const limitedLow = limitedChunksAll.filter((c) => !isHigh(c));
    const infiniteHigh = infiniteChunksAll.filter(isHigh);
    const infiniteLow = infiniteChunksAll.filter((c) => !isHigh(c));

    // Sort limited groups: spawn-first, then by instances desc for stability
    const sortLimited = (arr: Chunk[]) =>
      arr.sort((a, b) => {
        const aSpawn = a.assets.some((asset) => asset.isSpawnPoint) ? 1 : 0;
        const bSpawn = b.assets.some((asset) => asset.isSpawnPoint) ? 1 : 0;
        if (aSpawn !== bSpawn) return bSpawn - aSpawn;
        return b.instances - a.instances;
      });

    sortLimited(limitedHigh);
    sortLimited(limitedLow);

    const infiniteChunks = [...infiniteHigh, ...infiniteLow];
    const limitedChunks = [...limitedHigh, ...limitedLow];

    console.log(`♾️ Infinite chunks: ${infiniteChunks.length}`);
    console.log(
      `   - High: ${infiniteHigh.length}, Low: ${infiniteLow.length}`
    );
    console.log(`🎲 Limited chunks: ${limitedChunks.length}`);
    if (limitedChunks.length > 0) {
      console.log(
        '   Limited chunk priority order (High → Low):',
        limitedChunks
          .map(
            (c) =>
              `${c.name}${c.assets.some((a) => a.isSpawnPoint) ? ' (spawn)' : ''} x${c.instances} [${c.priority || 'low'}]`
          )
          .join(', ')
      );
    }

    // First, place limited chunks (High priority first, then Low)
    for (const chunk of limitedChunks) {
      this.processLimitedChunk(
        chunk as Chunk,
        entities,
        enemySpawns,
        npcSpawns,
        globalPlacedChunks,
        chunkLayout
      );
    }

    // Then fill remaining space with infinite chunks, High priority first
    const placeInfinite = (chunks: Chunk[]) => {
      if (chunks.length > 0) {
        this.processInfiniteChunksRandomly(
          chunks as Chunk[],
          entities,
          enemySpawns,
          npcSpawns,
          globalPlacedChunks,
          chunkLayout
        );
      }
    };

    placeInfinite(infiniteHigh);
    placeInfinite(infiniteLow);

    console.log(
      `✅ Successfully processed all chunk types with ${globalPlacedChunks.length} total instances`
    );

    if (this.spawnPoints.length > 0) {
      console.log(`🎯 Found ${this.spawnPoints.length} spawn points in chunks`);
      this.spawnPoints.forEach((point, index) => {
        console.log(`   ${index + 1}. Spawn point at (${point.x}, ${point.y})`);
      });
    } else {
      console.log(
        '🎯 No spawn points found in chunks, will use default spawning'
      );
    }

    // Boundaries/walls should be provided by chunk data only
  }

  /** Detect whether the selected chunk set appears to be dungeon (rooms/connectors). */
  private isDungeonChunkSet(): boolean {
    if (!this.selectedChunks || this.selectedChunks.length === 0) return false;
    for (const c of this.selectedChunks as any[]) {
      if (
        (c && (c as any).type === 'room') ||
        (c && (c as any).type === 'connector')
      )
        return true;
      if (typeof c?.name === 'string' && c.name.startsWith('connector-'))
        return true;
    }
    return false;
  }

  /**
   * Generate a dungeon layout using alternating rooms and connectors.
   * Pattern (fills grid cells):
   *   Row 0: Room, Connector(H), Room, Connector(H), ...
   *   Row 1: Connector(V), Room, Connector(V), Room, ...
   * This ensures adjacent rooms are always separated by a connector.
   */
  private generateFromDungeonChunks(
    entities: EntitySchemaType[],
    enemySpawns: Array<{ x: number; y: number; type: string; stats: any }>,
    npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }>,
    chunkLayout: Array<{ x: number; y: number; chunkName: string }>
  ) {
    console.log(
      '🏰 MapGenerator: Generating dungeon (rooms graph + connectors)'
    );

    if (!this.selectedChunks || this.selectedChunks.length === 0) {
      console.warn('⚠️ No chunks available for dungeon generation.');
      return;
    }

    // Partition chunks by role (rooms vs connectors); connector sub-types are derived later
    const roomChunks = (this.selectedChunks as any[]).filter(
      (c) =>
        (c as any).type === 'room' ||
        (!('type' in c) && !String(c.name).startsWith('connector-'))
    ) as Chunk[];
    const connectorChunks = (this.selectedChunks as any[]).filter(
      (c) =>
        (c as any).type === 'connector' ||
        String(c.name).startsWith('connector-')
    ) as Chunk[];

    const baseChunk = roomChunks[0] || this.selectedChunks[0];
    const cellSize = GAME_CONFIG.TILE_SIZE;
    const chunkWidthPixels = baseChunk.width * cellSize;
    const chunkHeightPixels = baseChunk.height * cellSize;

    // Record base cell dimensions (in tiles) for centering smaller chunks
    this.baseCellWidthTiles = baseChunk.width;
    this.baseCellHeightTiles = baseChunk.height;

    const gridCols = Math.max(
      1,
      Math.floor(this.worldWidth / chunkWidthPixels)
    );
    const gridRows = Math.max(
      1,
      Math.floor(this.worldHeight / chunkHeightPixels)
    );

    console.log(
      `🧮 Dungeon grid: ${gridCols} x ${gridRows} (cell ${baseChunk.width}x${baseChunk.height} tiles)`
    );

    // Helper to choose a random element safely (seeded for reproducibility)
    const pick = <T>(arr: T[], fallback?: T): T => {
      if (arr.length === 0) return fallback as T;
      const i = Math.floor(this.seededRandom() * arr.length);
      return arr[i];
    };
    const weightedPick = <T extends Chunk>(arr: T[], fallback?: T): T => {
      if (!arr || arr.length === 0) return fallback as T;
      const weights = arr.map((c) => Math.max(0, c.meta?.weight ?? 1));
      const total = weights.reduce((s, w) => s + w, 0);
      if (total <= 0) return pick(arr, fallback as T);
      let r = this.seededRandom() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= weights[i];
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    };

    // Track remaining budgets
    const remainingInstances = new Map<string, number>(); // per-chunk budget
    const remainingFamilyInstances = new Map<string, number>(); // per-family budget
    for (const c of this.selectedChunks) {
      if ((c.instances ?? 0) > 0) remainingInstances.set(c.name, c.instances);
      const fam = c.meta?.family;
      const famCap = c.meta?.familyInstances;
      if (fam && typeof famCap === 'number' && famCap > 0) {
        // If multiple variants declare familyInstances, take the max
        const prev = remainingFamilyInstances.get(fam) ?? 0;
        remainingFamilyInstances.set(fam, Math.max(prev, famCap));
      }
    }

    const pickRespectingInstances = <T extends Chunk>(
      arr: T[],
      fallbackPool: T[]
    ): T => {
      // 1) Hard-prefer families with remaining budget (guarantee spawn)
      const familyPreferred = arr.filter((c) => {
        const fam = c.meta?.family;
        if (!fam) return false;
        const rem = remainingFamilyInstances.get(fam);
        return typeof rem === 'number' && rem > 0;
      });
      if (familyPreferred.length > 0)
        return weightedPick(familyPreferred, familyPreferred[0]);

      // 2) Then consider chunks that still have per-chunk remaining budget
      const limited = arr.filter((c) => {
        const rem = remainingInstances.get(c.name);
        return typeof rem === 'number' && rem > 0;
      });
      if (limited.length > 0) return weightedPick(limited, limited[0]);

      // 3) Then consider unlimited per-chunk where the family is either unlimited or not tracked
      const unlimited = arr.filter((c) => {
        const fam = c.meta?.family;
        if (fam && remainingFamilyInstances.has(fam)) return false;
        return !remainingInstances.has(c.name);
      });
      if (unlimited.length > 0) return weightedPick(unlimited, unlimited[0]);

      // 4) Last resort: use fallback pool
      const pool = fallbackPool.length > 0 ? fallbackPool : arr;
      return weightedPick(pool, pool[0] as T);
    };

    // Group room chunks by their port layout (respect explicit meta even if empty)
    const getPortSet = (chunk: Chunk): Set<ChunkPort['side']> => {
      const ports = Array.isArray(chunk?.meta?.ports)
        ? (chunk.meta!.ports as ChunkPort[])
        : this.inferPorts(chunk);
      const set = new Set<ChunkPort['side']>();
      for (const p of ports) set.add(p.side);
      return set;
    };
    const toKey = (s: Set<ChunkPort['side']>): string =>
      Array.from(s).sort().join('');
    const roomsByKey = new Map<string, Chunk[]>();
    for (const rc of roomChunks) {
      const k = toKey(getPortSet(rc));
      const arr = roomsByKey.get(k) || [];
      arr.push(rc);
      roomsByKey.set(k, arr);
    }
    const allSidesKey = toKey(new Set<ChunkPort['side']>(['N', 'E', 'S', 'W']));
    const allSidesRooms = roomsByKey.get(allSidesKey) || [];

    // Classify connectors by actual port sets or meta.orientation
    const isHorizConn = (c: Chunk): boolean => {
      if (c.meta?.orientation === 'h') return true;
      const s = getPortSet(c);
      return s.size === 2 && s.has('W') && s.has('E');
    };
    const isVertConn = (c: Chunk): boolean => {
      if (c.meta?.orientation === 'v') return true;
      const s = getPortSet(c);
      return s.size === 2 && s.has('N') && s.has('S');
    };
    const connectorHChunks = connectorChunks.filter(isHorizConn);
    const connectorVChunks = connectorChunks.filter(isVertConn);
    const connectorAnyChunks = connectorChunks;

    // Build room node set on even-even cells
    type Cell = { x: number; y: number };
    const isRoomCell = (gx: number, gy: number) => gx % 2 === 0 && gy % 2 === 0;
    const rooms: Cell[] = [];
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        if (isRoomCell(gx, gy)) rooms.push({ x: gx, y: gy });
      }
    }

    // All possible edges between adjacent room nodes (two cells apart)
    type Edge = { a: Cell; b: Cell; kind: 'h' | 'v' };
    const allEdges: Edge[] = [];
    const roomIndex = new Set(rooms.map((c) => `${c.x},${c.y}`));
    console.log(
      `🏠 Room cells selected: ${rooms.length} (${rooms
        .map((c) => `(${c.x},${c.y})`)
        .join(', ')})`
    );

    for (const r of rooms) {
      const right = { x: r.x + 2, y: r.y };
      const down = { x: r.x, y: r.y + 2 };
      if (roomIndex.has(`${right.x},${right.y}`))
        allEdges.push({ a: r, b: right, kind: 'h' });
      if (roomIndex.has(`${down.x},${down.y}`))
        allEdges.push({ a: r, b: down, kind: 'v' });
    }

    // Spanning tree (Prim)
    const visited = new Set<string>();
    const treeEdges: Edge[] = [];
    if (rooms.length > 0) {
      const start = rooms[Math.floor(this.seededRandom() * rooms.length)];
      visited.add(`${start.x},${start.y}`);
      while (visited.size < rooms.length) {
        const candidates = allEdges.filter((e) => {
          const a = `${e.a.x},${e.a.y}`;
          const b = `${e.b.x},${e.b.y}`;
          const inA = visited.has(a);
          const inB = visited.has(b);
          return (inA && !inB) || (!inA && inB);
        });
        if (candidates.length === 0) break;
        const chosen =
          candidates[Math.floor(this.seededRandom() * candidates.length)];
        treeEdges.push(chosen);
        const addNode = visited.has(`${chosen.a.x},${chosen.a.y}`)
          ? chosen.b
          : chosen.a;
        visited.add(`${addNode.x},${addNode.y}`);
      }
    }

    // Extra edges for loops
    const inTree = new Set(
      treeEdges.map((e) => `${e.a.x},${e.a.y}-${e.b.x},${e.b.y}`)
    );
    const extraEdges: Edge[] = [];
    const maxExtra = Math.max(1, Math.floor(rooms.length * 0.15));
    for (const e of allEdges) {
      const key = `${e.a.x},${e.a.y}-${e.b.x},${e.b.y}`;
      if (inTree.has(key)) continue;
      if (extraEdges.length >= maxExtra) break;
      if (this.seededRandom() < 0.25) extraEdges.push(e);
    }

    // Build connection map per room so we can choose directional room templates
    const selectedEdgesForRooms: Edge[] = [...treeEdges, ...extraEdges];
    const connectionsByRoom = new Map<
      string,
      { N: boolean; S: boolean; E: boolean; W: boolean }
    >();
    const ensureConn = (gx: number, gy: number) => {
      const key = `${gx},${gy}`;
      if (!connectionsByRoom.has(key)) {
        connectionsByRoom.set(key, { N: false, S: false, E: false, W: false });
      }
      return connectionsByRoom.get(key)!;
    };
    for (const e of selectedEdgesForRooms) {
      if (e.kind === 'h') {
        const left = e.a.x < e.b.x ? e.a : e.b;
        const right = e.a.x < e.b.x ? e.b : e.a;
        ensureConn(left.x, left.y).E = true;
        ensureConn(right.x, right.y).W = true;
      } else {
        const top = e.a.y < e.b.y ? e.a : e.b;
        const bottom = e.a.y < e.b.y ? e.b : e.a;
        ensureConn(top.x, top.y).S = true;
        ensureConn(bottom.x, bottom.y).N = true;
      }
    }

    // Grid storing placed chunks
    const placedGrid: (Chunk | null)[][] = Array.from(
      { length: gridRows },
      () => new Array<Chunk | null>(gridCols).fill(null)
    );

    // Pre-place guaranteed family instances (e.g., rofl-room with instances: 1)
    // We choose cells first, then pick the best-fitting variant from that family.
    if (remainingFamilyInstances.size > 0) {
      const familyNames = Array.from(remainingFamilyInstances.keys());
      for (const fam of familyNames) {
        let famRem = remainingFamilyInstances.get(fam) || 0;
        if (famRem <= 0) continue;

        // All variants for this family grouped by their port-set key
        const familyRooms = roomChunks.filter((c) => c.meta?.family === fam);
        if (familyRooms.length === 0) continue;
        const familyByKey = new Map<string, Chunk[]>();
        for (const fr of familyRooms) {
          const k = toKey(getPortSet(fr));
          const arr = familyByKey.get(k) || [];
          arr.push(fr);
          familyByKey.set(k, arr);
        }

        // Compute free cells whose expected port set matches some family variant
        const freeCells = rooms.filter((c) => !placedGrid[c.y][c.x]);
        const matchingCells: { cell: { x: number; y: number }; key: string }[] =
          [];
        for (const cell of freeCells) {
          const ck = `${cell.x},${cell.y}`;
          const conn = connectionsByRoom.get(ck) || {
            N: false,
            S: false,
            E: false,
            W: false,
          };
          const expectedSet = new Set<ChunkPort['side']>();
          if (conn.N) expectedSet.add('N');
          if (conn.E) expectedSet.add('E');
          if (conn.S) expectedSet.add('S');
          if (conn.W) expectedSet.add('W');
          const expectedKey = toKey(expectedSet);
          if (familyByKey.has(expectedKey))
            matchingCells.push({ cell, key: expectedKey });
        }

        // Prefer exact-match cells; if none, prefer leaf cells that match any single-port variant
        let targetInfo =
          matchingCells.length > 0
            ? pick(matchingCells, matchingCells[0])
            : null;

        if (!targetInfo) {
          const singlePortKeys = ['N', 'E', 'S', 'W'].filter((k) =>
            familyByKey.has(k)
          );
          if (singlePortKeys.length > 0) {
            const leafCells: { cell: { x: number; y: number }; key: string }[] =
              [];
            for (const cell of freeCells) {
              const ck = `${cell.x},${cell.y}`;
              const conn = connectionsByRoom.get(ck) || {
                N: false,
                S: false,
                E: false,
                W: false,
              };
              const degree =
                (conn.N ? 1 : 0) +
                (conn.E ? 1 : 0) +
                (conn.S ? 1 : 0) +
                (conn.W ? 1 : 0);
              if (degree === 1) {
                const k = conn.N ? 'N' : conn.E ? 'E' : conn.S ? 'S' : 'W';
                if (familyByKey.has(k)) leafCells.push({ cell, key: k });
              }
            }
            if (leafCells.length > 0)
              targetInfo = pick(leafCells, leafCells[0]);
          }
        }

        if (!targetInfo) {
          console.warn(
            `⚠️ Family "${fam}" had remaining instances but no compatible room cell shape`
          );
          continue;
        }

        const variants = familyByKey.get(targetInfo.key)!;
        const chosen = weightedPick(variants, variants[0]);
        const target = targetInfo.cell;

        const offsetX = target.x * chunkWidthPixels;
        const offsetY = target.y * chunkHeightPixels;
        this.placeChunkAt(
          chosen,
          offsetX,
          offsetY,
          entities,
          enemySpawns,
          npcSpawns,
          target.x,
          target.y,
          `${chosen.name.toLowerCase().replace(/\s+/g, '_')}`
        );
        placedGrid[target.y][target.x] = chosen;
        chunkLayout.push({ x: target.x, y: target.y, chunkName: chosen.name });

        famRem -= 1;
        remainingFamilyInstances.set(fam, famRem);
      }
    }

    // Place rooms
    for (const r of rooms) {
      if (placedGrid[r.y][r.x]) {
        // Already placed during family pre-placement
        continue;
      }
      const key = `${r.x},${r.y}`;
      const conn = connectionsByRoom.get(key) || {
        N: false,
        S: false,
        E: false,
        W: false,
      };
      const expectedSet = new Set<ChunkPort['side']>();
      if (conn.N) expectedSet.add('N');
      if (conn.E) expectedSet.add('E');
      if (conn.S) expectedSet.add('S');
      if (conn.W) expectedSet.add('W');
      const expectedKey = toKey(expectedSet);

      // Prefer exact directional room chunks, fallback to all-sides, then any room
      const exactRooms = roomsByKey.get(expectedKey) || [];
      let chosenRoom: Chunk;
      if (exactRooms.length > 0) {
        chosenRoom = pickRespectingInstances(exactRooms, roomChunks);
      } else if (allSidesRooms.length > 0) {
        chosenRoom = pickRespectingInstances(allSidesRooms, roomChunks);
      } else {
        chosenRoom = pickRespectingInstances(roomChunks, roomChunks);
      }

      // Decrement per-chunk and per-family budgets
      const rem = remainingInstances.get(chosenRoom.name);
      if (typeof rem === 'number' && rem > 0)
        remainingInstances.set(chosenRoom.name, rem - 1);
      const fam = chosenRoom.meta?.family;
      if (fam && remainingFamilyInstances.has(fam)) {
        const frem = remainingFamilyInstances.get(fam)!;
        if (frem > 0) remainingFamilyInstances.set(fam, frem - 1);
      }
      const offsetX = r.x * chunkWidthPixels;
      const offsetY = r.y * chunkHeightPixels;
      this.placeChunkAt(
        chosenRoom,
        offsetX,
        offsetY,
        entities,
        enemySpawns,
        npcSpawns,
        r.x,
        r.y,
        `${chosenRoom.name.toLowerCase().replace(/\s+/g, '_')}`
      );
      placedGrid[r.y][r.x] = chosenRoom;
      chunkLayout.push({ x: r.x, y: r.y, chunkName: chosenRoom.name });
    }

    // Place connectors (tree + extras)
    const allSelectedEdges = [...treeEdges, ...extraEdges];
    console.log(
      `🔗 Connector edges selected: ${allSelectedEdges.length} (${allSelectedEdges
        .map((e) => `${e.kind}@(${e.a.x},${e.a.y})-(${e.b.x},${e.b.y})`)
        .join(', ')})`
    );

    for (const e of allSelectedEdges) {
      const cgx = (e.a.x + e.b.x) / 2;
      const cgy = (e.a.y + e.b.y) / 2;
      const list = e.kind === 'h' ? connectorHChunks : connectorVChunks;
      const pool = list.length > 0 ? list : connectorAnyChunks;
      const chosenConn = weightedPick(pool, pool[0] || (baseChunk as Chunk));
      const offsetX = cgx * chunkWidthPixels;
      const offsetY = cgy * chunkHeightPixels;
      this.placeChunkAt(
        chosenConn,
        offsetX,
        offsetY,
        entities,
        enemySpawns,
        npcSpawns,
        cgx,
        cgy,
        `${chosenConn.name.toLowerCase().replace(/\s+/g, '_')}`
      );
      placedGrid[cgy][cgx] = chosenConn;
      chunkLayout.push({ x: cgx, y: cgy, chunkName: chosenConn.name });
    }

    console.log('✅ Dungeon layout generated.');

    // Use port metadata (or inferred defaults) to carve guaranteed connections
    this.carveConnectionsUsingPorts(
      placedGrid,
      gridCols,
      gridRows,
      baseChunk.width,
      baseChunk.height
    );
  }

  /** Infer ports for a chunk if not explicitly provided. */
  private inferPorts(chunk: Chunk): ChunkPort[] {
    if (chunk?.meta?.ports && chunk.meta.ports.length > 0)
      return chunk.meta.ports;

    const corridor = this.DEFAULT_CORRIDOR_WIDTH_TILES;
    const halfW = Math.floor(chunk.width / 2);
    const halfH = Math.floor(chunk.height / 2);

    // Estimate a center offset from floor asset distribution along the axis
    const estimateCenter = (axis: 'x' | 'y', fallback: number): number => {
      try {
        const coords: number[] = [];
        for (const a of chunk.assets) {
          if (a?.category !== 'floors') continue;
          const raw = axis === 'x' ? a.x : a.y;
          if (typeof raw !== 'number') continue;
          const span = axis === 'x' ? chunk.width : chunk.height;
          if (!span || span <= 0) continue;
          // Normalize obviously out-of-range values (authoring often used global offsets)
          const local = ((raw % span) + span) % span;
          coords.push(local);
        }
        if (coords.length === 0) return fallback;
        coords.sort((a, b) => a - b);
        const mid = Math.floor(coords.length / 2);
        const median =
          coords.length % 2 === 1
            ? coords[mid]
            : (coords[mid - 1] + coords[mid]) / 2;
        return Math.round(median);
      } catch {
        return fallback;
      }
    };

    const isConnector =
      (chunk as any).type === 'connector' ||
      String(chunk?.name || '').startsWith('connector-');
    const isHorizontal =
      String(chunk?.name || '').includes('horizontal') ||
      chunk?.meta?.orientation === 'h';
    const isVertical =
      String(chunk?.name || '').includes('vertical') ||
      chunk?.meta?.orientation === 'v';

    if (isConnector && (isHorizontal || !isVertical)) {
      const centerY = estimateCenter('y', halfH);
      return [
        { side: 'W', centerOffsetTiles: centerY, widthTiles: corridor },
        { side: 'E', centerOffsetTiles: centerY, widthTiles: corridor },
      ];
    }
    if (isConnector && isVertical) {
      const centerX = estimateCenter('x', halfW);
      return [
        { side: 'N', centerOffsetTiles: centerX, widthTiles: corridor },
        { side: 'S', centerOffsetTiles: centerX, widthTiles: corridor },
      ];
    }

    // Default room: 4 centered ports
    return [
      { side: 'N', centerOffsetTiles: halfW, widthTiles: corridor },
      { side: 'E', centerOffsetTiles: halfH, widthTiles: corridor },
      { side: 'S', centerOffsetTiles: halfW, widthTiles: corridor },
      { side: 'W', centerOffsetTiles: halfH, widthTiles: corridor },
    ];
  }

  /** Carve connections across cell seams where ports are present on both sides. */
  private carveConnectionsUsingPorts(
    grid: (Chunk | null)[][],
    gridCols: number,
    gridRows: number,
    chunkWidthTiles: number,
    chunkHeightTiles: number
  ): void {
    console.log('🔪 Carving connections using ports');
    console.log(grid);
    console.log(gridCols);
    console.log(gridRows);
    console.log(chunkWidthTiles);
    console.log(chunkHeightTiles);

    const thicknessFrom = (a: number, b: number) => Math.max(2, Math.min(a, b));
    const penetrate = Math.max(
      4,
      Math.floor(Math.min(chunkWidthTiles, chunkHeightTiles) / 8)
    );

    // Horizontal seams (left ↔ right)
    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols - 1; gx++) {
        const left = grid[gy][gx];
        const right = grid[gy][gx + 1];
        if (!left || !right) continue;

        const leftPorts = this.inferPorts(left).filter((p) => p.side === 'E');
        const rightPorts = this.inferPorts(right).filter((p) => p.side === 'W');
        if (leftPorts.length === 0 || rightPorts.length === 0) continue;

        // For simplicity use first port on each side
        const lp = leftPorts[0];
        const rp = rightPorts[0];
        const seamX = (gx + 1) * chunkWidthTiles;
        const cellTop = gy * chunkHeightTiles;
        const centerY = Math.round(
          cellTop + (lp.centerOffsetTiles + rp.centerOffsetTiles) / 2
        );
        const thickness = thicknessFrom(lp.widthTiles, rp.widthTiles);
        const half = Math.floor(thickness / 2);
        const yStart = centerY - half;
        const yEnd = centerY + (thickness - 1 - half);
        const xStart = seamX - penetrate;
        const xEnd = seamX + penetrate - 1;
        this.setFloorRect(xStart, yStart, xEnd, yEnd);
      }
    }

    // Vertical seams (top ↔ bottom)
    for (let gy = 0; gy < gridRows - 1; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const top = grid[gy][gx];
        const bottom = grid[gy + 1][gx];
        if (!top || !bottom) continue;

        const topPorts = this.inferPorts(top).filter((p) => p.side === 'S');
        const bottomPorts = this.inferPorts(bottom).filter(
          (p) => p.side === 'N'
        );
        if (topPorts.length === 0 || bottomPorts.length === 0) continue;

        const tp = topPorts[0];
        const bp = bottomPorts[0];
        const seamY = (gy + 1) * chunkHeightTiles;
        const cellLeft = gx * chunkWidthTiles;
        const centerX = Math.round(
          cellLeft + (tp.centerOffsetTiles + bp.centerOffsetTiles) / 2
        );
        const thickness = thicknessFrom(tp.widthTiles, bp.widthTiles);
        const half = Math.floor(thickness / 2);
        const xStart = centerX - half;
        const xEnd = centerX + (thickness - 1 - half);
        const yStart = seamY - penetrate;
        const yEnd = seamY + penetrate - 1;
        this.setFloorRect(xStart, yStart, xEnd, yEnd);
      }
    }
  }

  /**
   * Get all spawn points found in chunks
   */
  getSpawnPoints(): Array<{ x: number; y: number }> {
    return [...this.spawnPoints];
  }

  private processInfiniteChunksRandomly(
    infiniteChunks: Chunk[],
    entities: EntitySchemaType[],
    enemySpawns: Array<{ x: number; y: number; type: string; stats: any }>,
    npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }>,
    globalPlacedChunks: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      name: string;
    }>,
    chunkLayout: Array<{ x: number; y: number; chunkName: string }>
  ) {
    console.log(
      `♾️ Processing ${infiniteChunks.length} infinite chunks randomly across the world`
    );

    const cellSize = GAME_CONFIG.TILE_SIZE;
    const chunkWidthPixels = infiniteChunks[0].width * cellSize;
    const chunkHeightPixels = infiniteChunks[0].height * cellSize;

    // Calculate grid dimensions
    const chunksX = Math.ceil(this.worldWidth / chunkWidthPixels);
    const chunksY = Math.ceil(this.worldHeight / chunkHeightPixels);

    console.log(
      `🎲 Randomly placing chunks from ${infiniteChunks.map((c) => `"${c.name}"`).join(', ')} across ${chunksX}x${chunksY} grid`
    );

    // Track chunk usage for logging
    const chunkUsage = new Map<string, number>();
    infiniteChunks.forEach((chunk) => chunkUsage.set(chunk.name, 0));

    // Iterate through each grid position and randomly select a chunk
    for (let chunkY = 0; chunkY < chunksY; chunkY++) {
      for (let chunkX = 0; chunkX < chunksX; chunkX++) {
        const offsetX = chunkX * chunkWidthPixels;
        const offsetY = chunkY * chunkHeightPixels;

        // Check if this position conflicts with any limited chunks
        const conflictsWithLimitedChunk = globalPlacedChunks.some(
          (limitedChunk) => {
            // Check for actual overlap (not just proximity)
            const overlapX =
              offsetX < limitedChunk.x + limitedChunk.width &&
              offsetX + chunkWidthPixels > limitedChunk.x;
            const overlapY =
              offsetY < limitedChunk.y + limitedChunk.height &&
              offsetY + chunkHeightPixels > limitedChunk.y;
            return overlapX && overlapY;
          }
        );

        if (!conflictsWithLimitedChunk) {
          // Randomly select one of the infinite chunks
          const randomIndex = Math.floor(Math.random() * infiniteChunks.length);
          const selectedChunk = infiniteChunks[randomIndex];

          // Keep all chunks; no void-only filtering

          // Add to global tracking
          globalPlacedChunks.push({
            x: offsetX,
            y: offsetY,
            width: chunkWidthPixels,
            height: chunkHeightPixels,
            name: selectedChunk.name,
          });

          // Place the selected chunk
          this.placeChunkAt(
            selectedChunk,
            offsetX,
            offsetY,
            entities,
            enemySpawns,
            npcSpawns,
            chunkX,
            chunkY,
            `${selectedChunk.name.toLowerCase().replace(/\s+/g, '_')}`
          );

          // Track usage
          chunkUsage.set(
            selectedChunk.name,
            (chunkUsage.get(selectedChunk.name) || 0) + 1
          );

          // Add to chunk layout for client
          chunkLayout.push({
            x: chunkX,
            y: chunkY,
            chunkName: selectedChunk.name,
          });
        } else {
          console.log(
            `⏭️ Skipping infinite chunk at (${offsetX}, ${offsetY}) - conflicts with limited chunk`
          );
        }
      }
    }

    // Log chunk distribution
    console.log('📊 Infinite chunk distribution:');
    chunkUsage.forEach((count, chunkName) => {
      const percentage = ((count / (chunksX * chunksY)) * 100).toFixed(1);
      console.log(`   "${chunkName}": ${count} instances (${percentage}%)`);
    });
  }

  private processLimitedChunk(
    chunk: Chunk,
    entities: EntitySchemaType[],
    enemySpawns: Array<{ x: number; y: number; type: string; stats: any }>,
    npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }>,
    globalPlacedChunks: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      name: string;
    }>,
    chunkLayout: Array<{ x: number; y: number; chunkName: string }>
  ) {
    console.log(
      `🎲 Processing limited chunk: "${chunk.name}" (${chunk.width}x${chunk.height}, instances: ${chunk.instances})`
    );

    const cellSize = GAME_CONFIG.TILE_SIZE;
    const chunkWidthPixels = chunk.width * cellSize;
    const chunkHeightPixels = chunk.height * cellSize;

    const successfulPlacements = [];
    const baseDistance = Math.max(chunkWidthPixels, chunkHeightPixels);
    // Allow tighter packing for non-spawn chunks; keep larger buffer around spawn chunks
    const hasSpawnPointInChunk = chunk.assets.some(
      (asset) => asset.isSpawnPoint
    );
    const minDistance = baseDistance * (hasSpawnPointInChunk ? 1.5 : 1.0); // Minimum distance between chunks

    // Grid dimensions for deterministic fallback placement
    const gridCols = Math.max(
      1,
      Math.floor(this.worldWidth / chunkWidthPixels)
    );
    const gridRows = Math.max(
      1,
      Math.floor(this.worldHeight / chunkHeightPixels)
    );

    for (let i = 0; i < chunk.instances; i++) {
      console.log(
        `🎯 Attempting to place "${chunk.name}" instance ${i + 1}/${chunk.instances}`
      );

      let attempts = 0;
      let validPosition = false;
      let offsetX: number | undefined;
      let offsetY: number | undefined;

      // Progressive spacing strategy to guarantee placement
      const spacingAttempts = [
        minDistance,
        Math.floor(baseDistance * 0.75),
        Math.floor(baseDistance * 0.5),
        Math.floor(baseDistance * 0.25),
        0, // allow adjacency but no extra buffer
      ];

      for (let s = 0; s < spacingAttempts.length && !validPosition; s++) {
        const spacing = spacingAttempts[s];

        // 1) Random grid sampling (seeded unless chunk has spawn point)
        let localAttempts = 0;
        while (!validPosition && localAttempts < 100) {
          // Ensure chunk fits within world bounds
          const maxX = this.worldWidth - chunkWidthPixels;
          const maxY = this.worldHeight - chunkHeightPixels;

          if (maxX <= 0 || maxY <= 0) {
            console.warn(`⚠️ Chunk "${chunk.name}" is too large for the world`);
            break;
          }

          const randomFunc = hasSpawnPointInChunk
            ? Math.random
            : () => this.seededRandom();

          const gx = Math.floor(
            randomFunc() * Math.max(1, Math.floor(maxX / chunkWidthPixels))
          );
          const gy = Math.floor(
            randomFunc() * Math.max(1, Math.floor(maxY / chunkHeightPixels))
          );
          const candidateX = gx * chunkWidthPixels;
          const candidateY = gy * chunkHeightPixels;

          const conflict = this.checkChunkOverlap(
            candidateX,
            candidateY,
            chunkWidthPixels,
            chunkHeightPixels,
            globalPlacedChunks,
            spacing
          );

          if (!conflict) {
            offsetX = candidateX;
            offsetY = candidateY;
            validPosition = true;
            break;
          }

          localAttempts++;
          attempts++;
        }

        // 2) Deterministic grid scan if random sampling failed
        if (!validPosition) {
          for (let gy = 0; gy < gridRows && !validPosition; gy++) {
            for (let gx = 0; gx < gridCols && !validPosition; gx++) {
              const candidateX = gx * chunkWidthPixels;
              const candidateY = gy * chunkHeightPixels;

              // Bounds safety
              if (
                candidateX + chunkWidthPixels > this.worldWidth ||
                candidateY + chunkHeightPixels > this.worldHeight
              ) {
                continue;
              }

              const conflict = this.checkChunkOverlap(
                candidateX,
                candidateY,
                chunkWidthPixels,
                chunkHeightPixels,
                globalPlacedChunks,
                spacing
              );

              if (!conflict) {
                offsetX = candidateX;
                offsetY = candidateY;
                validPosition = true;
                break;
              }
            }
          }
        }
      }

      if (validPosition) {
        // Skip void-only chunks (only empty brick floors) to reduce layout/tiles

        // Add to global tracking
        globalPlacedChunks.push({
          x: offsetX!,
          y: offsetY!,
          width: chunkWidthPixels,
          height: chunkHeightPixels,
          name: chunk.name,
        });

        successfulPlacements.push({ x: offsetX!, y: offsetY! });

        this.placeChunkAt(
          chunk,
          offsetX!,
          offsetY!,
          entities,
          enemySpawns,
          npcSpawns,
          i,
          0,
          `${chunk.name.toLowerCase().replace(/\s+/g, '_')}`
        );

        const hasSpawnPoint = chunk.assets.some((asset) => asset.isSpawnPoint);
        console.log(
          `📍 Placed "${chunk.name}" instance ${i + 1} at (${Math.floor(offsetX!)}, ${Math.floor(offsetY!)}) after ${attempts} attempts${hasSpawnPoint ? ' 🎯 WITH SPAWN POINT' : ''}`
        );

        // Add to chunk layout for client (convert pixel coordinates to grid coordinates)
        const gridX = Math.floor(offsetX! / chunkWidthPixels);
        const gridY = Math.floor(offsetY! / chunkHeightPixels);
        chunkLayout.push({
          x: gridX,
          y: gridY,
          chunkName: chunk.name,
        });
      } else {
        console.warn(
          `⚠️ Could not find valid position for "${chunk.name}" instance ${i + 1} after ${attempts} attempts — forcing placement (priority guarantee)`
        );

        // Force placement: deterministic grid slot ignoring spacing to honor instance count
        const forcedGx = i % gridCols;
        const forcedGy = Math.floor(i / gridCols) % gridRows;
        const forcedX = forcedGx * chunkWidthPixels;
        const forcedY = forcedGy * chunkHeightPixels;

        // Track and place
        globalPlacedChunks.push({
          x: forcedX,
          y: forcedY,
          width: chunkWidthPixels,
          height: chunkHeightPixels,
          name: chunk.name,
        });

        successfulPlacements.push({ x: forcedX, y: forcedY });

        this.placeChunkAt(
          chunk,
          forcedX,
          forcedY,
          entities,
          enemySpawns,
          npcSpawns,
          i,
          0,
          `${chunk.name.toLowerCase().replace(/\s+/g, '_')}`
        );

        const hasSpawnPoint = chunk.assets.some((asset) => asset.isSpawnPoint);
        console.log(
          `📍 Forced placement for "${chunk.name}" instance ${i + 1} at (${Math.floor(forcedX)}, ${Math.floor(forcedY)})${hasSpawnPoint ? ' 🎯 WITH SPAWN POINT' : ''}`
        );

        const gridX = Math.floor(forcedX / chunkWidthPixels);
        const gridY = Math.floor(forcedY / chunkHeightPixels);
        chunkLayout.push({
          x: gridX,
          y: gridY,
          chunkName: chunk.name,
        });
      }
    }

    console.log(
      `✅ Successfully placed ${successfulPlacements.length}/${chunk.instances} instances of "${chunk.name}"`
    );
  }

  private checkChunkOverlap(
    x: number,
    y: number,
    width: number,
    height: number,
    existingChunks: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      name: string;
    }>,
    buffer: number
  ): boolean {
    for (const existing of existingChunks) {
      const leftA = x - buffer;
      const rightA = x + width + buffer;
      const topA = y - buffer;
      const bottomA = y + height + buffer;

      const leftB = existing.x;
      const rightB = existing.x + existing.width;
      const topB = existing.y;
      const bottomB = existing.y + existing.height;

      const overlapX = leftA < rightB && rightA > leftB;
      const overlapY = topA < bottomB && bottomA > topB;

      if (overlapX && overlapY) return true;
    }
    return false;
  }

  private placeChunkAt(
    chunk: Chunk,
    offsetX: number,
    offsetY: number,
    entities: EntitySchemaType[],
    enemySpawns: Array<{ x: number; y: number; type: string; stats: any }>,
    npcSpawns: Array<{
      characterId: string;
      dialogueId?: string;
      x: number;
      y: number;
    }>,
    chunkIndexX: number,
    chunkIndexY: number,
    chunkPrefix: string = 'chunk'
  ) {
    // Compute anchoring offsets (pixels) based on ports; default to centering
    const gridSize = GAME_CONFIG.TILE_SIZE;
    const baseW = this.baseCellWidthTiles ?? chunk.width;
    const baseH = this.baseCellHeightTiles ?? chunk.height;
    const ports = Array.isArray(chunk?.meta?.ports)
      ? (chunk.meta!.ports as any[])
      : [];
    const hasN = ports.some((p: any) => p.side === 'N');
    const hasS = ports.some((p: any) => p.side === 'S');
    const hasW = ports.some((p: any) => p.side === 'W');
    const hasE = ports.some((p: any) => p.side === 'E');

    const centerDxPx = Math.max(
      0,
      Math.floor((baseW - chunk.width) / 2) * gridSize
    );
    const centerDyPx = Math.max(
      0,
      Math.floor((baseH - chunk.height) / 2) * gridSize
    );
    const dxPx =
      hasW && !hasE
        ? 0
        : hasE && !hasW
          ? Math.max(0, (baseW - chunk.width) * gridSize)
          : centerDxPx;
    const dyPx =
      hasN && !hasS
        ? 0
        : hasS && !hasN
          ? Math.max(0, (baseH - chunk.height) * gridSize)
          : centerDyPx;

    chunk.assets.forEach((asset, assetIndex) => {
      // Use GAME_CONFIG.TILE_SIZE grid as base unit to match floor tile positioning
      const worldX = offsetX + dxPx + asset.x * gridSize;
      const worldY = offsetY + dyPx + asset.y * gridSize;

      // Skip if the asset would be outside world bounds
      if (worldX >= this.worldWidth || worldY >= this.worldHeight) {
        return;
      }

      // Generate unique ID for this instance of the asset
      const uniqueId = `${chunkPrefix}_${chunkIndexX}_${chunkIndexY}_${asset.assetId}_${assetIndex}`;

      if (asset.isEnemy) {
        // Handle enemy spawns - fall back to assetId if enemyType missing
        const resolvedType =
          (asset as any).enemyType || (asset as any).assetId || 'licky';
        const enemySpawn = createEnemySpawn(resolvedType, worldX, worldY, {
          fromChunk: true,
          chunkX: chunkIndexX,
          chunkY: chunkIndexY,
        });
        enemySpawns.push(enemySpawn);
        console.log(
          `⚔️ Placed enemy ${resolvedType} at (${worldX}, ${worldY})`
        );
      } else if (asset.isSpawnPoint) {
        // Handle player spawn points: store CENTER of the tile, not origin.
        // Using tile origin caused players to spawn partially inside walls.
        const cx = worldX + GAME_CONFIG.TILE_SIZE / 2;
        const cy = worldY + GAME_CONFIG.TILE_SIZE / 2;
        this.spawnPoints.push({ x: cx, y: cy });
        console.log(
          `🎯 Found player spawn point at center (${cx}, ${cy}) from asset at chunk coords (${asset.x}, ${asset.y})`
        );
      } else if (asset.isCharacter) {
        // Queue NPC spawn from chunk - force Stani for all character assets
        npcSpawns.push({
          characterId: 'stani',
          dialogueId: 'stani',
          x: worldX + GAME_CONFIG.TILE_SIZE / 2,
          y: worldY + GAME_CONFIG.TILE_SIZE / 2,
        });
      } else {
        // Handle regular assets (obstacles, collectibles, etc.)
        let entityKind: EntityKind = EntityKind.OBSTACLE;
        const state: any = {
          type: asset.category,
          assetId: asset.assetId,
          sprite: asset.sprite,
          fromChunk: true,
        };

        // Preserve pixel offsets from authored chunk assets so the client can
        // nudge sprites precisely within a tile (e.g., torches next to doors).
        if (
          asset &&
          (asset.positionMode === 'pixel' ||
            typeof (asset as any).offsetX === 'number' ||
            typeof (asset as any).offsetY === 'number')
        ) {
          const ox = Number((asset as any).offsetX || 0);
          const oy = Number((asset as any).offsetY || 0);
          if (ox !== 0) state.offsetX = ox;
          if (oy !== 0) state.offsetY = oy;
        }

        // Handle floors first - skip them as they're rendered client-side
        // Also skip the common empty fill tile to reduce client work

        //todo: implement as a bitmap istead of string set
        if (asset.category === 'floors') {
          // Record floor presence for server-side walkability
          const gridSize = GAME_CONFIG.TILE_SIZE;
          const tx = Math.floor(worldX / gridSize);
          const ty = Math.floor(worldY / gridSize);
          this.setFloorTileAt(tx, ty);
          return;
        }

        // Determine entity type based on asset ID rather than generic categories
        entityKind = EntityKind.OBSTACLE;

        // Handle trees (typically from 'nature' category)
        if (asset.assetId.includes('tree')) {
          state.type = 'tree';
          state.treeType = this.getTreeTypeFromAssetId(asset.assetId);
          state.assetId = asset.assetId;
          state.health = 3;
          state.maxHealth = 3;
          state.choppedBy = null;
          state.lastChopTime = 0;
        }
        // Handle rocks and crystals (typically from 'rocks' category)
        else if (
          asset.assetId.includes('rock') ||
          asset.assetId.includes('crystal')
        ) {
          state.type = 'stone';
          state.stoneType = this.getStoneTypeFromAssetId(asset.assetId);
          state.assetId = asset.assetId;
          state.health = 6;
          state.maxHealth = 6;
          state.choppedBy = null;
          state.lastChopTime = 0;
        }
        // Handle plants (from 'nature' category)
        else if (
          asset.category === 'nature' &&
          asset.assetId.includes('plant')
        ) {
          state.type = 'special';
          state.assetId = asset.assetId;
          state.indestructible = true;
        }
        // Handle wall tiles as collidable special objects (rendered client-side, block movement)
        else if (asset.category === 'walls') {
          state.type = 'special';
          state.assetId = asset.assetId;
          state.indestructible = true;
          state.hasCollision = true;
          // Ensure walls always render above floor tilemaps across floors
          if (typeof state.renderLayer !== 'string')
            state.renderLayer = 'overlay';
          if (typeof state.depthHint !== 'number') state.depthHint = 2;
        }
        // Handle special objects (from 'special' category)
        else if (asset.category === 'special') {
          state.type = 'special';
          state.assetId = asset.assetId;
          state.indestructible = true;
        }
        // Handle structures (from 'structures' category)
        else if (asset.category === 'structures') {
          state.type = 'structure';
          state.assetId = asset.assetId;
          state.indestructible = true;
        }
        // Default handling for unknown asset types
        else {
          console.warn(
            `⚠️ Unknown asset type: ${asset.assetId} (category: ${asset.category})`
          );
          state.type = 'obstacle';
          state.assetId = asset.assetId;
        }

        const obstacleConfig = OBSTACLE_CONFIGS[asset.assetId];
        if (obstacleConfig) {
          state.hasCollision =
            obstacleConfig.hasCollision ?? state.hasCollision;

          if (obstacleConfig.renderLayer) {
            state.renderLayer = obstacleConfig.renderLayer;
          }

          if (typeof obstacleConfig.depthHint === 'number') {
            state.depthHint = obstacleConfig.depthHint;
          }
        }

        this.addEntities(uniqueId, entityKind, entities, worldX, worldY, state);
      }
    });
  }

  private getTreeTypeFromAssetId(assetId: string): string {
    if (assetId.includes('cyber')) return 'cyber';
    if (assetId.includes('pink')) return 'pink';
    return 'green'; // default
  }

  private getStoneTypeFromAssetId(assetId: string): string {
    // Handle chunk-based asset IDs first
    if (assetId.includes('double_rocks_small')) return 'small';
    if (assetId.includes('double_rocks_big')) return 'big';
    if (assetId.includes('crystals_purple')) return 'crystal_purple';
    if (assetId.includes('crystals_green')) return 'crystal_green';
    if (assetId.includes('crystals_blue')) return 'crystal_blue';

    // Handle legacy procedural stone types
    if (assetId.includes('triple')) return 'triple';
    if (assetId.includes('small')) return 'small';
    if (assetId.includes('big')) return 'big';
    if (assetId.includes('left')) return 'left';
    if (assetId.includes('right')) return 'right';

    return 'small'; // default to small for chunk assets
  }

  generateSpawnPoints(entities: EntitySchemaType[]) {
    const spawnPoints = this.getSpawnPoints();
    spawnPoints.forEach((point, index) => {
      this.addEntities(
        `spawn_${index}`,
        EntityKind.SPAWN_POINT,
        entities,
        point.x,
        point.y,
        { active: true }
      );
    });
  }

  generateRoad(entities: EntitySchemaType[]) {
    console.log('🛣️ MapGenerator: Creating road...');

    const roadCenterY = this.worldHeight / 2; // Center of world height
    const roadWidth = 60;

    // Create main road entity
    this.addEntities(
      'road_main',
      EntityKind.ROAD,
      entities,
      this.worldWidth / 2, // Center X of world
      roadCenterY,
      {
        type: 'main',
        width: this.worldWidth,
        height: roadWidth,
        color: 0x4a4a2f, // Dark brownish color
      }
    );

    // Add road markings (dashed line in center)
    const dashLength = 20;
    const gapLength = 15;
    const totalLength = this.worldWidth;
    const numDashes = Math.floor(totalLength / (dashLength + gapLength));

    for (let i = 0; i < numDashes; i++) {
      const x = i * (dashLength + gapLength) + dashLength / 2;
      this.addEntities(
        `road_dash_${i}`,
        EntityKind.ROAD,
        entities,
        x,
        roadCenterY,
        {
          type: 'dash',
          width: dashLength,
          height: 2,
          color: 0xffffff, // White dashes
        }
      );
    }
  }

  generatePortals(entities: EntitySchemaType[]) {
    // Generate one portal of each type per map (alpha, fomo, og)
    const portalTypes = ['alpha', 'fomo', 'og'];
    console.log(`🌀 MapGenerator: Creating ${portalTypes.length} portals`);

    portalTypes.forEach((portalType, index) => {
      // Random position avoiding edges and ensuring good spacing
      const padding = 200; // Keep portals away from edges
      const minDistance = 400; // Minimum distance between portals

      let x: number, y: number;
      let attempts = 0;
      let validPosition = false;

      // Try to find a valid position that doesn't conflict with existing portals
      while (!validPosition && attempts < 50) {
        x = padding + this.seededRandom() * (this.worldWidth - padding * 2);
        y = padding + this.seededRandom() * (this.worldHeight - padding * 2);

        // Check distance from other portals (basic spacing)
        validPosition = true;
        for (let i = 0; i < index; i++) {
          // This is a simplified check - in a real implementation you'd track portal positions
          // For now, we rely on the random distribution and large world size
        }

        attempts++;
      }

      // Final fallback positions if random placement fails
      if (!validPosition) {
        const fallbackPositions = [
          { x: this.worldWidth * 0.25, y: this.worldHeight * 0.25 }, // Top-left quadrant
          { x: this.worldWidth * 0.75, y: this.worldHeight * 0.25 }, // Top-right quadrant
          { x: this.worldWidth * 0.5, y: this.worldHeight * 0.75 }, // Bottom-center
        ];
        const fallback = fallbackPositions[index] || fallbackPositions[0];
        x = fallback.x;
        y = fallback.y;
      }

      this.addEntities(
        `portal_${portalType}_${index}`,
        EntityKind.PORTAL,
        entities,
        x!,
        y!,
        {
          type: 'portal',
          portalType: portalType,
          indestructible: true,
          hasCollision: true,
          interactionRadius: 200,
          // Future: Add portal destination, activation requirements, etc.
        }
      );

      console.log(
        `🌀 Added ${portalType} portal at (${Math.floor(x!)}, ${Math.floor(y!)})`
      );
    });
  }

  generateTreasureChests(entities: EntitySchemaType[]) {
    // Add treasure chests (one per map)
    const numChests = 1;
    console.log(`🗝️ MapGenerator: Creating ${numChests} treasure chest`);
    for (let i = 0; i < numChests; i++) {
      // Spawn treasure chest in center area where players are likely to be
      const centerX = this.worldWidth / 2;
      const centerY = this.worldHeight / 2;
      const spawnRadius = 300; // Keep within 300px of center

      const angle = this.seededRandom() * Math.PI * 2;
      const distance = this.seededRandom() * spawnRadius;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      this.addEntities(
        `treasure_chest_${i}`,
        EntityKind.TREASURE_CHEST,
        entities,
        x,
        y,
        {
          opened: false,
          loot: [
            { type: 'coin', amount: Math.floor(this.seededRandom() * 16) + 5 },
          ],
        }
      );
    }
  }

  generateDroppedItems(entities: EntitySchemaType[]) {
    // Add random dropped items around the map
    const itemTypes = ['potion', 'sword', 'shield', 'gem'];
    const numItems = 8 + Math.floor(this.seededRandom() * 5); // 8-12 items
    console.log(`🎁 MapGenerator: Creating ${numItems} dropped items`);

    for (let i = 0; i < numItems; i++) {
      // Random position avoiding edges
      const padding = 150;
      const x = padding + this.seededRandom() * (this.worldWidth - padding * 2);
      const y =
        padding + this.seededRandom() * (this.worldHeight - padding * 2);

      // Random item type
      const rawItemType =
        itemTypes[Math.floor(this.seededRandom() * itemTypes.length)];

      // Map raw item types to valid ItemState types
      const itemTypeMap: Record<string, InventoryItem['type']> = {
        potion: 'potion',
        sword: 'weapon',
        shield: 'weapon',
        gem: 'material',
      };

      const itemType = itemTypeMap[rawItemType] || 'material';

      this.addItemEntity(`item_${i}`, entities, x, y, {
        type: itemType,
        name: rawItemType.charAt(0).toUpperCase() + rawItemType.slice(1),
        quantity: 1,
        rarity: 'common',
      });
    }
  }

  generateWearables(entities: EntitySchemaType[]) {
    // Add random wearable items around the map (rarer than regular items)
    const numWearables = 3 + Math.floor(this.seededRandom() * 3); // 3-5 wearables
    console.log(`👑 MapGenerator: Creating ${numWearables} wearable items`);

    // Use imported wearables data for proper names (server-local generated data)

    // Common wearable IDs that players might find interesting (basic wearables)
    const commonWearableIds = [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10, // Basic items like Camo Hat, Camo Pants, etc.
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      350,
      351,
      352,
      353, // Pixelcraft items
      370,
      371,
      372, // Party/decorative items
    ];

    for (let i = 0; i < numWearables; i++) {
      // Random position avoiding edges
      const padding = 150;
      const x = padding + this.seededRandom() * (this.worldWidth - padding * 2);
      const y =
        padding + this.seededRandom() * (this.worldHeight - padding * 2);

      // Random wearable ID
      const wearableId =
        commonWearableIds[
          Math.floor(this.seededRandom() * commonWearableIds.length)
        ];

      // Get the actual wearable data for proper name and info
      const wearableData = itemTypes[wearableId];
      const wearableName = wearableData?.name || `Wearable ${wearableId}`;
      const wearableSlugCandidate = slugifyWearableName(wearableName);

      const qualityRoll = this.seededRandom();
      let quality: WearableQuality = 'average';
      for (const entry of WEARABLE_QUALITY_THRESHOLDS) {
        if (qualityRoll < entry.threshold) {
          quality = entry.quality;
          break;
        }
      }

      const durabilityBounds = WEARABLE_DURABILITY_BOUNDS[quality];
      const durabilityScore = (() => {
        const [min, max] = durabilityBounds;
        const clampedMin = Math.max(1, Math.floor(min));
        const clampedMax = Math.max(clampedMin, Math.floor(max));
        if (clampedMax <= clampedMin) {
          return clampedMin;
        }
        return (
          clampedMin +
          Math.floor(this.seededRandom() * (clampedMax - clampedMin + 1))
        );
      })();

      const qualityScore = Math.floor(
        (durabilityBounds[0] + durabilityBounds[1]) / 2
      );
      const wearableSlug = wearableSlugCandidate || `wearable-${wearableId}`;

      // Determine rarity based on wearable trait modifiers magnitude
      let rarity = 'common';
      if (wearableData?.traitModifiers) {
        const sum = (wearableData.traitModifiers as number[]).reduce(
          (acc: number, val: number) => acc + Math.abs(val || 0),
          0
        );
        if (sum >= 6) rarity = 'godlike';
        else if (sum >= 5) rarity = 'mythical';
        else if (sum >= 4) rarity = 'legendary';
        else if (sum >= 3) rarity = 'rare';
        else if (sum >= 2 || wearableId >= 350) rarity = 'uncommon';
        else rarity = 'common';
      }

      this.addItemEntity(`wearable_${i}`, entities, x, y, {
        type: 'wearable',
        wearableId: wearableId,
        name: wearableName,
        quantity: 1,
        rarity: rarity as InventoryItem['rarity'],
        wearableSlug,
        quality,
        qualityScore,
        durabilityScore,
        slot: wearableData?.slotPositions,
        stats: {
          AGG: wearableData?.traitModifiers?.[0] || 0,
          NRG: wearableData?.traitModifiers?.[1] || 0,
          SPK: wearableData?.traitModifiers?.[2] || 0,
          BRN: wearableData?.traitModifiers?.[3] || 0,
        },
      });
    }
  }

  getAllTiles(): MapTile[][] {
    return this.tiles;
  }
}
