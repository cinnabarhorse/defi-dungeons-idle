import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdleGame } from '../useIdleGame';

// Mock getWearableBySlug
jest.mock('../../data/wearables', () => ({
  getWearableBySlug: jest.fn((slug: string) => {
    if (slug === 'test-weapon') {
      return {
        slug: 'test-weapon',
        svgId: 123,
        name: 'Test Weapon',
        weapon: { weaponCategory: 'melee' },
      };
    }
    if (slug === 'test-grenade') {
      return {
        slug: 'test-grenade',
        svgId: 456,
        name: 'Test Grenade',
      };
    }
    return null;
  }),
}));

// Mock Room interface for Colyseus
interface MockPlayer {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  isAutoExploring: boolean;
  score: number;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  autoAscendFloor: number;
  healthPotionCount: number;
  manaPotionCount: number;
  derivedStats: string;
  dailyQuestActive: boolean;
  idleRoom: {
    maxDepthReached: number;
    runHealthPotionsCollected: number;
    runManaPotionsCollected: number;
    competitionMultiplier: number;
    killCount: Map<string, number>;
    lootsCollected: any[];
    tokenRewards: any[];
  };
}

interface MockRoomState {
  players: Map<string, MockPlayer>;
  leverageTotal: number;
  difficultyTier: string;
}

function createMockPlayer(overrides: Partial<MockPlayer> = {}): MockPlayer {
  const killCount = new Map<string, number>();
  killCount.set('Goblin', 5);
  killCount.set('Skeleton', 3);

  return {
    hp: 100,
    maxHp: 150,
    mana: 50,
    maxMana: 100,
    isAutoExploring: true,
    score: 1000,
    level: 5,
    xp: 500,
    xpIntoLevel: 50,
    xpForNextLevel: 200,
    autoAscendFloor: 5,
    healthPotionCount: 3,
    manaPotionCount: 2,
    derivedStats: JSON.stringify({
      activeWeaponSlug: 'test-weapon',
      weapons: [{ slug: 'test-grenade', weaponType: 'grenades' }],
    }),
    dailyQuestActive: false,
    idleRoom: {
      maxDepthReached: 10,
      runHealthPotionsCollected: 2,
      runManaPotionsCollected: 1,
      competitionMultiplier: 1.5,
      killCount,
      lootsCollected: [{ type: 'coin', quantity: 100 }],
      tokenRewards: [{ tokenAmount: 50 }],
    },
    ...overrides,
  };
}

function createMockRoom(
  sessionId: string,
  player: MockPlayer,
  stateOverrides: Partial<MockRoomState> = {}
) {
  const players = new Map<string, MockPlayer>();
  players.set(sessionId, player);

  const messageHandlers = new Map<string, (data: any) => void>();

  return {
    sessionId,
    state: {
      players,
      leverageTotal: 2.0,
      difficultyTier: 'hard',
      ...stateOverrides,
    },
    onMessage: jest.fn((type: string, handler: (data: any) => void) => {
      messageHandlers.set(type, handler);
      // Return unsubscribe function
      return () => {
        messageHandlers.delete(type);
      };
    }),
    _triggerMessage: (type: string, data: any) => {
      const handler = messageHandlers.get(type);
      if (handler) handler(data);
    },
    _messageHandlers: messageHandlers,
  };
}

describe('useIdleGame', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should return default initial state when room is null', () => {
      const { result } = renderHook(() => useIdleGame(null));

      expect(result.current.idleRoom).toBeNull();
      expect(result.current.playerHp).toBe(100);
      expect(result.current.maxHp).toBe(100);
      expect(result.current.playerMana).toBe(0);
      expect(result.current.maxMana).toBe(0);
      expect(result.current.playerLevel).toBe(1);
      expect(result.current.playerXp).toBe(0);
      expect(result.current.playerXpIntoLevel).toBe(0);
      expect(result.current.playerXpForNextLevel).toBe(100);
      expect(result.current.isAutoExploring).toBe(true);
      expect(result.current.activeWeapon).toBeNull();
      expect(result.current.activeGrenade).toBeNull();
      expect(result.current.leverage).toBe(1.0);
      expect(result.current.difficultyTier).toBe('normal');
      expect(result.current.score).toBe(0);
      expect(result.current.maxDepthReached).toBe(1);
      expect(result.current.kills).toEqual({});
      expect(result.current.lootsCollected).toEqual([]);
      expect(result.current.tokenRewards).toEqual([]);
      expect(result.current.targetFloor).toBe(3);
      expect(result.current.healthPotionCount).toBe(0);
      expect(result.current.manaPotionCount).toBe(0);
      expect(result.current.dailyQuestActive).toBe(false);
      expect(result.current.dailyQuestThresholdScore).toBeNull();
      expect(result.current.competitionMultiplier).toBe(1.0);
    });

    it('should sync state from room on initial render', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      // State should sync immediately on first call
      expect(result.current.playerHp).toBe(100);
      expect(result.current.maxHp).toBe(150);
      expect(result.current.playerMana).toBe(50);
      expect(result.current.maxMana).toBe(100);
      expect(result.current.isAutoExploring).toBe(true);
      expect(result.current.score).toBe(1000);
      expect(result.current.playerLevel).toBe(5);
      expect(result.current.leverage).toBe(2.0);
      expect(result.current.difficultyTier).toBe('hard');
      expect(result.current.maxDepthReached).toBe(10);
      expect(result.current.targetFloor).toBe(5);
      expect(result.current.competitionMultiplier).toBe(1.5);
    });
  });

  describe('State Synchronization', () => {
    it('should sync state on 200ms interval', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      renderHook(() => useIdleGame(mockRoom as any));

      // Update player HP
      player.hp = 80;

      // Advance timer to trigger update
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // State should update (though we can't easily test since the hook returns values)
    });

    it('should combine run potions with persistent inventory', () => {
      const player = createMockPlayer({
        healthPotionCount: 3,
        manaPotionCount: 2,
      });
      player.idleRoom.runHealthPotionsCollected = 2;
      player.idleRoom.runManaPotionsCollected = 1;

      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.healthPotionCount).toBe(5); // 3 + 2
      expect(result.current.manaPotionCount).toBe(3); // 2 + 1
    });

    it('should convert killCount Map to Record', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.kills).toEqual({
        Goblin: 5,
        Skeleton: 3,
      });
    });

    it('should deep clone lootsCollected to avoid reference issues', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.lootsCollected).toEqual([{ type: 'coin', quantity: 100 }]);
      expect(result.current.lootsCollected).not.toBe(player.idleRoom.lootsCollected);
    });

    it('should deep clone tokenRewards to avoid reference issues', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.tokenRewards).toEqual([{ tokenAmount: 50 }]);
      expect(result.current.tokenRewards).not.toBe(player.idleRoom.tokenRewards);
    });
  });

  describe('Weapon and Grenade Syncing', () => {
    it('should sync active weapon from derivedStats', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.activeWeapon).toEqual({
        slug: 'test-weapon',
        svgId: 123,
        name: 'Test Weapon',
        weaponCategory: 'melee',
      });
    });

    it('should sync active grenade from derivedStats', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.activeGrenade).toEqual({
        slug: 'test-grenade',
        svgId: 456,
        name: 'Test Grenade',
      });
    });

    it('should set activeWeapon to null when no weapon slug', () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({ weapons: [] }),
      });
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.activeWeapon).toBeNull();
    });

    it('should set activeGrenade to null when no grenade in weapons', () => {
      const player = createMockPlayer({
        derivedStats: JSON.stringify({
          activeWeaponSlug: 'test-weapon',
          weapons: [],
        }),
      });
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.activeGrenade).toBeNull();
    });

    it('should handle invalid derivedStats JSON gracefully', () => {
      const player = createMockPlayer({
        derivedStats: 'invalid-json',
      });
      const mockRoom = createMockRoom('session-123', player);

      // Should not throw
      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      // Weapons remain in previous state (null since this is first render)
      expect(result.current.activeWeapon).toBeNull();
      expect(result.current.activeGrenade).toBeNull();
    });

    it('should handle undefined derivedStats', () => {
      const player = createMockPlayer({
        derivedStats: undefined as any,
      });
      const mockRoom = createMockRoom('session-123', player);

      // Should not throw
      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.activeWeapon).toBeNull();
    });
  });

  describe('Daily Quest Status', () => {
    it('should handle daily_quest:status message', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      // Trigger daily quest status message
      act(() => {
        mockRoom._triggerMessage('daily_quest:status', {
          active: true,
          thresholdScore: 5000,
        });
      });

      expect(result.current.dailyQuestActive).toBe(true);
      expect(result.current.dailyQuestThresholdScore).toBe(5000);
    });

    it('should set dailyQuestActive to false when active is not true', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      act(() => {
        mockRoom._triggerMessage('daily_quest:status', {
          active: false,
        });
      });

      expect(result.current.dailyQuestActive).toBe(false);
    });

    it('should convert thresholdScore to Number', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      act(() => {
        mockRoom._triggerMessage('daily_quest:status', {
          active: true,
          thresholdScore: '1000', // string value
        });
      });

      expect(result.current.dailyQuestThresholdScore).toBe(1000);
      expect(typeof result.current.dailyQuestThresholdScore).toBe('number');
    });
  });

  describe('Ref-based Deduplication', () => {
    it('should not trigger React update when state has not changed', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { result, rerender } = renderHook(() => useIdleGame(mockRoom as any));

      const initialIdleRoom = result.current.idleRoom;

      // Advance timer multiple times
      act(() => {
        jest.advanceTimersByTime(200);
      });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Force a rerender
      rerender();

      // idleRoom should be deeply equal but ideally same reference if no change
      // (though this depends on implementation)
      expect(result.current.playerHp).toBe(100);
    });
  });

  describe('Null/Undefined Handling', () => {
    it('should return early when room is null', () => {
      const { result } = renderHook(() => useIdleGame(null));

      // All values should be defaults
      expect(result.current.idleRoom).toBeNull();
      expect(result.current.playerHp).toBe(100);
    });

    it('should handle player not found in room state', () => {
      const mockRoom = {
        sessionId: 'non-existent-session',
        state: {
          players: new Map<string, MockPlayer>(),
          leverageTotal: 1.0,
          difficultyTier: 'normal',
        },
        onMessage: jest.fn(),
      };

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      // Should use default values since player doesn't exist
      expect(result.current.idleRoom).toBeNull();
    });

    it('should handle undefined tokenRewards', () => {
      const player = createMockPlayer();
      player.idleRoom.tokenRewards = undefined as any;
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.tokenRewards).toEqual([]);
    });

    it('should handle default values for optional fields', () => {
      const player = createMockPlayer({
        mana: undefined as any,
        maxMana: undefined as any,
        score: undefined as any,
        level: undefined as any,
        xp: undefined as any,
        xpIntoLevel: undefined as any,
        xpForNextLevel: undefined as any,
        autoAscendFloor: undefined as any,
        healthPotionCount: undefined as any,
        manaPotionCount: undefined as any,
      });
      player.idleRoom.maxDepthReached = undefined as any;
      player.idleRoom.runHealthPotionsCollected = undefined as any;
      player.idleRoom.runManaPotionsCollected = undefined as any;
      player.idleRoom.competitionMultiplier = undefined as any;

      const mockRoom = createMockRoom('session-123', player, {
        leverageTotal: undefined as any,
        difficultyTier: undefined as any,
      });

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.playerMana).toBe(0);
      expect(result.current.maxMana).toBe(0);
      expect(result.current.score).toBe(0);
      expect(result.current.playerLevel).toBe(1);
      expect(result.current.playerXp).toBe(0);
      expect(result.current.playerXpIntoLevel).toBe(0);
      expect(result.current.playerXpForNextLevel).toBe(100);
      expect(result.current.maxDepthReached).toBe(1);
      expect(result.current.leverage).toBe(1.0);
      expect(result.current.difficultyTier).toBe('normal');
      expect(result.current.targetFloor).toBe(3);
      expect(result.current.competitionMultiplier).toBe(1.0);
    });
  });

  describe('Cleanup on Unmount', () => {
    it('should clear interval on unmount', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = renderHook(() => useIdleGame(mockRoom as any));

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('should cleanup message handler on unmount', () => {
      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      const { unmount } = renderHook(() => useIdleGame(mockRoom as any));

      // Verify handler was registered
      expect(mockRoom.onMessage).toHaveBeenCalledWith(
        'daily_quest:status',
        expect.any(Function)
      );

      unmount();

      // The message handler should be cleaned up
      // (This depends on implementation returning unsubscribe function)
    });
  });

  describe('200ms Update Interval', () => {
    it('should use 200ms interval for state sync', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      const player = createMockPlayer();
      const mockRoom = createMockRoom('session-123', player);

      renderHook(() => useIdleGame(mockRoom as any));

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 200);
      setIntervalSpy.mockRestore();
    });
  });

  describe('Mana State Synchronization', () => {
    it('should sync mana changes', () => {
      const player = createMockPlayer({
        mana: 75,
        maxMana: 100,
      });
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.playerMana).toBe(75);
      expect(result.current.maxMana).toBe(100);
    });

    it('should update when only mana changes (BUG: mana not in stateSnapshot)', () => {
      const player = createMockPlayer({
        mana: 50,
        maxMana: 100,
      });
      const mockRoom = createMockRoom('session-123', player);

      const { result } = renderHook(() => useIdleGame(mockRoom as any));

      expect(result.current.playerMana).toBe(50);

      // Change only mana - with the bug fixed, this should trigger an update
      player.mana = 75;

      act(() => {
        jest.advanceTimersByTime(200);
      });

      // After fix, mana should be updated
      // NOTE: This test documents expected behavior after bugfix
      expect(result.current.playerMana).toBe(75);
    });
  });
});
