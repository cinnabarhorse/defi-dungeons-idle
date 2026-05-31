import {
  EQUIPMENT_SELL_PRICE_BY_RARITY,
  getSellPreview,
  isSellableInventoryItem,
} from '../lib/inventory-sell';
import { getQualityLabelForWearable } from '../data/wearable-quality';
import { getWearableBySlug, getWearableRarity } from '../data/wearables';

describe('inventory sell helpers', () => {
  it('filters non-sellable items', () => {
    expect(
      isSellableInventoryItem({
        id: 'gold',
        name: 'Gold',
        type: 'coin',
        quantity: 10,
        color: '#fff',
      })
    ).toBe(false);

    expect(
      isSellableInventoryItem({
        id: 'lick',
        name: 'Lick Tongue',
        type: 'material',
        quantity: 1,
        color: '#fff',
      })
    ).toBe(false);
  });

  it('prices fungible weapons by rarity and quantity', () => {
    const weaponSlug = 'mk2-grenade';
    const wearable = getWearableBySlug(weaponSlug);
    if (!wearable) {
      throw new Error('Missing wearable fixture for weapon test');
    }
    const rarity = getWearableRarity(wearable);
    const expectedUnitPrice = EQUIPMENT_SELL_PRICE_BY_RARITY[rarity];
    const preview = getSellPreview(
      {
        id: 'weapon-1',
        name: weaponSlug,
        type: 'weapon',
        quantity: 2,
        color: '#fff',
      },
      2
    );

    expect(preview?.unitPrice).toBe(expectedUnitPrice);
    expect(preview?.totalPrice).toBe(expectedUnitPrice * 2);
  });

  it('prices wearables with quality scalars', () => {
    const preview = getSellPreview({
      id: 'wearable-1',
      name: 'camo-hat',
      type: 'wearable',
      quantity: 1,
      color: '#fff',
      wearableSlug: 'camo-hat',
      quality: 'excellent',
    });

    expect(preview?.unitPrice).toBe(2);
    expect(preview?.totalPrice).toBe(2);
  });

  it('labels average quality as Fine', () => {
    expect(getQualityLabelForWearable('average', 'camo-hat')).toBe('Fine');
  });
});
