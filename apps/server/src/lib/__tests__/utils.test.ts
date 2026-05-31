import { getDirectionVector, isValidTilePosition, normalizeDirection } from '../utils';
import { GAME_CONFIG } from '../constants';

describe('lib/utils', () => {
  describe('getDirectionVector', () => {
    it('returns {0,0} for unknown directions (default case)', () => {
      expect(getDirectionVector('nope' as any)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('normalizeDirection', () => {
    it('prefers horizontal when |dx| > |dy|', () => {
      expect(normalizeDirection(0, 0, 2, 1)).toBe('right');
      expect(normalizeDirection(2, 1, 0, 0)).toBe('left');
    });

    it('uses vertical when |dx| <= |dy| (tie goes vertical)', () => {
      // tie: |dx| === |dy| -> vertical branch
      expect(normalizeDirection(0, 0, 2, 2)).toBe('down');
      expect(normalizeDirection(2, 2, 0, 0)).toBe('up');
    });
  });

  describe('isValidTilePosition', () => {
    it('accepts edge-inclusive minimums and rejects exclusive maximums', () => {
      expect(isValidTilePosition(0, 0)).toBe(true);
      expect(isValidTilePosition(GAME_CONFIG.MAP_WIDTH - 1, GAME_CONFIG.MAP_HEIGHT - 1)).toBe(true);

      expect(isValidTilePosition(GAME_CONFIG.MAP_WIDTH, 0)).toBe(false);
      expect(isValidTilePosition(0, GAME_CONFIG.MAP_HEIGHT)).toBe(false);
      expect(isValidTilePosition(-1, 0)).toBe(false);
      expect(isValidTilePosition(0, -1)).toBe(false);
    });
  });
});
