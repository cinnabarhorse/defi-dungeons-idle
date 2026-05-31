/**
 * Unit tests for CraftingSystem - Potion tier crafting
 *
 * Tests the crafting operations:
 * - 3x T1 → 1x T2
 * - 3x T2 → 1x T3
 * - Validation and error cases
 */

import { describe, it, expect } from '@jest/globals';
import { validateCraft, getCraftingAvailability } from '../CraftingSystem';

describe('CraftingSystem', () => {
  describe('validateCraft', () => {
    it('should allow crafting 3x T1 into T2', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 5,
          potionTier: 1,
        },
      ];

      const result = validateCraft(inventory, 1);

      expect(result.success).toBe(true);
      expect(result.inputTier).toBe(1);
      expect(result.outputTier).toBe(2);
      expect(result.inputConsumed).toBe(3);
      expect(result.outputProduced).toBe(1);
    });

    it('should allow crafting 3x T2 into T3', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 3,
          potionTier: 2,
        },
      ];

      const result = validateCraft(inventory, 2);

      expect(result.success).toBe(true);
      expect(result.inputTier).toBe(2);
      expect(result.outputTier).toBe(3);
      expect(result.inputConsumed).toBe(3);
      expect(result.outputProduced).toBe(1);
    });

    it('should fail when player has insufficient T1 potions', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 2, // Only 2, need 3
          potionTier: 1,
        },
      ];

      const result = validateCraft(inventory, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient materials');
    });

    it('should fail when player tries to craft from T3', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'ultra_health_potion',
          name: 'Ultra Healing Potion',
          quantity: 10,
          potionTier: 3,
        },
      ];

      const result = validateCraft(inventory, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot craft higher tier');
    });

    it('should fail with invalid tier', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 10,
          potionTier: 1,
        },
      ];

      const result = validateCraft(inventory, 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid potion tier for crafting');
    });

    it('should fail with empty inventory', () => {
      const inventory: any[] = [];

      const result = validateCraft(inventory, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient materials');
    });

    it('should fail when potions exist but not the right tier', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 10, // T2 potions
          potionTier: 2,
        },
      ];

      // Try to craft from T1, but only have T2
      const result = validateCraft(inventory, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient materials');
    });

    it('should work with exactly 3 potions', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 3, // Exactly 3
          potionTier: 1,
        },
      ];

      const result = validateCraft(inventory, 1);

      expect(result.success).toBe(true);
      expect(result.inputConsumed).toBe(3);
    });

    it('should match potions by tier number, not just item type', () => {
      // Legacy potions that might have mismatched types
      const inventory = [
        {
          type: 'potion',
          itemType: 'potion',
          name: 'Health Potion',
          quantity: 5,
          potionTier: 1, // Has tier set correctly
        },
      ];

      const result = validateCraft(inventory, 1);

      expect(result.success).toBe(true);
    });
  });

  describe('getCraftingAvailability', () => {
    it('should return correct availability with mixed inventory', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 5,
          potionTier: 1,
        },
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 2,
          potionTier: 2,
        },
        {
          type: 'potion',
          itemType: 'ultra_health_potion',
          name: 'Ultra Healing Potion',
          quantity: 1,
          potionTier: 3,
        },
      ];

      const result = getCraftingAvailability(inventory);

      expect(result.canCraftT1ToT2).toBe(true); // 5 >= 3
      expect(result.canCraftT2ToT3).toBe(false); // 2 < 3
      expect(result.counts).toEqual({ 1: 5, 2: 2, 3: 1 });
    });

    it('should return all false with empty inventory', () => {
      const inventory: any[] = [];

      const result = getCraftingAvailability(inventory);

      expect(result.canCraftT1ToT2).toBe(false);
      expect(result.canCraftT2ToT3).toBe(false);
      expect(result.counts).toEqual({ 1: 0, 2: 0, 3: 0 });
    });

    it('should return both true when enough potions of both tiers', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 10,
          potionTier: 1,
        },
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 6,
          potionTier: 2,
        },
      ];

      const result = getCraftingAvailability(inventory);

      expect(result.canCraftT1ToT2).toBe(true);
      expect(result.canCraftT2ToT3).toBe(true);
      expect(result.counts).toEqual({ 1: 10, 2: 6, 3: 0 });
    });

    it('should correctly count potions after crafting', () => {
      // Simulate state after crafting 3 T1 → 1 T2
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 2, // Was 5, now 2
          potionTier: 1,
        },
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 1, // New T2 potion
          potionTier: 2,
        },
      ];

      const result = getCraftingAvailability(inventory);

      expect(result.canCraftT1ToT2).toBe(false); // 2 < 3
      expect(result.canCraftT2ToT3).toBe(false); // 1 < 3
      expect(result.counts).toEqual({ 1: 2, 2: 1, 3: 0 });
    });

    it('should ignore non-health potions', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'mana_potion',
          name: 'Mana Potion',
          quantity: 100,
        },
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 2,
          potionTier: 1,
        },
      ];

      const result = getCraftingAvailability(inventory);

      expect(result.canCraftT1ToT2).toBe(false);
      expect(result.counts).toEqual({ 1: 2, 2: 0, 3: 0 });
    });

    it('should ignore items with zero or negative quantity', () => {
      const inventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 0,
          potionTier: 1,
        },
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: -5,
          potionTier: 2,
        },
      ];

      const result = getCraftingAvailability(inventory);

      expect(result.counts).toEqual({ 1: 0, 2: 0, 3: 0 });
    });
  });

  describe('Integration scenarios', () => {
    it('Player with 5 T1 potions crafts → 2 T1 + 1 T2', () => {
      // Initial state
      const initialInventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 5,
          potionTier: 1,
        },
      ];

      // Validate craft is possible
      const validation = validateCraft(initialInventory, 1);
      expect(validation.success).toBe(true);
      expect(validation.inputConsumed).toBe(3);
      expect(validation.outputProduced).toBe(1);

      // Simulate post-craft inventory
      const postCraftInventory = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 2, // 5 - 3 = 2
          potionTier: 1,
        },
        {
          type: 'potion',
          itemType: 'greater_health_potion',
          name: 'Greater Healing Potion',
          quantity: 1, // +1
          potionTier: 2,
        },
      ];

      const availability = getCraftingAvailability(postCraftInventory);
      expect(availability.counts).toEqual({ 1: 2, 2: 1, 3: 0 });
      expect(availability.canCraftT1ToT2).toBe(false); // Can't craft again
    });

    it('Player with 0 potions → both buttons disabled', () => {
      const inventory: any[] = [];

      const availability = getCraftingAvailability(inventory);
      expect(availability.canCraftT1ToT2).toBe(false);
      expect(availability.canCraftT2ToT3).toBe(false);
    });

    it('Chain crafting: 9 T1 → 3 T2 → 1 T3', () => {
      // Step 1: Start with 9 T1
      const step1 = [
        {
          type: 'potion',
          itemType: 'health_potion',
          name: 'Health Potion',
          quantity: 9,
          potionTier: 1,
        },
      ];

      expect(validateCraft(step1, 1).success).toBe(true);

      // Step 2: After first craft (6 T1, 1 T2)
      const step2 = [
        { type: 'potion', itemType: 'health_potion', name: 'Health Potion', quantity: 6, potionTier: 1 },
        { type: 'potion', itemType: 'greater_health_potion', name: 'Greater Healing Potion', quantity: 1, potionTier: 2 },
      ];
      expect(validateCraft(step2, 1).success).toBe(true);

      // Step 3: After second craft (3 T1, 2 T2)
      const step3 = [
        { type: 'potion', itemType: 'health_potion', name: 'Health Potion', quantity: 3, potionTier: 1 },
        { type: 'potion', itemType: 'greater_health_potion', name: 'Greater Healing Potion', quantity: 2, potionTier: 2 },
      ];
      expect(validateCraft(step3, 1).success).toBe(true);

      // Step 4: After third craft (0 T1, 3 T2)
      const step4 = [
        { type: 'potion', itemType: 'greater_health_potion', name: 'Greater Healing Potion', quantity: 3, potionTier: 2 },
      ];
      expect(validateCraft(step4, 1).success).toBe(false); // No T1 left
      expect(validateCraft(step4, 2).success).toBe(true); // Can craft T2→T3

      // Step 5: Final state (0 T1, 0 T2, 1 T3)
      const step5 = [
        { type: 'potion', itemType: 'ultra_health_potion', name: 'Ultra Healing Potion', quantity: 1, potionTier: 3 },
      ];
      expect(validateCraft(step5, 2).success).toBe(false);
      expect(validateCraft(step5, 3).success).toBe(false);
      expect(validateCraft(step5, 3).error).toBe('Cannot craft higher tier');
    });
  });
});
