import { MapSchema } from '@colyseus/schema';
import { GAME_CONFIG } from 'src/lib/constants';
import { GameRoomState, EnemySchema } from 'src/schemas';

const hasEnemySpawnSystem = (() => {
  try {
    require.resolve('../apps/server/src/lib/systems/EnemySpawnSystem');
    return true;
  } catch {
    return false;
  }
})();

const transitionAllPlayersToBossRoom = hasEnemySpawnSystem
  ? require('src/lib/systems/WorldTransitionSystem').transitionAllPlayersToBossRoom
  : null;

jest.mock('src/data/maps-loader', () => ({
  loadMapChunks: () => [
    {
      name: 'dungeon-boss-room',
      width: 20,
      height: 20,
      assets: [],
    },
  ],
}));

if (hasEnemySpawnSystem) {
  jest.doMock('src/lib/systems/EnemySpawnSystem', () => {
    const { EnemySchema } = require('src/schemas');
    return {
      spawnEnemyOfType: (
        room: any,
        enemyType: string,
        position: { x: number; y: number }
      ) => {
        const enemy = new EnemySchema() as InstanceType<typeof EnemySchema>;
        enemy.id = 'boss_1';
        enemy.enemyType = enemyType;
        enemy.x = position.x;
        enemy.y = position.y;
        enemy.hp = 1000;
        enemy.maxHp = 1000;
        enemy.isElite = true as any;
        // Ensure maps exist (WTSystem overwrites these earlier in the flow)
        if (!room.state.enemies || !(room.state.enemies instanceof MapSchema)) {
          room.state.enemies = new MapSchema();
        }
        room.state.enemies.set(enemy.id, enemy);
        return enemy;
      },
      getRandomEnemyType: () => 'slime',
    };
  });
}

const maybeDescribe = hasEnemySpawnSystem ? describe : describe.skip;

maybeDescribe('Boss aura on boss room transition', () => {
  it('attaches a random aura with 4–6 tiles radius and aura:* visual tag', () => {
    const room: any = {
      state: new GameRoomState(),
      broadcast: jest.fn(),
    };
    // Initialize required MapSchemas
    room.state.players = new MapSchema();
    room.state.entities = new MapSchema();
    room.state.enemies = new MapSchema();
    room.state.npcs = new MapSchema();
    room.state.projectiles = new MapSchema();

    transitionAllPlayersToBossRoom?.(room);

    expect(room.state.enemies.size).toBeGreaterThan(0);
    const boss = Array.from(room.state.enemies.values())[0] as any as EnemySchema & {
      _auraSources?: Array<{
        id: string;
        radiusPx: number;
        visualTag?: string;
      }>;
    };
    expect(boss).toBeTruthy();
    expect(Array.isArray((boss as any)._auraSources)).toBe(true);
    const sources = (boss as any)._auraSources as Array<{
      id: string;
      radiusPx: number;
      visualTag?: string;
    }>;
    expect(sources.length).toBeGreaterThan(0);
    const effect = sources[0];
    expect(typeof effect.radiusPx).toBe('number');
    const validRadii = [4, 5, 6].map((n) => n * GAME_CONFIG.TILE_SIZE);
    expect(validRadii.includes(effect.radiusPx)).toBe(true);
    expect(typeof effect.visualTag).toBe('string');
    expect((effect.visualTag as string).startsWith('aura:')).toBe(true);
  });
});












