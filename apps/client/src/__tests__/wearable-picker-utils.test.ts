import {
  buildWearableInstanceSummaries,
  shouldShowNftEquipmentChip,
} from '../app/me/inventory/wearable-picker-utils';

describe('buildWearableInstanceSummaries', () => {
  it('sorts copies by quality then durability and preserves per-instance durability', () => {
    const summaries = buildWearableInstanceSummaries([
      {
        id: '3',
        inventoryItemId: '3',
        name: 'Bitcoin Beanie',
        type: 'wearable',
        quantity: 1,
        color: '#fff',
        wearableSlug: 'bitcoin-beanie',
        quality: 'average',
        durabilityScore: 250,
      },
      {
        id: '2',
        inventoryItemId: '2',
        name: 'Bitcoin Beanie',
        type: 'wearable',
        quantity: 1,
        color: '#fff',
        wearableSlug: 'bitcoin-beanie',
        quality: 'excellent',
        durabilityScore: 100,
      },
      {
        id: '1',
        inventoryItemId: '1',
        name: 'Bitcoin Beanie',
        type: 'wearable',
        quantity: 1,
        color: '#fff',
        wearableSlug: 'bitcoin-beanie',
        quality: 'excellent',
        durabilityScore: 700,
      },
    ]);

    expect(summaries.map((entry) => entry.id)).toEqual(['1', '2', '3']);
    expect(summaries[0]).toEqual(
      expect.objectContaining({
        quality: 'excellent',
        currentDurability: 700,
        maxDurability: 900,
        isBroken: false,
      })
    );
  });

  it('shows NFT chip only for gotchi base equipment', () => {
    expect(
      shouldShowNftEquipmentChip({
        characterId: 'gotchi:123',
        assignment: { source: 'base' } as any,
      })
    ).toBe(true);

    expect(
      shouldShowNftEquipmentChip({
        characterId: 'gotchi:123',
        assignment: { source: 'override' } as any,
      })
    ).toBe(false);

    expect(
      shouldShowNftEquipmentChip({
        characterId: 'coderdan',
        assignment: { source: 'base' } as any,
      })
    ).toBe(false);
  });
});
