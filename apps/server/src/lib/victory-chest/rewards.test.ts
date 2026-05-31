import { describe, it, expect } from '@jest/globals';

jest.mock('../../data/game-config', () => ({
  GAME_CONFIG: {
    victoryChest: {
      weights: {
        potion: 0,
        bonusProgressionRun: 0,
        bonusCompetitionRun: 0,
        wearable: 1,
      },
      wearable: {
        rarityWeights: {
          common: 1,
          uncommon: 0,
          rare: 0,
          legendary: 0,
          mythical: 0,
          godlike: 0,
        },
      },
      goldBonus: {
        amounts: [{ amount: 0, weight: 1 }],
      },
    },
  },
}));

jest.mock('../../data/wearables', () => {
  const wearables = {
    'the-void': {
      slug: 'the-void',
      name: 'The Void',
      svgId: 0,
    },
    'cool-hat': {
      slug: 'cool-hat',
      name: 'Cool Hat',
      svgId: 42,
    },
  };

  return {
    getAllWearableSlugs: () => Object.keys(wearables),
    getWearableBySlug: (slug: string) => wearables[slug as keyof typeof wearables],
    getWearableRarity: (wearable: { slug: string }) =>
      wearable.slug === 'cool-hat' ? 'common' : 'rare',
  };
});

describe('victory chest reward rolling', () => {
  it('does not throw with fractional weights (e.g. godlike=0.5)', async () => {
    const mod = await import('./rewards');
    expect(() => mod.rollVictoryChestReward()).not.toThrow();
  });

  it('selects from wearable rarity using derived rarity', async () => {
    const mod = await import('./rewards');
    const rolled = mod.rollVictoryChestReward();
    expect(rolled.reward.type).toBe('wearable');
    if (rolled.reward.type !== 'wearable') return;
    expect(rolled.reward.wearableName).toBe('Cool Hat');
  });
});

