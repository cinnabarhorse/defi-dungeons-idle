/**
 * Unit Tests for Mode Reward System
 *
 * Tests that rewards (XP, gold, lick tongue, wearables, potions) are
 * correctly configured in game-config.ts and helper functions work correctly
 */

import { describe, it, expect } from '@jest/globals';
import { GAME_CONFIG } from '../../data/game-config';

describe('Mode Reward Configuration', () => {
  describe('Configuration Structure', () => {
    it('should have modeRewards configuration in GAME_CONFIG', () => {
      expect((GAME_CONFIG as any).modeRewards).toBeDefined();
      expect((GAME_CONFIG as any).modeRewards.progression).toBeDefined();
      expect((GAME_CONFIG as any).modeRewards.competition).toBeDefined();
    });

    it('should have all reward flags for progression mode', () => {
      const config = (GAME_CONFIG as any).modeRewards.progression;
      expect(typeof config.earnXp).toBe('boolean');
      expect(typeof config.earnGold).toBe('boolean');
      expect(typeof config.earnLickTongue).toBe('boolean');
      expect(typeof config.earnWearables).toBe('boolean');
      expect(typeof config.earnPotions).toBe('boolean');
    });

    it('should have all reward flags for competition mode', () => {
      const config = (GAME_CONFIG as any).modeRewards.competition;
      expect(typeof config.earnXp).toBe('boolean');
      expect(typeof config.earnGold).toBe('boolean');
      expect(typeof config.earnLickTongue).toBe('boolean');
      expect(typeof config.earnWearables).toBe('boolean');
      expect(typeof config.earnPotions).toBe('boolean');
    });

    it('should have correct default values for progression mode', () => {
      const config = (GAME_CONFIG as any).modeRewards.progression;
      expect(config.earnXp).toBe(true);
      expect(config.earnGold).toBe(true);
      expect(config.earnLickTongue).toBe(true);
      expect(config.earnWearables).toBe(false); // progression: wearable loot disabled
      expect(config.earnPotions).toBe(true);
    });

    it('should have correct default values for competition mode', () => {
      const config = (GAME_CONFIG as any).modeRewards.competition;
      expect(config.earnXp).toBe(true);
      expect(config.earnGold).toBe(true);
      expect(config.earnLickTongue).toBe(true);
      expect(config.earnWearables).toBe(true);
      expect(config.earnPotions).toBe(true);
    });
  });

  describe('Reward Configuration Values', () => {
    it('should allow XP earning in both modes', () => {
      expect((GAME_CONFIG as any).modeRewards.progression.earnXp).toBe(true);
      expect((GAME_CONFIG as any).modeRewards.competition.earnXp).toBe(true);
    });

    it('should allow gold earning in both modes', () => {
      expect((GAME_CONFIG as any).modeRewards.progression.earnGold).toBe(true);
      expect((GAME_CONFIG as any).modeRewards.competition.earnGold).toBe(true);
    });

    it('should allow lick tongue earning in both modes', () => {
      expect((GAME_CONFIG as any).modeRewards.progression.earnLickTongue).toBe(true);
      expect((GAME_CONFIG as any).modeRewards.competition.earnLickTongue).toBe(true);
    });

    it('should allow wearables earning in competition; progression may disable', () => {
      expect(typeof (GAME_CONFIG as any).modeRewards.progression.earnWearables).toBe('boolean');
      expect((GAME_CONFIG as any).modeRewards.competition.earnWearables).toBe(true);
    });

    it('should allow potions earning in both modes by default', () => {
      expect((GAME_CONFIG as any).modeRewards.progression.earnPotions).toBe(true);
      expect((GAME_CONFIG as any).modeRewards.competition.earnPotions).toBe(true);
    });
  });
});
