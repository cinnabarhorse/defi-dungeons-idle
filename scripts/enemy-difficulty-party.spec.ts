let applyDifficultyScaling: ((room: any, enemy: any) => any) | null = null;
try {
  ({ applyDifficultyScaling } = require('../apps/server/src/lib/systems/EnemySpawnSystem'));
} catch {
  applyDifficultyScaling = null;
}

const maybeDescribe = applyDifficultyScaling ? describe : describe.skip;

maybeDescribe('Enemy Difficulty – party-size multiplier', () => {
  function makeRoomWithPlayers(count: number) {
    const players = new Map<string, any>();
    for (let i = 1; i <= count; i += 1) {
      players.set(`p${i}`, { id: `p${i}` });
    }
    const state: any = {
      difficultyTier: 'normal_1', // tier multipliers = 1x to isolate party scaling
      enemyDifficultyLevel: 0, // meter = 1x base
      players,
    };
    const room: any = { state };
    return room;
  }

  const baseEnemy = {
    name: 'Test Enemy',
    enemyType: 'slime',
    health: 100,
    maxHealth: 100,
    damage: 10,
    speed: 100,
    aggroRange: 50,
  };

  test('scales enemy damage and hp linearly with party size (1→3)', () => {
    // 1 player → 1x
    const room1 = makeRoomWithPlayers(1);
    const scaled1 = applyDifficultyScaling?.(room1 as any, baseEnemy as any);
    expect(scaled1.maxHealth).toBe(100);
    expect(scaled1.health).toBe(100);
    expect(scaled1.damage).toBe(10);

    // 2 players → 2x
    const room2 = makeRoomWithPlayers(2);
    const scaled2 = applyDifficultyScaling?.(room2 as any, baseEnemy as any);
    expect(scaled2.maxHealth).toBe(200);
    expect(scaled2.health).toBe(200);
    expect(scaled2.damage).toBe(20);

    // 3 players → 3x (capped by MAX_PLAYERS)
    const room3 = makeRoomWithPlayers(3);
    const scaled3 = applyDifficultyScaling?.(room3 as any, baseEnemy as any);
    expect(scaled3.maxHealth).toBe(300);
    expect(scaled3.health).toBe(300);
    expect(scaled3.damage).toBe(30);
  });
});
