import { GAME_CONFIG } from '../lib/constants';
import { MapGenerator, type Chunk } from './MapGenerator';

const makeChunk = (partial: Partial<Chunk>): Chunk => {
  return {
    name: partial.name ?? 'chunk',
    width: partial.width ?? 10,
    height: partial.height ?? 10,
    instances: partial.instances ?? 0,
    priority: partial.priority,
    type: partial.type,
    assets: partial.assets ?? [],
    meta: partial.meta,
  };
};

describe('MapGenerator', () => {
  test('difficultyTier normalization does not affect chunk selection (always dungeon) and getChunkPixelSize uses selected chunk dimensions', () => {
    const dungeonChunks: Chunk[] = [
      makeChunk({ name: 'my-dungeon', width: 7, height: 9, type: 'room' }),
    ];

    const mg = new MapGenerator(123, 50, 50, 'HeLl-1', {
      dungeon: dungeonChunks,
      grass: [],
    });

    const size = mg.getChunkPixelSize();

    // We can't easily assert GAME_CONFIG.TILE_SIZE here without importing constants,
    // but we can assert proportionality by checking the base tile-size divisor.
    expect(size.widthPx / 7).toBe(size.heightPx / 9);
  });

  test('getChunkPixelSize falls back to 20x20 tiles when chunks are unavailable', () => {
    const mg = new MapGenerator(123, 50, 50, 'normal', {
      dungeon: [],
      grass: [],
    });

    const size = mg.getChunkPixelSize();

    expect(size).toEqual({
      widthPx: 20 * GAME_CONFIG.TILE_SIZE,
      heightPx: 20 * GAME_CONFIG.TILE_SIZE,
    });
  });

  test('getFloorTiles returns a copy of the floor bitmap and setFloorRect clamps to bounds', () => {
    const mg = new MapGenerator(1, 8, 8, 'normal', {
      dungeon: [makeChunk({ name: 'room', type: 'room', width: 8, height: 8 })],
      grass: [],
    });

    // Mark a rect that extends out of bounds (and uses reversed coords).
    const setFloorRect = (mg as any).setFloorRect.bind(mg) as (
      txStart: number,
      tyStart: number,
      txEnd: number,
      tyEnd: number
    ) => void;

    setFloorRect(1, 1, -2, -2);

    const tiles1 = mg.getFloorTiles();
    expect(tiles1.size).toBe(4); // (0,0) (1,0) (0,1) (1,1)
    expect(tiles1.has('0,0')).toBe(true);
    expect(tiles1.has('1,1')).toBe(true);

    // Ensure we return a copy rather than a live view
    tiles1.clear();
    const tiles2 = mg.getFloorTiles();
    expect(tiles2.size).toBe(4);
  });

  test('inferPorts: connector chunks prefer horizontal vs vertical port pairs and estimate center from floor assets (even with out-of-range coords)', () => {
    const dungeonChunks: Chunk[] = [makeChunk({ name: 'placeholder', type: 'room' })];

    const mg = new MapGenerator(1, 64, 64, 'normal', {
      dungeon: dungeonChunks,
      grass: [],
    });

    const inferPorts = (mg as any).inferPorts.bind(mg) as (c: Chunk) => Array<{
      side: 'N' | 'S' | 'E' | 'W';
      centerOffsetTiles: number;
      widthTiles: number;
    }>;

    const horiz = makeChunk({
      name: 'connector-horizontal-01',
      type: 'connector',
      width: 20,
      height: 20,
      assets: [
        // floor tiles with y coords far outside [0,height) to exercise modulo-normalization
        { id: 'f1', assetId: 'f', x: 0, y: 121, category: 'floors' },
        { id: 'f2', assetId: 'f', x: 0, y: -39, category: 'floors' },
        { id: 'f3', assetId: 'f', x: 0, y: 1, category: 'floors' },
      ],
    });

    const hp = inferPorts(horiz);
    expect(hp.map((p) => p.side).sort()).toEqual(['E', 'W']);
    expect(hp[0].widthTiles).toBeGreaterThanOrEqual(1);
    // center should be within the chunk height bounds
    expect(hp[0].centerOffsetTiles).toBeGreaterThanOrEqual(0);
    expect(hp[0].centerOffsetTiles).toBeLessThan(horiz.height);

    const vert = makeChunk({
      name: 'connector-vertical-01',
      type: 'connector',
      width: 20,
      height: 20,
      meta: { orientation: 'v' },
      assets: [
        { id: 'f1', assetId: 'f', x: 101, y: 0, category: 'floors' },
        { id: 'f2', assetId: 'f', x: -19, y: 0, category: 'floors' },
        { id: 'f3', assetId: 'f', x: 2, y: 0, category: 'floors' },
      ],
    });

    const vp = inferPorts(vert);
    expect(vp.map((p) => p.side).sort()).toEqual(['N', 'S']);
    expect(vp[0].centerOffsetTiles).toBeGreaterThanOrEqual(0);
    expect(vp[0].centerOffsetTiles).toBeLessThan(vert.width);
  });

  test('carveConnectionsUsingPorts carves floor tiles across seams when ports exist', () => {
    // Keep bitmap small and deterministic; we only assert that carving marks expected seam tiles.
    const baseRoom = makeChunk({ name: 'room', type: 'room', width: 10, height: 10 });
    const connector = makeChunk({
      name: 'connector-horizontal',
      type: 'connector',
      width: 10,
      height: 10,
      meta: { orientation: 'h' },
      assets: [{ id: 'f', assetId: 'f', x: 0, y: 5, category: 'floors' }],
    });

    const mg = new MapGenerator(42, 64, 64, 'normal', {
      dungeon: [baseRoom, connector],
      grass: [],
    });

    const carve = (mg as any).carveConnectionsUsingPorts.bind(mg) as (
      grid: (Chunk | null)[][],
      gridCols: number,
      gridRows: number,
      chunkWidthTiles: number,
      chunkHeightTiles: number
    ) => void;

    // 1 row, 2 cols: left (connector) -> right (connector)
    const grid: (Chunk | null)[][] = [[connector, connector]];

    carve(grid, 2, 1, 10, 10);

    // seam between col0 and col1 is at x=10; carving should mark some tiles near that seam.
    // choose a tile well within expected carved rect
    expect(mg.hasFloorTile(10, 5)).toBe(true);
    expect(mg.hasFloorTile(9, 5)).toBe(true);
    expect(mg.hasFloorTile(11, 5)).toBe(true);
  });

  test('getChunkPixelSize falls back to a default when no usable chunks exist', () => {
    const mgEmpty = new MapGenerator(123, 50, 50, 'normal', {
      dungeon: [],
      grass: [],
    });

    const sizeEmpty = mgEmpty.getChunkPixelSize();
    // Default is 20x20 tiles
    expect(sizeEmpty.widthPx).toBe(sizeEmpty.heightPx);
    expect(sizeEmpty.widthPx).toBeGreaterThan(0);

    // If only "stamp" chunks exist, it should still fall back to the first chunk
    // (covers the secondary selection path).
    const stampOnly: Chunk[] = [
      makeChunk({ name: 'stamp', type: 'stamp', width: 13, height: 17 }),
    ];
    const mgStampOnly = new MapGenerator(123, 50, 50, 'normal', {
      dungeon: stampOnly,
      grass: [],
    });

    const sizeStampOnly = mgStampOnly.getChunkPixelSize();
    expect(sizeStampOnly.widthPx / 13).toBe(sizeStampOnly.heightPx / 17);
  });

  test('setFloorRect clamps to bitmap bounds and supports reversed coordinates', () => {
    const dungeonChunks: Chunk[] = [makeChunk({ name: 'room', type: 'room' })];
    const mg = new MapGenerator(1, 10, 10, 'normal', {
      dungeon: dungeonChunks,
      grass: [],
    });

    const setFloorRect = (mg as any).setFloorRect.bind(mg) as (
      txStart: number,
      tyStart: number,
      txEnd: number,
      tyEnd: number
    ) => void;

    // Negative start should clamp to 0,0
    setFloorRect(-5, -5, 2, 2);
    expect(mg.hasFloorTile(0, 0)).toBe(true);
    expect(mg.hasFloorTile(2, 2)).toBe(true);
    expect(mg.hasFloorTile(3, 3)).toBe(false);

    // Reversed coordinates should still work (inclusive)
    setFloorRect(5, 5, 3, 3);
    expect(mg.hasFloorTile(3, 3)).toBe(true);
    expect(mg.hasFloorTile(5, 5)).toBe(true);
  });

  test('generateWearables never creates flawless dungeon drops', () => {
    const mg = new MapGenerator(123, 500, 500, 'normal', {
      dungeon: [makeChunk({ name: 'room', type: 'room' })],
      grass: [],
    });
    const entities: Array<{ state?: string }> = [];

    (mg as any).generateWearables(entities);

    const wearableStates = entities
      .map((entity) => {
        try {
          return entity.state ? JSON.parse(entity.state) : null;
        } catch {
          return null;
        }
      })
      .filter((state) => state?.type === 'wearable');

    expect(wearableStates.length).toBeGreaterThan(0);
    wearableStates.forEach((state) => {
      expect(state.quality).not.toBe('flawless');
    });
  });
});
