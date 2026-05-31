import {
  buildForgeCandidateSummaries,
  formatForgeCandidateTitle,
  getForgeSuccessRateExplanation,
  isFlawlessWearableRestrictedForCharacter,
} from '../lib/forge';

describe('forge helpers', () => {
  it('builds unique forge candidates from raw gotchi NFT wearables and prefers excellent copies', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77, 77, 84],
      },
      inventoryItems: [
        {
          id: 'a',
          inventoryItemId: 'a',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'excellent',
          durabilityScore: 450,
        },
        {
          id: 'b',
          inventoryItemId: 'b',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'average',
          durabilityScore: 700,
        },
        {
          id: 'c',
          inventoryItemId: 'c',
          name: 'Gentleman Hat',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'gentleman-hat',
          quality: 'excellent',
          durabilityScore: 900,
        },
      ],
      lickTongueCount: 25,
    });

    expect(candidates.map((candidate) => candidate.wearableSlug)).toEqual([
      'bitcoin-beanie',
      'gentleman-hat',
    ]);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          wearableSlug: 'bitcoin-beanie',
          excellentCount: 1,
          sourceQuality: 'excellent',
          requiresLickTongues: true,
          canForge: true,
        }),
        expect.objectContaining({
          wearableSlug: 'gentleman-hat',
          excellentCount: 1,
          sourceQuality: 'excellent',
          requiresLickTongues: true,
          canForge: true,
        }),
      ])
    );
  });

  it('does not allow forge when the only owned copy is already equipped as an override', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77],
      },
      inventoryItems: [
        {
          id: 'equipped-copy',
          inventoryItemId: 'equipped-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'excellent',
          durabilityScore: 450,
        },
      ],
      equippedInventoryItemIds: new Set(['equipped-copy']),
      lickTongueCount: 0,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        wearableSlug: 'bitcoin-beanie',
        excellentCount: 0,
        ownedCount: 0,
        sourceQuality: null,
        canForge: false,
      }),
    ]);
  });

  it('uses a lower-quality source with lick tongues and reduced success chance', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77],
      },
      inventoryItems: [
        {
          id: 'avg-copy',
          inventoryItemId: 'avg-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'average',
          durabilityScore: 700,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 2,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        wearableSlug: 'bitcoin-beanie',
        excellentCount: 0,
        ownedCount: 1,
        sourceQuality: 'average',
        canForge: true,
        lickTongueCost: 2,
        requiresLickTongues: true,
        successChancePct: 35,
      }),
    ]);
  });

  it('lists forgeable wearables before unavailable ones while preserving order inside each group', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [84, 77, 83],
      },
      inventoryItems: [
        {
          id: 'beanie-copy',
          inventoryItemId: 'beanie-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'excellent',
          durabilityScore: 900,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 25,
    });

    expect(
      candidates.map((candidate) => [candidate.wearableSlug, candidate.canForge])
    ).toEqual([
      ['bitcoin-beanie', true],
      ['gentleman-hat', false],
      ['sushi-knife', false],
    ]);
  });

  it('does not count flawless copies in the displayed forge inventory total', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [84],
      },
      inventoryItems: [
        {
          id: 'avg-copy',
          inventoryItemId: 'avg-copy',
          name: 'Gentleman Hat',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'gentleman-hat',
          quality: 'average',
          durabilityScore: 700,
        },
        {
          id: 'flawless-copy',
          inventoryItemId: 'flawless-copy',
          name: 'Gentleman Hat',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'gentleman-hat',
          quality: 'flawless',
          durabilityScore: 1000,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 25,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        wearableSlug: 'gentleman-hat',
        ownedCount: 1,
        sourceQuality: 'average',
      }),
    ]);
  });

  it('treats title-cased flawless copies as non-forgeable and excludes them from the count', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [84],
      },
      inventoryItems: [
        {
          id: 'avg-copy',
          inventoryItemId: 'avg-copy',
          name: 'Gentleman Hat',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'gentleman-hat',
          quality: 'average',
          durabilityScore: 700,
        },
        {
          id: 'flawless-copy',
          inventoryItemId: 'flawless-copy',
          name: 'Gentleman Hat',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'gentleman-hat',
          quality: 'Flawless' as any,
          durabilityScore: 1000,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 25,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        wearableSlug: 'gentleman-hat',
        ownedCount: 1,
        sourceQuality: 'average',
      }),
    ]);
  });

  it('does not allow lower-quality forge when lick tongues are missing', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77],
      },
      inventoryItems: [
        {
          id: 'budget-copy',
          inventoryItemId: 'budget-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'budget',
          durabilityScore: 500,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 0,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        wearableSlug: 'bitcoin-beanie',
        ownedCount: 1,
        sourceQuality: 'budget',
        requiresLickTongues: true,
        canForge: false,
      }),
    ]);
  });

  it('does not list a candidate when the only owned source copy is flawless', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77],
      },
      inventoryItems: [
        {
          id: 'flawless-copy',
          inventoryItemId: 'flawless-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'flawless',
          durabilityScore: 1000,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 2,
    });

    expect(candidates).toEqual([]);
  });

  it('does not allow excellent-quality forge when lick tongues are missing', () => {
    const candidates = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77],
      },
      inventoryItems: [
        {
          id: 'excellent-copy',
          inventoryItemId: 'excellent-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'excellent',
          durabilityScore: 900,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 0,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        wearableSlug: 'bitcoin-beanie',
        sourceQuality: 'excellent',
        requiresLickTongues: true,
        canForge: false,
      }),
    ]);
  });

  it('formats the exact forge rate calculation for the selected source quality', () => {
    const [candidate] = buildForgeCandidateSummaries({
      gotchiEntry: {
        equippedWearables: [77],
      },
      inventoryItems: [
        {
          id: 'avg-copy',
          inventoryItemId: 'avg-copy',
          name: 'Bitcoin Beanie',
          type: 'wearable',
          quantity: 1,
          color: '#fff',
          wearableSlug: 'bitcoin-beanie',
          quality: 'average',
          durabilityScore: 700,
        },
      ],
      equippedInventoryItemIds: new Set(),
      lickTongueCount: 2,
    });

    expect(getForgeSuccessRateExplanation(candidate)).toBe(
      'Base uncommon rate 70%. Average source copies use a 0.5x multiplier. Final forge rate 35%.'
    );
  });

  it('formats the forge candidate title with owned inventory count', () => {
    expect(formatForgeCandidateTitle('Gentleman Coat', 3)).toBe(
      'Gentleman Coat (3)'
    );
    expect(formatForgeCandidateTitle('Gentleman Coat', 0)).toBe(
      'Gentleman Coat'
    );
  });

  it('flags flawless wearables as gotchi-only for non-gotchi characters', () => {
    expect(
      isFlawlessWearableRestrictedForCharacter('coderdan', 'flawless')
    ).toBe(true);
    expect(
      isFlawlessWearableRestrictedForCharacter('gotchi:123', 'flawless')
    ).toBe(false);
    expect(
      isFlawlessWearableRestrictedForCharacter('coderdan', 'excellent')
    ).toBe(false);
  });
});
