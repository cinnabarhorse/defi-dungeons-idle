// Mock modules that import Colyseus schemas to avoid decorator runtime
jest.mock('../apps/server/src/schemas', () => ({
  GameRoomState: class {},
  EntitySchema: class {},
  EnemySchema: class {},
  NPCSchema: class {},
  ProjectileSchema: class {},
}));

// Provide a lightweight MapSchema replacement
jest.mock('@colyseus/schema', () => {
  class MapSchema<V = any> extends Map<string, V> {}
  return { MapSchema };
});

const hasEnemySpawnSystem = (() => {
  try {
    require.resolve('../apps/server/src/lib/systems/EnemySpawnSystem');
    return true;
  } catch {
    return false;
  }
})();

if (hasEnemySpawnSystem) {
  // Stub out heavy systems not relevant to the assertion
  jest.doMock('../apps/server/src/lib/systems/EnemySpawnSystem', () => {
    const original = jest.requireActual(
      '../apps/server/src/lib/systems/EnemySpawnSystem'
    );
    return {
      ...original,
      spawnEnemyOfType: jest.fn(),
      getRandomEnemyType: jest.fn(() => 'slime'),
    };
  });
  jest.doMock('../apps/server/src/lib/systems/PortalSystem', () => ({
    spawnFloorPortals: jest.fn(),
  }));
  jest.doMock('src/utils/MapGenerator', () => ({
    MapGenerator: jest.fn().mockImplementation(() => ({
      generateEntities: () => ({
        entities: [],
        enemySpawns: [],
        chunkLayout: [],
      }),
      chunkSets: {},
      getSpawnPoints: () => [{ x: 100, y: 100 }],
      getChunkPixelSize: () => ({ widthPx: 640, heightPx: 640 }),
    })),
  }));
}

const {
  transitionAllPlayersToNewMap,
} = hasEnemySpawnSystem
  ? require('../apps/server/src/lib/systems/WorldTransitionSystem')
  : { transitionAllPlayersToNewMap: null };

const maybeDescribe = hasEnemySpawnSystem ? describe : describe.skip;

maybeDescribe('Elites – spawn on map transition', () => {
  test('calls elite reset and spawn during transition', () => {
    const room: any = {
      state: {
        players: new Map<string, any>([
          ['p1', { id: 'p1', hp: 100, maxHp: 100, x: 0, y: 0 }],
        ]),
      },
      // Required by ensureServerBroadcaster
      broadcast: (_type: string, _payload?: any) => {},
      // Hooks we expect to be invoked by transitionAllPlayersToNewMap
      resetEliteStateForNewMap: jest.fn(),
      spawnElitesForDungeon: jest.fn(),
    };

    // Act
    transitionAllPlayersToNewMap?.(room as any, 'normal_1');

    // Assert: regression guard - elites must be reset and spawned on new map
    expect(room.resetEliteStateForNewMap).toHaveBeenCalledTimes(1);
    expect(room.spawnElitesForDungeon).toHaveBeenCalledTimes(1);

    // Cleanup any scheduled timers from transition
    if (room.timedSpawnInterval) {
      clearInterval(room.timedSpawnInterval);
      room.timedSpawnInterval = null;
    }
  });
});
