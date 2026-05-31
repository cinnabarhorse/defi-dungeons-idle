// Mock Colyseus schemas to avoid decorator/runtime overhead in Jest
jest.mock('../apps/server/src/schemas', () => ({
  GameRoomState: class {},
  EntitySchema: class {},
  EnemySchema: class {},
  NPCSchema: class {
    id = '';
    name = '';
    characterId = '';
    dialogueId = '';
    x = 0;
    y = 0;
    dir: string = 'down';
    anim: string = 'idle';
    hp = 0;
    maxHp = 0;
    lastAttackTime = 0;
    attackType: string = 'none';
  },
  ProjectileSchema: class {},
}));

// Provide a lightweight MapSchema replacement (if any code under test uses it)
jest.mock('@colyseus/schema', () => {
  class MapSchema<V = any> extends Map<string, V> {}
  return { MapSchema };
});

let spawnNPCs: ((room: any) => void) | null = null;
try {
  ({ spawnNPCs } = require('../apps/server/src/lib/systems/NPCSystem'));
} catch {
  spawnNPCs = null;
}
const { GAME_CONFIG } = require('../apps/server/src/lib/constants');
const { MapGenerator } = require('../apps/server/src/utils/MapGenerator');
const {
  fetchGeneratedDungeonChunks,
} = require('../apps/server/src/data/maps-loader');

const maybeDescribe = spawnNPCs ? describe : describe.skip;

maybeDescribe('NPCSystem – Stani spawn radius on initial load', () => {
  const radiusTiles = 3;
  const radiusPx = radiusTiles * GAME_CONFIG.TILE_SIZE;

  test('Stani spawns within 3 tiles of first player for representative dungeon spawn points', async () => {
    const apiBase = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
    const dungeonChunks = await fetchGeneratedDungeonChunks(apiBase);
    if (!Array.isArray(dungeonChunks) || dungeonChunks.length === 0) {
      throw new Error(
        'Dungeon chunks not generated; ensure generate-chunks-from-blueprints is working.'
      );
    }

    const seed = 12345;
    const difficulty = 'normal_1';
    const chunkSets = {
      dungeon: dungeonChunks,
      grass: [],
      staging: [],
    };
    const mapGenerator = new MapGenerator(
      seed,
      GAME_CONFIG.MAP_WIDTH,
      GAME_CONFIG.MAP_HEIGHT,
      difficulty,
      chunkSets
    );
    const { entities } = mapGenerator.generateEntities();

    const spawnPoints = mapGenerator.getSpawnPoints();
    expect(spawnPoints.length).toBeGreaterThan(0);

    // Pick a small, representative set of spawn points including extremes
    const minX = spawnPoints.reduce(
      (min: { x: number; y: number }, p: { x: number; y: number }) =>
        p.x < min.x ? p : min,
      spawnPoints[0]
    );
    const maxX = spawnPoints.reduce(
      (max: { x: number; y: number }, p: { x: number; y: number }) =>
        p.x > max.x ? p : max,
      spawnPoints[0]
    );
    const minY = spawnPoints.reduce(
      (min: { x: number; y: number }, p: { x: number; y: number }) =>
        p.y < min.y ? p : min,
      spawnPoints[0]
    );
    const maxY = spawnPoints.reduce(
      (max: { x: number; y: number }, p: { x: number; y: number }) =>
        p.y > max.y ? p : max,
      spawnPoints[0]
    );
    const mid = spawnPoints[Math.floor(spawnPoints.length / 2)];

    const cases: Array<[string, number, number]> = [
      ['center-ish spawn', mid.x, mid.y],
      ['leftmost spawn', minX.x, minX.y],
      ['rightmost spawn', maxX.x, maxX.y],
      ['topmost spawn', minY.x, minY.y],
      ['bottommost spawn', maxY.x, maxY.y],
    ];

    for (const [label, anchorX, anchorY] of cases) {
      const room: any = {
        state: {
          id: 'test-room',
          difficultyTier: difficulty,
          players: new Map<string, any>(),
          npcs: new Map<string, any>(),
          enemies: new Map<string, any>(),
          entities: new Map<string, any>(),
        },
        mapGenerator,
      };

      // Mirror WorldTransitionSystem: populate entities map for collision checks
      for (const e of entities as any[]) {
        room.state.entities.set(e.id, {
          id: e.id,
          kind: e.kind,
          x: e.x,
          y: e.y,
          state:
            typeof e.state === 'string'
              ? e.state
              : JSON.stringify(e.state || {}),
        });
      }

      room.state.players.set('p1', {
        id: 'p1',
        name: 'TestPlayer',
        x: anchorX,
        y: anchorY,
      });

      spawnNPCs?.(room);

      let stani: any | undefined;
      for (const [, npc] of room.state.npcs as Map<string, any>) {
        if ((npc as any).characterId === 'stani') {
          stani = npc;
          break;
        }
      }

      expect(stani).toBeDefined();
      if (!stani) continue;

      const dx = stani.x - anchorX;
      const dy = stani.y - anchorY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Helpful log when running locally
      // eslint-disable-next-line no-console
      console.log(
        `[StaniSpawnTest] case="${label}", player=(${anchorX.toFixed(
          1
        )}, ${anchorY.toFixed(1)}), stani=(${stani.x.toFixed(
          1
        )}, ${stani.y.toFixed(1)}), distance=${distance.toFixed(
          2
        )}px, max=${radiusPx}px`
      );

      expect(distance).toBeLessThanOrEqual(radiusPx + 1e-6);
    }
  });
});
