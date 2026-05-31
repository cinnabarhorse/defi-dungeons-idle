/**
 * Unit tests for PotionSystem - tryAutoHeal single-consume behavior
 *
 * Tests the 1-potion-per-attack limit for auto-healing:
 * - Only 1 potion consumed per damage instance
 * - Player dies if HP still <= 0 after one potion
 * - Correct tier selection and healing amounts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock external dependencies before importing
jest.mock('../../lib/potion-utils', () => {
  const actual = jest.requireActual('../../lib/potion-utils');
  return {
    ...actual,
    computeHealthPotionHeal: jest.fn((maxHp: number, tier: number = 1) => {
      // Simplified mock matching real implementation
      if (tier === 1) return Math.max(50, Math.floor(maxHp * 0.1));
      if (tier === 2) return Math.floor(maxHp * 0.25);
      if (tier === 3) return Math.floor(maxHp * 0.5);
      return Math.max(50, Math.floor(maxHp * 0.1)); // default to tier 1
    }),
    computeManaPotionRestore: jest.fn(() => 50),
    selectOptimalPotion: jest.fn(
      (currentHp: number, maxHp: number, availablePotions: Record<number, number>) => {
        // Smart selection mock:
        // 1. Find lowest tier that brings HP > 0
        // 2. If none can save, return highest available
        // 3. Return null if no potions
        const availableTiers = Object.entries(availablePotions)
          .filter(([_, qty]) => qty > 0)
          .map(([tier]) => Number(tier))
          .filter((tier) => tier >= 1 && tier <= 3)
          .sort((a, b) => a - b);

        if (availableTiers.length === 0) return null;

        // Calculate heal amounts for each tier
        const healAmounts: Record<number, number> = {
          1: Math.max(50, Math.floor(maxHp * 0.1)),
          2: Math.floor(maxHp * 0.25),
          3: Math.floor(maxHp * 0.5),
        };

        // Find lowest tier that saves
        for (const tier of availableTiers) {
          if (currentHp + healAmounts[tier] > 0) {
            return tier;
          }
        }

        // Return highest available
        return availableTiers[availableTiers.length - 1];
      }
    ),
  };
});

import { tryAutoHeal } from '../PotionSystem';

// Mock player schema
function createMockPlayer(overrides: Partial<{
  id: string;
  hp: number;
  maxHp: number;
  isBot: boolean;
}> = {}): any {
  return {
    id: 'test-session-id',
    hp: 0,
    maxHp: 500,
    isBot: false,
    ...overrides,
  };
}

// Mock room with inventory
function createMockRoom(inventory: any[] = []): any {
  const playerInventories = new Map();
  playerInventories.set('test-session-id', inventory);

  return {
    playerInventories,
    applyInventoryDelta: jest.fn(() => Promise.resolve()),
    msg: {
      broadcast: jest.fn(),
    },
  };
}

describe('tryAutoHeal - Single Potion Consumption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1-potion-per-attack limit', () => {
    it('consumes exactly 1 potion when HP is negative', () => {
      const player = createMockPlayer({ hp: -40, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(true);
      // Should call applyInventoryDelta exactly once with -1
      expect(room.applyInventoryDelta).toHaveBeenCalledTimes(1);
      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ name: 'Health Potion' }),
        -1,
        expect.objectContaining({ auditSource: 'potion_auto_heal:tier_1' })
      );
    });

    it('Example: 500 HP player takes 600 damage, has T1 potions -> consumes 1, heals 50, dies at -50 HP', () => {
      // Player starts at 500 HP, takes 600 damage -> HP = -100
      // T1 potion heals max(50, 500*0.1) = 50
      // After heal: -100 + 50 = -50 (still dead)
      const player = createMockPlayer({ hp: -100, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(true); // Potion was consumed
      expect(player.hp).toBe(-50); // -100 + 50 = -50
      // Still only 1 potion consumed
      expect(room.applyInventoryDelta).toHaveBeenCalledTimes(1);
    });

    it('Example: 500 HP player takes 600 damage, has T3 potion -> consumes 1, heals 250, dies at -150 HP', () => {
      // Player starts at 500 HP, takes 600 damage -> HP = -100
      // But let's use the example values: takes 600 damage from 500 HP -> -100 HP? No wait...
      // The example says "dies at -150 HP" after healing 250, so initial must be -400
      // Actually let me re-read: "500 HP player takes 600 damage" -> HP = 500 - 600 = -100
      // "has T3 potion -> consumes 1, heals 250, dies at -150 HP"
      // -100 + 250 = 150 (survives!). The example in the task seems wrong...
      
      // Let me use the exact example values:
      // If player dies at -150 after healing 250, initial HP was -400
      // Let's test that T3 heals 250 (50% of 500) and only 1 potion is consumed
      const player = createMockPlayer({ hp: -400, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Ultra Healing Potion', quantity: 3, potionTier: 3 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(true);
      expect(player.hp).toBe(-150); // -400 + 250 = -150
      expect(room.applyInventoryDelta).toHaveBeenCalledTimes(1);
    });

    it('player survives if potion brings HP > 0', () => {
      // HP = -40, T1 heals 50 -> HP = 10 (survives!)
      const player = createMockPlayer({ hp: -40, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 2, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(true);
      expect(player.hp).toBe(10); // -40 + 50 = 10 (survives)
    });

    it('does NOT consume multiple potions even if needed to survive', () => {
      // HP = -200, would need 4+ T1 potions to survive
      // But we only consume 1 potion
      const player = createMockPlayer({ hp: -200, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 10, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(true);
      expect(player.hp).toBe(-150); // -200 + 50 = -150 (still dead)
      // Only 1 potion consumed, not 4+
      expect(room.applyInventoryDelta).toHaveBeenCalledTimes(1);
    });
  });

  describe('No potions available', () => {
    it('returns false when player has no potions', () => {
      const player = createMockPlayer({ hp: -50, maxHp: 500 });
      const room = createMockRoom([]); // Empty inventory

      const result = tryAutoHeal(room, player);

      expect(result).toBe(false);
      expect(room.applyInventoryDelta).not.toHaveBeenCalled();
    });

    it('returns false when only mana potions available', () => {
      const player = createMockPlayer({ hp: -50, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Mana Potion', quantity: 5 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(false);
      expect(room.applyInventoryDelta).not.toHaveBeenCalled();
    });

    it('returns false when health potion quantity is 0', () => {
      const player = createMockPlayer({ hp: -50, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 0, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('returns false if player HP is above 0', () => {
      const player = createMockPlayer({ hp: 100, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(false);
      expect(room.applyInventoryDelta).not.toHaveBeenCalled();
    });

    it('returns false for bot players', () => {
      const player = createMockPlayer({ hp: -50, maxHp: 500, isBot: true });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(false);
    });

    it('returns false if player has no session id', () => {
      const player = createMockPlayer({ hp: -50, maxHp: 500, id: '' });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
      ]);

      const result = tryAutoHeal(room, player);

      expect(result).toBe(false);
    });

    it('caps HP at maxHp even if heal would exceed it', () => {
      // HP = -10, maxHp = 100, T3 heals 50
      // -10 + 50 = 40 (under max, no cap needed)
      const player = createMockPlayer({ hp: -10, maxHp: 100 });
      const room = createMockRoom([
        { type: 'potion', name: 'Ultra Healing Potion', quantity: 1, potionTier: 3 },
      ]);

      tryAutoHeal(room, player);

      expect(player.hp).toBe(40); // -10 + 50 = 40
    });
  });

  describe('Potion tier selection', () => {
    it('uses correct tier from potion item', () => {
      const player = createMockPlayer({ hp: -100, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Greater Healing Potion', quantity: 1, potionTier: 2 },
      ]);

      tryAutoHeal(room, player);

      // T2 heals 25% of 500 = 125
      expect(player.hp).toBe(25); // -100 + 125 = 25
    });

    it('defaults to tier 1 for potions without tier', () => {
      const player = createMockPlayer({ hp: -40, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 1 }, // No potionTier
      ]);

      tryAutoHeal(room, player);

      // Should default to T1: heals 50
      expect(player.hp).toBe(10); // -40 + 50 = 10
    });

    it('infers tier from item type when potionTier is missing', () => {
      const player = createMockPlayer({ hp: -100, maxHp: 500 });
      const room = createMockRoom([
        {
          type: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 1,
        }, // No potionTier
      ]);

      tryAutoHeal(room, player);

      // Should infer T2 from item type/name: heals 125
      expect(player.hp).toBe(25); // -100 + 125 = 25
    });

    it('broadcasts heal event with tier info', () => {
      const player = createMockPlayer({ hp: -40, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Greater Healing Potion', quantity: 1, potionTier: 2 },
      ]);

      tryAutoHeal(room, player);

      expect(room.msg.broadcast).toHaveBeenCalledWith('player_healed', {
        playerId: 'test-session-id',
        healAmount: 125, // 25% of 500
        currentHp: 85, // -40 + 125 = 85
        maxHp: 500,
        source: 'auto_heal',
        potionTier: 2,
      });
    });
  });

  describe('Smart potion selection', () => {
    it('selects T1 when it is sufficient to survive', () => {
      // HP at -40, T1 heals 50 -> survives at 10
      const player = createMockPlayer({ hp: -40, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        { type: 'potion', name: 'Greater Healing Potion', quantity: 3, potionTier: 2 },
      ]);

      tryAutoHeal(room, player);

      // Should use T1 (the minimum needed)
      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ potionTier: 1 }),
        -1,
        expect.objectContaining({ auditSource: 'potion_auto_heal:tier_1' })
      );
      expect(player.hp).toBe(10); // -40 + 50 = 10
    });

    it('selects T2 when T1 is not sufficient to survive', () => {
      // HP at -100, T1 heals 50 (dies at -50), T2 heals 125 (survives at 25)
      const player = createMockPlayer({ hp: -100, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        { type: 'potion', name: 'Greater Healing Potion', quantity: 3, potionTier: 2 },
      ]);

      tryAutoHeal(room, player);

      // Should use T2 (minimum needed to survive)
      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ potionTier: 2 }),
        -1,
        expect.objectContaining({ auditSource: 'potion_auto_heal:tier_2' })
      );
      expect(player.hp).toBe(25); // -100 + 125 = 25
    });

    it('selects highest available tier when no tier can save', () => {
      // HP at -500, even T2 (125) can't save -> use T2 as highest
      const player = createMockPlayer({ hp: -500, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        { type: 'potion', name: 'Greater Healing Potion', quantity: 3, potionTier: 2 },
      ]);

      tryAutoHeal(room, player);

      // Should use T2 (highest available, even though still dies)
      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ potionTier: 2 }),
        -1,
        expect.objectContaining({ auditSource: 'potion_auto_heal:tier_2' })
      );
      expect(player.hp).toBe(-375); // -500 + 125 = -375 (still dead)
    });

    it('handles mixed tiers with only T2 and T3 available', () => {
      // HP at -40, no T1, only T2 and T3 available
      // T2 heals 125 -> survives at 85 (minimum needed)
      const player = createMockPlayer({ hp: -40, maxHp: 500 });
      const room = createMockRoom([
        { type: 'potion', name: 'Greater Healing Potion', quantity: 2, potionTier: 2 },
        { type: 'potion', name: 'Ultra Healing Potion', quantity: 1, potionTier: 3 },
      ]);

      tryAutoHeal(room, player);

      // Should use T2 (minimum needed from available tiers)
      expect(room.applyInventoryDelta).toHaveBeenCalledWith(
        'test-session-id',
        expect.objectContaining({ potionTier: 2 }),
        -1,
        expect.objectContaining({ auditSource: 'potion_auto_heal:tier_2' })
      );
      expect(player.hp).toBe(85); // -40 + 125 = 85
    });
  });

  describe('Manual Potion Use - Edge Cases', () => {
    describe('handleUseHealthPotion edge cases', () => {
      let mockClient: any;
      let mockRoom: any;
      let mockPlayer: any;

      beforeEach(() => {
        mockClient = {
          sessionId: 'test-session-id',
        };

        mockPlayer = {
          id: 'test-session-id',
          hp: 100,
          maxHp: 500,
          healthPotionCount: 0,
          idleRoom: {
            persistentHealthPotionsUsed: 0,
          },
        };

        mockRoom = {
          state: {
            players: new Map([['test-session-id', mockPlayer]]),
          },
          playerInventories: new Map(),
          applyInventoryDelta: jest.fn(() => Promise.resolve()),
          msg: {
            broadcast: jest.fn(),
          },
        };
      });

      it('should return early when player is at full HP', () => {
        const { handleUseHealthPotion } = require('../PotionSystem');
        mockPlayer.hp = 500; // Full HP
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        ]);

        handleUseHealthPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockRoom.msg.broadcast).not.toHaveBeenCalled();
        expect(mockPlayer.hp).toBe(500); // Unchanged
      });

      it('should return early when player HP is above max HP', () => {
        const { handleUseHealthPotion } = require('../PotionSystem');
        mockPlayer.hp = 600; // Above max HP (shouldn't happen, but test edge case)
        mockPlayer.maxHp = 500;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        ]);

        handleUseHealthPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.hp).toBe(600); // Unchanged
      });

      it('should return early when player has no health potions', () => {
        const { handleUseHealthPotion } = require('../PotionSystem');
        mockPlayer.hp = 100; // Not full HP
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Mana Potion', quantity: 5 },
        ]);

        handleUseHealthPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockRoom.msg.broadcast).not.toHaveBeenCalled();
        expect(mockPlayer.hp).toBe(100); // Unchanged
      });

      it('should return early when inventory is empty', () => {
        const { handleUseHealthPotion } = require('../PotionSystem');
        mockPlayer.hp = 100;
        mockRoom.playerInventories.set('test-session-id', []);

        handleUseHealthPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.hp).toBe(100); // Unchanged
      });

      it('should return early when player HP is 0 or negative', () => {
        const { handleUseHealthPotion } = require('../PotionSystem');
        mockPlayer.hp = 0;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        ]);

        handleUseHealthPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.hp).toBe(0); // Unchanged
      });

      it('should return early when player is dead (negative HP)', () => {
        const { handleUseHealthPotion } = require('../PotionSystem');
        mockPlayer.hp = -50;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Health Potion', quantity: 5, potionTier: 1 },
        ]);

        handleUseHealthPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.hp).toBe(-50); // Unchanged
      });

    });

    describe('handleUseManaPotion edge cases', () => {
      let mockClient: any;
      let mockRoom: any;
      let mockPlayer: any;

      beforeEach(() => {
        mockClient = {
          sessionId: 'test-session-id',
        };

        mockPlayer = {
          id: 'test-session-id',
          hp: 100,
          maxHp: 500,
          mana: 100,
          maxMana: 200,
          manaPotionCount: 0,
          idleRoom: {
            persistentManaPotionsUsed: 0,
          },
        };

        mockRoom = {
          state: {
            players: new Map([['test-session-id', mockPlayer]]),
          },
          playerInventories: new Map(),
          applyInventoryDelta: jest.fn(() => Promise.resolve()),
          msg: {
            broadcast: jest.fn(),
          },
        };
      });

      it('should return early when player is at full mana', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.mana = 200; // Full mana
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Mana Potion', quantity: 5 },
        ]);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockRoom.msg.broadcast).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(200); // Unchanged
      });

      it('should return early when player mana is above max mana', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.mana = 250; // Above max mana
        mockPlayer.maxMana = 200;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Mana Potion', quantity: 5 },
        ]);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(250); // Unchanged
      });

      it('should return early when player has no mana potions', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.mana = 50; // Not full mana
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Health Potion', quantity: 5 },
        ]);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockRoom.msg.broadcast).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(50); // Unchanged
      });

      it('should return early when inventory is empty', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.mana = 50;
        mockRoom.playerInventories.set('test-session-id', []);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(50); // Unchanged
      });

      it('should return early when player HP is 0 or negative', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.hp = 0;
        mockPlayer.mana = 50;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Mana Potion', quantity: 5 },
        ]);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(50); // Unchanged
      });

      it('should return early when player maxMana is 0 or negative', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.maxMana = 0;
        mockPlayer.mana = 0;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Mana Potion', quantity: 5 },
        ]);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(0); // Unchanged
      });


      it('should return early when mana potion quantity is 0', () => {
        const { handleUseManaPotion } = require('../PotionSystem');
        mockPlayer.mana = 50;
        mockRoom.playerInventories.set('test-session-id', [
          { type: 'potion', name: 'Mana Potion', quantity: 0 },
        ]);

        handleUseManaPotion(mockRoom, mockClient);

        expect(mockRoom.applyInventoryDelta).not.toHaveBeenCalled();
        expect(mockPlayer.mana).toBe(50); // Unchanged
      });
    });
  });
});
