import {
  clearCharacterSpriteOverride,
  getCharacterConfig,
  onSpriteOverridesChange,
  setCharacterSpriteOverride,
} from './character-registry';

// 1x1 transparent PNG used as fallback for unknown characters
const TRANSPARENT_PX_PREFIX = 'data:image/png;base64,';

describe('character-registry', () => {
  afterEach(() => {
    // Ensure we always clean up any overrides we set during a test
    clearCharacterSpriteOverride('coderdan');
    clearCharacterSpriteOverride('gotchi:123');
    clearCharacterSpriteOverride('unknown');
  });

  describe('getCharacterConfig', () => {
    test('returns default sprite config for known characters', () => {
      const cfg = getCharacterConfig('coderdan');

      expect(cfg.key).toBe('character_coderdan');
      expect(cfg.imagePath).toBe('/sprites/character/coderdan.png');
      expect(cfg.frameWidth).toBe(100);
      expect(cfg.frameHeight).toBe(100);
      expect(Array.isArray(cfg.animations)).toBe(true);
      expect(cfg.animations?.length ?? 0).toBeGreaterThan(0);
    });

    test('falls back to transparent placeholder for unknown characters', () => {
      const cfg = getCharacterConfig('unknown');

      expect(cfg.key).toBe('character_unknown');
      expect(cfg.imagePath.startsWith(TRANSPARENT_PX_PREFIX)).toBe(true);
      expect(cfg.frameWidth).toBe(100);
      expect(cfg.frameHeight).toBe(100);
    });

    test('adds deterministic version suffix for gotchi:* ids (without overrides)', () => {
      const cfg = getCharacterConfig('gotchi:123');

      // For gotchi ids we expect a suffix so loader treats unique gotchis as unique textures
      expect(cfg.key).toBe('character_gotchi:123_123');
      expect(cfg.imagePath.startsWith(TRANSPARENT_PX_PREFIX)).toBe(true);
    });

    test('uses sprite overrides (including sizing) and versions key based on content', () => {
      setCharacterSpriteOverride('coderdan', {
        imagePath: 'blob:override-abc',
        frameWidth: 64,
        frameHeight: 32,
      });

      const cfg1 = getCharacterConfig('coderdan');
      const cfg2 = getCharacterConfig('coderdan');

      expect(cfg1.imagePath).toBe('blob:override-abc');
      expect(cfg1.frameWidth).toBe(64);
      expect(cfg1.frameHeight).toBe(32);

      // Key should incorporate a hash of the override path, and be stable for the same input
      expect(cfg1.key.startsWith('character_coderdan_')).toBe(true);
      expect(cfg2.key).toBe(cfg1.key);

      // Changing override content should change the suffix
      setCharacterSpriteOverride('coderdan', {
        imagePath: 'blob:override-def',
      });
      const cfg3 = getCharacterConfig('coderdan');
      expect(cfg3.key).not.toBe(cfg1.key);

      // Clearing override should return to the canonical key/path
      clearCharacterSpriteOverride('coderdan');
      const cfg4 = getCharacterConfig('coderdan');
      expect(cfg4.key).toBe('character_coderdan');
      expect(cfg4.imagePath).toBe('/sprites/character/coderdan.png');
    });
  });

  describe('sprite override subscriptions', () => {
    test('notifies subscribers on set/clear and is resilient to subscriber errors', () => {
      const ok = jest.fn();
      const throws = jest.fn(() => {
        throw new Error('boom');
      });

      const unsubscribeOk = onSpriteOverridesChange(ok);
      const unsubscribeThrows = onSpriteOverridesChange(throws);

      setCharacterSpriteOverride('coderdan', { imagePath: 'blob:x' });
      expect(throws).toHaveBeenCalledTimes(1);
      expect(ok).toHaveBeenCalledTimes(1);

      clearCharacterSpriteOverride('coderdan');
      expect(throws).toHaveBeenCalledTimes(2);
      expect(ok).toHaveBeenCalledTimes(2);

      // Unsubscribe should stop future notifications
      unsubscribeOk();
      unsubscribeThrows();
      setCharacterSpriteOverride('coderdan', { imagePath: 'blob:y' });

      expect(ok).toHaveBeenCalledTimes(2);
      expect(throws).toHaveBeenCalledTimes(2);
    });
  });
});
