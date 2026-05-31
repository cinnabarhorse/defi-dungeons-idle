import { beforeEach, describe, it, expect, jest } from '@jest/globals';

jest.mock('../items', () => ({
  getAllItemCategories: jest.fn(() => ['coin', 'potion']),
  getItemTypesByCategory: jest.fn((category: string) => {
    if (category === 'coin') return ['gold_coin'];
    if (category === 'potion') return ['health_potion', 'mana_potion'];
    return [];
  }),
  getRandomItemType: jest.fn(() => 'gold_coin'),
  generateItemData: jest.fn((itemType: string) => {
    if (itemType === 'gold_coin') {
      return {
        type: 'coin',
        name: 'Gold',
        quantity: 1,
        color: '#fff',
        description: 'Gold coin',
      };
    }
    if (itemType === 'health_potion') {
      return {
        type: 'potion',
        name: 'Health Potion',
        quantity: 1,
        color: '#fff',
        description: 'Health potion',
      };
    }
    if (itemType === 'mana_potion') {
      return {
        type: 'potion',
        name: 'Mana Potion',
        quantity: 1,
        color: '#fff',
        description: 'Mana potion',
      };
    }
    return {
      type: 'item',
      name: itemType,
      quantity: 1,
      color: '#fff',
      description: 'Item',
    };
  }),
  ITEM_COLORS: { wearable: '#fff', coin: '#fff', potion: '#fff' },
}));

jest.mock('../wearables', () => ({
  itemTypes: [],
  slugifyWearableName: (name: string) => name,
}));

import { maybeRollLickTongueDrop, rollEnemyDrop } from '../loot-table';

const items = jest.requireMock('../items') as {
  getAllItemCategories: jest.Mock;
  getItemTypesByCategory: jest.Mock;
  getRandomItemType: jest.Mock;
  generateItemData: jest.Mock;
};

function createSeededRandom(seed: number): () => number {
  let state = Math.floor(seed) % 2147483647;
  if (state <= 0) state += 2147483646;
  return function random(): number {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function withSeededRandom<T>(seed: number, run: () => T): T {
  const randomSpy = jest
    .spyOn(Math, 'random')
    .mockImplementation(createSeededRandom(seed));
  try {
    return run();
  } finally {
    randomSpy.mockRestore();
  }
}

function countLickTongueDrops(trials: number, bonusChance: number): number {
  let drops = 0;
  for (let i = 0; i < trials; i += 1) {
    if (
      maybeRollLickTongueDrop(['lickquidator'], () => ({
        bonusChance,
      }))
    ) {
      drops += 1;
    }
  }
  return drops;
}

function countDropTotals(trials: number, context: Parameters<typeof rollEnemyDrop>[0]) {
  let totalQuantity = 0;
  let dropCount = 0;
  let potionCount = 0;
  let coinCount = 0;
  for (let i = 0; i < trials; i += 1) {
    const drop = rollEnemyDrop(context);
    if (!drop) continue;
    dropCount += 1;
    totalQuantity += Number(drop.quantity || 0);
    if (drop.type === 'potion') potionCount += 1;
    if (drop.type === 'coin') coinCount += 1;
  }
  return { totalQuantity, dropCount, potionCount, coinCount };
}

beforeEach(() => {
  items.getAllItemCategories.mockReturnValue(['coin', 'potion']);
  items.getItemTypesByCategory.mockImplementation((category: string) => {
    if (category === 'coin') return ['gold_coin'];
    if (category === 'potion') return ['health_potion', 'mana_potion'];
    return [];
  });
  items.getRandomItemType.mockReturnValue('gold_coin');
});

describe('loot-table gold-farm', () => {
  it('uses extra coin roll and amount multiplier', () => {
    items.getAllItemCategories.mockReturnValue(['coin']);
    const randomSpy = jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(1) // primary drop fail
      .mockReturnValueOnce(0) // gold-farm extra roll succeeds
      .mockReturnValueOnce(0); // pick first coin type

    const drop = rollEnemyDrop({
      classification: 'trash',
      goldFarm: {
        enabled: true,
        enableReweight: false,
        enableExtraRoll: true,
        coinWeightMultiplier: 1,
        extraRollChance: 0.5,
        maxExtraChanceCap: 0.5,
        amountMultiplier: 2,
      },
    });

    expect(drop?.type).toBe('coin');
    expect(drop?.quantity).toBe(2);

    randomSpy.mockRestore();
  });
});

describe('farm abilities statistical lift', () => {
  it('tongue-farm increases lick tongue drops over many trials', () => {
    const trials = 5000;
    const rng = createSeededRandom(42);
    const randomValues = Array.from({ length: trials }, () => rng());
    let index = 0;
    const randomSpy = jest
      .spyOn(Math, 'random')
      .mockImplementation(() => randomValues[index++] ?? 0);

    try {
      const withoutFarm = countLickTongueDrops(trials, 0);
      index = 0;
      const withFarm = countLickTongueDrops(trials, 0.1);

      expect(withFarm).toBeGreaterThan(withoutFarm);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('gold-farm increases coin quantity over many trials', () => {
    items.getAllItemCategories.mockReturnValue(['coin']);
    const trials = 2000;
    const withoutFarm = withSeededRandom(11, () =>
      countDropTotals(trials, {
        classification: 'trash',
        killStreakPotionCoinFindBonus: 0,
      })
    );
    const withFarm = withSeededRandom(11, () =>
      countDropTotals(trials, {
        classification: 'trash',
        killStreakPotionCoinFindBonus: 0,
        goldFarm: {
          enabled: true,
          enableReweight: false,
          coinWeightMultiplier: 1,
          enableExtraRoll: true,
          extraRollChance: 1,
          maxExtraChanceCap: 1,
          amountMultiplier: 2,
        },
      })
    );

    expect(withFarm.totalQuantity).toBeGreaterThan(withoutFarm.totalQuantity);
  });

  it('potion-farm increases potion drops over many trials', () => {
    items.getAllItemCategories.mockReturnValue(['potion']);
    const trials = 2000;
    const withoutFarm = withSeededRandom(23, () =>
      countDropTotals(trials, {
        classification: 'trash',
        killStreakPotionCoinFindBonus: 0,
      })
    );
    const withFarm = withSeededRandom(23, () =>
      countDropTotals(trials, {
        classification: 'trash',
        killStreakPotionCoinFindBonus: 0,
        potionFarm: {
          enabled: true,
          enableReweight: false,
          potionWeightMultiplier: 1,
          enableExtraRoll: true,
          extraRollChance: 1,
          hpToManaBias: 0.5,
        },
      })
    );

    expect(withFarm.potionCount).toBeGreaterThan(withoutFarm.potionCount);
  });
});
