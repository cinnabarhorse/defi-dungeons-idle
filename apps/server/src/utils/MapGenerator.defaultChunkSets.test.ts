describe('MapGenerator default chunk sets', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('falls back to empty chunk sets (and sane pixel size default) when loadDefaultMapChunks throws', async () => {
    jest.doMock('src/data/maps-loader', () => ({
      loadDefaultMapChunks: () => {
        throw new Error('boom');
      },
    }));

    const { MapGenerator } = await import('./MapGenerator');
    const { GAME_CONFIG } = await import('../lib/constants');

    const mg = new MapGenerator(123, 50, 50, 'normal');

    expect(mg.getChunkPixelSize()).toEqual({
      widthPx: 20 * GAME_CONFIG.TILE_SIZE,
      heightPx: 20 * GAME_CONFIG.TILE_SIZE,
    });
  });

  test('uses chunk sets returned by loadDefaultMapChunks when available', async () => {
    jest.doMock('src/data/maps-loader', () => ({
      loadDefaultMapChunks: () => ({
        dungeon: [
          {
            name: 'dungeon-room-1',
            width: 7,
            height: 9,
            instances: 0,
            type: 'room',
            assets: [],
          },
        ],
        grass: [],
      }),
    }));

    const { MapGenerator } = await import('./MapGenerator');
    const { GAME_CONFIG } = await import('../lib/constants');

    const mg = new MapGenerator(123, 50, 50, 'normal');

    expect(mg.getChunkPixelSize()).toEqual({
      widthPx: 7 * GAME_CONFIG.TILE_SIZE,
      heightPx: 9 * GAME_CONFIG.TILE_SIZE,
    });
  });
});
