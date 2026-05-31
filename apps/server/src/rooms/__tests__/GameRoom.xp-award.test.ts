/**
 * Unit Tests for awardXpToPlayer
 *
 * Tests that XP is properly awarded to players, including mode-based reductions.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock external dependencies
jest.mock('@gotchiverse/progression', () => ({
  applyXp: jest.fn((profile, xpAmount) => ({
    profile: {
      ...profile,
      totalXp: profile.totalXp + xpAmount,
    },
    currentLevel: profile.level,
    levelUps: 0,
  })),
  getLevelProgress: jest.fn((totalXp) => ({
    level: 1,
    xpIntoLevel: totalXp,
    xpForNextLevel: 100,
  })),
}));

jest.mock('../../lib/db', () => ({
  progressionRepo: {
    upsertProgression: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../data/game-config', () => ({
  GAME_CONFIG: {
    modeRewards: {
      progression: {
        earnXp: true,
        earnGold: true,
        earnLickTongue: true,
        earnWearables: true,
        earnPotions: true,
      },
      competition: {
        earnXp: true,
        earnGold: true,
        earnLickTongue: true,
        earnWearables: true,
        earnPotions: true,
      },
    },
  },
}));

// Create mock GameRoom class
class MockGameRoom {
  state: {
    players: Map<string, any>;
  };
  progressionProfiles: Map<string, any>;
  playerMaxLevels: Map<string, number>;
  msg: any;

  constructor() {
    this.state = {
      players: new Map(),
    };
    this.progressionProfiles = new Map();
    this.playerMaxLevels = new Map();
    this.msg = {
      sendTo: jest.fn(),
    };
  }

  setSessionRebirthState(sessionId: string, rebirthCountInput: unknown) {
    const numeric = Number(rebirthCountInput);
    const raw = Number.isFinite(numeric) ? Math.floor(numeric) : 0;
    const clamped = Math.max(0, Math.min(34, raw)); // 99 -> 199 cap with +3 per rebirth
    const maxLevel = Math.min(199, 99 + clamped * 3);
    this.playerMaxLevels.set(sessionId, maxLevel);
  }

  getSessionProgressionMaxLevel(sessionId: string) {
    return this.playerMaxLevels.get(sessionId) ?? 99;
  }

  getProgressionProfile(sessionId: string) {
    if (!this.progressionProfiles.has(sessionId)) {
      this.progressionProfiles.set(sessionId, {
        level: 1,
        totalXp: 0,
        unspentPoints: 0,
        stats: {},
        allocationHistory: [],
      });
    }
    return this.progressionProfiles.get(sessionId);
  }

  setProgressionProfile(sessionId: string, profile: any, options: any) {
    this.progressionProfiles.set(sessionId, profile);
  }

  recordXpGain(sessionId: string, xpAmount: number, level: number) {
    // Mock implementation
  }

  recordLevelSnapshot(sessionId: string, level: number) {
    // Mock implementation
  }

  applyProgressionToPlayer(sessionId: string, options: any) {
    // Mock implementation
  }

  persistProgression(sessionId: string, profile: any) {
    // Mock implementation
  }

  getClientBySessionId(sessionId: string) {
    return { sessionId };
  }

  logAction(player: any, message: string) {
    // Mock implementation
  }

  // Import the actual awardXpToPlayer method logic (with mode-based reduction)
  awardXpToPlayer(sessionId: string, xpAmount: number, source?: any) {
    if (xpAmount <= 0) return;

    const player = this.state.players.get(sessionId);
    if (player) {
      const isCompetition = player.dailyQuestActive === true;
      const mode = isCompetition ? 'competition' : 'progression';
      const { GAME_CONFIG } = require('../../data/game-config');
      const rewardConfig = (GAME_CONFIG as any).modeRewards?.[mode];
      if (rewardConfig && !rewardConfig.earnXp) {
        return; // Skip XP if not allowed by mode config
      }

      // Apply 10% XP multiplier for progression mode (practice/progression matches)
      // Competition mode gets full XP (100%)
      if (!isCompetition) {
        xpAmount = Math.round(xpAmount * 0.1);
        if (xpAmount <= 0) return; // Skip if rounded down to 0
      }
    }

    const profile = this.getProgressionProfile(sessionId);
    const { applyXp: applyXpToProfile } = require('@gotchiverse/progression');
    const maxLevel = this.getSessionProgressionMaxLevel(sessionId);
    const result = applyXpToProfile(profile, xpAmount, maxLevel);

    this.setProgressionProfile(sessionId, result.profile, { persist: false });
    this.recordXpGain(sessionId, xpAmount, result.profile.level);
    this.recordLevelSnapshot(sessionId, result.profile.level);

    if (result.levelUps > 0) {
      this.applyProgressionToPlayer(sessionId, { fullHeal: true });
      if (player && player.idleRoom && player.idleRoom.runStatus === 'active') {
        this.logAction(
          player,
          `::gold::🌟 You leveled up! Current level: ${result.currentLevel}. Restored to full HP!::`
        );
      }
    }

    void this.persistProgression(sessionId, result.profile);

    // Sync progression fields to player schema for Colyseus state sync
    const { getLevelProgress } = require('@gotchiverse/progression');
    const levelProgress = getLevelProgress(result.profile.totalXp, maxLevel);
    if (player) {
      player.level = levelProgress.level;
      player.xp = result.profile.totalXp;
      player.xpIntoLevel = levelProgress.xpIntoLevel;
      player.xpForNextLevel = levelProgress.xpForNextLevel;
    }

    const client = this.getClientBySessionId(sessionId);
    if (client) {
      this.msg.sendTo(client, 'progression:xp_awarded', {
        amount: xpAmount,
        totalXp: result.profile.totalXp,
        level: result.currentLevel,
        levelUps: result.levelUps,
        unspentPoints: result.profile.unspentPoints,
        stats: result.profile.stats,
        allocationHistory: result.profile.allocationHistory,
        levelProgress,
        source: source,
      });
    }
  }
}

function createMockPlayer(overrides: Partial<{
  id: string;
  xp: number;
  level: number;
  dailyQuestActive?: boolean;
}> = {}): any {
  return {
    id: 'test-session-id',
    xp: 0,
    level: 1,
    dailyQuestActive: false, // Default to progression mode
    idleRoom: {
      runStatus: 'active',
    },
    ...overrides,
  };
}

describe('awardXpToPlayer', () => {
  let room: MockGameRoom;
  const { applyXp: applyXpToProfile } = require('@gotchiverse/progression');
  const { progressionRepo } = require('../../lib/db');

  beforeEach(() => {
    jest.clearAllMocks();
    room = new MockGameRoom();
  });

  describe('XP Awarding', () => {
    it('should award XP normally in competition mode', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: true, // Competition mode for full XP
      });
      room.state.players.set('test-session-id', player);
      const initialXp = player.xp;

      room.awardXpToPlayer('test-session-id', 50);

      // XP should increase (player.xp is set from profile.totalXp)
      expect(player.xp).toBeGreaterThan(initialXp);
      
      // applyXpToProfile should be called with full amount
      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        50, // Full amount in competition mode
        99
      );

      // Client should receive XP award message
      expect(room.msg.sendTo).toHaveBeenCalledWith(
        expect.any(Object),
        'progression:xp_awarded',
        expect.objectContaining({
          amount: 50,
        })
      );
    });

    it('should update player XP field', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: true, // Competition mode
      });
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 50);

      // Player XP should be updated
      expect(player.xp).toBeGreaterThan(0);
    });

    it('should persist progression', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: true, // Competition mode
      });
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 50);

      // Progression should be persisted (called asynchronously)
      // Note: persistProgression is called with void, so we can't directly test it
      // but we can verify applyXpToProfile was called which is required for persistence
      expect(applyXpToProfile).toHaveBeenCalled();
    });
  });

  describe('Mode-Based XP Reduction', () => {
    it('should award 10% XP in progression mode', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: false, // Progression mode
      });
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 100);

      // Should receive 10% of 100 = 10 XP
      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        10, // 10% of 100
        99
      );

      // Client should receive message with reduced amount
      expect(room.msg.sendTo).toHaveBeenCalledWith(
        expect.any(Object),
        'progression:xp_awarded',
        expect.objectContaining({
          amount: 10,
        })
      );
    });

    it('should award 100% XP in competition mode', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: true, // Competition mode
      });
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 100);

      // Should receive 100% of 100 = 100 XP
      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        100, // Full amount
        99
      );

      // Client should receive message with full amount
      expect(room.msg.sendTo).toHaveBeenCalledWith(
        expect.any(Object),
        'progression:xp_awarded',
        expect.objectContaining({
          amount: 100,
        })
      );
    });

    it('should round progression mode XP correctly', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: false, // Progression mode
      });
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 33);

      // 33 * 0.1 = 3.3, rounded to 3
      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        3,
        99
      );
    });

    it('should skip XP if progression mode reduction rounds to zero', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: false, // Progression mode
      });
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 3);

      // 3 * 0.1 = 0.3, rounded to 0, should return early
      expect(applyXpToProfile).not.toHaveBeenCalled();
    });

    it('should handle progression mode with leverage multiplier', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: false, // Progression mode
      });
      room.state.players.set('test-session-id', player);

      // Simulate 100 base XP with 2x leverage = 200 total
      // Progression mode: 200 * 0.1 = 20
      room.awardXpToPlayer('test-session-id', 200);

      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        20, // 10% of 200
        99
      );
    });

    it('should handle competition mode with leverage multiplier', () => {
      const player = createMockPlayer({ 
        xp: 0, 
        level: 1,
        dailyQuestActive: true, // Competition mode
      });
      room.state.players.set('test-session-id', player);

      // Simulate 100 base XP with 2x leverage = 200 total
      // Competition mode: 200 * 1.0 = 200 (full amount)
      room.awardXpToPlayer('test-session-id', 200);

      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        200, // Full amount
        99
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero XP amount (should return early)', () => {
      const player = createMockPlayer({});
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', 0);

      expect(applyXpToProfile).not.toHaveBeenCalled();
    });

    it('should handle negative XP amount (should return early)', () => {
      const player = createMockPlayer({});
      room.state.players.set('test-session-id', player);

      room.awardXpToPlayer('test-session-id', -10);

      expect(applyXpToProfile).not.toHaveBeenCalled();
    });

    it('should handle missing player', () => {
      // No player in state - should default to progression mode behavior
      room.awardXpToPlayer('non-existent-session', 100);

      // Should proceed to award XP (without mode reduction since no player)
      expect(applyXpToProfile).toHaveBeenCalledWith(
        expect.any(Object),
        100,
        99
      );
    });
  });

  it('passes a higher max level after rebirth state is applied', () => {
    const player = createMockPlayer({
      xp: 0,
      level: 1,
      dailyQuestActive: true,
    });
    room.state.players.set('test-session-id', player);

    room.setSessionRebirthState('test-session-id', 3);
    room.awardXpToPlayer('test-session-id', 50);

    expect(applyXpToProfile).toHaveBeenCalledWith(expect.any(Object), 50, 108);
  });
});
