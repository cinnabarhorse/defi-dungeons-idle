import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Avoid pulling in heavy runtime deps from debug.ts imports.
jest.mock('src/rooms/GameRoom', () => ({
  GameRoom: class MockGameRoom {},
}));

jest.mock('src/schemas', () => ({
  EntitySchema: class MockEntitySchema {},
  PlayerSchema: class MockPlayerSchema {},
}));

jest.mock('src/data/items', () => ({
  getRandomItemType: () => 'mock-item-type',
  generateItemData: () => ({ kind: 'mock-item' }),
  getAllItemCategories: () => ['mock-category'],
}));

describe('debug helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Ensure each test starts from a known state.
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('isPlayerDevInvincible returns false in production even if the flag is set', async () => {
    process.env.NODE_ENV = 'production';
    const { isPlayerDevInvincible } = await import('../debug');

    expect(isPlayerDevInvincible({ devInvincible: true } as any)).toBe(false);
  });

  it('isPlayerDevInvincible returns true in non-production when the flag is truthy', async () => {
    process.env.NODE_ENV = 'test';
    const { isPlayerDevInvincible } = await import('../debug');

    expect(isPlayerDevInvincible({ devInvincible: true } as any)).toBe(true);
    expect(isPlayerDevInvincible({ devInvincible: 1 } as any)).toBe(true);
  });

  it('isPlayerDevInvincible returns false when the player is nullish or devInvincible throws', async () => {
    process.env.NODE_ENV = 'development';
    const { isPlayerDevInvincible } = await import('../debug');

    expect(isPlayerDevInvincible(null)).toBe(false);
    expect(isPlayerDevInvincible(undefined)).toBe(false);

    const player = {} as any;
    Object.defineProperty(player, 'devInvincible', {
      get() {
        throw new Error('nope');
      },
    });

    expect(isPlayerDevInvincible(player)).toBe(false);
  });
});
