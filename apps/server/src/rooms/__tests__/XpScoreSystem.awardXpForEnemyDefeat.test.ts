import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../data/enemies', () => ({
  getEnemyStats: jest.fn(() => ({
    enemyType: 'slime',
    classification: 'normal',
    baseXp: 100,
  })),
}));

jest.mock('../../lib/progression/killStreak', () => ({
  getKillStreakUnitDeltaForClassification: jest.fn(() => 0),
}));

jest.mock('../../data/game-config', () => ({
  GAME_CONFIG: {
    leverage: {
      xpMultiplierEnabled: true,
    },
  },
}));

jest.mock('../../lib/constants', () => ({
  SCORE_CONFIG: {
    enabled: true,
    maxValue: 999999,
  },
}));

import * as XpScoreSystem from '../XpScoreSystem';
import { GAME_CONFIG } from '../../data/game-config';

function makeRoom(overrides: Partial<any> = {}) {
  const room: any = {
    state: {
      players: new Map<string, any>(),
    },
    getDifficultyXpMultiplier: jest.fn(() => 1),
    getGroupXpMultiplier: jest.fn(() => 1),
    getLeverageTotal: jest.fn(() => 2),
    getPlayerIdForSession: jest.fn((sessionId: string) => `player:${sessionId}`),
    awardXpToPlayer: jest.fn(),

    // used by score tracking helpers
    // @ts-expect-error - intentional test-only access
    playerScoreStateByPlayerId: new Map(),
    // @ts-expect-error - intentional test-only access
    pendingScoreDeltas: new Map(),
    playersDiedThisRunByPlayerId: new Set(),

    // called when a valid killer exists + unitDelta > 0
    // @ts-expect-error - intentional test-only access
    awardKillStreakUnitsToPlayer: jest.fn(),

    ...overrides,
  };

  return room;
}

function addPlayer(room: any, sessionId: string, opts: { dailyQuestActive?: boolean } = {}) {
  room.state.players.set(sessionId, {
    id: sessionId,
    dailyQuestActive: opts.dailyQuestActive ?? false,
  });
}

describe('awardXpForEnemyDefeat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TRADING_GAME_ENABLED;
    // Ensure we never leak config changes across tests
    GAME_CONFIG.leverage.xpMultiplierEnabled = true;
    (GAME_CONFIG as any).trading = {
      ...(GAME_CONFIG as any).trading,
      settlementEnabled: false,
    };
  });

  it('splits XP 60/40 when killer is in party; applies leverage multiplier; tracks actual XP after mode reduction', () => {
    const room = makeRoom();
    addPlayer(room, 'killer', { dailyQuestActive: false });
    addPlayer(room, 'other', { dailyQuestActive: false });

    const awarded = XpScoreSystem.awardXpForEnemyDefeat(
      room,
      { enemyType: 'slime' },
      'enemy-1',
      'melee',
      'killer'
    );

    // totalXpPool = baseXp(100) * 1 * 1 = 100
    // killer base share: 60, other base share: 40
    // leverage=2, xpMultiplierEnabled=true => xp passed to awardXpToPlayer is share*2
    expect(room.awardXpToPlayer).toHaveBeenCalledWith(
      'killer',
      120,
      expect.objectContaining({
        enemyId: 'enemy-1',
        attackType: 'melee',
      })
    );
    expect(room.awardXpToPlayer).toHaveBeenCalledWith(
      'other',
      80,
      expect.any(Object)
    );

    // In progression mode we track the "actual" XP after the 10% reduction.
    expect(awarded.get('killer')).toBe(12);
    expect(awarded.get('other')).toBe(8);

    // Score deltas should be queued (uses raw share * leverage)
    // killer: 60 * 2 = 120, other: 40 * 2 = 80
    // @ts-expect-error - intentional test-only access
    expect(room.pendingScoreDeltas.get('killer')).toBe(120);
    // @ts-expect-error - intentional test-only access
    expect(room.pendingScoreDeltas.get('other')).toBe(80);
  });

  it('falls back to equal split when killerId is not a sessionId; and does not apply leverage multiplier when disabled', () => {
    // turn off XP multiplier
    GAME_CONFIG.leverage.xpMultiplierEnabled = false;

    const room = makeRoom({
      getLeverageTotal: jest.fn(() => 5),
    });
    addPlayer(room, 'a', { dailyQuestActive: true });
    addPlayer(room, 'b', { dailyQuestActive: true });

    const awarded = XpScoreSystem.awardXpForEnemyDefeat(
      room,
      { enemyType: 'slime' },
      'enemy-2',
      'ranged',
      'not-in-party'
    );

    // equal split => 50 each (no leverage multiplier)
    expect(room.awardXpToPlayer).toHaveBeenCalledWith(
      'a',
      50,
      expect.any(Object)
    );
    expect(room.awardXpToPlayer).toHaveBeenCalledWith(
      'b',
      50,
      expect.any(Object)
    );

    // competition mode tracks full amount (no 10% reduction)
    expect(awarded.get('a')).toBe(50);
    expect(awarded.get('b')).toBe(50);
  });

  it('keeps leverage in competition runs when trading settlement is enabled', () => {
    (GAME_CONFIG as any).trading.settlementEnabled = true;
    const room = makeRoom({
      getLeverageTotal: jest.fn(() => 4),
    });
    addPlayer(room, 'solo', { dailyQuestActive: true });

    const awarded = XpScoreSystem.awardXpForEnemyDefeat(
      room,
      { enemyType: 'slime' },
      'enemy-3',
      'melee',
      'solo'
    );

    expect(room.awardXpToPlayer).toHaveBeenCalledWith(
      'solo',
      400,
      expect.any(Object)
    );
    // @ts-expect-error - intentional test-only access
    expect(room.pendingScoreDeltas.get('solo')).toBe(400);
    expect(awarded.get('solo')).toBe(400);
  });
});
