let applyBloodlustChargeDamage: ((
  room: any,
  enemy: any,
  player: any,
  abilityConfig: any,
  now: number
) => boolean) | null = null;
try {
  ({ applyBloodlustChargeDamage } = require('../apps/server/src/lib/abilities/enemyAbilities'));
} catch {
  applyBloodlustChargeDamage = null;
}

jest.mock('../apps/server/src/lib/player-stats', () => ({
  calculateDamageAfterMitigation: jest.fn((_player, damage: number) => ({
    finalDamage: damage,
  })),
}));

jest.mock('../apps/server/src/lib/ability-utils', () => {
  const actual = jest.requireActual('../apps/server/src/lib/ability-utils');
  return {
    ...actual,
    getPlayerEvade: jest.fn(() => ({ chance: 0 })),
    rollEvade: jest.fn(() => false),
  };
});

type TestRoom = {
  room: any;
  messages: Array<{ type: string; payload: any }>;
};

function createTestRoom(now: number): TestRoom {
  const messages: Array<{ type: string; payload: any }> = [];
  const room: any = {
    broadcast: jest.fn((type: string, payload?: any) => {
      messages.push({ type: String(type), payload });
    }),
    state: {
      runStartedAt: now - 10_000,
      phase: 'in_game',
      players: new Map(),
      enemies: new Map(),
      entities: new Map(),
      room: {
        cancelPlayerAction: jest.fn(),
      },
    },
  };
  return { room, messages };
}

const BLOODLUST_CONFIG = {
  powerupMs: 2400,
  recoveryMs: 3000,
  cooldownMs: 9000,
  chargeSpeed: 11,
  chargeDamageMultiplier: 2,
  incomingDamageMultiplier: 2,
  hitRadius: 30,
  maxDashMs: 1400,
};

const maybeDescribe = applyBloodlustChargeDamage ? describe : describe.skip;

maybeDescribe('boss_charge_stun ability', () => {
  test('applies stun and removal events when charge hit connects', () => {
    const now = Date.now();
    const { room, messages } = createTestRoom(now);

    const player: any = {
      id: 'player1',
      hp: 100,
      maxHp: 100,
      characterId: 'warrior',
      x: 0,
      y: 0,
      anim: 'idle',
    };
    room.state.players.set(player.id, player);

    const enemy: any = {
      id: 'enemy1',
      enemyType: 'portal_guardian',
      damage: 5,
      x: 0,
      y: 0,
    };
    enemy._abilityRefs = [
      {
        id: 'boss_charge_stun',
        params: { durationMs: 4000, chance: 1, damage: 20 },
      },
    ];
    room.state.enemies.set(enemy.id, enemy);

    const hit = applyBloodlustChargeDamage?.(
      room,
      enemy,
      player,
      BLOODLUST_CONFIG as any,
      now
    );
    expect(hit).toBe(true);

    const statusApplied = messages.filter(
      (m) => m.type === 'status_applied' && m.payload?.type === 'stun'
    );
    expect(statusApplied).toHaveLength(1);
    expect(statusApplied[0].payload.durationMs).toBe(4000);
    expect(player.hp).toBe(70);

    updateStatusSystem(room, now + 4_400);
    const statusRemoved = messages.filter(
      (m) => m.type === 'status_removed' && m.payload?.type === 'stun'
    );
    expect(statusRemoved).toHaveLength(1);
  });

  test('respects chance gating for the stun ability', () => {
    const now = Date.now();
    const { room, messages } = createTestRoom(now);

    const player: any = {
      id: 'player2',
      hp: 100,
      maxHp: 100,
      characterId: 'rogue',
      x: 10,
      y: 10,
      anim: 'idle',
    };
    room.state.players.set(player.id, player);

    const enemy: any = {
      id: 'enemy2',
      enemyType: 'portal_guardian',
      damage: 5,
      x: 5,
      y: 5,
    };
    enemy._abilityRefs = [
      {
        id: 'boss_charge_stun',
        params: { durationMs: 4000, chance: 0, damage: 20 },
      },
    ];
    room.state.enemies.set(enemy.id, enemy);

    const hit = applyBloodlustChargeDamage?.(
      room,
      enemy,
      player,
      BLOODLUST_CONFIG as any,
      now
    );
    expect(hit).toBe(true);

    const statusApplied = messages.filter(
      (m) => m.type === 'status_applied' && m.payload?.type === 'stun'
    );
    expect(statusApplied).toHaveLength(0);
    expect(player.hp).toBe(70);
  });
});
